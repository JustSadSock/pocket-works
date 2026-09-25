import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { GAME_ID } from './protocol.mjs';

const VERSION = /^[a-f0-9]{64}$/;

export class ModuleRegistry {
  constructor(directory) {
    this.directory = directory;
    this.versions = new Map();
    this.active = new Map();
  }

  async load(required = new Set()) {
    await mkdir(this.directory, { recursive: true });
    for (const gameId of await readdir(this.directory)) {
      if (!GAME_ID.test(gameId)) continue;
      try {
        const current = (await readFile(path.join(this.directory, gameId, 'current'), 'utf8')).trim();
        if (VERSION.test(current)) {
          try { await this.start(gameId, current); this.active.set(gameId, current); }
          catch (error) { console.error('module_load_failed', gameId, current, error); }
        }
      } catch { /* No published version yet. */ }
      for (const key of required) {
        const [requiredGame, version] = key.split('@');
        if (requiredGame !== gameId || !VERSION.test(version) || this.versions.has(key)) continue;
        try { await this.start(gameId, version); } catch (error) { console.error('module_load_failed', gameId, version, error); }
      }
    }
  }

  async start(gameId, version) {
    const key = `${gameId}@${version}`;
    if (this.versions.has(key)) return this.versions.get(key);
    const source = path.join(this.directory, gameId, version, 'module.mjs');
    const worker = new Worker(new URL('./module-worker.mjs', import.meta.url), {
      workerData: { url: pathToFileURL(source).href },
      resourceLimits: { maxOldGenerationSizeMb: 64 }
    });
    const handle = { worker, rooms: new Set(), pending: new Map(), nextId: 0, gameId, version };
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Module startup timeout')), 5000);
      worker.once('message', message => { clearTimeout(timeout); message.type === 'ready' ? resolve() : reject(new Error('Module failed startup')); });
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Module exited: ${code}`)); });
    }).catch(async error => { await worker.terminate(); throw error; });
    worker.on('message', message => {
      const pending = handle.pending.get(message.id);
      if (!pending) return;
      handle.pending.delete(message.id);
      clearTimeout(pending.timeout);
      message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result);
    });
    const fail = error => {
      for (const pending of handle.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
      handle.pending.clear();
      this.versions.delete(key);
      if (this.active.get(gameId) === version) this.active.delete(gameId);
    };
    worker.on('error', fail);
    worker.on('exit', code => fail(new Error(`Module exited: ${code}`)));
    this.versions.set(key, handle);
    return handle;
  }

  call(handle, action, payload) {
    return new Promise((resolve, reject) => {
      const id = ++handle.nextId;
      const timeout = setTimeout(() => {
        handle.pending.delete(id);
        reject(new Error('Module call timeout'));
        handle.worker.terminate();
      }, 3000);
      handle.pending.set(id, { resolve, reject, timeout });
      handle.worker.postMessage({ id, action, payload });
    });
  }

  async publish({ gameId, protocolVersion, bundle, sha256 }) {
    if (!GAME_ID.test(gameId) || protocolVersion !== 1 || typeof bundle !== 'string' || Buffer.byteLength(bundle) > 1024 * 1024) throw new Error('Invalid module metadata');
    const digest = createHash('sha256').update(bundle).digest('hex');
    if (sha256 !== digest) throw new Error('Module checksum mismatch');
    const folder = path.join(this.directory, gameId, digest);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'module.mjs'), bundle, { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST') throw error; });
    let handle;
    try { handle = await this.start(gameId, digest); }
    catch (error) { await rm(folder, { recursive: true, force: true }); throw error; }
    const pointer = path.join(this.directory, gameId, 'current');
    const temp = `${pointer}.${process.pid}.tmp`;
    await writeFile(temp, digest);
    await rename(temp, pointer);
    const previous = this.current(gameId);
    this.active.set(gameId, digest);
    if (previous && previous !== handle) await this.release(previous, '');
    return { gameId, version: digest, handle };
  }

  current(gameId) {
    const version = this.active.get(gameId);
    return version ? this.versions.get(`${gameId}@${version}`) : null;
  }

  async release(handle, roomId) {
    handle.rooms.delete(roomId);
    if (handle.rooms.size || this.active.get(handle.gameId) === handle.version) return;
    this.versions.delete(`${handle.gameId}@${handle.version}`);
    await handle.worker.terminate();
  }

  async prune() {
    for (const handle of [...this.versions.values()]) await this.release(handle, '');
  }
}
