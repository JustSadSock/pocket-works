import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function file(path){return readFileSync(new URL('../'+path,import.meta.url),'utf8')}
for(const slug of ['meat-exe','ne-tem-golosom']){
 test(slug+' uses exactly one managed update registration and caches its offline dependencies',()=>{
  const root='apps/'+slug+'/';
  const manifest=JSON.parse(file(root+'app.config.json'));
  const html=file(root+'index.html'),worker=file(root+'sw.js');
  assert.match(html,/src=["']\.\.\/\.\.\/shared\/update-manager\.js["'][^>]*data-update-manager/);
  assert.ok(html.includes('data-app-version="'+manifest.version+'"'));
  assert.ok(html.includes('../../shared/update-manager.css'));
  assert.ok(worker.includes("'../../shared/update-manager.js'")&&worker.includes("'../../shared/update-manager.css'"));
  assert.equal(worker.includes("navigator.serviceWorker.register"),false);
  assert.equal(html.includes("navigator.serviceWorker.register"),false);
  if(slug==='ne-tem-golosom')assert.equal(file(root+'app.js').includes("navigator.serviceWorker.register"),false);
  assert.match(worker,/GET_UPDATE_INFO/);
  assert.match(worker,/SKIP_WAITING/);
 });
}
