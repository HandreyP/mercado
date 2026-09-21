const SORTS = new Set([
  'name_asc',
  'price_asc',
  'price_desc',
  'unit_price_asc',
  'newest',
]);

function parseInteger(value, fallback, { min, max }) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Valor numérico inválido: ${value}`);
  }
  return parsed;
}

export function parseProductFilters(query) {
  const search = String(query.q ?? '').trim().slice(0, 100);
  const sort = String(query.sort ?? 'name_asc');
  if (!SORTS.has(sort)) throw new Error(`Ordenação inválida: ${sort}`);

  let promotion = null;
  if (query.promotion === 'true') promotion = true;
  else if (query.promotion === 'false') promotion = false;
  else if (query.promotion !== undefined) {
    throw new Error('promotion deve ser true ou false');
  }

  return {
    search,
    sort,
    promotion,
    market: query.market ? String(query.market).slice(0, 80) : null,
    limit: parseInteger(query.limit, 24, { min: 1, max: 100 }),
    offset: parseInteger(query.offset, 0, { min: 0, max: 1_000_000 }),
  };
}
