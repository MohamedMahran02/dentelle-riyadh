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
  if (productForm && $('[data-variant-id]', productForm)) {
    // Legacy Shopify-rendered product form path. The static storefront uses
    // shopify-cart.js instead and does NOT include [data-variant-id]; bail out
    // here to avoid a TypeError on submit.
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
     Legal Modal — Terms / Privacy / SASO / Shipping / Returns
     ========================================================= */
  /* =========================================================
     Locale switcher — preserve query string when swapping
     between EN ↔ AR pages (e.g. ?slug=mohra-6, ?handle=mohra)
     ========================================================= */
  (function preserveQueryOnLocaleSwitch() {
    var search = window.location.search || '';
    if (!search) return;
    var links = document.querySelectorAll('.locale-switcher a.locale-btn');
    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      // Only touch links pointing to a sibling html page; leave fully-qualified ones alone.
      if (!href || href.indexOf('://') !== -1) return;
      var hashIdx = href.indexOf('#');
      var hash = hashIdx === -1 ? '' : href.slice(hashIdx);
      var base = hashIdx === -1 ? href : href.slice(0, hashIdx);
      // Strip any pre-existing query string on the link itself
      var qIdx = base.indexOf('?');
      if (qIdx !== -1) base = base.slice(0, qIdx);
      a.setAttribute('href', base + search + hash);
    });
  })();

  var __LEGAL_IS_AR = (document.documentElement.lang || '').toLowerCase().startsWith('ar');
  var LEGAL_CONTENT_AR = {
    terms: {
      title: 'الشروط والأحكام',
      body: '<h3>١. عام</h3><p>بدخولك إلى موقع Dentelle Riyadh وإتمام طلب شراء، فإنك تؤكدين أنك قرأت وفهمت ووافقت على هذه الشروط والأحكام. Dentelle Riyadh دار لانجري فاخرة مقرّها مدينة الرياض في المملكة العربية السعودية.</p>' +
            '<h3>٢. الطلبات والدفع</h3><p>تخضع جميع الطلبات للتوفّر والتأكيد. الأسعار معروضة بالريال السعودي وتشمل ضريبة القيمة المضافة. تتم معالجة المدفوعات بأمان عبر شركاء الدفع المعتمدين أو من خلال خدمة الطلب عبر واتساب.</p>' +
            '<h3>٣. التوصيل</h3><p>نوفّر شحنًا مجانيًا داخل المملكة العربية السعودية. مدة التوصيل من ٢ إلى ٥ أيام عمل. الشحن الدولي متاح بحسب الترتيب — يُرجى التواصل عبر واتساب للاستفسارات الدولية.</p>' +
            '<h3>٤. الإرجاع والاستبدال</h3><p>نقبل الإرجاع خلال ٣٠ يومًا من تاريخ الاستلام للقطع التي بحالتها الأصلية، غير الملبوسة وغير المغسولة وبكامل بطاقاتها. لاعتبارات النظافة، لا يمكن إرجاع الملابس الداخلية بعد إخراجها من تغليفها الأصلي. القطع المخصّصة وحسب الطلب غير قابلة للإرجاع.</p>' +
            '<h3>٥. الملكية الفكرية</h3><p>جميع محتويات هذا الموقع — بما فيها الصور والنصوص والتصميم واسم Dentelle Riyadh — ملكية حصرية لـ Dentelle Riyadh. يُحظر نسخها أو إعادة توزيعها دون إذن خطّي.</p>' +
            '<h3>٦. القانون الحاكم</h3><p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية. وتختصّ محاكم مدينة الرياض حصريًا بأي نزاعات.</p>' +
            '<h3>٧. التواصل</h3><p>لأي استفسار حول هذه الشروط، يرجى التواصل عبر <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">واتساب</a>.</p>'
    },
    privacy: {
      title: 'سياسة الخصوصية',
      body: '<h3>١. ما الذي نجمعه</h3><p>عند تفاعلك مع Dentelle Riyadh، قد نجمع اسمك وبريدك الإلكتروني ورقم هاتفك وعنوان التوصيل ومعلومات الدفع. كما نجمع بيانات التصفّح لتحسين تجربتك.</p>' +
            '<h3>٢. كيف نستخدمها</h3><p>تُستخدم بياناتك لمعالجة الطلبات والتواصل بشأن مشترياتك وتخصيص تجربتك وإرسال معلومات عن المجموعات والعروض (بموافقتك). لا نبيع بياناتك الشخصية لأي طرف ثالث.</p>' +
            '<h3>٣. حماية البيانات</h3><p>نمتثل لنظام حماية البيانات الشخصية في المملكة العربية السعودية (PDPL). تُحفظ بياناتك بشكل آمن ولا يطّلع عليها سوى الموظفين المخوّلين، ولا نحتفظ بها إلا للمدة اللازمة للأغراض المذكورة.</p>' +
            '<h3>٤. حقوقك</h3><p>يحقّ لكِ الاطلاع على بياناتك الشخصية أو تصحيحها أو طلب حذفها في أي وقت. لممارسة هذه الحقوق، يُرجى التواصل عبر واتساب أو البريد الإلكتروني.</p>' +
            '<h3>٥. ملفّات تعريف الارتباط</h3><p>نستخدم ملفّات تعريف ارتباط أساسية لتشغيل الحقيبة وقائمة المفضلة. لا نضع أي ملفّات تتبّع من طرف ثالث دون موافقتك.</p>' +
            '<h3>٦. التواصل</h3><p>لاستفسارات الخصوصية: <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">واتساب +٩٦٦ ٥٤٦ ٠٠٢ ٥٧٣</a>.</p>'
    },
    saso: {
      title: 'شهادة ساسو',
      body: '<p>تفخر Dentelle Riyadh بكونها <strong>معتمدة من ساسو</strong> — متوافقةً مع معايير الهيئة السعودية للمواصفات والمقاييس والجودة (SASO)، الجهة المرجعية الرسمية للمواصفات في المملكة العربية السعودية.</p>' +
            '<h3>ماذا يعني اعتماد ساسو</h3><p>تؤكّد شهادتنا أن كل قطعة من Dentelle Riyadh تستوفي معايير الجودة والسلامة الصارمة الخاصة بالمنسوجات والملابس المباعة داخل المملكة. خضعت المنتجات المعتمدة لاختبارات تشمل:</p>' +
            '<ul style="padding-inline-start:1.25rem;margin:.75rem 0;"><li>دقّة تركيب الألياف النسيجية</li><li>ثبات الألوان وسلامة الأصباغ</li><li>السلامة الكيميائية (أصباغ آزو، حدود الفورمالديهايد)</li><li>توافق الملصقات</li></ul>' +
            '<h3>التزامنا</h3><p>تنتقي Dentelle Riyadh أرقى أنواع دانتيل ليفر الفرنسي من كاليه وحرير الساتان من ليون — مواد مختارة لجمالها وجودتها وسلامتها. تُنهى كل قطعة يدويًا في ورشتنا في الرياض، وتخضع للفحص قبل التسليم.</p>' +
            '<p>شهادة ساسو متاحة للاطلاع عند الطلب. يُرجى التواصل عبر <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">واتساب</a>.</p>'
    },
    shipping: {
      title: 'الشحن والتوصيل',
      body: '<h3>داخل المملكة العربية السعودية</h3><p><strong>شحن مجاني</strong> على جميع الطلبات داخل المملكة. مدة التوصيل القياسية <strong>من ٢ إلى ٥ أيام عمل</strong> من تاريخ تأكيد الطلب. التوصيل السريع متاح في الرياض — يُرجى الاستفسار عبر واتساب.</p>' +
            '<h3>تتبّع الطلب</h3><p>بمجرد شحن طلبك، ستصلك معلومات التتبّع عبر واتساب أو البريد الإلكتروني. فريقنا متاحٌ لمساعدتك في أي استفسار يخصّ التوصيل.</p>' +
            '<h3>الطلبات الدولية</h3><p>نشحن دوليًا بحسب الترتيب. تختلف تكاليف الشحن ومدة التوصيل بحسب الوجهة. <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">يُرجى التواصل عبر واتساب</a> للحصول على عرض شحن دولي.</p>' +
            '<h3>التغليف</h3><p>تصلك كل قطعة من Dentelle Riyadh بتغليفنا الفاخر المميّز — مصمَّم لحماية القطعة وجعل تجربة الفتح بمستوى أناقة الثوب نفسه.</p>'
    },
    returns: {
      title: 'الإرجاع والاستبدال',
      body: '<h3>مدة الإرجاع</h3><p>نقبل الإرجاع خلال <strong>٣٠ يومًا</strong> من تاريخ الاستلام. يجب أن تكون القطع بحالتها الأصلية، غير ملبوسة وغير مغسولة وبكامل بطاقاتها الأصلية.</p>' +
            '<h3>سياسة النظافة</h3><p>لاعتبارات النظافة، لا يمكن إرجاع أو استبدال الملابس الداخلية بعد إخراجها من تغليفها الأصلي المختوم. ندعوكِ للاطلاع على دليل المقاسات وطلب استشارة شخصية قبل الشراء.</p>' +
            '<h3>الطلبات المخصّصة</h3><p>القطع المصنوعة حسب الطلب أو المخصّصة تُصنع لكِ تحديدًا، ولا تُقبل إعادتها إلا في حال وجود عيب تصنيع.</p>' +
            '<h3>كيفية الإرجاع</h3><p>لبدء عملية الإرجاع، يُرجى التواصل مع فريقنا عبر <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">واتساب</a> مع تفاصيل طلبك. سيرشدك الفريق خلال الخطوات وينسّق الاستلام من عنوانك داخل المملكة.</p>' +
            '<h3>الاسترداد</h3><p>تُعالَج عمليات الاسترداد المعتمدة خلال ٥ إلى ١٠ أيام عمل وتُعاد إلى وسيلة الدفع الأصلية.</p>'
    }
  };

  var LEGAL_CONTENT = __LEGAL_IS_AR ? LEGAL_CONTENT_AR : {
    terms: {
      title: 'Terms & Conditions',
      body: '<h3>1. General</h3><p>By accessing the Dentelle Riyadh website and placing an order, you confirm that you have read, understood and agree to these Terms & Conditions. Dentelle Riyadh is a luxury lingerie maison based in Riyadh, Kingdom of Saudi Arabia.</p>' +
            '<h3>2. Orders & Payment</h3><p>All orders are subject to availability and confirmation. Prices are displayed in Saudi Riyals (SAR) and include applicable VAT. Payment is processed securely via our approved payment partners or through our WhatsApp ordering service.</p>' +
            '<h3>3. Delivery</h3><p>We offer complimentary delivery within the Kingdom of Saudi Arabia. Delivery times are 2–5 business days. International orders are available by arrangement. Please contact us via WhatsApp for international enquiries.</p>' +
            '<h3>4. Returns & Exchanges</h3><p>We accept returns within 30 days of delivery for items in their original, unworn and unwashed condition with all tags attached. Due to hygiene regulations, intimate apparel cannot be returned once removed from original packaging. Custom and bespoke pieces are non-returnable.</p>' +
            '<h3>5. Intellectual Property</h3><p>All content on this website — including imagery, copy, design and the Dentelle Riyadh name — is the exclusive property of Dentelle Riyadh. Reproduction or redistribution without written consent is strictly prohibited.</p>' +
            '<h3>6. Governing Law</h3><p>These terms are governed by the laws of the Kingdom of Saudi Arabia. Any disputes shall be subject to the exclusive jurisdiction of the courts of Riyadh.</p>' +
            '<h3>7. Contact</h3><p>For any enquiries regarding these terms, please contact us via <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">WhatsApp</a>.</p>'
    },
    privacy: {
      title: 'Privacy Policy',
      body: '<h3>1. What We Collect</h3><p>When you interact with Dentelle Riyadh, we may collect your name, email address, phone number, delivery address and payment information. We also collect browsing data to improve your experience.</p>' +
            '<h3>2. How We Use It</h3><p>Your data is used to process orders, communicate about your purchase, personalise your experience and send you information about collections and offers (with your consent). We do not sell your personal data to third parties.</p>' +
            '<h3>3. Data Protection</h3><p>We comply with the Saudi Personal Data Protection Law (PDPL). Your data is stored securely and only accessible to authorised personnel. We retain your data only as long as necessary for the purposes outlined above.</p>' +
            '<h3>4. Your Rights</h3><p>You have the right to access, correct or request deletion of your personal data at any time. To exercise these rights, please contact us via WhatsApp or email.</p>' +
            '<h3>5. Cookies</h3><p>We use essential cookies to keep your bag and wishlist functional. No third-party tracking cookies are placed without your consent.</p>' +
            '<h3>6. Contact</h3><p>For privacy enquiries: <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">WhatsApp +966 546 002 573</a>.</p>'
    },
    saso: {
      title: 'SASO Certification',
      body: '<p>Dentelle Riyadh is proud to be <strong>SASO certified</strong> — compliant with the standards of the Saudi Standards, Metrology and Quality Organization (SASO), the official standards body of the Kingdom of Saudi Arabia.</p>' +
            '<h3>What SASO Certification Means</h3><p>Our certification confirms that every Dentelle Riyadh piece meets rigorous quality and safety standards for textile and apparel products sold within the Kingdom. Certified products have been tested for:</p>' +
            '<ul style="padding-left:1.25rem;margin:.75rem 0;"><li>Textile fibre composition accuracy</li><li>Colourfastness and dye safety</li><li>Chemical safety (azo dyes, formaldehyde limits)</li><li>Labelling compliance</li></ul>' +
            '<h3>Our Commitment</h3><p>Dentelle Riyadh sources the finest French Leavers lace from Calais and silk satin from Lyon — materials chosen not only for their beauty, but for their quality and safety. Every piece is hand-finished in our Riyadh atelier and inspected before delivery.</p>' +
            '<p>Our SASO certificate is available for review upon request. Please contact us via <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">WhatsApp</a>.</p>'
    },
    shipping: {
      title: 'Shipping & Delivery',
      body: '<h3>Within the Kingdom of Saudi Arabia</h3><p><strong>Complimentary shipping</strong> on all orders within KSA. Standard delivery is <strong>2–5 business days</strong> from the date of confirmation. Express delivery is available in Riyadh — please enquire via WhatsApp.</p>' +
            '<h3>Order Tracking</h3><p>Once your order is dispatched, you will receive a tracking number via WhatsApp or email. Our team is available to assist you with any delivery queries.</p>' +
            '<h3>International Orders</h3><p>We ship internationally by arrangement. Shipping costs and delivery times vary by destination. Please <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">contact us via WhatsApp</a> for an international shipping quote.</p>' +
            '<h3>Packaging</h3><p>Every Dentelle Riyadh order arrives in our signature luxury packaging — designed to protect your piece and make the unboxing experience as refined as the garment itself.</p>'
    },
    returns: {
      title: 'Returns & Exchanges',
      body: '<h3>Return Window</h3><p>We accept returns within <strong>30 days</strong> of delivery. Items must be in their original, unworn and unwashed condition with all original tags attached.</p>' +
            '<h3>Hygiene Policy</h3><p>For hygiene reasons, intimate apparel that has been removed from its original sealed packaging cannot be returned or exchanged. We encourage you to consult our size guide and reach out for a personal consultation before ordering.</p>' +
            '<h3>Bespoke & Custom Orders</h3><p>Made-to-order and bespoke pieces are crafted specifically for you and cannot be returned unless there is a manufacturing defect.</p>' +
            '<h3>How to Return</h3><p>To initiate a return, please contact our team via <a href="https://wa.me/966546002573" target="_blank" rel="noopener" style="text-decoration:underline;">WhatsApp</a> with your order details. Our team will guide you through the process and arrange collection from your address within KSA.</p>' +
            '<h3>Refunds</h3><p>Approved refunds are processed within 5–10 business days to your original payment method.</p>'
    }
  };

  (function initLegalModal() {
    /* Build modal DOM */
    var overlay = document.createElement('div');
    overlay.className = 'legal-modal';
    overlay.id = 'legalModal';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    var __closeLabel = __LEGAL_IS_AR ? 'إغلاق' : 'Close';
    var __panelAttrs = __LEGAL_IS_AR ? ' dir="rtl" lang="ar"' : '';
    overlay.innerHTML =
      '<div class="legal-modal__panel"' + __panelAttrs + '>' +
        '<div class="legal-modal__topbar">' +
          '<span class="legal-modal__title" id="legalModalTitle"></span>' +
          '<button class="legal-modal__close" id="legalModalClose" aria-label="' + __closeLabel + '">&#x2715;</button>' +
        '</div>' +
        '<div class="legal-modal__body" id="legalModalBody"></div>' +
      '</div>';

    document.body.appendChild(overlay);

    function openLegal(key) {
      var data = LEGAL_CONTENT[key];
      if (!data) return;
      document.getElementById('legalModalTitle').textContent = data.title;
      document.getElementById('legalModalBody').innerHTML = data.body;
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    function closeLegal() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    document.addEventListener('click', function(e) {
      var trigger = e.target.closest('[data-legal]');
      if (trigger) { e.preventDefault(); openLegal(trigger.dataset.legal); return; }
      var close = e.target.closest('#legalModalClose');
      if (close) { closeLegal(); return; }
      if (e.target === overlay) closeLegal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeLegal();
    });
  })();

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

    /* Build dots — click handlers wired after animateTo is defined */
    if (dotsWrap && cards.length) {
      cards.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', 'Go to piece ' + (i + 1));
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

    /* Arrow step = 2 cards at a time */
    const arrowStep = () => cardStep() * 2;

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

    /* RTL: scrollLeft is 0 at the rightmost position and goes negative to the left */
    const isRTL = document.documentElement.dir === 'rtl';

    /* Update arrow + dot state */
    const updateState = () => {
      let atStart, atEnd;
      if (isRTL) {
        atStart = track.scrollLeft >= -4;                                              // rightmost = beginning
        atEnd   = track.scrollLeft <= -(track.scrollWidth - track.clientWidth - 4);   // leftmost = end
      } else {
        atStart = track.scrollLeft <= 4;
        atEnd   = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      }
      if (prevBtn) prevBtn.disabled = atStart;
      if (nextBtn) nextBtn.disabled = atEnd;

      const idx  = currentIndex();
      getDots().forEach((dot, i) => dot.classList.toggle('is-active', i === idx));
    };

    /* Native smooth scrollBy — respects scroll-snap, works reliably */
    const scrollByAmount = (amount) => {
      track.scrollBy({ left: amount, behavior: 'smooth' });
    };

    /* Arrow clicks — in RTL left arrow goes left (negative = more items), right goes back */
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); scrollByAmount(-arrowStep()); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); scrollByAmount(arrowStep()); });

    track.addEventListener('scroll', updateState, { passive: true });
    window.addEventListener('resize', updateState, { passive: true });
    updateState(); /* initial state */
    /* Re-check after layout settles (fonts, images) */
    setTimeout(updateState, 150);
    setTimeout(updateState, 800);

    /* Keyboard support */
    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); scrollByAmount(-arrowStep()); }
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollByAmount(arrowStep()); }
    });

    /* Dot clicks — scrollTo specific card */
    getDots().forEach((dot, i) => {
      dot.addEventListener('click', () => {
        const card = cards[i];
        if (!card) return;
        const padLeft = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        track.scrollTo({ left: card.offsetLeft - padLeft, behavior: 'smooth' });
      });
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

  /* ─── Carousel reinit after async product render ─── */
  window.__dentelleCarouselReinit = function () {
    $$('[data-carousel]').forEach((track) => {
      const section  = track.closest('.product-grid');
      const dotsWrap = section?.querySelector('[data-carousel-dots]');
      if (!dotsWrap) return;

      /* Wait one frame so layout is settled before measuring */
      requestAnimationFrame(() => {
        const cards = Array.from(track.querySelectorAll('.product-card'));
        if (!cards.length) return;

        const padLeft   = parseFloat(getComputedStyle(track).paddingLeft) || 0;
        const maxScroll = track.scrollWidth - track.clientWidth;

        /* Build only the scroll targets that actually move the track */
        const scrollTargets = [];
        cards.forEach((card) => {
          const target = Math.min(Math.round(card.offsetLeft - padLeft), Math.round(maxScroll));
          if (!scrollTargets.length || target > scrollTargets[scrollTargets.length - 1]) {
            scrollTargets.push(target);
          }
        });

        /* Clear and rebuild dots — one per unique scroll position */
        dotsWrap.innerHTML = '';
        scrollTargets.forEach((_, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'carousel-dot' + (i === 0 ? ' is-active' : '');
          dot.setAttribute('aria-label', 'Go to piece ' + (i + 1));
          dotsWrap.appendChild(dot);
        });

        const allDots = () => Array.from(dotsWrap.querySelectorAll('.carousel-dot'));

        /* Wire click → scroll to that position */
        allDots().forEach((dot, i) => {
          dot.addEventListener('click', () => {
            track.scrollTo({ left: scrollTargets[i], behavior: 'smooth' });
          });
        });

        /* Sync active dot while scrolling */
        track.addEventListener('scroll', () => {
          const sl = track.scrollLeft;
          let best = 0, bestDist = Infinity;
          scrollTargets.forEach((t, i) => {
            const dist = Math.abs(t - sl);
            if (dist < bestDist) { bestDist = dist; best = i; }
          });
          allDots().forEach((d, i) => d.classList.toggle('is-active', i === best));
        }, { passive: true });
      });
    });
  };

})();
