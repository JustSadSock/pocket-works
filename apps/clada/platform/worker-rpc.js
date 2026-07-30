export function createWorkerRpc(worker, { timeout = 12000 } = {}) {
  let nextId = 1;
  const pending = new Map();

  const rejectAll = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };

  worker.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.rpc !== 'clada' || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.ok) request.resolve(message.value);
    else request.reject(Object.assign(new Error(message.error?.message || 'Worker request failed'), message.error || {}));
  });
  worker.addEventListener('error', (event) => rejectAll(event.error || new Error(event.message || 'Worker crashed')));
  worker.addEventListener('messageerror', () => rejectAll(new Error('Worker returned an unreadable message')));

  return {
    call(method, ...args) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Worker timeout: ${method}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        worker.postMessage({ rpc: 'clada', id, method, args });
      });
    },
    terminate() {
      rejectAll(new Error('Worker terminated'));
      worker.terminate();
    }
  };
}
