function compact(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalize(value) {
  return compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalProductIdentity(product) {
  const displayName = compact(product.name);
  const brand = product.brand ? compact(product.brand) : null;
  return {
    displayName,
    brand,
    normalizedName: normalize(displayName),
    normalizedBrand: brand ? normalize(brand) : null,
    packageQuantity: product.package?.normalizedQuantity ?? null,
    packageUnit: product.package?.normalizedUnit ?? null,
  };
}
