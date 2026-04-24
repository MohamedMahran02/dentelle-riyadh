/* =========================================================
   DENTELLE RIYADH — Shopify Storefront API checkout bridge
   Local cart lives in DentelleCart (localStorage).
   When the user clicks Checkout, this module creates a Shopify
   cart from the local items and redirects to Shopify's hosted
   checkout URL — secure payment, handled by Shopify.
   ========================================================= */
(function () {
  'use strict';

  if (!window.SHOPIFY || !window.SHOPIFY.storefrontToken) {
    console.warn('[Dentelle] shopify-config.js missing or misconfigured — checkout disabled.');
    return;
  }

  var ENDPOINT =
    'https://' +
    window.SHOPIFY.domain +
    '/api/' +
    (window.SHOPIFY.apiVersion || '2024-10') +
    '/graphql.json';

  function sf(query, variables) {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'X-Shopify-Storefront-Access-Token': window.SHOPIFY.storefrontToken,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); });
  }

  var CART_CREATE = [
    'mutation($input: CartInput!) {',
    '  cartCreate(input: $input) {',
    '    cart { id checkoutUrl totalQuantity }',
    '    userErrors { field message }',
    '  }',
    '}'
  ].join('\n');

  function buildLines(items) {
    if (!window.PRODUCTS_BY_SLUG) {
      throw new Error('PRODUCTS_BY_SLUG not loaded — make sure products.js is included.');
    }
    return items
      .map(function (i) {
        var p = window.PRODUCTS_BY_SLUG[i.slug];
        if (!p || !p.variants) return null;
        var vid = p.variants[i.size];
        if (!vid) {
          console.warn('[Dentelle] no Shopify variant for', i.slug, i.size);
          return null;
        }
        return { merchandiseId: vid, quantity: i.qty };
      })
      .filter(Boolean);
  }

  window.DentelleCheckout = {
    /**
     * Start Shopify checkout with the current local cart.
     * Reads from localStorage (same key DentelleCart uses).
     */
    start: async function () {
      var raw = localStorage.getItem('dentelle_cart') || '[]';
      var items;
      try { items = JSON.parse(raw); } catch (e) { items = []; }
      if (!items.length) {
        alert('Your bag is empty.');
        return;
      }

      var lines = buildLines(items);
      if (!lines.length) {
        alert('We could not prepare your order. Please refresh and try again.');
        return;
      }

      try {
        var res = await sf(CART_CREATE, { input: { lines: lines } });
        var cart = res && res.data && res.data.cartCreate && res.data.cartCreate.cart;
        if (!cart || !cart.checkoutUrl) {
          console.error('[Dentelle] cartCreate failed:', res);
          alert('Checkout is temporarily unavailable. Please try again shortly.');
          return;
        }
        // Clear local cart (Shopify now owns it; they may abandon and retry later)
        localStorage.setItem('dentelle_cart_checkout_url', cart.checkoutUrl);
        window.location.href = cart.checkoutUrl;
      } catch (err) {
        console.error('[Dentelle] checkout error:', err);
        alert('Checkout failed. Please check your connection and try again.');
      }
    }
  };
})();
