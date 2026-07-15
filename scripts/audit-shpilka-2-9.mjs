import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('apps/shpilka/engine-v2-29-route.js');
const scenery = read('apps/shpilka/engine-v2-29-scenery.js');
const navigation = read('apps/shpilka/engine-v2-29-navigation.js');
const ui = read('apps/shpilka/engine-v2-29-ui.js');
const css = read('apps/shpilka/systems-29.css');
const app = read('apps/shpilka/app.js');
const index = read('apps/shpilka/index.html');
const config = JSON.parse(read('apps/shpilka/app.config.json'));
const sw = read('apps/shpilka/sw.js');

const layers = [
  './engine-v2-29-route.js',
  './engine-v2-29-scenery.js',
  './engine-v2-29-navigation.js',
  './engine-v2-29-ui.js'
];

const checks = [
  [config.version === '2.9.0', 'app config version is 2.9.0'],
  [config.cacheName === 'shpilka-v2.9.0-p1', 'cache name is bumped'],
  [layers.every((file) => app.includes(`'${file}'`)), 'all 2.9 layers are loaded'],
  [layers.every((file) => app.indexOf(`'${file}'`) < app.indexOf("'./engine-v2-12.js'")), '2.9 layers load before startup'],
  [index.includes('systems-29.css?v=2.9.0'), '2.9 CSS is linked'],
  [index.includes('data-app-version="2.9.0"'), 'update manager version is current'],
  [layers.every((file) => sw.includes(`'${file}'`)) && sw.includes("'./systems-29.css'"), 'offline shell includes 2.9 files'],
  [route.includes('shp28ModulePlan = function shp29ModulePlan'), 'route modules are expanded'],
  [route.includes("'СТАРЫЙ РЫНОК'") && route.includes("'ДОРОГА НАД ВОДОЙ'") && route.includes("'СТАРАЯ ПОЛОСА'"), 'distinctive route sections exist'],
  [scenery.includes('shp29DrawSceneryUnderlays') && scenery.includes('shp26DrawLandmarkUnderlays'), 'biome scenery and legacy landmarks are restored'],
  [scenery.includes('shp29DrawGuardrails') && scenery.includes('shp29DrawBrakingBoards'), 'track furniture exists'],
  [navigation.includes('shp29PaintMiniMap') && navigation.includes('shp29RoutePreviewPath'), 'live and menu route maps exist'],
  [ui.includes('No performance tuning') && ui.includes('не меняют скорость, сцепление или поведение машины'), 'garage is explicitly cosmetic'],
  [ui.includes('shp29CosmeticStorageKey') && ui.includes('drawCar = function shp29DrawCar'), 'cosmetics persist and render'],
  [css.includes('.route-map') && css.includes('.garage-screen'), 'map and garage are styled']
];

let failed = 0;
for (const [ok, label] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else {
    console.error(`✗ ${label}`);
    failed += 1;
  }
}
if (failed) process.exit(1);
console.log(`ШПИЛЬКА 2.9 audit passed (${checks.length} checks).`);
