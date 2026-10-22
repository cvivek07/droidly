/*!
 * Droidly questions page: layout and behaviour for the redesign.
 * Runs before question-marks.js and voice-questions.js and gives them slots:
 *   .q-right   (in each card header)  -> the Done check
 *   .qa-tools  (in each answer)       -> Listen and Save
 * Adds: search across all topics, filter chips, topic progress with Continue, phone topic chips,
 *       code folding with Copy, and an answer footer with Mark done / Next question.
 * The question content itself is not changed.
 */
(function () {
  'use strict';
  var TOPICS = [['android', 'Android'], ['kotlin', 'Kotlin'], ['compose', 'Compose'], ['coroutines', 'Coroutines'], ['flows', 'Kotlin Flows'],
    ['architecture', 'Architecture'], ['di', 'Dependency Injection'], ['networking', 'Networking'], ['storage', 'Data Storage'],
    ['buildtools', 'Build Tools'], ['performance', 'Performance'], ['hr', 'HR & Behavioural'], ['sysdesign', 'System Design']];
  var NAME = {}; TOPICS.forEach(function (t) { NAME[t[0]] = t[1]; });
  var FOLD_LINES = 14;
  var state = { q: '', f: 'all' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function track(n, p) { try { if (typeof gtag === 'function') gtag('event', n, p || {}); } catch (e) { /* ignore */ } }
  function R() { return window.Readiness; }
  function marks() { var r = R(); return (r && r.get && r.get().marks) || {}; }
  function activeTopic() { var s = $('.topic-section.active'); return s ? s.id.replace('topic-', '') : 'android'; }
  function qCards(sec) { return $$('.q-card', sec); }
  function qid(card) { return card.dataset.qid; }
  function isDone(card) { var m = marks()[qid(card)]; return !!(m && m.s); }
  function isSaved(card) { var m = marks()[qid(card)]; return !!(m && m.b); }
  var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  var TICK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* ---------- 1. cards: slots, code folding, footer ---------- */
  function prepareCards() {
    $$('.topic-section').forEach(function (sec) {
      var topic = sec.id.replace('topic-', ''); if (topic === 'sysdesign') return;
      qCards(sec).forEach(function (card) {
        if (card.dataset.qui) return; card.dataset.qui = '1';
        var num = card.querySelector('.q-number'), m = num && /Q(\d+)/.exec(num.textContent);
        card.dataset.qid = m ? topic + ':' + m[1] : '';
        card.dataset.n = m ? m[1] : '';
        var d = card.querySelector('.q-diff'); card.dataset.diff = d ? (/(easy|medium|hard)/.exec(d.className) || [, ''])[1] : '';
        var tag = card.querySelector('.q-tag'); card.dataset.most = tag && /most asked/i.test(tag.textContent) ? '1' : '';
        var qt = card.querySelector('.q-text'); card.dataset.search = (qt ? qt.textContent : '').toLowerCase() + ' ' + (tag ? tag.textContent.toLowerCase() : '');

        var head = card.querySelector('.q-card-header');
        var tog = card.querySelector('.q-toggle'); if (tog) tog.remove();
        if (head && !head.querySelector('.q-right')) head.appendChild(el('div', 'q-right'));

        var inner = card.querySelector('.q-answer-inner'); if (!inner) return;
        var label = inner.querySelector('.answer-label');
        var bar = el('div', 'qa-bar');
        var lab = el('span', 'qa-label', 'Answer');
        var tools = el('div', 'qa-tools'); tools.setAttribute('data-tts-skip', ''); bar.appendChild(lab); bar.appendChild(tools);
        if (label) label.replaceWith(bar); else inner.insertBefore(bar, inner.firstChild);

        $$('pre.code-block', inner).forEach(function (pre) {
          if (pre.parentElement.classList.contains('qcode')) return;
          var wrap = el('div', 'qcode'); wrap.setAttribute('data-tts-code', ''); pre.parentNode.insertBefore(wrap, pre);
          var top = el('div', 'qcode-bar', '<span>Kotlin</span>'); top.setAttribute('data-tts-skip', '');
          if (/^\s*</.test(pre.textContent) && !/fun |val |class /.test(pre.textContent)) top.firstChild.textContent = 'Code';
          var copy = el('button', 'qcode-copy', 'Copy'); copy.type = 'button';
          copy.addEventListener('click', function (e) {
            e.stopPropagation();
            try { navigator.clipboard.writeText(pre.textContent).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1500); }); } catch (x) { /* ignore */ }
            track('question_code_copy');
          });
          top.appendChild(copy); wrap.appendChild(top); wrap.appendChild(pre);
          var lines = pre.textContent.replace(/\n+$/, '').split('\n').length;
          if (lines > FOLD_LINES + 4) {
            wrap.classList.add('folded');
            var more = el('button', 'qcode-more', 'Show full code (' + (lines - FOLD_LINES) + ' more lines) ▾'); more.type = 'button';
            more.addEventListener('click', function (e) {
              e.stopPropagation();
              var open = wrap.classList.toggle('folded');
              more.textContent = open ? 'Show full code (' + (lines - FOLD_LINES) + ' more lines) ▾' : 'Show less ▴';
              if (open) wrap.scrollIntoView({ block: 'nearest' });
            });
            wrap.appendChild(more);
          }
        });

        var foot = el('div', 'qa-foot');
        var done = el('button', 'qa-done', TICK + '<span>Mark done</span>'); done.type = 'button';
        done.addEventListener('click', function (e) {
          e.stopPropagation();
          var b = card.querySelector('.rd-ic-done'); if (b) b.click();
          track('question_mark_done_footer');
        });
        var next = el('button', 'qa-next', '<span>Next question</span>' + CHEV); next.type = 'button';
        next.addEventListener('click', function (e) { e.stopPropagation(); goNext(card); });
        foot.appendChild(done); foot.appendChild(next);
        inner.appendChild(foot);
      });
    });
  }
  function visibleCards(sec) { return qCards(sec).filter(function (c) { return !c.classList.contains('qf-hide'); }); }
  function openCard(card) {
    if (!card) return;
    card.classList.add('open');
    setTimeout(function () {
      var y = card.getBoundingClientRect().top + window.scrollY - stickyOffset();
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, 60);
  }
  function stickyOffset() { var t = $('#contentToolbar'); return 68 + (t ? t.offsetHeight : 0) + 10; }
  function goNext(card) {
    var sec = card.closest('.topic-section'), list = visibleCards(sec), i = list.indexOf(card), nx = list[i + 1];
    card.classList.remove('open');
    if (nx) { openCard(nx); track('question_next'); }
    else { var t = sec.querySelector('.qt-prog'); (t || sec).scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }

  /* ---------- 2. topic headers: progress + continue ---------- */
  function prepareHeaders() {
    $$('.topic-section').forEach(function (sec) {
      var topic = sec.id.replace('topic-', ''), h = sec.querySelector('.topic-header'); if (!h || h.dataset.qui) return;
      h.dataset.qui = '1';
      if (topic === 'sysdesign') return;
      var row = el('div', 'qt-row');
      var prog = el('div', 'qt-prog', '<div class="qt-bar"><i></i></div><span class="qt-count"></span>');
      var cont = el('button', 'qt-continue', ''); cont.type = 'button';
      cont.addEventListener('click', function () {
        var c = firstUndone(sec); if (!c) return;
        clearFilters(); openCard(c); track('question_continue', { topic: topic });
      });
      row.appendChild(prog); row.appendChild(cont);
      h.appendChild(row);
    });
  }
  function firstUndone(sec) { var l = qCards(sec); for (var i = 0; i < l.length; i++) if (!isDone(l[i])) return l[i]; return null; }
  function counts(topic) {
    var sec = document.getElementById('topic-' + topic); if (!sec) return { done: 0, total: 0 };
    var l = qCards(sec); if (topic === 'sysdesign') return { done: 0, total: $$('.sd-card', sec).length };
    return { done: l.filter(isDone).length, total: l.length };
  }

  /* ---------- 3. toolbar: search + chips; phone topic chips ---------- */
  var FILTERS = [['all', 'All'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['most', '⭐ Most asked'], ['notdone', 'Not done'], ['saved', '☆ Saved']];
  function prepareToolbar() {
    var tb = $('#contentToolbar'); if (!tb || tb.dataset.qui) return; tb.dataset.qui = '1';
    var box = el('div', 'qf');
    box.innerHTML = '<label class="qf-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input type="search" id="qfSearch" placeholder="Search 600+ questions" aria-label="Search questions" autocomplete="off"><button type="button" class="qf-clear" aria-label="Clear search" hidden>×</button></label>' +
      '<div class="qf-chips" role="toolbar" aria-label="Filter questions">' + FILTERS.map(function (f) {
        return '<button type="button" class="qf-chip" data-f="' + f[0] + '" aria-pressed="' + (f[0] === 'all') + '">' + f[1] + '</button>';
      }).join('') + '</div><div class="qf-status" aria-live="polite"></div>';
    tb.appendChild(box);
    var inp = $('#qfSearch', box), clr = $('.qf-clear', box), t = 0;
    inp.addEventListener('input', function () {
      clearTimeout(t); clr.hidden = !inp.value;
      t = setTimeout(function () { state.q = inp.value.trim().toLowerCase(); apply(); if (state.q.length > 2) track('question_search'); }, 140);
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') { inp.value = ''; clr.hidden = true; state.q = ''; apply(); } });
    clr.addEventListener('click', function () { inp.value = ''; clr.hidden = true; state.q = ''; apply(); inp.focus(); });
    $$('.qf-chip', box).forEach(function (b) {
      b.addEventListener('click', function () { state.f = b.dataset.f; apply(); track('question_filter', { f: state.f }); });
    });

    var content = $('.content');
    if (content && !$('.qm-topics')) {
      var chips = el('div', 'qm-topics');
      chips.setAttribute('role', 'tablist'); chips.setAttribute('aria-label', 'Topics');
      chips.innerHTML = TOPICS.map(function (x) { return '<button type="button" class="qm-topic" data-t="' + x[0] + '">' + x[1] + '<small></small></button>'; }).join('');
      content.insertBefore(chips, content.firstChild);
      $$('.qm-topic', chips).forEach(function (b) { b.addEventListener('click', function () { if (typeof window.switchTopic === 'function') window.switchTopic(b.dataset.t); }); });
    }
  }
  function clearFilters() {
    state.f = 'all'; state.q = '';
    var inp = $('#qfSearch'); if (inp) inp.value = '';
    var c = $('.qf-clear'); if (c) c.hidden = true;
    apply();
  }
  function passes(card) {
    var f = state.f;
    if (f === 'easy' || f === 'medium' || f === 'hard') { if (card.dataset.diff !== f) return false; }
    else if (f === 'most') { if (!card.dataset.most) return false; }
    else if (f === 'notdone') { if (isDone(card)) return false; }
    else if (f === 'saved') { if (!isSaved(card)) return false; }
    if (state.q) {
      var words = state.q.split(/\s+/);
      for (var i = 0; i < words.length; i++) if (card.dataset.search.indexOf(words[i]) < 0) return false;
    }
    return true;
  }
  function apply() {
    var content = $('.content'), searching = !!state.q, shown = 0;
    if (content) content.classList.toggle('qf-searching', searching);
    $$('.qf-chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.f === state.f)); });
    var act = activeTopic();
    $$('.topic-section').forEach(function (sec) {
      var topic = sec.id.replace('topic-', ''), any = 0;
      if (topic === 'sysdesign') { sec.classList.toggle('qf-has', false); return; }
      var inScope = searching || topic === act;
      qCards(sec).forEach(function (c) {
        var ok = !inScope || passes(c);
        c.classList.toggle('qf-hide', !ok);
        if (ok && inScope) any++;
      });
      sec.classList.toggle('qf-has', searching && any > 0);
      if (!sec.querySelector('.qf-sec-label')) {
        var lab = el('div', 'qf-sec-label', NAME[topic] || topic);
        var hdr = sec.querySelector('.topic-header'); sec.insertBefore(lab, hdr ? hdr.nextSibling : sec.firstChild);
      }
      if (inScope) shown += any;
    });
    var st = $('.qf-status');
    if (st) {
      if (searching) st.textContent = shown ? shown + ' question' + (shown > 1 ? 's' : '') + ' match "' + state.q + '" across all topics' : 'No questions match "' + state.q + '". Try another word.';
      else if (state.f !== 'all') st.textContent = shown ? shown + ' shown' : (state.f === 'saved' ? 'No saved questions in this topic yet. Tap ☆ Save in any answer.' : state.f === 'notdone' ? 'Everything in this topic is done. Nice work.' : 'No questions match this filter.');
      else st.textContent = '';
    }
  }

  /* ---------- 4. progress everywhere ---------- */
  function refresh() {
    TOPICS.forEach(function (x) {
      var c = counts(x[0]), label = x[0] === 'sysdesign' ? c.total + ' designs' : c.done + '/' + c.total;
      var nav = document.getElementById('tnav-' + x[0]);
      if (nav) {
        var s = nav.querySelector('.topic-nav-count');
        if (!s) { s = el('span', 'topic-nav-count'); var lock = nav.querySelector('.topic-nav-lock'); nav.insertBefore(s, lock); }
        s.textContent = label;
      }
      var chip = $('.qm-topic[data-t="' + x[0] + '"] small'); if (chip) chip.textContent = x[0] === 'sysdesign' ? '' : ' ' + label;
      var sec = document.getElementById('topic-' + x[0]); if (!sec || x[0] === 'sysdesign') return;
      var bar = sec.querySelector('.qt-bar i'), cnt = sec.querySelector('.qt-count'), cont = sec.querySelector('.qt-continue');
      if (bar) bar.style.width = (c.total ? Math.round(100 * c.done / c.total) : 0) + '%';
      if (cnt) cnt.innerHTML = '<b>' + c.done + '</b> of ' + c.total + ' done';
      if (cont) {
        var f = firstUndone(sec);
        cont.hidden = !f;
        if (f) cont.innerHTML = (c.done ? 'Continue at Q' : 'Start at Q') + f.dataset.n + ' ' + CHEV;
      }
      qCards(sec).forEach(function (card) {
        var d = isDone(card), b = card.querySelector('.qa-done');
        card.classList.toggle('qd-done', d);
        if (b) { b.classList.toggle('on', d); b.querySelector('span').textContent = d ? 'Done' : 'Mark done'; }
      });
    });
    $$('.qm-topic').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.t === activeTopic())); });
    if (state.f === 'notdone' || state.f === 'saved') apply();
  }

  /* ---------- wiring ---------- */
  function wrapSwitch() {
    if (typeof window.switchTopic !== 'function' || window.switchTopic._qui) return;
    var orig = window.switchTopic;
    var wrapped = function (t, e) {
      var r = orig.apply(this, arguments);
      state.f = 'all'; state.q = ''; var inp = $('#qfSearch'); if (inp) inp.value = ''; var c = $('.qf-clear'); if (c) c.hidden = true;
      apply(); refresh();
      var chip = $('.qm-topic[data-t="' + t + '"]'); if (chip && chip.scrollIntoView) chip.scrollIntoView({ inline: 'center', block: 'nearest' });
      window.scrollTo({ top: 0 });
      return r;
    };
    wrapped._qui = true; window.switchTopic = wrapped;
  }
  function moveFooters() { $$('.qa-foot').forEach(function (f) { f.parentNode.appendChild(f); }); }

  prepareCards(); prepareHeaders(); prepareToolbar(); wrapSwitch(); apply();
  function late() {
    wrapSwitch(); moveFooters(); refresh(); apply();
    var r = R(); if (r && r.onChange && !late._sub) { late._sub = true; r.onChange(function () { setTimeout(refresh, 0); }); }
  }
  if (document.readyState === 'complete') late(); else window.addEventListener('load', late);
  document.addEventListener('DOMContentLoaded', function () { refresh(); });
})();
