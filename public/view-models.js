function dateTime(value) {
  return value ? new Date(value).toLocaleString('pt-PT') : 'ainda sem registo';
}

export function formatCatalogSummary({
  products = 0,
  promotions = 0,
  discoveredProducts = null,
}) {
  const parts = [`${products} produtos`, `${promotions} promoções`];
  if (discoveredProducts > 0) {
    parts.push(
      `${Math.min(100, Math.round((products / discoveredProducts) * 100))}% do catálogo descoberto`,
    );
  }
  return parts.join(' · ');
}

export function formatCategoryLabel({ name, productCount }) {
  return `${name} (${productCount})`;
}

export function formatSyncActionStatus(statusCode) {
  if (statusCode === 202) {
    return { label: 'Sincronização iniciada', tone: 'running' };
  }
  if (statusCode === 409) {
    return { label: 'Já existe uma sincronização em curso', tone: 'running' };
  }
  return { label: 'Não foi possível iniciar a sincronização', tone: 'error' };
}

export function formatSyncStatus(status) {
  if (!status) {
    return {
      detail: 'A sincronização diária ainda não tem execuções registadas.',
      label: 'Sem histórico de recolha',
      tone: 'neutral',
    };
  }
  if (status.status === 'running') {
    return {
      detail: `Iniciada em ${dateTime(status.startedAt)}.`,
      label: 'Recolha em curso',
      tone: 'running',
    };
  }
  if (status.status === 'failed') {
    const code = status.error?.code ? ` (${status.error.code})` : '';
    return {
      detail:
        `${status.error?.message ?? 'Erro desconhecido'}${code}. ` +
        `Último sucesso: ${dateTime(status.lastSuccessAt)}.`,
      label: 'Última tentativa falhou',
      tone: 'error',
    };
  }
  return {
    detail:
      `${status.stats?.collected ?? 0} produtos recolhidos · ` +
      `${dateTime(status.finishedAt)}.`,
    label: 'Catálogo atualizado',
    tone: 'success',
  };
}
