import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/supabase-server";
import { BASE_DEFAULTS, computePlan, rentVsBuy, type PlanInputs } from "@/lib/calc";
import { assumptionsFor } from "@/lib/markets";
import { snapshot } from "@/lib/sync";
import { linkedReport } from "@/lib/plan-sync";

export const maxDuration = 60;

const overridesSchema = {
  type: "object",
  description: "Optional changes to the user's plan for a what-if. Any PlanInputs field.",
  properties: {
    annualIncome: { type: "number" }, monthlyDebts: { type: "number" }, savings: { type: "number" },
    monthlySavings: { type: "number" }, rent: { type: "number" }, targetPrice: { type: "number" },
    loanType: { type: "string", enum: ["fha", "conventional"] }, downPct: { type: "number" },
    rate: { type: "number" }, propertyTaxRate: { type: "number" }, insuranceRate: { type: "number" },
    hoaMonthly: { type: "number" }, closingPct: { type: "number" }, reserveMonths: { type: "number" }, savingsApy: { type: "number" },
  },
} as const;

const TOOLS: Anthropic.Tool[] = [
  { name: "get_my_plan", description: "The user's saved plan: inputs (which ones follow linked accounts), computed results (max price, payment, cash to close, gap, buy date, DTI, readiness score), metro market assumptions, and a linked-account summary.", input_schema: { type: "object", properties: {} } },
  { name: "run_scenario", description: "Recompute the full plan with overrides, e.g. {monthlySavings: 1200} or {targetPrice: 300000, loanType: 'conventional', downPct: 5}. Call it once per what-if.", input_schema: { type: "object", properties: { overrides: overridesSchema } } },
  { name: "rent_vs_buy", description: "Net cost of renting vs buying over N years, with optional plan overrides and assumptions.", input_schema: { type: "object", properties: { years: { type: "number" }, overrides: overridesSchema, appreciationPct: { type: "number" }, rentGrowthPct: { type: "number" }, investReturnPct: { type: "number" } }, required: ["years"] } },
  { name: "get_cashflow", description: "Monthly income, bills, spending and money moved into the home fund for the last six months, from linked transactions, with averages and the savings rate.", input_schema: { type: "object", properties: {} } },
  { name: "get_recurring", description: "Active recurring bills, subscriptions and income streams detected in linked accounts (amount, frequency, next date).", input_schema: { type: "object", properties: {} } },
  { name: "get_transactions", description: "Search linked transactions. Filter by month (yyyy-mm), category (Plaid primary category such as FOOD_AND_DRINK) and/or a text query. Returns up to 50 rows, newest first, plus the total.", input_schema: { type: "object", properties: { month: { type: "string" }, category: { type: "string" }, query: { type: "string" }, limit: { type: "number" } } } },
  { name: "get_debts", description: "Linked debts: cards and loans with balance, minimum payment, APR, due date, and the monthly total used in DTI.", input_schema: { type: "object", properties: {} } },
  { name: "remember", description: "Save a short note about the user for future conversations (a goal, a constraint, a preference). Only facts the user stated.", input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } },
];

const STEP: Record<string, string> = {
  get_my_plan: "Read your plan and accounts", run_scenario: "Ran a what-if", rent_vs_buy: "Compared renting vs buying", get_cashflow: "Read your cash flow",
  get_recurring: "Read your recurring bills", get_transactions: "Searched your transactions", get_debts: "Read your debts", remember: "Saved a note",
};

function round(o: unknown): unknown {
  if (typeof o === "number") return Math.round(o * 100) / 100;
  if (Array.isArray(o)) return o.map(round);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));
  return o;
}

