import {E} from './engine.js';
import {chronicles,createHistorical,historicalScore,zoneStatus} from './chronicles.js';
import {cases,trial} from './commander-lab.mjs';
export const MATRIX_VERSION="chronicles-completion-v1";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),sum=(a,f)=>a.reduce((n,v)=>n+f(v),0);
function rng(seed){let n=seed>>>0;return ()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296)}
export function originalCases(){return Array.from({length:42},(_,batch)=>cases(batch).flatMap(k=>[k,{...k,mirror:!k.mirror}])).flat()}
export function extraCases(){let out=[];for(let i=0;i<12;i++){let base={seed:"Completion independent "+i,arch:["valley","ridge","marsh","plain"][i%4],profile:["defensive","maneuver","adaptive","cautious"][i%4],difficulty:"commander",opponentProfile:"adaptive",opponentDifficulty:"commander",fog:i%2===0,objective:i%2?"territory":"power",roster:i%3,opponent:(i+1)%3,seconds:i<4?900:360,mirror:false,matched:false};
 for(let depth of [1,2,3])out.push({...base,depth,opponentDepth:2,variant:"new",experiment:"depth"});
 for(let difficulty of ["commander","grandmaster"])for(let mirror of [false,true])out.push({...base,difficulty,mirror,variant:"new",experiment:"level"});
 }return out}
export function historicalCases(){return chronicles.flatMap((d,index)=>["A","B","C","D","E"].flatMap(series=>Array.from({length:10},(_,seed)=>({id:d.id,series,seed:index*100+seed,repeat:seed,seconds:seed<2?d.seconds:seed<6?360:120}))))}
function perturb(s,seed){let r=rng(seed+771);for(let u of s.units){let original={x:u.x,y:u.y};u.x=clamp(u.x+(r()-.5)*5,15,E.W-15);u.y=clamp(u.y+(r()-.5)*5,15,E.H-15);if(s.units.some(v=>v!==u&&E.overlap(u,v))){u.x=original.x;u.y=original.y}}}
function inspired(s,side,orders,round,series){let mine=s.units.filter(u=>u.side===side&&E.alive(u)&&!u.rout),foes=s.units.filter(u=>u.side!==side&&E.alive(u)&&!u.rout&&E.visible(s,side,u)),defender=s.historical.id==="hastings"&&side===0||s.historical.id==="agincourt"&&side===0||s.historical.id==="bannockburn"&&side===0;
 if(round>3)return orders;for(let u of mine){if(u.type==="guard")continue;let t=E.spec(u),near=foes.slice().sort((a,b)=>E.dist(u,a)-E.dist(u,b)||a.id-b.id)[0];if(!near)continue;
 if(defender&&!t.horse&&!t.range)orders[u.id]={kind:"brace",path:[],a:E.angle(u,near)};
 else if(t.range&&E.dist(u,near)<t.range*.9)orders[u.id]={kind:"shoot",target:near.id,path:[],a:E.angle(u,near)};
 else if(!defender&&!t.range&&E.dist(u,near)<100)orders[u.id]={kind:t.horse?"charge":"attack",target:near.id,path:[],a:E.angle(u,near)};
 }return orders}
export function historicalTrial(k){
 let alt=k.series==="D",ground=alt?[.7,1.25,1,.85,1.15][k.repeat%5]:1,s=createHistorical(E,k.id,{alternative:alt,ground,reserve:alt&&k.repeat%2===0,fatigue:alt?(k.repeat%4)*15:0,difficulty:"commander"});
 s.seed=k.id+"-completion-"+k.seed;s.objective.seconds=k.seconds;perturb(s,k.seed);
 if(k.series==="C")s.styleBySide=[["aggressive","defensive","maneuver","cautious","methodical"][k.repeat%5],["defensive","maneuver","cautious","aggressive","adaptive"][k.repeat%5]];
 if(alt)for(let u of s.units.filter(u=>u.side===k.repeat%2))u.ammo=Math.max(0,Math.round(u.ammo*[.5,1,.75,1.25][k.repeat%4]));
 if(k.series==="E"&&k.repeat%2===0){s.terrain={...s.terrain,height:s.terrain.height.map(()=>4),moisture:s.terrain.moisture.map(()=>.24),canopy:s.terrain.canopy.map(()=>0),hasRiver:false,stakes:[]}}
 const initial=s.historical.counts,trajectory=[],stats=()=>({time:s.time,power:[0,1].map(i=>E.power(s,i)/E.total(s,i)),loss:[0,1].map(i=>sum(s.units.filter(u=>u.side===i),u=>u.initial-u.n)),cohesion:[0,1].map(i=>sum(s.units.filter(u=>u.side===i),u=>u.cohesion)/s.units.filter(u=>u.side===i).length),fatigue:[0,1].map(i=>sum(s.units.filter(u=>u.side===i),u=>u.fatigue)/s.units.filter(u=>u.side===i).length),ammo:sum(s.units,u=>u.ammo),contacts:sum(s.units,u=>u.contact||0),routs:s.units.filter(u=>u.rout||u.escaped).length,crowding:sum(s.units,u=>u.causes?.crowding||0),missileLoss:sum(s.units,u=>u.causes?.missiles||0),cavalryPower:sum(s.units.filter(u=>E.spec(u).horse&&E.alive(u)&&!u.rout),u=>u.n*u.cohesion/100),zones:zoneStatus(E,s).map(q=>q.control),score:historicalScore(E,s).score});
 let plannerMs=0,physicsMs=0;
 while(!s.result&&s.time<k.seconds){let t=Date.now(),a=E.command(s,0),b=E.command(s,1);s.aiIntent={0:a.intent,1:b.intent};if(k.series==="A"){inspired(s,0,a,s.round,k.series);inspired(s,1,b,s.round,k.series)}plannerMs+=Date.now()-t;E.prepare(s,{...a,...b});t=Date.now();for(let j=0;j<E.STEPS&&!s.result&&s.time<k.seconds;j++)E.step(s);physicsMs+=Date.now()-t;trajectory.push({...stats(),postures:[a.intent.posture,b.intent.posture],reserve:[a.intent.committed,b.intent.committed]});s.round++}
 return {...k,initial,terrain:k.series==="E"&&k.repeat%2===0?"flat-control":k.id,ground,final:stats(),result:s.result,plannerMs,physicsMs,trajectory}
}
export function performanceCase(n){let left=Math.floor(n/2)-1,right=n-left-2,roster=count=>Array.from({length:count},(_,i)=>["spear","sword","archer","knight"][i%4]),s=E.create("Performance "+n,roster(left),roster(right),"adaptive","valley");s.aiVersion=4;s.difficulty="commander";for(let side of [0,1]){let units=s.units.filter(u=>u.side===side);units.forEach((u,i)=>{u.x=(side?880:520)+(side?1:-1)*Math.floor(i/14)*63;u.y=60+(i%14)*60;u.a=side?Math.PI:0})}
 let t=Date.now(),a=E.command(s,0),b=E.command(s,1),plannerMs=Date.now()-t;E.prepare(s,{...a,...b});t=Date.now();for(let i=0;i<40;i++)E.step(s);let physicsMs=Date.now()-t;return {units:s.units.length,seconds:s.time,plannerMs,physicsMs,snapshotChars:JSON.stringify(E.snapshot(s)).length}}
export function runCase(kind,k){if(kind==="historical")return historicalTrial(k);if(kind==="performance")return performanceCase(k);return trial(k,k.variant||"compare")}
