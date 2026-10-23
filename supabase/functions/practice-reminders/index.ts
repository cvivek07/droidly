// practice-reminders: emails people who turned on daily practice reminders and have not finished today's set.
//
// Called two ways:
//   1. Every hour by pg_cron (header x-cron-secret) -> sends the reminders that are due.
//   2. Unsubscribe: POST ?unsub=<token> (one-click from the mail app) or POST {"unsub": "<token>"} (from droidly.io/practice).
//
// Secrets (supabase secrets set ...):
//   RESEND_API_KEY   from resend.com (free tier: 3,000 emails/month)
//   REMINDER_FROM    e.g. "Droidly <practice@droidly.io>" (domain verified in Resend)
//   CRON_SECRET      any long random string; the cron job sends it
//   SITE_URL         optional, default https://droidly.io
// Deploy: supabase functions deploy practice-reminders --no-verify-jwt
// Schedule: see supabase/migrations/20261023010000_practice_reminders.sql
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { decide, emailFor, addDays, localParts, validTz } from './logic.js'

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PER_RUN = 400

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ---- Unsubscribe (no sign-in needed: the token itself is the proof) ----
  let unsub = url.searchParams.get('unsub')
  if (!unsub && req.method === 'POST' && !req.headers.get('x-cron-secret')) {
    try { const b = await req.json(); unsub = b && b.unsub } catch { /* not json */ }
  }
  if (unsub) {
    if (!UUID.test(unsub)) return json({ ok: false, error: 'bad_token' }, 400)
    const { error } = await db.from('practice_reminders').update({ enabled: false, updated_at: new Date().toISOString() }).eq('token', unsub)
    return error ? json({ ok: false }, 500) : json({ ok: true })
  }

  // ---- Hourly run ----
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403)
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('REMINDER_FROM')
  if (!key || !from) return json({ error: 'email_not_configured' }, 500)
  const site = (Deno.env.get('SITE_URL') || 'https://droidly.io').replace(/\/$/, '')
  const fnUrl = Deno.env.get('SUPABASE_URL')! + '/functions/v1/practice-reminders'
  const now = new Date()

  const { data: rems, error } = await db.from('practice_reminders')
    .select('user_id,enabled,hour,tz,token,last_sent,updated_at').eq('enabled', true).limit(5000)
  if (error) return json({ error: error.message }, 500)

  // Cheap pre-filter (time window, already sent) before loading anyone's practice days.
  const due = (rems || []).filter((r) => {
    const p = localParts(now, validTz(r.tz) ? r.tz : 'Asia/Kolkata')
    const late = p.hour - r.hour
    return late >= 0 && late < 3 && !(r.last_sent && r.last_sent >= p.ymd)
  }).slice(0, MAX_PER_RUN)

  const stats: Record<string, number> = { checked: rems?.length || 0, due: due.length, sent: 0 }
  for (const r of due) {
    try {
      const today = localParts(now, validTz(r.tz) ? r.tz : 'Asia/Kolkata').ymd
      const { data: days } = await db.from('practice_days').select('day,items,results')
        .eq('user_id', r.user_id).gte('day', addDays(today, -60))
      const d = decide(r, days || [], now)
      if (!d.send) { stats[d.reason] = (stats[d.reason] || 0) + 1; continue }

      const { data: u } = await db.auth.admin.getUserById(r.user_id)
      const user = u?.user
      const email = user?.email
      if (!user || !email) { stats.no_email = (stats.no_email || 0) + 1; continue }
      const meta = (user.user_metadata || {}) as Record<string, string>
      const unsubPage = `${site}/practice?unsubscribe=${r.token}`
      const mail = emailFor({ name: meta.full_name || meta.name || email.split('@')[0], streak: d.streak, todayRow: d.todayRow, site, unsubUrl: unsubPage })

      const res = await fetch(Deno.env.get('RESEND_API_URL') || 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [email], subject: mail.subject, html: mail.html, text: mail.text,
          headers: { 'List-Unsubscribe': `<${fnUrl}?unsub=${r.token}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      })
      if (!res.ok) { console.error('resend', res.status, await res.text()); stats.failed = (stats.failed || 0) + 1; continue }
      await db.from('practice_reminders').update({ last_sent: d.today }).eq('user_id', r.user_id)
      stats.sent++
    } catch (e) {
      console.error('reminder', r.user_id, e)
      stats.failed = (stats.failed || 0) + 1
    }
  }
  return json(stats)
})
