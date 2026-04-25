/* =========================================================
   Vercel serverless function — newsletter subscribe
   POSTs to Shopify Admin API to create a marketing customer.
   Required env var (set in Vercel project settings):
     SHOPIFY_ADMIN_TOKEN  — Admin API access token (shpat_...)
     SHOPIFY_DOMAIN       — e.g. dentelle-riyadh.myshopify.com
   ========================================================= */
export default async function handler(req, res) {
  // CORS — allow POSTs from our Vercel-hosted frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email } = req.body || {};
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const domain = process.env.SHOPIFY_DOMAIN || 'dentelle-riyadh.myshopify.com';
    const token  = process.env.SHOPIFY_ADMIN_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Server not configured' });
    }

    // Shopify Admin REST — Customer create with marketing consent
    const url = `https://${domain}/admin/api/2024-10/customers.json`;
    const payload = {
      customer: {
        email,
        tags: 'newsletter,prospect',
        email_marketing_consent: {
          state: 'subscribed',
          opt_in_level: 'single_opt_in',
          consent_updated_at: new Date().toISOString()
        }
      }
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));

    if (r.ok) {
      return res.status(200).json({ ok: true });
    }

    // Customer already exists → update their marketing consent instead
    const errs = data && data.errors;
    const dup = errs && (
      (Array.isArray(errs.email) && errs.email.some(e => /taken/i.test(e))) ||
      (typeof errs === 'string' && /taken/i.test(errs))
    );

    if (dup) {
      // Look up existing customer, then PUT consent
      const lookup = await fetch(
        `https://${domain}/admin/api/2024-10/customers/search.json?query=${encodeURIComponent('email:' + email)}`,
        { headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' } }
      );
      const lookupData = await lookup.json().catch(() => ({}));
      const existing = lookupData.customers && lookupData.customers[0];
      if (existing && existing.id) {
        await fetch(`https://${domain}/admin/api/2024-10/customers/${existing.id}.json`, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({
            customer: {
              id: existing.id,
              tags: (existing.tags ? existing.tags + ', ' : '') + 'newsletter,prospect',
              email_marketing_consent: {
                state: 'subscribed',
                opt_in_level: 'single_opt_in',
                consent_updated_at: new Date().toISOString()
              }
            }
          })
        });
        return res.status(200).json({ ok: true, updated: true });
      }
    }

    return res.status(502).json({ error: 'Shopify rejected the request', detail: data });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message || err) });
  }
}
