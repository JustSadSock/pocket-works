import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWorkerRpc } from '../platform/worker-rpc.js';

class FakeWorker extends EventEmitter {
  addEventListener(name, handler) { this.on(name, handler); }
  postMessage(message) {
    queueMicrotask(() => this.emit('message', { data: { rpc: 'clada', id: message.id, ok: true, value: message.args[0] + 1 } }));
  }
  terminate() {}
}

test('worker RPC correlates calls and responses', async () => {
  const rpc = createWorkerRpc(new FakeWorker(), { timeout: 100 });
  assert.equal(await rpc.call('increment', 4), 5);
  rpc.terminate();
});
