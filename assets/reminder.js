/*!
 * Droidly practice reminder: the on/off switch and time picker for the daily reminder email.
 * Saved in Supabase (practice_reminders). Needs window.DroidlyDb (the page's Supabase client).
 *
 *   DroidlyReminder.mount(el, { compact })   -> draws the setting into el (hides el if reminders are not set up yet)
 *   DroidlyReminder.unsubscribe(token)       -> Promise<boolean> (from the link in the email)
 */
(function () {
  'use strict';
  var URL = 'https://dquheflcmcppldrnckzf.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdWhlZmxjbWNwcGxkcm5ja3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjI1MDcsImV4cCI6MjA5MTY5ODUwN30.SRhP7mzqlaNzGYEec56IV348aAl66YmFv9ApBuXbN1c';
  var HOURS = [6, 7, 8, 9, 12, 13, 18, 19, 20, 21, 22];

  var css = document.createElement('style');
  css.textContent =
    '.rmd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:14.5px;color:#374151}' +
    '.rmd-ic{width:36px;height:36px;flex:none;border-radius:10px;background:#e8f2ec;color:#2e6040;display:grid;place-items:center}' +
    '.rmd-t{flex:1;min-width:180px}.rmd-t b{display:block;color:#0f1117;font-size:15px}.rmd-t small{font-size:13px;color:#5b6472}' +
    '.rmd select{font:inherit;font-size:14px;font-weight:600;color:#0f1117;background:#fff;border:1.5px solid #dfe5e1;border-radius:10px;padding:8px 10px;cursor:pointer}' +
    '.rmd select:focus{outline:none;border-color:#2e6040}' +
    '.rmd-btn{font:inherit;font-size:14px;font-weight:700;border-radius:100px;padding:9px 16px;cursor:pointer;border:1.5px solid #2e6040;background:#2e6040;color:#fff}' +
    '.rmd-btn.off{background:#fff;color:#2e6040}' +
    '.rmd-btn[disabled]{opacity:.6;cursor:default}' +
    '.rmd-ok{font-size:13px;color:#1d6b3e;font-weight:600}' +
    '.rmd-err{font-size:13px;color:#b42318;font-weight:600}';
  document.head.appendChild(css);

  function db() { return window.DroidlyDb; }
  function sess() { return db() ? db().auth.getSession().then(function (r) { return r.data && r.data.session; }) : Promise.resolve(null); }
  function rest(method, path, body, prefer) {
    return sess().then(function (s) {
      if (!s) throw new Error('signed-out');
      var h = { apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
      if (prefer) h.Prefer = prefer;
      return fetch(URL + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.text().then(function (t) { if (!r.ok) throw new Error(r.status + ' ' + t); return t ? JSON.parse(t) : null; }); })
        .then(function (d) { return { data: d, session: s }; });
    });
  }
  function label(h) { var a = h < 12 ? 'AM' : 'PM', x = h % 12 || 12; return x + ':00 ' + a; }
  function tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch (e) { return 'Asia/Kolkata'; } }
  function track(n, p) { try { window.gtag && gtag('event', n, p || {}); } catch (e) { /* ignore */ } }
  var BELL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  function mount(el, opts) {
    opts = opts || {};
    el.hidden = true;
    rest('GET', 'practice_reminders?select=enabled,hour').then(function (res) {
      var row = res.data && res.data[0], state = { enabled: !!(row && row.enabled), hour: row ? row.hour : 19 }, email = res.session.user.email;
      function draw(msg, err) {
        var opt = HOURS.concat(HOURS.indexOf(state.hour) < 0 ? [state.hour] : []).sort(function (a, b) { return a - b; })
          .map(function (h) { return '<option value="' + h + '"' + (h === state.hour ? ' selected' : '') + '>' + label(h) + '</option>'; }).join('');
        el.innerHTML = '<div class="rmd"><span class="rmd-ic">' + BELL + '</span><span class="rmd-t"><b>' + (state.enabled ? 'Daily reminder is on' : 'Get a daily reminder') + '</b><small>' +
          (state.enabled ? 'We email ' + email.replace(/[<>&"]/g, '') + ' if today\'s 5 are not done by then.' : 'One short email a day, only if you have not practised yet.') + '</small></span>' +
          '<select aria-label="Reminder time">' + opt + '</select>' +
          '<button type="button" class="rmd-btn' + (state.enabled ? ' off' : '') + '">' + (state.enabled ? 'Turn off' : 'Turn on') + '</button>' +
          (msg ? '<span class="' + (err ? 'rmd-err' : 'rmd-ok') + '">' + msg + '</span>' : '') + '</div>';
        var sel = el.querySelector('select'), btn = el.querySelector('button');
        btn.onclick = function () { save({ enabled: !state.enabled, hour: +sel.value }); };
        sel.onchange = function () { if (state.enabled) save({ enabled: true, hour: +sel.value }); else state.hour = +sel.value; };
      }
      function save(next) {
        var btn = el.querySelector('button'); if (btn) btn.disabled = true;
        rest('POST', 'practice_reminders?on_conflict=user_id', { user_id: res.session.user.id, enabled: next.enabled, hour: next.hour, tz: tz(), updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
          .then(function () {
            var turnedOn = next.enabled && !state.enabled;
            state = next; draw(next.enabled ? (turnedOn ? 'Saved. See you at ' + label(next.hour) + '.' : 'Time updated.') : 'Reminders off.');
            track('practice_reminder_set', { on: next.enabled, hour: next.hour });
          })
          .catch(function () { draw('Could not save. Try again.', true); });
      }
      draw(); el.hidden = false;
    }).catch(function () { el.hidden = true; });   // signed out, or the table is not created yet
  }

  function unsubscribe(token) {
    return fetch(URL + '/functions/v1/practice-reminders', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ unsub: token }) })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  window.DroidlyReminder = { mount: mount, unsubscribe: unsubscribe };
})();
