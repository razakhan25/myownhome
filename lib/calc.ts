// Deterministic home-buying math. The UI, the sync pipeline and the advisor all call these; the model never does arithmetic.

export type LoanType = "fha" | "conventional";

export interface PlanInputs {
  annualIncome: number;      // gross household income, $/yr (from linked accounts: net deposits x 12, labeled as such)
  monthlyDebts: number;      // minimum payments on cards, car, student loans, $/mo
  savings: number;           // cash saved toward the home, $
  monthlySavings: number;    // how much is added each month, $
  rent: number;              // current rent, $/mo
  targetPrice: number;       // 0 = use the comfortable max
  loanType: LoanType;
  downPct: number;           // e.g. 3.5, 5, 10, 20
  rate: number;              // 30-yr fixed, %
  propertyTaxRate: number;   // %/yr of price
  insuranceRate: number;     // %/yr of price
  hoaMonthly: number;        // $/mo
  closingPct: number;        // buyer closing costs, % of price (title, lender fees, prepaids)
  reserveMonths: number;     // months of payment kept after closing
  savingsApy: number;        // % earned on savings
}

// National starting point. Rate: Freddie Mac PMMS via FRED (7.24%, week of Oct 29 2026; refreshed live by lib/markets.ts).
// Tax, insurance and closing costs are replaced by metro/state figures as soon as a metro is picked.
export const BASE_DEFAULTS: PlanInputs = {
  annualIncome: 95000,
  monthlyDebts: 450,
  savings: 12000,
  monthlySavings: 900,
  rent: 1650,
  targetPrice: 0,
  loanType: "fha",
  downPct: 3.5,
  rate: 7.24,
  propertyTaxRate: 0.94,
  insuranceRate: 0.65,
  hoaMonthly: 0,
  closingPct: 3,
  reserveMonths: 2,
  savingsApy: 0,
};

// The four inputs that can follow linked accounts (plans.linked marks which ones the user overrode)
export const LINKABLE = ["annualIncome", "monthlyDebts", "savings", "monthlySavings"] as const;
export type LinkableField = (typeof LINKABLE)[number];

const FHA_UFMIP = 0.0175;      // upfront MIP, financed into the loan
const FHA_ANNUAL_MIP = 0.0055; // %/yr of loan, typical for <=5% down, 30 yr
const CONV_PMI = 0.005;        // rough %/yr of loan under 20% down

