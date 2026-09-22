import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseProductPage } from '../src/scrapers/mercado_pingo_doce.scrap.js';

const fixture = (name) =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('combina JSON-LD e HTML numa representação comum', async () => {
  const url = 'https://www.pingodoce.pt/home/produtos/mercearia/sal-fino-pingo-doce-1805.html';
  const product = parseProductPage(await fixture('product-page.html'), {
    url,
    collectedAt: '2026-09-21T12:00:00Z',
  });

  assert.equal(product.externalId, '1805');
  assert.equal(product.name, 'Sal Fino');
  assert.equal(product.brand, 'Pingo Doce');
  assert.deepEqual(product.categories, ['Mercearia', 'Sal']);
  assert.equal(product.offer.priceCents, 29);
  assert.equal(product.offer.pricePerBaseUnitCents, 116);
  assert.equal(product.package.normalizedQuantity, 0.25);
  assert.equal(product.offer.promotion, false);
  assert.equal(product.url, url);
});

test('extrai preço anterior e data de fim da promoção', async () => {
  const product = parseProductPage(await fixture('product-page-promotion.html'), {
    url: 'https://www.pingodoce.pt/home/produtos/mercearia/azeite-pingo-doce-654603.html',
    collectedAt: '2026-09-20T12:00:00Z',
  });

  assert.equal(product.offer.priceCents, 409);
  assert.equal(product.offer.originalPriceCents, 429);
  assert.equal(product.offer.promotion, true);
  assert.equal(product.offer.promotionEndsAt, '2026-09-21');
  assert.equal(product.package.normalizedQuantity, 0.75);
  assert.equal(product.offer.baseUnit, 'l');
});
