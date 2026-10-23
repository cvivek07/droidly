import assert from 'assert';
import { decide, emailFor, localParts, streak, validTz } from '../supabase/functions/practice-reminders/logic.js';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
// 23 Oct 2026, 13:35 UTC = 19:05 in India
const now = new Date(Date.UTC(2026, 9, 23, 13, 35));
const rem = (o) => Object.assign({ enabled: true, hour: 19, tz: 'Asia/Kolkata', last_sent: null, updated_at: '2026-10-20T10:00:00Z' }, o);
const day = (d, n, of = 5) => ({ day: d, items: Array.from({ length: of }, (_, i) => ({ id: 'kotlin:' + (i + 1) })), results: Object.fromEntries(Array.from({ length: n }, (_, i) => ['kotlin:' + (i + 1), 'got_it'])) });

t('local time: India and US time zones', () => {
  assert.deepStrictEqual(localParts(now, 'Asia/Kolkata'), { ymd: '2026-10-23', hour: 19 });
  assert.deepStrictEqual(localParts(now, 'America/Los_Angeles'), { ymd: '2026-10-23', hour: 6 });
  assert(validTz('Europe/London')); assert(!validTz('Mars/Base'));
});
t('sends at the chosen hour when today is not finished', () => {
  const d = decide(rem(), [day('2026-10-22', 5), day('2026-10-21', 5)], now);
  assert.equal(d.send, true); assert.equal(d.today, '2026-10-23'); assert.equal(d.streak, 2);
});
t('also within 2 hours after (missed cron run), never before or later', () => {
  assert.equal(decide(rem({ hour: 18 }), [day('2026-10-22', 5)], now).send, true);
  assert.equal(decide(rem({ hour: 17 }), [day('2026-10-22', 5)], now).send, true);
  assert.equal(decide(rem({ hour: 16 }), [day('2026-10-22', 5)], now).reason, 'not_time');
  assert.equal(decide(rem({ hour: 20 }), [day('2026-10-22', 5)], now).reason, 'not_time');
});
t('skips: turned off, already sent today, already finished today', () => {
  assert.equal(decide(rem({ enabled: false }), [], now).reason, 'off');
  assert.equal(decide(rem({ last_sent: '2026-10-23' }), [day('2026-10-22', 5)], now).reason, 'sent_today');
  assert.equal(decide(rem(), [day('2026-10-23', 5)], now).reason, 'done');
  assert.equal(decide(rem(), [day('2026-10-23', 2)], now).send, true, 'half done still gets a nudge');
});
t('stops after 14 days without practice; a fresh opt-in counts as activity', () => {
  assert.equal(decide(rem({ updated_at: '2026-09-01T00:00:00Z' }), [day('2026-10-01', 5)], now).reason, 'inactive');
  assert.equal(decide(rem({ updated_at: '2026-09-01T00:00:00Z' }), [day('2026-10-10', 3)], now).send, true);
  assert.equal(decide(rem({ updated_at: '2026-10-22T09:00:00Z' }), [], now).send, true, 'just opted in, never practised');
});
t('streak matches the site rule', () => {
  assert.equal(streak([day('2026-10-21', 5), day('2026-10-22', 5)], '2026-10-23'), 2);
  assert.equal(streak([day('2026-10-21', 5), day('2026-10-22', 5), day('2026-10-23', 5)], '2026-10-23'), 3);
  assert.equal(streak([day('2026-10-21', 5), day('2026-10-22', 1)], '2026-10-23'), 0);
});
t('email: subject fits the situation; name escaped; unsubscribe link present', () => {
  const base = { site: 'https://droidly.io', unsubUrl: 'https://droidly.io/practice?unsubscribe=abc' };
  assert.equal(emailFor({ ...base, name: 'Vivek Choudhary', streak: 0, todayRow: null }).subject, "Your 5 Android questions for today are ready");
  assert.equal(emailFor({ ...base, name: 'V', streak: 4, todayRow: null }).subject, "Keep your 4-day streak: today's 5 are ready");
  assert.equal(emailFor({ ...base, name: 'V', streak: 4, todayRow: day('2026-10-23', 3) }).subject, "3 of 5 done. Finish today's practice");
  const m = emailFor({ ...base, name: '<b>x</b>', streak: 0, todayRow: null });
  assert(!m.html.includes('<b>x</b>')); assert(m.html.includes('practice?unsubscribe=abc')); assert(m.text.includes('Stop these reminders'));
  assert(m.html.includes('utm_source=reminder'));
});
console.log(pass + ' passed');
