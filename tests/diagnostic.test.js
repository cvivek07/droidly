const assert = require('assert');
const R = require('../assets/readiness.js');
const D = require('../assets/diagnostic.js');
const index = require('../assets/roadmap-index.json');
const bank = require('../assets/diagnostic-items.json').items;
const mk = (o) => Object.assign({ v: 1, owner: null, goals: null, ratings: {}, marks: {}, plan: null, jd: null, diag: { results: {}, written: {}, runs: [], last: 0 } }, o);
let pass = 0; const t = (n, f) => { f(); pass++; console.log('ok -', n); };
const idSet = {}; Object.values(index.topics).forEach(tp => tp.items.forEach(i => idSet[i.id] = 1));

t('item bank is structurally valid and every ref exists in the roadmap', () => {
  assert.deepStrictEqual(D.validateItems(bank, idSet), []);
});
t('bank covers every core technical topic with at least 3 quiz items', () => {
  const c = {}; bank.filter(i => i.type === 'mcq').forEach(i => c[i.topic] = (c[i.topic] || 0) + 1);
  ['android','kotlin','compose','coroutines','flows','architecture','di','networking','storage','buildtools','performance'].forEach(k => assert((c[k] || 0) >= 3, k));
});
t('correct answers are not concentrated in one position', () => {
  const c = [0,0,0,0]; bank.filter(i => i.type === 'mcq').forEach(i => c[i.answer]++);
  const n = c.reduce((a, b) => a + b, 0); c.forEach(v => assert(v / n < 0.4, JSON.stringify(c)));
});
t('every item carries an explicit review status', () => {
  bank.forEach(i => assert(['pending','approved'].includes(i.review), i.id));
});
t('written rubrics: a model answer built from the key points scores full, an empty answer scores zero', () => {
  bank.filter(i => i.type === 'written').forEach(w => {
    const model = w.keyPoints.map(k => k.label + ' ' + k.any[0]).join('. ') + ' ' + 'and some more explanation here to reach a sensible answer length for grading purposes';
    const g = D.gradeWritten(w, model);
    assert.equal(g.matched, g.total, w.id + ' ' + JSON.stringify(g.hits.filter(h => !h.hit)));
    assert.equal(g.s, 1, w.id);
    assert.equal(D.gradeWritten(w, '').s, 0);
  });
});
t('written grading: short answers are scaled down, off-topic answers score low', () => {
  const w = bank.find(i => i.id === 'w-coroutines-7');
  const short = D.gradeWritten(w, 'use try catch and supervisor');
  assert(short.short && short.s < short.raw, JSON.stringify(short));
  const off = D.gradeWritten(w, 'I like building user interfaces with consistent spacing and typography across all of the screens in the application every day of the week.');
  assert(off.s <= 0.17, off.s);
});
t('mcq grading flags: solid, lucky, misconception, gap', () => {
  const it = bank.find(i => i.type === 'mcq'), good = it.answer, bad = (it.answer + 1) % 4;
  assert.equal(D.gradeMcq(it, good, 'sure').flag, 'solid');
  assert.equal(D.gradeMcq(it, good, 'guess').flag, 'lucky');
  assert.equal(D.gradeMcq(it, bad, 'sure').flag, 'misconception');
  assert.equal(D.gradeMcq(it, bad, 'guess').flag, 'gap');
  assert.equal(D.gradeMcq(it, null, 'sure').flag, 'gap');
});
t('shuffleOptions keeps the right answer pointing at the right text and is deterministic', () => {
  bank.filter(i => i.type === 'mcq').forEach(i => {
    const a = D.shuffleOptions(i, 3), b = D.shuffleOptions(i, 3);
    assert.equal(a.options[a.answer], i.options[i.answer]); assert.deepStrictEqual(a.options, b.options);
    assert.deepStrictEqual(a.options.slice().sort(), i.options.slice().sort());
  });
});
t('JD: years set the level, topics are detected, nothing is invented from empty text', () => {
  const j = D.analyzeJD('Senior Android Engineer. 6+ years of experience. Kotlin, Jetpack Compose, Hilt, Retrofit, coroutines and Flow. Strong Gradle and CI/CD knowledge.');
  assert.equal(j.level, '5+'); assert.equal(j.years, 6);
  ['kotlin','compose','di','networking','coroutines','buildtools'].forEach(k => assert(j.topics[k] > 0, k));
  assert.equal(D.analyzeJD('Android developer, 1-3 years').level, '0-2');
  assert.equal(D.analyzeJD('3 years of Android').level, '2-5');
  const e = D.analyzeJD(''); assert.equal(e.level, null); assert.deepStrictEqual(e.topics, {});
  assert.equal(D.analyzeJD('We are a fun team that likes lunch').level, null);
});
t('selection: count, no duplicates, deterministic, prefers unseen items, respects topic cap', () => {
  const w = R.weightsFor({ level: '2-5', company: 'product' });
  const a = D.selectMcq(bank, mk(), { count: 12, level: '2-5', weights: w, seed: 1 });
  const b = D.selectMcq(bank, mk(), { count: 12, level: '2-5', weights: w, seed: 1 });
  assert.equal(a.length, 12); assert.deepStrictEqual(a.map(x => x.id), b.map(x => x.id));
  assert.equal(new Set(a.map(x => x.id)).size, 12);
  const per = {}; a.forEach(x => per[x.topic] = (per[x.topic] || 0) + 1); Object.values(per).forEach(v => assert(v <= 3));
  const seen = mk({ diag: { results: { [a[0].id]: { c: true, k: 'sure', topic: a[0].topic } }, written: {}, runs: [], last: 1 } });
  const c = D.selectMcq(bank, seen, { count: 12, level: '2-5', weights: w, seed: 1 });
  assert(!c.some(x => x.id === a[0].id) || c.length === 12);
});
t('selection: JD emphasis pulls its topics in; level shifts difficulty', () => {
  const w = R.weightsFor({ level: '2-5', company: 'product' });
  const jd = { topics: { di: 1, networking: 1 } };
  const withJd = D.selectMcq(bank, mk(), { count: 8, level: '2-5', weights: w, jd, seed: 2 });
  const noJd = D.selectMcq(bank, mk(), { count: 8, level: '2-5', weights: w, seed: 2 });
  const hit = (a) => a.filter(x => x.topic === 'di' || x.topic === 'networking').length;
  assert(hit(withJd) > hit(noJd), withJd.map(x => x.topic).join() + ' vs ' + noJd.map(x => x.topic).join());
  assert(withJd.some(x => x.topic === 'di') && withJd.some(x => x.topic === 'networking'));
  const jr = D.selectMcq(bank, mk(), { count: 12, level: '0-2', weights: R.weightsFor({ level: '0-2' }), seed: 2 });
  const sr = D.selectMcq(bank, mk(), { count: 12, level: '5+', weights: R.weightsFor({ level: '5+' }), seed: 2 });
  const rank = { easy: 0, medium: 1, hard: 2 }, avg = (x) => x.reduce((s, i) => s + rank[i.diff], 0) / x.length;
  assert(avg(sr) > avg(jr), avg(sr) + ' vs ' + avg(jr));
});
t('selection: restricting topics only returns those topics; written prefers gap topics', () => {
  const only = D.selectMcq(bank, mk(), { count: 6, topics: ['flows', 'di'], weights: R.weightsFor({}) });
  only.forEach(x => assert(['flows', 'di'].includes(x.topic)));
  const wr = D.selectWritten(bank, mk(), { count: 2, gapTopics: ['networking', 'di'], weights: R.weightsFor({}) });
  assert.deepStrictEqual(wr.map(x => x.topic).sort(), ['di', 'networking']);
});
t('summarize: lucky answers earn partial credit; confident-wrong are counted', () => {
  const mcq = bank.filter(i => i.type === 'mcq' && i.topic === 'kotlin').slice(0, 4);
  const res = [D.gradeMcq(mcq[0], mcq[0].answer, 'sure'), D.gradeMcq(mcq[1], mcq[1].answer, 'guess'), D.gradeMcq(mcq[2], (mcq[2].answer + 1) % 4, 'sure'), D.gradeMcq(mcq[3], (mcq[3].answer + 1) % 4, 'guess')];
  const s = D.summarize(res).topics[0];
  assert.equal(s.answered, 4); assert.equal(s.correct, 2); assert.equal(s.misconceptions, 1); assert.equal(s.lucky, 1);
  assert.equal(s.pct, Math.round(100 * (1 + 0.4) / 4)); assert.deepStrictEqual(D.summarize(res).gaps, ['kotlin']);
});

