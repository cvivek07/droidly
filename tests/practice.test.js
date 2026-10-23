const assert = require('assert');
const P = require('../assets/practice.js');
const R = require('../assets/readiness.js');
const index = require('../assets/roadmap-index.json');
const now = new Date(2026, 9, 23, 9, 0, 0), today = '2026-10-23';
const mk = (o) => Object.assign({ v: 1, owner: 'u1', goals: { level: '2-5', company: 'product', minutes: 60, date: null, t: 1 }, ratings: {}, marks: {}, topics: {}, plan: null, jd: null, diag: { results: {}, written: {}, runs: [], last: 0 } }, o);
const withPath = (o) => { const s = mk(o); s.plan = R.buildPath(index, s, now); return s; };
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const ids = (xs) => xs.map(x => x.id);

t('new learner with a path: 5 new questions from the first topic of the path, in order', () => {
  const s = withPath(), first = s.plan.path[0];
  const p = P.pick(index, s, {}, today);
  assert.equal(p.length, 5); p.forEach(x => assert.equal(x.why, 'new'));
  assert.deepStrictEqual(ids(p), first.steps.slice(0, 5));
});
t('no path yet: core questions, never system design', () => {
  const p = P.pick(index, mk({ goals: null }), {}, today);
  assert.equal(p.length, 5); p.forEach(x => { assert(!x.id.startsWith('sysdesign')); assert(index.topics.android.items.find(i => i.id === x.id).m === 1); });
});
t('skips questions already done, and completed topics', () => {
  const s = withPath(), first = s.plan.path[0], second = s.plan.path[1];
  first.steps.slice(0, 3).forEach(id => { s.marks[id] = { s: 'got_it', b: false, t: 1 }; });
  assert.deepStrictEqual(ids(P.pick(index, s, {}, today)), first.steps.slice(3, 8).filter(Boolean).slice(0, 5));
  s.topics[first.id] = { c: true, t: 1 };
  assert.equal(P.pick(index, s, {}, today)[0].id, second.steps[0]);
});
t('due reviews come first (oldest due first) but at least 2 new questions stay', () => {
  const s = withPath(), rev = {};
  ['kotlin:1', 'kotlin:2', 'kotlin:3', 'kotlin:4', 'kotlin:5', 'kotlin:6'].forEach((id, i) => { rev[id] = { box: 1, due: '2026-10-2' + (i % 3) }; });
  rev['kotlin:9'] = { box: 2, due: '2026-10-30' };   // not due yet
  const p = P.pick(index, s, rev, today);
  assert.equal(p.length, 5);
  assert.deepStrictEqual(p.map(x => x.why), ['due', 'due', 'due', 'new', 'new']);
  assert(!ids(p).includes('kotlin:9'));
  assert.equal(p[0].due, undefined); assert(['kotlin:1', 'kotlin:4'].includes(p[0].id), 'earliest due first');
});
t('"Revisit" marks and skill-check misses count as reviews', () => {
  const s = withPath();
  s.marks['compose:7'] = { s: 'revisit', b: false, t: 5 };
  s.diag.results['m-coroutines-x'] = { topic: 'coroutines', ref: 'coroutines:4', d: 'medium', c: false, k: 'think', t: 1 };
  s.diag.results['m-coroutines-y'] = { topic: 'coroutines', ref: 'coroutines:5', d: 'medium', c: true, k: 'think', t: 1 };
  const p = P.pick(index, s, {}, today);
  assert.deepStrictEqual(p.slice(0, 2), [{ id: 'compose:7', why: 'revisit' }, { id: 'coroutines:4', why: 'missed' }]);
  assert.equal(p.length, 5);
});
t('"5 more" excludes today\'s questions', () => {
  const s = withPath(), a = P.pick(index, s, {}, today), ex = {}; a.forEach(x => { ex[x.id] = 1; });
  const b = P.pick(index, s, {}, today, { exclude: ex });
  assert.equal(b.length, 5); b.forEach(x => assert(!ex[x.id]));
});
t('schedule: Got it moves to longer gaps, Not yet brings it back tomorrow', () => {
  let r = P.schedule(null, 'got_it', today); assert.deepStrictEqual(r, { box: 1, due: '2026-10-26', reps: 1 });
  r = P.schedule(r, 'got_it', '2026-10-26'); assert.deepStrictEqual(r, { box: 2, due: '2026-11-02', reps: 2 });
  r = P.schedule(r, 'revisit', '2026-11-02'); assert.deepStrictEqual(r, { box: 0, due: '2026-11-03', reps: 3 });
  r = P.schedule({ box: 6, reps: 9 }, 'got_it', today); assert.equal(r.box, 6); assert.equal(r.due, '2027-01-21');
  assert.equal(P.schedule(null, 'got_it', '2026-12-31').due, '2027-01-03', 'crosses the year');
});
const day = (d, n, of) => ({ day: d, items: Array.from({ length: of || 5 }, (_, i) => ({ id: 'kotlin:' + (i + 1) })), results: Object.fromEntries(Array.from({ length: n }, (_, i) => ['kotlin:' + (i + 1), 'got_it'])) });
t('streak: counts finished days in a row; today counts once finished', () => {
  const days = [day('2026-10-20', 5), day('2026-10-21', 5), day('2026-10-22', 5)];
  assert.deepStrictEqual(P.streak(days, today), { current: 3, doneToday: false });
  assert.deepStrictEqual(P.streak(days.concat(day(today, 2)), today), { current: 3, doneToday: false });
  assert.deepStrictEqual(P.streak(days.concat(day(today, 5)), today), { current: 4, doneToday: true });
  assert.equal(P.streak([day('2026-10-20', 5), day('2026-10-22', 4)], today).current, 0, 'unfinished yesterday breaks it');
  assert.equal(P.streak([day('2026-10-22', 10, 10)], today).current, 1, 'a day with "5 more" counts once the first 5 are done... ');
  assert.equal(P.streak([day('2026-10-22', 3, 3)], today).current, 1, 'a short set counts when all of it is done');
});
t('week: last 7 days, oldest first, with today flagged', () => {
  const w = P.week([day('2026-10-21', 5), day(today, 1)], today);
  assert.equal(w.length, 7); assert.equal(w[0].day, '2026-10-17'); assert(w[6].isToday && w[6].started && !w[6].done);
  assert(w[4].done); assert.equal(w[6].label, 'F');
});
console.log(pass + ' passed');
