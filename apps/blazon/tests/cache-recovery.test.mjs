import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');
const config=JSON.parse(await read('app.config.json'));
const version=config.version;

test('bootstrap owns startup and loads the stability guard last',async()=>{
  const source=await read('bootstrap.js');
  assert.match(source,new RegExp(`const BUILD=['\"]${version.replaceAll('.','\\.')}['\"]`));
  assert.match(source,/import\(`\.\/app\.js\?pw_release=\$\{BUILD\}`\)/);
  const enhancements=source.match(/const enhancements=\[([^\]]+)\]/)?.[1]||'';
  assert.ok(enhancements.includes('stability-runtime.js'));
  assert.ok(enhancements.lastIndexOf('stability-runtime.js')>enhancements.lastIndexOf('release-indicator.js'));
});

test('engine resolves every dynamic module through the current release',async()=>{
  const source=await read('engine.js');
  assert.match(source,new RegExp(`const BUILD=['\"]${version.replaceAll('.','\\.')}['\"]`));
  for(const module of ['spatial-core-engine.js','progression-engine.js','combat-clarity.js'])assert.ok(source.includes(`${module}?pw_release=\${BUILD}`));
});

test('worker never substitutes HTML for missing executable assets',async()=>{
  const source=await read('sw.js');
  assert.match(source,/async function networkFirst\(request,fallback=null\)/);
  assert.match(source,/event\.request\.mode==='navigate'/);
  assert.match(source,/networkFirst\(event\.request,'\.\/index\.html'\)/);
  assert.match(source,/networkFirst\(event\.request\)\);return;/);
  assert.doesNotMatch(source,/networkFirst\(request,fallback='\.\/index\.html'\)/);
});

test('reset preserves campaign storage and verifies fresh executables',async()=>{
  const source=await read('reset.html');
  assert.match(source,/reg\.unregister/);
  assert.match(source,/key\.startsWith\('blazon-'\)/);
  assert.match(source,/fetch\(source\.href,\{cache:'no-store'\}\)/);
  assert.match(source,new RegExp(`BUILD=['\"]${version.replaceAll('.','\\.')}['\"]`));
  assert.doesNotMatch(source,/localStorage\.(?:clear|removeItem)/);
});

test('release indicator forces service worker revalidation',async()=>{
  const source=await read('release-indicator.js');
  assert.match(source,/updateViaCache:'none'/);
  assert.match(source,/await registration\.update\(\)/);
  assert.match(source,new RegExp(`const BUILD=['\"]${version.replaceAll('.','\\.')}['\"]`));
});

test('mandatory campaign dialogs and repeated actions are guarded',async()=>{
  const source=await read('stability-runtime.js');
  for(const id of ['resultDialog','rewardDialog','endingDialog'])assert.ok(source.includes(id));
  assert.match(source,/addEventListener\('cancel',event=>event\.preventDefault\(\)\)/);
  assert.match(source,/stopImmediatePropagation/);
  assert.match(source,/data-close-dialog/);
  assert.match(source,/guardFinishedBattle/);
});

test('banner overlay sleeps outside active battles',async()=>{
  const source=await read('banner-system.js');
  assert.match(source,/function isActive\(\)/);
  assert.match(source,/cancelAnimationFrame\(animation\)/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/pagehide/);
  assert.doesNotMatch(source,/footer\.textContent/);
});
