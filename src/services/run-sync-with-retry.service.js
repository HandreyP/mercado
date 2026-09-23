import { randomUUID } from 'node:crypto';

const TRANSIENT_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isTransientSyncError(error) {
  if (!error) return false;
  if (TRANSIENT_ERROR_CODES.has(error.code)) return true;
  const status = error.response?.status ?? error.status;
  if (status === 429 || status >= 500) return true;
  return isTransientSyncError(error.cause);
}

export async function runSyncWithRetry({
  market,
  execute,
  syncExecutionRepository,
  maximumAttempts = 1,
  retryDelayMs = 5 * 60 * 1000,
  sleep = defaultSleep,
  batchId = randomUUID(),
  trigger = 'manual',
  onRetry = () => {},
}) {
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const execution = await syncExecutionRepository.start({
      attempt,
      batchId,
      market,
      trigger,
    });

    try {
      const result = await execute({ attempt, batchId });
      await syncExecutionRepository.complete(execution.id, { result });
      return {
        ...result,
        execution: { attempts: attempt, batchId },
      };
    } catch (error) {
      await syncExecutionRepository.fail(execution.id, { error });
      if (attempt >= maximumAttempts || !isTransientSyncError(error)) throw error;

      const delayMs = retryDelayMs * 3 ** (attempt - 1);
      onRetry({ attempt, delayMs, error, nextAttempt: attempt + 1 });
      await sleep(delayMs);
    }
  }

  throw new Error('Sincronização terminou sem resultado');
}
