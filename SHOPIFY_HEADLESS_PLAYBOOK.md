# Headless Shopify Storefront — AI Agent Build Instructions

> **For the AI agent reading this:** This document is your complete instruction set for building a static brand storefront backed by Shopify. Read it end to end before writing any code. Every section is normative. Every gotcha listed in §11 cost the previous build a real round-trip — do not relearn them.

---

## 1. Your contract

**You will build:** a static, multi-page, bilingual (English LTR + Arabic RTL) brand storefront, hosted on Vercel, that uses Shopify only as a backend for products, collections, cart, checkout, and customer signups.

**You will NOT build:**
- A Liquid theme. We are not deploying to Shopify's Online Store.
- A React / Next.js / Vue SPA. The frontend is plain HTML + vanilla JS + plain CSS.
- A custom login or signup form in our HTML. (See §1.2 — Shopify's new customer accounts are passwordless and hosted; classic accounts are deprecated for new stores.)
- A custom checkout. The cart is local; final checkout always happens on Shopify's hosted `/checkouts/*`.

**You will use:**
- Shopify **Storefront API** (GraphQL, public token in client JS) for all reads — products, collections, metafields, cart creation.
- Shopify **Admin API** (REST, secret token in Vercel env vars) for any write — newsletter signups, optionally seeding products.
- A **Vercel serverless function** as the only bridge between the browser and the Admin API. The Admin token never reaches the browser.

If the user asks for something that contradicts the above (e.g. "build a custom checkout", "ship a React app"), pause and explain the trade-off before proceeding.

---

## 2. Drop-in starter prompt (for the user to give you)

The user should paste this when starting a fresh project. It restates the contract in their voice:

```
Build a headless Shopify storefront for {BRAND NAME}.

Stack:
- Static HTML + vanilla JS + plain CSS
- Hosted on Vercel
- Bilingual: English (foo.html, dir=ltr) + Arabic (foo-ar.html, dir=rtl)
- Shopify backend (Storefront API for reads, Admin API via Vercel
  serverless function for writes)
- localStorage cart, redirects to Shopify-hosted checkout

Read SHOPIFY_HEADLESS_PLAYBOOK.md end to end first. Follow it exactly.
Before writing code, walk me through §3 (Shopify pre-flight) — list which
items I need to do, what tokens to give you, and stop until I confirm.

Brand specifics:
- Domain: {brand}.com
- Shopify store: {brand}.myshopify.com
- Aesthetic reference: {url or description}
- Currency: {SAR / USD / etc.}
- Languages: {en, ar}
- Page list: {home, collections, collection, product, cart, search}
```

---

## 3. Pre-flight checklist — STOP HERE until the user completes this

Before you write the first line of code, **walk the user through this list and wait for them to give you the four pieces of information at the bottom**. Do not guess any of them. Do not assume defaults.

### 3.1 Disable the password gate
Direct them to: **Shopify admin → Online Store → Preferences → Password protection** → uncheck "Restrict access to visitors with the password".

> If skipped, your headless cart will dead-end at "Opening soon" because Shopify's password challenge intercepts `*.myshopify.com/checkouts/*`.

### 3.2 Customer accounts decision
Direct them to: **Settings → Customer accounts**. Two options exist:

- **Classic accounts** — supports email + password. We can build a login form that POSTs to `/account/login`.
- **New customer accounts** (default for stores created after ~2023) — passwordless, email-only with a 6-digit code, hosted at `https://shopify.com/{store-id}/account`. **Cannot be replicated in our HTML.**

Ask: "which one is your store on?" If new customer accounts: **do not build a login page**. Either link out to the hosted URL or skip accounts entirely. Do not waste cycles building a form that cannot work.

### 3.3 Custom app for Admin API
Direct them to: **Settings → Apps and sales channels → Develop apps → Create an app**.

Tell them to enable **all of these scopes** (defaults are read-only — they must check each box):

| Scope | Purpose |
|---|---|
| `read_products`, `write_products` | Catalog seeding/sync |
| `read_product_listings` | Storefront visibility |
| `read_customers`, `write_customers` | Newsletter signups |
| `read_content`, `write_content` | Static pages (shipping, returns) |
| `read_translations`, `write_translations` | Bilingual metafields |
| `read_files`, `write_files` | Product image uploads |

Then **Install app** → copy the **Admin API access token** (`shpat_...`).

> Critical: changing scopes later requires clicking **Reinstall app** AND copying a fresh token. The old token keeps the old scopes forever. If the user comes back saying "you said write_customers but it still fails", check that they reinstalled.

### 3.4 Storefront API token (in the same custom app)
Same custom app → **Configuration → Storefront API integration → Configure**.

Required scopes:
- `unauthenticated_read_product_listings`
- `unauthenticated_read_product_inventory`
- `unauthenticated_read_collection_listings`
- `unauthenticated_read_customer_tags`
- `unauthenticated_read_metaobjects`
- `unauthenticated_write_checkouts`

Copy the **Storefront access token**. This token **is** safe in client JS — it's designed to be public.

### 3.5 Define metafields
**Settings → Custom data → Products** — add:
- `custom.title_ar` (Single line text)
- `custom.subtitle` (Single line text, optional EN tagline)
- `custom.description_ar` (Multi-line text)

Then for each one: **Storefront access → grant**. Without this, the GraphQL query returns `null` silently.

Repeat the same three on **Settings → Custom data → Collections**.

### 3.6 Information you must collect from the user before coding

Wait for the user to deliver all four:

1. `myshopify.com` domain — e.g. `{brand}.myshopify.com`
2. **Storefront access token** (public, will be embedded in client JS)
3. **Admin API access token** (secret, will be set as Vercel env var)
4. Customer-accounts decision from §3.2 — "classic", "new (passwordless)", or "no accounts"

If anything is missing, ask once, then stop. Do not invent placeholder values.

---

## 4. Repo layout

Create exactly this structure. Do not improvise filenames — other modules reference them.

```
.
├── api/
│   └── subscribe.js              # Vercel serverless: newsletter → Admin API
├── theme/
│   └── assets/
│       ├── shopify-config.js     # Public Storefront token + domain
│       ├── shopify-cart.js       # cartCreate → checkoutUrl redirect
│       ├── products-live.js      # GraphQL → window.PRODUCTS + event
│       ├── collections-live.js   # GraphQL → window.COLLECTIONS + event
│       ├── newsletter.js         # POST to /api/subscribe
│       ├── cart.js               # localStorage cart drawer
│       ├── theme.js              # Carousels, modals, reveals
│       └── theme.css             # All styles
├── index.html  / index-ar.html
├── collections.html / collections-ar.html
├── collection.html / collection-ar.html       # ?handle= filters by collection
├── product.html / product-ar.html             # ?slug= identifies product
├── search.html / search-ar.html
├── cart.html / cart-ar.html
├── vercel.json                   # cleanUrls + cache headers
└── SHOPIFY_HEADLESS_PLAYBOOK.md  # this file
```

**Naming rule:** every page has `foo.html` (English LTR) and `foo-ar.html` (Arabic RTL). The locale switcher in the header swaps between them.

---

## 5. Vercel env vars

```
SHOPIFY_DOMAIN          {brand}.myshopify.com
SHOPIFY_ADMIN_TOKEN     shpat_...                        (secret)
```

Set with:
```bash
vercel env add SHOPIFY_DOMAIN production
vercel env add SHOPIFY_ADMIN_TOKEN production
vercel --prod --yes      # redeploy so the function picks them up
```

The Storefront token is **not** an env var — it lives in `theme/assets/shopify-config.js` because it must be readable by the browser. That is by design and by Shopify's documentation.

---

## 6. The four JS modules

### 6.1 `theme/assets/shopify-config.js`
```js
window.SHOPIFY = {
  domain: '{BRAND}.myshopify.com',
  storefrontToken: '{STOREFRONT_TOKEN}',
  apiVersion: '2024-10'
};
```

### 6.2 `theme/assets/products-live.js`
- GraphQL: `products(first: 50, sortKey: CREATED_AT)`
- Fetch fields: `id`, `handle`, `title`, `descriptionHtml`, `productType`, `tags`, `vendor`, `createdAt`, `images(first: 10)`, `variants(first: 20) { id title selectedOptions price }`, `collections(first: 10) { edges { node { handle } } }`, metafields `custom.title_ar`, `custom.subtitle`, `custom.description_ar`.
- Cache key: `dentelle:products:vN`, TTL 5 min.
- On every fetch (cache hit AND fresh fetch), call `install(products)` which sets:
  ```js
  window.PRODUCTS = products;
  window.PRODUCTS_BY_SLUG = byHandle(products);
  window.dispatchEvent(new CustomEvent('dentelle:products-updated',
    { detail: { products } }));
  ```
- **Bump `vN`** any time you change the shape of the transform. Old cached data with old shape will break new code.

### 6.3 `theme/assets/collections-live.js`
Same pattern. Exposes `window.COLLECTIONS`, `window.COLLECTIONS_BY_HANDLE`, fires `dentelle:collections-updated`.

Each collection record must include enough info to filter products:
```js
{
  handle, title, title_ar, image, hover_image,
  product_count, min_price, currency
}
```
Cross-reference: each product's `collections` array (an array of handles) is what `collection.html` filters by.

### 6.4 `theme/assets/shopify-cart.js`
```js
window.DentelleCheckout = {
  start: async function () {
    // 1. Read localStorage cart
    // 2. For each line: lookup window.PRODUCTS_BY_SLUG[slug].variants[size]
    //    to resolve variant GIDs (gid://shopify/ProductVariant/...)
    // 3. Storefront API cartCreate mutation with lines
    // 4. window.location.href = result.cart.checkoutUrl
  }
};
```

---

## 7. The page render pattern

Every dynamic page section follows this exact shape. Do not deviate.

```html
<!-- 1. Skeleton placeholder so the user sees something on first paint -->
<div class="product-grid__items product-grid__items--carousel" data-carousel>
  <article class="product-card product-card--skeleton">…</article>
  <article class="product-card product-card--skeleton">…</article>
</div>

<!-- 2. End of body, after all asset scripts -->
<script src="theme/assets/products-live.js?v=2"></script>
<script>
(function () {
  function render() {
    const list = window.PRODUCTS || [];
    if (!list.length) return;
    document.querySelector('[data-carousel]').innerHTML =
      list.map(cardHtml).join('');
  }
  // Synchronous render if cache already populated PRODUCTS
  if (window.PRODUCTS && window.PRODUCTS.length) render();
  // Re-render when fresh API data lands
  window.addEventListener('dentelle:products-updated', render);
})();
</script>
```

Why this shape:
- First paint = skeletons (no flash of empty container)
- localStorage cache hit → render fires before paint, looks instant
- Fresh API response → event fires → re-render with up-to-date data

**Anti-patterns to avoid:**
- `function render() { function render() {…} }` — outer is dead, inner never invoked. Keep it flat.
- Hardcoded product cards alongside the skeleton — they desync the moment you add a product in Shopify.
- Render code that bails because the wrapper element doesn't exist (`if (!track) return;`). Always confirm the wrapper IS in the HTML before shipping.

---

## 8. Collection page filtering

`collection.html` and `collection-ar.html` must read the URL and filter accordingly:

```js
const params  = new URLSearchParams(location.search);
const handle  = (params.get('handle') || '').toLowerCase();
const category = (params.get('category') || 'all').toLowerCase();

let products = window.PRODUCTS || [];
let title    = 'All pieces';

if (handle) {
  products = products.filter(p => (p.collections || []).includes(handle));
  const col = (window.COLLECTIONS_BY_HANDLE || {})[handle];
  if (col) title = col.title;     // or col.title_ar in *-ar.html
} else if (category !== 'all') {
  products = products.filter(p => (p.category || '').toLowerCase() === category);
}
```

Collection cards on `collections.html` link to `collection.html?handle=${c.handle}`. Without this filter wiring, every collection click shows the same products.

---

## 9. Newsletter pattern (and why simpler paths fail)

**HTML:**
```html
<form data-newsletter-form data-lang="en">
  <input type="email" name="email" required>
  <button type="submit">Subscribe</button>
</form>
```

**Client JS** (`newsletter.js`): POSTs JSON `{email}` to `/api/subscribe`, reads JSON response, swaps button label to `Merci ✦` or shows error.

**Server** (`api/subscribe.js`): Vercel serverless function that:
1. Validates the email
2. Calls `https://{domain}/admin/api/2024-10/customers.json` with `X-Shopify-Access-Token: {SHOPIFY_ADMIN_TOKEN}`
3. Sends `{customer: {email, tags: 'newsletter,prospect', email_marketing_consent: {state: 'subscribed', opt_in_level: 'single_opt_in', consent_updated_at: ISO}}}`
4. On "email already taken": `GET /admin/api/2024-10/customers/search.json?query=email:...`, then `PUT` to update consent on the existing customer
5. Returns `{ok: true}` or `{error, detail}`

**Why other paths don't work — do not attempt them:**

| Path | Result | Reason |
|---|---|---|
| Browser POSTs to `/contact?form_type=customer` | HTTP 403 + Cloudflare challenge | Shopify uses Cloudflare to block any non-theme POST |
| Storefront API `customerCreate` mutation | Validation error | Requires `password` field; we don't collect one for newsletter |
| Browser calls Admin API directly | Token leak | Admin tokens grant write access — must stay server-side |
| `mode: 'no-cors'` on `/contact` | Always shows success, never delivers | Browser hides the 403; you have no way to know it failed |

The serverless relay is the **only** correct architecture. Don't relitigate this.

---

## 10. Cache busting (the silent killer)

Every static asset reference in HTML carries `?v=N`. Every `localStorage` key has `:vN` baked in. **Bump the number** when:
- The shape of cached data changes (any new field in the GraphQL transform)
- A JS module's behavior changes
- CSS changes

If you skip bumping, returning users see old code/data forever — or worse, new code reads old-shape cache → JS error → page half-renders.

Bulk-bump utility:
```bash
python -c "
import glob
for f in glob.glob('*.html'):
    with open(f,'rb') as fh: d = fh.read()
    with open(f,'wb') as fh: fh.write(d.replace(b'theme.css?v=24', b'theme.css?v=25'))
"
```

---

## 11. Gotcha table — read this when something breaks

| Symptom | Root cause | Fix |
|---|---|---|
| Skeletons never replaced; carousel stays empty | Render JS bails because `[data-carousel]` doesn't exist in the markup | Wrap skeletons in `<div data-carousel>` |
| New collection in admin doesn't appear on `/collections` | `collections-live.js` not included on that page | Add the `<script src=…>` |
| Click new collection → wrong/all products | Page only reads `?category=`, not `?handle=` | Read both, prefer `?handle=` and filter by `p.collections.includes(handle)` |
| Filter nav left-aligned under centered title | Missing `justify-content: center` on the flex container | Add it |
| Newsletter test never appears in Customers | `/contact` POST blocked by Cloudflare bot challenge (403) | Use the serverless function + Admin API |
| Function returns `requires merchant approval for write_customers` | Custom app's scope wasn't set at install time | Add scope, **Reinstall app**, copy fresh token, update env var, redeploy |
| Cart redirects to "Opening soon" | Store password protection still on | Disable in Online Store → Preferences |
| Login form posts but nothing happens | Store is on new (passwordless) accounts | Don't build a form — link to `https://shopify.com/{store-id}/account` |
| Old products still show after admin edit | localStorage cache hasn't expired (5 min TTL) | Bump cache key, or wait, or instruct user to clear |
| Cross-origin fetch returns "opaque" with no error | `mode: 'no-cors'` was used | Switch to a same-origin `/api/*` proxy |
| `customer/.../api/subscribe` returns Laravel error | DNS still points at the previous host (e.g. Salla) | Change A/CNAME records at registrar to Vercel's |
| Nested `function render() { function render() {…} }` — page never renders | Inner function is never called | Flatten to one render function |

---

## 12. Deploy + verification loop

```bash
# Deploy
git add -A && git commit -m "..." && git push
vercel --prod --yes

# Tail serverless logs
vercel logs --follow

# Verify subscribe endpoint BEFORE testing the UI
curl -X POST -H "Content-Type: application/json" \
  -d '{"email":"verify+1@example.com"}' \
  https://{project}.vercel.app/api/subscribe
# Must return: {"ok":true}

# Then check Shopify admin → Customers → search the email
```

Always curl the endpoint first. If it returns an error, you'll see the exact Shopify rejection message. If you only test through the form, you'll lose hours debugging UI when the problem is upstream.

---

## 13. Custom domain

To point an apex domain (e.g. `brand.com`) to Vercel:
1. **Vercel project → Settings → Domains → Add** the domain
2. Vercel shows DNS records (typically `A 76.76.21.21` for apex + `CNAME cname.vercel-dns.com` for `www`)
3. At the registrar, replace any existing A/CNAME records pointing elsewhere
4. Wait 5–60 min for propagation. Vercel auto-issues SSL.

Verify with `dig brand.com` or `nslookup`. If `brand.com/api/subscribe` returns a non-Vercel error, DNS hasn't switched.

---

## 14. RTL/LTR rules

- `<html dir="rtl" lang="ar">` on every `*-ar.html`
- Flex containers using `flex-start` / left-aligned origin need `[dir="rtl"]` overrides
- Animations with `transform-origin: left` must flip to `right` under RTL
- Directional icons (next →) need `transform: scaleX(-1)` under RTL
- Locale switcher in the header points to the same page in the other language: `index.html` ↔ `index-ar.html`
- Arabic typography: `Noto Naskh Arabic` for body, `IBM Plex Sans Arabic` for UI. Latin pairing: `Bodoni Moda` for display, `Cormorant Garamond` for editorial italics, `Jost` for UI.

---

## 15. Project quick-start (target: 15 minutes once §3 is complete)

1. `vercel init` (or fork an existing project of this template)
2. Walk the user through **§3 pre-flight** — collect the four artifacts at §3.6
3. Drop the four JS modules from §6 with the user's domain + Storefront token
4. Build first page (`index.html`) using the **§7 render pattern**
5. Set Vercel env vars (§5), redeploy
6. **Curl the subscribe endpoint** (§12) — must return `{ok:true}` before touching the form UI
7. Iterate page by page

If something doesn't work, **read §11 first**. Almost every bug is in that table.

---

## 16. When you, the agent, get stuck

- If a Storefront API field returns `null` → check that the metafield has Storefront access granted (§3.5)
- If an Admin API call returns "requires merchant approval" → user needs to add the scope and reinstall the app (§3.3, §11)
- If the user reports a UI bug → check §11 before reading code
- If the user wants a new auth flow / SSR / a framework migration → push back per §1 ("you will not build")
- If you don't have one of the four §3.6 artifacts → stop and ask. Never invent placeholders.
