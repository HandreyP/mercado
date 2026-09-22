import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

import {
  parseMoneyToCents,
  parseUnitMeasure,
  resolvePartialPortugueseDate,
} from '../services/normalization-service.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: true,
  trimValues: true,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  return value?.replace(/\s+/g, ' ').trim() || null;
}

function sitemapExternalId(url) {
  return url?.match(/-(\d+)\.html(?:$|[?#])/)?.[1] ?? null;
}

function findTypedNode(value, wantedType) {
  if (!value || typeof value !== 'object') return null;
  if (asArray(value['@type']).includes(wantedType)) return value;

  for (const child of asArray(value['@graph'])) {
    const found = findTypedNode(child, wantedType);
    if (found) return found;
  }
  return null;
}

function readJsonLdProduct($) {
  let product = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    if (product) return;
    try {
      const document = JSON.parse($(element).text());
      for (const candidate of asArray(document)) {
        product = findTypedNode(candidate, 'Product');
        if (product) break;
      }
    } catch {
      // Um bloco JSON-LD inválido não deve impedir a leitura dos restantes.
    }
  });
  return product ?? {};
}

function readGtmProduct($) {
  const raw = $('.product-detail.product-wrapper').first().attr('data-gtm-info');
  if (!raw) return {};
  try {
    return JSON.parse(raw).items?.[0] ?? {};
  } catch {
    return {};
  }
}

function absoluteUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function productExternalId(jsonLd, $, url) {
  return String(
    jsonLd.sku ??
      jsonLd.mpn ??
      $('.product-detail.product-wrapper').attr('data-pid') ??
      sitemapExternalId(url) ??
      '',
  );
}

export function parseSitemapIndex(xml) {
  const document = xmlParser.parse(xml);
  return asArray(document.sitemapindex?.sitemap)
    .map((sitemap) => ({
      url: sitemap.loc,
      lastModified: sitemap.lastmod ?? null,
    }))
    .filter((sitemap) => sitemap.url);
}

export function isProductSitemap(sitemap) {
  return /sitemap_\d+-product\.xml(?:$|[?#])/.test(sitemap.url);
}

export function parseProductSitemap(xml) {
  const document = xmlParser.parse(xml);
  return asArray(document.urlset?.url)
    .map((entry) => ({
      externalId: sitemapExternalId(entry.loc),
      url: entry.loc,
      lastModified: entry.lastmod ?? null,
      images: asArray(entry['image:image'])
        .map((image) => ({
          url: image['image:loc'],
          title: image['image:title'] ?? null,
          caption: image['image:caption'] ?? null,
        }))
        .filter((image) => image.url),
    }))
    .filter((entry) => entry.url && entry.externalId);
}

export function parseProductPage(
  html,
  { url, collectedAt = new Date().toISOString(), sitemapEntry = null },
) {
  const $ = cheerio.load(html);
  const jsonLd = readJsonLdProduct($);
  const gtm = readGtmProduct($);
  const unitMeasure = parseUnitMeasure(cleanText($('.product-unit-measure').first().text()));
  const currentPrice = parseMoneyToCents(
    $('.product-detail .prices .sales .value[content]').first().attr('content'),
  );
  const originalPrice = parseMoneyToCents(
    $('.product-detail .prices .strike-through .value[content]').first().attr('content'),
  );
  const promotionText = cleanText($('.product-promotion-info').first().text());
  const canonicalUrl = absoluteUrl($('link[rel="canonical"]').attr('href'), url) ?? url;
  const categories = unique([gtm.item_category2, gtm.item_category].map(cleanText));
  const images = unique([
    ...asArray(jsonLd.image),
    ...$('.product-detail .primary-images img[itemprop="image"]')
      .map((_, image) => $(image).attr('src'))
      .get(),
    ...(sitemapEntry?.images ?? []).map((image) => image.url),
  ]).map((imageUrl) => absoluteUrl(imageUrl, url));
  const hasPromotionMarkup = $('.product-promotion-info').length > 0;

  return {
    marketId: 'pingo-doce',
    externalId: productExternalId(jsonLd, $, url),
    name: cleanText(jsonLd.name) ?? cleanText($('.product-name').first().text()),
    brand:
      cleanText(typeof jsonLd.brand === 'string' ? jsonLd.brand : jsonLd.brand?.name) ??
      cleanText($('.product-brand').first().text()),
    description: cleanText(jsonLd.description),
    categories,
    package: unitMeasure,
    offer: {
      currency: 'EUR',
      priceCents: currentPrice && currentPrice > 0 ? currentPrice : null,
      originalPriceCents: originalPrice && originalPrice > 0 ? originalPrice : null,
      pricePerBaseUnitCents: unitMeasure?.pricePerBaseUnitCents ?? null,
      baseUnit: unitMeasure?.pricePerBaseUnit ?? null,
      promotion:
        hasPromotionMarkup || (currentPrice > 0 && originalPrice > currentPrice),
      promotionEndsAt: resolvePartialPortugueseDate(promotionText, collectedAt),
      promotionText,
    },
    images: images.filter(Boolean),
    url: canonicalUrl,
    source: {
      type: 'product-page',
      url,
      sitemapLastModified: sitemapEntry?.lastModified ?? null,
    },
    collectedAt,
  };
}

export const mercadoPingoDoceScraper = Object.freeze({
  id: 'pingo-doce',
  name: 'Pingo Doce',
  sitemapIndexUrl: 'https://www.pingodoce.pt/home/sitemap_index.xml',
  isProductSitemap,
  parseProductPage,
  parseProductSitemap,
  parseSitemapIndex,
});
