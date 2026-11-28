// Controlled paired experiments; the original numbers-lab.mjs remains an archival protocol.
import {E} from '../../pocketnet/banners-engine-v1/engine.js';
import {makeProject,flatTerrain,newTerrain,buildState,prepareTrialProject,metrics,validateScenarioProject} from '../../pocketnet/banners-engine-v1/laboratory.js';

const seeds=[11,47,91], mirrors=[false,true];
const adaptive={version:4,style:'adaptive'}, legacy={version:3,style:'adaptive'}, cautious={version:4,style:'cautious'};
const specs=[
 {factor:'standard-control',suite:'control',a:adaptive,b:adaptive},
 {factor:'legacy-control',suite:'control',a:legacy,b:legacy},
 {factor:'historical-control',suite:'control',a:adaptive,b:adaptive,historical:true},
 {factor:'historical-contact-control',suite:'control',a:adaptive,b:adaptive,historical:true,opening:true},
 {factor:'legacy-modern',suite:'command',a:legacy,b:adaptive,swap:true},
 {factor:'historical-style',suite:'command',a:cautious,b:adaptive,historical:true,swap:true},
 {factor:'historical-style-contact',suite:'command',a:cautious,b:adaptive,historical:true,opening:true,swap:true},
 ...[1.25,1.5,2,3].map(ratio=>({factor:'numbers-'+ratio,suite:'material',a:adaptive,b:adaptive,ratio})),
 ...[1.25,1.5,2,3].map(ratio=>({factor:'numbers-policy-'+ratio,suite:'material',a:adaptive,b:legacy,ratio,swap:true})),
 {factor:'equipment',suite:'material',a:adaptive,b:adaptive,armor:.65},
 {factor:'organization',suite:'material',a:adaptive,b:adaptive,historical:true,organization:'professional'},
 {factor:'ridge-control',suite:'terrain',a:adaptive,b:adaptive,terrain:'ridge'},
 {factor:'ridge-policy',suite:'terrain',a:legacy,b:adaptive,terrain:'ridge',swap:true},
 {factor:'reserve',suite:'tactics',a:adaptive,b:adaptive,tactic:'reserve',swap:true}
];
export function controlCases(suite='all'){
 if(suite!=='all'&&!specs.some(s=>s.suite===suite))throw Error('unknown suite '+suite);
 return specs.filter(s=>suite==='all'||s.suite===suite).flatMap(s=>seeds.flatMap(seed=>mirrors.flatMap(mirror=>(s.swap?[false,true]:[false]).map(swapPolicies=>({
  factor:s.factor,suite:s.suite,seed,mirror,swapPolicies,seconds:240
 })))));
}
export function controlTrial(k){
 const spec=specs.find(s=>s.factor===k.factor);
 if(!spec||!Number.isInteger(k.seed)||!mirrors.includes(k.mirror)||!mirrors.includes(k.swapPolicies)||k.swapPolicies&&!spec.swap)throw Error('invalid control case');
 const p=makeProject({width:1400,height:1200,seed:'Control-'+k.seed});
 p.terrain=flatTerrain(p.width,p.height);
 // Isolate elevation from rivers, vegetation and mud. No invalid water deployments.
 if(spec.terrain){p.terrain.height=newTerrain(p.width,p.height,p.seed,spec.terrain).height;p.terrain.kind='ridge-elevation-only';}
 p.seconds=k.seconds??240;p.fog=true;p.historical=!!spec.historical;p.objective='zones';
 p.zones=[{name:'Common objective',x:p.width/2,y:p.height/2,r:230,weight:1}];
 const policies=k.swapPolicies?[spec.b,spec.a]:[spec.a,spec.b];
 let randomState=k.seed>>>0;const jitter=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return Math.round((randomState/4294967296-.5)*40)/10};
 const offsets=Array.from({length:24},()=>({x:jitter(),y:jitter()}));
 const template={...p.armies[0].units[0],type:'spear',profile:null,n:120,form:'line',cols:16,morale:88,cohesion:100,fatigue:0,ammo:0,customSpec:null};
 for(let side=0;side<2;side++){
  const a=p.armies[side],n=side?Math.round(8*(spec.ratio??1)):8;
  a.commander={name:'Control commander',style:policies[side].style,traits:{}};
  a.organization=side&&spec.organization?spec.organization:'feudal';a.groups={};
  a.units=Array.from({length:n},(_,j)=>{
   const x=p.width/2-55-Math.floor(j/8)*55+offsets[j].x,y=p.height/2+(j%8-3.5)*46+offsets[j].y;
   return {...template,name:'Regiment '+(j+1),group:j%4===3?'Reserve':j%2?'Right':'Left',
    x:side?p.width-x:x,y:side?p.height-y:y,a:side?Math.PI:0,customSpec:side&&spec.armor?{armor:spec.armor}:null};
  });
  a.guard={x:side?p.width/2+240:p.width/2-240,y:p.height/2};
 }
 if(spec.opening||spec.tactic==='reserve'){
  const reserveSide=k.swapPolicies?0:1;
  for(const side of [0,1])for(const group of ['Left','Right','Reserve']){
   const reserve=spec.tactic==='reserve'&&side===reserveSide&&group==='Reserve';
   const groupUnits=p.armies[side].units.filter(u=>u.group===group);
   const y=groupUnits.reduce((sum,u)=>sum+u.y,0)/groupUnits.length;
   const x=reserve?groupUnits[0].x:p.width/2+(side?-70:70);
   p.plans.push({side,group,task:reserve?'reserve':'advance',x,y,wait:0,when:'complete',threshold:30,autonomy:'bounded',phases:[]});
  }
 }
 const q=prepareTrialProject(p,{mirror:k.mirror}), validation=validateScenarioProject(q);
 if(validation.errors.length)throw Error('invalid control scenario: '+validation.errors.join('; '));
 let s=buildState(q),F=E.forState(s);
 s.aiVersionBySide=(k.mirror?[...policies].reverse():policies).map(v=>v.version);
 s.objective.weights={zone:.55,power:.45,absolute:true};
 const referenceSide=k.mirror?1:0,challengerSide=1-referenceSide;
 const initial=[0,1].map(side=>s.units.filter(u=>u.side===side).reduce((n,u)=>n+u.initial,0));
 const initialPositions=s.units.map(u=>[u.id,u.x,u.y,u.initial]);
 const start=metrics(s),maxRounds=Math.ceil(q.seconds/(F.STEPS*F.DT))+1;
 let rounds=0;
 while(!s.result&&rounds<maxRounds){s=F.resolveHeadless(s,{},true).state;rounds++}
 if(!s.result)throw Error('control trial did not finish within its scenario limit');
 const final=metrics(s), sign=referenceSide===0?1:-1, score=final.score*sign;
 const result=s.result==='draw'?'draw':s.result===(referenceSide===0?'win':'loss')?'reference':'challenger';
 return {...k,historical:!!spec.historical,terrain:p.terrain.kind,opening:!!spec.opening,referenceSide,challengerSide,
  referencePolicy:policies[0],challengerPolicy:policies[1],initialReference:initial[referenceSide],initialChallenger:initial[challengerSide],
  ratioActual:initial[challengerSide]/initial[referenceSide],initialPositions,initialScore:start.score*sign,score,result,reason:s.resultReason,
  policyBScore:(k.swapPolicies?score:-score),contact:final.sides.reduce((sum,v)=>sum+v.contacts,0),rounds,time:s.time,
  reference:final.sides[referenceSide],challenger:final.sides[challengerSide],physics:s.physicsVersion};
}
