import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitForServer(base) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* Startup pending. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server did not start');
}
async function connect(base, token) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  const messages = [];
  const waiters = [];
  ws.on('message', raw => {
    const message = JSON.parse(String(raw));
    const waiter = waiters.find(entry => entry.type === message.type);
    if (waiter) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(message); }
    else messages.push(message);
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const next = type => {
    const index = messages.findIndex(message => message.type === type);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = { type, resolve };
      waiters.push(entry);
      setTimeout(() => { if (waiters.includes(entry)) { waiters.splice(waiters.indexOf(entry), 1); reject(new Error(`Timed out: ${type}`)); } }, 3000).unref();
    });
  };
  ws.send(JSON.stringify({ wireVersion: 1, type: 'auth', token }));
  await next('authenticated');
  return { ws, next, send: (type, payload = {}) => ws.send(JSON.stringify({ wireVersion: 1, type, ...payload })) };
}

test('publish, route, reconnect and restore a pinned room', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pocket-server-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), POCKET_DATA_DIR: directory, POCKET_AUTH_SECRET: 'test-auth-secret', POCKET_DEPLOY_TOKEN: 'test-deploy-token' };
  const entry = fileURLToPath(new URL('../src/main.mjs', import.meta.url));
  let server = spawn(process.execPath, [entry], { env, stdio: 'ignore' });
  const stop = async () => {
    if (server.exitCode !== null) return;
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
  };
  const publish = async name => {
    const bundle = await readFile(new URL(`./fixtures/${name}.mjs`, import.meta.url), 'utf8');
    const result = await fetch(`${base}/admin/modules`, {
      method: 'POST', headers: { authorization: 'Bearer test-deploy-token', 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'counter', protocolVersion: 1, bundle, sha256: createHash('sha256').update(bundle).digest('hex') })
    });
    assert.equal(result.status, 200, await result.text());
  };
  try {
    await waitForServer(base);
    await publish('counter-v1');
    const session = await fetch(`${base}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Tester' }) });
    const { token } = await session.json();
    const first = await connect(base, token);
    first.send('create_room', { gameId: 'counter' });
    const room = await first.next('room_joined');
    assert.equal(room.state.count, 0);
    await publish('counter-v2');
    first.send('game_message', { payload: {} });
    assert.equal((await first.next('game_event')).event.payload, 1);
    first.ws.close();
    await new Promise(resolve => first.ws.once('close', resolve));
    await stop();
    server = spawn(process.execPath, [entry], { env, stdio: 'ignore' });
    await waitForServer(base);
    const restored = await connect(base, token);
    restored.send('join_room', { roomId: room.roomId });
    assert.equal((await restored.next('room_joined')).state.count, 1);
    restored.send('game_message', { payload: {} });
    assert.equal((await restored.next('game_event')).event.payload, 2);
    restored.send('leave_room');
    restored.ws.close();
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
