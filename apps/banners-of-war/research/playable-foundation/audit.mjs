import {E} from '../../engine.js';
import {chronicles,featuredChronicles,chronicleBrief,createHistorical,historicalScore} from '../../chronicles.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const out=resolve(process.env.BOW_AUDIT_OUTPUT||'quality-artifacts/banners-playable-foundation');
await mkdir(out,{recursive:true});
const summary=[];
await writeFile(out+'/catalog.json',JSON.stringify(chronicles.map(d=>({id:d.id,title:d.title,era:d.era||'medieval',seconds:d.seconds,zones:d.zones.map(z=>z.name),featured:!!featuredChronicles[d.id]})),null,2));
function measure(F,s){return {time:s.time,result:s.result,reason:s.resultReason,score:historicalScore(F,s),sides:[0,1].map(side=>{let a=s.units.filter(u=>u.side===side);return {alive:a.filter(F.alive).length,men:a.reduce((n,u)=>n+u.n,0),power:F.power(s,side),contact:a.filter(u=>u.contact>0).length,rout:a.filter(u=>u.rout).length,meanMorale:a.reduce((n,u)=>n+u.morale,0)/a.length,meanCohesion:a.reduce((n,u)=>n+u.cohesion,0)/a.length,meanFatigue:a.reduce((n,u)=>n+u.fatigue,0)/a.length,causes:a.reduce((r,u)=>{for(let [k,v] of Object.entries(u.causes||{}))if(Number.isFinite(v))r[k]=(r[k]||0)+v;return r},{})}}),intent:s.aiIntent||{}}}
function orders(F,s,approach){
 const own=s.units.filter(u=>u.side===0&&F.alive(u)&&!u.rout),enemy=s.units.filter(u=>u.side===1&&F.alive(u)&&!u.rout),out={};
 if(!enemy.length)return out;
 for(const u of own){
  let nearest=enemy.slice().sort((a,b)=>F.dist(u,a)-F.dist(u,b))[0],spec=F.spec(u);
  let rear=u.type==='guard'||/резерв/i.test(u.historicalName||'');
  if(approach==='hold'||rear&&s.time<180){out[u.id]={kind:spec.range?'shoot':'brace',path:[],...(spec.range?{target:nearest.id}:{})};continue}
  let zone=s.objective.zones.slice().sort((a,b)=>F.dist(u,a)-F.dist(u,b))[0];
  if(approach==='objective'&&!spec.range&&!rear&&F.dist(u,zone)>zone.r*.55&&u.contact===0){out[u.id]={kind:'advance',path:[{x:zone.x,y:F.clamp(zone.y+(u.y-zone.y)*.45,25,F.H-25)}]};continue}
  out[u.id]={kind:spec.range?'shoot':spec.horse?'charge':'attack',target:nearest.id,path:[]};
 }
 return out
}
for(const id of Object.keys(featuredChronicles))for(const side of [0,1])for(const approach of ['observer','hold','objective','direct']){
 const brief=chronicleBrief(id,side);assert(brief&&brief.approaches.length===2);
 let s=createHistorical(E,id,{side,difficulty:'commander',fog:false}),F=E.forState(s),terrain=JSON.stringify(s.terrain),rounds=[],frames=[],initial=F.snapshot(s),started=performance.now();
 for(let i=0;i<Math.ceil(brief.seconds/30)+1&&!s.result;i++){
  const r=F.resolve(s,approach==='observer'?{}:orders(F,s,approach),approach==='observer');
  assert(r.state.time>s.time||r.state.result);
  frames.push(...r.frames.map(f=>({...f,terrain:null})));s=r.state;rounds.push({round:i+1,orders:r.orders,metrics:measure(F,s)});
 }
 assert.equal(JSON.stringify(s.terrain),terrain);
 const entry={id,side,approach,result:s.result,reason:s.resultReason,time:s.time,rounds:rounds.length,final:measure(F,s),runtimeMs:performance.now()-started};
 summary.push(entry);await writeFile(out+'/'+id+'-'+side+'-'+approach+'.json',JSON.stringify({initial,rounds,frames,final:s}));
 await writeFile(out+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(entry));
 if(!s.result)throw Error('No terminal outcome: '+id+' '+side+' '+approach);
}
