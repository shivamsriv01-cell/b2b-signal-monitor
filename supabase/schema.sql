-- B2B Account Signal Monitor — Supabase schema
-- Run this once in Supabase → SQL Editor, then run seed.sql.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- accounts: one row per account Arjun manages.
-- Columns are split into two ownership groups:
--   MANUAL  (Arjun owns)          : stage, owner_notes, last_contact_date, relationship_read
--   SIGNAL  (the system owns)     : warmth_score … signals_updated_at
-- The signal engine may ONLY write SIGNAL columns. This is enforced in
-- three layers: the app's writer (apply_account_signals RPC), the RPC
-- itself (it names only signal columns), and the guard trigger below
-- (which reverts any manual-column change made by the engine).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  domain             text,
  news_query         text not null,          -- what we search news for

  -- MANUAL — Arjun's own judgment. Never written by the system.
  stage              text not null default 'outreach'
                       check (stage in ('outreach','discovery','pilot','customer')),
  owner_notes        text,
  last_contact_date  date,
  relationship_read  text,

  -- SIGNAL — derived by the system from detected trigger events.
  warmth_score       numeric not null default 0,   -- 0–100, decays as signals age
  hot_score_3d       numeric not null default 0,   -- 0–100, signals from last 3 days only
  signal_count_3d    int     not null default 0,
  top_signal_type    text,
  signal_summary     text,                         -- one-line "what changed"
  outreach_angle     text,                         -- Gemini-drafted angle
  last_signal_at     timestamptz,
  signals_updated_at timestamptz,

  created_at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- signals: every trigger event detected, one row per (account, article).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.signals (
  id            bigserial primary key,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  url           text not null,
  title         text not null,
  source        text,
  published_at  timestamptz,
  signal_type   text not null,  -- headcount_expansion | leadership_hire | digitalisation | funding | operational_challenge | expansion | other
  strength      int  not null check (strength between 0 and 10),
  summary       text not null,
  detected_at   timestamptz not null default now(),
  unique (account_id, url)
);
create index if not exists signals_account_time on public.signals (account_id, published_at desc);

-- Articles Gemini already looked at and judged irrelevant — so we never pay to re-classify them.
create table if not exists public.seen_articles (
  account_id uuid not null references public.accounts(id) on delete cascade,
  url        text not null,
  seen_at    timestamptz not null default now(),
  primary key (account_id, url)
);

-- ─────────────────────────────────────────────────────────────
-- scan_runs: audit log of every scan / email.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.scan_runs (
  id               bigserial primary key,
  trigger          text not null,            -- cron-scan | cron-hotlist | manual
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  accounts_scanned int default 0,
  articles_fetched int default 0,
  new_signals      int default 0,
  email_sent       boolean default false,
  errors           jsonb default '[]'::jsonb
);

-- ─────────────────────────────────────────────────────────────
-- Guard trigger: if the signal engine is the writer, any change it
-- attempts on a MANUAL column is silently reverted to the old value.
-- ─────────────────────────────────────────────────────────────
create or replace function public.protect_manual_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.actor', true), '') = 'signal_engine' then
    new.name              := old.name;
    new.domain            := old.domain;
    new.news_query        := old.news_query;
    new.stage             := old.stage;
    new.owner_notes       := old.owner_notes;
    new.last_contact_date := old.last_contact_date;
    new.relationship_read := old.relationship_read;
  end if;
  return new;
end $$;

drop trigger if exists accounts_protect_manual on public.accounts;
create trigger accounts_protect_manual
  before update on public.accounts
  for each row execute function public.protect_manual_columns();

-- ─────────────────────────────────────────────────────────────
-- The ONLY way the signal engine writes to accounts.
-- ─────────────────────────────────────────────────────────────
create or replace function public.apply_account_signals(
  p_account_id      uuid,
  p_warmth_score    numeric,
  p_hot_score_3d    numeric,
  p_signal_count_3d int,
  p_top_signal_type text,
  p_signal_summary  text,
  p_outreach_angle  text,      -- null = keep the previous angle
  p_last_signal_at  timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.actor', 'signal_engine', true);  -- transaction-local
  update public.accounts set
    warmth_score       = p_warmth_score,
    hot_score_3d       = p_hot_score_3d,
    signal_count_3d    = p_signal_count_3d,
    top_signal_type    = p_top_signal_type,
    signal_summary     = p_signal_summary,
    outreach_angle     = coalesce(p_outreach_angle, outreach_angle),
    last_signal_at     = p_last_signal_at,
    signals_updated_at = now()
  where id = p_account_id;
end $$;

-- Lock tables down: no anon/public access. The app uses the service role on the server only.
alter table public.accounts      enable row level security;
alter table public.signals       enable row level security;
alter table public.seen_articles enable row level security;
alter table public.scan_runs     enable row level security;
revoke execute on function public.apply_account_signals(uuid,numeric,numeric,int,text,text,text,timestamptz) from public, anon, authenticated;
