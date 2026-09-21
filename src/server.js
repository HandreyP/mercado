#!/usr/bin/env node

import express from 'express';

import { parseProductFilters } from './api/product-filters.js';
import {
  getCatalogStats,
  getProductHistory,
  listMarkets,
  listProducts,
} from './api/products-repository.js';
import { createDatabasePool } from './db/pool.js';

const app = express();
const pool = createDatabasePool();
const port = Number(process.env.PORT ?? 3000);
const publicDirectory = new URL('../public/', import.meta.url).pathname;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(publicDirectory));

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/markets', async (_request, response, next) => {
  try {
    response.json({ items: await listMarkets(pool) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/products', async (request, response, next) => {
  try {
    const filters = parseProductFilters(request.query);
    response.json(await listProducts(pool, filters));
  } catch (error) {
    if (error.message.includes('inválid') || error.message.includes('deve ser')) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.get('/api/products/:id/history', async (request, response, next) => {
  try {
    if (!/^\d+$/.test(request.params.id)) {
      response.status(400).json({ error: 'ID de produto inválido' });
      return;
    }
    const history = await getProductHistory(pool, request.params.id);
    if (!history) {
      response.status(404).json({ error: 'Produto não encontrado' });
      return;
    }
    response.json(history);
  } catch (error) {
    next(error);
  }
});

app.get('/api/stats', async (_request, response, next) => {
  try {
    response.json(await getCatalogStats(pool));
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Endpoint não encontrado' });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno do servidor' });
});

const server = app.listen(port, () => {
  console.log(`Mercado disponível em http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
