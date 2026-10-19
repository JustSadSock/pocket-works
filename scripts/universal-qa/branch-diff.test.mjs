import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {changedApps} from './plan.mjs';
import {changedFromGit} from '../validate-visual-direction.mjs';
const scopeScript=fileURLToPath(new URL('../validate-change-scope.mjs',import.meta.url));
test('divergent target commits are excluded from QA, creative changes and app scope',()=>{
 const fixture=mkdtempSync(path.join(tmpdir(),'pocket-branch-diff-'));const git=(...args)=>execFileSync('git',args,{cwd:fixture,encoding:'utf8'}).trim();const put=(f,s)=>{mkdirSync(path.dirname(path.join(fixture,f)),{recursive:true});writeFileSync(path.join(fixture,f),s);};const commit=()=>{git('add','.');git('commit','-m','fixture');return git('rev-parse','HEAD');};const old=process.cwd();
 try{git('init','-b','main');git('config','user.name','QA fixture');git('config','user.email','qa@example.invalid');put('apps/base/index.html','base');commit();git('checkout','-b','feature');put('apps/restored/index.html','restored');const head=commit();git('checkout','main');put('apps/unrelated/index.html','unrelated app shipped after fork');const base=commit();
 assert.deepEqual(changedApps(fixture,base,head),['restored']);process.chdir(fixture);assert.deepEqual(changedFromGit(base,head),['apps/restored/index.html']);process.chdir(old);
 let r=spawnSync(process.execPath,[scopeScript],{cwd:fixture,encoding:'utf8',env:{...process.env,BASE_SHA:base,HEAD_SHA:head,ALLOW_PLATFORM_CHANGES:'false'}});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/isolated to apps\/restored\//);
 git('checkout','feature');put('shared/unowned.js','not allowed in an app PR');const mixed=commit();r=spawnSync(process.execPath,[scopeScript],{cwd:fixture,encoding:'utf8',env:{...process.env,BASE_SHA:base,HEAD_SHA:mixed,ALLOW_PLATFORM_CHANGES:'false'}});assert.equal(r.status,1);assert.match(r.stderr,/shared\/unowned.js is outside/);
 }finally{process.chdir(old);assert.equal(path.dirname(fixture),tmpdir());assert.ok(path.basename(fixture).startsWith('pocket-branch-diff-'));rmSync(fixture,{recursive:true,force:true});}
});
