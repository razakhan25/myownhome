# MyOwnHome

Find out the month you can buy your first home, in any US metro. Link your accounts (read-only through Plaid), see what you really save, get your max price, cash to close and buy date, and ask an advisor that runs the numbers instead of guessing them.

Next.js 15 + Tailwind + Supabase + Plaid + Claude. See `CLAUDE.md` for the architecture, database, env vars and launch checklist; `docs/` for the Treasury.sh teardown, the plan and the data sources.

```
npm install
npm run dev
```

Market data lives in `data/` (Zillow ZHVI by metro, state cost averages). Regenerate with the scripts in `scripts/` when the sources update.
