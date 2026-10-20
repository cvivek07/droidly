/*!
 * Droidly diagnostic engine. No DOM, no network, no AI. UMD so it runs in the browser and under node tests.
 *
 * What it does
 *  - analyzeJD(text): reads a pasted job description and returns the level it implies and which topics it stresses.
 *  - selectMcq / selectWritten: picks a short, deterministic set of items for the user's level, role and JD.
 *  - gradeMcq / gradeWritten: scores answers. Written answers are graded against a key-point checklist
 *    (does the answer mention each point?). That measures coverage of the expected points, not understanding,
 *    and the UI says so.
 *  - summarize: per-topic results, including answers that were confident and wrong.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DroidlyDiagnostic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONF = ['sure', 'think', 'guess'];
  var DIFF_RANK = { easy: 0, medium: 1, hard: 2 };
  var LEVEL_TARGET = { '0-2': 0.5, '2-5': 1, '5+': 1.7 };
  var MIN_WORDS_FULL = 25;   // written answers shorter than this are scaled down; a one-liner cannot cover a rubric

  /* Terms that suggest a topic in a job description. Plain words, case-insensitive. */
  var JD_TERMS = {
    android: ['android sdk', 'activity', 'fragment', 'lifecycle', 'intent', 'broadcast', 'workmanager', 'android framework', 'jetpack'],
    kotlin: ['kotlin'],
    compose: ['jetpack compose', 'compose', 'declarative ui'],
    coroutines: ['coroutine', 'concurrency', 'multithreading', 'asynchronous'],
    flows: ['stateflow', 'sharedflow', 'kotlin flow', 'flows', 'rxjava', 'reactive'],
    architecture: ['mvvm', 'mvi', 'clean architecture', 'architecture', 'design pattern', 'solid', 'modular', 'multi-module'],
    di: ['hilt', 'dagger', 'koin', 'dependency injection'],
    networking: ['retrofit', 'okhttp', 'rest api', 'restful', 'graphql', 'networking', 'websocket', 'grpc', 'http'],
    storage: ['room', 'sqlite', 'datastore', 'persistence', 'local database', 'offline'],
    buildtools: ['gradle', 'ci/cd', 'ci cd', 'proguard', 'r8', 'fastlane', 'jenkins', 'github actions', 'build system', 'release pipeline'],
    performance: ['performance', 'profiling', 'memory leak', 'anr', 'startup time', 'jank', 'optimiz', 'optimis', 'baseline profile'],
    hr: ['leadership', 'mentor', 'stakeholder', 'collaborat', 'communication', 'ownership', 'cross-functional'],
    sysdesign: ['system design', 'scalab', 'distributed', 'design large', 'sdk', 'offline-first', 'architect']
  };

  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }

  /** Count non-overlapping occurrences of term in text (term already lower-case). */
  function countOf(text, term) {
    var n = 0, i = 0;
    while ((i = text.indexOf(term, i)) !== -1) { n++; i += term.length; }
    return n;
  }

  /**
   * Read a job description.
   * Returns { level|null, levelSource|null, years|null, topics: {tid: 0..1}, top: [{topic, strength, terms}], words }
   * Nothing is guessed when the text says nothing: level stays null.
   */
  function analyzeJD(text) {
    var t = lc(text).replace(/\s+/g, ' ');
    var out = { level: null, levelSource: null, years: null, topics: {}, top: [], words: t ? t.split(' ').length : 0 };
    if (!t) return out;

    // Years of experience: "3+ years", "5-8 years", "minimum 4 yrs". Use the lowest number found near "year".
    var yrs = null, re = /(\d{1,2})\s*(?:\+|-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/g, mt;
    while ((mt = re.exec(t))) {
      var a = +mt[1];
      if (a >= 0 && a <= 25 && (yrs === null || a < yrs)) yrs = a;
    }
    if (yrs !== null) {
      out.years = yrs;
      out.level = yrs >= 5 ? '5+' : yrs >= 2 ? '2-5' : '0-2';
      out.levelSource = yrs + '+ years of experience mentioned';
    } else if (/\b(staff|principal|lead|senior|sr\.)\b/.test(t)) {
      out.level = '5+'; out.levelSource = 'senior title mentioned';
    } else if (/\b(junior|fresher|entry[- ]level|graduate|intern|trainee)\b/.test(t)) {
      out.level = '0-2'; out.levelSource = 'entry-level wording';
    }

    Object.keys(JD_TERMS).forEach(function (tid) {
      var hits = 0, seen = [];
      JD_TERMS[tid].forEach(function (term) {
        var c = countOf(t, term);
        if (c > 0) { hits += Math.min(c, 3); seen.push(term); }
      });
      if (hits > 0) {
        var strength = Math.min(1, hits / 3);
        out.topics[tid] = Math.round(strength * 100) / 100;
        out.top.push({ topic: tid, strength: out.topics[tid], terms: seen.slice(0, 4) });
      }
    });
    out.top.sort(function (a, b) { return b.strength - a.strength || (a.topic < b.topic ? -1 : 1); });
    return out;
  }

  /* ---------- deterministic shuffling ---------- */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** A copy of the MCQ with its options in a seed-dependent order and `answer` re-pointed. */
  function shuffleOptions(item, seed) {
    var r = rng(hash(item.id + '|' + (seed == null ? 0 : seed)));
    var idx = item.options.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var x = idx[i]; idx[i] = idx[j]; idx[j] = x; }
    var copy = Object.assign({}, item);
    copy.options = idx.map(function (k) { return item.options[k]; });
    copy.answer = idx.indexOf(item.answer);
    return copy;
  }

  /* ---------- selection ---------- */
  function seenIds(state) {
    var d = state && state.diag;
    return d && d.results ? d.results : {};
  }

  /** Importance of each topic for this person: level/role/company weights x what the JD stresses. */
  function topicScores(opts) {
    var w = opts.weights || {};
    var jd = (opts.jd && opts.jd.topics) || {};
    var scores = {};
    Object.keys(w).forEach(function (t) { scores[t] = w[t]; });
    Object.keys(jd).forEach(function (t) { if (scores[t] == null) scores[t] = 0.5; });
    Object.keys(scores).forEach(function (t) { scores[t] = scores[t] * (1 + 1.5 * (jd[t] || 0)); });
    return scores;
  }

  function targetRank(level) { return LEVEL_TARGET[level] != null ? LEVEL_TARGET[level] : 1; }

  /**
   * Pick MCQ items. Deterministic for the same (items, state, opts).
   * opts: { count (default 12), level, weights: {topic: w}, jd, seed, topics: [only these topics] }
   * Preference order inside a topic: never answered > answered wrong > answered right; then closest to target difficulty.
   */
  function selectMcq(items, state, opts) {
    opts = opts || {};
    var count = opts.count || 12, seen = seenIds(state), seed = opts.seed == null ? 0 : opts.seed;
    var tr = targetRank(opts.level);
    var scores = topicScores(opts);
    var byTopic = {};
    items.forEach(function (it) {
      if (it.type !== 'mcq') return;
      if (opts.topics && opts.topics.indexOf(it.topic) === -1) return;
      (byTopic[it.topic] = byTopic[it.topic] || []).push(it);
    });
    var order = Object.keys(byTopic).sort(function (a, b) { return (scores[b] || 0.5) - (scores[a] || 0.5) || (a < b ? -1 : 1); });

    function rankItems(arr) {
      return arr.slice().sort(function (a, b) {
        function sc(it) {
          var s = seen[it.id];
          var prior = !s ? 0 : (s.c === false ? 4 : 8);          // retest misses before repeating right answers
          return prior + Math.abs((DIFF_RANK[it.diff] != null ? DIFF_RANK[it.diff] : 1) - tr) * 2;
        }
        return sc(a) - sc(b) || (hash(a.id + seed) - hash(b.id + seed));
      });
    }
    var ranked = {};
    order.forEach(function (t) { ranked[t] = rankItems(byTopic[t]); });

    // Allocate with D'Hondt: a topic's next slot is worth score / (slots so far + 1), capped at opts.perTopic (default 3) per topic.
    // Important topics (and ones the JD stresses) earn extra slots; low-weight topics may be left out of a short quiz.
    var alloc = {}, used = 0, inc = [], cap = opts.perTopic || 3;
    order.forEach(function (t) { alloc[t] = 0; });
    while (used < count) {
      var bestT = null, bestQ = -1;
      order.forEach(function (t) {
        if (alloc[t] >= cap || alloc[t] >= ranked[t].length) return;
        var q = (scores[t] || 0.5) / (alloc[t] + 1);
        if (q > bestQ) { bestQ = q; bestT = t; }
      });
      if (!bestT) break;
      alloc[bestT]++; used++;
    }
    order.forEach(function (t) { if (alloc[t] > 0) inc.push(t); });
    var picked = [];
    inc.forEach(function (t) { for (var i = 0; i < alloc[t]; i++) picked.push(ranked[t][i]); });
    // Present round-robin by topic importance, easier first inside a topic, so the quiz ramps up instead of clustering.
    picked.sort(function (a, b) {
      return (DIFF_RANK[a.diff] - DIFF_RANK[b.diff]) || ((scores[b.topic] || 0.5) - (scores[a.topic] || 0.5)) || (hash(a.id + seed) - hash(b.id + seed));
    });
    return picked.map(function (it) { return shuffleOptions(it, seed); });
  }

  /**
   * Pick written prompts. Prefers topics where the MCQ round found gaps (opts.gapTopics, in priority order), then topic importance.
   * opts: { count (default 2), gapTopics, weights, jd, level, seed }
   */
  function selectWritten(items, state, opts) {
    opts = opts || {};
    var count = opts.count == null ? 2 : opts.count, seen = seenIds(state);
    var scores = topicScores(opts), gaps = opts.gapTopics || [], tr = targetRank(opts.level);
    var cands = items.filter(function (it) { return it.type === 'written'; });
    cands.sort(function (a, b) {
      function sc(it) {
        var gi = gaps.indexOf(it.topic);
        var gapBonus = gi === -1 ? 0 : (10 - gi);
        var seenPenalty = (state && state.diag && state.diag.written && state.diag.written[it.id]) ? 6 : 0;
        return -((scores[it.topic] || 0.5) * 3 + gapBonus) + seenPenalty + Math.abs((DIFF_RANK[it.diff] != null ? DIFF_RANK[it.diff] : 1) - tr);
      }
      return sc(a) - sc(b) || (a.id < b.id ? -1 : 1);
    });
    return cands.slice(0, count);
  }

  /* ---------- grading ---------- */

  /**
   * item must be the (possibly shuffled) item the user saw. choice = index into item.options, or null for "don't know".
   * conf in CONF. Returns { correct, conf, flag }:
   *   solid        right
   *   gap          wrong, or "I don't know"
   * conf is only 'think' (answered) or 'guess' (I don't know); the UI no longer asks how sure the user is.
   */
  function gradeMcq(item, choice, conf) {
    var c = CONF.indexOf(conf) === -1 ? 'think' : conf;
    var correct = choice != null && choice === item.answer;
    var flag;
    if (correct) flag = 'solid';
    else flag = 'gap';
    if (choice == null) { c = 'guess'; flag = 'gap'; }
    return { id: item.id, type: 'mcq', topic: item.topic, ref: item.ref, d: item.diff, c: correct, k: c, flag: flag };
  }

  function wordCount(s) { var m = String(s || '').trim().match(/\S+/g); return m ? m.length : 0; }

  /**
   * Key-point checklist. A point counts if the answer contains any one of its terms (case-insensitive substring).
   * Short answers are scaled down: the checklist cannot be satisfied by a keyword list, so a minimum length applies.
   * Returns { score 0..1, hits: [{label, hit}], matched, total, words, short }
   */
  function gradeWritten(item, text) {
    var t = lc(text).replace(/\s+/g, ' ');
    var words = wordCount(text);
    var hits = item.keyPoints.map(function (kp) {
      var hit = kp.any.some(function (term) { return term && t.indexOf(lc(term)) !== -1; });
      return { label: kp.label, hit: hit };
    });
    var matched = hits.filter(function (h) { return h.hit; }).length;
    var raw = hits.length ? matched / hits.length : 0;
    var scale = Math.min(1, words / MIN_WORDS_FULL);
    return { id: item.id, type: 'written', topic: item.topic, ref: item.ref, d: item.diff,
      s: Math.round(raw * scale * 100) / 100, raw: Math.round(raw * 100) / 100,
      hits: hits, matched: matched, total: hits.length, words: words, short: words < MIN_WORDS_FULL };
  }

  /**
   * Per-topic roll-up of graded results (mcq and written). results: array from gradeMcq / gradeWritten.
   * Returns { topics: [{topic, answered, correct, pct, written}], gaps: [topic ids, weakest first], answered, correct }
   */
  function summarize(results) {
    var by = {};
    results.forEach(function (r) {
      var o = by[r.topic] = by[r.topic] || { topic: r.topic, answered: 0, correct: 0, written: [], refsMissed: [] };
      if (r.type === 'written') { o.written.push(r.s); if (r.s < 0.5 && r.ref) o.refsMissed.push(r.ref); return; }
      o.answered++;
      if (r.c) o.correct++;
      if (!r.c && r.ref) o.refsMissed.push(r.ref);
    });
    var topics = Object.keys(by).map(function (t) {
      var o = by[t];
      var parts = o.answered + o.written.length;
      var earned = o.correct + o.written.reduce(function (a, b) { return a + b; }, 0);
      o.pct = parts ? Math.round(100 * earned / parts) : 0;
      return o;
    });
    topics.sort(function (a, b) { return a.pct - b.pct || (a.topic < b.topic ? -1 : 1); });
    var answered = 0, correct = 0;
    topics.forEach(function (o) { answered += o.answered; correct += o.correct; });
    return { topics: topics, gaps: topics.filter(function (o) { return o.pct < 60; }).map(function (o) { return o.topic; }), answered: answered, correct: correct };
  }

  /** Check a bank of items for structural problems. Returns an array of messages (empty = ok). */
  function validateItems(items, indexIds) {
    var errs = [], ids = {};
    items.forEach(function (it) {
      if (ids[it.id]) errs.push('duplicate id ' + it.id); ids[it.id] = 1;
      if (indexIds && it.ref && !indexIds[it.ref]) errs.push(it.id + ': ref ' + it.ref + ' not in roadmap index');
      if (!it.topic || !it.q || !it.why) errs.push(it.id + ': missing topic/q/why');
      if (!(it.diff in DIFF_RANK)) errs.push(it.id + ': bad diff');
      if (it.type === 'mcq') {
        if (!Array.isArray(it.options) || it.options.length !== 4) errs.push(it.id + ': needs 4 options');
        else {
          if (!(it.answer >= 0 && it.answer < it.options.length)) errs.push(it.id + ': answer out of range');
          if (new Set(it.options).size !== it.options.length) errs.push(it.id + ': duplicate options');
        }
      } else if (it.type === 'written') {
        if (!Array.isArray(it.keyPoints) || it.keyPoints.length < 3) errs.push(it.id + ': needs >= 3 key points');
        else it.keyPoints.forEach(function (k, i) { if (!k.label || !Array.isArray(k.any) || !k.any.length) errs.push(it.id + ': key point ' + i + ' malformed'); });
      } else errs.push(it.id + ': unknown type');
    });
    return errs;
  }

  return {
    CONF: CONF, analyzeJD: analyzeJD, shuffleOptions: shuffleOptions, selectMcq: selectMcq, selectWritten: selectWritten,
    gradeMcq: gradeMcq, gradeWritten: gradeWritten, summarize: summarize, validateItems: validateItems,
    MIN_WORDS_FULL: MIN_WORDS_FULL
  };
});
