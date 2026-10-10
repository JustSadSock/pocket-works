import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../shared/release-guard.js', import.meta.url), 'utf8');
function boot(controller) {
  const listeners = new Map();
  const values = new Map();
  const navigations = [];
  const worker = { controller, addEventListener: (type, callback) => listeners.set(type, callback) };
  const context = {
    URL, URLSearchParams, console,
    navigator: { serviceWorker: worker },
    location: {
      href: 'https://example.test/apps/sample/?pw_release=1.0.0&pw_fp=current',
      pathname: '/apps/sample/', search: '?pw_release=1.0.0&pw_fp=current',
      replace: target => navigations.push(target)
    },
    history: { replaceState() {} },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    document: {
      currentScript: { dataset: { pwRelease: '1.0.0', pwFingerprint: 'current', pwSlug: 'sample' } },
      querySelector: () => null, createElement: () => ({}),
      head: { append() {} }, addEventListener() {}
    },
    addEventListener() {}, setInterval() {}
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {
    navigations,
    claim(nextController) { worker.controller = nextController; listeners.get('controllerchange')(); }
  };
}

const current = { scriptURL: 'https://example.test/apps/sample/sw.js' };
const fresh = boot(null);
fresh.claim(current);
assert.equal(fresh.navigations.length, 0, 'first install must preserve the running page and unsaved actions');
fresh.claim({ ...current });
assert.equal(fresh.navigations.length, 1, 'an actual controller replacement still reloads once');
fresh.claim({ ...current });
assert.equal(fresh.navigations.length, 1, 'session guard prevents an update reload loop');

const upgrade = boot(current);
upgrade.claim({ ...current });
assert.equal(upgrade.navigations.length, 1, 'existing controlled pages retain upgrade recovery');
console.log('Release guard preserves first-install gameplay, reloads real replacements and prevents repeated reloads.');
