// weekly-doubts-digest: one email a week with
//   1) doubts learners escalated ("Still unclear") — the only ones that need you
//   2) the questions/lessons with the most doubts — the content worth rewriting
//   3) how often the AI answer helped
//
// Secrets:  RESEND_API_KEY (resend.com, free tier is enough), DIGEST_TO (your email),
//           DIGEST_FROM (e.g. "Droidly <digest@droidly.io>", domain verified in Resend),
//           CRON_SECRET (any random string; the cron job sends it)
// Deploy:   supabase functions deploy weekly-doubts-digest --no-verify-jwt
// Schedule (SQL editor, needs pg_cron + pg_net enabled), Mondays 09:00 IST = 03:30 UTC:
//   select cron.schedule('weekly-doubts-digest', '30 3 * * 1', $$
//     select net.http_post(
//       url := 'https://dquheflcmcppldrnckzf.supabase.co/functions/v1/weekly-doubts-digest',
//       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'));
//   $$);
// Without RESEND_API_KEY it just returns the digest as JSON (handy for a manual check).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const { data: rows, error } = await db.from('question_doubts')
    .select('item_id,item_title,page,body,ai_reply,helpful,escalated,status,user_email,created_at')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(2000)
  if (error) return new Response(error.message, { status: 500 })

  const all = rows ?? []
  const escalated = all.filter((r) => r.escalated && r.status === 'open')
  const byItem = new Map<string, { title: string; n: number; esc: number }>()
  for (const r of all) {
    const e = byItem.get(r.item_id) ?? { title: r.item_title ?? r.item_id, n: 0, esc: 0 }
    e.n++; if (r.escalated) e.esc++; byItem.set(r.item_id, e)
  }
  const top = [...byItem.values()].sort((a, b) => b.n - a.n).slice(0, 10)
  const rated = all.filter((r) => r.helpful !== null)
  const helped = rated.filter((r) => r.helpful).length

  const html = `<div style="font-family:system-ui,sans-serif;color:#0f1117;max-width:640px">
<h2 style="color:#2e6040">Droidly doubts, last 7 days</h2>
<p>${all.length} doubts · ${escalated.length} need you · AI helped ${helped}/${rated.length} who rated</p>
<h3>Need a reply (${escalated.length})</h3>
${escalated.map((r) => `<div style="border:1px solid #e3e8e5;border-radius:10px;padding:10px;margin:8px 0">
<b>${esc(r.item_title ?? r.item_id)}</b><br><span style="color:#5b6472">${esc(r.user_email ?? '')} · ${r.created_at.slice(0, 10)}</span>
<p>${esc(r.body)}</p>${r.ai_reply ? `<details><summary>AI said</summary><p>${esc(r.ai_reply)}</p></details>` : ''}
<a href="mailto:${esc(r.user_email ?? '')}?subject=${encodeURIComponent('Re: your doubt on ' + (r.item_title ?? ''))}">Reply</a></div>`).join('') || '<p>None 🎉</p>'}
<h3>Most doubted (rewrite these first)</h3>
<ol>${top.map((t) => `<li>${esc(t.title)} — ${t.n} doubts, ${t.esc} still unclear</li>`).join('')}</ol></div>`

  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return Response.json({ total: all.length, escalated, top })

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('DIGEST_FROM'), to: [Deno.env.get('DIGEST_TO')],
      subject: `Droidly doubts: ${escalated.length} need you, ${all.length} this week`, html,
    }),
  })
  return new Response(await r.text(), { status: r.status })
})
