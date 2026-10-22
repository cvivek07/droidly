-- Doubts users send from an answer or a lesson ("Still confused? Ask a doubt").
-- Users can create and read their own doubts; replies and status are managed from the Supabase dashboard.
create table if not exists public.question_doubts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email  text,
  item_id     text not null check (char_length(item_id) <= 80),          -- e.g. "android:12" or "lesson:coroutines:3"
  item_title  text check (char_length(item_title) <= 300),
  page        text not null check (page in ('questions', 'lesson')),
  body        text not null check (char_length(btrim(body)) between 5 and 2000),
  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply       text,
  created_at  timestamptz not null default now()
);
create index if not exists question_doubts_user_idx on public.question_doubts (user_id, created_at desc);
create index if not exists question_doubts_item_idx on public.question_doubts (item_id);
create index if not exists question_doubts_status_idx on public.question_doubts (status, created_at desc);

alter table public.question_doubts enable row level security;
drop policy if exists "own doubts: select" on public.question_doubts;
drop policy if exists "own doubts: insert" on public.question_doubts;
create policy "own doubts: select" on public.question_doubts for select to authenticated using (auth.uid() = user_id);
create policy "own doubts: insert" on public.question_doubts for insert to authenticated
  with check (auth.uid() = user_id and status = 'open' and reply is null);
-- No update/delete policies: users cannot change or remove doubts after sending.

-- Spam guard: at most 20 doubts per user per 24 hours.
create or replace function public.question_doubts_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.question_doubts
        where user_id = new.user_id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'doubt_rate_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists question_doubts_rate_limit on public.question_doubts;
create trigger question_doubts_rate_limit before insert on public.question_doubts
  for each row execute function public.question_doubts_rate_limit();
