/*!
 * Droidly account menu: one consistent name drop-down on every page.
 * Rebuilds each .user-dropdown with line icons in tinted squares (same style as the homepage "What's inside" cards).
 * The page's own Sign out element is reused as-is, so its click handler keeps working.
 */
(function () {
  'use strict';
  var I = {
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    roadmap: '<path d="M4 19h4l3-7 3 4 6-10"/><circle cx="20" cy="6" r="1.5"/>',
    questions: '<path d="M4 5h16M4 12h16M4 19h10"/>',
    saved: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    signout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>'
  };
  function icon(k) {
    return '<span class="udm-ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I[k] + '</svg></span>';
  }
  var ITEMS = [
    ['profile', 'Profile', '/profile'],
    ['roadmap', 'My roadmap', '/roadmap'],
    ['questions', 'Questions', '/questions'],
    ['saved', 'Saved questions', '/roadmap#saved']
  ];

  var css = document.createElement('style');
  css.textContent =
    '.user-dropdown.udm{min-width:232px !important;padding:6px !important}' +
    '.user-dropdown.udm .user-dropdown-email{padding:10px 12px 10px !important;margin:0 0 4px !important;border-bottom:1px solid rgba(15,17,23,.08) !important;font-size:12.5px !important;color:#5b6472 !important;word-break:break-all}' +
    '.user-dropdown.udm .udm-item{display:flex !important;align-items:center;gap:12px;padding:7px 10px !important;border-radius:10px !important;font-size:14px !important;font-weight:600 !important;color:#1f2937 !important;text-decoration:none !important;cursor:pointer;line-height:1.2;background:none}' +
    '.user-dropdown.udm .udm-item:hover,.user-dropdown.udm .udm-item:focus-visible{background:#f4f7f5 !important;color:#0f1117 !important;outline:none}' +
    '.user-dropdown.udm .udm-item[aria-current="page"]{background:#f4f7f5 !important}' +
    '.user-dropdown.udm .udm-ic{width:30px;height:30px;flex:none;border-radius:9px;display:inline-grid;place-items:center;background:#e8f2ec;color:#2e6040}' +
    '.user-dropdown.udm .udm-sep{height:1px;background:rgba(15,17,23,.08);margin:6px 4px}' +
    '.user-dropdown.udm .udm-item.danger{color:#b42318 !important}' +
    '.user-dropdown.udm .udm-item.danger .udm-ic{background:#fdecea;color:#b42318}' +
    '.user-dropdown.udm .udm-item.danger:hover{background:#fff5f4 !important;color:#912018 !important}';
  document.head.appendChild(css);

  function here(href) {
    var p = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    var h = href.split('#'), hp = h[0], hh = h[1] || '';
    return p === hp && (location.hash.replace(/^#/, '') === hh);
  }

  function enhance(dd) {
    if (dd.classList.contains('udm')) return;
    var out = dd.querySelector('.user-dropdown-item.danger');
    dd.querySelectorAll('.user-dropdown-item').forEach(function (n) { if (n !== out) n.remove(); });
    var anchor = out || null;
    ITEMS.forEach(function (it) {
      var a = document.createElement('a');
      a.className = 'user-dropdown-item udm-item'; a.href = it[2];
      a.innerHTML = icon(it[0]) + '<span>' + it[1] + '</span>';
      if (here(it[2])) a.setAttribute('aria-current', 'page');
      dd.insertBefore(a, anchor);
    });
    if (out) {
      var sep = document.createElement('div'); sep.className = 'udm-sep'; sep.setAttribute('role', 'separator');
      dd.insertBefore(sep, out);
      out.classList.add('udm-item');
      out.innerHTML = icon('signout') + '<span>Sign out</span>';
      if (!out.hasAttribute('tabindex')) out.setAttribute('tabindex', '0');
      out.setAttribute('role', 'button');
      out.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); out.click(); } });
    }
    dd.classList.add('udm');
  }

  function run() { document.querySelectorAll('.user-dropdown').forEach(enhance); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
