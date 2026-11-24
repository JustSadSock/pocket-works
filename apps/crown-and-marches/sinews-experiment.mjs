import {campaignSandbox,step,warSnapshot,economicSnapshot,simulationHash,serialize,restore,operationEstimate,safeRoute,strength} from './world.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const group=Number(process.argv[2]||0),out=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/sinews';
mkdirSync(out,{recursive:true});
const results=[],doctrines=['aggressive','defensive','maneuver','logistics'];
const base={states:2,population:1200,stockScale:2,regiments:3,fort:1};
const scenarios=[];
for(let i=group*4+1;i<=group*4+4;i++)scenarios.push({kind:'annual',days:360,config:{...base,seed:'sinews-trial-'+i,doctrine:i%2?'aggressive':'defensive'}});
for(let i=group*2+1;i<=group*2+2;i++)scenarios.push({kind:'triennial',days:1080,config:{...base,seed:'sinews-three-'+i,doctrine:doctrines[(i-1)%4],unitType:i%3===0?2:0,spacing:10+i%8}});
scenarios.push({kind:'decade',days:3600,config:{...base,states:4,seed:'sinews-decade-'+(group+1),doctrine:doctrines[group%4],regiments:2,population:1400,stockScale:2,cityLimit:3}});
for(let i=group*3;i<Math.min(12,group*3+3);i++){const pair=[doctrines[i%4],doctrines[(i+1+Math.floor(i/4))%4]],config={...base,seed:'sinews-pair-'+i,spacing:8+i%6*2,fort:i%3,unitType:i%2?2:0};for(const doctrine of pair)scenarios.push({kind:'paired',pair:i,days:360,config:{...config,doctrines:[doctrine,'balanced']}});}
const pct=(a,p)=>{const q=a.slice().sort((a,b)=>a-b);return q[Math.floor((q.length-1)*p)]||0;};
const sum=(a,k)=>a.reduce((n,q)=>n+(q[k]||0),0);
for(const spec of scenarios){
 const s=campaignSandbox(spec.config),initial=economicSnapshot(s),warInitial=warSnapshot(s),samples=[{war:warInitial,economy:initial,heap:process.memoryUsage().heapUsed}],times=[],routes=[],plans=[],start=performance.now();
 for(let d=0;d<spec.days;d++){
  const t=performance.now();step(s);times.push(performance.now()-t);
  if(s.day%120===0&&s.armies.length&&s.cities.length>1){const a=s.armies.find(a=>a.fleet==null);const c=a&&s.cities.find(c=>c.f!==a.f);if(c){let t=performance.now();safeRoute(s,a,c.i);routes.push(performance.now()-t);t=performance.now();operationEstimate(s,a,c.i);plans.push(performance.now()-t);}}
  if(s.day%360===0){if(global.gc)global.gc();samples.push({war:warSnapshot(s),economy:economicSnapshot(s),heap:process.memoryUsage().heapUsed});}
 }
 assert.equal(s.day,spec.days);assert.ok(s.ledger.maxGoodsError<1e-6&&s.ledger.maxMoneyError<1e-6);
 const beforeSave=performance.now(),json=serialize(s),saveMs=performance.now()-beforeSave,beforeRestore=performance.now(),copy=restore(json),loadMs=performance.now()-beforeRestore;assert.equal(simulationHash(copy),simulationHash(s));
 const final=warSnapshot(s),econ=economicSnapshot(s);
 const report={...spec,initial:warInitial,final,econ,samples,hash:simulationHash(s),perf:{wallMs:performance.now()-start,meanStep:times.reduce((a,b)=>a+b,0)/times.length,stepP95:pct(times,.95),stepP99:pct(times,.99),routeP95:pct(routes,.95),estimateP95:pct(plans,.95),saveMs,loadMs,saveBytes:Buffer.byteLength(json),gcAvailable:!!global.gc}};
 results.push(report);writeFileSync(join(out,'sinews-'+group+'.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({kind:spec.kind,pair:spec.pair,seed:spec.config.seed,doctrines:spec.config.doctrines||[spec.config.doctrine],days:s.day,initialSoldiers:warInitial.soldiers,battles:final.battles,sieges:final.sieges,peace:final.peace,active:final.wars.filter(w=>w.status==='active').length,warEnds:final.wars.map(w=>({start:w.start,end:w.end,terms:w.terms,gained:w.gained?.length||0})),mobilized:final.mobilized,losses:final.losses,shortage:final.shortageDays,service:final.service,initialPopulation:initial.population,population:econ.population,treasury:final.treasury,foodDemand:sum(econ.roles.map(c=>c.metrics),'foodDemand'),foodMet:sum(econ.roles.map(c=>c.metrics),'foodMet'),toolDemand:sum(econ.roles.map(c=>c.metrics),'toolDemand'),toolMet:sum(econ.roles.map(c=>c.metrics),'toolMet'),produced:econ.roles.reduce((a,c)=>a.map((q,k)=>q+c.metrics.produced[k]),Array(17).fill(0)),crisis:econ.roles.reduce((n,c)=>n+c.crisisDays,0),goodsError:s.ledger.maxGoodsError,moneyError:s.ledger.maxMoneyError,perf:report.perf}));
}
