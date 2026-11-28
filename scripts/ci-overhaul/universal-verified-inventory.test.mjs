import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {classifyTask,inventory} from './universal-verified-inventory.mjs';
import {approvedTask} from './universal-cross-commit.mjs';
test('classification is advisory, install/browser and unapproved suites stay fresh',()=>{
 const t=approvedTask('press');assert.equal(classifyTask(t),'shadow-pilot');
 assert.equal(classifyTask({...t,install:true}),'fresh-install-dependent');
 assert.equal(classifyTask({...t,kind:'playwright'}),'fresh-browser-or-visual');
 assert.equal(classifyTask({...t,suite:'other'}),'candidate-needs-audit');
 assert.equal(classifyTask({app:'banners-of-war',suite:'completion-lab',key:'banners-of-war-completion-lab-0',kind:'node',seed:0,install:false}),'existing-specialized-banners');
});
test('inventory records planner errors and never grants authorization',()=>{
 const root=mkdtempSync(join(tmpdir(),'pw-inventory-'));try{
  for(const app of ['press','bad']){const dir=join(root,'apps',app);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'app.config.json'),'{}');writeFileSync(join(dir,'qa.plan.json'),app==='bad'?'{}':JSON.stringify({schema:1,suites:[{id:'zip-regression',kind:'node-test',files:['zip.test.mjs']}]}));writeFileSync(join(dir,'zip.test.mjs'),'');}
  const r=inventory(root);assert.equal(r.apps,2);assert.equal(r.plannedApps,1);assert.equal(r.errors[0].app,'bad');assert.equal(r.tasks,1);assert.equal(r.rows[0].tasks[0].productionAuthorization,false);assert.equal(r.allowResultReuse,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
