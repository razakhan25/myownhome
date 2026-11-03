# Treasury.sh teardown (deep dive, Nov 2, 2026)

Treasury (treasury.sh, Treasury Technologies Inc., Seattle; solo founder Junead Khan, ex-Microsoft, bootstrapped) is the model for MyOwnHome: link bank accounts through Plaid, clean the data, and run an AI advisor that reasons with tools and never does arithmetic itself. This is the distilled version; the full screen-by-screen inventory, stack evidence and site map live outside the repo in `../myownhome-research/` (the repo is public, so vendor IDs and raw evidence stay out of it).

Everything here is paraphrased from public pages: treasury.sh, docs.treasury.sh (llms.txt), the changelog, the App Store listing, the privacy policy and the public web-app bundle. Do not copy their code or copy text.

## 1. The product, screen by screen

Desktop: left sidebar with Home, Budgets, Transactions, Recurring, Net Worth, Investments, Settings, plus pinned budgets and chat history. Mobile: bottom glass tab bar (Home, Budgets, Transactions, Recurring, Wealth, Settings). The AI is not a tab; it opens from the "Ask about your finances" box on Home, Cmd+K, or chat history.

| Screen | What's on it | Rules worth copying |
| --- | --- | --- |
| Home | Net worth tile (value, past-month change, sparkline); primary budget card (income / expenses / savings, actual vs budget); recent transactions; upcoming recurring charges; AI composer with 4 personalized starter chips | Suggested questions are generated from the user's own data |
| Transactions | Day groups with a daily net; rows = logo, merchant, tags, category pill, account, amount; search + filter (category, account, tag, status, in/out, amount range) + sort; multi-select bulk edit; Trash with restore | Edits never touch the bank; user's category choice beats the model; pending items flagged |
| Transaction editor | Rename (original Plaid name kept), re-date, note, amount sign, quick split (½ ⅓ ¼), tags, category grid with hotkeys, Exclude from calculations, Mark as recurring | "Exclude" instead of "hide" |
| Turbo Review | One-card-at-a-time review of uncategorized items with letter hotkeys | Clears the backlog fast after a new link |
| Recurring | Calendar of projected charges with logos; Light/Regular/Heavy month badge; Monthly In / Monthly Out / due in 7 days / subscription count; upcoming expenses and income (60 days); category breakdown; per-item pages with price-change history and charge history; a Review inbox for new detections and "possibly inactive" | Streams tracked by lineage so a price change updates the same subscription; dismissals are remembered; forecast dates = billing cycle + start date, else Plaid's predicted next date |
| Budgets | Many budgets; Ongoing (weekly/monthly/yearly pace) or Goal (fixed amount, optional target date; their own example is "House Fund, down payment by 2028"); scoped by categories, tags and accounts; detail view with Income/Expenses/Savings vs targets, Net cashflow, Sankey money flow, category bars and table, frequent merchants, largest transactions; alerts at ~80% pace and 100% | Goal progress is transaction-based, not tied to an account balance (MyOwnHome ties it to the home-fund balance) |
| Net Worth | Trend chart (1W to ALL, scrubbable); Assets, Liabilities, Net Cash (bank balances minus card debt), Debt Ratio; credit utilization card with tiers and "cards worth paying down"; treemap; accounts grouped by type; per-account pages (credit card APRs, statement, minimum, due date; mortgage PMI, escrow, payoff progress; student loan plan) | History comes from daily snapshots, so new users start with a short chart; snapshots are editable |
| Investments | Holdings, allocation, return vs S&P 500, cost basis / tax lots, activity, manual holdings | Not needed for MyOwnHome v2 |
| Advisor | Streamed answer with inline app cards, "Thought for Ns · N steps" trace, structured follow-up questions (single/multi/free text, up to 5 options), memory (automatic + manual key/value), voice dictation, chat history | See section 3 |
| Settings | Account (passkeys, Google, Apple; delete account by typing "delete"); Preferences (primary budget, currency, theme, internal-transfer handling: leave / exclude / auto-delete; notification toggles); Subscription; Auto-categorize (All / Confident only / None with accuracy stats); Memory; Connections (sync, reconnect, add products, disconnect → convert to manual or delete all data, exclude from net worth); Manual accounts; Categories; Tags; Data import | Connections page is the model for ours |

Onboarding (current): sign up (passkey / Google / Apple / email code) → goals multi-select (no "buy a home" option!) → start fresh or bring history → Plaid Multi-Item Link requesting 730 days → accounts review with net-worth preview → category review (set generated from your own transactions) → paywall → day-one budget built from real spending, transfers excluded, recurring detected.

Notifications: iOS push only (pace warning ~80%, budget exceeded, disconnected account, card/loan payment due in 3 days / today / overdue). No email digest, no web push, no Android app, no household sharing, no reports page, no data export, no public API.

## 2. How it connects to money (Plaid)

