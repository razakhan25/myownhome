# MyOwnHome — context for Claude Code

First-time homebuyer planner for Dallas–Fort Worth. Answers "when can I buy, at what price, and what do I do this month?" Live at https://myownhome.propmatrix.ai (Vercel project `myownhome`, team `flipy2`).

Background reading before any product work:
- `docs/product-context.md` — vision, decisions made so far and why, deferred scope, monetization and risks
- `docs/treasury-teardown.md` — full research on Treasury.sh, the app this architecture is modeled on

## Stack
- Next.js 15 (App Router) + React 19, TypeScript 5 (do NOT upgrade to TS 7: Next 15 can't resolve `@/` paths with it)
- Supabase (project `myownhome`, ref `gfgdgpymshlhhqjtwkai`, us-east-1): magic-link auth + Postgres with RLS
- Plaid (sandbox until Production approval): Transactions + Liabilities, read-only
- Anthropic API (`claude-sonnet-5-5`) for the advisor, tool-calling only
- Plain CSS in `app/globals.css` (cream / deep green / terracotta, Fraunces + Inter)

## Layout
- `lib/calc.ts` — ALL home-buying math (affordability via 28/36 and 43% DTI, FHA/conventional payment, cash to close, buy date, readiness score, rent vs buy). Pure functions, shared by UI and advisor. Defaults: rate 7.24% (Freddie Mac PMMS Oct 29 2026), DFW median $395K, tax 2.1%, insurance 0.9%.
- `components/Calculator.tsx` — the calculator UI (public page and dashboard)
- `app/page.tsx` — landing + free calculator (no login; draft saved to localStorage) + waitlist
- `app/login`, `app/auth/callback` — Supabase email magic link
- `app/dashboard/page.tsx` — saved plan (autosaves to `plans`), linked accounts, advisor chat
- `app/api/plaid/{link-token,exchange,sync}` — Plaid Link flow; access tokens AES-256-GCM encrypted (`lib/crypto.ts`) before storage
- `lib/sync.ts` — pulls balances + liabilities into `accounts` / `liabilities`
- `app/api/advisor/route.ts` — agent loop with tools `get_my_plan`, `run_scenario`, `rent_vs_buy`. Rule: the model never does arithmetic; every number comes from `lib/calc.ts`.

## Database (public schema, RLS on everything)
- `plans(user_id pk, inputs jsonb, updated_at)` — own-row select/insert/update
- `plaid_items(id, user_id, item_id unique, access_token [encrypted], institution_name)` — own-row select/insert/delete
- `accounts(id pk = plaid account_id, user_id, item_id, name, type, subtype, current_balance, available_balance)`
- `liabilities(account_id pk, user_id, kind, minimum_payment, apr)`
- `waitlist(id, email unique)` — anon insert only, no select

## Env vars (set in Vercel)
| Key | Status |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | set |
| TOKEN_ENCRYPTION_KEY (32 bytes base64) | set (sensitive) — never rotate without re-encrypting plaid_items |
| PLAID_ENV | `sandbox` |
| PLAID_CLIENT_ID, PLAID_SECRET | TODO — Raza adds after Plaid signup |
| ANTHROPIC_API_KEY | TODO — advisor returns 503 until set |

Local dev: copy these into `.env.local`, then `npm install && npm run dev`.

## Launch checklist (open items)
- [ ] Cloudflare DNS: CNAME `myownhome` → `cname.vercel-dns.com`, DNS only
- [ ] Supabase Auth → URL config: Site URL `https://myownhome.propmatrix.ai`, redirect `https://myownhome.propmatrix.ai/auth/callback`
- [ ] Supabase custom SMTP (built-in mail is rate-limited to a few emails/hour)
- [ ] Plaid keys (sandbox), then apply for Production
- [ ] Anthropic key

## Next up (from the Treasury.sh teardown)
1. Savings rate from real transactions (Plaid Transactions sync) instead of user-entered monthly savings
2. Weekly "buy date moved" email/push
3. Down-payment assistance matcher: TDHCA + Dallas/Fort Worth city programs (verify every amount and rule from official sources; never let the model invent them)
4. New-construction matching for DFW builders with incentive data (rate buydowns, closing credits)
5. Plaid Assets lender-ready report (opt-in, billed per report)
6. Monetization: subscription during saving period + builder/agent referrals — RESPA Section 8 review before any lender referral fees

## Conventions
- Keep money math deterministic and in `lib/calc.ts`; add a tool rather than letting the model compute.
- Label every assumption in the UI with its source and date.
- Disclaimers stay: not a lender, not financial advice.
