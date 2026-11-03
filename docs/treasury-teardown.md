# Treasury.sh teardown (researched Nov 2, 2026)

Treasury (treasury.sh) is the closest model for MyOwnHome's architecture: a consumer money app that links bank accounts through Plaid and runs an AI advisor that does math with tools, not the model. Full shareable version: https://claude.ai/artifact/GZDTuX4Z8QCfB6ikkqzNvd

## Company
| Item | Detail |
| --- | --- |
| Entity | Treasury Technologies, Inc., Seattle |
| Founder | Junead Khan, ex-Microsoft software engineer; solo, self-funded (rejected by YC) |
| Traction | Revenue just over $6K (Oct 2026); ~30K social followers; App Store 4.5–4.6 |
| Price | $12.99/mo or $95/yr, one tier, 14-day trial; no ads, no data sales |
| Growth | Founder-led TikTok/IG/LinkedIn, free SEO calculators (/tools), "vs competitor" pages, a self-run benchmark (TreasuryBench) |

TreasuryBench is self-run on synthetic households with an LLM judge — treat it as marketing, not independent proof.

## How it connects to finances
All bank, card, loan and brokerage data comes through Plaid (12,000+ US institutions), read-only.
1. User picks a history window (1–16 weeks); server creates a Plaid `link_token` (pre-fetched on iOS so Link opens instantly).
2. Plaid Link handles the bank login (OAuth or credentials held by Plaid).
3. Server exchanges `public_token` for a permanent `access_token` per institution ("Item"), stored encrypted.
4. Pulls up to 2 years of history, then syncs regularly; user can force a sync.
5. Broken links (password change, MFA) trigger a push alert and Plaid Link update mode.

Plaid products used: Transactions, Balance/Auth fields, Investments (holdings, tax lots), Liabilities (APR, statement balance, minimum due, due dates, mortgage and student loan details).
Gap fillers: manual accounts, manual holdings, generic CSV import with a column template, one-click Monarch and Apple Card importers.
Privacy: names, account numbers, card numbers and P2P recipients are scrubbed before any data reaches an AI vendor.

## Stack
| Layer | What | Confidence |
| --- | --- | --- |
| Front end | SvelteKit / Svelte | Confirmed |
| iOS | Web app in a native shell (likely Capacitor) | Inferred |
| Hosting | Cloudflare + Google Cloud | Confirmed (privacy policy) |
| Database | Relational, likely Postgres | Inferred |
| Bank data | Plaid | Confirmed |
| Advisor model | Google Gemini API (paid tier) | Confirmed |
| Categorization | TypeSafe Jev ("System One" classifier, fast/cheap, ~90% accuracy vs ~97% frontier in one test) + learned merchant rules | Confirmed |
| Advisor web search | Parallel Web Systems | Confirmed |
| Voice | ElevenLabs speech-to-text | Confirmed |
| Docs | Mintlify with llms.txt; Gemini embeddings for help RAG | Confirmed |
| Auth | Passkeys, email codes, Google | Confirmed |
| Ads | Meta Conversions API (hashed), Google Ads tag | Confirmed |

## How the advisor works
Tool-calling agent on Gemini. The model plans; numbers come from queries and deterministic calculators; answers render as app cards.
1. Context: question + profile basics (income range, state, age, goals) + saved memory notes.
2. Data tools: typed queries over transactions, budgets, recurring, balances, holdings, debts.
3. Calculators: rent-vs-buy break-even, payoff plans, cash buffers — the model never does arithmetic.
4. Knowledge: curated library of "angles" (card perks, employer benefits) + live web search with sources.
5. Product RAG so it describes the app correctly.
6. Output: streamed answer with inline cards, a visible "thinking steps" trace, structured follow-up questions.
The moat is the curated advice library and the data-cleaning heuristics, not the model.

## How copyable
| Piece | Difficulty | Time |
| --- | --- | --- |
| Plaid Link + exchange + sync | Easy | ~1 week |
| Plaid Production approval | Easy–medium | 1–3 weeks (Trial plan: 10 real Items free) |
| Data model, budgets, net worth | Easy | ~2 weeks |
| Clean data: transfers, recurring, categories | Hard | Ongoing — most of Treasury's changelog |
| Advisor agent with tools | Medium | 2–3 weeks |
| iOS app | Medium | 2–4 weeks |
| Trust, brand, distribution | Hard | Months |

Unit economics: Plaid doesn't publish prices; procurement data puts Transactions at ~$0.30–$0.60 per Item per month, and Transactions, Liabilities and Investments each bill monthly per Item. At 2–3 Items per user, Plaid could run ~$1–3/user/month (estimate) against Treasury's $7.92. Trial users who never convert still cost money.

Regulation: CFPB Section 1033 (free open-banking access) is enjoined and being rewritten; new proposal expected late 2026, nothing enforceable before 2028. Banks may be allowed to charge for data, so keep the aggregator swappable (Teller, MX).

## What MyOwnHome takes from this
- Same pattern: Plaid in, tool-calling agent with deterministic calculators out (`lib/calc.ts`, `app/api/advisor`).
- Same funnel: free calculator as the SEO/social front door, then sign-up to save the plan.
- Housing focus is the wedge: Treasury treats housing as 1 of 12 topics.
- Features Treasury lacks that we're building toward: Home Readiness score, buy-date forecast from real savings, lender-style affordability from detected income + Liabilities, goal-linked spending coach, down-payment assistance matching, new-construction matching, Plaid Assets lender-ready report (Fannie Mae Day 1 Certainty approved).

## Sources
- https://treasury.sh · /pricing · /privacy · /changelog · /benchmarks · /tools · /compare/chatgpt
- https://docs.treasury.sh/core/connections.md · https://docs.treasury.sh/core/ai-advisor.md
- https://news.ycombinator.com/item?id=46425301 · https://madewithsvelte.com/treasury
- https://aistartupsnews.com/news/junead-khan-leaves-200k-microsoft-role-to-launch-ai-startup-treasury-without-vc-funding/
- https://www.deeplearning.ai/the-batch/models-built-to-do-one-thing-well
- https://www.vendr.com/marketplace/plaid · https://incomechecker.com/blog/plaid-pricing · https://kanopylabs.com/blog/plaid-vs-teller-vs-mx-financial-data-apis
- https://www.openbankingtracker.com/guides/section-1033-status
- https://www.housingwire.com/articles/43142-plaids-new-asset-verification-program-receives-day-1-certainty-approval-from-fannie-mae
