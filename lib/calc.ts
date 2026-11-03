// Deterministic home-buying math. The advisor calls these; the model never does arithmetic.

export type LoanType = "fha" | "conventional";

export interface PlanInputs {
  annualIncome: number;      // gross household income, $/yr
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
  closingPct: number;        // buyer closing costs, % of price
  reserveMonths: number;     // months of payment kept after closing
  savingsApy: number;        // % earned on savings
}

// DFW defaults. Rate: Freddie Mac PMMS, Oct 29 2026 (7.24%). Tax and insurance are editable estimates.
export const DFW_DEFAULTS: PlanInputs = {
  annualIncome: 95000,
  monthlyDebts: 450,
  savings: 12000,
  monthlySavings: 900,
  rent: 1650,
  targetPrice: 0,
  loanType: "fha",
  downPct: 3.5,
  rate: 7.24,
  propertyTaxRate: 2.1,
  insuranceRate: 0.9,
  hoaMonthly: 0,
  closingPct: 3,
  reserveMonths: 2,
  savingsApy: 0,
};

export const DFW_CONTEXT = {
  metro: "Dallas–Fort Worth",
  medianPrice: 395000,
  medianPriceSource: "Zillow Home Value Index via Opendoor, spring 2026",
  rateSource: "Freddie Mac PMMS, week of Oct 29 2026",
};

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

export function monthsToGoal(gap: number, monthly: number, apyPct: number): number | null {
  if (gap <= 0) return 0;
  if (monthly <= 0) return null;
  const r = apyPct / 100 / 12;
  if (r === 0) return Math.ceil(gap / monthly);
  // future value of current gap target using an annuity: months until contributions + growth close the gap
  let bal = 0, m = 0;
  while (bal < gap && m < 600) { bal = bal * (1 + r) + monthly; m++; }
  return m >= 600 ? null : m;
}

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1);
  return d;
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
  const months = monthsToGoal(gap, p.monthlySavings, p.savingsApy);
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

export const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—";
