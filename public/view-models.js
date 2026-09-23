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
