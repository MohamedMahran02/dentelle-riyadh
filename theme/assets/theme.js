/* =========================================================
   DENTELLE RIYADH — Theme JS
   Homepage behaviour + Shopify shop flow (variant picker,
   add-to-cart, cart drawer, quantity updates).
   ========================================================= */
(function () {
  'use strict';

  const THEME = (window.theme = window.theme || {});
  const ROUTES = THEME.routes || {
    cart_url: '/cart',
    cart_add_url: '/cart/add',
    cart_change_url: '/cart/change',
    cart_update_url: '/cart/update'
  };

  /* =========================================================
     Utilities
     ========================================================= */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const formatMoney = (cents) => {
    if (THEME.money_format) {
      const amt = (cents / 100).toFixed(2);
      return THEME.money_format.replace(/\{\{\s*amount[_a-z]*\s*\}\}/, amt);
    }
    return 'SAR ' + (cents / 100).toFixed(2);
  };

  const fetchJSON = (url, options = {}) =>
    fetch(url, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...options
    }).then((r) => {
      if (!r.ok) return r.json().then((err) => Promise.reject(err));
      return r.json();
    });

  /* =========================================================
     Sticky header state
     ========================================================= */
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 8) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* =========================================================
     Scroll reveal
     ========================================================= */
  const revealTargets = $$('[data-reveal]');
  if ('IntersectionObserver' in window && revealTargets.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  }

  /* =========================================================
     Parallax
     ========================================================= */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const parallaxEls = $$('[data-parallax]');
  if (parallaxEls.length && !prefersReduced) {
    let ticking = false;
    const update = () => {
      parallaxEls.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
        const y = Math.max(Math.min(progress * -22, 40), -40);
        el.style.transform = `translate3d(0, ${y}px, 0)`;
      });
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* =========================================================
     Mobile menu
     ========================================================= */
  const menuToggle = $('[data-menu-toggle]');
  const menuPanel = $('[data-menu-panel]');
  if (menuToggle && menuPanel) {
    const openMenu = () => {
      menuToggle.setAttribute('aria-expanded', 'true');
      menuPanel.setAttribute('aria-hidden', 'false');
      menuPanel.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const closeMenu = () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuPanel.setAttribute('aria-hidden', 'true');
      menuPanel.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    menuToggle.addEventListener('click', () => {
      menuPanel.classList.contains('is-open') ? closeMenu() : openMenu();
    });
    $$('a', menuPanel).forEach((a) => a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuPanel.classList.contains('is-open')) closeMenu();
    });
  }

  /* =========================================================
     Cart API
     ========================================================= */
  const Cart = {
    add(variantId, quantity = 1, properties = {}) {
      const body = { items: [{ id: Number(variantId), quantity, properties }] };
      return fetchJSON(ROUTES.cart_add_url + '.js', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    change(key, quantity) {
      return fetchJSON(ROUTES.cart_change_url + '.js', {
        method: 'POST',
        body: JSON.stringify({ id: key, quantity })
      });
    },
    get() {
      return fetchJSON(ROUTES.cart_url + '.js');
    }
  };

  const updateCartCount = (count) => {
    $$('[data-cart-count]').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
      el.classList.toggle('bag-count--empty', count === 0);
    });
  };

  /* =========================================================
     Product page — variant picker + add-to-cart
     ========================================================= */
  const productForm = $('[data-product-form]');
  if (productForm) {
    const variantJsonNode = $('[data-variant-json]');
    const variants = variantJsonNode ? JSON.parse(variantJsonNode.textContent) : [];
    const variantInput = $('[data-variant-id]', productForm);
    const addBtn = $('[data-add-to-cart]', productForm);
    const addBtnText = $('[data-add-to-cart-text]', productForm);
    const priceContainer = $('[data-product-price]');

    const selectedOptions = () =>
      $$('[data-option-input]:checked', productForm).map((i) => i.value);

    const findVariant = (options) =>
      variants.find((v) =>
        v.options.every((opt, idx) => opt === options[idx])
      );

    const setVariant = (variant) => {
      if (!variant) {
        addBtn.disabled = true;
        addBtnText.textContent = window.theme_strings?.unavailable || 'Unavailable';
        variantInput.value = '';
        return;
      }
      variantInput.value = variant.id;
      addBtn.disabled = !variant.available;
      addBtnText.textContent = variant.available
        ? window.theme_strings?.add_to_cart || 'Add to bag'
        : window.theme_strings?.sold_out || 'Sold out';
      if (priceContainer) {
        let html = `<span class="price__amount">${formatMoney(variant.price)}</span>`;
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          html =
            `<s class="price__compare">${formatMoney(variant.compare_at_price)}</s> ` + html;
        }
        const priceEl = priceContainer.querySelector('.price');
        if (priceEl) priceEl.innerHTML = html;
      }
      // Update URL with variant ID (without reload)
      const url = new URL(window.location);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url);

      // Swap featured media
      if (variant.featured_media && variant.featured_media.id) {
        selectMedia(variant.featured_media.id);
      }
    };

    productForm.addEventListener('change', (e) => {
      if (!e.target.matches('[data-option-input]')) return;
      const variant = findVariant(selectedOptions());
      setVariant(variant);
    });

    productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!variantInput.value) return;
      addBtn.disabled = true;
      const originalText = addBtnText.textContent;
      addBtnText.textContent = window.theme_strings?.adding || 'Adding…';
      try {
        await Cart.add(variantInput.value, Number($('input[name="quantity"]', productForm).value || 1));
        const cart = await Cart.get();
        updateCartCount(cart.item_count);
        addBtnText.textContent = window.theme_strings?.added || 'Added';
        CartDrawer.open();
        setTimeout(() => {
          addBtn.disabled = false;
          addBtnText.textContent = originalText;
        }, 1500);
      } catch (err) {
        console.error('Cart add failed:', err);
        addBtn.disabled = false;
        addBtnText.textContent = originalText;
        alert(err.description || 'Could not add to cart.');
      }
    });

    /* Gallery: click thumb → switch main image */
    const selectMedia = (mediaId) => {
      $$('[data-media-id]').forEach((fig) =>
        fig.classList.toggle('is-active', String(fig.dataset.mediaId) === String(mediaId))
      );
      $$('[data-thumb-for]').forEach((btn) =>
        btn.classList.toggle('is-active', String(btn.dataset.thumbFor) === String(mediaId))
      );
    };
    $$('[data-thumb-for]').forEach((btn) => {
      btn.addEventListener('click', () => selectMedia(btn.dataset.thumbFor));
    });
  }

  /* =========================================================
     Cart page — inline quantity update / remove
     ========================================================= */
  const cartForm = $('[data-cart-form]');
  if (cartForm) {
    const debounce = (fn, ms = 400) => {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    };

    const updateItem = async (key, qty) => {
      try {
        const cart = await Cart.change(key, qty);
        updateCartCount(cart.item_count);
        // Simple: reload to reflect line totals / empty state
        window.location.reload();
      } catch (err) {
        console.error(err);
      }
    };

    cartForm.addEventListener(
      'input',
      debounce((e) => {
        if (e.target.matches('[data-cart-qty]')) {
          updateItem(e.target.dataset.lineKey, Number(e.target.value));
        }
      })
    );

    cartForm.addEventListener('click', (e) => {
      if (e.target.matches('[data-cart-remove]')) {
        e.preventDefault();
        updateItem(e.target.dataset.lineKey, 0);
      }
    });
  }

  /* =========================================================
     Cart drawer
     ========================================================= */
  const CartDrawer = {
    node: document.getElementById('CartDrawer'),
    opened: false,
    async render() {
      if (!this.node) return;
      try {
        const res = await fetch(ROUTES.cart_url + '?section_id=cart-drawer', {
          headers: { Accept: 'text/html' }
        });
        if (res.ok) {
          const html = await res.text();
          this.node.innerHTML = html;
        } else {
          // Fallback: link to cart page
          const cart = await Cart.get();
          this.node.innerHTML = this._renderFallback(cart);
        }
      } catch {
        const cart = await Cart.get();
        this.node.innerHTML = this._renderFallback(cart);
      }
    },
    _renderFallback(cart) {
      const itemsHtml =
        cart.items
          .map(
            (i) => `
              <article class="cart-drawer__item">
                <img src="${i.image}" alt="${i.product_title}" width="80" height="100" loading="lazy">
                <div>
                  <h4><a href="${i.url}">${i.product_title}</a></h4>
                  <p>${i.variant_title || ''}</p>
                  <p>${formatMoney(i.final_line_price)} · Qty ${i.quantity}</p>
                </div>
              </article>
            `
          )
          .join('') || `<p class="cart-drawer__empty">Your bag is empty.</p>`;

      return `
        <div class="cart-drawer__inner">
          <header class="cart-drawer__header">
            <span class="eyebrow">Your bag</span>
            <button type="button" class="cart-drawer__close" data-cart-close aria-label="Close">✕</button>
          </header>
          <div class="cart-drawer__items">${itemsHtml}</div>
          ${
            cart.item_count > 0
              ? `<footer class="cart-drawer__footer">
                  <div class="cart-drawer__subtotal">
                    <span class="eyebrow">Subtotal</span>
                    <span>${formatMoney(cart.total_price)}</span>
                  </div>
                  <a href="${ROUTES.cart_url}" class="btn btn--lg">Checkout</a>
                </footer>`
              : ''
          }
        </div>
      `;
    },
    async open() {
      if (!this.node) return;
      await this.render();
      this.node.classList.add('is-open');
      this.node.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      this.opened = true;
    },
    close() {
      if (!this.node) return;
      this.node.classList.remove('is-open');
      this.node.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      this.opened = false;
    }
  };

  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-cart-close]')) {
      CartDrawer.close();
    }
    if (e.target.closest('[data-cart-toggle]')) {
      // Only hijack if drawer available; else let link navigate
      if (CartDrawer.node) {
        e.preventDefault();
        CartDrawer.opened ? CartDrawer.close() : CartDrawer.open();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && CartDrawer.opened) CartDrawer.close();
  });

  /* Expose for debugging / other scripts */
  window.theme.Cart = Cart;
  window.theme.CartDrawer = CartDrawer;

  /* =========================================================
     Carousel — horizontal snap-scroll with arrow buttons
     ========================================================= */
  $$('[data-carousel]').forEach((track) => {
    const wrap    = track.closest('.product-grid__carousel-wrap');
    if (!wrap) return;

    const section  = track.closest('.product-grid');
    const prevBtn  = wrap.querySelector('[data-carousel-prev]');
    const nextBtn  = wrap.querySelector('[data-carousel-next]');
    const dotsWrap = section?.querySelector('[data-carousel-dots]');
    const cards    = Array.from(track.querySelectorAll('.product-card'));

    /* Build dots */
    if (dotsWrap && cards.length) {
      cards.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', 'Go to piece ' + (i + 1));
        dot.addEventListener('click', () => scrollToCard(i));
        dotsWrap.appendChild(dot);
      });
    }

    const getDots = () => dotsWrap ? Array.from(dotsWrap.querySelectorAll('.carousel-dot')) : [];

    /* Scroll helpers */
    const cardStep = () => {
      const card = cards[0];
      if (!card) return 300;
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      return card.offsetWidth + gap;
    };

    const scrollToCard = (idx) => {
      const card = cards[idx];
      if (!card) return;
      track.scrollTo({ left: card.offsetLeft - parseFloat(getComputedStyle(track).paddingLeft), behavior: 'smooth' });
    };

    /* Current index (which card is most visible at left) */
    const currentIndex = () => {
      const padLeft  = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const scrolled = track.scrollLeft;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((card, i) => {
        const dist = Math.abs(card.offsetLeft - padLeft - scrolled);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      return best;
    };

    /* Update arrow + dot state */
    const updateState = () => {
      const atStart = track.scrollLeft <= 4;
      const atEnd   = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      if (prevBtn) prevBtn.disabled = atStart;
      if (nextBtn) nextBtn.disabled = atEnd;

      const idx  = currentIndex();
      getDots().forEach((dot, i) => dot.classList.toggle('is-active', i === idx));
    };

    /* Arrow clicks — scroll by one card */
    if (prevBtn) prevBtn.addEventListener('click', () => track.scrollBy({ left: -cardStep(), behavior: 'smooth' }));
    if (nextBtn) nextBtn.addEventListener('click', () => track.scrollBy({ left:  cardStep(), behavior: 'smooth' }));

    track.addEventListener('scroll', updateState, { passive: true });
    updateState(); /* initial state */

    /* Keyboard arrow support when track is focused */
    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); track.scrollBy({ left: -cardStep(), behavior: 'smooth' }); }
      if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left:  cardStep(), behavior: 'smooth' }); }
    });

    /* Drag-to-scroll (mouse) */
    let isDragging = false;
    let startX = 0;
    let startScroll = 0;
    track.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX     = e.pageX - track.offsetLeft;
      startScroll = track.scrollLeft;
      track.style.cursor = 'grabbing';
      track.style.userSelect = 'none';
    });
    track.addEventListener('mouseleave', () => { isDragging = false; track.style.cursor = ''; });
    track.addEventListener('mouseup',    () => { isDragging = false; track.style.cursor = ''; track.style.userSelect = ''; });
    track.addEventListener('mousemove',  (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const x    = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.2;
      track.scrollLeft = startScroll - walk;
    });
  });

})();
