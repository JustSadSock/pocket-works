import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(dir, file), 'utf8');
const required = ['app.config.json','index.html','styles.css','app.js','engine.js','scene.js','game.js','audio.js','config.js','manifest.webmanifest','sw.js','README.md','icons/icon.svg'];
for (const file of required) assert.ok(fs.existsSync(path.join(dir,file)), `missing ${file}`);

const config = JSON.parse(read('app.config.json'));
assert.equal(config.slug, 'bastion-bolt');
assert.equal(config.orientation, 'portrait');
assert.equal(config.runtime, 'quick');
assert.match(config.cacheName, /^bastion-bolt-/);
assert.match(config.storageNamespace, /^pocket-works:bastion-bolt/);

const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.orientation, 'portrait');
assert.equal(manifest.scope, './');
assert.equal(manifest.start_url, './');

const html = read('index.html');
const app = read('app.js');
const engine = read('engine.js');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), `missing DOM id ${match[1]}`);
for (const file of ['./styles.css','./app.js','./manifest.webmanifest','./icons/icon.svg']) assert.ok(html.includes(file), `index missing ${file}`);
assert.ok(html.includes('viewport-fit=cover'));
assert.ok(html.includes('maximum-scale=1'));
assert.ok(!/https?:\/\//.test(html + app + engine), 'external runtime URL found');

const imported = app.match(/import\s*\{([^}]*)\}\s*from '\.\/engine\.js'/)?.[1]
  ?.split(',').map(value => value.trim()).filter(Boolean) ?? [];
for (const name of imported) assert.match(engine, new RegExp(`export (?:const|function|class) ${name}\\b`), `engine export missing: ${name}`);

const sw = read('sw.js');
for (const file of ['./','./index.html','./styles.css','./app.js','./engine.js','./scene.js','./game.js','./audio.js','./config.js','./manifest.webmanifest','./icons/icon.svg']) assert.ok(sw.includes(`'${file}'`), `service worker missing ${file}`);

const power = 74, angle = 19 * Math.PI / 180, speed = 25 + power * .31;
let position = [0, 4.35, 12.9], velocity = [0, Math.sin(angle) * speed, -Math.cos(angle) * speed], time = 0;
while (time < 8 && position[2] > -82 && position[1] > 0) {
  const dt = .025; velocity[1] -= 9.81 * dt;
  position = position.map((value,index) => value + velocity[index] * dt); time += dt;
}
assert.ok(position[2] <= -82, 'default shot never reaches castle');
assert.ok(position[1] > 8 && position[1] < 22, `default castle height is implausible: ${position[1]}`);

console.log('bastion-bolt static contract: ok');
