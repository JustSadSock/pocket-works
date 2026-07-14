import { readFile } from 'node:fs/promises';

const failures = [];
const check = (value, message) => { if (!value) failures.push(message); };
const read = (path) => readFile(path, 'utf8');
const [index, app, boot, route, ai, physics, fixes, ui, worker, configRaw] = await Promise.all([
  read('apps/shpilka/index.html'), read('apps/shpilka/app.js'), read('apps/shpilka/engine-v2-12.js'),
  read('apps/shpilka/engine-v2-28-route.js'), read('apps/shpilka/engine-v2-28-ai.js'),
  read('apps/shpilka/engine-v2-28-physics.js'), read('apps/shpilka/engine-v2-28-fixes.js'),
  read('apps/shpilka/engine-v2-28-ui.js'), read('apps/shpilka/sw.js'), read('apps/shpilka/app.config.json')
]);
const config = JSON.parse(configRaw);
const layers = ['route', 'ai', 'physics', 'fixes', 'ui'];
for (const layer of layers) {
  check(app.includes(`engine-v2-28-${layer}.js`), `${layer} layer is not loaded`);
  check(worker.includes(`engine-v2-28-${layer}.js`), `${layer} layer is not cached`);
}
check(config.version === '2.8.0' && config.cacheName === 'shpilka-v2.8.0-p1', 'release metadata is stale');
check(index.includes('loadingScreen') && boot.includes('shp28LoadingVisible(true)'), 'loading flow is missing');
check(!index.includes('data-workshop-trigger') && !index.includes('class="control-help"'), 'system controls remain in the main menu');
check(ui.includes('finishMenuButton') && ui.includes('pauseMenuButton'), 'main-menu exits are missing');
check(route.includes("['gravel'") && route.includes("['narrow'") && route.includes("['plaza'"), 'practical route modules are incomplete');
check(route.includes("type === 'speed' ? 0.28 : 0") && route.includes('gapLength'), 'decorative ramp rules remain');
check(physics.includes("fillText('ПРЫЖОК'") && physics.includes("'НЕ ХВАТИЛО СКОРОСТИ'"), 'jump does not communicate a real gap');
check(route.includes('currentLoad') && route.includes('aheadLoad') && route.includes('exitLoad'), 'entry-apex-exit line is missing');
check(ai.includes('pilot: 0.0031') && ai.includes("'late'") && ai.includes("'wide'") && ai.includes("'snap'"), 'contextual mistakes are incomplete');
check(physics.includes('shp28StableTrackHeading') && fixes.includes('shp28StableHighSpeedUpdateCar'), 'high-speed stability is incomplete');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let speed = 0;
let speedAtThree = 0;
for (let frame = 0; frame < 960; frame += 1) {
  const ratio = clamp(speed / 760, 0, 1);
  speed = Math.min(760, speed + lerp(178, 72, smoothstep(0.06, 1, ratio)) / 120);
  if (frame === 359) speedAtThree = speed;
}
check(speedAtThree > 280 && speedAtThree < 570, `three-second acceleration is ${speedAtThree.toFixed(1)}`);
check(speed > 620, `eight-second acceleration is ${speed.toFixed(1)}`);

if (failures.length) {
  console.error('ШПИЛЬКА 2.8 final gate failed:');
  failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}
console.log('ШПИЛЬКА 2.8 final gate passed:', JSON.stringify({ speedAtThree: +speedAtThree.toFixed(1), speedAtEight: +speed.toFixed(1) }));
