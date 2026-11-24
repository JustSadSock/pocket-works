import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/balance-ui';mkdirSync(output,{recursive:true});
const url='http://127.0.0.1:4189/apps/crown-and-marches/',key='pocket-works:crown-and-marches:campaign:diplomacy-lab';
const server=spawn(process.execPath,['scripts/serve-site.mjs'],{env:{...process.env,PORT:'4189',POCKET_WORKS_SITE_ROOT:process.env.PW_QA_SITE_ROOT||process.cwd()},stdio:'ignore'});
const reports=[];
try{let ready=false;for(let i=0;i<80;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){const browser=await browserType.launch({headless:true});try{const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,reducedMotion:'reduce'});try{
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const tap=(a,v,scope='')=>p.locator(scope+' [data-act="'+a+'"]'+(v==null?'':'[data-value="'+v+'"]')).first().tap();
 const save=async()=>{await tap('menu');await tap('dipsave',null,'#modalbody');const raw=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);await tap('resume');return JSON.parse(raw.state);};
 await p.goto(url,{waitUntil:'domcontentloaded'});await tap('diplab',null,'#modalbody');await p.locator('#dseed').fill('balance-1080');await p.locator('#dhuman').selectOption('0');await p.locator('#dstates').fill('3');await p.locator('#dinitial').selectOption('peace');await tap('dipstart',null,'#modalbody');
 await p.locator('#panel [data-act="dipexport"]').waitFor({state:'visible'});let data=await save();assert.equal(data.sandboxKind,'diplomacy');assert.equal(data.playerFaction,0);
 await tap('dipeditor',1,'#panel');await p.locator('#dkind').selectOption('trade');await tap('dipadd',null,'#modalbody');await p.locator('#dkind').selectOption('aid');await p.locator('#damount').fill('8');await tap('dipadd',null,'#modalbody');await tap('dipsend',null,'#modalbody');
 data=await save();assert.ok(data.politics.offers.some(o=>o.a===0&&o.b===1&&o.clauses.length===2&&o.status==='accepted'));assert.ok(data.politics.contracts.some(t=>t.clauses.some(c=>c.kind==='trade')));assert.ok(data.states[0].budget.diplomacyOut>=8);
 await tap('layer','interests','#panel');await p.screenshot({path:join(output,engine+'-interests.png')});await tap('layer','influence','#panel');await p.screenshot({path:join(output,engine+'-influence.png')});
 await p.reload({waitUntil:'domcontentloaded'});await tap('dipload',null,'#modalbody');data=await save();assert.ok(data.politics.contracts.some(t=>t.clauses.some(c=>c.kind==='trade')));
 await tap('dipterminate',data.politics.contracts.find(t=>t.clauses.some(c=>c.kind==='trade')).id,'#panel');data=await save();assert.ok(data.politics.events.some(e=>e.kind==='breach'));
 await tap('dipplayer',2,'#panel');data=await save();assert.equal(data.playerFaction,2);await tap('dipobserve',null,'#panel');await tap('speed',8);await p.waitForTimeout(1200);await tap('speed',0);data=await save();assert.ok(data.day>0);await p.screenshot({path:join(output,engine+'-council.png')});assert.deepEqual(errors,[]);reports.push({engine,day:data.day,offers:data.politics.offers.length,contracts:data.politics.contracts.length});
 await tap('econexit',null,'#panel');await p.locator('#modalbody [data-act="diplab"]').waitFor({state:'visible'});
 }finally{await context.close();}}finally{await browser.close();}}
}finally{server.kill('SIGTERM');writeFileSync(join(output,'journeys.json'),JSON.stringify(reports,null,2));}
