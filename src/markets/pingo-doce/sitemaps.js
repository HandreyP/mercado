import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: true,
  trimValues: true,
});

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function getExternalId(url) {
  return url?.match(/-(\d+)\.html(?:$|[?#])/)?.[1] ?? null;
}

export function parseSitemapIndex(xml) {
  const document = parser.parse(xml);
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
  const document = parser.parse(xml);

  return asArray(document.urlset?.url)
    .map((entry) => {
      const images = asArray(entry['image:image'])
        .map((image) => ({
          url: image['image:loc'],
          title: image['image:title'] ?? null,
          caption: image['image:caption'] ?? null,
        }))
        .filter((image) => image.url);

      return {
        externalId: getExternalId(entry.loc),
        url: entry.loc,
        lastModified: entry.lastmod ?? null,
        images,
      };
    })
    .filter((entry) => entry.url && entry.externalId);
}
