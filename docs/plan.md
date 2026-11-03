# MyOwnHome v2 plan: "Treasury for first-time buyers", any US metro (Nov 2, 2026)

Status: PROPOSED, waiting on Raza's go-ahead. Read `docs/treasury-teardown.md` first.

## One-line positioning
Treasury's engine (Plaid in → clean data → tool-calling advisor out), pointed at one question: when can I buy, at what price, and what do I do this month? Treasury has no home-buying goal, no affordability workflow, no balance-linked savings goal, no market data and no housing calculators. We build exactly those on the same engine.

## Stack: copy the pattern, keep the platform
| Treasury | MyOwnHome | Why |
| --- | --- | --- |
| SvelteKit on Cloudflare + Cloud Run worker | Next.js 15 on Vercel, Supabase Postgres | Same stack as Flipy and ChatADU; v1 is already built on it. A rewrite to SvelteKit buys nothing. |
| `plaid-sync` worker | `/api/plaid/sync` + `/api/plaid/webhook` + a daily Vercel cron | Hobby plan allows daily crons; webhooks keep data fresh between runs |
| Plaid: Transactions, Recurring, Balances, Liabilities, Investments | Same minus Investments | Investments don't change a buy date |
| TypeSafe classifier | Plaid `personal_finance_category` (included with Transactions) + learned merchant overrides | Free, ~same accuracy for our purposes, no extra vendor |
| Gemini advisor + Parallel search + ElevenLabs | Claude Sonnet with the same tool pattern; web search and voice later | Already wired |
| Custom passkey auth | Supabase magic link + Google | Already live; passkeys later |
| Polar.sh billing | Polar.sh when we charge | Merchant of record: no sales-tax work |
| PostHog | PostHog (free tier) when marketing starts | |
| PWABuilder iOS shell | PWA first, shell later | |

## Feature map (what we copy and how it changes)
| Treasury | MyOwnHome | Phase |
| --- | --- | --- |
| Home dashboard (net worth, budget card, recent, upcoming, AI box) | **Home**: readiness ring, buy date + max price, home-fund progress (cash to close), this month's income / bills / spending / saved, next action, advisor box with suggested questions | 1 |
| Transactions list + editor + Turbo Review | **Transactions**: day groups with net, search/filter, category pill (edit), exclude, "this is a transfer", rename; review mode for uncategorized | 1 (list, edit) · 2 (review mode) |
| Recurring calendar, upcoming, review inbox | **Bills**: Plaid recurring streams, rent detected and compared with the projected mortgage payment, upcoming 30 days, subscription "cut list" with "+$X/mo = buy N weeks sooner" | 2 |
| Budgets (ongoing + goal) | **Home plan**: one auto-built monthly plan (income, bills, spending, saved) from transactions; the goal is cash to close, tied to the balance of the accounts the user marks as home fund | 1 (auto plan) · 2 (editable targets, pace alerts) |
| Net worth, debts, credit utilization, account pages | **Accounts**: balances by type, debts with APR / minimum / due date, DTI from real minimums, utilization card, daily snapshots → history chart | 1 (balances, debts, DTI) · 2 (history, utilization) |
| Advisor: tools, calculators, cards, thinking trace, follow-ups, memory, web search | **Advisor**: tools `get_my_plan`, `run_scenario`, `rent_vs_buy`, `get_cashflow`, `get_recurring`, `get_transactions`, `get_debts`, `set_home_fund`; visible steps; streaming; inline cards; `ask_user`; memory; cited web search | 1 (new tools + steps) · 2 (streaming, cards, ask_user, memory) · 3 (web search) |
| Onboarding: goals → connect (730 days, multi-bank) → accounts review → category review → paywall | Goals: metro or ZIP, price/timeline, first-time status, co-buyer → connect (730 days) → accounts review + pick home-fund accounts → plan ready (no paywall yet) | 1 (basic) · 2 (polished) |
| Transfer detection, learned merchants, recurring lineage | Card-payment pairing, bank-to-bank pairing when both sides are linked, home-fund transfers counted as savings, merchant overrides remembered | 1 (basic) · 2 (refined) |
| Connections settings | Connections: sync, reconnect (Link update mode), add institution, unlink (`/item/remove`), status badges | 1 |
| Push alerts (iOS only) | Weekly email digest: buy date moved, savings this month, one action; web push later | 2 |
| Manual accounts, CSV / Monarch imports | Manual accounts (gift funds, cash, retirement) · CSV later | 2 · 3 |
| Account deletion, privacy, no data sales | Same, plus privacy + terms pages (Plaid Production needs them) | 1 |
| 19 free tools + 657 programmatic pages | Affordability by salary × state (51 × 15 pages), down-payment timeline, closing costs, PMI, rent vs buy, FHA/VA/USDA, 51 state first-time-buyer program pages | 3 |
| Compare / alternatives / cancel pages | "MyOwnHome vs <lender calculator / Monarch / ChatGPT>" later | 3 |
| One plan, 14-day trial, Polar + IAP | Free calculator + plan; paid tier for bank linking + advisor; Polar; price TBD | 3 |

