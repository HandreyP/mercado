import express from 'express';

import { parseProductFilters } from './api/product-filters.js';

const publicDirectory = new URL('../public/', import.meta.url).pathname;

export function createApiHandlers({ catalogRepository, database }) {
  return {
    async health(_request, response, next) {
      try {
        await database.healthCheck();
        response.json({ status: 'ok' });
      } catch (error) {
        next(error);
      }
    },

    async markets(_request, response, next) {
      try {
        response.json({ items: await catalogRepository.listMarkets() });
      } catch (error) {
        next(error);
      }
    },

    async products(request, response, next) {
      try {
        const filters = parseProductFilters(request.query);
        response.json(await catalogRepository.listProducts(filters));
      } catch (error) {
        if (
          error.message.includes('inválid') ||
          error.message.includes('deve ser')
        ) {
          response.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },

    async history(request, response, next) {
      try {
        if (!/^\d+$/.test(request.params.id)) {
          response.status(400).json({ error: 'ID de produto inválido' });
          return;
        }
        const history = await catalogRepository.getProductHistory(request.params.id);
        if (!history) {
          response.status(404).json({ error: 'Produto não encontrado' });
          return;
        }
        response.json(history);
      } catch (error) {
        next(error);
      }
    },

    async stats(_request, response, next) {
      try {
        response.json(await catalogRepository.getCatalogStats());
      } catch (error) {
        next(error);
      }
    },
  };
}

export function createApp({ catalogRepository, database }) {
  const app = express();
  const handlers = createApiHandlers({ catalogRepository, database });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(publicDirectory));

  app.get('/api/health', handlers.health);
  app.get('/api/markets', handlers.markets);
  app.get('/api/products', handlers.products);
  app.get('/api/products/:id/history', handlers.history);
  app.get('/api/stats', handlers.stats);

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Endpoint não encontrado' });
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: 'Erro interno do servidor' });
  });

  return app;
}
