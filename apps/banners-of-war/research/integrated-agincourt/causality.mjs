import {E} from '../../engine.js';
import {createHistorical,historicalScore} from '../../chronicles.js';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.BOW_AUDIT_OUTPUT);await mkdir(out,{recursive:true});
const root=process.env.BOW_OLD_TRACES;
function stats(F,s){return {time:s.time,result:s.result,score:historicalScore(F,s),sides:[0,1].map(i=>{let a=s.units.filter(u=>u.side===i),n=a.length;return {men:a.reduce((v,u)=>v+u.n,0),power:F.power(s,i),ammo:a.reduce((v,u)=>v+(u.ammo||0),0),morale:a.reduce((v,u)=>v+u.morale,0)/n,fatigue:a.reduce((v,u)=>v+u.fatigue,0)/n,cohesion:a.reduce((v,u)=>v+u.cohesion,0)/n,rout:a.filter(u=>u.rout).length,contact:a.filter(u=>u.contact>0).length,causes:a.reduce((v,u)=>{for(let [k,x] of Object.entries(u.causes||{}))if(Number.isFinite(x))v[k]=(v[k]||0)+x;return v},{})}})}}
async function files(dir){let r=[];for(let d of await readdir(dir,{withFileTypes:true})){let p=resolve(dir,d.name);if(d.isDirectory())r.push(...await files(p));else if(d.name.endsWith('.json'))r.push(p)}return r}
if(root){
 let analysis=[];
 for(let p of await files(root)){
  if(!/^agincourt-.*\.json$/.test(p.split('/').at(-1))||p.endsWith('summary.json'))continue;
  let a=JSON.parse(await readFile(p,'utf8'));if(!a.initial||!a.frames?.length||!a.final)continue;
  let F=E.forState(a.initial),units=new Map(),last=null,changes=[],timeline=[];
  for(let f of a.frames){let score=historicalScore(F,f),control=score.zones[0]?.control;if(control!==last){changes.push({time:f.time,control,influence:score.zones[0]?.influence});last=control}
   if(!timeline.length||f.time-timeline.at(-1).time>=30||f.result)timeline.push(stats(F,f));
   for(let u of f.units){let v=units.get(u.id)||{id:u.id,side:u.side,type:u.type,initial:{x:u.x,y:u.y,ammo:u.ammo,n:u.n},firstContact:null,firstRout:null,firstShot:null,peakFatigue:0,minCohesion:100,zoneSeconds:0,orders:{},lastTime:f.time};
    if(u.contact>0&&v.firstContact===null)v.firstContact=f.time;if(u.rout&&v.firstRout===null)v.firstRout=f.time;if(u.ammo<v.initial.ammo&&v.firstShot===null)v.firstShot=f.time;
    v.peakFatigue=Math.max(v.peakFatigue,u.fatigue);v.minCohesion=Math.min(v.minCohesion,u.cohesion);
    let dt=Math.max(0,f.time-v.lastTime),kind=u.order?.kind||'none';v.orders[kind]=(v.orders[kind]||0)+dt;
    if(F.alive(u)&&!u.rout&&F.dist(u,f.objective.zones[0])<f.objective.zones[0].r)v.zoneSeconds+=dt;
    v.lastTime=f.time;v.final={x:u.x,y:u.y,n:u.n,ammo:u.ammo,morale:u.morale,cohesion:u.cohesion,fatigue:u.fatigue,rout:u.rout,causes:u.causes};units.set(u.id,v);
   }
  }
  let entry={file:p.replace(root,''),side:a.initial.historical.indices[0],result:a.final.result,reason:a.final.resultReason,time:a.final.time,changes,timeline,units:[...units.values()]};analysis.push(entry);
  console.log(JSON.stringify({file:entry.file,result:entry.result,reason:entry.reason,changes,own:entry.units.filter(u=>u.side===0).map(u=>({id:u.id,type:u.type,firstShot:u.firstShot,firstContact:u.firstContact,firstRout:u.firstRout,zoneSeconds:u.zoneSeconds,ammo:u.final.ammo}))}));
 }
 assert.equal(analysis.length,20,'Expected 8 earlier and 12 later Agincourt traces');await writeFile(out+'/old-trace-analysis.json',JSON.stringify(analysis,null,2));
}
function plan(F,s,side,policy){
 const own=s.units.filter(u=>u.side===0&&F.alive(u)&&!u.rout),enemy=s.units.filter(u=>u.side===1&&F.alive(u)&&!u.rout),out={},zone=s.objective.zones[0];
 if(policy==='staff')return F.command(s,0);
 if(!enemy.length)return out;
 const nearest=(u,es=enemy)=>es.slice().sort((a,b)=>F.dist(u,a)-F.dist(u,b)||a.id-b.id)[0];
 const brace=(u,a=u.a)=>({kind:'brace',path:[],a});
 const fire=(u,v,face=false)=>({kind:'shoot',path:[],target:v.id,...(face?{a:F.angle(u,v)}:{})});
 const attack=(u,v)=>({kind:F.spec(u).horse?'charge':'attack',path:[],target:v.id});
 const move=(x,y,form,kind='move')=>({kind,form,path:[{x:F.clamp(x,30,F.W-30),y:F.clamp(y,30,F.H-30)}]});
 let foot=own.filter(u=>!F.spec(u).horse&&!F.spec(u).range&&u.type!=='guard').sort((a,b)=>b.x-a.x||a.id-b.id),ranged=own.filter(u=>F.spec(u).range),horses=own.filter(u=>F.spec(u).horse&&u.type!=='guard');
 for(let u of own){let spec=F.spec(u),v=nearest(u),range=spec.range||0;
  // Exact old hold policy; no new facing or geometry. Both sides face +X
  // after createHistorical rotates the historical setup for side 1.
  if(policy==='old-hold'){out[u.id]=range?fire(u,v):{kind:'brace',path:[]};continue}
  if(policy==='old-direct'){let rear=u.type==='guard'||/резерв/i.test(u.historicalName||'');out[u.id]=rear&&s.time<180?range?fire(u,v):{kind:'brace',path:[]}:range?fire(u,v):attack(u,v);continue}
  // Separate change of target/facing from movement; no claim brace stops firing:
  // engine auto-fires all orders except cease/retreat, and explicit shoot never moves.
  if(policy==='aimed-hold'){out[u.id]=range?fire(u,v,true):brace(u,F.angle(u,v));continue}
  if(u.type==='guard'){out[u.id]=brace(u);continue}
  if(!side){
   if(range){
    let idx=ranged.filter(a=>a.y<zone.y=== (u.y<zone.y)).findIndex(a=>a.id===u.id),targetY=zone.y+(u.y<zone.y?-1:1)*(72+idx*26);
    // Move only designated inner-wing archer units into the objective perimeter;
    // all other archers retain their existing line and face real targets.
    if(policy==='zone-anchor'&&idx===0&&u.contact===0&&F.dist(u,zone)>zone.r*.75&&F.dist(u,v)>80){out[u.id]=move(zone.x-65,targetY,'loose');continue}
    out[u.id]=fire(u,v,true);continue;
   }
   if(u.contact){out[u.id]=brace(u,F.angle(u,v));continue}
   if(F.dist(u,zone)>65&&F.dist(u,v)>60){out[u.id]=move(zone.x-18,zone.y+(u.y-zone.y)*.7,'line');continue}
   out[u.id]=brace(u,F.angle(u,v));continue;
  }
  if(range){
    if(F.dist(u,v)<range*.95&&u.ammo>0)out[u.id]=fire(u,v,true);
    else if(u.ammo>0){let a=F.angle(u,v);out[u.id]=move(v.x-Math.cos(a)*range*.72,v.y-Math.sin(a)*range*.72,'loose')}
    else out[u.id]=brace(u);continue;
  }
  if(u.contact){out[u.id]=attack(u,v);continue}
  if(u.fatigue>70&&F.dist(u,v)>85){out[u.id]=brace(u,F.angle(u,v));continue}
  if(spec.horse){
    let wing=horses.indexOf(u)%2?1:-1,y=zone.y+wing*(policy==='concentrated'?125:180),x=zone.x-90;
    if(s.time<120){out[u.id]=brace(u);continue}
    if(Math.abs(u.y-y)>35&&u.x<x){out[u.id]=move(Math.min(x,u.x+70),y,'wedge');continue}
    let target=nearest(u,enemy.filter(e=>F.spec(e).range).length?enemy.filter(e=>F.spec(e).range):enemy);out[u.id]=attack(u,target);continue
  }
  let idx=foot.findIndex(a=>a.id===u.id),wave=Math.floor(idx/3),lane=(idx%3-1)*65;
  let front=foot.filter(a=>a.id!==u.id&&a.x>u.x&&Math.abs(a.y-u.y)<42&&a.x-u.x<75);
  // Wave admission depends on room and first-line contact rather than a shared
  // converging waypoint; preserve actual separate formations.
  if(wave&&s.time<90*wave&&front.length){out[u.id]=brace(u);continue}
  let x=zone.x-45,y=zone.y+lane+(policy==='wide-wave'?(idx%2?25:-25):0);
  if(u.x<x-20&&(Math.abs(u.y-y)>25||F.dist(u,v)>65)){out[u.id]=move(Math.min(x,u.x+70),y,'line','advance');continue}
  out[u.id]=attack(u,v);
 }
 return out;
}
const rows=[];
for(let side of [0,1])for(let policy of side?['old-hold','old-direct','staff','concentrated','wide-wave']:['old-hold','old-direct','staff','aimed-hold','zone-anchor'])for(let ground of [1,.85]){
 let options={side,difficulty:'commander',fog:false,alternative:ground!==1,ground},initial=createHistorical(E,'agincourt',options),F=E.forState(initial),s=initial,rounds=[],frames=[];
 for(let i=0;i<31&&!s.result;i++){let orders=plan(F,s,side,policy),r=F.resolve(s,orders,false);s=r.state;rounds.push({orders,actual:r.orders,stats:stats(F,s)});frames.push(...r.frames.map(f=>({...f,terrain:null})))}
 assert(s.result);assert.equal(JSON.stringify(initial.terrain),JSON.stringify(s.terrain));
 let replay=createHistorical(E,'agincourt',options);for(let r of rounds)replay=F.resolveHeadless(replay,r.orders,false).state;assert.deepEqual(replay,s);
 let item={side,policy,ground,result:s.result,time:s.time,reason:s.resultReason,final:stats(F,s)};rows.push(item);
 await writeFile(out+'/causal-'+side+'-'+policy+'-'+ground+'.json',JSON.stringify({initial,final:s,item,rounds,frames}));await writeFile(out+'/causal-summary.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(item));
}
