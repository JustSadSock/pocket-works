// FACET v1.5 compact runtime bundle.
const partUrls = [0, 1, 2, 3].map((index) => new URL(`./facet-v15-bundle-${index}.txt`, import.meta.url));
const encoded = (await Promise.all(partUrls.map(async (url) => {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`FACET bundle part unavailable: ${response.status}`);
  return response.text();
}))).join('');
const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
let source = await new Response(stream).text();
const resolve = (path) => new URL(path, import.meta.url).href;
source = source
  .replaceAll('__MOBILE_RUNTIME__', resolve('../../shared/mobile-runtime.js'))
  .replaceAll('__STORAGE__', resolve('../../shared/capabilities/storage.js'))
  .replaceAll('__WORKSHOP__', resolve('../../shared/workshop-mode.js'))
  .replaceAll('__PWA_UTILS__', resolve('../../shared/pwa-utils.js'));
const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
} finally {
  URL.revokeObjectURL(moduleUrl);
}
