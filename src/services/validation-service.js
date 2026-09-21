export function validateProduct(product) {
  const errors = [];
  const warnings = [];

  if (!product.externalId) errors.push('externalId em falta');
  if (!product.name) errors.push('nome em falta');
  if (!product.url) errors.push('URL em falta');
  if (!product.offer?.priceCents || product.offer.priceCents <= 0) {
    errors.push('preço atual em falta ou inválido');
  }
  if (!product.package?.normalizedQuantity || !product.package?.normalizedUnit) {
    warnings.push('quantidade ou unidade normalizada em falta');
  }
  if (
    product.offer?.originalPriceCents !== null &&
    product.offer?.originalPriceCents <= product.offer?.priceCents
  ) {
    warnings.push('preço anterior não é superior ao preço atual');
  }

  return { valid: errors.length === 0, errors, warnings };
}
