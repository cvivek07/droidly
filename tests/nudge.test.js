const assert = require('assert');
const R = require('../assets/readiness.js');
const index = require('../assets/roadmap-index.json');
const now = new Date(2026, 9, 20, 10, 0, 0);
const mk = (o) => Object.assign({ v: 1, owner: 'u1', goals: { level: '2-5', company: 'product', minutes: 60, date: null, t: 1 }, ratings: {}, marks: {}, topics: {}, plan: null, jd: null, diag: { results: {}, written: {}, runs: [], last: 0 } }, o);
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const withPath = (o) => { const s = mk(o); s.plan = R.buildPath(index, s, now); return s; };
const mark = (s, ids, at) => ids.forEach(id => { s.marks[id] = { s: 'got_it', b: false, t: at == null ? now.getTime() - 1000 : at }; });

t('no goal: invites to build a plan', () => { assert.equal(R.nudgeFor(mk({ goals: null }), now).kind, 'start'); });
t('no path yet (or an old day-by-day plan): says the roadmap is ready', () => {
  assert.equal(R.nudgeFor(mk(), now).kind, 'plan_ready');
  assert.equal(R.nudgeFor(mk({ plan: { on: '2026-10-19', days: [{ tasks: [] }] } }), now).kind, 'plan_ready');
});
t('path: every topic once, weakest first, each with steps', () => {
  const s = withPath({ ratings: { coroutines: { v: 'new', t: 1 }, kotlin: { v: 'strong', t: 1 } } }), ids = s.plan.path.map(x => x.id);
  assert.equal(new Set(ids).size, Object.keys(index.topics).length);
  assert(ids.indexOf('coroutines') < ids.indexOf('kotlin'), 'a weak topic comes before a strong one');
  s.plan.path.forEach(e => { assert(e.steps.length >= 4 && e.steps.length <= 36, e.id + ' steps ' + e.steps.length); assert(e.min > 0); });
  assert.deepStrictEqual(JSON.stringify(R.buildPath(index, s, now).path), JSON.stringify(s.plan.path), 'deterministic');
});
t('nothing done: names the first topic and links to it', () => {
  const s = withPath(), n = R.nudgeFor(s, now), first = s.plan.path[0];
  assert.equal(n.kind, 'start_topic'); assert(n.headline.includes(first.name)); assert.equal(n.href, '/roadmap#topic/' + first.id);
  assert.equal(n.stats.topicsTotal, s.plan.path.length); assert.equal(n.stats.nextTitle, first.name);
});
t('partly done: continues the topic being worked on, with steps and time left', () => {
  const s = withPath(), p1 = s.plan.path[1];
  mark(s, p1.steps.slice(0, 2));
  const n = R.nudgeFor(s, now);
  assert.equal(n.kind, 'continue'); assert(n.headline.includes(p1.name)); assert.equal(n.href, '/roadmap#topic/' + p1.id);
  assert(n.detail.startsWith('2 of ' + p1.steps.length + ' steps done')); assert.equal(n.stats.done, 2);
  const pp = R.pathProgress(s); assert.equal(pp.items[1].status, 'in_progress'); assert.equal(pp.items[0].status, 'not_started');
});
t('marking complete moves on: nothing is locked, and completion is the person\'s choice', () => {
  const s = withPath(), path = s.plan.path;
  mark(s, path[0].steps);            // every step done, but not marked complete
  assert.equal(R.pathProgress(s).items[0].status, 'in_progress');
  s.topics[path[0].id] = { c: true, t: 1 };
  const pp = R.pathProgress(s); assert.equal(pp.items[0].status, 'completed'); assert.equal(pp.current.id, path[1].id); assert.equal(pp.items[1].status, 'next');
  assert.equal(pp.completed, 1);
  s.topics[path[2].id] = { c: true, t: 1 };   // completing out of order is allowed
  assert.equal(R.pathProgress(s).completed, 2);
});
t('all topics complete: skill check first, then review', () => {
  const s = withPath(); s.plan.path.forEach(e => { s.topics[e.id] = { c: true, t: 1 }; });
  assert.equal(R.nudgeFor(s, now).kind, 'check');
  s.diag.runs.push({ id: 'r1', t: 1, n: 12, ok: 6 }); assert.equal(R.nudgeFor(s, now).kind, 'done');
});
t('interview within two weeks is mentioned; further away is not', () => {
  assert(R.nudgeFor(withPath({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-10-27', t: 1 } }), now).headline.startsWith('7 days to your interview · '));
  assert(!/interview/.test(R.nudgeFor(withPath({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-12-27', t: 1 } }), now).headline));
  assert(R.nudgeFor(withPath({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-10-20', t: 1 } }), now).headline.startsWith('Interview day'));
});
t('away 3+ days: welcome back, pointing at the topic to pick up', () => {
  const s = withPath(), p = s.plan.path[0];
  mark(s, p.steps.slice(0, 3), now.getTime() - 5 * 86400000);
  const n = R.nudgeFor(s, now);
  assert.equal(n.kind, 'welcome_back'); assert.equal(n.href, '/roadmap#topic/' + p.id); assert(n.detail.includes(p.name));
  mark(s, p.steps.slice(0, 3), now.getTime() - 86400000); assert.equal(R.nudgeFor(s, now).kind, 'continue');
});
t('a rebuilt path keeps completed topics at the front in their old order', () => {
  const s = withPath(); const a = s.plan.path[4].id, b = s.plan.path[2].id;
  s.topics[a] = { c: true, t: 1 }; s.topics[b] = { c: true, t: 1 };
  const re = R.buildPath(index, s, now).path.map(x => x.id);
  assert.deepStrictEqual(re.slice(0, 2), [b, a]);
});
console.log(pass + ' passed');
