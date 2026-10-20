const assert = require('assert');
const R = require('../assets/readiness.js');
const index = require('../assets/roadmap-index.json');
const now = new Date(2026, 9, 20, 10, 0, 0);
const mk = (o) => Object.assign({ v: 1, owner: 'u1', goals: { level: '2-5', company: 'product', minutes: 60, date: null, t: 1 }, ratings: {}, marks: {}, plan: null, jd: null, diag: { results: {}, written: {}, runs: [], last: 0 } }, o);
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const withPlan = (o) => { const s = mk(o); s.plan = R.buildPlan(index, s, { today: now }); s.plan.on = R.ymd(now); return s; };

t('no goal: invites to build a plan', () => { assert.equal(R.nudgeFor(mk({ goals: null }), now).kind, 'start'); });
t('stale or missing plan: says today\'s plan is ready', () => { assert.equal(R.nudgeFor(mk(), now).kind, 'plan_ready'); });
t('nothing done: names the first task and the total time, and links straight to it', () => {
  const s = withPlan(), n = R.nudgeFor(s, now), first = s.plan.days[0].tasks[0];
  assert.equal(n.kind, 'start_today'); assert(n.detail.includes(first.title)); assert.equal(n.href, first.href); assert(/\d+-min plan/.test(n.headline));
});
t('partly done: shows progress, time left and the next undone task', () => {
  const s = withPlan(), tasks = s.plan.days[0].tasks;
  s.marks[tasks[0].id] = { s: 'got_it', b: false, t: Date.now() + 1000 };
  const n = R.nudgeFor(s, now);
  assert.equal(n.kind, 'continue'); assert(n.headline.startsWith('1 of ' + tasks.length + ' done')); assert.equal(n.href, tasks[1].href); assert(n.detail.includes(tasks[1].title));
});
t('all done, no skill check yet: points to the skill check; after it, to weak areas', () => {
  const s = withPlan(); s.plan.days[0].tasks.forEach(x => { s.marks[x.id] = { s: 'got_it', b: false, t: Date.now() + 1000 }; });
  assert.equal(R.nudgeFor(s, now).kind, 'check');
  s.diag.runs.push({ id: 'r1', t: 1, n: 12, ok: 6 }); assert.equal(R.nudgeFor(s, now).kind, 'done');
});
t('interview within two weeks is mentioned; further away is not', () => {
  assert(R.nudgeFor(withPlan({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-10-27', t: 1 } }), now).headline.startsWith('7 days to your interview · '));
  assert(!/interview/.test(R.nudgeFor(withPlan({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-12-27', t: 1 } }), now).headline));
  assert(R.nudgeFor(withPlan({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-10-20', t: 1 } }), now).headline.startsWith('Interview day'));
});
t('away 3+ days with nothing done today: welcome back with the shortest task', () => {
  const s = withPlan(), tasks = s.plan.days[0].tasks;
  s.marks['x:1'] = { s: 'got_it', b: false, t: now.getTime() - 5 * 86400000 };
  const n = R.nudgeFor(s, now), quick = tasks.slice().sort((a, b) => a.min - b.min)[0];
  assert.equal(n.kind, 'welcome_back'); assert.equal(n.href, quick.href); assert(n.detail.includes(quick.title));
  s.marks['x:1'].t = now.getTime() - 86400000; assert.equal(R.nudgeFor(s, now).kind, 'start_today');
  const stale = mk(); stale.marks['x:1'] = { s: 'got_it', b: false, t: now.getTime() - 9 * 86400000 };
  assert.equal(R.nudgeFor(stale, now).kind, 'welcome_back'); assert.equal(R.nudgeFor(stale, now).href, '/roadmap');
});

console.log(pass + ' passed');
