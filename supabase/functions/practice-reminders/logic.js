// Pure logic for the daily practice reminder (no network). Used by index.ts and by tests/reminders.test.mjs.

export const DAILY = 5;
export const INACTIVE_DAYS = 14;   // stop nudging people who have not practised for two weeks
export const SEND_WINDOW = 3;      // hours after the chosen time we may still send (if a cron run was missed)

export function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Local date (YYYY-MM-DD) and hour (0-23) for an instant in a time zone. */
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function daysBetween(a, b) {   // b - a in days
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

export function doneCount(row) { return row && row.results ? Object.keys(row.results).length : 0; }
export function isDone(row) { const len = row && row.items ? row.items.length : 0; return len > 0 && doneCount(row) >= Math.min(DAILY, len); }

/** Same rule as assets/practice.js: finished days in a row, counting today only once finished. */
export function streak(days, today) {
  const by = Object.fromEntries((days || []).map((r) => [r.day, r]));
  let d = isDone(by[today]) ? today : addDays(today, -1), n = 0;
  while (isDone(by[d])) { n++; d = addDays(d, -1); }
  return n;
}

/**
 * Should this person get a reminder right now?
 * rem: { enabled, hour, tz, last_sent, updated_at }, days: their practice_days rows (recent), now: Date
 * -> { send, reason, today, streak, todayRow }
 */
export function decide(rem, days, now) {
  if (!rem || !rem.enabled) return { send: false, reason: 'off' };
  const tz = validTz(rem.tz) ? rem.tz : 'Asia/Kolkata';
  const { ymd: today, hour } = localParts(now, tz);
  const late = hour - rem.hour;
  if (late < 0 || late >= SEND_WINDOW) return { send: false, reason: 'not_time', today };
  if (rem.last_sent && rem.last_sent >= today) return { send: false, reason: 'sent_today', today };
  const todayRow = (days || []).find((r) => r.day === today) || null;
  if (isDone(todayRow)) return { send: false, reason: 'done', today };
  // Last sign of interest: a day with any answers, or the day they turned reminders on.
  let last = rem.updated_at ? localParts(new Date(rem.updated_at), tz).ymd : null;
  for (const r of days || []) if (doneCount(r) > 0 && (!last || r.day > last)) last = r.day;
  if (!last || daysBetween(last, today) > INACTIVE_DAYS) return { send: false, reason: 'inactive', today };
  return { send: true, reason: 'ok', today, streak: streak(days, today), todayRow };
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/** The email. site: 'https://droidly.io', unsubUrl: one-click link. */
export function emailFor({ name, streak: st, todayRow, site, unsubUrl }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const done = doneCount(todayRow), of = todayRow && todayRow.items && todayRow.items.length ? Math.min(DAILY, todayRow.items.length) : DAILY;
  const url = site + '/practice?utm_source=reminder&utm_medium=email';
  const subject = done > 0 ? `${done} of ${of} done. Finish today's practice`
    : st > 0 ? `Keep your ${st}-day streak: today's 5 are ready` : `Your 5 Android questions for today are ready`;
  const lead = done > 0 ? `You have done ${done} of ${of} questions today. A few minutes more and today is complete.`
    : st > 0 ? `You have practised ${st} day${st > 1 ? 's' : ''} in a row. Today's 5 questions are ready, picked from your weak topics.`
    : `Today's 5 questions are ready, picked from your weak topics and your learning path. Answer each one out loud, then check the model answer.`;
  const text = `Hi ${first},\n\n${lead}\n\nStart: ${url}\n\nAbout 10 minutes. Questions you mark "Not yet" come back tomorrow.\n\n— Droidly\n\nStop these reminders: ${unsubUrl}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1117">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f5;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e8e5;border-radius:18px">
<tr><td style="padding:22px 26px 0;font-weight:800;font-size:18px;color:#0f1117">Droidly</td></tr>
<tr><td style="padding:16px 26px 0">
<div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2e6040">Daily practice</div>
<h1 style="margin:6px 0 10px;font-size:22px;line-height:1.3;color:#0f1117">${esc(st > 0 && !done ? `Day ${st + 1} of your streak` : done ? 'Almost there' : "Today's 5 are ready")}</h1>
<p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#374151">Hi ${esc(first)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">${esc(lead)}</p>
<a href="${esc(url)}" style="display:inline-block;background:#2e6040;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:100px">${done > 0 ? 'Finish today' : "Start today's 5"}</a>
<p style="margin:18px 0 0;font-size:13.5px;line-height:1.6;color:#5b6472">About 10 minutes. Questions you mark "Not yet" come back tomorrow, the rest after 3, 7 and 14 days.</p>
</td></tr>
<tr><td style="padding:22px 26px 22px"><div style="border-top:1px solid #eef1ef;padding-top:14px;font-size:12px;line-height:1.6;color:#8a929c">You get this because you turned on practice reminders at droidly.io. <a href="${esc(unsubUrl)}" style="color:#5b6472">Stop these reminders</a>.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}
