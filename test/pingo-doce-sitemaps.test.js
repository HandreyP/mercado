import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  isProductSitemap,
  parseProductSitemap,
  parseSitemapIndex,
} from '../src/markets/pingo-doce/sitemaps.js';

const fixture = (name) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('descobre apenas os sitemaps de produto', async () => {
  const sitemaps = parseSitemapIndex(await fixture('sitemap-index.xml'));
  assert.equal(sitemaps.length, 2);
  assert.deepEqual(sitemaps.filter(isProductSitemap), [
    {
      url: 'https://www.pingodoce.pt/home/sitemap_0-product.xml',
      lastModified: '2026-09-21T01:01:04+00:00',
    },
  ]);
});

test('extrai URL, ID, data e imagens de produtos', async () => {
  const products = parseProductSitemap(await fixture('product-sitemap.xml'));
  assert.equal(products.length, 1);
  assert.equal(products[0].externalId, '1805');
  assert.equal(products[0].lastModified, '2026-08-21T13:55:37+00:00');
  assert.equal(products[0].images[0].title, 'Sal Fino');
});
