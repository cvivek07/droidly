-- Today's study plan, stored per user so it is the same on every device and survives sign-out/sign-in.
-- Additive only: one new table.
create table if not exists public.user_plan (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  plan        jsonb not null check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) < 100000),
  updated_at  timestamptz not null default now()
);
alter table public.user_plan enable row level security;

drop policy if exists "own rows: select" on public.user_plan;
drop policy if exists "own rows: insert" on public.user_plan;
drop policy if exists "own rows: update" on public.user_plan;
drop policy if exists "own rows: delete" on public.user_plan;
create policy "own rows: select" on public.user_plan for select to authenticated using (auth.uid() = user_id);
create policy "own rows: insert" on public.user_plan for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows: update" on public.user_plan for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.user_plan for delete to authenticated using (auth.uid() = user_id);
