/*! Droidly — "Listen" buttons on the question bank (uses assets/voice.js). */
(function () {
  'use strict';
  function init() {
    var V = window.DroidlyVoice;
    if (!V || !V.supported) return;
    var all = [].slice.call(document.querySelectorAll('.q-card'));
    all.forEach(function (card, k) { card.dataset.ttsKey = 'q' + k; });

    function item(card) {
      var qt = card.querySelector('.q-text'), num = card.querySelector('.q-number'), inner = card.querySelector('.q-answer-inner');
      var label = (num ? num.textContent.trim() + ' · ' : '') + (qt ? qt.textContent.trim() : 'Question');
      return {
        key: card.dataset.ttsKey, title: label, titleEl: qt,
        speakTitle: 'Question. ' + (qt ? qt.textContent : ''),
        root: inner,
        onStart: function () { if (!card.classList.contains('open')) card.classList.add('open'); }
      };
    }
    function shown(c) { return c.offsetParent !== null; }
    function queueFrom(card) {
      var sib = [].slice.call(card.parentElement.querySelectorAll('.q-card')).filter(shown);
      var i = sib.indexOf(card); if (i < 0) { sib = [card]; i = 0; }
      return sib.slice(i).map(item);
    }
    function track(name, p) { try { if (typeof gtag === 'function') gtag('event', name, p || {}); } catch (e) { /* ignore */ } }

    all.forEach(function (card) {
      var meta = card.querySelector('.q-meta'); if (!meta || meta.querySelector('.tts-btn')) return;
      var b = V.button('Listen', function () {
        track('voice_play', { from: 'question' });
        V.play(queueFrom(card));
      }, card.dataset.ttsKey, true);
      var side = meta.querySelector('.rd-side');
      if (side) meta.insertBefore(b, side); else meta.appendChild(b);
    });

    document.querySelectorAll('.topic-header').forEach(function (h) {
      if (h.querySelector('.tts-btn')) return;
      var b = V.button('Listen to this topic', function () {
        var sec = h.parentElement, first = [].slice.call(sec.querySelectorAll('.q-card')).filter(shown)[0];
        if (!first) return;
        track('voice_play', { from: 'topic' });
        V.play(queueFrom(first));
      }, null, false);
      b.classList.add('tts-topic');
      h.appendChild(b);
    });

    var st = document.createElement('style');
    st.textContent = '.q-meta .tts-ic{margin-left:auto}.q-meta .tts-ic+.rd-side{margin-left:8px}' +
      '.topic-header .tts-topic{margin-top:14px;background:rgba(255,255,255,.92);color:#14444d;border-color:transparent;box-shadow:0 6px 16px rgba(0,0,0,.12);font-size:14px;padding:9px 16px 9px 12px}' +
      '.topic-header .tts-topic.on{background:#fff;color:#168592}' +
      '.q-answer-inner .tts-now{padding-left:6px}' +
      '@media(max-width:640px){.q-meta .tts-ic{width:30px;height:30px}.q-meta .tts-ic svg{width:14px;height:14px}}';
    document.head.appendChild(st);

    // Stop reading when the user switches topic.
    document.addEventListener('click', function (e) { if (e.target.closest('.topic-nav-item, [data-topic]')) V.stop(); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
