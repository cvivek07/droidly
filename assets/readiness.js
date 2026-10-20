/*!
 * Droidly Readiness — shared engine + store (no DOM, no framework).
 * Used by roadmap.html and assets/question-marks.js (questions.html).
 *
 *  - Engine: difficulty-aware topic mastery, readiness by level, skills to improve, rules-based study plan.
 *  - Store : Supabase is the source of truth. Nothing about the user is kept in browser storage: state is loaded
 *            from Supabase on each page load and written back as it changes. Signed-out visitors get an empty,
 *            in-memory session that is lost on reload (the pages tell them to sign in to save).
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
  var LEVELS = ['0-2', '2-5', '5+'];
  /* How much one answered question counts as evidence, by target level and difficulty.
     Easy answers prove less for senior targets; hard answers prove more. */
  var DIFF_W = {
    '0-2': { easy: 1.0, medium: 1.0, hard: 0.7 },
    '2-5': { easy: 0.8, medium: 1.1, hard: 1.0 },
    '5+':  { easy: 0.6, medium: 1.0, hard: 1.3 }
  };
  /* Role presets: topic multipliers applied on top of level weights. Only 'android' exists today;
     add a role here (e.g. { kmp: { ... } }) and it flows through weights, readiness and skills. */
  var ROLE_MULT = { android: {} };
  var EVIDENCE_FULL = 8;      // weighted answers needed before evidence reaches its max share
  var EVIDENCE_MAX_SHARE = 0.7;
  var JD_BOOST = 0.4;          // a topic the job description stresses fully counts up to 40% more
  // Diagnostic quiz evidence. Credit for a right answer depends on confidence (a lucky guess proves little);
  // a confident wrong answer is the most informative miss, so it carries extra weight.
  var DIAG_CREDIT = { sure: 1, think: 0.85, guess: 0.4 };
  var DIAG_WRONG_W = { sure: 1.3, think: 1, guess: 0.6 };
  var DIAG_WRITTEN_W = 2;
  var DAY_MS = 86400000;

  /* ---------- Date helpers (local time) ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); }

  /* ---------- Engine ---------- */
  function goalsOf(goals) { return Object.assign({}, DEFAULT_GOALS, goals || {}); }

  function weightsFor(goals, levelOverride, jd) {
    var g = goalsOf(goals);
    var jdTopics = (jd && jd.topics) || {};
    var level = levelOverride || g.level;
    var base = BASE_WEIGHTS[level] || BASE_WEIGHTS['2-5'];
    var mult = COMPANY_MULT[g.company] || {};
    var rmult = ROLE_MULT[g.role] || {};
    var out = {};
    TOPIC_ORDER.forEach(function (t) { out[t] = (base[t] != null ? base[t] : 0.5) * (mult[t] || 1) * (rmult[t] || 1) * (1 + JD_BOOST * (jdTopics[t] || 0)); });
    return out;
  }

  function diffWeight(level, d) { return (DIFF_W[level] || DIFF_W['2-5'])[d] || 1; }

  function diagOf(state) { var d = state && state.diag; return d && d.results ? d : { results: {}, written: {}, runs: [], last: 0 }; }

  /** Quiz evidence for one topic: credit and weight to add to the marks evidence, plus counts for the UI. */
  function diagTopic(state, tid, level) {
    var d = diagOf(state), out = { credit: 0, weight: 0, tested: 0, correct: 0, misconceptions: 0, missedRefs: [] };
    Object.keys(d.results).forEach(function (id) {
      var r = d.results[id]; if (r.topic !== tid) return;
      var dw = diffWeight(level, r.d), k = DIAG_CREDIT[r.k] != null ? r.k : 'think';
      out.tested++;
      if (r.c) { out.correct++; out.credit += dw * DIAG_CREDIT[k]; out.weight += dw; }
      else { out.weight += dw * DIAG_WRONG_W[k]; if (k === 'sure') out.misconceptions++; if (r.ref) out.missedRefs.push(r.ref); }
    });
    Object.keys(d.written || {}).forEach(function (id) {
      var r = d.written[id]; if (r.topic !== tid) return;
      var dw = diffWeight(level, r.d) * DIAG_WRITTEN_W;
      out.tested++; out.credit += dw * r.s; out.weight += dw;
      if (r.s < 0.5 && r.ref) out.missedRefs.push(r.ref);
    });
    return out;
  }

  /**
   * Per-topic mastery (0-100) from the user's self-rating (prior) and their Got it / Revisit marks (evidence).
   * Evidence is difficulty-weighted for the target level, and gains up to 70% of the score as it accumulates.
   * opts.level overrides the goal's level (used to compare readiness across levels).
   */
  function topicStats(index, state, opts) {
    var level = (opts && opts.level) || goalsOf(state.goals).level;
    var out = {};
    TOPIC_ORDER.forEach(function (tid) {
      var topic = index.topics[tid];
      if (!topic) return;
      var total = topic.items.length, got = 0, rev = 0, wGot = 0, wAll = 0, unmarkedCore = 0;
      var byDiff = { easy: { got: 0, revisit: 0, total: 0 }, medium: { got: 0, revisit: 0, total: 0 }, hard: { got: 0, revisit: 0, total: 0 } };
      topic.items.forEach(function (it) {
        var bd = byDiff[it.d] || byDiff.medium; bd.total++;
        var m = state.marks[it.id], w = diffWeight(level, it.d);
        if (m && m.s === 'got_it') { got++; bd.got++; wGot += w; wAll += w; }
        else if (m && m.s === 'revisit') { rev++; bd.revisit++; wAll += w; }
        else if (it.m) unmarkedCore++;
      });
      var dg = diagTopic(state, tid, level);
      wGot += dg.credit; wAll += dg.weight;
      var r = state.ratings[tid];
      var rated = !!(r && RATING_PRIOR[r.v] != null);
      var prior = rated ? RATING_PRIOR[r.v] : UNRATED_PRIOR;
      var attempted = got + rev;
      var w = Math.min(wAll / EVIDENCE_FULL, 1) * EVIDENCE_MAX_SHARE;
      var evidence = wAll > 0 ? (100 * wGot / wAll) : prior;
      var mastery = prior * (1 - w) + evidence * w;
      var label;
      if (!rated && attempted === 0 && dg.tested === 0) label = 'Not rated';
      else if (mastery >= 75) label = 'Strong';
      else if (mastery >= 50) label = 'Needs practice';
      else label = 'Weak area';
      // How much real evidence sits behind the number (so the UI can be honest about it).
      var basis = (attempted === 0 && dg.tested === 0) ? 'Rating only' : (attempted === 0 && wAll < EVIDENCE_FULL) ? 'Quiz-tested' : wAll < 3 ? 'Early signal' : wAll < EVIDENCE_FULL ? 'Building' : 'Solid';
      out[tid] = { id: tid, name: topic.name, total: total, got: got, revisit: rev, attempted: attempted,
        rated: rated, mastery: Math.round(mastery), label: label,
        coverage: total ? Math.round(100 * attempted / total) : 0,
        tested: dg.tested, quizCorrect: dg.correct, misconceptions: dg.misconceptions, missedRefs: dg.missedRefs,
        byDifficulty: byDiff, unmarkedCore: unmarkedCore, basis: basis };
    });
    return out;
  }

  function readiness(index, state, opts) {
    var g = goalsOf(state.goals);
    var level = (opts && opts.level) || g.level;
    var stats = topicStats(index, state, { level: level });
    var weights = weightsFor(g, level, state.jd);
    var num = 0, den = 0, ratedCount = 0, attempts = 0;
    TOPIC_ORDER.forEach(function (t) {
      var s = stats[t]; if (!s) return;
      num += weights[t] * s.mastery; den += weights[t];
      if (s.rated) ratedCount++;
      attempts += s.attempted + s.tested;
    });
    var conf = 0.5 * (ratedCount / TOPIC_ORDER.length) + 0.5 * Math.min(attempts / 60, 1);
    return {
      score: den ? Math.round(num / den) : 0,
      confidence: conf < 0.3 ? 'Low' : conf < 0.65 ? 'Medium' : 'High',
      level: level, role: g.role,
      ratedTopics: ratedCount, attempted: attempts, stats: stats, weights: weights
    };
  }

  /** The same progress scored against each experience level (0-2, 2-5, 5+), for the same role and company type. */
  function readinessByLevel(index, state) {
    var g = goalsOf(state.goals);
    return LEVELS.map(function (lv) {
      var r = readiness(index, state, { level: lv });
      return { level: lv, score: r.score, isTarget: lv === g.level, confidence: r.confidence };
    });
  }

  /* Order used to pick what to study next inside a topic: core questions first, then closest to the target difficulty. */
  var DIFF_RANK = { easy: 0, medium: 1, hard: 2 };
  var LEVEL_TARGET_RANK = { '0-2': 0.5, '2-5': 1, '5+': 1.7 };
  function nextItem(index, state, tid, level) {
    var topic = index.topics[tid]; if (!topic) return null;
    var target = LEVEL_TARGET_RANK[level] != null ? LEVEL_TARGET_RANK[level] : 1;
    var best = null, bestSc = 0;
    topic.items.forEach(function (it) {
      var m = state.marks[it.id]; if (m && m.s) return;
      var sc = (it.m ? 0 : 10) + Math.abs((DIFF_RANK[it.d] != null ? DIFF_RANK[it.d] : 1) - target) * 3 + (it.n || 0) * 0.001;
      if (best === null || sc < bestSc) { best = it; bestSc = sc; }
    });
    if (!best) return null;
    return { id: best.id, title: best.q, diff: best.d, href: hrefFor(best, tid),
      min: tid === 'sysdesign' ? SYSDESIGN_MIN : (MIN_BY_DIFF[best.d] || 7) };
  }

  /**
   * Ranked list of skills to improve before the interview: topics that matter for the target level and role,
   * where mastery is below "Strong". Each entry says why, and what to do next.
   * opts: { limit (default 5) }
   */
  function skillsToImprove(index, state, opts) {
    opts = opts || {};
    var g = goalsOf(state.goals);
    var r = readiness(index, state, { level: g.level });
    var out = [];
    TOPIC_ORDER.forEach(function (tid) {
      var st = r.stats[tid]; if (!st || st.mastery >= 75) return;
      var w = r.weights[tid];
      var priority = w * (100 - st.mastery) / 100 + (!st.rated && st.attempted === 0 ? 0.03 : 0);
      var reasons = [];
      if (st.misconceptions > 0) reasons.push(st.misconceptions + ' quiz answer' + (st.misconceptions > 1 ? 's were' : ' was') + ' confident but wrong. That usually means a misconception worth fixing first.');
      if (st.tested > 0 && st.quizCorrect < st.tested) reasons.push('Quiz: ' + st.quizCorrect + ' of ' + st.tested + ' correct in this topic.');
      if (state.jd && state.jd.topics && state.jd.topics[tid] >= 0.34) reasons.push('Your job description stresses this topic.');
      var hard = st.byDifficulty.hard, hardTried = hard.got + hard.revisit;
      if (!st.rated && st.attempted === 0) reasons.push('Not rated yet. Rate it so your estimate can start.');
      if (st.attempted > 0 && st.revisit / st.attempted >= 0.34) reasons.push(st.revisit + ' of ' + st.attempted + ' answered questions are marked Revisit.');
      if (tid === 'sysdesign') {
        if (st.attempted === 0 && w >= 0.9) reasons.push('No system design walkthroughs completed yet. This topic carries extra weight at your target level.');
      } else if (g.level !== '0-2' && hard.total > 0 && hardTried === 0) {
        reasons.push('No hard questions attempted yet' + (g.level === '5+' ? '. They carry the most weight at your target level.' : '.'));
      }
      if (st.unmarkedCore > 0 && st.attempted > 0) reasons.push(st.unmarkedCore + ' core question' + (st.unmarkedCore > 1 ? 's' : '') + ' still unattempted.');
      if (!reasons.length) reasons.push('Mastery is ' + st.mastery + '/100 from your rating and marks.');
      var nx = null;
      (st.missedRefs || []).some(function (ref) {
        var it = null; ((index.topics[tid] && index.topics[tid].items) || []).forEach(function (x) { if (x.id === ref) it = x; });
        if (!it || (state.marks[ref] && state.marks[ref].s)) return false;
        nx = { id: it.id, title: it.q, diff: it.d, href: hrefFor(it, tid), min: tid === 'sysdesign' ? SYSDESIGN_MIN : (MIN_BY_DIFF[it.d] || 7), fromQuiz: true };
        return true;
      });
      out.push({ topic: tid, name: st.name, mastery: st.mastery, label: st.label, basis: st.basis,
        weight: Math.round(w * 100) / 100, priority: Math.round(priority * 1000) / 1000,
        reasons: reasons.slice(0, 2), next: nx || nextItem(index, state, tid, g.level) });
    });
    out.sort(function (a, b) { return b.priority - a.priority || TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic); });
    return out.slice(0, opts.limit || 5);
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

    var weights = weightsFor(goals, null, state.jd);
    var stats = topicStats(index, state);
    var missedRef = {};
    Object.keys(stats).forEach(function (t) { (stats[t].missedRefs || []).forEach(function (r) { missedRef[r] = true; }); });
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
          return (it.m ? 0 : 10) + Math.abs((rank[it.d] != null ? rank[it.d] : 1) - targetRank) * 3 - (m && m.b ? 5 : 0) - (missedRef[it.id] ? 20 : 0) + (it.n || 0) * 0.001;
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
  function emptyState() { return { v: 1, owner: null, goals: null, ratings: {}, marks: {}, plan: null, jd: null, diag: { results: {}, written: {}, runs: [], last: 0 } }; }
  var state = emptyState();
  var listeners = [];
  var cfg = { getSession: defaultGetSession, storage: null };

  function storage() {
    return cfg.storage || null;   // only injected in tests; the app never persists user data in the browser
  }
  function purgeLegacy() {
    // Older versions kept progress in this browser. It must not outlive a sign-out, so remove it.
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
  }
  function load() {
    purgeLegacy();
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
    return fetch(SUPABASE_URL + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, keepalive: method !== 'GET' })
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
    if (kind === 'dans') {
      var d = diagOf(state), a = d.results[key], w = d.written && d.written[key];
      if (a) return { user_id: uid, item_id: key, kind: 'mcq', topic: a.topic, ref: a.ref || null, difficulty: a.d, correct: !!a.c, confidence: a.k, score: null, updated_at: iso(a.t) };
      if (w) return { user_id: uid, item_id: key, kind: 'written', topic: w.topic, ref: w.ref || null, difficulty: w.d, correct: null, confidence: null, score: w.s, updated_at: iso(w.t) };
      return null;
    }
    if (kind === 'plan') return state.plan ? { user_id: uid, plan: state.plan, updated_at: iso(state.plan.at || Date.now()) } : null;
    if (kind === 'run') { var u = (diagOf(state).runs || []).filter(function (x) { return x.id === key; })[0]; return u && { user_id: uid, run_id: key, answered: u.n, correct: u.ok, updated_at: iso(u.t) }; }
    if (kind === 'jd') {
      var j = state.jd;
      if (j) return { user_id: uid, active: true, level: j.level || null, years: j.years == null ? null : j.years, topics: j.topics || {}, updated_at: iso(j.t || Date.now()) };
      return state.jdT ? { user_id: uid, active: false, level: null, years: null, topics: {}, updated_at: iso(state.jdT) } : null;
    }
    var m = state.marks[key]; return m && { user_id: uid, question_id: key, status: m.s || null, bookmarked: !!m.b, updated_at: iso(m.t) };
  }
  function pushRows(sess, items) {
    var by = { goal: [], rating: [], mark: [], dans: [], run: [], jd: [], plan: [] };
    items.forEach(function (p) { var row = rowFor(p[0], p[1], sess.uid); if (row) by[p[0]].push(row); });
    var jobs = [];
    if (by.goal.length) jobs.push(rest('POST', 'user_goals?on_conflict=user_id', sess.token, by.goal, 'resolution=merge-duplicates,return=minimal'));
    if (by.rating.length) jobs.push(rest('POST', 'topic_ratings?on_conflict=user_id,topic_id', sess.token, by.rating, 'resolution=merge-duplicates,return=minimal'));
    if (by.mark.length) jobs.push(rest('POST', 'question_marks?on_conflict=user_id,question_id', sess.token, by.mark, 'resolution=merge-duplicates,return=minimal'));
    // Skill-check tables come from a separate migration: if it is not applied yet, keep everything else syncing.
    function soft(promise) { return promise.catch(function (e) { console.warn('[readiness] skill-check sync skipped:', e.message); }); }
    if (by.dans.length) jobs.push(soft(rest('POST', 'diag_answers?on_conflict=user_id,item_id', sess.token, by.dans, 'resolution=merge-duplicates,return=minimal')));
    if (by.run.length) jobs.push(soft(rest('POST', 'diag_runs?on_conflict=user_id,run_id', sess.token, by.run, 'resolution=merge-duplicates,return=minimal')));
    if (by.jd.length) jobs.push(soft(rest('POST', 'user_jd?on_conflict=user_id', sess.token, by.jd, 'resolution=merge-duplicates,return=minimal')));
    if (by.plan.length) jobs.push(soft(rest('POST', 'user_plan?on_conflict=user_id', sess.token, by.plan, 'resolution=merge-duplicates,return=minimal')));
    return Promise.all(jobs);
  }
  var pushFails = 0;
  function flushPush() {
    var items = Object.keys(pushQueue).map(function (k) { return pushQueue[k]; });
    pushQueue = {};
    if (!items.length) return Promise.resolve();
    return cfg.getSession().then(function (sess) {
      if (!sess) return null;
      return pushRows(sess, items).then(function () { pushFails = 0; });
    }).catch(function (e) {
      // Nothing is kept in the browser, so a failed write must be retried or it is lost.
      console.warn('[readiness] push failed; retrying', e.message);
      items.forEach(function (p) { pushQueue[p[0] + '|' + p[1]] = p; });
      if (++pushFails <= 6) { clearTimeout(pushTimer); pushTimer = setTimeout(flushPush, Math.min(30000, 2000 * pushFails * pushFails)); }
    });
  }
  // Leaving the page: send what is pending now rather than waiting for the debounce.
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); flushPush(); } });
      window.addEventListener('pagehide', function () { clearTimeout(pushTimer); flushPush(); });
    }
  } catch (e) { /* not a browser */ }

  /** Merge quiz answers, runs and the JD by "newer wins". A null remote means the table does not exist yet: stay local. */
  function mergeSkillCheck(rAns, rRuns, rJd, push) {
    var d = state.diag = state.diag && state.diag.results ? state.diag : { results: {}, written: {}, runs: [], last: 0 };
    d.written = d.written || {}; d.runs = d.runs || [];
    d.runs.forEach(function (r) { if (!r.id) r.id = 'l' + r.t; });
    if (rAns) {
      var seen = {};
      rAns.forEach(function (r) {
        seen[r.item_id] = 1;
        var t = Date.parse(r.updated_at), isW = r.kind === 'written', l = isW ? d.written[r.item_id] : d.results[r.item_id];
        if (!l || l.t < t) {
          if (isW) d.written[r.item_id] = { s: Number(r.score), topic: r.topic, ref: r.ref, d: r.difficulty, t: t };
          else d.results[r.item_id] = { c: !!r.correct, k: r.confidence, topic: r.topic, ref: r.ref, d: r.difficulty, t: t };
        } else if (l.t > t) push.push(['dans', r.item_id]);
      });
      Object.keys(d.results).concat(Object.keys(d.written)).forEach(function (k) { if (!seen[k]) push.push(['dans', k]); });
    }
    if (rRuns) {
      var byId = {}; d.runs.forEach(function (r) { byId[r.id] = r; });
      var seenRun = {};
      rRuns.forEach(function (r) {
        seenRun[r.run_id] = 1; var t = Date.parse(r.updated_at), l = byId[r.run_id];
        if (!l) d.runs.push({ id: r.run_id, t: t, n: r.answered, ok: r.correct });
        else if (l.t < t) { l.t = t; l.n = r.answered; l.ok = r.correct; }
        else if (l.t > t) push.push(['run', l.id]);
      });
      d.runs.forEach(function (r) { if (!seenRun[r.id]) push.push(['run', r.id]); });
      d.runs.sort(function (a, b) { return a.t - b.t; }); if (d.runs.length > 20) d.runs = d.runs.slice(-20);
    }
    if (rJd) {
      var rj = rJd[0], rt = rj ? Date.parse(rj.updated_at) : 0, lt = state.jd ? (state.jd.t || 0) : (state.jdT || 0);
      if (rj && rt > lt) {
        if (rj.active) { state.jd = { level: rj.level, years: rj.years, topics: rj.topics || {}, t: rt }; state.jdT = 0; }
        else { state.jd = null; state.jdT = rt; }
      } else if ((state.jd || state.jdT) && lt > rt) push.push(['jd', 'j']);
    }
    var last = 0; Object.keys(d.results).forEach(function (k) { last = Math.max(last, d.results[k].t || 0); });
    Object.keys(d.written).forEach(function (k) { last = Math.max(last, d.written[k].t || 0); });
    d.last = Math.max(d.last || 0, last);
  }

  function sync() {
    return cfg.getSession().then(function (sess) {
      if (!sess) {
        if (state.owner) { state = emptyState(); save(); emit(); }   // signed out: nothing of the previous user may remain
        return { ok: false, reason: 'signed-out' };
      }
      if (state.owner && state.owner !== sess.uid) { state = emptyState(); }   // different account on this browser
      state.owner = sess.uid;
      var q = 'select=*&user_id=eq.' + sess.uid;
      return Promise.all([
        rest('GET', 'user_goals?' + q, sess.token),
        rest('GET', 'topic_ratings?' + q, sess.token),
        rest('GET', 'question_marks?' + q + '&limit=5000', sess.token),
        rest('GET', 'diag_answers?' + q + '&limit=1000', sess.token).catch(function () { return null; }),   // null = table not created yet
        rest('GET', 'diag_runs?' + q + '&order=updated_at.desc&limit=20', sess.token).catch(function () { return null; }),
        rest('GET', 'user_jd?' + q, sess.token).catch(function () { return null; }),
        rest('GET', 'user_plan?' + q, sess.token).catch(function () { return null; })
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
        mergeSkillCheck(res[3], res[4], res[5], push);
        if (res[6]) {
          var rp = res[6][0], rpt = rp ? Date.parse(rp.updated_at) : 0, lpt = state.plan ? (state.plan.at || 0) : 0;
          if (rp && rpt > lpt) state.plan = rp.plan;
          else if (state.plan && lpt > rpt) push.push(['plan', 'p']);
        }
        save(); emit();
        return push.length ? pushRows(sess, push).then(function () { return { ok: true, pushed: push.length }; }) : { ok: true, pushed: 0 };
      });
    }).catch(function (e) { console.warn('[readiness] sync failed; continuing locally', e.message); return { ok: false, reason: e.message }; });
  }

  // Analytics must never break the page (gtag may be absent in tests or blocked by the browser).
  function track(name, params) { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) { /* ignore */ } }
  // Activation: the first time this browser marks a question Got it / Revisit.
  function firstMarkOnce() {
    try {
      var s = (typeof localStorage !== 'undefined') ? localStorage : null; if (!s || s.getItem('droidly_first_mark_sent')) return;   // analytics de-dupe only, not user data
      s.setItem('droidly_first_mark_sent', '1'); track('first_task_marked');
    } catch (e) { /* ignore */ }
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
    track('question_marked', { status: patch.s !== undefined ? (state.marks[id] ? state.marks[id].s : 'cleared') : 'save', topic: String(id).split(':')[0] });
    if (state.marks[id] && state.marks[id].s) firstMarkOnce();
    return state.marks[id] || null;
  }
  /** jd: the object returned by DroidlyDiagnostic.analyzeJD (or null to clear). The pasted text itself is never stored. */
  function setJD(jd) {
    state.jd = jd ? { level: jd.level || null, years: jd.years == null ? null : jd.years, topics: jd.topics || {}, t: Date.now() } : null;
    state.jdT = jd ? 0 : Date.now();   // when it was removed, so the removal syncs to other devices
    save(); emit(); queuePush('jd', 'j');
  }
  /** Record graded diagnostic answers (outputs of gradeMcq / gradeWritten). Kept on this device only. */
  function recordDiag(results, opts) {
    var d = state.diag = state.diag && state.diag.results ? state.diag : { results: {}, written: {}, runs: [], last: 0 };
    d.written = d.written || {}; d.runs = d.runs || [];
    var now = Date.now(), n = 0, ok = 0;
    (results || []).forEach(function (r) {
      if (r.type === 'written') d.written[r.id] = { s: r.s, topic: r.topic, ref: r.ref, d: r.d, t: now };
      else { d.results[r.id] = { c: !!r.c, k: r.k, topic: r.topic, ref: r.ref, d: r.d, t: now }; n++; if (r.c) ok++; }
    });
    d.last = now;
    var tail = d.runs[d.runs.length - 1], rid = opts && opts.run, runKey;
    if (rid && tail && tail.id === rid) { tail.n += n; tail.ok += ok; tail.t = now; runKey = rid; }   // answers saved one by one belong to one quiz run
    else { runKey = rid || ('r' + now); d.runs.push({ id: runKey, t: now, n: n, ok: ok }); if (d.runs.length > 20) d.runs = d.runs.slice(-20); }
    save(); emit();
    (results || []).forEach(function (r) { queuePush('dans', r.id); });
    queuePush('run', runKey);
    track('diagnostic_recorded', { answered: n, correct: ok });
  }
  function clearDiag() {
    state.diag = { results: {}, written: {}, runs: [], last: 0 }; state.jd = null; state.jdT = 0; save(); emit();
    cfg.getSession().then(function (sess) {   // best effort: wipe the signed-in user's saved copy too
      if (!sess) return;
      ['diag_answers', 'diag_runs', 'user_jd'].forEach(function (t) { rest('DELETE', t + '?user_id=eq.' + sess.uid, sess.token).catch(function () { /* table may not exist */ }); });
    }).catch(function () { /* ignore */ });
  }
  function clearLocal() { state = emptyState(); save(); emit(); }

  /** Today's plan: reuse the saved one unless the day, the goal or the ratings changed (or force). */
  function ensurePlan(index, force) {
    var now = new Date();
    var sig = JSON.stringify([state.goals && [state.goals.level, state.goals.company, state.goals.minutes, state.goals.date], state.ratings && Object.keys(state.ratings).sort().map(function (k) { return k + state.ratings[k].v; }), diagOf(state).last, state.jd && state.jd.t]);
    var p = state.plan;
    if (!force && p && p.on === ymd(now) && p.sig === sig) return p;
    var carry = [];
    if (p && p.on === ymd(now) && p.days[0]) carry = p.days[0].tasks.filter(function (t) { return isDone(t, state, p.at); });
    var plan = buildPlan(index, state, { today: now, carry: carry });
    plan.sig = sig; state.plan = plan; save(); queuePush('plan', 'p');
    return plan;
  }

  return {
    TOPIC_ORDER: TOPIC_ORDER, DEFAULT_GOALS: DEFAULT_GOALS, RATING_PRIOR: RATING_PRIOR,
    LEVELS: LEVELS, weightsFor: weightsFor, topicStats: topicStats, readiness: readiness, readinessByLevel: readinessByLevel,
    skillsToImprove: skillsToImprove, buildPlan: buildPlan, isDone: isDone,
    ymd: ymd, parseYmd: parseYmd, daysBetween: daysBetween,
    load: load, get: function () { return state; }, onChange: onChange, configure: configure, sync: sync,
    setGoals: setGoals, setRating: setRating, setMark: setMark, setJD: setJD, recordDiag: recordDiag, clearDiag: clearDiag, clearLocal: clearLocal, ensurePlan: ensurePlan,
    _setState: function (s) { state = s; }                           // tests only
  };
});
