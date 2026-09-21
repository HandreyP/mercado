const UNIT_DEFINITIONS = new Map([
  ['kg', { factor: 1, unit: 'kg' }],
  ['quilo', { factor: 1, unit: 'kg' }],
  ['quilos', { factor: 1, unit: 'kg' }],
  ['g', { factor: 0.001, unit: 'kg' }],
  ['gr', { factor: 0.001, unit: 'kg' }],
  ['l', { factor: 1, unit: 'l' }],
  ['lt', { factor: 1, unit: 'l' }],
  ['ml', { factor: 0.001, unit: 'l' }],
  ['cl', { factor: 0.01, unit: 'l' }],
  ['un', { factor: 1, unit: 'unit' }],
  ['uni', { factor: 1, unit: 'unit' }],
  ['unidade', { factor: 1, unit: 'unit' }],
  ['unidades', { factor: 1, unit: 'unit' }],
  ['rolo', { factor: 1, unit: 'unit' }],
  ['rolos', { factor: 1, unit: 'unit' }],
  ['dose', { factor: 1, unit: 'unit' }],
  ['doses', { factor: 1, unit: 'unit' }],
  ['dos', { factor: 1, unit: 'unit' }],
]);

export function parsePortugueseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const compact = value.trim().replace(/\s/g, '');
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMoneyToCents(value) {
  const amount = parsePortugueseNumber(value);
  if (amount === null || amount < 0) return null;
  return Math.round(amount * 100);
}

export function normalizeUnit(rawUnit) {
  if (!rawUnit) return null;
  const key = rawUnit.toLocaleLowerCase('pt-PT').replace(/[.]/g, '').trim();
  return UNIT_DEFINITIONS.get(key) ?? { factor: 1, unit: key };
}

export function parseUnitMeasure(value) {
  if (!value) return null;

  const raw = value.replace(/\s+/g, ' ').trim();
  const [packageText, unitPriceText = ''] = raw.split('|').map((part) => part.trim());
  const multipackMatch = packageText.match(
    /^([\d.,]+)\s*[x×]\s*([\d.,]+)\s*([\p{L}.]+)/iu,
  );
  const packageMatch = packageText.match(/^([\d.,]+)\s*([\p{L}.]+)/u);
  const unitPriceMatch = unitPriceText.match(/([\d.,]+)\s*€\s*\/\s*([\p{L}.]+)/u);

  if (!multipackMatch && !packageMatch && !unitPriceMatch) return { raw };

  const packCount = multipackMatch
    ? parsePortugueseNumber(multipackMatch[1])
    : null;
  const itemQuantity = multipackMatch
    ? parsePortugueseNumber(multipackMatch[2])
    : null;
  const quantity = multipackMatch
    ? packCount * itemQuantity
    : packageMatch
      ? parsePortugueseNumber(packageMatch[1])
      : null;
  const originalUnit = multipackMatch?.[3] ?? packageMatch?.[2] ?? null;

  const normalizedUnit = normalizeUnit(originalUnit);
  const priceUnit = normalizeUnit(unitPriceMatch?.[2]);

  return {
    raw,
    quantity,
    unit: originalUnit?.toLocaleLowerCase('pt-PT') ?? null,
    ...(multipackMatch
      ? {
          packCount,
          itemQuantity,
          itemUnit: originalUnit?.toLocaleLowerCase('pt-PT') ?? null,
        }
      : {}),
    normalizedQuantity:
      quantity !== null && normalizedUnit ? quantity * normalizedUnit.factor : null,
    normalizedUnit: normalizedUnit?.unit ?? null,
    pricePerBaseUnitCents: unitPriceMatch
      ? parseMoneyToCents(unitPriceMatch[1])
      : null,
    pricePerBaseUnit: priceUnit?.unit ?? normalizedUnit?.unit ?? null,
  };
}

export function resolvePartialPortugueseDate(value, referenceDate = new Date()) {
  const match = value?.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const explicitYear = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : null;
  const reference = new Date(referenceDate);
  const years = explicitYear
    ? [explicitYear]
    : [reference.getUTCFullYear() - 1, reference.getUTCFullYear(), reference.getUTCFullYear() + 1];

  const candidates = years
    .map((year) => new Date(Date.UTC(year, monthIndex, day)))
    .filter(
      (date) =>
        date.getUTCDate() === day &&
        date.getUTCMonth() === monthIndex &&
        !Number.isNaN(date.getTime()),
    )
    .sort(
      (left, right) =>
        Math.abs(left.getTime() - reference.getTime()) -
        Math.abs(right.getTime() - reference.getTime()),
    );

  return candidates[0]?.toISOString().slice(0, 10) ?? null;
}
