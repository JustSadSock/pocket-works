import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectAttemptTasks,taskArtifactName} from './attempt-artifacts.mjs';
const keys=['banners-of-war-completion-lab-0','banners-of-war-visual'];
function fixture(fn){const root=mkdtempSync(join(tmpdir(),'qa-attempt-')),input=join(root,'input'),output=join(root,'output');mkdirSync(input);try{fn(input,output);}finally{rmSync(root,{recursive:true,force:true});}}
function put(input,key,attempt){const dir=join(input,taskArtifactName(key,attempt));mkdirSync(dir);writeFileSync(join(dir,'result.json'),JSON.stringify({key,attempt}));}
test('complete attempt is normalized without changing payload bytes',()=>fixture((input,output)=>{
 for(const k of keys)put(input,k,2);
 assert.deepEqual(collectAttemptTasks(input,output,keys,2),{attempt:2,tasks:2});
 assert.deepEqual(readdirSync(output).sort(),keys.map(k=>'qa-'+k).sort());
 assert.deepEqual(JSON.parse(readFileSync(join(output,'qa-'+keys[0],'result.json'))),{key:keys[0],attempt:2});
}));
test('previous summary, previous attempt and unknown task never enter current delivery',()=>{
 for(const extra of ['qa-summary-45917578978','qa-task-1-'+keys[0],'qa-task-2-unknown'])fixture((input,output)=>{
  for(const k of keys)put(input,k,2);mkdirSync(join(input,extra));
  assert.throws(()=>collectAttemptTasks(input,output,keys,2),/Unexpected attempt artifact/);assert.equal(existsSync(output),false);
 });
});
test('partial rerun, duplicate plan, symlink and unsafe names fail closed',()=>{
 fixture((input,output)=>{put(input,keys[0],2);assert.throws(()=>collectAttemptTasks(input,output,keys,2),/Missing current-attempt artifact/);assert.equal(existsSync(output),false);});
 fixture((input,output)=>{assert.throws(()=>collectAttemptTasks(input,output,[keys[0],keys[0]],2),/Invalid expected/);});
 fixture((input,output)=>{put(input,keys[0],2);symlinkSync(join(input,taskArtifactName(keys[0],2)),join(input,taskArtifactName(keys[1],2)));assert.throws(()=>collectAttemptTasks(input,output,keys,2),/Invalid task artifact directory/);});
 for(const x of ['../escape','foo/bar',''])assert.throws(()=>taskArtifactName(x,2));assert.throws(()=>taskArtifactName(keys[0],0));
});
