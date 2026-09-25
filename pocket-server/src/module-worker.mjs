import { parentPort, workerData } from 'node:worker_threads';

const module = (await import(workerData.url)).default;
if (!module || module.protocolVersion !== 1 || typeof module.createRoom !== 'function' || typeof module.onMessage !== 'function') {
  throw new Error('Invalid Pocket Server module contract');
}
parentPort.postMessage({ type: 'ready' });
parentPort.on('message', async ({ id, action, payload }) => {
  try {
    const result = action === 'create' ? await module.createRoom(payload) :
      action === 'message' ? await module.onMessage(payload) :
      action === 'join' && module.onJoin ? await module.onJoin(payload) :
      action === 'leave' && module.onLeave ? await module.onLeave(payload) :
      { state: payload.state, events: [] };
    if (!result || typeof result !== 'object' || !('state' in result)) throw new Error('Module must return { state, events }');
    result.events ??= [];
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message || error) });
  }
});
