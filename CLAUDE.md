# MyOwnHome — context for Claude Code

First-time homebuyer planner for any US metro, modeled on Treasury.sh: link banks (Plaid, read-only) → clean cash-flow data → deterministic home-buying math → tool-calling advisor. Answers "when can I buy, at what price, and what do I do this month?" Live at https://myownhome.propmatrix.ai (Vercel project `myownhome`, team `flipy2`). The Vercel project is NOT connected to the GitHub repo, so pushing `main` does not deploy: run `npx vercel deploy --prod --yes` from the repo after pushing (the folder is linked via `.vercel/`, which is gitignored), or connect the repo once in Vercel → Project → Settings → Git. Commit author `Raza Khan <347554855+razakhan25@users.noreply.github.com>`.

Background reading before any product work:
- `docs/product-context.md` — vision, early decisions, deferred scope, monetization and risks
- `docs/treasury-teardown.md` — distilled deep dive on Treasury.sh (product, Plaid usage, advisor, stack, growth); full research lives outside this public repo in `../myownhome-research/`
- `docs/plan.md` — the v2 plan (Nov 2, 2026). Phase 1 is BUILT (this file describes the result); Phases 2–3 are next
- `docs/data-sources.md` — verified URLs and caveats for rates, Zillow ZHVI, property tax, insurance, closing costs, loan limits, DPA, plus Plaid plan rules

Local dev on this Mac: Next 15 needs Node >= 18.18 and the system Node is 18.16, so the `myownhome` launch config (port 3005) and every npm command use the Node 22 toolchain at `../housing-weekly/.toolchain/node22/bin` (`PATH="…/node22/bin:$PATH" npm run dev -- -p 3005`).

## Decisions (Nov 2, 2026)
- Design: Propmatrix family (same as Flipy/ChatADU). Tailwind 3, Instrument Serif + Inter Tight + Avenir Next/Nunito wordmark, navy `brand` scale, `#0052FF` wordmark blue, rounded gradient hero card, "Hello, I'm MyOwnHome" + floating mascot. Mascot A = grid house with a "$" coin dropping into a roof slot (`public/brand/mascot.svg`, generator `../myownhome_logo/gen_myownhome.py`). No dark mode.
- National, not DFW: every market figure comes from `data/*.json` + the live FRED rate; nothing about Dallas is hard-coded (the landing sample plan uses Dallas figures from the data files).
- Static market data in the repo (no `market_data` table): Zillow metros change monthly, states yearly; rerun the scripts and commit. The rate is fetched live with a 1-day cache.
- Keep MyOwnHome on its own Supabase project (bank data stays isolated from Flipy/ChatADU).
- Plaid categories (`personal_finance_category`) instead of a third-party classifier; user edits are remembered as merchant rules.
- The saved plan (`plans` row) is the only source of truth; the advisor never trusts client-sent numbers.
- Plaid path: Sandbox → Trial plan (free, 10 Items forever) → Pay-as-you-go. Unlink must call `/item/remove` (Transactions bills per Item).

