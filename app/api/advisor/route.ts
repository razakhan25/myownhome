import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/supabase-server";
import { computePlan, rentVsBuy, DFW_DEFAULTS, DFW_CONTEXT, type PlanInputs } from "@/lib/calc";
import { snapshot } from "@/lib/sync";

export const maxDuration = 60;

const SYSTEM = `You are MyOwnHome's first-time homebuyer coach for ${DFW_CONTEXT.metro}.
Rules:
- Every dollar figure, date or percentage you state must come from a tool result in this conversation. Never do arithmetic yourself; call run_scenario or rent_vs_buy instead (they accept overrides for what-ifs).
- Start by calling get_my_plan unless you already have it.
- Be concise and specific: 2-6 short sentences or a few bullets. Lead with the answer.
- Mention trade-offs (FHA mortgage insurance, thin reserves, DTI over 43%) when they apply.
- For down-payment help, point to the Texas Department of Housing and Community Affairs (TDHCA) programs and city programs in Dallas and Fort Worth; do not state program amounts or eligibility rules you have not been given.
- You are not a lender, financial advisor or tax professional. Say so briefly when the user is about to make a big commitment.
Context: DFW median home value about $${DFW_CONTEXT.medianPrice.toLocaleString()} (${DFW_CONTEXT.medianPriceSource}). Default rate from ${DFW_CONTEXT.rateSource}.`;

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
  { name: "get_my_plan", description: "The user's current plan inputs, computed results (max price, payment, cash to close, gap, buy date, DTI, readiness score) and linked-account summary.", input_schema: { type: "object", properties: {} } },
  { name: "run_scenario", description: "Recompute the full plan with overrides, e.g. {monthlySavings: 1200} or {targetPrice: 300000, loanType: 'conventional', downPct: 5}.", input_schema: { type: "object", properties: { overrides: overridesSchema } } },
  { name: "rent_vs_buy", description: "Net cost of renting vs buying over N years, with optional plan overrides and assumptions.", input_schema: { type: "object", properties: { years: { type: "number" }, overrides: overridesSchema, appreciationPct: { type: "number" }, rentGrowthPct: { type: "number" }, investReturnPct: { type: "number" } }, required: ["years"] } },
];

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

  const { messages, inputs } = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[]; inputs?: Partial<PlanInputs> };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const base: PlanInputs = { ...DFW_DEFAULTS, ...(inputs ?? {}) };

  const runTool = async (name: string, input: any) => {
    const p = { ...base, ...(input?.overrides ?? {}) } as PlanInputs;
    if (name === "get_my_plan") return { inputs: base, results: computePlan(base), accounts: await snapshot(supabase, user.id) };
    if (name === "run_scenario") return { inputs: p, results: computePlan(p) };
    if (name === "rent_vs_buy") return rentVsBuy(p, Number(input.years) || 5, input.appreciationPct, input.rentGrowthPct, input.investReturnPct);
    return { error: "unknown tool" };
  };

  const client = new Anthropic();
  const convo: Anthropic.MessageParam[] = messages.slice(-12).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  const steps: string[] = [];
  try {
    for (let i = 0; i < 6; i++) {
      const res = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 1200, system: SYSTEM, tools: TOOLS, messages: convo });
      convo.push({ role: "assistant", content: res.content });
      if (res.stop_reason !== "tool_use") {
        const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
        return NextResponse.json({ reply: text, steps });
      }
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== "tool_use") continue;
        steps.push(b.name === "get_my_plan" ? "Read your plan and accounts" : b.name === "run_scenario" ? "Ran a what-if scenario" : "Compared renting vs buying");
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(round(await runTool(b.name, b.input))) });
      }
      convo.push({ role: "user", content: results });
    }
    return NextResponse.json({ reply: "That took more steps than expected. Try asking a narrower question.", steps });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Advisor error" }, { status: 500 });
  }
}
