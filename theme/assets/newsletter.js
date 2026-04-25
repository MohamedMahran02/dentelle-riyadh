/* =========================================================
   DENTELLE RIYADH — Newsletter signup
   POSTs the email to Shopify's customer endpoint.
   Subscribers appear in Shopify Admin → Customers,
   tagged "newsletter", with "Accepts marketing" enabled.
   ========================================================= */
(function () {
  'use strict';

  if (!window.SHOPIFY || !window.SHOPIFY.domain) return;

  var ENDPOINT = 'https://' + window.SHOPIFY.domain + '/contact';

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

      // Build Shopify-style form payload
      var fd = new FormData();
      fd.append('form_type', 'customer');
      fd.append('utf8', '✓');
      fd.append('contact[tags]', 'newsletter,prospect');
      fd.append('contact[email]', email);
      fd.append('contact[accepts_marketing]', 'true');

      // Cross-origin POST to *.myshopify.com — use no-cors so Shopify
      // accepts the form even though we can't read the response.
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        body: fd
      })
        .then(function () {
          btn.textContent = t.done;
          input.value = '';
          input.disabled = true;
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = t.err;
          setTimeout(function () { btn.textContent = origLabel; }, 2500);
        });
    });
  });
})();
