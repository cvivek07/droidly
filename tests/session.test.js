// Supabase is the source of truth: nothing about the user may live in browser storage, and signing out must leave nothing behind.
const assert = require('assert');
const R = require('../assets/readiness.js');
const index = require('../assets/roadmap-index.json');
const mk = (o) => Object.assign({ v: 1, owner: null, goals: null, ratings: {}, marks: {}, plan: null, jd: null, diag: { results: {}, written: {}, runs: [], last: 0 } }, o);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0; const t = (n) => { pass++; console.log('ok -', n); };

(async () => {
  // A browser-storage spy: the app must never write user data to it, and must remove the legacy key.
  const writes = []; const store = { droidly_readiness_v1: '{"v":1,"goals":{"level":"5+"},"owner":"old"}' };
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { writes.push(k); store[k] = v; }, removeItem: k => { delete store[k]; } };
  R.configure({ storage: null, getSession: async () => ({ token: 'tok', uid: 'u1' }) });
  R._setState(mk());
  R.load();
  assert(!('droidly_readiness_v1' in store), 'legacy cached progress is purged on load'); t('legacy browser copy is purged');

  const db = { user_goals: [], topic_ratings: [], question_marks: [], user_plan: [], diag_answers: [], diag_runs: [], user_jd: [] };
  let failPosts = 0; const log = [];
  global.fetch = async (url, o) => {
    const table = url.split('/rest/v1/')[1].split('?')[0]; log.push([o.method, table, o.keepalive]);
    if (o.method === 'GET') return { ok: true, json: async () => db[table], text: async () => '' };
    if (failPosts > 0) { failPosts--; return { ok: false, status: 503, json: async () => null, text: async () => 'unavailable' }; }
    const keyOf = { user_goals: 'user_id', user_plan: 'user_id', topic_ratings: 'topic_id', question_marks: 'question_id' }[table];
    JSON.parse(o.body).forEach(r => { const i = db[table].findIndex(x => keyOf && x[keyOf] === r[keyOf]); if (i >= 0) db[table][i] = r; else db[table].push(r); });
    return { ok: true, json: async () => null, text: async () => '' };
  };

  R.setGoals({ level: '2-5', company: 'product', minutes: 60 }); R.setRating('kotlin', 'new'); R.setMark('kotlin:1', { s: 'got_it' });
  R.ensurePlan(index, true);
  await wait(1200);
  assert.deepStrictEqual(writes.filter(k => k !== 'droidly_first_mark_sent'), [], 'no browser-storage writes: ' + writes.join());   // the one allowed key is an analytics de-dupe flag, not user data
  assert.equal(db.user_goals.length, 1); assert.equal(db.user_plan.length, 1); assert(db.user_plan[0].plan.days.length > 0);
  assert(log.filter(c => c[0] === 'POST').every(c => c[2] === true), 'writes use keepalive so they survive a page unload');
  t('user data goes to Supabase (goal, rating, mark, plan) and never to browser storage');

  // A new browser/device gets the same plan back, including what was done today.
  const planBefore = JSON.stringify(R.get().plan.days[0].tasks.map(x => x.id));
  R._setState(mk()); await R.sync();
  assert.deepStrictEqual(JSON.stringify(R.get().plan.days[0].tasks.map(x => x.id)), planBefore); assert(R.get().goals && R.get().marks['kotlin:1']);
  const again = R.ensurePlan(index, false);   // same signature => reused, not rebuilt
  assert.equal(JSON.stringify(again.days[0].tasks.map(x => x.id)), planBefore);
  t('a fresh browser loads the same goal, marks and plan from Supabase');

  // Signing out: the next sync with no session wipes the previous user's data from memory.
  R.configure({ getSession: async () => null });
  const r = await R.sync();
  assert.equal(r.reason, 'signed-out'); assert.equal(R.get().goals, null); assert.deepStrictEqual(R.get().marks, {}); assert.equal(R.get().plan, null); assert.equal(R.get().owner, null);
  t('after sign-out nothing of the previous user remains');

  // Another account on the same browser sees only its own rows.
  R.configure({ getSession: async () => ({ token: 't2', uid: 'u2' }) });
  R._setState(mk({ owner: 'u1', goals: { level: '5+', t: 1 }, marks: { 'x:1': { s: 'got_it', t: 1 } } }));
  db.user_goals.length = db.question_marks.length = db.user_plan.length = 0;
  await R.sync();
  assert(!R.get().marks['x:1'], 'u1 data must not leak into u2'); t('switching accounts never leaks data');

  // Failed writes are retried instead of being lost (there is no local copy to fall back on).
  R.configure({ getSession: async () => ({ token: 'tok', uid: 'u1' }) });
  R._setState(mk({ owner: 'u1' })); db.question_marks.length = 0; failPosts = 1;
  R.setMark('compose:2', { s: 'revisit' });
  await wait(900 + 2300);
  assert.equal(db.question_marks.length, 1, 'mark must arrive after the retry'); t('a failed write is retried until it lands');
  console.log(pass + ' passed');
})().catch(e => { console.error(e); process.exit(1); });
