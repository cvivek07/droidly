/*!
 * Droidly Daily practice: picks "Today's 5", schedules reviews (spaced repetition) and counts streaks.
 * Pure functions only (no DOM, no storage). The practice page loads and saves everything in Supabase.
 *
 *  pick(index, state, reviews, today, opts) -> [{ id, why }]   why: 'due' | 'revisit' | 'missed' | 'new'
 *  schedule(prev, result, today)            -> { box, due, reps }
 *  streak(days, today)                      -> { current, doneToday }
 *  week(days, today)                        -> last 7 days, oldest first: [{ day, label, done, started, isToday }]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DroidlyPractice = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAILY = 5;
  var MIN_NEW = 2;                          // keep learning something new even on heavy review days
  var GAP = [1, 3, 7, 14, 30, 60, 90];      // days until the next review, by box
  var MAX_BOX = GAP.length - 1;
  var TOPIC_ORDER = ['android', 'kotlin', 'compose', 'coroutines', 'flows', 'architecture', 'di',
    'networking', 'storage', 'buildtools', 'performance', 'hr'];   // no sysdesign: those are long walkthrough pages

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }

  /** After grading: "Got it" moves the question to a longer gap; "Not yet" brings it back tomorrow. */
  function schedule(prev, result, today) {
    var box = result === 'got_it' ? Math.min((prev && prev.box != null ? prev.box : 0) + 1, MAX_BOX) : 0;
    return { box: box, due: addDays(today, GAP[box]), reps: ((prev && prev.reps) || 0) + 1 };
  }

  function itemMap(index) {
    var m = {};
    Object.keys((index && index.topics) || {}).forEach(function (tid) {
      if (tid === 'sysdesign') return;
      (index.topics[tid].items || []).forEach(function (it) { m[it.id] = { it: it, topic: tid }; });
    });
    return m;
  }

  /** Today's set. Reviews first (due, then marked "Revisit", then skill-check misses), always with some new questions. */
  function pick(index, state, reviews, today, opts) {
    opts = opts || {};
    var n = opts.n || DAILY, exclude = opts.exclude || {}, items = itemMap(index);
    var marks = (state && state.marks) || {}, rev = reviews || {}, taken = {};
    function ok(id) { return items[id] && !exclude[id] && !taken[id]; }

    var due = Object.keys(rev).filter(function (id) { return ok(id) && rev[id].due <= today; })
      .sort(function (a, b) { return rev[a].due < rev[b].due ? -1 : rev[a].due > rev[b].due ? 1 : (rev[a].box - rev[b].box) || (a < b ? -1 : 1); })
      .map(function (id) { return { id: id, why: 'due' }; });
    var revisit = Object.keys(marks).filter(function (id) { return ok(id) && !rev[id] && marks[id] && marks[id].s === 'revisit'; })
      .sort(function (a, b) { return (marks[a].t || 0) - (marks[b].t || 0) || (a < b ? -1 : 1); })
      .map(function (id) { return { id: id, why: 'revisit' }; });
    var d = state && state.diag && state.diag.results ? state.diag.results : {}, seenMiss = {};
    var missed = Object.keys(d).sort().map(function (k) { return d[k]; })
      .filter(function (r) { return r && r.c === false && r.ref && ok(r.ref) && !rev[r.ref] && !(marks[r.ref] && marks[r.ref].s) && !seenMiss[r.ref] && (seenMiss[r.ref] = 1); })
      .map(function (r) { return { id: r.ref, why: 'missed' }; });
    var review = due.concat(revisit, missed);

    // New questions: follow the learning path from the topic being worked on; without a path, core questions topic by topic.
    var fresh = [];
    function isNew(id) { return ok(id) && !rev[id] && !(marks[id] && marks[id].s); }
    var path = state && state.plan && state.plan.path && state.plan.path.length ? state.plan.path : null;
    if (path) {
      var topics = (state && state.topics) || {}, start = 0;
      var cur = opts.currentTopic;
      path.forEach(function (e, i) { if (cur && e.id === cur) start = i; });
      if (!cur) { for (var i = 0; i < path.length; i++) { if (!(topics[path[i].id] && topics[path[i].id].c)) { start = i; break; } } }
      path.slice(start).concat(path.slice(0, start)).forEach(function (e) {
        if (e.id === 'sysdesign' || (topics[e.id] && topics[e.id].c)) return;
        (e.steps || []).forEach(function (id) { if (isNew(id)) fresh.push({ id: id, why: 'new' }); });
      });
    }
    if (!fresh.length) {
      TOPIC_ORDER.forEach(function (tid) {
        var its = (index.topics[tid] && index.topics[tid].items) || [];
        its.filter(function (x) { return x.m; }).concat(its.filter(function (x) { return !x.m; }))
          .forEach(function (x) { if (isNew(x.id)) fresh.push({ id: x.id, why: 'new' }); });
      });
    }

    var out = [];
    function take(list, max) { list.forEach(function (x) { if (out.length < max && !taken[x.id]) { taken[x.id] = 1; out.push(x); } }); }
    take(review, n - Math.min(MIN_NEW, fresh.length));
    take(fresh, n);
    take(review, n);
    return out;
  }

  function doneCount(row) { return row && row.results ? Object.keys(row.results).length : 0; }
  function isDone(row) { var len = row && row.items ? row.items.length : 0; return len > 0 && doneCount(row) >= Math.min(DAILY, len); }

  /** Days in a row with the day's set finished. Today counts once finished; until then the streak from yesterday still stands. */
  function streak(days, today) {
    var by = {}; (days || []).forEach(function (r) { by[r.day] = r; });
    var doneToday = isDone(by[today]), d = doneToday ? today : addDays(today, -1), n = 0;
    while (isDone(by[d])) { n++; d = addDays(d, -1); }
    return { current: n, doneToday: doneToday };
  }

  var DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  function week(days, today) {
    var by = {}; (days || []).forEach(function (r) { by[r.day] = r; });
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var day = addDays(today, -i), r = by[day];
      out.push({ day: day, label: DOW[parse(day).getDay()], done: isDone(r), started: doneCount(r) > 0, isToday: i === 0 });
    }
    return out;
  }

  return { DAILY: DAILY, GAP: GAP, pick: pick, schedule: schedule, streak: streak, week: week, isDone: isDone, doneCount: doneCount, ymd: ymd, addDays: addDays };
});