export function principalAndInterest(loan: number, ratePct: number, years = 30): number {
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (loan <= 0) return 0;
  if (r === 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

export interface PaymentBreakdown {
  price: number;
  downPayment: number;
  loan: number;
  principalInterest: number;
  tax: number;
  insurance: number;
  mortgageInsurance: number;
  hoa: number;
  total: number;
}

export function monthlyPayment(price: number, p: PlanInputs): PaymentBreakdown {
  const dp = Math.max(p.downPct, p.loanType === "fha" ? 3.5 : 3) / 100;
  const downPayment = price * dp;
  let loan = price - downPayment;
  let mi = 0;
  if (p.loanType === "fha") {
    loan = loan * (1 + FHA_UFMIP);
    mi = (loan * FHA_ANNUAL_MIP) / 12;
  } else if (dp < 0.2) {
    mi = (loan * CONV_PMI) / 12;
  }
  const pi = principalAndInterest(loan, p.rate);
  const tax = (price * p.propertyTaxRate) / 100 / 12;
  const insurance = (price * p.insuranceRate) / 100 / 12;
  const total = pi + tax + insurance + mi + p.hoaMonthly;
  return { price, downPayment, loan, principalInterest: pi, tax, insurance, mortgageInsurance: mi, hoa: p.hoaMonthly, total };
}

// Largest price whose payment fits the debt-to-income limits.
function solveMaxPrice(p: PlanInputs, frontLimit: number, backLimit: number): number {
  const gross = p.annualIncome / 12;
  const maxHousing = Math.min(frontLimit * gross, backLimit * gross - p.monthlyDebts);
  if (maxHousing <= 0) return 0;
  let lo = 0, hi = 5_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (monthlyPayment(mid, p).total <= maxHousing) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

export function affordability(p: PlanInputs) {
  return {
    comfortable: solveMaxPrice(p, 0.28, 0.36), // classic 28/36 rule
    stretch: solveMaxPrice(p, 0.5, 0.43),       // back-end 43% cap many lenders use
  };
}

export function cashToClose(price: number, p: PlanInputs) {
  const pay = monthlyPayment(price, p);
  const closing = (price * p.closingPct) / 100;
  const reserves = pay.total * p.reserveMonths;
  return { downPayment: pay.downPayment, closing, reserves, total: pay.downPayment + closing + reserves };
}

// Months until `saved` (growing at apy) plus `monthly` contributions reach `target`. null = never at this pace.
export function monthsToGoal(target: number, saved: number, monthly: number, apyPct: number): number | null {
  if (saved >= target) return 0;
  const r = apyPct / 100 / 12;
  if (monthly <= 0 && (r === 0 || saved <= 0)) return null;
  let bal = saved, m = 0;
  while (bal < target && m < 600) { bal = bal * (1 + r) + monthly; m++; }
  return m >= 600 ? null : m;
}

export function addMonths(from: Date, months: number): Date {
  return new Date(from.getFullYear(), from.getMonth() + months, 1);
}

export interface PlanResult {
  comfortable: number;
  stretch: number;
  targetPrice: number;
  payment: PaymentBreakdown;
  cash: ReturnType<typeof cashToClose>;
  gap: number;
  months: number | null;
  buyDate: string | null;      // ISO yyyy-mm-01
  dtiFront: number;            // %
  dtiBack: number;             // %
  savingsRate: number;         // % of gross
  rentVsPayment: number;       // payment - rent, $/mo
  score: number;               // 0-100 readiness heuristic
  scoreParts: { cash: number; dti: number; savingsRate: number };
}

export function computePlan(p: PlanInputs, now = new Date()): PlanResult {
  const { comfortable, stretch } = affordability(p);
  const targetPrice = p.targetPrice > 0 ? p.targetPrice : comfortable;
  const payment = monthlyPayment(targetPrice, p);
  const cash = cashToClose(targetPrice, p);
  const gap = Math.max(0, cash.total - p.savings);
  const months = monthsToGoal(cash.total, p.savings, p.monthlySavings, p.savingsApy);
  const gross = p.annualIncome / 12 || 1;
  const dtiFront = (payment.total / gross) * 100;
  const dtiBack = ((payment.total + p.monthlyDebts) / gross) * 100;
  const savingsRate = (p.monthlySavings / gross) * 100;

  const cashScore = cash.total > 0 ? Math.min(1, p.savings / cash.total) : 0;
  const dtiScore = dtiBack <= 36 ? 1 : dtiBack >= 50 ? 0 : (50 - dtiBack) / 14;
  const srScore = Math.min(1, savingsRate / 15);
  const score = Math.round(50 * cashScore + 25 * dtiScore + 25 * srScore);

  return {
    comfortable, stretch, targetPrice, payment, cash, gap, months,
    buyDate: months === null ? null : addMonths(now, months).toISOString().slice(0, 10),
    dtiFront, dtiBack, savingsRate,
    rentVsPayment: payment.total - p.rent,
    score,
    scoreParts: { cash: Math.round(cashScore * 100), dti: Math.round(dtiScore * 100), savingsRate: Math.round(srScore * 100) },
  };
}

// Rent vs buy over N years: net cost of each path, simple model.
export function rentVsBuy(p: PlanInputs, years: number, appreciationPct = 3, rentGrowthPct = 3, investReturnPct = 5) {
  const price = p.targetPrice > 0 ? p.targetPrice : affordability(p).comfortable;
  const pay = monthlyPayment(price, p);
  const cash = cashToClose(price, p);
  const r = p.rate / 100 / 12;
  let balance = pay.loan, rentTotal = 0, ownTotal = cash.downPayment + cash.closing, rent = p.rent, invested = cash.downPayment + cash.closing;
  for (let m = 0; m < years * 12; m++) {
    const interest = balance * r;
    balance -= pay.principalInterest - interest;
    ownTotal += pay.total;
    rentTotal += rent;
    invested *= 1 + investReturnPct / 100 / 12;
    if ((m + 1) % 12 === 0) rent *= 1 + rentGrowthPct / 100;
  }
  const value = price * Math.pow(1 + appreciationPct / 100, years);
  const sellingCosts = value * 0.06;
  const ownNetCost = ownTotal - (value - sellingCosts - Math.max(0, balance));
  const rentNetCost = rentTotal - (invested - (cash.downPayment + cash.closing));
  return { years, price: Math.round(price), ownNetCost: Math.round(ownNetCost), rentNetCost: Math.round(rentNetCost), buyingWins: ownNetCost < rentNetCost };
}

// The one thing to do this month, chosen from the plan's numbers (no model involved).
export interface NextAction { key: "set_savings" | "ready" | "debt" | "save_more" | "on_track"; title: string; body: string; deltaMonths?: number }
export function nextAction(p: PlanInputs, r = computePlan(p)): NextAction {
  if (r.months === null) return { key: "set_savings", title: "Pick a monthly savings amount", body: "Your buy date needs a monthly amount. Link a bank and MyOwnHome reads it from your transfers, or type one in." };
  if (r.months === 0) return { key: "ready", title: "Get pre-approved", body: `Your ${fmt$(p.savings)} covers the ${fmt$(r.cash.total)} you need to close on a ${fmt$(r.targetPrice)} home. Compare at least three lenders' Loan Estimates.` };
  if (r.dtiBack > 43) {
    const less = computePlan({ ...p, monthlyDebts: Math.max(0, p.monthlyDebts - 200) });
    return { key: "debt", title: "Pay down a debt before saving more", body: `Your debts put you at ${r.dtiBack.toFixed(0)}% debt-to-income; most lenders stop at 43%. Cutting $200/mo of payments raises your comfortable max from ${fmt$(r.comfortable)} to ${fmt$(less.comfortable)}.` };
  }
  const more = computePlan({ ...p, monthlySavings: p.monthlySavings + 250 });
  const delta = r.months - (more.months ?? r.months);
  if (delta >= 2) return { key: "save_more", title: `Move ${fmt$(p.monthlySavings + 250)} a month to your home fund`, body: `+$250/mo pulls your buy date from ${fmtDate(r.buyDate)} to ${fmtDate(more.buyDate)}, ${delta} months sooner.`, deltaMonths: delta };
  return { key: "on_track", title: "Keep the pace", body: `${fmt$(p.monthlySavings)} a month closes your ${fmt$(r.gap)} gap by ${fmtDate(r.buyDate)}. Keep the home fund in a high-yield account and leave it alone.` };
}

/* ---------- Cash flow from linked transactions ---------- */

// Minimal shapes so this file stays free of Supabase types
export interface TxnLite {
  id: string;
  account_id: string;
  date: string;                   // yyyy-mm-dd
  amount: number;                 // Plaid sign: positive = money out, negative = money in
  category_primary: string | null;
  category_detailed: string | null;
  is_transfer: boolean;
  excluded: boolean;
  pending: boolean;
}
export interface AccountLite { id: string; type: string; subtype: string | null; role: string }
export interface StreamLite { id: string; direction: string; category_primary: string | null; category_detailed: string | null; average_amount: number | null; is_active: boolean; transaction_ids: string[] }

export interface MonthCashflow {
  month: string;      // yyyy-mm
  partial: boolean;   // the current month
  income: number;     // INCOME inflows
  otherInflow: number;// refunds, reimbursements, unknown inflows (not counted as income)
  bills: number;      // rent, utilities, loan payments, recurring outflows
  spending: number;   // everything else going out
  saved: number;      // net transfers into home-fund accounts
  leftover: number;   // income - bills - spending
}

const BILL_PRIMARY = new Set(["RENT_AND_UTILITIES", "LOAN_PAYMENTS", "BANK_FEES"]);

export function monthlyCashflow(txns: TxnLite[], accounts: AccountLite[], streams: StreamLite[], now = new Date(), months = 6): MonthCashflow[] {
  const role = new Map(accounts.map((a) => [a.id, a.role]));
  const recurringBill = new Set<string>();
  for (const s of streams) if (s.is_active && s.direction === "outflow") for (const id of s.transaction_ids) recurringBill.add(id);
  const thisMonth = now.toISOString().slice(0, 7);
  const first = addMonths(now, -months).toISOString().slice(0, 7);
  const byMonth = new Map<string, MonthCashflow>();
  for (let i = 0; i <= months; i++) {
    const m = addMonths(now, i - months).toISOString().slice(0, 7);
    byMonth.set(m, { month: m, partial: m === thisMonth, income: 0, otherInflow: 0, bills: 0, spending: 0, saved: 0, leftover: 0 });
  }
  for (const t of txns) {
    if (t.pending || t.excluded) continue;
    const m = t.date.slice(0, 7);
    if (m < first || m > thisMonth) continue;
    const r = role.get(t.account_id) ?? "spending";
    if (r === "ignore") continue;
    const row = byMonth.get(m);
    if (!row) continue;
    const abs = Math.abs(t.amount);
    const inflow = t.amount < 0;
    if (t.is_transfer) {
      if (r === "home_fund") row.saved += inflow ? abs : -abs;
      continue;
    }
    if (inflow) {
      if (t.category_primary === "INCOME") row.income += abs; else row.otherInflow += abs;
      continue;
    }
    if (t.category_detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") row.spending += abs;         // card not linked: its payment is the only trace of that spending
    else if (BILL_PRIMARY.has(t.category_primary ?? "") || recurringBill.has(t.id)) row.bills += abs;
    else row.spending += abs;
  }
  const out = [...byMonth.values()];
  for (const r of out) r.leftover = r.income - r.bills - r.spending;
  return out;
}

export interface CashflowSummary {
  months: MonthCashflow[];
  fullMonths: number;                          // complete months with any activity, used for the averages
  avg: { income: number; otherInflow: number; bills: number; spending: number; saved: number; leftover: number };
  savingsRate: number | null;                  // avg saved (or leftover) as % of avg income
}

export function summarizeCashflow(months: MonthCashflow[]): CashflowSummary {
  const full = months.filter((m) => !m.partial && (m.income || m.bills || m.spending || m.saved));
  const n = full.length;
  const avg = (k: keyof MonthCashflow) => (n ? full.reduce((s, m) => s + Number(m[k]), 0) / n : 0);
  const a = { income: avg("income"), otherInflow: avg("otherInflow"), bills: avg("bills"), spending: avg("spending"), saved: avg("saved"), leftover: avg("leftover") };
  const basis = a.saved > 0 ? a.saved : a.leftover;
  return { months, fullMonths: n, avg: a, savingsRate: a.income > 0 ? (basis / a.income) * 100 : null };
}

export interface LinkedValues {
  values: Partial<Pick<PlanInputs, LinkableField>>;
  basis: Partial<Record<LinkableField, string>>;   // short label shown under each field
}

// What the plan should use when a field follows linked data. Only fields with real evidence are returned.
export function linkedValues(cf: CashflowSummary, snap: { cash: number; homeFund: number | null; monthlyDebtPayments: number; accountCount: number }): LinkedValues {
  const values: LinkedValues["values"] = {};
  const basis: LinkedValues["basis"] = {};
  if (snap.accountCount > 0) {
    values.savings = Math.round(snap.homeFund ?? snap.cash);
    basis.savings = snap.homeFund !== null ? "Balance of your home-fund accounts" : "All checking and savings balances";
    values.monthlyDebts = Math.round(snap.monthlyDebtPayments);
    basis.monthlyDebts = "Minimum payments on linked debts";
  }
  if (cf.fullMonths >= 1 && cf.avg.income > 0) {
    values.annualIncome = Math.round(cf.avg.income * 12);
    basis.annualIncome = `Deposits over ${cf.fullMonths} month${cf.fullMonths > 1 ? "s" : ""}, after tax. Lenders use gross; raise it if you know yours.`;
    if (cf.avg.saved > 0) {
      values.monthlySavings = Math.round(cf.avg.saved);
      basis.monthlySavings = `Average moved into your home fund, ${cf.fullMonths} month${cf.fullMonths > 1 ? "s" : ""}`;
    } else {
      values.monthlySavings = Math.max(0, Math.round(cf.avg.leftover));
      basis.monthlySavings = `What was left after bills and spending, ${cf.fullMonths} month${cf.fullMonths > 1 ? "s" : ""}`;
    }
  }
  return { values, basis };
}

export const fmt$ = (n: number) => (n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const fmtK = (n: number) => (Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}K` : fmt$(n));
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";
export const fmtMonth = (ym: string) => new Date(ym + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
