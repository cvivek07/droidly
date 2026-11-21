/*!
 * Droidly site navigation: the same top links, "Browse" menu and phone menu on every page.
 * Include once per page: <script src="/assets/site-nav.js" defer></script>
 * Works with each page's own <nav> markup: it fills the page's link row (.nav-center / .qn-links / .tp-links,
 * or adds one) and appends the menu. The homepage has its own hand-built copy of this menu (index.html), so it is skipped.
 * To add or rename a link, change the lists below (and the homepage menu in index.html).
 */
(function () {
  'use strict';
  if (document.getElementById('navBrowseBtn')) return;                       // homepage: own menu
  var nav = document.querySelector('nav.tp-nav, nav.top, body > nav');
  if (!nav || nav.querySelector('.btn-back') || nav.querySelector('.snav-browse')) return;

  var TOP = [
    ['/questions', 'Questions', '600+ with answers', /^\/questions/],
    ['/roadmap', 'Roadmap', 'Your topic-by-topic plan', /^\/roadmap/],
    ['/practice', 'Practice', '5 questions a day from your weak topics', /^\/practice/],
    ['/machine-coding/', 'Machine coding', 'Kotlin problems with tests you can run', /^\/machine[-_]coding/]
  ];
  var TOPICS = [
    ['kotlin', 'Kotlin'], ['kotlin-coroutines', 'Coroutines'], ['kotlin-flow', 'Flow'], ['jetpack-compose', 'Jetpack Compose'],
    ['android-fundamentals', 'Android fundamentals'], ['android-architecture', 'Architecture'], ['hilt-dagger', 'Hilt and Dagger'],
    ['android-room-datastore', 'Room and DataStore'], ['android-networking', 'Networking'], ['android-performance', 'Performance'],
    ['gradle-android-build', 'Gradle and build'], ['android-system-design', 'System design'], ['android-developer-behavioral', 'Behavioral']
  ];
  var LEVELS = [
    ['/android-interview-questions-for-freshers', 'Freshers', '0–2 years'],
    ['/android-interview-questions-for-experienced', 'Experienced', '2–5 years'],
    ['/senior-android-interview-questions', 'Senior', '5+ years']
  ];

  var path = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function here(href) { return path === href || path === href.replace(/\/$/, ''); }

  // ---- styles (scoped to .snav-*) ----
  var css = document.createElement('style');
  css.textContent =
    '.snav-links{display:flex;align-items:center;gap:4px}' +
    '.snav-links a.snav-a,.snav-links button.snav-a{color:#14171f;text-decoration:none;font-size:14.5px;font-weight:600;padding:8px 12px;border-radius:10px;white-space:nowrap}' +
    '.snav-links a.snav-a:hover,.snav-links button.snav-a:hover{background:rgba(61,122,79,.08);color:#2e6040}' +
    '.snav-links a.snav-on{color:#2e6040 !important;background:rgba(46,96,64,.08);border-radius:10px}' +
    '.snav-browse{background:none;border:0;font:inherit;cursor:pointer;display:inline-flex !important;align-items:center;gap:4px}' +
    '.snav-browse svg{transition:transform .2s}.snav-browse[aria-expanded="true"] svg{transform:rotate(180deg)}' +
    '.snav-burger{display:none;align-items:center;justify-content:center;width:42px;height:42px;margin-left:auto;margin-right:8px;flex:none;border:0;border-radius:12px;background:transparent;color:#0f1117;cursor:pointer}' +
    '.snav-burger:hover{background:rgba(61,122,79,.08)}' +
    '.snav-burger path{transition:transform .2s,opacity .2s;transform-origin:12px 12px}' +
    '.snav-burger[aria-expanded="true"] .l1{transform:translateY(5px) rotate(45deg)}.snav-burger[aria-expanded="true"] .l2{opacity:0}.snav-burger[aria-expanded="true"] .l3{transform:translateY(-5px) rotate(-45deg)}' +
    '.snav-panel{position:fixed;z-index:1000;background:#fff;border:1px solid rgba(15,17,23,.08);border-radius:18px;box-shadow:0 18px 40px rgba(20,50,35,.14);padding:8px 8px 4px;overflow-y:auto;font-family:inherit;text-align:left}' +
    '.snav-panel[hidden]{display:none}' +
    '.snav-panel a{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:12px;text-decoration:none;color:#0f1117;font-weight:700;font-size:16px;line-height:1.3}' +
    '.snav-panel a span{font-weight:500;font-size:13px;color:#5b6472}' +
    '.snav-panel a:hover,.snav-panel a:active{background:#f1f6f3}' +
    '.snav-panel a[aria-current="page"]{background:#f1f6f3;color:#2e6040}' +
    '.snav-panel .snav-main{display:flex;flex-direction:column}' +
    '.snav-panel .snav-h{font-size:11.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#2e6040;padding:14px 16px 6px}' +
    '.snav-panel .snav-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px}' +
    '.snav-panel .snav-grid a{padding:9px 16px;font-size:14.5px;font-weight:600}' +
    '.snav-panel .snav-lv{grid-template-columns:1fr 1fr 1fr}.snav-panel .snav-lv a span{font-size:12px}' +
    '.snav-panel .snav-foot{display:flex;margin-top:6px;border-top:1px solid rgba(15,17,23,.08)}' +
    '.snav-panel .snav-foot a{font-size:14px;font-weight:600;color:#2e6040;padding:12px 16px}' +
    '@media (min-width:901px){.snav-panel{width:600px}.snav-panel .snav-main{display:none}.snav-panel .snav-grid{grid-template-columns:1fr 1fr 1fr}}' +
    '@media (max-width:900px){nav .snav-links{display:none !important}.snav-burger{display:inline-flex}.snav-panel{left:12px !important;right:12px}}' +
    '@media (max-width:420px){.snav-panel .snav-lv{grid-template-columns:1fr}}';
  document.head.appendChild(css);

  // ---- top link row ----
  var box = nav.querySelector('.nav-center, .qn-links, .tp-links');
  if (!box) {
    box = document.createElement('div');
    var logo = nav.querySelector('.logo, .tp-logo');
    if (logo) logo.insertAdjacentElement('afterend', box); else nav.insertBefore(box, nav.firstChild);
  }
  var tpl = box.querySelector('a:not(.active):not(.on)') || box.querySelector('a');
  var cls = tpl ? tpl.className.replace(/\b(active|on)\b/g, '').trim() : 'snav-a';
  var onCls = box.querySelector('a.active') ? 'active' : box.querySelector('a.on') ? 'on' : 'snav-on';
  box.classList.add('snav-links');
  box.innerHTML = '';
  TOP.forEach(function (t) {
    var a = document.createElement('a');
    a.href = t[0]; a.textContent = t[1]; if (cls) a.className = cls;
    if (t[3].test(path)) { a.classList.add(onCls); a.setAttribute('aria-current', 'page'); }
    box.appendChild(a);
  });
  var browse = document.createElement('button');
  browse.type = 'button'; browse.className = (cls ? cls + ' ' : '') + 'snav-browse';
  browse.setAttribute('aria-expanded', 'false'); browse.setAttribute('aria-controls', 'snavPanel');
  browse.innerHTML = 'Browse <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  box.appendChild(browse);

  var burger = document.createElement('button');
  burger.type = 'button'; burger.className = 'snav-burger';
  burger.setAttribute('aria-label', 'Menu'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-controls', 'snavPanel');
  burger.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path class="l1" d="M4 7h16"/><path class="l2" d="M4 12h16"/><path class="l3" d="M4 17h16"/></svg>';
  var right = nav.querySelector('.nav-right, .tp-cta');
  if (right && right.parentNode === nav) nav.insertBefore(burger, right); else nav.appendChild(burger);

  // ---- menu panel ----
  function link(href, label, sub) {
    return '<a href="' + esc(href) + '"' + (here(href) ? ' aria-current="page"' : '') + '>' + esc(label) + (sub ? ' <span>' + esc(sub) + '</span>' : '') + '</a>';
  }
  var panel = document.createElement('div');
  panel.className = 'snav-panel'; panel.id = 'snavPanel'; panel.hidden = true;
  panel.innerHTML =
    '<div class="snav-main">' + TOP.map(function (t) { return link(t[0], t[1] === 'Practice' ? 'Daily practice' : t[1], t[2]); }).join('') + '</div>' +
    '<div class="snav-h">Interview questions by topic</div>' +
    '<div class="snav-grid">' + TOPICS.map(function (t) { return link('/' + t[0] + '-interview-questions', t[1]); }).join('') + '</div>' +
    '<div class="snav-h">By experience</div>' +
    '<div class="snav-grid snav-lv">' + LEVELS.map(function (l) { return link(l[0], l[1], l[2]); }).join('') + '</div>' +
    '<div class="snav-foot">' + link('/mock_interview', 'Mock interview') + link('/#how-it-works', 'How Droidly works') + '</div>';
  document.body.appendChild(panel);

  function place() {
    var r = nav.getBoundingClientRect();
    panel.style.top = Math.max(8, r.bottom + 8) + 'px';
    panel.style.maxHeight = 'calc(100vh - ' + Math.round(Math.max(8, r.bottom + 8) + 16) + 'px)';
    if (window.innerWidth > 900) {
      var b = browse.getBoundingClientRect(), w = 600;
      panel.style.left = Math.round(Math.min(Math.max(16, b.left + b.width / 2 - w / 2), window.innerWidth - w - 16)) + 'px';
    } else panel.style.left = '';
  }
  function set(open) {
    if (open) place();
    panel.hidden = !open;
    browse.setAttribute('aria-expanded', open); burger.setAttribute('aria-expanded', open);
  }
  [browse, burger].forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); set(panel.hidden); }); });
  panel.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
  document.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  window.addEventListener('resize', function () { if (!panel.hidden) place(); });
  window.addEventListener('scroll', function () { if (!panel.hidden) place(); }, { passive: true });
})();
