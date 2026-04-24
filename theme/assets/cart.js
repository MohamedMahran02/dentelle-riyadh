/* =========================================================
   DENTELLE RIYADH — Local Cart / Wishlist / Drawer
   Works on static preview (localStorage).
   When connected to Shopify, this file is replaced by
   the Shopify Cart API + section-rendered cart drawer.
   ========================================================= */
(function () {
  'use strict';

  const CART_KEY = 'dentelle_cart';
  const WISH_KEY = 'dentelle_wish';

  /* ------ storage helpers ------ */
  const getCart  = () => JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  const saveCart = (items) => localStorage.setItem(CART_KEY, JSON.stringify(items));
  const getWish  = () => JSON.parse(localStorage.getItem(WISH_KEY) || '[]');
  const saveWish = (items) => localStorage.setItem(WISH_KEY, JSON.stringify(items));

  const fmt = (n) => 'SAR\u00a0' + Number(n).toFixed(0);

  /* ------ count badge ------ */
  function refreshCounts() {
    const count = getCart().reduce((s, i) => s + i.qty, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = count > 0 ? count : '';
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  /* =========================================================
     Cart API
     ========================================================= */
  window.DentelleCart = {
    add: function (product, size, qty) {
      qty = qty || 1;
      var items   = getCart();
      var key     = product.slug + '::' + size;
      var existing = items.find(function (i) { return i.key === key; });
      if (existing) {
        existing.qty += qty;
      } else {
        items.push({
          key      : key,
          slug     : product.slug,
          title_en : product.title_en,
          title_ar : product.title_ar || '',
          price    : product.price,
          image    : product.images[0],
          size     : size,
          qty      : qty
        });
      }
      saveCart(items);
      refreshCounts();
      Drawer.open();
    },

    remove: function (key) {
      saveCart(getCart().filter(function (i) { return i.key !== key; }));
      refreshCounts();
      Drawer.refresh();
    },

    update: function (key, qty) {
      qty = Number(qty);
      if (qty < 1) { this.remove(key); return; }
      var items = getCart();
      var item  = items.find(function (i) { return i.key === key; });
      if (item) { item.qty = qty; saveCart(items); refreshCounts(); Drawer.refresh(); }
    },

    getAll  : getCart,
    getCount: function () { return getCart().reduce(function (s, i) { return s + i.qty; }, 0); }
  };

  /* =========================================================
     Wishlist API
     ========================================================= */
  window.DentelleWishlist = {
    toggle: function (slug) {
      var items = getWish();
      var idx   = items.indexOf(slug);
      if (idx > -1) items.splice(idx, 1);
      else items.push(slug);
      saveWish(items);
      this.refreshButtons();
      return idx === -1; /* true = just added */
    },
    has    : function (slug) { return getWish().includes(slug); },
    getAll : getWish,
    refreshButtons: function () {
      var wish = getWish();
      document.querySelectorAll('[data-wish-toggle]').forEach(function (btn) {
        var slug = btn.dataset.wishToggle;
        btn.classList.toggle('is-wished', wish.includes(slug));
        btn.setAttribute('aria-pressed', wish.includes(slug));
      });
    }
  };

  /* =========================================================
     Cart Drawer
     ========================================================= */
  var Drawer = {
    node   : null,
    overlay: null,
    isOpen : false,

    init: function () {
      /* Drawer panel */
      var el = document.createElement('div');
      el.id        = 'LocalCartDrawer';
      el.className = 'cart-drawer';
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Shopping bag');
      document.body.appendChild(el);
      this.node = el;

      /* Overlay */
      var ov = document.createElement('div');
      ov.className = 'cart-drawer-overlay';
      var self = this;
      ov.addEventListener('click', function () { self.close(); });
      document.body.appendChild(ov);
      this.overlay = ov;
    },

    buildItemHtml: function (item) {
      return '<article class="cart-drawer__item">' +
        '<img src="' + item.image + '" alt="' + item.title_en + '" width="80" height="100" loading="lazy">' +
        '<div class="cart-drawer__item-body">' +
          '<h4>' + item.title_en + '</h4>' +
          (item.title_ar ? '<p class="cart-drawer__item-ar" dir="rtl" lang="ar">' + item.title_ar + '</p>' : '') +
          '<p class="cart-drawer__item-meta">Size: ' + item.size + ' &nbsp;·&nbsp; ' + fmt(item.price) + '</p>' +
          '<div class="cart-drawer__item-actions">' +
            '<div class="qty-control">' +
              '<button type="button" class="qty-control__btn" data-drawer-step="' + item.key + '" data-drawer-dir="-1" aria-label="Decrease">−</button>' +
              '<input type="number" class="qty-control__input" min="1" value="' + item.qty + '" data-drawer-qty="' + item.key + '" aria-label="Quantity">' +
              '<button type="button" class="qty-control__btn" data-drawer-step="' + item.key + '" data-drawer-dir="1" aria-label="Increase">+</button>' +
            '</div>' +
            '<button type="button" class="cart-drawer__remove" data-cart-remove="' + item.key + '">Remove</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    },

    render: function () {
      if (!this.node) return;
      var items = getCart();
      var total = items.reduce(function (s, i) { return s + i.price * i.qty; }, 0);

      var itemsHtml = items.length
        ? items.map(this.buildItemHtml).join('')
        : '<p class="cart-drawer__empty">Your bag is empty.<br><a href="collection.html" class="link-underline" style="margin-top:1rem;display:inline-block;">Browse the collection ›</a></p>';

      var footerHtml = items.length
        ? '<footer class="cart-drawer__footer">' +
            '<div class="cart-drawer__subtotal">' +
              '<span class="eyebrow">Subtotal</span>' +
              '<span class="cart-drawer__total-price">' + fmt(total) + '</span>' +
            '</div>' +
            '<a href="cart.html" class="btn btn--lg" style="justify-content:center;width:100%;">View bag &amp; checkout</a>' +
          '</footer>'
        : '';

      this.node.innerHTML =
        '<div class="cart-drawer__inner">' +
          '<header class="cart-drawer__header">' +
            '<span class="eyebrow">Your bag (' + items.reduce(function (s, i) { return s + i.qty; }, 0) + ')</span>' +
            '<button type="button" class="cart-drawer__close" data-cart-close aria-label="Close bag">&#x2715;</button>' +
          '</header>' +
          '<div class="cart-drawer__items">' + itemsHtml + '</div>' +
          footerHtml +
        '</div>';

      /* Wire qty controls */
      var self = this;
      this.node.querySelectorAll('[data-drawer-qty]').forEach(function (input) {
        input.addEventListener('change', function () {
          window.DentelleCart.update(input.dataset.drawerQty, Number(input.value));
        });
      });
      this.node.querySelectorAll('[data-drawer-step]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key  = btn.dataset.drawerStep;
          var dir  = Number(btn.dataset.drawerDir);
          var item = getCart().find(function (i) { return i.key === key; });
          if (item) window.DentelleCart.update(key, item.qty + dir);
        });
      });
      this.node.querySelectorAll('[data-cart-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          window.DentelleCart.remove(btn.dataset.cartRemove);
        });
      });
    },

    refresh: function () { if (this.isOpen) this.render(); },

    open: function () {
      this.render();
      this.node.classList.add('is-open');
      this.node.setAttribute('aria-hidden', 'false');
      this.overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      this.isOpen = true;
    },

    close: function () {
      if (!this.node) return;
      this.node.classList.remove('is-open');
      this.node.setAttribute('aria-hidden', 'true');
      this.overlay.classList.remove('is-open');
      document.body.style.overflow = '';
      this.isOpen = false;
    }
  };

  /* =========================================================
     Init on DOMContentLoaded
     ========================================================= */
  /* =========================================================
     Dentelle star rating helper
     ========================================================= */
  var STAR_PATH = 'M60 6 L66 26 L86 32 L66 38 L60 58 L54 38 L34 32 L54 26 Z';
  var STAR_VB   = '20 2 80 60';

  function starsHtml(rating, count) {
    var html = '<div class="star-rating" aria-label="' + rating + ' out of 5">';
    for (var i = 0; i < 5; i++) {
      var cls = rating >= i + 0.75 ? 'is-filled' : rating >= i + 0.25 ? 'is-half' : '';
      html += '<svg class="d-star ' + cls + '" viewBox="' + STAR_VB + '" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
    }
    html += '<span class="star-rating__count">(' + count + ')</span></div>';
    return html;
  }

  /* =========================================================
     Quick-add card initialisation
     Reads data-slug / data-rating / data-reviews from each
     .product-card and injects the overlay + stars.
     ========================================================= */
  function initProductCards() {
    document.querySelectorAll('.product-card[data-slug]').forEach(function (card) {
      var slug    = card.dataset.slug;
      var product = window.PRODUCTS_BY_SLUG && window.PRODUCTS_BY_SLUG[slug];
      var media   = card.querySelector('.product-card__media');
      if (!media) return;

      /* Wrap media in .product-card__visual (once only) */
      if (!card.querySelector('.product-card__visual')) {
        var visual = document.createElement('div');
        visual.className = 'product-card__visual';
        media.parentNode.insertBefore(visual, media);
        visual.appendChild(media);

        /* Build size buttons */
        var sizesHtml = product ? product.sizes.map(function (s) {
          return '<button type="button" class="product-card__size-btn" data-size="' + s + '">' + s + '</button>';
        }).join('') : '';

        /* Inject quick-add overlay */
        visual.insertAdjacentHTML('beforeend',
          '<div class="product-card__quick-add" aria-hidden="true">' +
            '<div class="product-card__sizes">' + sizesHtml + '</div>' +
            '<button type="button" class="product-card__atc-btn" data-quick-atc>Add to bag</button>' +
          '</div>'
        );
      }

      /* Inject star rating (once only) */
      var rating  = parseFloat(card.dataset.rating);
      var reviews = parseInt(card.dataset.reviews, 10);
      if (rating && reviews && !card.querySelector('.star-rating')) {
        var meta = card.querySelector('.product-card__meta');
        if (meta) meta.insertAdjacentHTML('afterbegin', starsHtml(rating, reviews));
      }
    });
  }

  /* =========================================================
     Init on DOMContentLoaded
     ========================================================= */
  document.addEventListener('DOMContentLoaded', function () {
    Drawer.init();
    refreshCounts();
    window.DentelleWishlist.refreshButtons();
    initProductCards();

    /* Unified click delegation */
    document.addEventListener('click', function (e) {

      /* ---- Quick-add: size button ---- */
      var sizeBtn = e.target.closest('.product-card__size-btn');
      if (sizeBtn) {
        e.preventDefault();
        e.stopPropagation();
        var row = sizeBtn.closest('.product-card__sizes');
        row.querySelectorAll('.product-card__size-btn').forEach(function (b) {
          b.classList.remove('is-selected');
        });
        sizeBtn.classList.add('is-selected');
        return;
      }

      /* ---- Quick-add: add to bag ---- */
      var atcBtn = e.target.closest('[data-quick-atc]');
      if (atcBtn) {
        e.preventDefault();
        e.stopPropagation();
        var card    = atcBtn.closest('.product-card');
        if (!card) return;
        var cardSlug = card.dataset.slug;
        var chosen   = card.querySelector('.product-card__size-btn.is-selected');
        if (!chosen) {
          chosen = card.querySelector('.product-card__size-btn');
          if (chosen) chosen.classList.add('is-selected');
        }
        var size    = chosen ? chosen.dataset.size : 'One Size';
        var product = window.PRODUCTS_BY_SLUG && window.PRODUCTS_BY_SLUG[cardSlug];
        if (product && window.DentelleCart) {
          window.DentelleCart.add(product, size, 1);
          atcBtn.textContent = 'Added ✓';
          atcBtn.disabled = true;
          setTimeout(function () {
            atcBtn.textContent = 'Add to bag';
            atcBtn.disabled = false;
          }, 1500);
        }
        return;
      }

      /* ---- Close cart drawer ---- */
      if (e.target.closest('[data-cart-close]')) {
        Drawer.close();
        return;
      }

      /* ---- Cart toggle (bag icon) ---- */
      var toggle = e.target.closest('[data-cart-toggle]');
      if (toggle) {
        e.preventDefault();
        Drawer.isOpen ? Drawer.close() : Drawer.open();
        return;
      }

      /* ---- Wishlist toggle ---- */
      var wish = e.target.closest('[data-wish-toggle]');
      if (wish) {
        e.preventDefault();
        var added = window.DentelleWishlist.toggle(wish.dataset.wishToggle);
        wish.classList.toggle('is-wished', added);
        wish.setAttribute('aria-pressed', added);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && Drawer.isOpen) Drawer.close();
    });
  });

  /* Expose for other scripts */
  window.DentelleCartDrawer = Drawer;

})();
