-- Minimal Group Paradigm live demo: database schema.
-- Run once in the Supabase SQL editor (or via a migration). Safe to re-run.
-- Matrices are defined client-side (index.html CONFIG); the database only
-- stores the canonical column c (1..13) and derives lean = 7 - c.

-- Requires pgcrypto's gen_random_bytes (enabled by default on Supabase; do NOT
-- run `create extension pgcrypto` there, it can hang in the SQL tool).

-- ---------------------------------------------------------------- tables
create table if not exists public.submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  token        text not null unique check (char_length(token) between 8 and 64),
  color        text not null check (color in ('purple','green')),
  matrix_order text not null check (matrix_order in ('AB','BA')),
  a_row_order  text check (a_row_order in ('ingroup_first','outgroup_first')),
  a_direction  text check (a_direction in ('asc','desc')),
  b_row_order  text check (b_row_order in ('ingroup_first','outgroup_first')),
  b_direction  text check (b_direction in ('asc','desc')),
  a_col        int  not null check (a_col between 1 and 13),
  b_col        int  not null check (b_col between 1 and 13),
  a_lean       int  generated always as (7 - a_col) stored,
  b_lean       int  generated always as (7 - b_col) stored
);

-- Single-row settings table. Never readable by anon.
create table if not exists public.config (
  id                boolean primary key default true check (id),  -- enforces one row
  instructor_key    text not null,
  submissions_open  boolean not null default true
);

-- Random instructor key, generated in the database so it never lives in a file.
-- Retrieve it with:  select instructor_key from public.config;
insert into public.config (instructor_key)
values (encode(gen_random_bytes(12), 'hex'))
on conflict (id) do nothing;

-- ------------------------------------------------------------------- RLS
alter table public.submissions enable row level security;
alter table public.config      enable row level security;
-- config: RLS on and no policies => no direct access for anon/authenticated.

revoke all on public.submissions from anon, authenticated;
revoke all on public.config      from anon, authenticated;

-- Column-level insert grant: generated/default columns can't be supplied.
grant insert (token, color, matrix_order, a_row_order, a_direction,
              b_row_order, b_direction, a_col, b_col)
  on public.submissions to anon;

-- INSERT ... ON CONFLICT (token) needs SELECT on the arbiter column AND a SELECT
-- policy that passes for the new row (verified on Postgres 17). This policy only
-- matches rows created in the *current transaction*, so anon can never read any
-- previously stored row; `select *` is still refused (no privilege on other columns).
grant select (token) on public.submissions to anon;
drop policy if exists anon_select_own_txn_only on public.submissions;
create policy anon_select_own_txn_only on public.submissions
  for select to anon
  using (created_at = now());

-- Policies cannot read config as anon, so use a definer helper.
create or replace function public.submissions_are_open()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select coalesce((select submissions_open from public.config limit 1), false) $$;

revoke all on function public.submissions_are_open() from public;
grant execute on function public.submissions_are_open() to anon, authenticated;

drop policy if exists anon_insert_when_open on public.submissions;
create policy anon_insert_when_open on public.submissions
  for insert to anon
  with check (
    public.submissions_are_open()
    and a_col between 1 and 13
    and b_col between 1 and 13
  );

-- ------------------------------------------------------- instructor RPCs
create or replace function public._check_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_key is null or not exists (select 1 from public.config where instructor_key = p_key) then
    raise exception 'invalid instructor key' using errcode = '28000';
  end if;
end $$;
revoke all on function public._check_key(text) from public, anon, authenticated;

create or replace function public.instructor_results(p_key text)
returns table (
  created_at   timestamptz,
  color        text,
  matrix_order text,
  a_row_order  text,
  a_direction  text,
  b_row_order  text,
  b_direction  text,
  a_col        int,
  b_col        int,
  a_lean       int,
  b_lean       int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._check_key(p_key);
  return query
    select s.created_at, s.color, s.matrix_order, s.a_row_order, s.a_direction,
           s.b_row_order, s.b_direction, s.a_col, s.b_col, s.a_lean, s.b_lean
    from public.submissions s
    order by s.created_at;
end $$;

create or replace function public.instructor_status(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._check_key(p_key);
  return (select submissions_open from public.config limit 1);
end $$;

create or replace function public.set_submissions_open(p_key text, p_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._check_key(p_key);
  update public.config set submissions_open = p_open where true;
  return p_open;
end $$;

create or replace function public.reset_data(p_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._check_key(p_key);
  delete from public.submissions where true;
end $$;

-- Students may ask whether the session is open (reveals nothing else).
create or replace function public.submissions_status()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.submissions_are_open() $$;

revoke all on function public.instructor_results(text)         from public;
revoke all on function public.instructor_status(text)          from public;
revoke all on function public.set_submissions_open(text, boolean) from public;
revoke all on function public.reset_data(text)                 from public;
revoke all on function public.submissions_status()             from public;
grant execute on function public.instructor_results(text)         to anon, authenticated;
grant execute on function public.instructor_status(text)          to anon, authenticated;
grant execute on function public.set_submissions_open(text, boolean) to anon, authenticated;
grant execute on function public.reset_data(text)                 to anon, authenticated;
grant execute on function public.submissions_status()             to anon, authenticated;
