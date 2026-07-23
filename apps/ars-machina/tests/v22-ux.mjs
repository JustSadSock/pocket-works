import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [app, index, configText, sw, ux, css] = await Promise.all([
  readFile(new URL('app.js', root), 'utf8'),
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('app.config.json', root), 'utf8'),
  readFile(new URL('sw.js', root), 'utf8'),
  readFile(new URL('engine/part-22.txt', root), 'utf8'),
  readFile(new URL('ux-v22.css', root), 'utf8')
]);
const config = JSON.parse(configText);

assert.match(app, /'\.\/engine\/part-22\.txt'/, '2.2 runtime layer must load');
assert.match(app, /'\.\/ux-v22\.css'/, '2.2 styles must load');
assert.match(app, /APP_VERSION = '2\.2\.0'/, 'assembled runtime must receive the 2.2 version');
assert.match(index, /data-app-version="2\.2\.0"/);
assert.equal(config.version, '2.2.0');
assert.equal(config.cacheName, 'ars-machina-v2.2.0-p1');
assert.match(sw, /const APP_VERSION = '2\.2\.0'/);
assert.match(sw, /'\.\/engine\/part-22\.txt'/);
assert.match(sw, /'\.\/ux-v22\.css'/);

for (const feature of [
  'installPartsDrawerV22',
  'drawCompatibleTargetsV22',
  'showContextToolsV22',
  'evaluateGuideV22',
  'installRunLabV22',
  'installVisionLayersV22'
]) assert.match(ux, new RegExp(`function ${feature}\\(`), `${feature} must be implemented`);

assert.match(ux, /baseSimulateUxV22\(16\.6667\)/, 'single-step must invoke exactly one simulation frame');
assert.match(ux, /runAccumulatorV22 \+= Math\.min\(50, dt\) \* runSpeedV22/, 'speed control must scale real simulation time');
assert.match(ux, /while \(runAccumulatorV22 >= quantum && steps < 6\)/, 'scaled time must be consumed as stable fixed substeps');
assert.match(ux, /returnToBuild\(\);\s*enterRunMode\(\);/, 'restart must restore the original blueprint before a new run');
assert.match(ux, /TOOL_PURPOSES_V22/, 'search must understand tool purposes, not only literal names');
assert.match(ux, /CONTEXT_TOOLS_V22/, 'contextual construction mappings must be declarative');
assert.match(ux, /VISION_LAYERS_V22/, 'diagnostics must expose independent layers');

assert.match(css, /\.context-tools-v22/);
assert.match(css, /\.run-lab-v22/);
assert.match(css, /prefers-reduced-motion/);

console.log('ARS MACHINA 2.2 UX tests passed');
