-- LeadFlow — initial schema
--
-- Creates profiles, searches, companies and leads, wires up the foreign keys,
-- enables Row Level Security on every table, and installs the trigger that
-- creates a profile row when a user signs up.
--
-- Reproducible: safe to re-run (all statements are IF NOT EXISTS / CREATE OR REPLACE).
-- Apply with the Supabase SQL editor, or `supabase db push` if you use the CLI.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- searches
-- ---------------------------------------------------------------------------
create table if not exists public.searches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  industry     text not null,
  location     text not null,
  company_size text not null,
  created_at   timestamptz not null default now()
);

create index if not exists searches_user_id_created_at_idx
  on public.searches (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  search_id      uuid not null references public.searches (id) on delete cascade,
  provider_id    text,
  name           text not null,
  domain         text,
  website        text,
  industry       text,
  location       text,
  employee_count integer,
  raw_data       jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists companies_user_id_idx
  on public.companies (user_id);
create index if not exists companies_search_id_idx
  on public.companies (search_id);

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  company_id         uuid not null references public.companies (id) on delete cascade,
  contact_name       text,
  email              text,
  email_status       text,
  fit_score          integer,
  ai_summary         text,
  ai_signals         jsonb,
  recommended_action text,
  confidence         numeric,
  unknowns           jsonb,
  analyzed_at        timestamptz,
  created_at         timestamptz not null default now(),

  -- Ranges match what the AI contract in lib/ai is allowed to return, so bad
  -- model output cannot be written even if the app-side validation is bypassed.
  constraint leads_fit_score_range
    check (fit_score is null or (fit_score between 0 and 100)),
  constraint leads_confidence_range
    check (confidence is null or (confidence between 0 and 1))
);

create index if not exists leads_user_id_idx
  on public.leads (user_id);
create index if not exists leads_company_id_idx
  on public.leads (company_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Every policy is expressed against the authenticated user id from the JWT.
-- `(select auth.uid())` is wrapped in a sub-select so Postgres evaluates it
-- once per query instead of once per row.
-- ---------------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.searches  enable row level security;
alter table public.companies enable row level security;
alter table public.leads     enable row level security;

-- profiles: the row id IS the user id.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- searches
drop policy if exists searches_select_own on public.searches;
create policy searches_select_own on public.searches
  for select using ((select auth.uid()) = user_id);

drop policy if exists searches_insert_own on public.searches;
create policy searches_insert_own on public.searches
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists searches_update_own on public.searches;
create policy searches_update_own on public.searches
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists searches_delete_own on public.searches;
create policy searches_delete_own on public.searches
  for delete using ((select auth.uid()) = user_id);

-- companies
drop policy if exists companies_select_own on public.companies;
create policy companies_select_own on public.companies
  for select using ((select auth.uid()) = user_id);

drop policy if exists companies_insert_own on public.companies;
create policy companies_insert_own on public.companies
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists companies_update_own on public.companies;
create policy companies_update_own on public.companies
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists companies_delete_own on public.companies;
create policy companies_delete_own on public.companies
  for delete using ((select auth.uid()) = user_id);

-- leads
drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads
  for select using ((select auth.uid()) = user_id);

drop policy if exists leads_insert_own on public.leads;
create policy leads_insert_own on public.leads
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists leads_update_own on public.leads;
create policy leads_update_own on public.leads
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists leads_delete_own on public.leads;
create policy leads_delete_own on public.leads
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants
--
-- Only signed-in users get table privileges; RLS then narrows each role to its
-- own rows.
--
-- Supabase's default privileges hand every new table in `public` to `anon`,
-- `authenticated` and `service_role`. RLS alone would already deny anonymous
-- requests (there is no policy for `anon`), but revoking removes the second
-- line of defence being the only one. `anon` is granted nothing here.
-- ---------------------------------------------------------------------------
revoke all on public.profiles  from anon;
revoke all on public.searches  from anon;
revoke all on public.companies from anon;
revoke all on public.leads     from anon;

grant select, insert, update, delete on public.profiles  to authenticated;
grant select, insert, update, delete on public.searches  to authenticated;
grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.leads     to authenticated;

-- ---------------------------------------------------------------------------
-- Profile creation
--
-- A SECURITY DEFINER trigger on auth.users is the recommended pattern: it runs
-- as the function owner, so it can insert the profile without the signing-up
-- user needing any privilege on public.profiles.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
