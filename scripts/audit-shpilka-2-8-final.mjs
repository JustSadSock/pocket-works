import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const failures = [];
const check = (value, message) => { if (!value) failures.push(message); };
const read = (path) => readFile(path, 'utf8');
const [index, app, boot, route, ai, physics, fixes, ui, hotfix, styles, worker, configRaw] = await Promise.all([
  read('apps/shpilka/index.html'), read('apps/shpilka/app.js'), read('apps/shpilka/engine-v2-12.js'),
  read('apps/shpilka/engine-v2-28-route.js'), read('apps/shpilka/engine-v2-28-ai.js'),
  read('apps/shpilka/engine-v2-28-physics.js'), read('apps/shpilka/engine-v2-28-fixes.js'),
  read('apps/shpilka/engine-v2-28-ui.js'), read('apps/shpilka/engine-v2-28-1.js'),
  read('apps/shpilka/systems-28.css'), read('apps/shpilka/sw.js'), read('apps/shpilka/app.config.json')
]);
const config = JSON.parse(configRaw);
const runtimeSources = { route, ai, physics, fixes, ui, '1': hotfix };
for (const [name, source] of Object.entries(runtimeSources)) {
  try { new vm.Script(source, { filename: `engine-v2-28-${name}.js` }); }
  catch (error) { failures.push(`${name} syntax: ${error.message}`); }
  check(app.includes(`engine-v2-28-${name}.js`), `${name} layer is not loaded`);
  check(worker.includes(`engine-v2-28-${name}.js`), `${name} layer is not cached`);
}
check(config.version === '2.8.1' && config.cacheName === 'shpilka-v2.8.1-p1', 'release metadata is stale');
check(index.includes('data-app-version="2.8.1"') && index.includes('app.js?v=2.8.1'), 'HTML release version is stale');
check(index.includes('loadingScreen') && boot.includes('shp28LoadingVisible(true)'), 'loading flow is missing');
check(app.includes('script.async = false') && app.includes('Promise.all(sources.map'), 'engine files are still downloaded serially');
check(app.includes('loadingProgress.textContent') && app.includes('loading-retry') && styles.includes('.loading-retry'), 'loading failure recovery is missing');
check(!index.includes('data-workshop-trigger') && !index.includes('class="control-help"'), 'system controls remain in the main menu');
check(styles.includes('overflow: hidden !important') && styles.includes('repeat(5, minmax(0, 1fr))'), 'main menu can still scroll or overflow');
check(styles.includes('.route-tools,') && styles.includes('.route-code-panel { display: none !important; }'), 'technical route controls remain visible');
check(ui.includes('finishMenuButton') && ui.includes('pauseMenuButton'), 'main-menu exits are missing');
check(boot.includes("restartButtonFinish.addEventListener('click', () => beginRace())"), 'replay still generates a different route');
check(ui.includes("restartButtonFinish.textContent = 'ЕЩЁ РАЗ'"), 'replay action is mislabeled after classification');
check(hotfix.includes('frame = function shp281Frame') && hotfix.includes('finally {\n    requestAnimationFrame(frame);'), 'animation loop can still die after a frame error');
check(hotfix.includes('function shp281TraceTrack') && hotfix.includes('ctx.lineTo(track[index].x'), 'iPhone renderer still depends on Path2D for the track');
check(hotfix.includes('shp281AdvanceCountdownFallback') && hotfix.includes("mode = 'race'"), 'countdown has no recovery path');
check(route.includes("['gravel'") && route.includes("['narrow'") && route.includes("['plaza'"), 'practical route modules are incomplete');
check(fixes.includes('shp28VariedModulePlan') && fixes.includes('ДВОЙНАЯ ШПИЛЬКА') && fixes.includes('АЭРОДРОМ'), 'route module selection is not varied per seed');
check(route.includes("type === 'speed' ? 0.28 : 0") && route.includes('gapLength'), 'decorative ramp rules remain');
check(physics.includes("fillText('ПРЫЖОК'") && physics.includes("'НЕ ХВАТИЛО СКОРОСТИ'"), 'jump does not communicate a real gap');
check(route.includes('currentLoad') && route.includes('aheadLoad') && route.includes('exitLoad'), 'entry-apex-exit line is missing');
check(route.includes('const inside = Math.sign(corner || 1)'), 'racing-line inside direction is inverted');
check(fixes.includes('physicalHalf * 1.28'), 'AI still uses an overly narrow racing envelope');
check(ai.includes('pilot: 0.010') && ai.includes("'late'") && ai.includes("'wide'") && ai.includes("'snap'"), 'contextual mistakes are incomplete');
check(ai.includes("shp28MistakeKind === 'wide') car.shp28MistakeTotal = lerp(0.62, 0.98"), 'wide-exit mistake duration is too weak');
check(ai.includes('? -(Math.sign(preview.signed)'), 'wide-exit mistakes point toward the inside of the corner');
check(fixes.includes('pilot, { brake: 352') || fixes.includes('pilot, { brake: 352 }'), 'AI braking plan does not match heavier vehicle physics');
check(fixes.includes("shp28MistakeKind === 'wide' ? 165") && fixes.includes('strength * pulse * dt'), 'AI mistakes cannot physically reach the shoulder');
check(physics.includes('shp28StableTrackHeading') && fixes.includes('shp28StableHighSpeedUpdateCar'), 'high-speed stability is incomplete');
check(fixes.includes('maximumAcceleration = lerp(145, 62') && fixes.includes('maximumBraking = lerp(450, 330'), 'final weight caps are missing');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dt = 1 / 120;
let speed = 0;
let throttle = 0;
let speedAtThree = 0;
let speedAtSix = 0;
for (let frame = 0; frame < 960; frame += 1) {
  const previous = speed;
  throttle += (1 - throttle) * clamp(dt * 5.8, 0, 1);
  const ratio = clamp(speed / 760, 0, 1);
  speed += (560 - 230 * ratio) * throttle * dt;
  speed -= (0.30 * speed + 0.00068 * speed * Math.abs(speed)) * dt;
  const cappedRatio = clamp(speed / 760, 0, 1);
  const maximumAcceleration = lerp(145, 62, smoothstep(0.06, 1, cappedRatio));
  speed = Math.min(speed, previous + maximumAcceleration * dt);
  if (frame === 359) speedAtThree = speed;
  if (frame === 719) speedAtSix = speed;
}
const terminal = speed;
let brake = 0;
let brakingDistance = 0;
let brakingFrames = 0;
while (speed > 1 && brakingFrames < 480) {
  const previous = speed;
  throttle += (0 - throttle) * clamp(dt * 5.8, 0, 1);
  brake += (1 - brake) * clamp(dt * 9.5, 0, 1);
  const ratio = clamp(speed / 760, 0, 1);
  speed = Math.max(0, speed + ((560 - 230 * ratio) * throttle - 650 * brake) * dt);
  speed -= (0.30 * speed + 0.00068 * speed * Math.abs(speed)) * dt;
  const maximumBraking = lerp(450, 330, smoothstep(0.18, 1, clamp(speed / 760, 0, 1)));
  speed = Math.max(speed, Math.max(0, previous - maximumBraking * dt));
  brakingDistance += speed * dt;
  brakingFrames += 1;
}
const brakingTime = brakingFrames * dt;
check(speedAtThree > 375 && speedAtThree < 405, `three-second acceleration is ${speedAtThree.toFixed(1)}`);
check(speedAtSix > 545 && speedAtSix < 570, `six-second acceleration is ${speedAtSix.toFixed(1)}`);
check(terminal >= speedAtSix && terminal < 580, `practical terminal speed is ${terminal.toFixed(1)}`);
check(brakingTime > 1.22 && brakingTime < 1.52, `full stop takes ${brakingTime.toFixed(2)}s`);
check(brakingDistance > 375 && brakingDistance < 430, `full stop distance is ${brakingDistance.toFixed(1)}`);

if (failures.length) {
  console.error('ШПИЛЬКА 2.8.1 gate failed:');
  failures.forEach((failure) => console.error('-', failure));
  process.exit(1);
}
console.log('ШПИЛЬКА 2.8.1 gate passed:', JSON.stringify({
  speedAtThree: +speedAtThree.toFixed(1), speedAtSix: +speedAtSix.toFixed(1), terminal: +terminal.toFixed(1),
  brakingTime: +brakingTime.toFixed(2), brakingDistance: +brakingDistance.toFixed(1)
}));
