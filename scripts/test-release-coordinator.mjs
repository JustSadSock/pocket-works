import assert from 'node:assert/strict';
const data = new Map();
globalThis.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value))
};
globalThis.location = { href: 'https://works.example/' };
globalThis.MessageChannel = class FakeMessageChannel {
  constructor() {
    this.port1 = { onmessage: null, close() {} };
    this.port2 = { notify: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
  }
};
const {
  releaseIdentity, sameRelease, installedTargets, getVerifiedReleases,
  updateInstalledApplication, needsReleaseConvergence, clearStaleAppRuntime
} = await import('../shared/release-coordinator.js');

const app = { slug: 'alpha', name: 'Alpha', path: './apps/alpha/', version: '2.0', fingerprint: 'new-build' };
assert.deepEqual(releaseIdentity(app), { version: '2.0', fingerprint: 'new-build' });
assert.equal(sameRelease({ version: '2.0', fingerprint: 'old' }, releaseIdentity(app)), false);

const scope = 'https://works.example/apps/alpha/';
let unregisterCalls = 0;
const oldWorker = { state: 'activated', postMessage(_message, ports) { ports[0].notify({ version: '1.0' }); } };
const newWorker = { state: 'activated', postMessage(_message, ports) { ports[0].notify({ version: '2.0', fingerprint: 'new-build' }); } };
let registration = {
  scope, active: oldWorker, installing: null, waiting: null,
  async update() { this.active = newWorker; },
  async unregister() { unregisterCalls++; return true; }
};
const sw = {
  async getRegistrations() { return [registration]; },
  register() { throw new Error('Bulk Sync must not install new Service Workers'); }
};
const targets = await installedTargets([app, { slug: 'beta', path: './apps/beta/' }], sw);
assert.equal(targets.length, 1, 'only previously installed applications are targeted');

const stages = [];
const first = await updateInstalledApplication(app, registration, {
  onStage: (label, phase) => stages.push(phase)
});
assert.equal(first.status, 'updated');
assert.equal(getVerifiedReleases().alpha.fingerprint, 'new-build', 'only a verified worker can be recorded');
assert.ok(stages.includes('checking') && stages.includes('verifying'));
const second = await updateInstalledApplication(app, registration);
assert.equal(second.status, 'current', 'matching active and recorded releases skip update');

const incorrect = { ...app, fingerprint: 'wrong-build' };
const failure = await updateInstalledApplication(incorrect, registration);
assert.equal(failure.status, 'failed', 'incorrect active fingerprint is not accepted');
assert.equal(getVerifiedReleases().alpha.fingerprint, 'new-build', 'failed verification cannot update receipt');

data.set('pocket-works:observed-releases:v1', JSON.stringify({
  alpha: { version: '1.0', fingerprint: 'old-build' }
}));
assert.equal(needsReleaseConvergence('alpha', releaseIdentity(app)), true);
const deleted = [];
const cacheStorage = {
  async keys() { return ['alpha-v1.0', 'alpha-v2.0', 'beta-v1.0']; },
  async delete(name) { deleted.push(name); return true; }
};
await clearStaleAppRuntime('alpha', releaseIdentity(app), { serviceWorkers: sw, cacheStorage });
assert.deepEqual(deleted, ['alpha-v1.0'], 'only stale caches belonging to this app are removed');
assert.equal(unregisterCalls, 1, 'only this app registration is cleared');
assert.equal(needsReleaseConvergence('alpha', releaseIdentity(app)), false);
assert.equal(data.has('pocket-works:shelf:v1'), false, 'user data is never deleted');
console.log('Release coordinator verification, installed-only updates and scoped cleanup passed.');
