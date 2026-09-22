import { mercadoPingoDoceScraper } from './mercado_pingo_doce.scrap.js';

const scrapers = new Map([
  [mercadoPingoDoceScraper.id, mercadoPingoDoceScraper],
]);

export function getMarketScraper(marketId) {
  const scraper = scrapers.get(marketId);
  if (!scraper) {
    throw new Error(
      `Supermercado desconhecido: ${marketId}. Disponíveis: ${[...scrapers.keys()].join(', ')}`,
    );
  }
  return scraper;
}

export function listMarketScrapers() {
  return [...scrapers.values()].map(({ id, name }) => ({ id, name }));
}
