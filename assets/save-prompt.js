/*!
 * Questions page: after a signed-out visitor has read a few answers, a small bar at the bottom invites them to
 * create a free account. "Read" = an opened answer stayed on screen (half of it, or 40% of the screen) for 4 seconds.
 * Shown at 5 answers read and at least 75 s on the page; if closed, again after 10 more. Never shown to signed-in visitors. Nothing is stored.
 */
(function () {
  'use strict';
  var KEY = 'sb-dquheflcmcppldrnckzf-auth-token', FIRST = 5, AGAIN = 10, DWELL = 4000, MIN_TIME = 75000, opened = Date.now();
  function signedIn() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); return !!(j && j.user); } catch (e) { return false; } }
  function track(n, p) { try { if (typeof gtag === 'function') gtag('event', n, p || {}); } catch (e) { /* ignore */ } }
  if (!('IntersectionObserver' in window)) return;

  var read = {}, count = 0, nextAt = FIRST, timers = new Map(), bar = null;

  var css = document.createElement('style');
  css.textContent =
    '.svp{position:fixed;left:50%;bottom:18px;transform:translate(-50%,140%);z-index:950;width:min(760px,calc(100% - 24px));background:#fff;border:1px solid rgba(15,17,23,.08);border-radius:18px;box-shadow:0 18px 40px rgba(20,50,35,.18);padding:16px 18px;display:flex;align-items:center;gap:16px;font-family:inherit;transition:transform .35s cubic-bezier(.2,.8,.2,1)}' +
    '.svp.show{transform:translate(-50%,0)}' +
    '.svp-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#e8f2ec;color:#2e6040}' +
    '.svp-t{flex:1;min-width:0}.svp-t b{display:block;font-size:15px;color:#0f1117;margin-bottom:2px}.svp-t span{font-size:13.5px;color:#5b6472;line-height:1.45}' +
    '.svp-a{display:flex;gap:8px;flex:none;align-items:center}' +
    '.svp-btn{border:0;border-radius:100px;padding:10px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:8px}' +
    '.svp-g{background:#2e6040;color:#fff}.svp-g:hover{background:#24503a}' +
    '.svp-e{background:#f1f6f3;color:#0f1117}.svp-e:hover{background:#e4eee8}' +
    '.svp-x{position:absolute;top:6px;right:8px;border:0;background:none;color:#8a929c;font-size:18px;line-height:1;cursor:pointer;padding:6px}' +
    '@media(max-width:640px){.svp{flex-wrap:wrap;bottom:12px;padding:14px 14px 14px;gap:12px}.svp-ic{display:none}.svp-t{padding-right:18px}.svp-a{width:100%}.svp-btn{flex:1;justify-content:center}}';
  document.head.appendChild(css);

  var G = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>';

  function show() {
    if (signedIn()) return;
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'svp'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Save your progress');
      bar.innerHTML = '<span class="svp-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
        '<div class="svp-t"><b id="svpTitle"></b><span>Create a free account to tick off what you know, save questions for later and get a plan for your weak topics.</span></div>' +
        '<div class="svp-a"><button class="svp-btn svp-g" type="button" id="svpG">' + G + 'Continue with Google</button><button class="svp-btn svp-e" type="button" id="svpE">Use email</button></div>' +
        '<button class="svp-x" type="button" aria-label="Not now" id="svpX">×</button>';
      document.body.appendChild(bar);
      document.getElementById('svpG').onclick = function () {
        track('save_prompt_click', { action: 'google', read: count });
        if (typeof window.handleGoogleAuth === 'function') window.handleGoogleAuth();
        else if (typeof window.openAuthModal === 'function') window.openAuthModal('signup');
      };
      document.getElementById('svpE').onclick = function () { track('save_prompt_click', { action: 'email', read: count }); hide(); if (typeof window.openAuthModal === 'function') window.openAuthModal('signup'); };
      document.getElementById('svpX').onclick = function () { track('save_prompt_click', { action: 'close', read: count }); hide(); nextAt = count + AGAIN; };
    }
    document.getElementById('svpTitle').textContent = 'You\'ve read ' + (count > 20 ? '20+' : count) + ' answers. Keep your progress.';
    requestAnimationFrame(function () { bar.classList.add('show'); });
    track('save_prompt_shown', { read: count });
  }
  function hide() { if (bar) bar.classList.remove('show'); }

  function counted(card) {
    var id = card.dataset.qid || card.id; if (!id || read[id]) return;
    read[id] = 1; count++;
    maybeShow();
  }
  function maybeShow() {
    if (count >= nextAt && Date.now() - opened >= MIN_TIME && !(bar && bar.classList.contains('show'))) { nextAt = Infinity; show(); }
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var c = e.target;
      if (!c.classList.contains('open')) { if (timers.has(c)) { clearTimeout(timers.get(c)); timers.delete(c); } return; }
      var seen = e.intersectionRect.height >= Math.min(e.boundingClientRect.height * 0.5, window.innerHeight * 0.4);   // long answers never fit half on screen
      if (e.isIntersecting && seen) { if (!timers.has(c)) timers.set(c, setTimeout(function () { timers.delete(c); counted(c); }, DWELL)); }
      else if (timers.has(c)) { clearTimeout(timers.get(c)); timers.delete(c); }
    });
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1] });

  // An answer opens when its card gets the "open" class: start (or restart) watching it then.
  var mo = new MutationObserver(function (ms) { ms.forEach(function (m) { var c = m.target; if (c.classList.contains('open') && !read[c.dataset.qid || c.id]) { io.unobserve(c); io.observe(c); } }); });
  function watch() { if (signedIn()) return; document.querySelectorAll('.q-card').forEach(function (c) { if (!c.__svp) { c.__svp = 1; io.observe(c); mo.observe(c, { attributes: true, attributeFilter: ['class'] }); } }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  setTimeout(watch, 2500);   // cards finish setting up after the page scripts run
  // Signed in meanwhile (dialog, One Tap): stop asking.
  setInterval(function () { if (bar && signedIn()) hide(); else maybeShow(); }, 2000);
})();
