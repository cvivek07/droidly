/*!
 * Adds "Got it / Revisit / Save" to every question on questions.html and supports
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

  function idFor(card, topic) {
    var n = card.querySelector('.q-number');
    var num = n && /Q(\d+)/.exec(n.textContent);
    return num ? topic + ':' + num[1] : null;
  }

  function paint(id) {
    var c = cards[id]; if (!c) return;
    var m = R.get().marks[id] || {};
    c.btns.got.setAttribute('aria-pressed', m.s === 'got_it');
    c.btns.rev.setAttribute('aria-pressed', m.s === 'revisit');
    c.btns.save.setAttribute('aria-pressed', !!m.b);
    c.btns.save.textContent = m.b ? '★ Saved' : '☆ Save';
    var html = '';
    if (m.s === 'got_it') html += '<span class="rd-chip got">✓ Got it</span>';
    if (m.s === 'revisit') html += '<span class="rd-chip rev">↻ Revisit</span>';
    if (m.b) html += '<span class="rd-chip save">★ Saved</span>';
    c.chip.innerHTML = html;
    c.hint.style.display = (signedIn === false && (m.s || m.b)) ? '' : 'none';
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
        var got = btn('✓ Got it', 'rd-got', function () { R.setMark(id, { s: 'got_it' }); });
        var rev = btn('↻ Revisit later', 'rd-rev', function () { R.setMark(id, { s: 'revisit' }); });
        var save = btn('☆ Save', 'rd-save', function () { var m = R.get().marks[id]; R.setMark(id, { b: !(m && m.b) }); });
        var link = document.createElement('a'); link.className = 'rd-link'; link.href = '/roadmap.html'; link.textContent = 'Your roadmap →';
        var hint = document.createElement('div'); hint.className = 'rd-hint'; hint.style.display = 'none';
        hint.innerHTML = 'Not saved yet. <a href="/roadmap.html" style="color:#3d7a4f;font-weight:600">Sign in on your roadmap</a> to keep your progress.';
        bar.appendChild(got); bar.appendChild(rev); bar.appendChild(save); bar.appendChild(link); bar.appendChild(hint);
        inner.appendChild(bar);
        var chip = document.createElement('span'); chip.className = 'rd-chips'; meta.appendChild(chip);
        cards[id] = { card: card, topic: topic, btns: { got: got, rev: rev, save: save }, chip: chip, hint: hint };
        paint(id);
      });
    });
  }

  function paintAll() { Object.keys(cards).forEach(paint); }

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
    R.sync().then(function (r) { signedIn = !!(r && r.ok); paintAll(); });
    // questions.html builds its own UI on load; deep-link after it settles.
    if (document.readyState === 'complete') setTimeout(deepLink, 300);
    else window.addEventListener('load', function () { setTimeout(deepLink, 300); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
