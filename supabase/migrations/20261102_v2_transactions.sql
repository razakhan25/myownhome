-- MyOwnHome v2 (Nov 2, 2026): Plaid transactions, recurring streams, balance history,
-- account roles, item sync state, merchant rules, advisor memory, plan metadata.
-- Applied to project gfgdgpymshlhhqjtwkai via the Supabase MCP; kept here as the source of truth.

-- plaid_items: sync state -------------------------------------------------
alter table public.plaid_items
  add column if not exists institution_id text,
  add column if not exists cursor text,
  add column if not exists status text not null default 'ok',          -- ok | login_required | pending_expiration | revoked | error
  add column if not exists error text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists transactions_synced boolean not null default false; -- first full /transactions/sync finished
drop policy if exists "own items update" on public.plaid_items;
create policy "own items update" on public.plaid_items for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- accounts: role + details -----------------------------------------------
alter table public.accounts
  add column if not exists role text not null default 'spending',       -- home_fund | spending | ignore
  add column if not exists mask text,
  add column if not exists official_name text,
  add column if not exists limit_amount numeric,
  add column if not exists iso_currency_code text;
drop policy if exists "own accounts delete" on public.accounts;
create policy "own accounts delete" on public.accounts for delete using ((select auth.uid()) = user_id);

-- liabilities: more detail -------------------------------------------------
alter table public.liabilities
  add column if not exists next_payment_due_date date,
  add column if not exists last_statement_balance numeric,
  add column if not exists is_overdue boolean;
drop policy if exists "own liabilities delete" on public.liabilities;
create policy "own liabilities delete" on public.liabilities for delete using ((select auth.uid()) = user_id);

-- plans: metro + which inputs follow linked data ---------------------------
alter table public.plans
  add column if not exists metro_id text,
  add column if not exists linked jsonb not null default '{}'::jsonb,    -- {"savings":true,"monthlyDebts":true,"annualIncome":true,"monthlySavings":true}
  add column if not exists onboarded_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

-- transactions ---------------------------------------------------------------
create table if not exists public.transactions (
  id text primary key,                                   -- Plaid transaction_id
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  item_id text not null,
  date date not null,
  authorized_date date,
  name text not null,
  merchant_name text,
  amount numeric not null,                               -- Plaid sign: positive = money out, negative = money in
  iso_currency_code text,
  pending boolean not null default false,
  pending_transaction_id text,
  category_primary text,                                 -- effective category (user-editable), Plaid personal_finance_category values
  category_detailed text,
  category_confidence text,
  plaid_category_primary text,                           -- as Plaid sent it; never edited
  plaid_category_detailed text,
  payment_channel text,
  is_transfer boolean not null default false,            -- moves between own accounts / card payments: not income, not spending
  transfer_pair_id text,                                 -- the other side of a paired transfer, when both accounts are linked
  excluded boolean not null default false,               -- user hid it from the plan
  user_note text,
  logo_url text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);
create index if not exists transactions_account_date on public.transactions (account_id, date desc);
alter table public.transactions enable row level security;
drop policy if exists "own transactions select" on public.transactions;
drop policy if exists "own transactions insert" on public.transactions;
drop policy if exists "own transactions update" on public.transactions;
drop policy if exists "own transactions delete" on public.transactions;
create policy "own transactions select" on public.transactions for select using ((select auth.uid()) = user_id);
create policy "own transactions insert" on public.transactions for insert with check ((select auth.uid()) = user_id);
create policy "own transactions update" on public.transactions for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own transactions delete" on public.transactions for delete using ((select auth.uid()) = user_id);

-- recurring streams (Plaid /transactions/recurring/get) ----------------------
create table if not exists public.recurring_streams (
  id text primary key,                                   -- Plaid stream_id
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  item_id text not null,
  direction text not null,                               -- inflow | outflow
  description text not null,
  merchant_name text,
  category_primary text,
  category_detailed text,
  frequency text,                                        -- WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | ANNUALLY | UNKNOWN
  average_amount numeric,                                -- absolute dollars
  last_amount numeric,
  first_date date,
  last_date date,
  predicted_next_date date,
  is_active boolean not null default true,
  status text,                                           -- MATURE | EARLY_DETECTION | TOMBSTONED | UNKNOWN
  transaction_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists recurring_streams_user on public.recurring_streams (user_id);
alter table public.recurring_streams enable row level security;
drop policy if exists "own streams select" on public.recurring_streams;
drop policy if exists "own streams insert" on public.recurring_streams;
drop policy if exists "own streams update" on public.recurring_streams;
drop policy if exists "own streams delete" on public.recurring_streams;
create policy "own streams select" on public.recurring_streams for select using ((select auth.uid()) = user_id);
create policy "own streams insert" on public.recurring_streams for insert with check ((select auth.uid()) = user_id);
create policy "own streams update" on public.recurring_streams for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own streams delete" on public.recurring_streams for delete using ((select auth.uid()) = user_id);

-- daily balance history ---------------------------------------------------------
create table if not exists public.balance_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  day date not null,
  current_balance numeric,
  available_balance numeric,
  primary key (account_id, day)
);
create index if not exists balance_snapshots_user_day on public.balance_snapshots (user_id, day desc);
alter table public.balance_snapshots enable row level security;
drop policy if exists "own snapshots select" on public.balance_snapshots;
drop policy if exists "own snapshots insert" on public.balance_snapshots;
drop policy if exists "own snapshots update" on public.balance_snapshots;
drop policy if exists "own snapshots delete" on public.balance_snapshots;
create policy "own snapshots select" on public.balance_snapshots for select using ((select auth.uid()) = user_id);
create policy "own snapshots insert" on public.balance_snapshots for insert with check ((select auth.uid()) = user_id);
create policy "own snapshots update" on public.balance_snapshots for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own snapshots delete" on public.balance_snapshots for delete using ((select auth.uid()) = user_id);

-- learned merchant rules (the user's category/transfer/exclude choices, re-applied on sync) ---
create table if not exists public.merchant_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  match text not null,                                   -- lower-cased merchant_name or name
  category_primary text,
  category_detailed text,
  is_transfer boolean,
  excluded boolean,
  created_at timestamptz not null default now(),
  unique (user_id, match)
);
alter table public.merchant_rules enable row level security;
drop policy if exists "own rules all" on public.merchant_rules;
create policy "own rules all" on public.merchant_rules for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- advisor memory (short notes the advisor saves about the user) -------------------
create table if not exists public.advisor_memory (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);
alter table public.advisor_memory enable row level security;
drop policy if exists "own memory all" on public.advisor_memory;
create policy "own memory all" on public.advisor_memory for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- follow-up: remember which rows the user edited so syncs never overwrite their choices
alter table public.transactions add column if not exists user_edited boolean not null default false;
