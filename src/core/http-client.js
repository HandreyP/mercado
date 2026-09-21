import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import axios from 'axios';

const DEFAULT_USER_AGENT =
  'mercado-price-comparator/0.1 (personal educational project)';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class HttpClient {
  constructor({
    cacheDirectory = '.cache/http',
    cacheTtlMs = 24 * 60 * 60 * 1000,
    minIntervalMs = 750,
    timeoutMs = 20_000,
    useCache = true,
    userAgent = process.env.MARKET_USER_AGENT ?? DEFAULT_USER_AGENT,
  } = {}) {
    this.cacheDirectory = cacheDirectory;
    this.cacheTtlMs = cacheTtlMs;
    this.minIntervalMs = minIntervalMs;
    this.useCache = useCache;
    this.lastRequestAt = 0;
    this.client = axios.create({
      timeout: timeoutMs,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': userAgent,
      },
      maxRedirects: 5,
      responseType: 'text',
      transformResponse: [(body) => body],
      validateStatus: () => true,
    });
  }

  async getText(url, { cacheTtlMs = this.cacheTtlMs } = {}) {
    const cachePath = this.#cachePath(url);

    if (this.useCache) {
      const cached = await this.#readCache(cachePath, cacheTtlMs);
      if (cached !== null) return cached;
    }

    const body = await this.#requestWithRetry(url);

    if (this.useCache) await this.#writeCache(cachePath, body);

    return body;
  }

  #cachePath(url) {
    const hash = createHash('sha256').update(url).digest('hex');
    return path.join(this.cacheDirectory, `${hash}.txt`);
  }

  async #readCache(cachePath, cacheTtlMs) {
    try {
      const details = await stat(cachePath);
      if (Date.now() - details.mtimeMs > cacheTtlMs) return null;
      return await readFile(cachePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async #writeCache(cachePath, body) {
    await mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, body, 'utf8');
    await rename(temporaryPath, cachePath);
  }

  async #requestWithRetry(url) {
    const maximumAttempts = 3;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      await this.#throttle();

      let response;
      try {
        response = await this.client.get(url);
      } catch (error) {
        if (attempt === maximumAttempts) {
          throw new Error(`Falha ao obter ${url}: ${error.message}`, { cause: error });
        }
        await sleep(attempt * 1_000);
        continue;
      }

      if (response.status >= 200 && response.status < 300) return response.data;

      const canRetry = response.status === 429 || response.status >= 500;
      if (!canRetry || attempt === maximumAttempts) {
        throw new Error(`Pedido a ${url} devolveu HTTP ${response.status}`);
      }

      const retryAfterSeconds = Number(response.headers['retry-after']);
      const retryDelay = Number.isFinite(retryAfterSeconds)
        ? Math.min(retryAfterSeconds * 1_000, 60_000)
        : attempt * 1_000;
      await sleep(retryDelay);
    }

    throw new Error(`Não foi possível obter ${url}`);
  }

  async #throttle() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) await sleep(this.minIntervalMs - elapsed);
    this.lastRequestAt = Date.now();
  }
}
