import {chromium,webkit} from 'playwright';
import {studioServer} from './studio.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const dir=process.env.CHARACTER_DEMO_DIR,out=process.argv[2];mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
if(!manifest.diagnosticOnly||manifest.productionAllowed||!manifest.walkPathUnchanged)throw Error('Invalid demo admission');
const server=studioServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
const results=[];
try{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const b=await engine.launch();try{const p=await b.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
 await p.goto(url);await p.waitForFunction(()=>window.studioReady===true);await p.locator('#demoPreset').selectOption('walk');
 await p.waitForFunction(()=>JSON.parse(document.querySelector('#metrics').textContent).profile==='walk');
 const before=await p.locator('#view').innerHTML();await p.locator('#phase').fill('50');const after=await p.locator('#view').innerHTML();if(before===after)throw Error('Walk preview did not change');
 await p.screenshot({path:join(out,name+'-full-body.png')});await p.selectOption('#closeup','head');await p.screenshot({path:join(out,name+'-face.png')});await p.selectOption('#closeup','');
 const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#exportModel')]);const walk=join(out,name+'-walk.glb');await dl.saveAs(walk);if(sha(readFileSync(walk))!==manifest.walkGlbSha256)throw Error('Browser export differs from exact GLB');
 await p.selectOption('#demoPreset','hand');await p.waitForFunction(()=>JSON.parse(document.querySelector('#metrics').textContent).profile==='hand');await p.locator('#phase').fill('100');await p.selectOption('#closeup','hands');await p.screenshot({path:join(out,name+'-hands.png')});
 const [hd]=await Promise.all([p.waitForEvent('download'),p.click('#exportModel')]);const hand=join(out,name+'-hand.glb');await hd.saveAs(hand);if(sha(readFileSync(hand))!==manifest.handGlbSha256)throw Error('Hand GLB export differs');
 if(await p.locator('#error').textContent())throw Error('Studio error');
 results.push({browser:name,previewChanged:true,exactWalkExport:true,exactHandExport:true,productionAllowed:false});
 }finally{await b.close()}
}}finally{server.close()}
writeFileSync(join(out,'studio-demonstrator-test.json'),JSON.stringify(results,null,2));
