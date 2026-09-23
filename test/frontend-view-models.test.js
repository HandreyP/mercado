import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatCatalogSummary,
  formatSyncStatus,
} from '../public/view-models.js';

test('resume catálogo com cobertura quando a descoberta está disponível', () => {
  assert.equal(
    formatCatalogSummary({ products: 550, promotions: 80, discoveredProducts: 2200 }),
    '550 produtos · 80 promoções · 25% do catálogo descoberto',
  );
});

test('apresenta falha sem esconder a última sincronização bem-sucedida', () => {
  const result = formatSyncStatus({
    status: 'failed',
    finishedAt: '2026-09-23T03:20:05Z',
    lastSuccessAt: '2026-09-22T03:06:00Z',
    error: { code: 'EAI_AGAIN', message: 'DNS indisponível' },
  });

  assert.equal(result.tone, 'error');
  assert.equal(result.label, 'Última tentativa falhou');
  assert.match(result.detail, /EAI_AGAIN/);
  assert.match(result.detail, /Último sucesso/);
});

test('apresenta recolha concluída e quantidade recolhida', () => {
  const result = formatSyncStatus({
    status: 'completed',
    finishedAt: '2026-09-23T03:06:00Z',
    stats: { collected: 500 },
  });

  assert.equal(result.tone, 'success');
  assert.equal(result.label, 'Catálogo atualizado');
  assert.match(result.detail, /500 produtos/);
});