## Stack
- Next.js 15.5 (App Router) + React 19, TypeScript 5.9 (do NOT upgrade to TS 7: Next 15 can't resolve `@/` paths with it), Tailwind 3 (`tailwind.config.ts`, `app/globals.css` has `.panel/.btn-*/.field/.chip` component classes)
- Supabase (project `myownhome`, ref `gfgdgpymshlhhqjtwkai`, us-east-1): email magic-link auth (Google button appears when `NEXT_PUBLIC_GOOGLE_AUTH=1`), Postgres with RLS on everything
- Plaid node SDK 50 (sandbox until Production): Transactions (730 days, `/transactions/sync`), Recurring, Balances, Liabilities; webhooks verified with `jose`
- Anthropic API (`claude-sonnet-5-5`), tool-calling only
- Vercel Hobby: one daily cron (`vercel.json` → `/api/cron/sync` at 11:00 UTC)

## Layout
- `lib/calc.ts` — ALL money math. `PlanInputs` + `BASE_DEFAULTS` (US), `computePlan` (28/36 and 50/43 DTI, FHA/conventional payment, cash to close, buy date incl. interest on existing savings, readiness score), `rentVsBuy`, `nextAction` (deterministic "this month" tip), cash flow from transactions: `monthlyCashflow` → `summarizeCashflow` → `linkedValues` (income = INCOME inflows, bills = rent/utilities/loan payments/recurring outflows, spending = other outflows, transfers excluded, net transfers into `home_fund` accounts = saved; six full months feed the plan). `LINKABLE` = the four inputs that follow linked data.
- `lib/markets.ts` — `data/metros.json` (895 Zillow metros, mid + bottom tier ZHVI) and `data/states.json` (ACS property tax, NAIC insurance ×1.5 uplift to 2026, LodeStar closing + 2% lender/prepaids); `assumptionsFor(metroId)`, `searchMetros`, `currentRate()` (FRED, cached 1 day, dated fallback). Regenerate with `scripts/build-metros.mjs` and `scripts/build-states.mjs` (args = downloaded source files; see the script headers).
- `lib/plan-sync.ts` — `linkedReport()` (cash flow + linked values from the DB) and `refreshPlanFromLinked()` (writes linked values into `plans.inputs` for every field whose `plans.linked[field] !== false`). Called after every sync, unlink, role change and transaction edit.
- `lib/sync.ts` — Plaid → DB: `syncItem` (accounts + daily balance snapshot, liabilities, transactions cursor loop with merchant rules + transfer pairing, recurring streams, item status), `syncUser`, `snapshot()` (DB-only `FinancialSnapshot`: cash, homeFund, monthlyDebtPayments, accounts, liabilities, items).
- `lib/plaid.ts` (`plaid()`, `plaidConfigured()`, `webhookUrl()`), `lib/crypto.ts` (AES-256-GCM for access tokens), `lib/supabase.ts` / `lib/supabase-server.ts` (`requireUser()`), `lib/supabase-admin.ts` (service-role client for webhook/cron/account deletion), `lib/use-plan.ts` (visitor draft in localStorage + `applyMarket`).
- Pages: `app/page.tsx` + `components/Landing.tsx` (hero, mission, free calculator, features, FAQ, metro marquee), `app/login` (ChatADU-style `SignInCard`), `app/welcome` (3-step onboarding: metro + basics → link bank → mark home-fund accounts), `app/(app)/*` behind `AppShell` (sidebar / bottom tabs): `dashboard` (Home: calculator with "from your accounts" badges, cash-flow bars, advisor box, accounts summary), `transactions` (month view, filters, category/transfer/exclude edits, "apply to every merchant"), `accounts` (roles, debts, DTI, reconnect/unlink), `advisor` (chat with steps), `settings` (metro, reset to linked values, delete account), `privacy`, `terms`.
- Components: `Brand.tsx` (Mark/Logo/Arrow/Check/Footer), `Calculator.tsx` (+ `Money`, `Ring`), `MetroPicker.tsx`, `components/app/hooks.ts` (`useSavedPlan`, `useSnapshot`, `useReport`, `usePlaidLink`).
- API: `plaid/{link-token (update mode with item_id), exchange, sync (GET snapshot / POST sync, optional item_id), unlink, webhook}`, `cron/sync`, `accounts/[id]` (PATCH role), `transactions/[id]` (PATCH category/is_transfer/excluded/user_note, `remember` → merchant rule), `cashflow`, `markets` (`?q=` search, `?id=` assumptions + rate), `advisor`, `account/delete`, `me`; `auth/{callback,signout}`.
- `app/api/advisor/route.ts` — tools `get_my_plan`, `run_scenario`, `rent_vs_buy`, `get_cashflow`, `get_recurring`, `get_transactions`, `get_debts`, `remember` (→ `advisor_memory`). Steps are returned per tool and shown under each answer. Rule: the model never does arithmetic; every number comes from `lib/calc.ts` or the DB.
- `middleware.ts` refreshes the session cookie and redirects signed-out visitors of app paths to `/login?next=`.

## Database (public schema, RLS own-row on everything; migrations in `supabase/migrations/`)
- `plans(user_id pk, inputs jsonb, linked jsonb, metro_id, onboarded_at, updated_at)` — `linked[field] === false` means the user typed over the linked value
- `plaid_items(id, user_id, item_id unique, access_token [encrypted], institution_name, institution_id, cursor, status ok|login_required|pending_expiration|revoked|error, error, last_synced_at, transactions_synced)`
- `accounts(id = plaid account_id, user_id, item_id, name, official_name, mask, type, subtype, current_balance, available_balance, limit_amount, role home_fund|spending|ignore)`
- `liabilities(account_id pk, user_id, kind credit|student|mortgage, minimum_payment, apr, next_payment_due_date, last_statement_balance, is_overdue)`
- `transactions(id = plaid transaction_id, user_id, account_id, item_id, date, name, merchant_name, amount [Plaid sign: + out, − in], pending, category_primary/detailed [effective, editable], plaid_category_primary/detailed [as received], is_transfer, transfer_pair_id, excluded, user_edited, user_note, logo_url …)`
- `recurring_streams(id = stream_id, user_id, account_id, direction, description, merchant_name, category_*, frequency, average_amount, last_amount, predicted_next_date, is_active, status, transaction_ids[])`
- `balance_snapshots(account_id, day, user_id, current_balance, available_balance)` — one row per account per day
- `merchant_rules(user_id, match [lower-cased merchant], category_*, is_transfer, excluded)` — re-applied on every sync
- `advisor_memory(user_id, note, created_at)`
- `waitlist(id, email unique)` — legacy, anon insert only

## Env vars
| Key | Where | Status |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Vercel + .env.local | set |
| TOKEN_ENCRYPTION_KEY (32 bytes base64) | Vercel (sensitive) | set — never rotate without re-encrypting plaid_items; .env.local has a separate local-only key |
| PLAID_ENV | both | `sandbox` |
| PLAID_CLIENT_ID, PLAID_SECRET | both | TODO — Raza adds after Plaid signup (bank linking shows "coming soon" until then) |
| ANTHROPIC_API_KEY | both | TODO — advisor returns 503 until set |
| SUPABASE_SECRET_KEY (`sb_secret_…`) | both | TODO — Supabase → Project Settings → API keys; needed by the webhook, the daily cron and auth-user deletion |
| CRON_SECRET | both | TODO in Vercel (any random string; Vercel sends it as the cron's bearer token) |
| NEXT_PUBLIC_SITE_URL | both | optional; base for the Plaid webhook URL (defaults to the prod domain); `http://localhost:3005` locally |
| PLAID_REDIRECT_URI | Vercel | optional; only after registering it in the Plaid dashboard (OAuth banks) |
| NEXT_PUBLIC_GOOGLE_AUTH | both | optional `1` to show the Google button once the provider is configured in Supabase |

## Launch checklist (open items, all Raza's)
- [ ] Cloudflare DNS: CNAME `myownhome` → `cname.vercel-dns.com`, DNS only
- [ ] Supabase Auth → URL config: Site URL `https://myownhome.propmatrix.ai`, redirect `https://myownhome.propmatrix.ai/auth/callback`
- [ ] Supabase custom SMTP (built-in mail is rate-limited to a few emails/hour)
- [ ] Plaid signup (Trial plan) → PLAID_CLIENT_ID + sandbox PLAID_SECRET in Vercel; register the webhook URL is automatic (sent per Link token)
- [ ] ANTHROPIC_API_KEY, SUPABASE_SECRET_KEY, CRON_SECRET in Vercel
- [ ] Make the GitHub repo private before real bank data flows
- [ ] End-to-end test in Sandbox (`user_transactions_dynamic` has six months of recurring data)
- [ ] A contact email for the privacy page (Plaid Production asks for one)

## Next up (Phase 2 in docs/plan.md)
1. Bills page from `recurring_streams` + subscription cut list ("+$X/mo = buy N weeks sooner")
2. Net-worth history from `balance_snapshots`, credit utilization card
3. Advisor streaming + inline cards + `ask_user` + richer memory
4. Weekly "buy date moved" email digest (Resend)
5. Transaction review mode (one card at a time), manual accounts
6. PostHog, Plaid Production application, then Phase 3 (SEO calculators, Polar billing, DPA matcher from official sources only)

## Conventions
- Keep money math deterministic and in `lib/calc.ts`; add a tool rather than letting the model compute.
- Label every assumption in the UI with its source and date (the `labels` in `lib/markets.ts`).
- Disclaimers stay: not a lender, not financial advice.
- Update this file whenever a decision is made.
