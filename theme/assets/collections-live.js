/* =========================================================
   DENTELLE RIYADH — Live collections fetch from Shopify Storefront API
   Auto-updates window.COLLECTIONS whenever a collection is added/edited.
   ========================================================= */
(function () {
  'use strict';

  if (!window.SHOPIFY || !window.SHOPIFY.storefrontToken) return;

  var CACHE_KEY = 'dentelle:collections:v2';
  var CACHE_TTL = 5 * 60 * 1000;

  var QUERY = [
    '{',
    '  collections(first: 30, sortKey: TITLE) {',
    '    edges {',
    '      node {',
    '        id handle title descriptionHtml',
    '        image { url altText }',
    '        products(first: 50) {',
    '          edges {',
    '            node {',
    '              id',
    '              featuredImage { url }',
    '              images(first: 3) { edges { node { url } } }',
    '              priceRange { minVariantPrice { amount currencyCode } }',
    '            }',
    '          }',
    '        }',
    '        titleAr: metafield(namespace: "custom", key: "title_ar") { value }',
    '        descAr: metafield(namespace: "custom", key: "description_ar") { value }',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  function stripHtml(html) {
    if (!html) return '';
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').trim();
  }

  function transform(edges) {
    return (edges || []).map(function (e) {
      var n = e.node;
      var prods = (n.products && n.products.edges) || [];
      var first = prods[0] && prods[0].node;
      var imgs = (first && first.images && first.images.edges) || [];
      var heroImg = (n.image && n.image.url)
                 || (first && first.featuredImage && first.featuredImage.url)
                 || '';
      var hoverImg = (imgs[1] && imgs[1].node.url)
                  || (first && first.featuredImage && first.featuredImage.url)
                  || heroImg;

      // Min price
      var minPrice = null;
      prods.forEach(function (pe) {
        var amt = pe.node && pe.node.priceRange && pe.node.priceRange.minVariantPrice;
        if (amt) {
          var v = parseFloat(amt.amount);
          if (minPrice === null || v < minPrice) minPrice = v;
        }
      });

      return {
        handle: n.handle,
        title: n.title,
        title_ar: (n.titleAr && n.titleAr.value) || '',
        description: stripHtml(n.descriptionHtml),
        description_ar: (n.descAr && n.descAr.value) || '',
        image: heroImg,
        hover_image: hoverImg,
        product_count: prods.length,
        min_price: minPrice ? Math.round(minPrice) : null,
        currency: 'SAR'
      };
    });
  }

  function install(collections) {
    window.COLLECTIONS = collections;
    window.COLLECTIONS_BY_HANDLE = collections.reduce(function (a, c) {
      a[c.handle] = c; return a;
    }, {});
    window.dispatchEvent(new CustomEvent('dentelle:collections-updated', {
      detail: { collections: collections }
    }));
  }

  // Cache → render fast
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.ts && Date.now() - cached.ts < CACHE_TTL && Array.isArray(cached.items)) {
      install(cached.items);
    }
  } catch (e) {}

  // Fresh fetch
  var endpoint = 'https://' + window.SHOPIFY.domain +
                 '/api/' + (window.SHOPIFY.apiVersion || '2024-10') +
                 '/graphql.json';

  fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-Shopify-Storefront-Access-Token': window.SHOPIFY.storefrontToken,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query: QUERY })
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.data || !res.data.collections) throw new Error('bad response');
      var items = transform(res.data.collections.edges);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items: items })); } catch (e) {}
      install(items);
    })
    .catch(function (err) {
      console.warn('[Dentelle] collections live fetch failed:', err);
    });
})();
