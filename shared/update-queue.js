export class UpdateTimeoutError extends Error {
  constructor(stage, timeout) {
    super(`${stage} timed out after ${Math.round(timeout / 1000)}s`);
    this.name = 'UpdateTimeoutError';
    this.stage = stage;
    this.timeout = timeout;
  }
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function withTimeout(operation, timeout, stage = 'operation') {
  if (!Number.isFinite(timeout) || timeout <= 0) return Promise.resolve(operation);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new UpdateTimeoutError(stage, timeout)), timeout);
    Promise.resolve(operation).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function mapWithConcurrencyResilient(items, concurrency, handler, {
  itemTimeout = 0,
  labelFor = (item) => item?.name || item?.slug || 'application',
  onStart,
  onProgress
} = {}) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      onStart?.(item, index, completed, items.length);

      let result;
      try {
        const operation = handler(item, index);
        result = itemTimeout > 0
          ? await withTimeout(operation, itemTimeout, `${labelFor(item)} update`)
          : await operation;
        if (!result || typeof result !== 'object') {
          result = { app: item, status: 'failed', stage: 'result', error: 'Updater returned no result' };
        }
      } catch (error) {
        result = {
          app: item,
          status: 'failed',
          stage: error?.stage || 'application',
          error: errorMessage(error)
        };
      } finally {
        results[index] = result;
        completed += 1;
        onProgress?.(completed, items.length, result, index);
      }
    }
  }

  const workers = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
