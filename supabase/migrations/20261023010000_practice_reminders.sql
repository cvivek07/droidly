-- Daily practice reminder emails. Opt-in, one row per person. Additive only.
create table if not exists public.practice_reminders (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  enabled     boolean not null default false,
  hour        smallint not null default 19 check (hour between 0 and 23),      -- local hour to send at
  tz          text not null default 'Asia/Kolkata' check (char_length(tz) between 1 and 64 and tz ~ '^[A-Za-z0-9_+\-/]+$'),
  token       uuid not null default gen_random_uuid(),                          -- for the unsubscribe link
  last_sent   date,                                                             -- local date of the last email
  updated_at  timestamptz not null default now()
);
create unique index if not exists practice_reminders_token_idx on public.practice_reminders (token);

alter table public.practice_reminders enable row level security;
drop policy if exists "own rows: select" on public.practice_reminders;
drop policy if exists "own rows: insert" on public.practice_reminders;
drop policy if exists "own rows: update" on public.practice_reminders;
create policy "own rows: select" on public.practice_reminders for select to authenticated using (auth.uid() = user_id);
create policy "own rows: insert" on public.practice_reminders for insert to authenticated with check (auth.uid() = user_id);
create policy "own rows: update" on public.practice_reminders for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- People may only set their own choice; token and last_sent are managed by the reminder function.
revoke insert, update on public.practice_reminders from authenticated, anon;
grant insert (user_id, enabled, hour, tz, updated_at) on public.practice_reminders to authenticated;
grant update (user_id, enabled, hour, tz, updated_at) on public.practice_reminders to authenticated;   -- user_id: the upsert re-sends it; RLS keeps it to their own row

-- Run the reminder function every hour (needs the pg_cron and pg_net extensions:
-- Supabase dashboard > Database > Extensions). Replace <CRON_SECRET> with the secret you set on the function.
--   select cron.schedule('practice-reminders', '2 * * * *', $$
--     select net.http_post(
--       url := 'https://dquheflcmcppldrnckzf.supabase.co/functions/v1/practice-reminders',
--       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'content-type', 'application/json'),
--       body := '{}'::jsonb);
--   $$);
