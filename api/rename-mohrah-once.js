/* TEMPORARY one-shot endpoint — debug + rename. Will be deleted. */
export default async function handler(req, res) {
  if ((req.query.secret || '') !== 'dentelle-rename-2026') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const domain = process.env.SHOPIFY_DOMAIN || 'dentelle-riyadh.myshopify.com';
  const token  = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) return res.status(500).json({ error: 'no token' });
  const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' };
  const API = `https://${domain}/admin/api/2024-10`;

  // Try GraphQL (more permissive on read scopes), fall back to REST
  try {
    const g = await fetch(`${API}/graphql.json`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ query: `{ products(first: 50) { edges { node { id title descriptionHtml } } } }` })
    });
    const gd = await g.json();
    const edges = gd?.data?.products?.edges || [];
    if (!edges.length) return res.status(200).json({ ok: false, gql: gd });

    const log = [];
    for (const { node } of edges) {
      const oldT = node.title || '';
      const newT = oldT.replace(/Mohrah/g, 'Mohra').replace(/mohrah/g, 'mohra').replace(/MOHRAH/g, 'MOHRA');
      const oldB = node.descriptionHtml || '';
      const newB = oldB.replace(/Mohrah/g, 'Mohra').replace(/mohrah/g, 'mohra').replace(/MOHRAH/g, 'MOHRA');
      if (oldT === newT && oldB === newB) { log.push(`skip: ${oldT}`); continue; }

      const m = await fetch(`${API}/graphql.json`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          query: `mutation($input: ProductInput!) {
            productUpdate(input: $input) { product { id title } userErrors { field message } }
          }`,
          variables: { input: { id: node.id, title: newT, descriptionHtml: newB } }
        })
      });
      const md = await m.json();
      const errs = md?.data?.productUpdate?.userErrors || [];
      if (errs.length) log.push(`FAILED ${oldT}: ${JSON.stringify(errs)}`);
      else log.push(`renamed: ${oldT} -> ${newT}`);
    }
    return res.status(200).json({ ok: true, log });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
