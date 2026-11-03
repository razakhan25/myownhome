# Product context and decisions (Nov 2, 2026)

Why MyOwnHome is built the way it is. Read with `docs/treasury-teardown.md`.

## Vision
MyOwnHome helps first-time buyers build a financial plan to buy a home: how much they can afford, where to look, and matching them to new-construction inventory that fits. Long-term market is the Sunbelt (TX, AZ, FL, NC, GA). Founder is a licensed real estate salesperson in Texas and California with fix-and-flip and new-construction experience, based in Dallas.

## Decisions so far
| Decision | Choice | Why |
| --- | --- | --- |
| Launch metro | Dallas–Fort Worth | Founder's home market and license |
| Launch speed | ~2-day v1, scope cut hard | Ship the calculator funnel now; data integrations follow |
| Hosting | New Vercel project + new Supabase project, at myownhome.propmatrix.ai | Separate from Flipy; propmatrix.ai is the Prop Matrix umbrella domain |
| Bank data | Plaid, Sandbox → Trial (10 real Items) → Production | Production approval takes 1–3 weeks; Trial covers the private beta |
| Advisor | Claude with tools; model never computes | Copies Treasury's main quality lever |
| Auth | Email magic link | No passwords to manage at launch |

## v1 scope (shipped)
1. Public "When can I buy?" calculator, no login
2. Sign-up + saved Home Readiness dashboard
3. Plaid linking for beta users (balances + liabilities feed the plan)
4. Advisor chat using deterministic calculators
5. Waitlist for new-construction matching

## Deliberately deferred
- Plaid Production, transaction-based savings rate
- Down-payment assistance matching beyond a generic TDHCA pointer (must verify every amount and rule from official sources)
- New-construction matching and builder incentive data
- iOS app (wrap the web app later, as Treasury did)
- Lender/agent referrals

## Monetization thinking (undecided)
A subscription alone is weak because success means the customer leaves. Options:
- Subscription during the 1–3 year saving period (Treasury-style $8–13/mo) to cover Plaid costs
- Builder marketing partnerships, agent referrals (founder is licensed in TX/CA), lender handoffs
- Mortgage-related referral fees are restricted by RESPA Section 8 — get a real estate attorney before launching that piece

## Risks
- Advice liability: stay read-only, show the math and sources, keep "not a lender / not financial advice" disclaimers
- Plaid per-user cost vs revenue during long saving periods; gate linking behind beta, paid or referral-qualified users
- Security of stored bank tokens (encrypted with AES-256-GCM; Plaid Production review will ask about this)
- Section 1033 rewrite could change aggregator pricing

## Data sources used in v1
- Mortgage rate 7.24% (30-yr) — Freddie Mac PMMS, week of Oct 29 2026
- DFW median ~$395,000 — Zillow Home Value Index via Opendoor, spring 2026
- Property tax 2.1% and insurance 0.9% of price — editable estimates, not sourced figures; replace with county/ZIP-level data
