-- Which learning-path topics a person has marked complete. Additive only: one new table.
create table if not exists public.topic_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic_id    text not null check (char_length(topic_id) <= 40),
  completed   boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, topic_id)
);
alter table public.topic_progress enable row level security;

drop policy if exists "own rows: select" on public.topic_progress;
drop policy if exists "own rows: insert" on public.topic_progress;
drop policy if exists "own rows: update" on public.topic_progress;
drop policy if exists "own rows: delete" on public.topic_progress;
create policy "own rows: select" on public.topic_progress for select to authenticated using (auth.uid() = user_id);
create policy "own rows: insert" on public.topic_progress for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows: update" on public.topic_progress for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows: delete" on public.topic_progress for delete to authenticated using (auth.uid() = user_id);
