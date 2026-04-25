/* =========================================================
   DENTELLE RIYADH — Newsletter signup
   POSTs the email to /api/subscribe (Vercel serverless function),
   which uses the Shopify Admin API to create the customer
   with email_marketing_consent = subscribed.
   Subscribers appear in Shopify Admin → Customers,
   tagged "newsletter", marked "Email subscribed".
   ========================================================= */
(function () {
  'use strict';

  var ENDPOINT = '/api/subscribe';

  var COPY = {
    en: { sending: 'Sending…', done: 'Merci ✦', err: 'Try again' },
    ar: { sending: 'جارٍ الإرسال…', done: 'شكراً ✦', err: 'حاولي مجدداً' }
  };

  document.querySelectorAll('[data-newsletter-form]').forEach(function (form) {
    var lang = form.getAttribute('data-lang') === 'ar' ? 'ar' : 'en';
    var t = COPY[lang];
    var btn = form.querySelector('button[type="submit"]');
    var input = form.querySelector('input[type="email"]');
    var origLabel = btn ? btn.textContent : '';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      if (!email) return;

      btn.disabled = true;
      btn.textContent = t.sending;

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            btn.textContent = t.done;
            input.value = '';
            input.disabled = true;
          } else {
            console.warn('[Dentelle] subscribe failed:', res.j);
            btn.disabled = false;
            btn.textContent = t.err;
            setTimeout(function () { btn.textContent = origLabel; }, 2500);
          }
        })
        .catch(function (err) {
          console.warn('[Dentelle] subscribe error:', err);
          btn.disabled = false;
          btn.textContent = t.err;
          setTimeout(function () { btn.textContent = origLabel; }, 2500);
        });
    });
  });
})();
