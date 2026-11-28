import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const [path,out]=process.argv.slice(2),data=JSON.parse(await readFile(path,'utf8')),trials=data.filter(t=>t.style==='candidate');
assert.equal(trials.length,2);
const avg=a=>a.reduce((n,v)=>n+v,0)/a.length,summary=[];
for(let t of data)for(let c of t.counts){let rows=c.results.filter(v=>v.motion==='zoom');for(let r of rows){let p=r.profile||[];summary.push({style:t.style,trial:t.trial,count:c.count,mode:r.mode,fps:r.fps,drawMs:r.drawMs,groundMs:r.groundMs,geometryMs:avg(p.map(x=>x.geometryMs||0)),positionMs:avg(p.map(x=>x.positionMs||0)),composeMs:avg(p.map(x=>x.composeMs||0)),sortMs:avg(p.map(x=>x.sortMs||0)),drawCalls:avg(p.map(x=>x.drawCalls||0)),prep:c.prep,actual:r.actual,equivalence:c.equivalence.filter(e=>e.mode===r.mode)})}}
let candidates=['batch','scaled','world-row'].map(mode=>{let eligible=trials.every(t=>t.counts.length===3&&t.counts.every(c=>c.sameCounts&&c.equivalence.filter(e=>e.mode===mode).length===5&&c.equivalence.filter(e=>e.mode===mode).every(e=>e.changedPixels<=.05))),delta=trials.map(t=>{let r=t.counts.find(c=>c.count===60).results.filter(r=>r.motion==='zoom');return avg(r.filter(r=>r.mode===mode).map(r=>r.fps))-avg(r.filter(r=>r.mode==='direct').map(r=>r.fps))});return {mode,eligible,delta,mean:avg(delta)}}).filter(x=>x.eligible).sort((a,b)=>b.mean-a.mean);
let best=candidates.find(c=>c.delta.every(x=>x>0)&&c.mean>=.5),selected=best?.mode||'none';
await writeFile(out,JSON.stringify({selected,candidates,summary},null,2));console.error(JSON.stringify({selected,candidates,sixty:summary.filter(x=>x.style==='candidate'&&x.count===60).map(({prep,equivalence,...x})=>x)}));console.log(selected);
