/*!
 * Droidly Voice — reads questions, answers and lessons aloud with the browser's built-in speech (Web Speech API).
 * Free, no audio files, no network. Code blocks are not read out; the reader says a code example is on screen.
 *
 *   DroidlyVoice.supported                      -> boolean
 *   DroidlyVoice.button(label?)                 -> a ready-made "Listen" <button>
 *   DroidlyVoice.play(items, { startAt })       -> items: [{ key, title, root | segments, onStart }]
 *   DroidlyVoice.stop()
 *   DroidlyVoice.segmentsFrom(rootEl, opts)     -> [{ el, text, before }]
 * Settings (speed, voice) live in memory for this page only.
 */
(function () {
  'use strict';
  var synth = window.speechSynthesis;
  var supported = !!(synth && window.SpeechSynthesisUtterance);
  var V = { supported: supported };
  window.DroidlyVoice = V;
  if (!supported) { V.button = function () { return null; }; V.play = V.stop = function () {}; V.segmentsFrom = function () { return []; }; return; }

  /* ---------- text helpers ---------- */
  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  function clean(t) {
    return String(t || '')
      .replace(EMOJI, ' ')
      .replace(/[✓✔]/g, ' ').replace(/[✕✗✘❌]/g, ' ')
      .replace(/\s*(→|->|=>)\s*/g, ' to ')
      .replace(/\s*←\s*/g, ' from ')
      .replace(/\bvs\.?\b/gi, 'versus')
      .replace(/\be\.g\./gi, 'for example').replace(/\bi\.e\./gi, 'that is')
      .replace(/\s*[·•|]\s*/g, ', ')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/[`*_#>]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function sentences(t) {
    t = clean(t); if (!t) return [];
    var parts = t.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [t], out = [];
    parts.forEach(function (s) {
      s = s.trim(); if (!s) return;
      while (s.length > 240) {                     // very long sentences: split at a comma so engines do not stall
        var cut = s.lastIndexOf(', ', 220); if (cut < 80) cut = s.indexOf(' ', 200); if (cut < 0) break;
        out.push(s.slice(0, cut + 1)); s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    });
    return out;
  }

  var READ_TAGS = { P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, DT: 1, DD: 1, SUMMARY: 1, FIGCAPTION: 1 };
  var BLOCK_TAGS = { P: 1, DIV: 1, UL: 1, OL: 1, LI: 1, PRE: 1, TABLE: 1, SECTION: 1, ARTICLE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, DETAILS: 1, SUMMARY: 1, DL: 1, FIGURE: 1, NAV: 1, ASIDE: 1 };
  function isCode(el) { return el.tagName === 'PRE' || el.matches('.code-block,.ln-code,.ln-ex,[data-tts-code]'); }
  function hasBlockChild(el) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (BLOCK_TAGS[c.tagName]) return true; return false; }

  /** Walk an element in reading order and return what to say. opts.skip: extra selector to ignore. */
  V.segmentsFrom = function (root, opts) {
    opts = opts || {};
    var out = [], lastWasCode = false;
    var skip = 'button,script,style,svg,img,[aria-hidden="true"],[data-tts-skip],.tts-btn' + (opts.skip ? ',' + opts.skip : '');
    function push(el, text, before) {
      sentences(text).forEach(function (s, k) { out.push({ el: el, text: s, before: k === 0 ? before : null }); });
    }
    (function walk(el) {
      if (!el || el.nodeType !== 1 || el.matches(skip)) return;
      if (el.hidden || getComputedStyle(el).display === 'none') return;
      if (isCode(el)) {
        var ct = el.getAttribute('data-tts');
        if (ct) out.push({ el: el, text: clean(ct) + ' You can read the code on screen.', code: true });
        else if (!lastWasCode) out.push({ el: el, text: 'There is a code example here. You can read it on screen.', code: true });
        lastWasCode = true; return;
      }
      if (el.tagName === 'TABLE') { out.push({ el: el, text: 'There is a table here. You can read it on screen.' }); lastWasCode = false; return; }
      if (el.tagName === 'DETAILS') {
        var sum = el.querySelector('summary'), rest = [].filter.call(el.children, function (c) { return c.tagName !== 'SUMMARY'; });
        var opener = function () { el.open = true; };
        out.push({ el: el, text: opts.detailsLead || 'Here is the answer.', before: opener });
        rest.forEach(walk); return;
      }
      if (READ_TAGS[el.tagName] || !hasBlockChild(el)) {
        var t = el.textContent;
        if (clean(t)) { push(el, el.getAttribute('data-tts') || t); lastWasCode = false; }
        return;
      }
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) walk(c);
    })(root);
    return out;
  };

  /* ---------- voices ---------- */
  var voices = [], voice = null, rate = 1;
  function score(v) {
    var n = v.name, s = 0;
    if (/natural|neural|premium|enhanced/i.test(n)) s += 50;
    if (/google/i.test(n)) s += 30;
    if (/samantha|daniel|karen|moira|rishi|veena|aria|jenny|guy|sonia|libby/i.test(n)) s += 20;
    if (/^en-IN/i.test(v.lang)) s += 8; else if (/^en-(GB|US)/i.test(v.lang)) s += 6;
    if (v.localService) s += 2;
    if (/compact|eloquence|novelty|whisper|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|zarvox|superstar|albert|fred|junior|ralph/i.test(n)) s -= 80;
    return s;
  }
  function loadVoices() {
    var all = synth.getVoices() || [];
    voices = all.filter(function (v) { return /^en(-|_|$)/i.test(v.lang); }).sort(function (a, b) { return score(b) - score(a) || a.name.localeCompare(b.name); });
    if (!voice || voices.indexOf(voice) < 0) voice = voices[0] || null;
    paintVoices();
  }
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices); else synth.onvoiceschanged = loadVoices;

  /* ---------- player state ---------- */
  var queue = [], qi = 0, segs = [], si = 0, playing = false, token = 0, current = null, autoNext = true, lastEl = null;

  function mark(el) {
    if (lastEl && lastEl !== el) lastEl.classList.remove('tts-now');
    lastEl = el;
    if (!el || !el.isConnected) return;
    el.classList.add('tts-now');
    var r = el.getBoundingClientRect(), h = window.innerHeight;
    if (r.top < 80 || r.bottom > h - 110) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function clearMark() { if (lastEl) lastEl.classList.remove('tts-now'); lastEl = null; document.querySelectorAll('.tts-now').forEach(function (e) { e.classList.remove('tts-now'); }); }

  function loadItem(i) {
    qi = i; current = queue[i]; si = 0;
    if (current.onStart) try { current.onStart(); } catch (e) { /* ignore */ }
    segs = current.segments || (current.root ? V.segmentsFrom(current.root, current.opts) : []);
    if (current.title) segs = [{ el: current.titleEl || null, text: clean(current.speakTitle || current.title) }].concat(current.root ? segs.filter(function (s, k) { return !(k === 0 && clean(s.text) === clean(current.title)); }) : segs);
    paintBar();
  }
  function speakNext() {
    var my = ++token;
    if (!playing) return;
    if (si >= segs.length) {
      if (current && current.onEnd) try { current.onEnd(); } catch (e) { /* ignore */ }
      if (autoNext && qi + 1 < queue.length) { loadItem(qi + 1); setTimeout(function () { if (my === token) speakNext(); }, 700); }
      else { finish(); }
      return;
    }
    var s = segs[si];
    if (s.before) try { s.before(); } catch (e) { /* ignore */ }
    mark(s.el);
    var u = new SpeechSynthesisUtterance(s.text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    u.rate = rate; u.pitch = 1;
    u.onend = function () { if (my !== token) return; si++; speakNext(); };
    u.onerror = function (e) { if (my !== token) return; if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; si++; speakNext(); };
    paintBar();
    synth.speak(u);
    // Some engines (Chrome desktop) stop silently after ~15s; keep them awake.
    clearInterval(V._keep); V._keep = setInterval(function () { if (!playing || my !== token) return clearInterval(V._keep); if (!synth.speaking) return; synth.pause(); synth.resume(); }, 12000);
  }
  function finish() { playing = false; token++; synth.cancel(); clearMark(); paintBar(); if (bar) setTimeout(function () { if (!playing) hideBar(); }, 2500); }

  V.play = function (items, o) {
    if (!items || !items.length) return;
    if (!voices.length) loadVoices();
    synth.cancel(); token++;
    queue = items; playing = true;
    loadItem((o && o.startAt) || 0);
    showBar();
    setTimeout(speakNext, 60);                        // after cancel() settles
  };
  V.stop = function () { if (!queue.length) return; playing = false; token++; synth.cancel(); clearMark(); queue = []; hideBar(); paintButtons(); };
  V.isPlaying = function (key) { return playing && current && current.key === key; };
  function pause() { playing = false; token++; synth.cancel(); paintBar(); }
  function resume() { if (!queue.length) return; playing = true; speakNext(); }
  function skip(d) {
    var wasPlaying = playing; token++; synth.cancel();
    si = Math.max(0, Math.min(segs.length, si + d));
    // jump to the next or previous block, not just the next sentence
    if (d > 0) { var el = segs[si - 1] && segs[si - 1].el; while (si < segs.length && segs[si].el === el && el) si++; }
    else { var el2 = segs[si] && segs[si].el; while (si > 0 && segs[si - 1].el === el2 && el2) si--; }
    if (wasPlaying) { playing = true; speakNext(); } else paintBar();
  }

  /* ---------- UI ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.tts-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:700;line-height:1;color:#1f6f80;background:#e8f6f8;border:1.5px solid #bfe4ea;border-radius:100px;padding:6px 12px 6px 9px;cursor:pointer;transition:all .15s;white-space:nowrap}' +
    '.tts-btn:hover{background:#d8f0f3;border-color:#8fd0da}' +
    '.tts-btn svg{flex:none}.tts-btn.on{background:linear-gradient(100deg,#168592,#4cc4d3);color:#fff;border-color:transparent;box-shadow:0 6px 14px rgba(22,133,146,.3)}' +
    '.tts-btn.tts-ic{width:34px;height:34px;padding:0;justify-content:center;border-radius:50%}' +
    '.tts-now{background:linear-gradient(90deg,rgba(76,196,211,.18),rgba(76,196,211,.06)) !important;border-radius:8px;box-shadow:-4px 0 0 #4cc4d3;transition:background .2s}' +
    '.tts-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:1200;width:min(640px,calc(100vw - 24px));display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:20px;background:rgba(17,26,36,.96);color:#fff;box-shadow:0 18px 40px rgba(0,0,0,.3);font:600 13px/1.3 "DM Sans",system-ui,sans-serif;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}' +
    '.tts-bar[hidden]{display:none}' +
    '.tts-bar .tb-i{flex:1;min-width:0}.tts-bar .tb-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tts-bar .tb-s{font-size:11px;font-weight:500;color:#9fb3c4;margin-top:2px}' +
    '.tts-bar button{flex:none;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;display:grid;place-items:center;cursor:pointer}' +
    '.tts-bar button:hover{background:rgba(255,255,255,.2)}.tts-bar .tb-play{width:42px;height:42px;background:linear-gradient(135deg,#168592,#4cc4d3)}' +
    '.tts-bar select{flex:none;font:inherit;font-size:12px;color:#fff;background:rgba(255,255,255,.1);border:0;border-radius:10px;padding:8px 6px;max-width:120px;cursor:pointer}' +
    '.tts-bar select option{color:#111}' +
    'body.tts-playing .rd-pill{display:none !important}' +
    '@media(max-width:560px){.tts-bar{bottom:10px;gap:6px;padding:8px 10px}.tts-bar .tb-voice{display:none}.tts-bar button{width:32px;height:32px}.tts-bar .tb-play{width:38px;height:38px}}';
  document.head.appendChild(css);

  var IC = {
    speaker: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    play: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    pause: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2v12H7zM20 6v12l-9-6z"/></svg>',
    next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6h2v12h-2zM4 6v12l9-6z"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  V.icons = IC;
  var buttons = [];
  V.button = function (label, onClick, key, iconOnly) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tts-btn' + (iconOnly ? ' tts-ic' : ''); b.dataset.ttsKey = key || ''; b.dataset.label = label || 'Listen';
    b.innerHTML = IC.speaker + (iconOnly ? '' : '<span>' + (label || 'Listen') + '</span>');
    if (iconOnly) b.title = 'Listen to this question and answer';
    b.setAttribute('aria-label', 'Listen: read this aloud');
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (key && V.isPlaying(key)) { pause(); paintButtons(); return; }
      if (key && current && current.key === key && queue.length && !playing) { resume(); paintButtons(); return; }
      onClick && onClick(e);
    });
    buttons.push(b);
    return b;
  };
  function paintButtons() {
    buttons = buttons.filter(function (b) { return b.isConnected; });
    buttons.forEach(function (b) {
      var on = !!(b.dataset.ttsKey && current && current.key === b.dataset.ttsKey && queue.length);
      b.classList.toggle('on', on && playing);
      var lab = b.querySelector('span'); if (lab) lab.textContent = on ? (playing ? 'Pause' : 'Resume') : (b.dataset.label || 'Listen');
    });
  }
  V.refreshButtons = paintButtons;

  var bar = null;
  function showBar() {
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'tts-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Read aloud player');
      bar.innerHTML = '<button type="button" class="tb-prev" aria-label="Previous paragraph">' + IC.prev + '</button>' +
        '<button type="button" class="tb-play" aria-label="Pause">' + IC.pause + '</button>' +
        '<button type="button" class="tb-next" aria-label="Next paragraph">' + IC.next + '</button>' +
        '<div class="tb-i"><div class="tb-t"></div><div class="tb-s"></div></div>' +
        '<select class="tb-rate" aria-label="Speed"><option value="0.8">0.8×</option><option value="1" selected>1×</option><option value="1.2">1.2×</option><option value="1.4">1.4×</option><option value="1.7">1.7×</option></select>' +
        '<select class="tb-voice" aria-label="Voice"></select>' +
        '<button type="button" class="tb-x" aria-label="Stop and close">' + IC.close + '</button>';
      document.body.appendChild(bar);
      bar.querySelector('.tb-play').onclick = function () { playing ? pause() : resume(); paintButtons(); };
      bar.querySelector('.tb-prev').onclick = function () { skip(-1); };
      bar.querySelector('.tb-next').onclick = function () { skip(1); };
      bar.querySelector('.tb-x').onclick = function () { V.stop(); };
      bar.querySelector('.tb-rate').onchange = function () { rate = +this.value; if (playing) { token++; synth.cancel(); speakNext(); } };
      bar.querySelector('.tb-voice').onchange = function () { voice = voices[+this.value] || voice; if (playing) { token++; synth.cancel(); speakNext(); } };
      paintVoices();
    }
    bar.hidden = false; document.body.classList.add('tts-playing'); paintBar();
  }
  function hideBar() { if (bar) bar.hidden = true; document.body.classList.remove('tts-playing'); paintButtons(); }
  function paintVoices() {
    if (!bar) return;
    var sel = bar.querySelector('.tb-voice');
    sel.innerHTML = voices.map(function (v, k) { return '<option value="' + k + '"' + (v === voice ? ' selected' : '') + '>' + v.name.replace(/^(Microsoft|Google)\s+/, '').replace(/\s*\(.*\)$/, '').slice(0, 22) + '</option>'; }).join('');
    sel.style.display = voices.length > 1 ? '' : 'none';
  }
  function paintBar() {
    paintButtons();
    if (!bar) return;
    bar.querySelector('.tb-play').innerHTML = playing ? IC.pause : IC.play;
    bar.querySelector('.tb-play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    bar.querySelector('.tb-t').textContent = (current && current.title) ? current.title : 'Reading aloud';
    var total = queue.length > 1 ? ' · ' + (qi + 1) + ' of ' + queue.length : '';
    bar.querySelector('.tb-s').textContent = (playing ? 'Reading' : si >= segs.length ? 'Finished' : 'Paused') + total;
  }

  loadVoices();
  window.addEventListener('pagehide', function () { synth.cancel(); });
})();
