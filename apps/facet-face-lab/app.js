// FACET v1.9.1 multiview configuration-aware runtime.
for (const stylesheet of ['./v15.css', './v17.css', './v18-00.css', './v18-01.css', './v19.css', './v191.css']) {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL(stylesheet, import.meta.url).href;
  document.head.append(style);
}

async function readCompressedText(path) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`FACET asset unavailable: ${response.status}`);
  const encoded = await response.text();
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function readText(path) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`FACET asset unavailable: ${response.status}`);
  return response.text();
}

async function readCompressedParts(paths) {
  const encoded = (await Promise.all(paths.map(readText))).join('');
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function moduleUrlFromCompressed(path) {
  const source = await readCompressedText(path);
  return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
}

const partNames = ['00', '01', '02', '03', '04', '05', '06a', '06b', '07', '08', '09', '10'];
const encoded = (await Promise.all(partNames.map(async (name) => {
  const response = await fetch(new URL(`./facet-v15-c-${name}.txt`, import.meta.url), { cache: 'force-cache' });
  if (!response.ok) throw new Error(`FACET bundle part unavailable: ${response.status}`);
  return response.text();
}))).join('');
const payloadBytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
const payloadStream = new Blob([payloadBytes]).stream().pipeThrough(new DecompressionStream('gzip'));
let source = await new Response(payloadStream).text();

const runtimeMarker = 'const { installMobileRuntime } = await import("__MOBILE_RUNTIME__");';
const runtimeOffset = source.indexOf(runtimeMarker);
if (runtimeOffset < 0) throw new Error('FACET runtime boundary is missing');
const engineSource = source.slice(0, runtimeOffset);
const appSource = source.slice(runtimeOffset);
const engineExports = [
  'blendshapeMap', 'boundingBoxFromLandmarks', 'combineAssessments', 'computeGeometryProfile',
  'computeImageQuality', 'createScanAssessment', 'LANDMARK_GROUPS', 'qualityGate', 'ratingLabel'
];
source = `
const __facetEngine = (() => {
${engineSource}
return { ${engineExports.join(', ')} };
})();
const { ${engineExports.join(', ')} } = __facetEngine;
${appSource}`;
source = source.replace(/const APP_VERSION = ['"]1\.5\.0['"];?/, "const APP_VERSION = '1.9.1';");
source += `\n${await readCompressedText('./patch-v17.txt')}\n`;
source += `\n${await readText('./rating-v17.js')}\n`;
for (const patch of ['./ux-v18-00.txt', './ux-v18-01.txt', './ux-v18-02.txt']) {
  source += `\n${await readText(patch)}\n`;
}
source += `\n${await readCompressedParts([
  './protocol-v19-p00.txt', './protocol-v19-p01.txt', './protocol-v19-p02.txt',
  './protocol-v19-p03.txt', './protocol-v19-p04.txt', './protocol-v19-p05.txt',
  './protocol-v19-p06.txt', './protocol-v19-p07.txt', './protocol-v19-p08.txt',
  './protocol-v19-p09.txt', './protocol-v19-p10.txt', './protocol-v19-p11.txt'
])}\n`;
source += `\n${await readCompressedText('./ux-v19.txt')}\n`;
source += `\n${await readText('./ux-v191.js')}\n`;

const featureUrl = await moduleUrlFromCompressed('./feature-engine-v17.txt');
const parserUrl = await moduleUrlFromCompressed('./face-parser-v17.txt');
const resolve = (path) => new URL(path, import.meta.url).href;
source = source
  .replaceAll('__MOBILE_RUNTIME__', resolve('../../shared/mobile-runtime.js'))
  .replaceAll('__STORAGE__', resolve('../../shared/capabilities/storage.js'))
  .replaceAll('__WORKSHOP__', resolve('../../shared/workshop-mode.js'))
  .replaceAll('__PWA_UTILS__', resolve('../../shared/pwa-utils.js'))
  .replaceAll('__FEATURE_ENGINE_V17__', featureUrl)
  .replaceAll('__FACE_PARSER_V17__', parserUrl);

const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
} finally {
  URL.revokeObjectURL(moduleUrl);
  URL.revokeObjectURL(featureUrl);
  URL.revokeObjectURL(parserUrl);
}
