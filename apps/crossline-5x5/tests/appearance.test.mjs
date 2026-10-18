import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await Promise.all(['index.html','styles.css','app.js','app.config.json','manifest.webmanifest']
  .map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')));
const [html,css,js,configRaw,manifestRaw]=source;
const config=JSON.parse(configRaw),manifest=JSON.parse(manifestRaw);

test('source identity and launcher metadata restored',()=>{
 assert.equal(config.name,'5×5 Arena');
 assert.equal(config.shortName,'5×5');
 assert.equal(manifest.name,'5×5 Arena');
 assert.match(html,/<h1 id="title">5×5 Arena<\/h1>/);
 assert.doesNotMatch(html,/КРОССЛАЙН/);
});
test('source four color buttons keep original screen order',()=>{
 const ids=['solo','openRules','hotseat','online'];
 const positions=ids.map(id=>html.indexOf('id="'+id+'"'));
 assert.ok(positions.every(n=>n>=0));
 assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
 for(const klass of ['solo','rules','local','online'])assert.ok(css.includes('.menu-panel.'+klass));
});
test('original five AI difficulty tiers remain actionable',()=>{
 for(const choice of ['easy','normal','hard','expert','insane']){
  assert.ok(html.includes('data-difficulty-choice="'+choice+'"'));
  assert.ok(html.includes('<option value="'+choice+'">'));
 }
 assert.ok(js.includes("show('difficultyView')"));
 assert.ok(js.includes("localStart('solo')"));
});
test('original game palette and 3x3 action positions are preserved',()=>{
 assert.ok(css.includes('#101426,#05060d'));
 assert.ok(css.includes('.piece.a{background:#0af'));
 assert.ok(css.includes('.piece.b{background:#f40'));
 for(const id of ['attack','shield'])assert.ok(html.includes('id="'+id+'"'));
 for(const direction of ['up','left','right','down'])assert.ok(html.includes('data-dir="'+direction+'"'));
 assert.ok(css.includes('"attack up shield" "left center right" "pad down pad2"'));
});
test('light theme works without changing game protocol',()=>{
 assert.ok(html.includes('id="themeToggle"'));
 assert.ok(css.includes(':root[data-theme=light]'));
 assert.ok(js.includes('document.documentElement.dataset.theme=next'));
 assert.ok(js.includes("write('theme',next)"));
 assert.equal(config.slug,'crossline-5x5');
 assert.ok(js.includes("createRoom('crossline-5x5')"));
});
