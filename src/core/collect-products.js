import { discoverProductCandidates } from './discover-products.js';
import { selectIncrementalCandidates } from './incremental-selection.js';
import { validateProduct } from '../services/validation-service.js';

export async function collectProducts(
  market,
  httpClient,
  {
    forceAll = false,
    limit = 3,
    maximumAttempts = Math.max(limit * 5, limit),
    retryFailed = false,
    sample = false,
    state = null,
  } = {},
) {
  const startedAt = new Date().toISOString();
  const discoveredCandidates = await discoverProductCandidates(market, httpClient);
  const selection = selectIncrementalCandidates(discoveredCandidates, state, {
    forceAll,
    retryFailed,
    sample,
  });
  const candidates = selection.candidates.slice(0, maximumAttempts);
  const products = [];
  const rejected = [];

  for (const candidate of candidates) {
    if (products.length >= limit) break;

    try {
      const attemptedAt = new Date().toISOString();
      const html = await httpClient.getText(candidate.url);
      const product = market.parseProductPage(html, {
        url: candidate.url,
        collectedAt: attemptedAt,
        sitemapEntry: candidate,
      });
      const validation = validateProduct(product);

      if (validation.valid) {
        products.push({ ...product, warnings: validation.warnings });
      } else {
        rejected.push({
          externalId: candidate.externalId,
          url: candidate.url,
          lastModified: candidate.lastModified,
          attemptedAt,
          status: 'rejected',
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }
    } catch (error) {
      rejected.push({
        externalId: candidate.externalId,
        url: candidate.url,
        lastModified: candidate.lastModified,
        attemptedAt: new Date().toISOString(),
        status: 'error',
        errors: [error.message],
        warnings: [],
      });
    }
  }

  return {
    schemaVersion: 1,
    market: { id: market.id, name: market.name },
    source: {
      type: 'product-pages',
      sitemapIndexUrl: market.sitemapIndexUrl,
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    stats: {
      ...selection.stats,
      requested: limit,
      candidatesInspected: products.length + rejected.length,
      collected: products.length,
      rejected: rejected.length,
    },
    quality: {
      productsWithWarnings: products.filter((product) => product.warnings.length > 0)
        .length,
      productsWithNormalizedPackage: products.filter(
        (product) =>
          product.package?.normalizedQuantity && product.package?.normalizedUnit,
      ).length,
      productsWithUnitPrice: products.filter(
        (product) => product.offer.pricePerBaseUnitCents,
      ).length,
      promotions: products.filter((product) => product.offer.promotion).length,
      distinctTopLevelCategories: new Set(
        products.map((product) => product.categories[0]).filter(Boolean),
      ).size,
    },
    products,
    rejected,
  };
}
