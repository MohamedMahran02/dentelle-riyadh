# Headless Shopify Storefront — Build Playbook

> A repeatable recipe for building a static (Vercel-hosted) brand site that uses Shopify only for products, cart, checkout, customers, and newsletter. Captures every pitfall we hit on Dentelle Riyadh so you never hit them again.

---

## 0. The drop-in AI prompt

Paste this verbatim into a fresh AI session when starting a new project. It encodes the non-obvious decisions.

```
Build a headless e-commerce storefront with this stack:
- Frontend: static HTML + vanilla JS + plain CSS, hosted on Vercel
- Backend: Shopify (products, collections, cart, checkout, customers)
- Bilingual: English (LTR) + Arabic (RTL), one .html file per locale per page
- Cart: localStorage on client; checkout via Storefront API cartCreate → checkoutUrl
- Live data: Storefront API GraphQL fetched on every page load, cached in
  localStorage with a 5-min TTL, dispatched as window CustomEvents so any
  page section can re-render when fresh data lands
- Newsletter: Vercel serverless function (/api/subscribe) calls Shopify
  Admin REST customers.json — never POST to /contact (Cloudflare blocks it)
- Auth: do NOT build login/signup in our HTML. New customer accounts are
  passwordless and live on shopify.com/{store-id}/account. Either link to
  the hosted page or skip accounts entirely.

Hard rules:
- Never put the Admin API token in client JS. It lives ONLY in Vercel env vars.
- The Storefront token IS public — embed it in shopify-config.js. That's by design.
- Every <script src="..."> and <link href="...css"> must include ?v=N.
  Bump N whenever you change the file so users don't get stale caches.
- Every dynamic section starts as a skeleton in the HTML. JS replaces it
  on render. Never ship a hardcoded product/collection card that is also
  rendered live — they will desync.
- Use mode:"cors" for /api/* calls (same origin). Never use mode:"no-cors"
  for cross-origin POSTs because you can't read errors and silently fail.

When data needs to come from Shopify, prefer the Storefront API (public,
in-browser). When data needs WRITE access (newsletter, customers, orders),
go through a Vercel serverless function that uses the Admin token.
```

---

## 1. Shopify pre-flight checklist

Do these IN ORDER before writing a single line of frontend code. Each one bit us at least once on Dentelle.

### 1.1 Disable password protection
**Settings → Online Store → Preferences → Password protection** → uncheck "Restrict access".
> Why it matters: while this is on, **all** of `*.myshopify.com` is gated — including `/checkouts/*`. Your headless cart will dead-end at "Opening soon".

### 1.2 Confirm you're on Classic accounts (or accept passwordless)
**Settings → Customer accounts**. Two systems exist:
- **Classic accounts** → email + password. Forms can POST to `/account/login`.
- **New customer accounts** (default for new stores) → email-only + 6-digit code, hosted at `shopify.com/{store-id}/account`. **Cannot be replicated in your own HTML form.**

Pick one and commit. If on new accounts, **don't build login pages** — link to the hosted URL or omit accounts.

### 1.3 Create a custom app for the Admin API
**Settings → Apps and sales channels → Develop apps → Create an app**.

Required scopes (check each one explicitly — defaults are read-only):
| Scope | Why |
|---|---|
| `read_products`, `write_products` | Sync product catalog from scripts |
| `read_product_listings` | Storefront product visibility |
| `read_customers`, `write_customers` | Newsletter signups via /api/subscribe |
| `read_content`, `write_content` | Pages (about, shipping, returns) |
| `read_translations`, `write_translations` | Bilingual metafields |
| `read_files`, `write_files` | Product image uploads |

After saving scopes → **Install app** → copy the **Admin API access token** (`shpat_...`). This is **secret** — only goes in Vercel env vars.

> Gotcha: changing scopes later requires clicking **Reinstall app** AND copying a new token. The old token keeps the old scopes forever.

### 1.4 Create a Storefront API token
Same custom app → **Configuration → Storefront API integration → Configure**.

Required scopes:
- `unauthenticated_read_product_listings`
- `unauthenticated_read_product_inventory`
- `unauthenticated_read_collection_listings`
- `unauthenticated_read_customer_tags`
- `unauthenticated_read_metaobjects`
- `unauthenticated_write_checkouts`

Copy the Storefront token. This **is** safe to put in client JS.

### 1.5 Define metafields
**Settings → Custom data → Products** (and same for Collections):
- `custom.title_ar` — Single line text
- `custom.subtitle` — Single line text (optional EN tagline per product)
- `custom.description_ar` — Multi-line text

Pin them so they appear on every product/collection edit screen.

### 1.6 Enable Storefront API access in metafield definitions
For every metafield you want client-side, click it → **Storefront access → grant**. Otherwise the GraphQL query returns `null` silently.

---

## 2. Repo layout

