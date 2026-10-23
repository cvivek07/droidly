-- Daily practice ("Today's 5"). Additive only: two new tables.

-- Spaced repetition: when each question comes back. box 0 = missed (back tomorrow); higher box = longer gap.
create table if not exists public.practice_reviews (
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  text not null check (question_id ~ '^[a-z]{2,20}:[A-Za-z0-9_]{1,60}$'),
  box          smallint not null default 0 check (box between 0 and 6),
  due          date not null,
  reps         int  not null default 0 check (reps between 0 and 10000),
  last_result  text not null check (last_result in ('got_it','revisit')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index if not exists practice_reviews_due_idx on public.practice_reviews (user_id, due);

-- One row per day practised: the day's question set (same on every device) and how each one went.
-- "day" is the learner's local date.
create table if not exists public.practice_days (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  items       jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  results     jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object' and pg_column_size(results) < 4000),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.practice_reviews enable row level security;
alter table public.practice_days enable row level security;
do $$
declare t text;
begin
  foreach t in array array['practice_reviews','practice_days'] loop
    execute format('drop policy if exists "own rows: select" on public.%I', t);
    execute format('drop policy if exists "own rows: insert" on public.%I', t);
    execute format('drop policy if exists "own rows: update" on public.%I', t);
    execute format('drop policy if exists "own rows: delete" on public.%I', t);
    execute format('create policy "own rows: select" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own rows: delete" on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;
