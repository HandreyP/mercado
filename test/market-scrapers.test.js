import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMarketScraper,
  listMarketScrapers,
} from '../src/scrapers/market-scrapers.js';

test('regista o scraper do Pingo Doce pelo identificador estável', () => {
  const scraper = getMarketScraper('pingo-doce');
  assert.equal(scraper.id, 'pingo-doce');
  assert.equal(scraper.name, 'Pingo Doce');
  assert.equal(typeof scraper.parseProductPage, 'function');
  assert.equal(typeof scraper.parseProductSitemap, 'function');
});

test('lista scrapers sem expor detalhes internos', () => {
  assert.deepEqual(listMarketScrapers(), [
    { id: 'pingo-doce', name: 'Pingo Doce' },
  ]);
});

test('rejeita mercados sem scraper registado', () => {
  assert.throws(() => getMarketScraper('mercado-inexistente'), /desconhecido/);
});