```
.
├── api/                        # Vercel serverless functions
│   └── subscribe.js            # Newsletter → Shopify Admin API
├── theme/
│   └── assets/
│       ├── shopify-config.js   # Public Storefront token + domain
│       ├── shopify-cart.js     # cartCreate → checkoutUrl redirect
│       ├── products-live.js    # GraphQL fetch → window.PRODUCTS
│       ├── collections-live.js # GraphQL fetch → window.COLLECTIONS
│       ├── newsletter.js       # POSTs to /api/subscribe
│       ├── cart.js             # localStorage cart drawer
│       ├── theme.js            # Carousels, modals, reveals
│       └── theme.css           # All styles, ?v= bumped on every change
├── index.html / index-ar.html
├── collections.html / collections-ar.html
├── collection.html / collection-ar.html       # ?handle= filters by collection
├── product.html / product-ar.html             # ?slug= identifies product
├── search.html / search-ar.html
├── cart.html / cart-ar.html
├── vercel.json                 # cleanUrls, cache headers
└── SHOPIFY_HEADLESS_PLAYBOOK.md
```

**Naming convention:** every page has `foo.html` (English, LTR) and `foo-ar.html` (Arabic, RTL). Locale switcher in the header swaps between them.

---

## 3. Required env vars (Vercel)

```
SHOPIFY_DOMAIN          dentelle-riyadh.myshopify.com
SHOPIFY_ADMIN_TOKEN     shpat_...                        (secret)
```

Set with:
```bash
vercel env add SHOPIFY_DOMAIN production
vercel env add SHOPIFY_ADMIN_TOKEN production
vercel --prod --yes      # redeploy so functions pick them up
```

The Storefront token is **not** an env var — it's in `theme/assets/shopify-config.js` because it must be readable by the browser.

---

## 4. The four core JS modules

### 4.1 `shopify-config.js` (public)
```js
window.SHOPIFY = {
  domain: 'YOUR-STORE.myshopify.com',
  storefrontToken: 'PUBLIC_STOREFRONT_TOKEN',
  apiVersion: '2024-10'
};
```

### 4.2 `products-live.js`
- GraphQL `products(first: 50, sortKey: CREATED_AT)`
- Fetches `id`, `handle`, `title`, `description`, `productType`, `tags`,
  `collections(first: 10) { edges { node { handle } } }`,
  `images(first: 10)`, `variants(first: 20)`,
  metafields: `custom.title_ar`, `custom.subtitle`, `custom.description_ar`
- Caches in `localStorage['dentelle:products:vN']` for 5 min
- On fetch: `window.PRODUCTS = [...]`, `window.PRODUCTS_BY_SLUG = {...}`,
  fires `dispatchEvent(new CustomEvent('dentelle:products-updated'))`
- **Bump cache key (`vN`)** whenever you change the shape of the transform — old cached data with old shape will break new code.

### 4.3 `collections-live.js`
Same pattern as products-live, exposes `window.COLLECTIONS` and `window.COLLECTIONS_BY_HANDLE`, fires `dentelle:collections-updated`.

### 4.4 `shopify-cart.js`
```js
window.DentelleCheckout = {
  start: async function () {
    // Read localStorage cart → build line items via PRODUCTS_BY_SLUG[slug].variants[size]
    // Storefront API cartCreate mutation
    // window.location = result.cart.checkoutUrl
  }
};
```

---

## 5. The page render pattern

Every page that displays products or collections follows this exact pattern:

```html
<!-- 1. Skeleton placeholder so something shows on first paint -->
<div class="product-grid__items product-grid__items--carousel" data-carousel>
  <article class="product-card product-card--skeleton">…</article>
  <article class="product-card product-card--skeleton">…</article>
</div>

<!-- 2. At end of body, after all scripts -->
<script src="theme/assets/products-live.js?v=2"></script>
<script>
(function () {
  function render() {
    const list = window.PRODUCTS || [];
    if (!list.length) return;
    document.querySelector('[data-carousel]').innerHTML =
      list.map(cardHtml).join('');
  }
  if (window.PRODUCTS && window.PRODUCTS.length) render();
  window.addEventListener('dentelle:products-updated', render);
})();
</script>
```

Why this works:
- First paint = skeletons (no flash of empty)
- If localStorage cache is fresh, render fires synchronously before paint
- Fresh API response fires the event → re-render with up-to-date data

**Anti-pattern** (we tripped on this): writing a render function inside another render function — only the outer one gets invoked, inner is dead code. Keep it flat.

---

## 6. The newsletter / Admin API pattern

**Form** (in HTML, no inline submit handler):
```html
<form data-newsletter-form data-lang="en">
  <input type="email" name="email" required>
  <button type="submit">Subscribe</button>
</form>
```

**Client JS** (`newsletter.js`):
- Posts JSON `{email}` to `/api/subscribe` (same origin, normal CORS)
- Reads JSON response, swaps button label to ✓ or ✗ accordingly

