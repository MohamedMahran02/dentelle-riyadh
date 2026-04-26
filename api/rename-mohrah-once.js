/* TEMPORARY one-shot endpoint — rename "Mohrah" to "Mohra" across all
   products. Will be deleted from the repo immediately after running. */
export default async function handler(req, res) {
  if ((req.query.secret || '') !== 'dentelle-rename-2026') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const domain = process.env.SHOPIFY_DOMAIN || 'dentelle-riyadh.myshopify.com';
  const token  = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });
  const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' };
  const API = `https://${domain}/admin/api/2024-10`;

  const log = [];
  try {
    const list = await fetch(`${API}/products.json?limit=250`, { headers: H });
    const data = await list.json();
    const products = data.products || [];
    log.push(`found ${products.length} products`);

    for (const p of products) {
      const oldTitle = p.title || '';
      const newTitle = oldTitle.replace(/Mohrah/g, 'Mohra').replace(/mohrah/g, 'mohra').replace(/MOHRAH/g, 'MOHRA');
      const oldBody = p.body_html || '';
      const newBody = oldBody.replace(/Mohrah/g, 'Mohra').replace(/mohrah/g, 'mohra').replace(/MOHRAH/g, 'MOHRA');
      if (newTitle === oldTitle && newBody === oldBody) {
        log.push(`skip: ${oldTitle}`);
        continue;
      }
      const r = await fetch(`${API}/products/${p.id}.json`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ product: { id: p.id, title: newTitle, body_html: newBody } })
      });
      if (r.ok) log.push(`renamed: ${oldTitle} -> ${newTitle}`);
      else log.push(`FAILED ${oldTitle}: ${r.status} ${(await r.text()).slice(0,200)}`);
    }
    return res.status(200).json({ ok: true, log });
  } catch (e) {
    return res.status(500).json({ error: String(e), log });
  }
}
