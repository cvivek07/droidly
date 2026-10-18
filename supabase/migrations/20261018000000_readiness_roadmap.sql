-- Readiness Roadmap: per-user goals, topic self-ratings, and question marks.
-- Additive only: creates 3 new tables, touches nothing existing.
-- Apply with:  supabase db push   (or paste into the SQL editor)

create table if not exists public.user_goals (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  level            text not null check (level in ('0-2','2-5','5+')),
  role             text not null default 'android',
  company_type     text not null check (company_type in ('product','startup','service')),
  minutes_per_day  int  not null check (minutes_per_day between 10 and 480),
  interview_date   date,
  updated_at       timestamptz not null default now()
);

create table if not exists public.topic_ratings (
  user_id     uuid not null references auth.users(id) on delete cascade,
  topic_id    text not null check (topic_id ~ '^[a-z]{2,20}$'),
  rating      text not null check (rating in ('strong','shaky','new')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists public.question_marks (
  user_id      uuid not null references auth.users(id) on delete cascade,
  question_id  text not null check (question_id ~ '^[a-z]{2,20}:[A-Za-z0-9_]{1,60}$'),
  status       text check (status in ('got_it','revisit')),
  bookmarked   boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.user_goals     enable row level security;
alter table public.topic_ratings  enable row level security;
alter table public.question_marks enable row level security;

-- Users can only see and change their own rows.
do $$
declare t text;
begin
  foreach t in array array['user_goals','topic_ratings','question_marks'] loop
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

-- Handy for later analytics (e.g. "users with >=10 marks").
create index if not exists question_marks_user_updated_idx on public.question_marks (user_id, updated_at desc);