**Serverless function** (`api/subscribe.js`):
- Validates email
- Calls `https://{domain}/admin/api/2024-10/customers.json` with the Admin token
- Sets `email_marketing_consent = subscribed`
- On "email already taken" error: looks up customer ID and PUTs the consent update
- Returns `{ok: true}` or `{error, detail}`

**Why not the obvious paths?**
| Path | Why it fails |
|---|---|
| POST `/contact` from browser | Cloudflare bot-challenges → 403 |
| Storefront API `customerCreate` | Requires a password (we don't collect one) |
| Direct Admin API from browser | Token would be exposed to all visitors |

The serverless relay is the only correct architecture.

---

## 7. Cache busting (the silent killer)

Every static asset gets `?v=N` in the HTML reference.
Every `localStorage` cache key has `:vN` baked in.
**Bump the number** when:
- You change the shape of cached data (any new field in the GraphQL response)
- You change a JS module's behavior
- You change CSS

Without bumping, returning users see old code/data forever — or worse, new code reading old-shape cache → JS errors → page half-renders.

```bash
# Bulk-bump CSS version in all HTML files
python -c "
import glob
for f in glob.glob('*.html'):
    with open(f,'rb') as fh: d = fh.read()
    with open(f,'wb') as fh: fh.write(d.replace(b'theme.css?v=24', b'theme.css?v=25'))
"
```

---

## 8. RTL/LTR rules

- `<html dir="rtl" lang="ar">` on every `*-ar.html`
- All flex containers using `flex-start` need to flip — use `inline-start` or `[dir="rtl"]` overrides in CSS
- Animation `transform-origin: left` becomes `right` under RTL — handle via `[dir="rtl"]` selector
- Icons that imply direction (next arrow → →) need `transform: scaleX(-1)` under RTL or swapped SVG paths
- Locale switcher in header points to the same page in the other language: `index.html` ↔ `index-ar.html`

---

## 9. Common gotchas (the tax we paid)

| Symptom | Root cause | Fix |
|---|---|---|
| Skeletons never replaced on homepage | Render JS bails because `[data-carousel]` doesn't exist | Wrap skeletons in `<div data-carousel>` |
| New collection added in admin doesn't appear | `collections-live.js` not loaded on the page | Add `<script src="...collections-live.js">` |
| Click new collection → shows wrong products | Page only reads `?category=`, not `?handle=` | Read both, prefer `?handle=` and filter by `p.collections.includes(handle)` |
| Filter nav is left-aligned, header is centered | Missing `justify-content: center` on flex container | Add it |
| Newsletter test email never appears in admin | `/contact` POST blocked by Cloudflare bot challenge | Use serverless function + Admin API |
| Serverless function returns `requires merchant approval for write_customers` | App scope wasn't set at create time | Add `write_customers`, **Reinstall app**, swap token |
| Cart redirects to "Opening soon" page | Store password protection still on | Disable in Online Store → Preferences |
| Login form posts but nothing happens | Store is on new (passwordless) accounts | Don't build a form — link to hosted page |
| Old products still show after edit in Shopify | localStorage cache hasn't expired (5 min) | Bump cache key, or wait, or clear localStorage |
| Cross-origin fetch returns "opaque" with no error | `mode: 'no-cors'` was used | Switch to same-origin via `/api/*` proxy |

---

## 10. Deploy / dev loop

```bash
# Deploy to production
git add -A
git commit -m "..."
git push
vercel --prod --yes

# Tail function logs
vercel logs --follow

# Test endpoints quickly
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"test+1@example.com"}' \
  https://YOUR-PROJECT.vercel.app/api/subscribe
```

---

## 11. Custom domain

To point your apex domain to Vercel:
1. **Vercel project → Settings → Domains → Add** `yourdomain.com`
2. Vercel shows DNS records — usually `A 76.76.21.21` for apex + `CNAME cname.vercel-dns.com` for `www`
3. At your registrar, replace any existing A/CNAME records pointing elsewhere (Salla, old Shopify, etc.) with Vercel's
4. Wait 5–60 min for DNS propagation. Vercel auto-issues SSL.

> Pitfall: if `yourdomain.com/api/subscribe` returns a Laravel/PHP error, your DNS is still pointing at the old host (Salla in our case). Check `dig yourdomain.com` or `nslookup`.

---

## 12. New project quick-start (~15 minutes)

1. `vercel init` (or fork an existing project)
2. Run through **§1 Shopify pre-flight** — every checkbox
3. Drop in the four JS modules from §4 with your domain + token
4. Build first page (`index.html`) using the **§5 render pattern**
5. Set Vercel env vars (§3)
6. Deploy: `vercel --prod --yes`
7. Test the subscribe endpoint with curl (§10) — must return `{ok:true}` before touching the form UI
8. Iterate page by page

If something doesn't work, **check §9 first**. Almost every "weird" Shopify integration bug is in that table.
