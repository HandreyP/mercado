export async function discoverProductCandidates(
  market,
  httpClient,
  { limit = Number.POSITIVE_INFINITY } = {},
) {
  const indexXml = await httpClient.getText(market.sitemapIndexUrl);
  const productSitemaps = market
    .parseSitemapIndex(indexXml)
    .filter(market.isProductSitemap);

  if (productSitemaps.length === 0) {
    throw new Error(`O índice de ${market.name} não contém sitemaps de produto`);
  }

  const candidates = [];
  const seenUrls = new Set();

  for (const sitemap of productSitemaps) {
    const xml = await httpClient.getText(sitemap.url);
    for (const product of market.parseProductSitemap(xml)) {
      if (seenUrls.has(product.url)) continue;
      seenUrls.add(product.url);
      candidates.push(product);
      if (candidates.length >= limit) return candidates;
    }
  }

  return candidates;
}
