import {
  isProductSitemap,
  parseProductSitemap,
  parseSitemapIndex,
} from './sitemaps.js';
import { parseProductPage } from './product-page.js';

export const pingoDoce = Object.freeze({
  id: 'pingo-doce',
  name: 'Pingo Doce',
  sitemapIndexUrl: 'https://www.pingodoce.pt/home/sitemap_index.xml',
  isProductSitemap,
  parseProductPage,
  parseProductSitemap,
  parseSitemapIndex,
});
