-- Machine coding: which problems a person has solved. Additive only: one new table.
create table if not exists public.coding_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  problem_id  text not null check (problem_id ~ '^[a-z0-9-]{2,60}$'),
  status      text not null default 'solved' check (status in ('solved')),
  solved_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, problem_id)
);
alter table public.coding_progress enable row level security;
drop policy if exists "own rows: select" on public.coding_progress;
drop policy if exists "own rows: insert" on public.coding_progress;
drop policy if exists "own rows: update" on public.coding_progress;
drop policy if exists "own rows: delete" on public.coding_progress;
create policy "own rows: select" on public.coding_progress for select to authenticated using (auth.uid() = user_id);
create policy "own rows: insert" on public.coding_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows: update" on public.coding_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.coding_progress for delete to authenticated using (auth.uid() = user_id);
