/*!
 * Droidly doubts: "Still confused? Ask a doubt" under answers and lessons.
 * Sends the doubt to the ask-doubt Edge Function, which answers instantly with an AI explanation grounded in
 * this answer/lesson and saves it to question_doubts. "Still unclear?" escalates it to the Droidly team.
 * If the function is unavailable, the doubt is saved directly and goes to the team (v1 behaviour).
 *
 *   DroidlyDoubts.mount(el, { itemId, title, page: 'questions' | 'lesson' })
 *   On questions.html it mounts itself under every answer.
 */
(function () {
  'use strict';
  var URL = 'https://dquheflcmcppldrnckzf.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdWhlZmxjbWNwcGxkcm5ja3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjI1MDcsImV4cCI6MjA5MTY5ODUwN30.SRhP7mzqlaNzGYEec56IV348aAl66YmFv9ApBuXbN1c';
  var AUTH_KEY = 'sb-dquheflcmcppldrnckzf-auth-token';
  var FN = URL + '/functions/v1/ask-doubt';
  var MAX = 2000, MIN = 5, CTX = 6000;

  function session() {
    try {
      var s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (!s || !s.access_token || !s.user) return null;
      return { token: s.access_token, uid: s.user.id, email: s.user.email || '', expired: s.expires_at && s.expires_at * 1000 < Date.now() + 15000 };
    } catch (e) { return null; }
  }
  function track(n, p) { try { if (typeof gtag === 'function') gtag('event', n, p || {}); } catch (e) { /* ignore */ } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function signIn() {
    if (typeof window.openAuthModal === 'function') window.openAuthModal('signin');
    else location.href = '/?auth=signin&return=' + encodeURIComponent(location.pathname.replace(/^\//, '') || 'questions');
  }

  var css = document.createElement('style');
  css.textContent =
    '.dbt{margin-top:16px;border-top:1px dashed #dfe5e1;padding-top:14px}' +
    '.dbt-open{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:14px;font-weight:700;color:#2e6040;background:none;border:0;padding:4px 0;cursor:pointer}' +
    '.dbt-open:hover{text-decoration:underline}' +
    '.dbt-ai .dbt-msg{margin:0 14px 14px}' +
    '.dbt-open small{font-weight:500;color:#5b6472}' +
    '.dbt-form{margin-top:10px;background:#f7faf8;border:1px solid #e3e8e5;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}' +
    '.dbt-form label{font-size:14px;font-weight:700;color:#0f1117}' +
    '.dbt-form textarea{font:inherit;font-size:15px;line-height:1.5;color:#0f1117;background:#fff;border:1.5px solid #dfe5e1;border-radius:12px;padding:10px 12px;min-height:96px;resize:vertical;width:100%;box-sizing:border-box}' +
    '.dbt-form textarea:focus{outline:none;border-color:#2e6040}' +
    '.dbt-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
    '.dbt-note{font-size:12.5px;color:#5b6472}' +
    '.dbt-btns{display:flex;gap:8px;align-items:center}' +
    '.dbt-send{font:inherit;font-size:14px;font-weight:700;color:#fff;background:#2e6040;border:0;border-radius:100px;padding:10px 18px;cursor:pointer}' +
    '.dbt-send[disabled]{opacity:.5;cursor:default}' +
    '.dbt-cancel{font:inherit;font-size:14px;font-weight:600;color:#4b5563;background:none;border:0;cursor:pointer;padding:8px}' +
    '.dbt-msg{font-size:14px;line-height:1.5;border-radius:12px;padding:12px 14px}' +
    '.dbt-msg.ok{background:#e8f2ec;color:#1d4a30;border:1px solid #c9e0d1}' +
    '.dbt-msg.err{background:#fff1ee;color:#8f2a17;border:1px solid #f5c2b6}' +
    '.dbt-msg a{color:inherit;font-weight:700}' +
    '.dbt-ai{margin-top:10px;background:#fff;border:1px solid #dfe5e1;border-radius:14px;overflow:hidden}' +
    '.dbt-ai-q{font-size:13.5px;color:#4b5563;background:#f7faf8;padding:10px 14px;border-bottom:1px solid #e9eeeb}' +
    '.dbt-ai-q b{color:#0f1117}' +
    '.dbt-ai-h{display:flex;align-items:center;gap:8px;padding:12px 14px 0;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#2e6040}' +
    '.dbt-ai-h span{font-weight:600;letter-spacing:0;text-transform:none;color:#6b7280}' +
    '.dbt-ai-b{padding:8px 14px 4px;font-size:15px;line-height:1.6;color:#1f2937}' +
    '.dbt-ai-b p{margin:0 0 10px}.dbt-ai-b ul{margin:0 0 10px;padding-left:20px}.dbt-ai-b li{margin:3px 0}' +
    '.dbt-ai-b code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#eef3f0;border-radius:6px;padding:1px 5px}' +
    '.dbt-ai-b pre{background:#0f2a1d;color:#e6f0ea;border-radius:10px;padding:10px 12px;overflow:auto;font-size:13px}' +
    '.dbt-ai-b pre code{background:none;padding:0;color:inherit}' +
    '.dbt-ai-f{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px 14px}' +
    '.dbt-ai-f .lbl{font-size:13px;color:#5b6472;margin-right:4px}' +
    '.dbt-yes,.dbt-no{font:inherit;font-size:13.5px;font-weight:700;border-radius:100px;padding:8px 14px;cursor:pointer}' +
    '.dbt-yes{color:#2e6040;background:#e8f2ec;border:1px solid #c9e0d1}' +
    '.dbt-no{color:#0f1117;background:#fff;border:1px solid #dfe5e1}' +
    '.dbt-yes[disabled],.dbt-no[disabled]{opacity:.55;cursor:default}' +
    '.dbt-wait{display:flex;align-items:center;gap:10px;font-size:14px;color:#4b5563;padding:14px}' +
    '.dbt-dot{width:8px;height:8px;border-radius:50%;background:#2e6040;animation:dbtp 1s infinite ease-in-out}' +
    '.dbt-dot:nth-child(2){animation-delay:.15s}.dbt-dot:nth-child(3){animation-delay:.3s}' +
    '@keyframes dbtp{0%,80%,100%{opacity:.25}40%{opacity:1}}' +
    '.dbt-again{font:inherit;font-size:13.5px;font-weight:700;color:#2e6040;background:none;border:0;cursor:pointer;padding:6px 0;margin-top:8px}' +
    '@media(max-width:640px){.dbt-btns{width:100%}.dbt-send{flex:1}.dbt-ai-f .lbl{width:100%}.dbt-yes,.dbt-no{flex:1 1 100%;text-align:center}}';
  document.head.appendChild(css);

  function mount(host, opt) {
    if (!host || host.querySelector('.dbt')) return;
    var box = document.createElement('div'); box.className = 'dbt'; box.setAttribute('data-tts-skip', '');
    box.innerHTML = '<button type="button" class="dbt-open">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3"/><path d="M12 16.5h.01"/></svg>' +
      'Still confused? Ask a doubt</button>';
    host.appendChild(box);
    var btn = box.querySelector('.dbt-open');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var s = session();
      if (!s) { track('doubt_gate', { page: opt.page }); signIn(); return; }
      if (box.querySelector('.dbt-form,.dbt-msg')) { var t = box.querySelector('textarea'); if (t) t.focus(); return; }
      open(box, opt, s);
      track('doubt_open', { page: opt.page, item: opt.itemId });
    });
  }

  function open(box, opt, s) {
    var form = document.createElement('div'); form.className = 'dbt-form';
    var fid = 'dbt-' + Math.random().toString(36).slice(2, 8);
    form.innerHTML = '<label for="' + fid + '">What is not clear?</label>' +
      '<textarea id="' + fid + '" maxlength="' + MAX + '" placeholder="For example: why does the Fragment outlive its view on the back stack?"></textarea>' +
      '<div class="dbt-row"><span class="dbt-note">You get an instant explanation. Still stuck? Send it to the Droidly team.</span>' +
      '<span class="dbt-btns"><button type="button" class="dbt-cancel">Cancel</button><button type="button" class="dbt-send" disabled>Get an answer</button></span></div>';
    box.appendChild(form);
    var ta = form.querySelector('textarea'), send = form.querySelector('.dbt-send');
    ['click', 'keydown', 'keyup', 'keypress'].forEach(function (ev) { form.addEventListener(ev, function (e) { e.stopPropagation(); }); });
    ta.addEventListener('input', function () { send.disabled = ta.value.trim().length < MIN; });
    form.querySelector('.dbt-cancel').addEventListener('click', function () { form.remove(); });
    send.addEventListener('click', function () {
      var body = ta.value.trim(); if (body.length < MIN) return;
      var cur = session(); if (!cur) { signIn(); return; }
      send.disabled = true; send.textContent = 'Thinking…';
      ask(cur, opt, body, contextOf(box, opt)).then(function (res) {
        form.remove();
        track('doubt_sent', { page: opt.page, item: opt.itemId, len: body.length, ai: !!res.ai_reply });
        if (res.ai_reply) showAnswer(box, opt, cur, res, body);
        else sentToTeam(box, cur, body);
      }).catch(function (err) {
        send.disabled = false; send.textContent = 'Get an answer';
        var old = form.querySelector('.dbt-msg'); if (old) old.remove();
        var why = String(err && err.message || '');
        var text = /doubt_rate_limit/.test(why) ? 'You have sent a lot of doubts today. Please try again tomorrow.'
          : /401|JWT|expired|unauthorized/i.test(why) ? 'Your sign-in has expired. <a href="#" class="dbt-re">Sign in again</a>, then send.'
          : 'Could not send right now. Please try again, or email <a href="mailto:support@droidly.io?subject=' + encodeURIComponent('Doubt: ' + (opt.title || opt.itemId)) + '&body=' + encodeURIComponent(body) + '">support@droidly.io</a>.';
        var m = document.createElement('div'); m.className = 'dbt-msg err'; m.innerHTML = text; form.insertBefore(m, form.firstChild);
        var re = m.querySelector('.dbt-re'); if (re) re.addEventListener('click', function (e) { e.preventDefault(); signIn(); });
        track('doubt_error', { page: opt.page, reason: why.slice(0, 60) });
      });
    });
    ta.focus();
  }

  function msg(box, kind, html) { var m = document.createElement('div'); m.className = 'dbt-msg ' + kind; m.innerHTML = html; box.appendChild(m); return m; }

  // The text the AI may use: this answer (questions page) or this lesson, minus our own widgets.
  function contextOf(box, opt) {
    if (typeof opt.context === 'function') { try { return String(opt.context() || '').slice(0, CTX); } catch (e) { return ''; } }
    var root = box.closest('.q-answer-inner, .ln-main') || document.querySelector('.ln-main');
    if (!root) return '';
    var c = root.cloneNode(true);
    c.querySelectorAll('.dbt, [data-tts-skip], .ln-toc, .ln-copy, .qcode-bar, .qa-foot, button, script, style').forEach(function (n) { n.remove(); });
    c.querySelectorAll('p,li,h1,h2,h3,h4,pre,div,section,tr').forEach(function (n) { n.appendChild(document.createTextNode('\n')); });
    var q = opt.title ? (opt.page === 'lesson' ? 'Lesson: ' : 'Question: ') + opt.title + '\n\n' : '';
    return (q + (c.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()).slice(0, CTX);
  }

  function readJson(r) {
    return r.text().then(function (t) { var d = {}; try { d = JSON.parse(t || '{}'); } catch (e) { /* not json */ }
      if (!r.ok) throw new Error(r.status + ' ' + (d.error || t)); return d; });
  }

  // 1st choice: the ask-doubt function (AI answer). If it is missing/down, save directly so the team still gets it.
  function ask(s, opt, body, context) {
    var payload = { item_id: String(opt.itemId).slice(0, 80), item_title: opt.title ? String(opt.title).slice(0, 300) : null,
      page: opt.page, body: body.slice(0, MAX), context: context };
    return fetch(FN, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(readJson)
      .catch(function (err) {
        if (/^(401|429) /.test(String(err.message))) throw err;
        return save(s, opt, body).then(function () { return { ai_reply: null, escalated: true }; });
      });
  }

  function save(s, opt, body) {
    return fetch(URL + '/rest/v1/question_doubts', {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: s.uid, user_email: s.email || null, item_id: String(opt.itemId).slice(0, 80),
        item_title: opt.title ? String(opt.title).slice(0, 300) : null, page: opt.page, body: body.slice(0, MAX), escalated: true })
    }).then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ' ' + t); }); });
  }

  function feedback(s, id, patch) {
    if (!id) return Promise.resolve();
    return fetch(URL + '/rest/v1/question_doubts?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { apikey: KEY, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch)
    }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); });
  }

  // Tiny, safe formatter for the AI reply: paragraphs, "- " bullets, ```code``` and `code`.
  function fmtAi(t) {
    var out = [], parts = String(t).split(/```(?:\w+)?\n?([\s\S]*?)```/);
    parts.forEach(function (chunk, i) {
      if (i % 2) { out.push('<pre><code>' + esc(chunk.replace(/\n$/, '')) + '</code></pre>'); return; }
      chunk.split(/\n\s*\n/).forEach(function (blk) {
        blk = blk.trim(); if (!blk) return;
        var lines = blk.split('\n');
        var inl = function (x) { return esc(x).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'); };
        if (lines.every(function (l) { return /^\s*[-*•]\s+/.test(l); }))
          out.push('<ul>' + lines.map(function (l) { return '<li>' + inl(l.replace(/^\s*[-*•]\s+/, '')) + '</li>'; }).join('') + '</ul>');
        else out.push('<p>' + lines.map(inl).join('<br>') + '</p>');
      });
    });
    return out.join('');
  }

  function showAnswer(box, opt, s, res, body) {
    var a = document.createElement('div'); a.className = 'dbt-ai';
    a.innerHTML = '<div class="dbt-ai-q"><b>Your doubt:</b> ' + esc(body) + '</div>' +
      '<div class="dbt-ai-h">AI explanation <span>· based on this ' + (opt.page === 'lesson' ? 'lesson' : 'answer') + '</span></div>' +
      '<div class="dbt-ai-b">' + fmtAi(res.ai_reply) + '</div>' +
      '<div class="dbt-ai-f"><span class="lbl">Did this clear it up?</span>' +
      '<button type="button" class="dbt-yes">That helped</button>' +
      '<button type="button" class="dbt-no">Still unclear? Send to the Droidly team</button></div>';
    box.appendChild(a);
    var yes = a.querySelector('.dbt-yes'), no = a.querySelector('.dbt-no'), foot = a.querySelector('.dbt-ai-f');
    yes.addEventListener('click', function (e) {
      e.stopPropagation(); yes.disabled = no.disabled = true;
      feedback(s, res.id, { helpful: true }).catch(function () { /* best effort */ });
      foot.innerHTML = '<span class="lbl">Glad it helped. <button type="button" class="dbt-again">Ask another doubt</button></span>';
      foot.querySelector('.dbt-again').addEventListener('click', function (ev) { ev.stopPropagation(); a.remove(); open(box, opt, session() || s); });
      track('doubt_helpful', { page: opt.page, item: opt.itemId });
    });
    no.addEventListener('click', function (e) {
      e.stopPropagation(); yes.disabled = no.disabled = true; no.textContent = 'Sending…';
      feedback(s, res.id, { helpful: false, escalated: true }).then(function () {
        foot.remove(); sentToTeam(a, s, null);
        track('doubt_escalated', { page: opt.page, item: opt.itemId });
      }).catch(function () {
        yes.disabled = no.disabled = false; no.textContent = 'Still unclear? Send to the Droidly team';
        msg(a, 'err', 'Could not send right now. Please try again, or email <a href="mailto:support@droidly.io?subject=' + encodeURIComponent('Doubt: ' + (opt.title || opt.itemId)) + '&body=' + encodeURIComponent(body) + '">support@droidly.io</a>.');
      });
    });
  }

  function sentToTeam(where, s) {
    msg(where, 'ok', '<b>Sent to the Droidly team.</b> We will reply' + (s.email ? ' to ' + esc(s.email) : ' by email') + ', usually within a few days.');
  }

  window.DroidlyDoubts = { mount: mount };

  // questions.html: one under every answer, above "Mark done / Next question".
  function onQuestions() {
    document.querySelectorAll('.q-card').forEach(function (card) {
      var inner = card.querySelector('.q-answer-inner'); if (!inner || inner.querySelector('.dbt')) return;
      var sec = card.closest('.topic-section'), topic = sec ? sec.id.replace('topic-', '') : '';
      var num = card.querySelector('.q-number'), n = num && /Q(\d+)/.exec(num.textContent);
      var qt = card.querySelector('.q-text');
      var holder = document.createElement('div');
      var foot = inner.querySelector('.qa-foot');
      if (foot) inner.insertBefore(holder, foot); else inner.appendChild(holder);
      mount(holder, { itemId: card.dataset.qid || (topic + ':' + (n ? n[1] : '')), title: qt ? qt.textContent.trim() : '', page: 'questions' });
    });
  }
  if (document.querySelector('.q-card')) {
    if (document.readyState === 'complete') onQuestions(); else window.addEventListener('load', onQuestions);
  }
})();
