/*!
 * Adds "Done / Save" to every question on questions.html and supports
 * deep links like /questions.html?topic=kotlin&q=12 (used by the Roadmap).
 * Question ids are "<topic>:<Q number as printed on the card>", e.g. kotlin:12.
 */
(function () {
  'use strict';
  if (!window.Readiness) return;
  var R = window.Readiness;
  R.load();

  var css = document.createElement('style');
  css.textContent =
    '.rd-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:18px;padding-top:14px;border-top:1px dashed rgba(15,17,23,.12)}' +
    '.rd-btn{font:600 13px/1 inherit;font-family:inherit;padding:8px 14px;border-radius:100px;border:1px solid rgba(15,17,23,.14);background:#fff;color:#374151;cursor:pointer;transition:all .15s}' +
    '.rd-btn:hover{border-color:#3d7a4f;color:#2e6040}' +
    '.rd-btn[aria-pressed=true].rd-got{background:#3d7a4f;border-color:#3d7a4f;color:#fff}' +
    '.rd-btn[aria-pressed=true].rd-rev{background:#b45309;border-color:#b45309;color:#fff}' +
    '.rd-btn[aria-pressed=true].rd-save{background:#e8f2ec;border-color:#3d7a4f;color:#2e6040}' +
    '.rd-link{margin-left:auto;font-size:13px;font-weight:600;color:#3d7a4f;text-decoration:none}' +
    '.rd-hint{flex-basis:100%;font-size:12px;color:#6b7280}' +
    '.rd-chip{font-size:11px;font-weight:700;padding:2px 8px;border-radius:100px;margin-left:6px}' +
    '.rd-chip.got{background:#e8f2ec;color:#2e6040}.rd-chip.rev{background:#fef3c7;color:#92400e}.rd-chip.save{background:#eef2ff;color:#3730a3}';
  document.head.appendChild(css);

  var cards = {};      // id -> { card, bar, chip }
  var signedIn = null; // null = unknown
  var loadFailed = false; // signed in but the saved progress could not be loaded
  var knownCbs = [];   // actions waiting for the sign-in check to finish

  function idFor(card, topic) {
    var n = card.querySelector('.q-number');
    var num = n && /Q(\d+)/.exec(n.textContent);
    return num ? topic + ':' + num[1] : null;
  }

  function paint(id) {
    var c = cards[id]; if (!c) return;
    var m = R.get().marks[id] || {};
    c.btns.got.setAttribute('aria-pressed', m.s === 'got_it');
    c.btns.save.setAttribute('aria-pressed', !!m.b);
    c.btns.save.textContent = m.b ? '★ Saved' : '☆ Save';
    var html = '';
    if (m.s === 'got_it') html += '<span class="rd-chip got">✓ Done</span>';
    if (m.s === 'revisit') html += '<span class="rd-chip rev">↻ Revisit</span>';
    if (m.b) html += '<span class="rd-chip save">★ Saved</span>';
    c.chip.innerHTML = html;
  }

  // Marks are saved to the user's account, so a signed-out visitor is asked to sign in instead of marking.
  function gate(id, action) {
    return function () {
      var run = function () {
        if (signedIn) return action();
        var c = cards[id]; if (c && loadFailed) c.hint.textContent = 'Could not load your saved progress. Refresh the page to try again.';
        if (c) { c.hint.style.display = ''; c.hint.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        try { window.gtag && gtag('event', 'marks_gate_shown'); } catch (e) { /* ignore */ }
      };
      if (signedIn === null) knownCbs.push(run); else run();
    };
  }
  function btn(label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'rd-btn ' + cls; b.textContent = label; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    return b;
  }

  function enhance() {
    document.querySelectorAll('.topic-section').forEach(function (sec) {
      var topic = (sec.id || '').replace('topic-', '');
      if (!topic || topic === 'sysdesign') return;
      sec.querySelectorAll('.q-card').forEach(function (card) {
        var id = idFor(card, topic); if (!id || cards[id]) return;
        var inner = card.querySelector('.q-answer-inner'); var meta = card.querySelector('.q-meta');
        if (!inner || !meta) return;
        var bar = document.createElement('div'); bar.className = 'rd-bar';
        var got = btn('✓ Done', 'rd-got', gate(id, function () { R.setMark(id, { s: 'got_it' }); }));
        var save = btn('☆ Save', 'rd-save', gate(id, function () { var m = R.get().marks[id]; R.setMark(id, { b: !(m && m.b) }); }));
        var link = document.createElement('a'); link.className = 'rd-link'; link.href = '/roadmap.html'; link.textContent = 'Your roadmap ›';
        var hint = document.createElement('div'); hint.className = 'rd-hint'; hint.style.display = 'none';
        hint.innerHTML = 'Sign in to save your progress and build your plan. It is free. <a href="#" class="rd-signin" style="color:#3d7a4f;font-weight:600">Sign in</a>';
        hint.querySelector('.rd-signin').addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (typeof window.openAuthModal === 'function') window.openAuthModal(); else location.href = '/?auth=signin&return=questions'; });
        bar.appendChild(got); bar.appendChild(save); bar.appendChild(link); bar.appendChild(hint);
        inner.appendChild(bar);
        var chip = document.createElement('span'); chip.className = 'rd-chips'; meta.appendChild(chip);
        cards[id] = { card: card, topic: topic, btns: { got: got, save: save }, chip: chip, hint: hint };
        paint(id);
      });
    });
  }

  // Floating "up next" pill: shows today's progress and the next task; pulses with a one-tap link after a mark.
  var pill = null, pillDismissed = false, lastMarks = -1;
  function pillCss() {
    var c = document.createElement('style');
    c.textContent = '.rd-pill{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:900;max-width:min(560px,calc(100vw - 32px));display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:100px;background:#0f1117;color:#fff;font:600 13px/1.3 inherit;font-family:inherit;box-shadow:0 8px 24px rgba(15,17,23,.25)}' +
      '.rd-pill[hidden]{display:none}.rd-pill span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.rd-pill a{flex:none;background:#3d7a4f;color:#fff;text-decoration:none;padding:7px 14px;border-radius:100px}' +
      '.rd-pill button{flex:none;background:none;border:0;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer;padding:0 4px}' +
      '.rd-pill.pop{animation:rdpop .5s}@keyframes rdpop{50%{transform:translateX(-50%) scale(1.04)}}';
    document.head.appendChild(c);
  }
  function paintPill(afterMark) {
    if (!signedIn || pillDismissed) { if (pill) pill.hidden = true; return; }
    var n = R.nudgeFor(R.get());
    if (n.kind === 'start') { if (pill) pill.hidden = true; return; }
    if (!pill) {
      pillCss();
      pill = document.createElement('div'); pill.className = 'rd-pill'; pill.setAttribute('role', 'status');
      pill.innerHTML = '<span></span><a></a><button type="button" aria-label="Dismiss">\u00d7</button>';
      pill.querySelector('button').addEventListener('click', function () { pillDismissed = true; pill.hidden = true; });
      document.body.appendChild(pill);
    }
    pill.querySelector('span').textContent = (afterMark ? '\u2713 Saved. ' : '') + n.headline + (n.kind === 'continue' || n.kind === 'start_today' ? ' \u00b7 ' + n.detail : '');
    var a = pill.querySelector('a'); a.textContent = n.cta + ' \u203a'; a.href = n.href;
    pill.hidden = false;
    if (afterMark) { pill.classList.remove('pop'); void pill.offsetWidth; pill.classList.add('pop'); }
  }
  function paintAll() {
    Object.keys(cards).forEach(paint);
    var cnt = Object.keys(R.get().marks || {}).length;
    paintPill(lastMarks >= 0 && cnt > lastMarks);
    lastMarks = cnt;
  }

  function deepLink() {
    var p = new URLSearchParams(location.search); var q = p.get('q'), topic = p.get('topic');
    if (!q || !topic) return;
    var c = cards[topic + ':' + q]; if (!c) return;
    if (typeof window.switchTopic === 'function') { try { window.switchTopic(topic); } catch (e) { /* paywall may intercept */ } }
    c.card.classList.add('open');
    setTimeout(function () { c.card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
  }

  function start() {
    enhance();
    R.onChange(paintAll);
    function resync() { return R.sync().then(function (r) { signedIn = !!(r && r.ok); loadFailed = !!(r && !r.ok && r.reason !== 'signed-out'); lastMarks = Object.keys(R.get().marks || {}).length; paintAll(); var cbs = knownCbs; knownCbs = []; cbs.forEach(function (f) { f(); }); }); }
    window.addEventListener('droidly:signed-in', function () { setTimeout(resync, 400); });
    R.sync().then(function (r) { signedIn = !!(r && r.ok); loadFailed = !!(r && !r.ok && r.reason !== 'signed-out'); lastMarks = Object.keys(R.get().marks || {}).length; paintAll(); var cbs = knownCbs; knownCbs = []; cbs.forEach(function (f) { f(); }); });
    // questions.html builds its own UI on load; deep-link after it settles.
    if (document.readyState === 'complete') setTimeout(deepLink, 300);
    else window.addEventListener('load', function () { setTimeout(deepLink, 300); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
