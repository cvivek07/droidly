const assert = require('assert');
const R = require('../assets/readiness.js');
const index = require('../assets/roadmap-index.json');
const DAY = 86400000;
const mk = (o) => Object.assign({ v: 1, owner: null, goals: null, ratings: {}, marks: {}, plan: null }, o);
const now = new Date(2026, 9, 18, 10, 0, 0);
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };

t('empty state: low confidence, plan fills the daily budget', () => {
  const s = mk({ goals: { level: '2-5', company: 'product', minutes: 60, date: null } });
  const r = R.readiness(index, s); assert.equal(r.confidence, 'Low'); assert.equal(r.score, 35);
  const p = R.buildPlan(index, s, { today: now }); assert.equal(p.days.length, 7);
  p.days.forEach(d => { assert(d.minutes <= 60 + 0, 'over budget ' + d.minutes); assert(d.minutes >= 45, 'underfilled ' + d.minutes); });
});
t('no task is scheduled twice across the week', () => {
  const s = mk({ goals: { level: '5+', company: 'product', minutes: 120, date: null } });
  const ids = R.buildPlan(index, s, { today: now }).days.flatMap(d => d.tasks.map(x => x.id));
  assert.equal(new Set(ids).size, ids.length);
});
t('weak topic gets more tasks than a strong one', () => {
  const s = mk({ goals: { level: '2-5', company: 'product', minutes: 60 }, ratings: { coroutines: { v: 'new', t: 1 }, kotlin: { v: 'strong', t: 1 } } });
  const c = {}; R.buildPlan(index, s, { today: now }).days.forEach(d => d.tasks.forEach(x => c[x.topic] = (c[x.topic] || 0) + 1));
  assert((c.coroutines || 0) > (c.kotlin || 0), JSON.stringify(c));
});
t('marks move mastery: 8 got-it answers push a "new" topic up', () => {
  const marks = {}; for (let i = 1; i <= 8; i++) marks['kotlin:' + i] = { s: 'got_it', b: false, t: 1 };
  const s = mk({ ratings: { kotlin: { v: 'new', t: 1 } }, marks });
  assert(R.topicStats(index, s).kotlin.mastery >= 75);
  const s2 = mk({ ratings: { kotlin: { v: 'new', t: 1 } } }); assert.equal(R.topicStats(index, s2).kotlin.mastery, 20);
});
t('revisit items return after a day, not before', () => {
  const m = { 'kotlin:3': { s: 'revisit', b: false, t: now.getTime() - 100 } };
  const s = mk({ goals: { level: '2-5', company: 'product', minutes: 60 }, marks: m });
  const p = R.buildPlan(index, s, { today: now });
  assert(!p.days[0].tasks.some(x => x.type === 'revision'), 'due too early');
  assert(p.days[1].tasks.some(x => x.id === 'kotlin:3' && x.type === 'revision'), 'not due on day 2');
});
t('interview in 3 days compresses the plan; past date gives a note', () => {
  const s = mk({ goals: { level: '2-5', company: 'product', minutes: 60, date: R.ymd(new Date(2026, 9, 21)) } });
  const p = R.buildPlan(index, s, { today: now }); assert.equal(p.days.length, 3); assert(p.note);
  const s2 = mk({ goals: { level: '2-5', company: 'product', minutes: 60, date: '2026-10-01' } });
  assert.equal(R.buildPlan(index, s2, { today: now }).days.length, 1);
});
t('system design: scheduled for 5+ with >=45 min, never for 0-2 or 30 min', () => {
  const sd = (g) => R.buildPlan(index, mk({ goals: g }), { today: now }).days.flatMap(d => d.tasks).filter(x => x.type === 'sysdesign').length;
  assert(sd({ level: '5+', company: 'product', minutes: 120 }) >= 2);
  assert.equal(sd({ level: '0-2', company: 'product', minutes: 120 }), 0);
  assert.equal(sd({ level: '5+', company: 'product', minutes: 30 }), 0);
});
t('carry keeps already-done tasks and does not re-pick them', () => {
  const s = mk({ goals: { level: '2-5', company: 'product', minutes: 60 } });
  const carry = [{ id: 'kotlin:1', type: 'study', topic: 'kotlin', title: 'x', diff: 'easy', min: 4, href: '/' }];
  const p = R.buildPlan(index, s, { today: now, carry });
  assert.equal(p.days[0].tasks[0].id, 'kotlin:1');
  assert.equal(p.days.flatMap(d => d.tasks).filter(x => x.id === 'kotlin:1').length, 1);
});
t('deterministic', () => {
  const s = mk({ goals: { level: '2-5', company: 'startup', minutes: 60 } });
  assert.deepEqual(R.buildPlan(index, s, { today: now }), R.buildPlan(index, s, { today: now }));
});
t('store: toggle semantics + sync merge (newer wins, local-only pushed)', async () => {});
console.log(pass + ' passed');

// async store tests with a fake backend
(async () => {
  const mem = {}; const ls = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  R.configure({ storage: ls, getSession: async () => ({ token: 'tok', uid: 'u1' }) });
  R._setState(mk());
  R.setMark('kotlin:1', { s: 'got_it' }); assert.equal(R.get().marks['kotlin:1'].s, 'got_it');
  R.setMark('kotlin:1', { s: 'got_it' }); assert(!R.get().marks['kotlin:1'], 'second click should clear');
  R.setMark('kotlin:2', { b: true }); assert(R.get().marks['kotlin:2'].b);
  const calls = [];
  global.fetch = async (url, o) => { calls.push([o.method, url.split('/rest/v1/')[1], o.body]); const u = url.split('/rest/v1/')[1];
    const body = o.method === 'GET' ? (u.startsWith('question_marks') ? [{ question_id: 'kotlin:9', status: 'revisit', bookmarked: false, updated_at: new Date(Date.now() + 1000).toISOString() },
      { question_id: 'kotlin:2', status: null, bookmarked: false, updated_at: new Date(Date.now() - 99999).toISOString() }] : []) : null;
    return { ok: true, json: async () => body, text: async () => '' }; };
  const r = await R.sync();
  assert(r.ok); assert.equal(R.get().marks['kotlin:9'].s, 'revisit', 'remote-only row adopted');
  assert(R.get().marks['kotlin:2'].b, 'newer local row kept');
  assert(calls.some(c => c[0] === 'POST' && c[1].startsWith('question_marks') && c[2].includes('kotlin:2')), 'newer local pushed');
  R._setState(Object.assign(mk(), { owner: 'someone-else', marks: { 'x:1': { s: 'got_it', t: 1 } } })); await R.sync();
  assert(!R.get().marks['x:1'], 'other account data purged'); console.log('store tests ok');
})().catch(e => { console.error(e); process.exit(1); });