Deliberately skipped until there's traction: investments, multi-currency, tags, multiple budgets, importers, passkeys, Apple sign-in, voice, native iOS, household sharing (Treasury doesn't have it either).

## Phase 1: ship this week
1. **Propmatrix look** (after Raza approves the previews): Tailwind + Instrument Serif / Inter Tight / Avenir Next, `components/Brand.tsx` (mascot + wordmark + footer), landing in the Flipy/ChatADU layout, ChatADU's sign-in card, app shell with a left sidebar (desktop) and bottom tabs (mobile): Home, Transactions, Accounts, Advisor, Settings.
2. **Any US metro**: `lib/markets.ts` + a `market_data` table filled by a weekly cron: 30-yr rate (Freddie Mac PMMS via the keyless FRED CSV, 7.24% on Oct 29), home values for all ~895 Zillow metros (ZHVI mid tier + bottom tier: Dallas $358K / $244K, not v1's $395K), property tax by county (Census ACS B25103 ÷ B25077), insurance by state (NAIC via III, with a dated uplift), closing costs by state (LodeStar 2025 via Bankrate), FHA/conforming limits by county (FHFA XLSX + HUD floor/ceiling). Metro picker in the calculator and onboarding; ZIP lookup (124 MB Zillow ZIP file, loaded offline) next. Exact URLs, caveats and the Plaid plan facts: `docs/data-sources.md`.
3. **Plaid data**: migration adds `transactions`, `recurring_streams`, `monthly_summaries`, `balance_snapshots`, `advisor_memory`, `plaid_items.cursor/status/last_synced_at`, `accounts.role` (home_fund | spending | ignore). Routes: `/api/plaid/sync` (balances + liabilities + `/transactions/sync` cursor loop + recurring), `/api/plaid/webhook` (SYNC_UPDATES_AVAILABLE, ITEM_LOGIN_REQUIRED, PENDING_EXPIRATION, USER_PERMISSION_REVOKED), `/api/plaid/unlink`, update-mode link tokens. Daily cron re-syncs every Item. Link requests 730 days.
4. **Savings rate from real transactions** (`lib/calc.ts`, pure): per month, income = inflows categorized INCOME, bills = recurring outflows, spending = other outflows, transfers between own accounts excluded, transfers into home-fund accounts = saved. Six-month averages feed `monthlySavings` and `annualIncome`; home-fund balance feeds `savings`. The plan shows "from your accounts" badges and lets the user override.
5. **Advisor v2**: new data tools, steps trace shown per tool, saved plan as source of truth, basic memory.
6. **Launch checklist**: Cloudflare CNAME, Supabase auth URLs + Resend SMTP, privacy + terms pages, account deletion, Plaid keys, Anthropic key, end-to-end test in Sandbox. Plaid path: Sandbox → **Trial plan** (free, real data, 10 Items forever: Raza's own banks + a few beta users, Recurring included) → Pay-as-you-go Production application (business + beneficial-owner details, auto-review in days) → security questionnaire for Chase/OAuth banks. Unlink must call `/item/remove` because Transactions bills per Item per month.

## Phase 2: next 1–2 weeks
Bills page + subscription cut list, net-worth history + utilization, advisor streaming + inline cards + `ask_user` + memory, weekly digest email, transaction review mode, manual accounts, PostHog, Plaid Production approval.

## Phase 3
Programmatic SEO calculators, compare pages, Polar billing + trial, down-payment-assistance matcher (official sources only), Plaid Assets lender report, iOS shell, web search in the advisor.

## Open decisions for Raza
1. Mascot: A (coin into the roof) is the recommendation; B–E are alternatives.
2. Hero: "Hello, I'm MyOwnHome" (family pattern) vs a plain headline.
3. Keep MyOwnHome on its own Supabase project (recommended: bank data stays isolated) or share the Propmatrix login with Flipy/ChatADU.
4. The GitHub repo is public. Make it private before bank-data code lands?
5. Pricing (Phase 3): free calculator + plan, paid bank linking + advisor, or Treasury-style everything-paid with a trial.
