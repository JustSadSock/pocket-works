import { createWorkerRpc } from './worker-rpc.js';

export async function createSimulationClient() {
  if (typeof Worker !== 'function') return null;
  const worker = new Worker(new URL('../workers/simulation-worker.js', import.meta.url));
  const rpc = createWorkerRpc(worker, { timeout: 15000 });
  try {
    const info = await rpc.call('init');
    return {
      available: true,
      info,
      advance: (community) => rpc.call('advance', community),
      summarize: (community) => rpc.call('summarize', community),
      terminate: () => rpc.terminate()
    };
  } catch (error) {
    rpc.terminate();
    console.warn('КЛАДА: Worker недоступен, используется основной поток', error);
    return null;
  }
}
