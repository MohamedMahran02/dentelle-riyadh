/* =========================================================
   DENTELLE RIYADH — Live product fetch from Shopify Storefront API
   Auto-updates window.PRODUCTS + PRODUCTS_BY_SLUG whenever
   the store catalog changes. Caches in localStorage (5 min TTL).
   Fires window 'dentelle:products-updated' when fresh data lands.
   ========================================================= */
(function () {
  'use strict';

  if (!window.SHOPIFY || !window.SHOPIFY.storefrontToken) {
    console.warn('[Dentelle] shopify-config missing — products live-fetch disabled.');
    return;
  }

  var CACHE_KEY = 'dentelle:products:v5';
  var CACHE_TTL = 5 * 60 * 1000; // 5 min

  var QUERY = [
    '{',
    '  products(first: 50, sortKey: CREATED_AT) {',
    '    edges {',
    '      node {',
    '        id handle title descriptionHtml productType tags vendor createdAt',
    '        collections(first: 10) { edges { node { handle } } }',
    '        images(first: 10) { edges { node { url altText } } }',
    '        variants(first: 20) {',
    '          edges {',
    '            node {',
    '              id title availableForSale',
    '              selectedOptions { name value }',
    '              price { amount currencyCode }',
    '              compareAtPrice { amount }',
    '            }',
    '          }',
    '        }',
    '        titleAr: metafield(namespace: "custom", key: "title_ar") { value }',
    '        subtitle: metafield(namespace: "custom", key: "subtitle") { value }',
    '        descAr:  metafield(namespace: "custom", key: "description_ar") { value }',
    '      }',
    '    }',
    '  }',
    '}'
  ].join('\n');

  function stripHtmlFirstP(html) {
    if (!html) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var p = tmp.querySelector('p');
    return (p ? p.textContent : tmp.textContent || '').trim();
  }

  function transform(edges) {
    return (edges || []).map(function (edge) {
      var n = edge.node;
      var variantsMap = {};
      var sizes = [];
      var firstPrice = null;

      (n.variants && n.variants.edges || []).forEach(function (vEdge) {
        var v = vEdge.node;
        var sizeOpt = (v.selectedOptions || []).find(function (o) { return o.name === 'Size'; });
        var size = (sizeOpt && sizeOpt.value) || v.title;
        variantsMap[size] = v.id;
        if (sizes.indexOf(size) === -1) sizes.push(size);
        if (firstPrice === null && v.price) firstPrice = parseFloat(v.price.amount);
      });

      var images = (n.images && n.images.edges || []).map(function (e) { return e.node.url; });
      var collectionHandles = (n.collections && n.collections.edges || []).map(function (e) { return e.node.handle; });
      var desc_en_full = stripHtmlFirstP(n.descriptionHtml);

      return {
        slug: n.handle,
        shopify_handle: n.handle,
        shopify_id: n.id,
        category: (n.productType || '').toLowerCase(),
        title_en: n.title,
        title_ar: (n.titleAr && n.titleAr.value) || '',
        subtitle: (n.subtitle && n.subtitle.value) || ((n.vendor || '') + (n.productType ? ' — ' + n.productType : '')),
        description_en: desc_en_full,
        description_ar: (n.descAr && n.descAr.value) || '',
        price: Math.round(firstPrice || 0),
        compare_at: null,
        rating: 4.7, review_count: 20,
        sizes: sizes,
        variants: variantsMap,
        images: images,
        is_signature: (n.tags || []).indexOf('signature') !== -1,
        tags: n.tags || [],
        collections: collectionHandles,
        details: 'Lace 78% polyamide, 15% elastane, 7% metallic fibers.',
        details_ar: 'دانتيل 78% بولياميد، 15% إيلاستين، 7% ألياف معدنية.',
        care: 'Hand wash at 30°C max. No bleach, no machine drying. Low-temperature ironing only.',
        care_ar: 'غسيل يدوي بحد أقصى 30 درجة. بدون مُبيّض، بدون تجفيف آلي. كيّ على درجة حرارة منخفضة فقط.',
        shipping: 'Free shipping within the Kingdom · SASO certified · Delivery 2–5 working days.',
        shipping_ar: 'شحن مجاني داخل المملكة · معتمد ساسو · التوصيل من 2 إلى 5 أيام عمل.'
      };
    });
  }

  function install(products) {
    window.PRODUCTS = products;
    window.PRODUCTS_BY_SLUG = products.reduce(function (a, p) { a[p.slug] = p; return a; }, {});
    window.dispatchEvent(new CustomEvent('dentelle:products-updated', { detail: { products: products } }));
  }

  // 1) Serve cache immediately if fresh
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.ts && Date.now() - cached.ts < CACHE_TTL && Array.isArray(cached.products)) {
      install(cached.products);
    }
  } catch (e) {}

  // 2) Always fetch fresh from Shopify Storefront API
  var endpoint = 'https://' + window.SHOPIFY.domain +
                 '/api/' + (window.SHOPIFY.apiVersion || '2024-10') +
                 '/graphql.json';

  window.PRODUCTS_READY = fetch(endpoint, {
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
      if (!res || !res.data || !res.data.products) {
        throw new Error('Bad Storefront API response');
      }
      var products = transform(res.data.products.edges);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), products: products })); } catch (e) {}
      install(products);
      return products;
    })
    .catch(function (err) {
      console.warn('[Dentelle] live product fetch failed:', err);
      return window.PRODUCTS || [];
    });

  // Public helper
  window.DentelleProducts = {
    onReady: function (cb) {
      if (window.PRODUCTS && window.PRODUCTS.length) cb(window.PRODUCTS);
      if (window.PRODUCTS_READY) window.PRODUCTS_READY.then(cb);
    }
  };
})();