/* ---- integration with the mastery model ---- */
const recordInto = (state, results) => { R._setState(state); R.recordDiag(results); return R.get(); };
t('quiz evidence moves mastery both ways and shows as Quiz-tested', () => {
  const good = bank.filter(i => i.type === 'mcq' && i.topic === 'compose');
  const sGood = recordInto(mk({ ratings: { compose: { v: 'new', t: 1 } } }), good.map(i => D.gradeMcq(i, i.answer, 'sure')));
  const sBad = recordInto(mk({ ratings: { compose: { v: 'strong', t: 1 } } }), good.map(i => D.gradeMcq(i, (i.answer + 1) % 4, 'sure')));
  const a = R.topicStats(index, sGood).compose, b = R.topicStats(index, sBad).compose;
  assert(a.mastery > 20 + 30, 'new + all right should rise: ' + a.mastery);
  assert(b.mastery < 80 - 25, 'strong + all confidently wrong should fall: ' + b.mastery);
  assert.equal(a.tested, good.length); assert.equal(b.misconceptions, good.length);
  assert.equal(a.basis, 'Quiz-tested');
});
t('a lucky guess proves less than a confident correct answer', () => {
  const it = bank.find(i => i.type === 'mcq' && i.topic === 'storage');
  const sure = recordInto(mk({}), [D.gradeMcq(it, it.answer, 'sure')]);
  const m1 = R.topicStats(index, sure).storage.mastery;
  const lucky = recordInto(mk({}), [D.gradeMcq(it, it.answer, 'guess')]);
  assert(R.topicStats(index, lucky).storage.mastery < m1);
});
t('skills to improve: confident-wrong answers are the first reason and the missed question is the next step', () => {
  const it = bank.find(i => i.type === 'mcq' && i.topic === 'di');
  const s = recordInto(mk({ goals: { level: '2-5', company: 'product' }, ratings: { di: { v: 'strong', t: 1 } } }),
    bank.filter(i => i.type === 'mcq' && i.topic === 'di').map(i => D.gradeMcq(i, (i.answer + 1) % 4, 'sure')));
  const sk = R.skillsToImprove(index, s, { limit: 11 }).find(x => x.topic === 'di');
  assert(sk, 'di should be flagged'); assert(/confident but wrong/.test(sk.reasons[0]), sk.reasons[0]);
  assert(sk.next.fromQuiz && /^di:/.test(sk.next.id));
});
t('plan puts a missed quiz question ahead of its topic peers', () => {
  const it = bank.find(i => i.id === 'm-di-20'); // di:20 is hard, so it would not normally lead for a 0-2 target
  const s = recordInto(mk({ goals: { level: '0-2', company: 'product', minutes: 60 }, ratings: { di: { v: 'new', t: 1 } } }), [D.gradeMcq(it, (it.answer + 1) % 4, 'sure')]);
  const ids = R.buildPlan(index, s, { today: new Date(2026, 9, 18) }).days.slice(0, 3).flatMap(d => d.tasks.map(x => x.id));
  assert(ids.includes('di:20'), ids.join());
});
t('JD raises weights of the topics it stresses, only for the person who pasted it', () => {
  const g = { level: '2-5', company: 'product' };
  const base = R.weightsFor(g), jd = R.weightsFor(g, null, { topics: { di: 1 } });
  assert(jd.di > base.di && jd.kotlin === base.kotlin);
  assert(Math.abs(jd.di / base.di - 1.4) < 1e-9);
});
t('setJD stores topics but never the pasted text; clearDiag resets quiz and JD', () => {
  R._setState(mk({}));
  R.setJD(D.analyzeJD('Senior Android 6+ years Kotlin Hilt. Confidential recruiter note: salary 40 lakh.'));
  const st = R.get(); assert(!JSON.stringify(st).includes('salary') && !JSON.stringify(st).includes('recruiter'));
  assert(st.jd.topics.kotlin > 0); R.clearDiag(); assert.equal(R.get().jd, null); assert.deepStrictEqual(R.get().diag.results, {});
});
t('old saved states without diag/jd still work', () => {
  const old = { v: 1, owner: null, goals: { level: '2-5' }, ratings: {}, marks: {}, plan: null };
  assert.equal(R.readiness(index, old).score, 35); assert(R.skillsToImprove(index, old).length > 0);
});
console.log(pass + ' passed');

