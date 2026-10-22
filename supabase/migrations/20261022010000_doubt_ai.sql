-- Doubts v2: instant AI explanation + "Still unclear" escalation.
-- The AI reply is written only by the ask-doubt Edge Function (service role).
-- Users may only flip `helpful` / `escalated` on their own rows.

alter table public.question_doubts
  add column if not exists ai_reply     text check (ai_reply is null or char_length(ai_reply) <= 6000),
  add column if not exists ai_model     text,
  add column if not exists helpful      boolean,
  add column if not exists escalated    boolean not null default false,
  add column if not exists escalated_at timestamptz;

create index if not exists question_doubts_escalated_idx
  on public.question_doubts (escalated, created_at desc) where escalated;

-- Client inserts (fallback path when the function is down) can't fake an AI reply.
drop policy if exists "own doubts: insert" on public.question_doubts;
create policy "own doubts: insert" on public.question_doubts
  for insert to authenticated
  with check (auth.uid() = user_id and status = 'open' and reply is null and ai_reply is null);

-- Users can update their own rows, but only these two columns (column grants).
drop policy if exists "own doubts: feedback" on public.question_doubts;
create policy "own doubts: feedback" on public.question_doubts
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on public.question_doubts from authenticated, anon;
grant update (helpful, escalated) on public.question_doubts to authenticated;

-- Stamp escalation time; once escalated it stays escalated.
create or replace function public.question_doubts_escalate_stamp()
returns trigger language plpgsql as $$
begin
  if old.escalated and not new.escalated then new.escalated := true; end if;
  if new.escalated and not old.escalated then new.escalated_at := now(); end if;
  return new;
end $$;

drop trigger if exists question_doubts_escalate_stamp on public.question_doubts;
create trigger question_doubts_escalate_stamp
  before update on public.question_doubts
  for each row execute function public.question_doubts_escalate_stamp();
