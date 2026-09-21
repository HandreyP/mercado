import { pingoDoce } from './pingo-doce/index.js';

const markets = new Map([[pingoDoce.id, pingoDoce]]);

export function getMarket(marketId) {
  const market = markets.get(marketId);
  if (!market) {
    throw new Error(
      `Supermercado desconhecido: ${marketId}. Disponíveis: ${[...markets.keys()].join(', ')}`,
    );
  }
  return market;
}

export function listMarkets() {
  return [...markets.values()].map(({ id, name }) => ({ id, name }));
}
