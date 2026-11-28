import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import assert from 'node:assert/strict';
const [source,out]=process.argv.slice(2);await mkdir(out,{recursive:true});
async function all(dir){let r=[];for(let x of await readdir(dir,{withFileTypes:true})){let p=resolve(dir,x.name);if(x.isDirectory())r.push(...await all(p));else r.push(p)}return r}
const files=await all(source),rows=[];
for(let path of files.filter(p=>/chromium-side1-(candidate|schematic)\.json$/.test(p))){let a=JSON.parse(await readFile(path,'utf8')),rounds=a.rounds;if(!rounds?.length)continue;let width=rounds[0].state.bounds?.width||1400,plan=0,compute=0,playback=0,repeat=0,changed=0,last={},firstLoss=null,firstContact=null;
 for(let q of rounds){let t=q.timing;assert(Number.isFinite(t.planMs)&&Number.isFinite(t.playbackMs)&&Number.isFinite(t.computeMs));plan+=t.planMs;compute+=t.computeMs;playback+=t.playbackMs;if(firstLoss===null&&q.state.units.some(u=>u.initial-u.n>.01))firstLoss=q.round;if(firstContact===null&&q.state.units.some(u=>u.contact>0))firstContact=q.round;for(let [id,o] of Object.entries(q.order.orders)){let key=JSON.stringify([o.kind,o.target,o.path]);if(last[id]===key)repeat++;else changed++;last[id]=key}}
 rows.push({width,view:basename(path).includes('candidate')?'candidate':'schematic',rounds:rounds.length,firstLossRoundEnd:firstLoss,firstContactRoundEnd:firstContact,automatedPlanMs:plan,computeAndConfirmMs:compute,playbackMs:playback,firstRoundSpeed:rounds[0].timing.speed,firstRoundPlaybackMs:rounds[0].timing.playbackMs,changedOrderPayloads:changed,identicalOrderPayloads:repeat,result:rounds.at(-1).state.result})}
assert.equal(rows.length,4);assert(rows.every(r=>r.firstRoundSpeed===2));await writeFile(out+'/native-rhythm.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({nativeRhythm:rows}));
for(let path of files.filter(p=>/stage-[12]-(before|after)-(candidate|schematic|tactical60)\.png$/.test(p))){let group=path.includes('offensive')?'offensive':'conservative';await mkdir(out+'/'+group,{recursive:true});await copyFile(path,out+'/'+group+'/'+basename(path))}