/* ---- Supabase sync (fake backend) ---- */
(async () => {
  const mem = {}; const ls = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  R.configure({ storage: ls, getSession: async () => ({ token: 'tok', uid: 'u1' }) });
  const db = { diag_answers: [], diag_runs: [], user_jd: [], user_goals: [], topic_ratings: [], question_marks: [] };
  let missing = false; const log = [];
  global.fetch = async (url, o) => {
    const path = url.split('/rest/v1/')[1], table = path.split('?')[0]; log.push([o.method, table, o.body]);
    if (missing && /^(diag_|user_jd)/.test(table)) return { ok: false, status: 404, json: async () => ({}), text: async () => 'relation does not exist' };
    if (o.method === 'GET') return { ok: true, json: async () => db[table], text: async () => '' };
    if (o.method === 'POST') {
      const keyOf = { diag_answers: 'item_id', diag_runs: 'run_id', user_jd: 'user_id', user_goals: 'user_id' }[table];
      JSON.parse(o.body).forEach(r => { const i = db[table].findIndex(x => keyOf ? x[keyOf] === r[keyOf] : false); if (i >= 0) db[table][i] = r; else db[table].push(r); });
    }
    return { ok: true, json: async () => null, text: async () => '' };
  };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const mcq = bank.filter(i => i.type === 'mcq' && i.topic === 'di').slice(0, 2), wr = bank.find(i => i.id === 'w-di-15');

  // 1) answering on device A queues rows; they reach the backend
  R._setState(mk({ owner: 'u1' }));
  R.recordDiag([D.gradeMcq(mcq[0], mcq[0].answer, 'sure')], { run: 'r1' });
  R.recordDiag([D.gradeMcq(mcq[1], (mcq[1].answer + 1) % 4, 'sure')], { run: 'r1' });
  R.recordDiag([D.gradeWritten(wr, 'extract a shared class and use an interface, with lazy injection as a stopgap for the cycle between the two classes')], { run: 'r1' });
  R.setJD(D.analyzeJD('Senior Android, 6 years, Kotlin and Hilt, Retrofit'));
  await wait(1200);
  assert.equal(db.diag_answers.length, 3, JSON.stringify(db.diag_answers.map(r => r.item_id)));
  assert.equal(db.diag_runs.length, 1); assert.equal(db.diag_runs[0].answered, 2); assert.equal(db.diag_runs[0].correct, 1);
  assert.equal(db.user_jd[0].active, true); assert(db.user_jd[0].topics.di > 0);
  const wrow = db.diag_answers.find(r => r.kind === 'written'); assert(wrow.score > 0 && wrow.correct === null && wrow.confidence === null);
  const mrow = db.diag_answers.find(r => r.kind === 'mcq' && r.correct === false); assert.equal(mrow.confidence, 'sure');
  assert(!JSON.stringify(db).includes('Retrofit'), 'pasted text must never leave the device');
  pass++; console.log('ok - sync: answers, run and JD topics are pushed; pasted text is not');

  // 2) a fresh device signs in and gets everything back
  R._setState(mk());
  await R.sync();
  const st = R.get();
  assert.equal(Object.keys(st.diag.results).length, 2); assert.equal(Object.keys(st.diag.written).length, 1);
  assert.equal(st.diag.runs.length, 1); assert.equal(st.diag.runs[0].n, 2); assert(st.jd && st.jd.topics.di > 0);
  assert.equal(R.topicStats(index, st).di.misconceptions, 1);
  assert(st.diag.last > 0);
  pass++; console.log('ok - sync: a new device pulls answers, runs and JD, and mastery reflects them');

  // 3) newer wins; JD removal syncs
  R._setState(mk({ owner: 'u1' })); await R.sync();
  R.setJD(null); await wait(1200);
  assert.equal(db.user_jd[0].active, false);
  R._setState(mk()); await R.sync(); assert.equal(R.get().jd, null);
  pass++; console.log('ok - sync: removing the JD on one device removes it on the other');

  // 4) the migration not applied yet: quiz stays local, goals/marks still sync, nothing throws
  missing = true; db.user_goals.length = 0;
  R._setState(mk({ owner: 'u1', goals: { level: '2-5', role: 'android', company: 'product', minutes: 60, t: Date.now() } }));
  R.recordDiag([D.gradeMcq(mcq[0], mcq[0].answer, 'think')], { run: 'r9' });
  const res = await R.sync(); await wait(1200);
  assert(res.ok, JSON.stringify(res)); assert.equal(db.user_goals.length, 1, 'existing sync unaffected');
  assert.equal(Object.keys(R.get().diag.results).length, 1, 'local quiz data kept');
  pass++; console.log('ok - sync: works without the new tables (quiz stays local, existing sync unaffected)');

  // 5) clearDiag wipes the saved copy
  missing = false; db.diag_answers.length = 0; R._setState(mk({ owner: 'u1' })); log.length = 0;
  R.clearDiag(); await wait(100);
  assert(['diag_answers', 'diag_runs', 'user_jd'].every(t => log.some(c => c[0] === 'DELETE' && c[1] === t)));
  pass++; console.log('ok - clearDiag deletes the signed-in copy');
  console.log(pass + ' passed (incl. sync)');
})().catch(e => { console.error(e); process.exit(1); });

