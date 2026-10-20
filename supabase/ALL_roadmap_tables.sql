-- ALL tables the roadmap needs, in one idempotent script (safe to run more than once).
-- Paste into the Supabase SQL editor and run. It is the three migrations below, concatenated, plus a schema reload.

-- ===== 20261018000000_readiness_roadmap.sql =====
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

-- ===== 20261020000000_skill_check.sql =====
-- Skill check (diagnostic): per-user quiz answers, quiz runs and the target job description's topic emphasis.
-- Additive only: creates 3 new tables, touches nothing existing.
-- Apply with:  supabase db push   (or paste into the SQL editor)
-- The app keeps working without these tables (results stay on the device) until this is applied.

-- Latest answer per quiz item (a retake overwrites, same model as question_marks).
create table if not exists public.diag_answers (
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     text not null check (item_id ~ '^[mw]-[a-z]{2,20}-[A-Za-z0-9_]{1,60}$'),
  kind        text not null check (kind in ('mcq','written')),
  topic       text not null check (topic ~ '^[a-z]{2,20}$'),
  ref         text check (ref is null or ref ~ '^[a-z]{2,20}:[A-Za-z0-9_]{1,60}$'),
  difficulty  text not null check (difficulty in ('easy','medium','hard')),
  correct     boolean,                                                     -- mcq only
  confidence  text check (confidence is null or confidence in ('sure','think','guess')),   -- mcq only
  score       numeric(4,2) check (score is null or (score >= 0 and score <= 1)),          -- written only
  updated_at  timestamptz not null default now(),
  primary key (user_id, item_id),
  check ((kind = 'mcq' and correct is not null and confidence is not null) or (kind = 'written' and score is not null))
);

-- One row per quiz sitting: drives "last taken" and which questions a retake picks.
create table if not exists public.diag_runs (
  user_id     uuid not null references auth.users(id) on delete cascade,
  run_id      text not null check (run_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  answered    int  not null check (answered between 0 and 200),
  correct     int  not null check (correct between 0 and 200),
  updated_at  timestamptz not null default now(),
  primary key (user_id, run_id)
);

-- What the pasted job description stresses. The pasted text itself is never stored.
create table if not exists public.user_jd (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  active      boolean not null default true,       -- false = the user removed it (kept so removal syncs across devices)
  level       text check (level is null or level in ('0-2','2-5','5+')),
  years       int  check (years is null or years between 0 and 40),
  topics      jsonb not null default '{}'::jsonb check (jsonb_typeof(topics) = 'object' and pg_column_size(topics) < 2000),
  updated_at  timestamptz not null default now()
);

alter table public.diag_answers enable row level security;
alter table public.diag_runs    enable row level security;
alter table public.user_jd      enable row level security;

-- Users can only see and change their own rows.
do $$
declare t text;
begin
  foreach t in array array['diag_answers','diag_runs','user_jd'] loop
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

create index if not exists diag_answers_user_topic_idx on public.diag_answers (user_id, topic);
create index if not exists diag_runs_user_updated_idx  on public.diag_runs (user_id, updated_at desc);

-- ===== 20261020010000_user_plan.sql =====
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

-- Make the new tables visible to the API immediately.
notify pgrst, 'reload schema';

-- ===== topic_progress (20261020020000) =====
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
