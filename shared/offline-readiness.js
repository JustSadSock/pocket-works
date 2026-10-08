// Read-only offline audit. A cache's *name* does not establish readiness:
// require an active app worker, a cached entrypoint and its bootstrap assets.
// It does not download, register or modify application data.
function canonical(input, base) {
  const url = new URL(input, base);
  return url.origin + url.pathname;
}

export function criticalEntrypointUrls(html, entryUrl) {
  const required = [];
  for (const match of String(html).matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const [, tag, attrs] = match;
    if (tag.toLowerCase() === 'link' && !/\brel\s*=\s*["']stylesheet["']/i.test(attrs)) continue;
    const source = attrs.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!source || /^(?:data:|blob:|#)/i.test(source)) continue;
    try {
      const url = new URL(source, entryUrl);
      if (url.origin === new URL(entryUrl).origin) required.push(canonical(url.href, entryUrl));
    } catch { /* ignore invalid reference */ }
  }
  // Godot WASM split bootstrap embeds part URLs as quoted strings.
  for (const found of String(html).matchAll(/["'](\.\/?[^"']+\.wasm\.part-[0-9]+(?:\?[^"']*)?)["']/gi)) {
    required.push(canonical(found[1], entryUrl));
  }
  return [...new Set(required)];
}

async function cacheInventory(cacheStorage) {
  const paths = new Map();
  const names = await cacheStorage.keys();
  for (const name of names) {
    const cache = await cacheStorage.open(name);
    for (const request of await cache.keys()) {
      const raw = request.url || String(request);
      const path = canonical(raw, raw);
      if (!paths.has(path)) paths.set(path, { cache, request });
    }
  }
  return paths;
}

export async function inspectOfflineReadiness(apps, {
  cacheStorage = globalThis.caches,
  serviceWorkers = globalThis.navigator?.serviceWorker,
  base = globalThis.location?.href || 'https://localhost/'
} = {}) {
  const results = new Map();
  if (!cacheStorage?.keys || !serviceWorkers?.getRegistrations) {
    for (const app of apps) results.set(app.slug, { status: 'unavailable', reason: 'Offline inspection is unavailable' });
    return results;
  }

  const registrations = await serviceWorkers.getRegistrations();
  const activeScopes = new Set(registrations.filter(reg => reg.active).map(reg => canonical(reg.scope, base)));
  const files = await cacheInventory(cacheStorage);

  for (const app of apps) {
    const scope = new URL(app.path, base);
    scope.search = '';
    scope.hash = '';
    if (!scope.pathname.endsWith('/')) scope.pathname += '/';
    const baseUrl = canonical(scope.href, base);
    const entryUrl = baseUrl + 'index.html';
    const sameAppFiles = [...files.keys()].filter(url => url.startsWith(baseUrl));
    if (!activeScopes.has(baseUrl)) {
      results.set(app.slug, { status: 'uncached', reason: 'No active application worker' });
      continue;
    }
    const entry = files.get(baseUrl) || files.get(entryUrl);
    if (!entry) {
      results.set(app.slug, { status: 'partial', reason: 'Application entrypoint is not cached' });
      continue;
    }
    try {
      const response = await entry.cache.match(entry.request);
      if (!response?.ok) throw new Error('Cached entrypoint is unreadable');
      const html = await response.text();
      const required = criticalEntrypointUrls(html, entryUrl);
      const missing = required.filter(url => !files.has(url));
      if (app.runtime === 'godot') {
        if (!sameAppFiles.some(url => /\.pck$/i.test(url))) missing.push('Godot game data');
        const wasm = sameAppFiles.filter(url => /\.wasm(?:\.part-[0-9]+)?$/i.test(url));
        if (!wasm.length) missing.push('Godot WebAssembly');
      }
      if (missing.length) {
        results.set(app.slug, { status: 'partial', reason: `Missing ${missing.length} required bootstrap file(s)`, missing });
      } else {
        results.set(app.slug, { status: 'ready', reason: 'Entrypoint and bootstrap resources cached' });
      }
    } catch (error) {
      results.set(app.slug, { status: 'partial', reason: error.message || 'Unable to verify cached entrypoint' });
    }
  }
  return results;
}
