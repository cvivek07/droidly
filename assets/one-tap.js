/*!
 * Google One Tap: a "Continue as <name>" prompt in the corner for signed-out visitors. One click signs them in
 * through Supabase (signInWithIdToken), with no redirect, so anything they did on the page stays.
 *
 * Setup (once):
 *   1. CLIENT_ID below = the Google OAuth "Web client" ID already used by Supabase
 *      (Supabase > Authentication > Sign In / Providers > Google > Client ID).
 *   2. Google Cloud Console > APIs & Services > Credentials > that Web client >
 *      Authorized JavaScript origins: add https://droidly.io (and https://www.droidly.io if used).
 * Until CLIENT_ID is set this script does nothing.
 *
 * window.DroidlyOneTap.prompt() shows the prompt on demand (used by the sign-up nudges); returns false if unavailable.
 */
(function () {
  'use strict';
  var CLIENT_ID = '1029160927099-5p7tdlhmft601mmd07dqlhp42ihkcava.apps.googleusercontent.com';   // e.g. '1234567890-abc123.apps.googleusercontent.com'
  var SUPABASE_URL = 'https://dquheflcmcppldrnckzf.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdWhlZmxjbWNwcGxkcm5ja3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjI1MDcsImV4cCI6MjA5MTY5ODUwN30.SRhP7mzqlaNzGYEec56IV348aAl66YmFv9ApBuXbN1c';
  var KEY = 'sb-dquheflcmcppldrnckzf-auth-token';

  var api = { ready: false, prompt: function () { return false; } };
  window.DroidlyOneTap = api;
  if (!CLIENT_ID || !window.crypto || !crypto.subtle) return;
  function signedIn() { try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); return !!(j && j.user); } catch (e) { return false; } }
  if (signedIn()) return;
  function track(n, p) { try { if (typeof gtag === 'function') gtag('event', n, p || {}); } catch (e) { /* ignore */ } }

  var rawNonce = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  var started = false;

  function client() {
    // Prefer the page's own client so the page sees the sign-in straight away (and keeps what the visitor did).
    if (window.DroidlyDb) return { c: window.DroidlyDb, own: true };
    if (!window.supabase || !supabase.createClient) return null;
    return { c: supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY), own: false };
  }
  function onCredential(resp) {
    var k = client(); if (!k || !resp || !resp.credential) return;
    k.c.auth.signInWithIdToken({ provider: 'google', token: resp.credential, nonce: rawNonce }).then(function (r) {
      if (r.error) { track('one_tap_error', { message: String(r.error.message).slice(0, 80) }); return; }
      track('one_tap_signed_in', {});
      if (window.DroidlyTrackSignIn) window.DroidlyTrackSignIn();
      if (typeof window.afterAuth === 'function') try { window.afterAuth(r.data.user); } catch (e) { /* ignore */ }
      // A page that uses its own client hears about the sign-in itself; others reload to show the signed-in state.
      if (!k.own) location.reload();
    });
  }
  function init(hashed) {
    google.accounts.id.initialize({
      client_id: CLIENT_ID, nonce: hashed, callback: onCredential, context: 'signin', ux_mode: 'popup',
      auto_select: false, cancel_on_tap_outside: true, itp_support: true, use_fedcm_for_prompt: true
    });
    api.ready = true;
    api.prompt = function () { if (signedIn()) return false; google.accounts.id.prompt(); track('one_tap_prompt', { on: 'request' }); return true; };
    // Show it on its own after a short look at the page, not the instant it opens.
    setTimeout(function () { if (!signedIn()) { google.accounts.id.prompt(); track('one_tap_prompt', { on: 'auto' }); } }, 4000);
  }
  function start() {
    if (started) return; started = true;
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce)).then(function (buf) {
      var hashed = Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
      s.onload = function () { try { init(hashed); } catch (e) { /* Google script changed or blocked */ } };
      document.head.appendChild(s);
    });
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
