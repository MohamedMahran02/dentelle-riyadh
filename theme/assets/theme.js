/* =========================================================
   DENTELLE RIYADH — Theme JS
   Scroll reveal · parallax · sticky header · mobile menu
   ========================================================= */
(function () {
  'use strict';

  /* ----- Sticky header state ----- */
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 8) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ----- Scroll reveal (IntersectionObserver) ----- */
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealTargets.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('is-in'));
  }

  /* ----- Subtle parallax (respects reduced motion) ----- */
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const parallaxEls = document.querySelectorAll('[data-parallax]');
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
    window.addEventListener('scroll', () => {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ----- Mobile menu ----- */
  const toggle = document.querySelector('[data-menu-toggle]');
  const panel = document.querySelector('[data-menu-panel]');
  if (toggle && panel) {
    const open = () => {
      toggle.setAttribute('aria-expanded', 'true');
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      toggle.setAttribute('aria-expanded', 'false');
      panel.setAttribute('aria-hidden', 'true');
      panel.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    toggle.addEventListener('click', () => {
      panel.classList.contains('is-open') ? close() : open();
    });
    panel.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  }

  /* ----- Locale switcher (client-only demo) ----- */
  document.querySelectorAll('.locale-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.locale-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const ar = btn.textContent.trim().toUpperCase() === 'AR';
      document.documentElement.dir = ar ? 'rtl' : 'ltr';
      document.documentElement.lang = ar ? 'ar' : 'en';
    });
  });
})();
