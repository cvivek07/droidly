/*!
 * Droidly Readiness — shared engine + store (no DOM, no framework).
 * Used by roadmap.html and assets/question-marks.js (questions.html).
 *
 *  - Engine: topic mastery, readiness score, rules-based study plan.
 *  - Store : localStorage first (works for guests), syncs to Supabase when signed in.
 *
 * Honesty note: every number here is derived from the user's SELF-ASSESSMENT
 * (topic ratings + "Got it / Revisit" marks). It is an estimate, not a test score.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Readiness = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUPABASE_URL = 'https://dquheflcmcppldrnckzf.supabase.co';
  // Public anon key (same one already shipped in questions.html). RLS protects the data.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdWhlZmxjbWNwcGxkcm5ja3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjI1MDcsImV4cCI6MjA5MTY5ODUwN30.SRhP7mzqlaNzGYEec56IV348aAl66YmFv9ApBuXbN1c';
  var LS_KEY = 'droidly_readiness_v1';
  var AUTH_LS_KEY = 'sb-dquheflcmcppldrnckzf-auth-token';

  var TOPIC_ORDER = ['android', 'kotlin', 'compose', 'coroutines', 'flows', 'architecture', 'di',
    'networking', 'storage', 'buildtools', 'performance', 'hr', 'sysdesign'];

  /* ---------- Rules: how much each topic matters, by experience level ---------- */
  var BASE_WEIGHTS = {
    '0-2': { android: 1.3, kotlin: 1.3, compose: 1.0, coroutines: 1.0, flows: 0.6, architecture: 0.6, di: 0.5, networking: 0.6, storage: 0.7, buildtools: 0.3, performance: 0.3, hr: 0.7, sysdesign: 0.1 },
    '2-5': { android: 1.1, kotlin: 1.1, compose: 1.1, coroutines: 1.2, flows: 0.9, architecture: 1.0, di: 0.8, networking: 0.9, storage: 0.8, buildtools: 0.5, performance: 0.7, hr: 0.7, sysdesign: 0.5 },
    '5+': { android: 0.8, kotlin: 0.9, compose: 1.0, coroutines: 1.1, flows: 0.9, architecture: 1.3, di: 0.9, networking: 0.9, storage: 0.8, buildtools: 0.7, performance: 1.1, hr: 0.9, sysdesign: 1.4 }
  };
  var COMPANY_MULT = {
    product: { sysdesign: 1.2, performance: 1.15, coroutines: 1.1, architecture: 1.1 },
    startup: { compose: 1.2, architecture: 1.1, hr: 1.1 },
    service: { android: 1.2, kotlin: 1.2, buildtools: 1.2, sysdesign: 0.7, performance: 0.8 }
  };
  var RATING_PRIOR = { strong: 80, shaky: 50, new: 20 };
  var UNRATED_PRIOR = 35;
  var MIN_BY_DIFF = { easy: 4, medium: 7, hard: 10 };
  var SYSDESIGN_MIN = 25;
  var DEFAULT_GOALS = { level: '2-5', role: 'android', company: 'product', minutes: 60, date: null };
  var DAY_MS = 86400000;

  /* ---------- Date helpers (local time) ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }

  /* ---------- Engine ---------- */
  function weightsFor(goals) {
    var g = Object.assign({}, DEFAULT_GOALS, goals || {});
    var base = BASE_WEIGHTS[g.level] || BASE_WEIGHTS['2-5'];
    var mult = COMPANY_MULT[g.company] || {};
    var out = {};
    TOPIC_ORDER.forEach(function (t) { out[t] = (base[t] != null ? base[t] : 0.5) * (mult[t] || 1); });
    return out;
  }

  function topicStats(index, state) {
    var out = {};
    TOPIC_ORDER.forEach(function (tid) {
      var topic = index.topics[tid];
      if (!topic) return;
      var total = topic.items.length, got = 0, rev = 0;
      topic.items.forEach(function (it) {
        var m = state.marks[it.id];
        if (m && m.s === 'got_it') got++;
        else if (m && m.s === 'revisit') rev++;
      });
      var r = state.ratings[tid];
      var rated = !!(r && RATING_PRIOR[r.v] != null);
      var prior = rated ? RATING_PRIOR[r.v] : UNRATED_PRIOR;
      var attempted = got + rev;
      var w = Math.min(attempted / 8, 1) * 0.7;           // evidence gains weight up to 70%
      var evidence = attempted > 0 ? (100 * got / attempted) : prior;
      var mastery = prior * (1 - w) + evidence * w;
      var label;
      if (!rated && attempted === 0) label = 'Not rated';
      else if (mastery >= 75) label = 'Strong';
      else if (mastery >= 50) label = 'Needs practice';
      else label = 'Weak area';
      out[tid] = { id: tid, name: topic.name, total: total, got: got, revisit: rev, attempted: attempted,
        rated: rated, mastery: Math.round(mastery), label: label };
    });
    return out;
  }

  function readiness(index, state) {
    var stats = topicStats(index, state);
    var weights = weightsFor(state.goals);
    var num = 0, den = 0, ratedCount = 0, attempts = 0;
    TOPIC_ORDER.forEach(function (t) {
      var s = stats[t]; if (!s) return;
      num += weights[t] * s.mastery; den += weights[t];
      if (s.rated) ratedCount++;
      attempts += s.attempted;
    });
    var conf = 0.5 * (ratedCount / TOPIC_ORDER.length) + 0.5 * Math.min(attempts / 60, 1);
    return {
      score: den ? Math.round(num / den) : 0,
      confidence: conf < 0.3 ? 'Low' : conf < 0.65 ? 'Medium' : 'High',
      ratedTopics: ratedCount, attempted: attempts, stats: stats, weights: weights
    };
  }

  function isDone(task, state, planAt) {
    var m = state.marks[task.id];
    if (!m || !m.s) return false;
    if (task.type === 'revision') return m.s === 'got_it' || (planAt != null && m.t > planAt);
    return true;
  }

  function hrefFor(it, topic) {
    return it.href ? it.href : '/questions.html?topic=' + topic + '&q=' + it.n + '#' + topic;
  }
  function taskFrom(it, topic, type) {
    return { id: it.id, type: type, topic: topic, title: it.q, diff: it.d,
      min: type === 'sysdesign' ? SYSDESIGN_MIN : (MIN_BY_DIFF[it.d] || 7), href: hrefFor(it, topic) };
  }

  /**
   * Rules-based plan. Deterministic for a given (index, state, today).
   * opts: { today: Date, days: number, carry: Task[] (already-done tasks to keep on day 0) }
   */
  function buildPlan(index, state, opts) {
    opts = opts || {};
    var now = opts.today || new Date();
    var today = startOfDay(now);
    var goals = Object.assign({}, DEFAULT_GOALS, state.goals || {});
    var budgetBase = goals.minutes || 60;
    var horizon = opts.days || 7, note = null;

    if (goals.date) {
      var left = daysBetween(today, parseYmd(goals.date));
      if (left <= 0) { horizon = 1; note = left === 0 ? 'Interview day: keep it light. Revise, don\'t cram.' : 'Your interview date has passed. Update your goal to start a new plan.'; }
      else if (left < horizon) { horizon = left; note = left + ' day' + (left > 1 ? 's' : '') + ' to go: plan compressed to what matters most.'; }
    }

    var weights = weightsFor(goals);
    var stats = topicStats(index, state);
    var targetRank = { '0-2': 0.5, '2-5': 1, '5+': 1.7 }[goals.level] != null ? { '0-2': 0.5, '2-5': 1, '5+': 1.7 }[goals.level] : 1;
    var rank = { easy: 0, medium: 1, hard: 2 };

    // Candidate pools: unmarked questions, best first.
    var scheduled = {};
    (opts.carry || []).forEach(function (t) { scheduled[t.id] = true; });
    var pools = {};
    TOPIC_ORDER.forEach(function (tid) {
      if (tid === 'sysdesign' || !index.topics[tid]) return;
      var arr = index.topics[tid].items.filter(function (it) {
        var m = state.marks[it.id]; return !(m && m.s) && !scheduled[it.id];
      });
      arr.sort(function (a, b) {
        function sc(it) {
          var m = state.marks[it.id];
          return (it.m ? 0 : 10) + Math.abs((rank[it.d] != null ? rank[it.d] : 1) - targetRank) * 3 - (m && m.b ? 5 : 0) + (it.n || 0) * 0.001;
        }
        return sc(a) - sc(b);
      });
      pools[tid] = arr;
    });
    var sdPool = ((index.topics.sysdesign && index.topics.sysdesign.items) || []).filter(function (it) {
      var m = state.marks[it.id]; return !(m && m.s) && !scheduled[it.id];
    });

    // Spaced revision: "revisit" items become due a day after being marked (oldest first).
    var revDone = {};
    function dueRevisions(dayIdx) {
      var at = now.getTime() + dayIdx * DAY_MS;
      return Object.keys(state.marks).filter(function (id) {
        var m = state.marks[id]; return m.s === 'revisit' && !revDone[id] && at - m.t >= DAY_MS - 3600000;
      }).sort(function (a, b) { return state.marks[a].t - state.marks[b].t; });
    }
    var revItems = {};
    TOPIC_ORDER.forEach(function (tid) {
      ((index.topics[tid] && index.topics[tid].items) || []).forEach(function (it) { revItems[it.id] = { it: it, topic: tid }; });
    });

    var assigned = {};
    var wantSD = function (dayIdx) {
      if (budgetBase < 45 || !sdPool.length) return false;
      if (goals.level === '5+') return dayIdx % 3 === 2;
      if (goals.level === '2-5') return goals.company === 'product' ? dayIdx === 4 : dayIdx === 5;
      return false;
    };

    var days = [];
    for (var d = 0; d < horizon; d++) {
      var tasks = [], used = 0;
      if (d === 0 && opts.carry) opts.carry.forEach(function (t) { tasks.push(t); used += t.min; });

      // 1) revision slice (<= 20% of budget, max 5 items)
      var revBudget = Math.max(5, Math.round(budgetBase * 0.2)), revUsed = 0, revCount = 0;
      var due = dueRevisions(d);
      while (due.length && revCount < 5) {
        var ri = revItems[due[0]];
        if (!ri) { revDone[due.shift()] = 1; continue; }
        var rt = taskFrom(ri.it, ri.topic, 'revision');
        if (revUsed + rt.min > revBudget && revCount > 0) break;
        revDone[due.shift()] = 1; tasks.push(rt); revUsed += rt.min; used += rt.min; revCount++;
      }
      // 2) one system design walkthrough on scheduled days
      if (wantSD(d)) {
        var sd = sdPool.shift(); var st = taskFrom(sd, 'sysdesign', 'sysdesign');
        tasks.push(st); used += st.min;
      }
      // 3) fill the rest with questions, spread across needy topics
      var guard = 0;
      while (used < budgetBase && guard++ < 200) {
        var best = null, bestScore = 0;
        for (var i = 0; i < TOPIC_ORDER.length; i++) {
          var tid = TOPIC_ORDER[i];
          if (!pools[tid] || !pools[tid].length || !stats[tid]) continue;
          var need = weights[tid] * (100 - stats[tid].mastery) / 100 + 0.05;
          var sc = need / (1 + (assigned[tid] || 0) * 0.35);
          if (sc > bestScore) { bestScore = sc; best = tid; }
        }
        if (!best) break;
        var it = pools[best][0];
        var t = taskFrom(it, best, 'study');
        if (used + t.min > budgetBase && tasks.length > 0) {
          // try a cheaper item from the same pool before giving up on the day
          var alt = null;
          for (var k = 1; k < Math.min(pools[best].length, 8); k++) {
            if (used + (MIN_BY_DIFF[pools[best][k].d] || 7) <= budgetBase) { alt = k; break; }
          }
          if (alt == null) break;
          it = pools[best].splice(alt, 1)[0];
          t = taskFrom(it, best, 'study');
        } else pools[best].shift();
        tasks.push(t); used += t.min; assigned[best] = (assigned[best] || 0) + 1;
      }
      days.push({ date: ymd(addDays(today, d)), tasks: tasks, minutes: used });
    }
    return { on: ymd(today), at: now.getTime(), horizon: horizon, note: note, days: days };
  }

  /* ---------- State / store ---------- */
  function emptyState() { return { v: 1, owner: null, goals: null, ratings: {}, marks: {}, plan: null }; }
  var state = emptyState();
  var listeners = [];
  var cfg = { getSession: defaultGetSession, storage: null };

  function storage() {
    if (cfg.storage) return cfg.storage;
    try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }
  function load() {
    var s = storage();
    try { var raw = s && s.getItem(LS_KEY); if (raw) { var p = JSON.parse(raw); if (p && p.v === 1) state = Object.assign(emptyState(), p); } } catch (e) { /* ignore */ }
    return state;
  }
  function save() { var s = storage(); try { s && s.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* quota/private mode */ } }
  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }
  function onChange(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  function defaultGetSession() {
    // Reads the session the site's existing Supabase client already stores. No extra auth client,
    // so no extra token-refresh race. Expired token => stay local; the page's own client refreshes it.
    try {
      var raw = localStorage.getItem(AUTH_LS_KEY); if (!raw) return Promise.resolve(null);
      var s = JSON.parse(raw);
      if (!s || !s.access_token || !s.user) return Promise.resolve(null);
      if (s.expires_at && s.expires_at * 1000 < Date.now() + 15000) return Promise.resolve(null);
      return Promise.resolve({ token: s.access_token, uid: s.user.id });
    } catch (e) { return Promise.resolve(null); }
  }
  function configure(o) { cfg = Object.assign(cfg, o || {}); }

  function rest(method, path, token, body, prefer) {
    var h = { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    if (prefer) h.Prefer = prefer;
    return fetch(SUPABASE_URL + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); });
        return method === 'GET' ? r.json() : null;
      });
  }
  function iso(ms) { return new Date(ms).toISOString(); }

  var pushQueue = {};
  var pushTimer = null;
  function queuePush(kind, key) {
    pushQueue[kind + '|' + key] = [kind, key];
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, 800);
  }
  function rowFor(kind, key, uid) {
    if (kind === 'goal') { var g = state.goals; return g && { user_id: uid, level: g.level, role: g.role, company_type: g.company, minutes_per_day: g.minutes, interview_date: g.date || null, updated_at: iso(g.t || Date.now()) }; }
    if (kind === 'rating') { var r = state.ratings[key]; return r && { user_id: uid, topic_id: key, rating: r.v, updated_at: iso(r.t) }; }
    var m = state.marks[key]; return m && { user_id: uid, question_id: key, status: m.s || null, bookmarked: !!m.b, updated_at: iso(m.t) };
  }
  function pushRows(sess, items) {
    var by = { goal: [], rating: [], mark: [] };
    items.forEach(function (p) { var row = rowFor(p[0], p[1], sess.uid); if (row) by[p[0]].push(row); });
    var jobs = [];
    if (by.goal.length) jobs.push(rest('POST', 'user_goals?on_conflict=user_id', sess.token, by.goal, 'resolution=merge-duplicates,return=minimal'));
    if (by.rating.length) jobs.push(rest('POST', 'topic_ratings?on_conflict=user_id,topic_id', sess.token, by.rating, 'resolution=merge-duplicates,return=minimal'));
    if (by.mark.length) jobs.push(rest('POST', 'question_marks?on_conflict=user_id,question_id', sess.token, by.mark, 'resolution=merge-duplicates,return=minimal'));
    return Promise.all(jobs);
  }
  function flushPush() {
    var items = Object.keys(pushQueue).map(function (k) { return pushQueue[k]; });
    pushQueue = {};
    if (!items.length) return Promise.resolve();
    return cfg.getSession().then(function (sess) {
      if (!sess) return null;
      return pushRows(sess, items);
    }).catch(function (e) { console.warn('[readiness] push failed; will retry on next sync', e.message); });
  }

  function sync() {
    return cfg.getSession().then(function (sess) {
      if (!sess) return { ok: false, reason: 'signed-out' };
      if (state.owner && state.owner !== sess.uid) { state = emptyState(); }   // different account on this browser
      state.owner = sess.uid;
      var q = 'select=*&user_id=eq.' + sess.uid;
      return Promise.all([
        rest('GET', 'user_goals?' + q, sess.token),
        rest('GET', 'topic_ratings?' + q, sess.token),
        rest('GET', 'question_marks?' + q + '&limit=5000', sess.token)
      ]).then(function (res) {
        var push = [];
        var remoteGoal = res[0][0];
        var rg = remoteGoal && { level: remoteGoal.level, role: remoteGoal.role, company: remoteGoal.company_type,
          minutes: remoteGoal.minutes_per_day, date: remoteGoal.interview_date, t: Date.parse(remoteGoal.updated_at) };
        if (rg && (!state.goals || (state.goals.t || 0) < rg.t)) state.goals = rg;
        else if (state.goals && (!rg || (state.goals.t || 0) > rg.t)) push.push(['goal', 'g']);
        var seenR = {};
        res[1].forEach(function (r) {
          seenR[r.topic_id] = 1; var t = Date.parse(r.updated_at), l = state.ratings[r.topic_id];
          if (!l || l.t < t) state.ratings[r.topic_id] = { v: r.rating, t: t };
          else if (l.t > t) push.push(['rating', r.topic_id]);
        });
        Object.keys(state.ratings).forEach(function (k) { if (!seenR[k]) push.push(['rating', k]); });
        var seenM = {};
        res[2].forEach(function (r) {
          seenM[r.question_id] = 1; var t = Date.parse(r.updated_at), l = state.marks[r.question_id];
          if (!l || l.t < t) state.marks[r.question_id] = { s: r.status, b: !!r.bookmarked, t: t };
          else if (l.t > t) push.push(['mark', r.question_id]);
        });
        Object.keys(state.marks).forEach(function (k) { if (!seenM[k]) push.push(['mark', k]); });
        save(); emit();
        return push.length ? pushRows(sess, push).then(function () { return { ok: true, pushed: push.length }; }) : { ok: true, pushed: 0 };
      });
    }).catch(function (e) { console.warn('[readiness] sync failed; continuing locally', e.message); return { ok: false, reason: e.message }; });
  }

  function setGoals(g) {
    state.goals = Object.assign({}, DEFAULT_GOALS, g, { t: Date.now() });
    save(); emit(); queuePush('goal', 'g');
  }
  function setRating(topic, v) {
    if (!RATING_PRIOR.hasOwnProperty(v)) return;
    state.ratings[topic] = { v: v, t: Date.now() }; save(); emit(); queuePush('rating', topic);
  }
  /** patch: { s: 'got_it'|'revisit'|null, b: boolean } — only provided keys change. */
  function setMark(id, patch) {
    var m = state.marks[id] || { s: null, b: false, t: 0 };
    if ('s' in patch) m.s = patch.s === m.s ? null : patch.s;      // clicking the active state clears it
    if ('b' in patch) m.b = !!patch.b;
    m.t = Date.now();
    if (!m.s && !m.b) delete state.marks[id]; else state.marks[id] = m;
    save(); emit(); queuePush('mark', id);
    return state.marks[id] || null;
  }
  function clearLocal() { state = emptyState(); save(); emit(); }

  /** Today's plan: reuse the saved one unless the day, the goal or the ratings changed (or force). */
  function ensurePlan(index, force) {
    var now = new Date();
    var sig = JSON.stringify([state.goals && [state.goals.level, state.goals.company, state.goals.minutes, state.goals.date], state.ratings && Object.keys(state.ratings).sort().map(function (k) { return k + state.ratings[k].v; })]);
    var p = state.plan;
    if (!force && p && p.on === ymd(now) && p.sig === sig) return p;
    var carry = [];
    if (p && p.on === ymd(now) && p.days[0]) carry = p.days[0].tasks.filter(function (t) { return isDone(t, state, p.at); });
    var plan = buildPlan(index, state, { today: now, carry: carry });
    plan.sig = sig; state.plan = plan; save();
    return plan;
  }

  return {
    TOPIC_ORDER: TOPIC_ORDER, DEFAULT_GOALS: DEFAULT_GOALS, RATING_PRIOR: RATING_PRIOR,
    weightsFor: weightsFor, topicStats: topicStats, readiness: readiness, buildPlan: buildPlan, isDone: isDone,
    ymd: ymd, parseYmd: parseYmd, daysBetween: daysBetween,
    load: load, get: function () { return state; }, onChange: onChange, configure: configure, sync: sync,
    setGoals: setGoals, setRating: setRating, setMark: setMark, clearLocal: clearLocal, ensurePlan: ensurePlan,
    _setState: function (s) { state = s; }                           // tests only
  };
});