- Plaid only (US, 12,000+ institutions), read-only. Web: Plaid Link JS with an OAuth return route; iOS: native LinkKit. Link tokens are pre-created so Link opens instantly.
- Products: Transactions (`/transactions/sync` cursor per Item, personal-finance category + confidence stored as a signal), Transactions Recurring (stream id, predicted next date), Balances, Liabilities (credit APRs/minimums/due dates, mortgage PMI/escrow/origination, student-loan plan), Investments (holdings, tax lots).
- History: 730 days requested at link; a slider from 1 to 104 weeks in Settings (the docs' "1–16 weeks" is stale).
- A separate `plaid-sync` worker (Cloud Run) does the syncing; broken Items show "Action Required" and trigger a push; update mode handles reconnects and adding products.
- Data cleaning, which is most of their changelog: internal-transfer pairing (card payment debit ↔ "payment received" credit; bank-to-bank only when both sides are present and match; the user's decision always wins), learned merchant categories, recurring lineage, price-change detection, dismissal memory. App Store reviews still complain about card payments double-counting, so this is hard.
- Gap fillers: manual accounts, generic CSV template (date, amount; balances template backfills net worth), Monarch / Apple Card / Rocket Money importers with a 7-day undo.

## 3. How the advisor works

Gemini API, tool-calling agent, median answer ~10 s, streamed. Context = question + profile (income range, state, age, goals) + memories. Tools seen in the shipped client:

- `treasury_shell`: the model writes a multi-line script of data commands (accounts, budgets, transactions, recurring, utilization, holdings, net worth…); each line becomes a visible step.
- ~20 `get_*` data tools (budgets, transactions, spending by category, accounts, net worth, recurring, upcoming, utilization, debts, cards, investments, connections, categories, tags).
- `calculate` / `finance_calculate`: deterministic math; the model never does arithmetic.
- `facts` (curated, locked table of limits and rates), `search_web` (Parallel, sources shown), `product_reference` + docs RAG.
- 15 `show_*` card tools that render real app components inline (budget analysis, Sankey, net worth, recurring, debts, transactions…).
- `ask_user` structured follow-ups; `save_memory` / `manage_memory` / `forget_memory`.
- An "opportunity scan" over a curated library of research angles (card perks, employer benefits, FSA, real estate). This library plus the data cleaning is the moat, not the model.

## 4. Stack (verified)

| Layer | Treasury | MyOwnHome decision |
| --- | --- | --- |
| Front end | Two SvelteKit (Svelte 5) apps: marketing + app | Keep Next.js 15 (same stack as Flipy and ChatADU; v1 already exists) |
| Hosting | Marketing on Cloudflare; app SSR + `plaid-sync` worker on Google Cloud Run; docs on Mintlify | Keep Vercel + Supabase (us-east-1). Sync worker = Vercel cron + route; webhooks = route |
| Bank data | Plaid (Transactions, Recurring, Balances, Liabilities, Investments) | Same products minus Investments; Plaid `personal_finance_category` instead of a third-party classifier |
| Advisor | Gemini + TypeSafe "Jev" for categorization + Parallel web search + ElevenLabs voice | Claude (already wired) with the same tool pattern; voice and web search later |
| Auth | Custom passwordless: passkeys, email code, Google, Apple | Supabase magic link + Google; passkeys later |
| Analytics | PostHog via a managed proxy; Meta CAPI (server-side, no pixel); Google Ads tag; Apple Search Ads | PostHog when we start marketing |
| Billing | Polar.sh (merchant of record) on web; Apple IAP on iOS; $12.99/mo or $95/yr, 14-day trial, card required, 7-day grace | Polar when we charge (handles sales tax); one plan |
| iOS | WKWebView shell (PWABuilder style) with native Plaid, push, widgets, haptics; no Android app | PWA first; shell later |
| Email | Google Workspace + Amazon SES | Resend (or SES) for auth + digests |

## 5. Growth engine

- 19 free calculators + 657 programmatic state/salary pages (paycheck, salary after tax, tax brackets, RSU, budget, emergency fund, debt payoff, net worth, FIRE, compound interest, "The Latte Lie"). Each tool page ends with a CTA that quotes the user's own result and links to signup with a UTM per tool and state. **None of them cover housing**: no mortgage, affordability, rent-vs-buy, down-payment, closing-cost or PMI tool. That whole query space is open for MyOwnHome (affordability by salary × state, down-payment timeline, closing costs, PMI, FHA/VA/USDA, 51 state first-time-buyer program pages).
- 8 "vs" pages, 4 "alternatives" roundups, 10 "how to cancel X" guides, 35 Learn articles, all with FAQ schema and "reviewed by the founder" lines; robots.txt invites AI crawlers; llms.txt + a docs MCP server.
- TreasuryBench: a self-run benchmark (Treasury 95 vs ChatGPT 89, Monarch 53) used as the proof point everywhere. Marketing, not independent proof.
- Founder-led TikTok/IG/LinkedIn, Business Insider essay, four Product Hunt launches; paid acquisition started in late October 2026.
- Price went from $5/mo (early 2026) to $12.99/mo; the paywall sits after onboarding, once the user has seen insights from their own data.

## 6. What this means for MyOwnHome

Treasury treats housing as one topic among twelve and has no home-buying goal in onboarding, no affordability workflow, no balance-linked savings goal and no market data. We build the same engine (Plaid in, clean data, tool-calling advisor out) around one question: "When can I buy, at what price, and what do I do this month?" The feature-by-feature mapping and the build order are in `docs/plan.md`.