export async function POST(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to use the advisor" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "The advisor isn't switched on yet" }, { status: 503 });

  const { messages } = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // The saved plan is the source of truth; the client never sends numbers
  const [{ data: plan }, { data: memory }] = await Promise.all([
    supabase.from("plans").select("inputs, linked, metro_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("advisor_memory").select("note, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const base: PlanInputs = { ...BASE_DEFAULTS, ...((plan?.inputs as Partial<PlanInputs>) ?? {}) };
  const linked = (plan?.linked as Record<string, boolean>) ?? {};
  const market = assumptionsFor(plan?.metro_id);
  const notes = (memory ?? []).map((m) => `- ${m.note}`).join("\n");

  const SYSTEM = `You are MyOwnHome's first-time homebuyer coach. The user is planning to buy in ${market.metro.name}.
Rules:
- Every dollar figure, date or percentage you state must come from a tool result in this conversation. Never do arithmetic yourself; call run_scenario or rent_vs_buy instead (they accept overrides for what-ifs). For cash-flow or spending questions call get_cashflow, get_recurring or get_transactions.
- Start by calling get_my_plan unless you already have it in this conversation.
- Be concise and specific: 2-6 short sentences or a few bullets. Lead with the answer. Name the trade-off when there is one (FHA mortgage insurance, thin reserves, DTI over 43%, slower buy date).
- Inputs marked as following linked accounts are measured from real transactions; "annualIncome" from linked data is after-tax deposits, so say so if it matters (lenders use gross).
- Down-payment assistance: say that state housing finance agencies and many cities run first-time-buyer programs and point the user to their state HFA; never state program amounts or eligibility rules you have not been given.
- You are not a lender, financial advisor or tax professional. Say so briefly when the user is about to make a big commitment.
- Call remember only for durable facts the user tells you about themselves.
Market context (do not quote other figures): typical home in ${market.metro.name} ${fmt(market.medianPrice)}${market.starterPrice ? `, starter homes ${fmt(market.starterPrice)}` : ""} (Zillow, ${market.asOf}); property tax ${market.propertyTaxRate}%/yr; insurance about ${fmt(market.insuranceAnnual)}/yr; closing costs ${market.closingPct}% of price.${notes ? `\nWhat you remember about this user:\n${notes}` : ""}`;

  const runTool = async (name: string, input: any) => {
    const p = { ...base, ...(input?.overrides ?? {}) } as PlanInputs;
    switch (name) {
      case "get_my_plan": {
        const snap = await snapshot(supabase, user.id);
        return { inputs: base, followsLinkedAccounts: Object.keys(linked).filter((k) => linked[k] !== false), results: computePlan(base), market: { metro: market.metro.name, medianPrice: market.medianPrice, starterPrice: market.starterPrice, asOf: market.asOf }, accounts: { cash: snap.cash, homeFund: snap.homeFund, monthlyDebtPayments: snap.monthlyDebtPayments, institutions: snap.items.map((i) => ({ name: i.institution_name, status: i.status })), accounts: snap.accounts.filter((a) => a.role !== "ignore").map((a) => ({ name: a.name, type: a.type, subtype: a.subtype, balance: a.balance, role: a.role })) } };
      }
      case "run_scenario": return { inputs: p, results: computePlan(p) };
      case "rent_vs_buy": return rentVsBuy(p, Number(input.years) || 5, input.appreciationPct, input.rentGrowthPct, input.investReturnPct);
      case "get_cashflow": { const r = await linkedReport(supabase, user.id); return { months: r.cashflow.months, averages: r.cashflow.avg, fullMonths: r.cashflow.fullMonths, savingsRatePct: r.cashflow.savingsRate, planFollows: r.linked.values }; }
      case "get_recurring": {
        const { data } = await supabase.from("recurring_streams").select("description, merchant_name, direction, category_primary, frequency, average_amount, last_amount, predicted_next_date, last_date").eq("user_id", user.id).eq("is_active", true).order("average_amount", { ascending: false }).limit(40);
        return { streams: (data ?? []).map((s) => ({ ...s, average_amount: Number(s.average_amount), last_amount: Number(s.last_amount) })) };
      }
      case "get_transactions": {
        let qb = supabase.from("transactions").select("date, name, merchant_name, amount, category_primary, is_transfer, excluded, pending").eq("user_id", user.id).order("date", { ascending: false }).limit(Math.min(50, Math.max(1, Number(input.limit) || 50)));
        if (typeof input.month === "string" && /^\d{4}-\d{2}$/.test(input.month)) { const [y, m] = input.month.split("-").map(Number); qb = qb.gte("date", `${input.month}-01`).lt("date", new Date(y, m, 1).toISOString().slice(0, 10)); }
        if (typeof input.category === "string" && input.category) qb = qb.eq("category_primary", input.category.toUpperCase());
        if (typeof input.query === "string" && input.query) qb = qb.or(`name.ilike.%${input.query.replace(/[%,()]/g, "")}%,merchant_name.ilike.%${input.query.replace(/[%,()]/g, "")}%`);
        const { data } = await qb;
        const rows = (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
        return { count: rows.length, totalOut: rows.filter((t) => t.amount > 0 && !t.is_transfer && !t.excluded).reduce((s, t) => s + t.amount, 0), totalIn: rows.filter((t) => t.amount < 0 && !t.is_transfer && !t.excluded).reduce((s, t) => s - t.amount, 0), transactions: rows, note: "amount > 0 is money out, < 0 is money in" };
      }
      case "get_debts": {
        const snap = await snapshot(supabase, user.id);
        const debts = snap.accounts.filter((a) => (a.type === "credit" || a.type === "loan") && a.role !== "ignore").map((a) => { const l = snap.liabilities.find((x) => x.account_id === a.id); return { name: a.name, type: a.subtype ?? a.type, balance: a.balance, limit: a.limit, minimum_payment: l?.minimum_payment ?? null, apr: l?.apr ?? null, next_payment_due_date: l?.next_payment_due_date ?? null }; });
        return { debts, monthlyDebtPayments: snap.monthlyDebtPayments, planMonthlyDebts: base.monthlyDebts };
      }
      case "remember": {
        const note = String(input?.note ?? "").trim().slice(0, 240);
        if (note) await supabase.from("advisor_memory").insert({ user_id: user.id, note });
        return { saved: Boolean(note) };
      }
      default: return { error: "unknown tool" };
    }
  };

  const client = new Anthropic();
  const convo: Anthropic.MessageParam[] = messages.slice(-14).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  const steps: string[] = [];
  try {
    for (let i = 0; i < 8; i++) {
      const res = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1400, system: SYSTEM, tools: TOOLS, messages: convo });
      convo.push({ role: "assistant", content: res.content });
      if (res.stop_reason !== "tool_use") {
        const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
        return NextResponse.json({ reply: text, steps });
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        const label = STEP[b.name] ?? b.name;
        if (steps[steps.length - 1] !== label) steps.push(label);
        let out: unknown;
        try { out = await runTool(b.name, b.input); } catch (e: any) { out = { error: e?.message ?? "tool failed" }; }
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(round(out)) });
      }
      convo.push({ role: "user", content: results });
    }
    return NextResponse.json({ reply: "That took more steps than expected. Try asking a narrower question.", steps });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Advisor error" }, { status: 500 });
  }
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
