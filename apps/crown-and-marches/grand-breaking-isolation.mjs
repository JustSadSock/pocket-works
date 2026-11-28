import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {grandCampaign,serialize,restore,step,simulationHash,beginCampaignCausalityAudit,landSurveyFrontier,launchExpedition,build,buildPort,fundInstitute,procurement,proposeAgreement,politicalRight,discoveryContact,atWar,setDelegation,delegationMode,adoption,RECIPES,BUILD,INSTITUTES,GOODS,neighbors,dist,charted,observedOwner,observedCities,subsidize,pathfind,blockade,seaTradePlan} from './world.mjs';
import {catalogStarts,selectStarts,capital,NAV,seaFrontier,maritimeBlockers,isolation,naturalCoastalStart,knownForwardSite} from './grand-campaign-cases.mjs';
const role=process.argv[2]||'maritime',catalog=catalogStarts(),selected=selectStarts(catalog),start=selected[role];assert.ok(start);
const modes=role==='maritime'?['reserve-first','delegated','port-first','port-first-natural','control-720','natural-control-720']:['land-first','delegated','forward-bases','control-1440','forward-stabilize','mainland-towns','mainland-control-1440'];
// Natural comparison uses only the initial locally administered potential and visible stocks.
const natural=naturalCoastalStart(catalog,start),mainland=catalog.filter(x=>!x.coast&&x.cfg.mapShape==='continents').sort((a,b)=>b.pop+b.gold*2-a.pop-a.gold*2||a.playerFaction-b.playerFaction)[0]??selected['land-power'];
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/grand-isolation';mkdirSync(output,{recursive:true});
const rows=[],base=serialize(grandCampaign({...start.cfg,worldSize:'standard',states:6,goal:'sandbox',playerFaction:start.playerFaction}));
const save=()=>writeFileSync(join(output,'breaking-isolation-'+role+'.json'),JSON.stringify({schema:1,sha:process.env.GITHUB_SHA??null,start,role,rows},null,2));
for(const mode of modes){
 const actualStart=(mode==='port-first-natural'||mode==='natural-control-720')&&natural?natural:mode.startsWith('mainland-')?mainland:start;
 const s=actualStart===start?restore(base):grandCampaign({...actualStart.cfg,worldSize:'standard',states:6,goal:'sandbox',playerFaction:actualStart.playerFaction}),f=s.playerFaction,st=s.states[f],actions=[],own={},global={},volume={own:0,global:0},history=[],samples=[],row={mode,start:actualStart,actions,own,global,volume,history,samples};rows.push(row);
 const off=beginCampaignCausalityAudit(s,e=>{global[e.kind]=(global[e.kind]||0)+1;const belongs=e.f===f||e.a===f||e.b===f||e.from===f||e.to===f||e.kind==='discovery:contact'&&e.detail?.other===f;if(belongs){own[e.kind]=(own[e.kind]||0)+1;history.push(structuredClone(e));}if(e.kind==='shipment-delivered'&&e.from!==e.to){volume.global+=e.volume;global.internationalDelivered=(global.internationalDelivered||0)+1;if(belongs){volume.own+=e.volume;own.internationalDelivered=(own.internationalDelivered||0)+1;}}});
 function snapshot(){const c=capital(s);return {day:s.day,gold:st.gold,stock:c.stock.slice(),reserves:st.reserves.slice(),potential:c.potential.slice(),output:c.output.slice(),input:c.input.slice(),produced:c.metrics.produced.slice(),work:{...c.work},build:c.build.slice(),port:c.port,known:c.knowledge.known.slice(),adopted:c.knowledge.use.slice(),funding:c.knowledge.funding,institutes:{...c.knowledge.institutes},blockers:{...c.knowledge.blockers},foodRatio:c.lastFoodRatio,chart:s.discovery.charts[f].filter(Boolean).length,contacts:s.discovery.contacts[f].map(Boolean),budget:{...st.budget},delegation:Object.fromEntries(['economy','research','ports','supply','labor'].map(k=>[k,delegationMode(s,f,k)])),isolation:isolation(s,c),worldDiscovery:{...s.discovery.stats},own:{...own},global:{...global},volume:{...volume}};}
 function act(name,fn,check){const before=snapshot(),result=fn(),after=snapshot(),accepted=check?check(before,after,result):false;actions.push({day:s.day,name,result,accepted,before:{gold:before.gold,stock:before.stock,reserves:before.reserves},after:{gold:after.gold,stock:after.stock,reserves:after.reserves}});return accepted;}
 const phased=mode.startsWith('port-first'),forward=['forward-bases','forward-stabilize','mainland-towns'].includes(mode),targets=mode==='reserve-first'?[24,12,2]:[16,2,2],goods=[9,10,12];
 function plan(){
  const c=capital(s);if(!c)return;
  // Existing public reserve market: buy only real surplus; release only against cash.
  // Keep grain, planks and tools for production rather than investing all at once.
  if(mode==='delegated'||mode.includes('control-'))return;
  if(phased||forward){openingPlan();return;}
  for(const [i,k] of goods.entries()){const need=targets[i]-st.reserves[k],floor=k===9?Math.max(4,c.demand[k]*2):k===10?8:3;if(need>.01&&c.stock[k]>floor&&st.gold>65){const qty=Math.min(need,c.stock[k]-floor,(st.gold-65)/c.market[k]);if(qty>.05)act('reserve '+GOODS[k],()=>procurement(s,c,k,qty),(a,b)=>b.reserves[k]>a.reserves[k]);}}
  const nav=adoption(s,c,'coastal-sail'),sea=mode==='reserve-first',target=sea?seaFrontier(s,c):landSurveyFrontier(s,c),fee=sea?36:18,ready=target!=null&&(!sea||c.port&&nav>=.5)&&c.pop>=(sea?198:192)&&st.gold>=fee&&goods.every((k,i)=>c.stock[k]+st.reserves[k]>=targets[i])&&!s.discovery.expeditions.some(e=>e.f===f);
  if(ready){for(const [i,k] of goods.entries())if(c.stock[k]<targets[i])act('release '+GOODS[k],()=>procurement(s,c,k,targets[i]-c.stock[k],true),(a,b)=>b.stock[k]>a.stock[k]);if(goods.every((k,i)=>c.stock[k]>=targets[i]))act(sea?'sea-survey':'land-survey',()=>launchExpedition(s,c,target,sea?'sea':'land'),(a,b,r)=>r==='Экспедиция отправлена');}
  // Choose from actual known contacts only. No compelled acceptance or transfers.
  for(const other of s.states){if(other.id===f||!discoveryContact(s,f,other.id)||atWar(s,f,other.id)||politicalRight(s,f,other.id,'trade')||s.politics.offers.some(o=>(o.a===f&&o.b===other.id||o.b===f&&o.a===other.id)&&s.day-o.day<120))continue;act('trade proposal '+other.id,()=>proposeAgreement(s,f,other.id,[{kind:'trade',from:f,to:other.id}],720),(a,b,r)=>r.status==='accepted');}
  // Pay for one feasible bottleneck at a time, using actual inputs and outputs.
  if(s.day%20!==0||st.gold<80||c.stock[10]<4||c.stock[2]<3||c.stock[12]<1)return;
  const needed=(k,level)=>c.build[k]<level&&!c.orders.some(o=>o.kind===k);
  let k=null;if(c.stock[9]+st.reserves[9]<targets[0]&&c.stock[0]>3&&needed(0,3))k=0;
  else if(c.stock[10]+st.reserves[10]<targets[1]+8&&c.stock[1]>3&&needed(1,2))k=1;
  else if(c.stock[12]<4&&c.stock[11]>.65&&needed(3,2))k=3;
  else if(c.stock[11]<4&&c.stock[3]>1&&c.stock[1]>.5&&needed(2,2))k=2;
  else if(sea&&c.stock[15]<3&&c.stock[7]>.8&&needed(6,2))k=6;
  if(k!==null){act('build '+BUILD[k][0],()=>build(s,c,k),(a,b)=>b.build[k]===a.build[k]+1);return;}
  if(sea&&nav<.5){st.focus=5;const spec=INSTITUTES.navigation;
   // Knowledge is not adoption. Avoid draining scarce cloth and tools for a new institution.
   if(!c.knowledge.institutes.navigation&&c.knowledge.known[NAV]<1&&spec[2].every(([g,q])=>c.stock[g]>=q+(g===12?2:0))&&st.gold>=spec[1]+65)act('navigation institute',()=>fundInstitute(s,c,'navigation'),(a,b)=>!!b.institutes.navigation);
  }
  if(sea&&nav>=.5&&!c.port&&c.stock[10]>=8&&c.stock[2]>=6&&c.stock[12]>=2&&st.gold>=71)act('port',()=>buildPort(s,c),(a,b)=>b.port===a.port+1);
 }
 // Privileged distance measurement is report-only; never used to choose a destination.
 function territoryDistance(){const queue=[],seen=new Set();for(const c of s.cities.filter(c=>c.f===f)){queue.push([c.i,0]);seen.add(c.i);}const found={};for(let k=0;k<queue.length;k++){const [i,d]=queue[k],owner=s.owner[i];if(owner>=0&&owner!==f&&found[owner]==null)found[owner]=d;for(const j of neighbors(i))if(!seen.has(j)&&s.map.land[j]){seen.add(j);queue.push([j,d+1]);}}return found;}
 function territoryBoundaryDistance(){const queue=[],seen=new Set();for(let i=0;i<s.owner.length;i++)if(s.owner[i]===f&&s.adminAccess[i]&&s.occ[i]<0&&s.map.land[i]){queue.push([i,0]);seen.add(i);}const found={};for(let k=0;k<queue.length;k++){const [i,d]=queue[k],owner=s.owner[i];if(owner>=0&&owner!==f&&found[owner]==null)found[owner]=d;for(const j of neighbors(i))if(!seen.has(j)&&s.map.land[j]){seen.add(j);queue.push([j,d+1]);}}return found;}
 // Report-only geographic route evidence. Actual commerce has additional treaty, chart, blockade, price and stock gates.
 function foreignRoutes(){const ownCities=s.cities.filter(c=>c.f===f);return s.states.filter(st=>st.id!==f&&!st.defunct).map(other=>{const pairs=ownCities.flatMap(a=>s.cities.filter(b=>b.f===other.id).map(b=>({a,b,d:dist(a.i,b.i)}))).sort((a,b)=>a.d-b.d);const contact=discoveryContact(s,f,other.id),trade=contact&&politicalRight(s,f,other.id,'trade');const routes=pairs.slice(0,3).map(({a,b,d})=>{const land=pathfind(s,a.i,b.i,-1),sea=contact&&trade&&a.port&&b.port?seaTradePlan(s,a,b):null;return {from:a.id,to:b.id,distance:d,geographicLandRoute:land.length||null,chartedLandSteps:land.filter(i=>charted(s,f,i)).length,marketDistanceEligible:d<=(a.port&&b.port?150:85),ports:[a.port,b.port],navigation:[adoption(s,a,'coastal-sail'),adoption(s,b,'coastal-sail')],navalTech:[s.states[a.f].tech[7],s.states[b.f].tech[7]],blockaded:!!(blockade(s,a)||blockade(s,b)),knownSeaRoute:sea?.path.length??null};});return {realm:other.id,contact,trade,war:contact&&atWar(s,f,other.id),routes};});}
 function knownSite(c){const q=[[c.i,0]],seen=new Set([c.i]),options=[],cities=observedCities(s,f);for(let k=0;k<q.length;k++){const [i,d]=q[k];if(d>=10)continue;for(const j of neighbors(i)){if(seen.has(j))continue;seen.add(j);if(!charted(s,f,j)||!s.map.land[j])continue;const owner=observedOwner(s,f,j);if(owner>=0&&owner!==f)continue;q.push([j,d+1]);if(owner===-1&&dist(c.i,j)>=7&&cities.every(x=>dist(x.i,j)>=7)&&s.map.fert[j]>.35)options.push({i:j,d:d+1,fert:s.map.fert[j]});}}return options.sort((a,b)=>b.d-a.d||b.fert-a.fert||a.i-b.i)[0]?.i;}
 function settlementReport(c){return {id:c.id,name:c.name,i:c.i,pop:c.pop,cash:c.cash,wealth:c.wealth,foodRatio:c.lastFoodRatio,specialization:c.specialization,infra:c.infra,port:c.port,build:c.build.slice(),colony:c.colony?structuredClone(c.colony):null,stock:c.stock.slice(),potential:c.potential.slice(),output:c.output.slice(),input:c.input.slice(),produced:c.metrics.produced.slice(),tradeIn:c.tradeIn.slice(),tradeOut:c.tradeOut.slice()};}
 function reconcileShipments(){const dispatched=new Map(history.filter(e=>e.kind==='shipment-dispatched').map(e=>[e.id,e])),terminal=new Map(history.filter(e=>['shipment-delivered','shipment-lost'].includes(e.kind)).map(e=>[e.id,e])),pending=new Map(s.shipments.filter(sh=>sh.fromFaction===f||sh.toFaction===f).map(sh=>[sh.id,sh]));const unresolved=[],inTransit=[],lost=[];for(const [id,e] of dispatched){const done=terminal.get(id),sh=pending.get(id);if(done?.kind==='shipment-lost')lost.push(done);else if(!done&&sh)inTransit.push({id,dispatchDay:e.day,from:sh.from,to:sh.to,wait:sh.wait,remaining:sh.path?.length-sh.index,goods:sh.goods.slice()});else if(!done)unresolved.push(e);}return {dispatched:dispatched.size,delivered:[...terminal.values()].filter(e=>e.kind==='shipment-delivered').length,lost,inTransit,unresolved};}
 function openingPlan(){
  const cities=s.cities.filter(c=>c.f===f&&c.occupation<0),home=capital(s);
  const release=(c,k,q)=>{const need=Math.min(st.reserves[k],Math.max(0,q-c.stock[k]));if(need<.01)return;if(c.cash<need*c.market[k]&&st.gold>=need*c.market[k]+45)act('paid market subsidy '+c.id,()=>subsidize(s,c,need*c.market[k]),(a,b)=>b.gold<a.gold);act('paid release '+GOODS[k]+' '+c.id,()=>procurement(s,c,k,need,true),(a,b,r)=>r.startsWith('Перемещено'));};
  const reserve=(c,k,q,floor)=>{const qty=Math.min(Math.max(0,q-st.reserves[k]),Math.max(0,c.stock[k]-floor),Math.max(0,st.gold-80)/c.market[k]);if(qty>.05)act('reserve '+GOODS[k]+' '+c.id,()=>procurement(s,c,k,qty),(a,b,r)=>r.startsWith('Перемещено'));};
  const provision=(c,needs)=>{for(const [k,q] of needs)release(c,k,q);return needs.every(([k,q])=>c.stock[k]>=q);};
  for(const other of s.states){if(other.id===f||!discoveryContact(s,f,other.id)||atWar(s,f,other.id)||politicalRight(s,f,other.id,'trade')||s.politics.offers.some(o=>(o.a===f&&o.b===other.id||o.b===f&&o.a===other.id)&&s.day-o.day<120))continue;act('trade proposal '+other.id,()=>proposeAgreement(s,f,other.id,[{kind:'trade',from:f,to:other.id}],720),(a,b,r)=>r.status==='accepted');}
  if(phased){
   // Port before stockpiling expedition tools; navigation adoption is needed for sailing, not building.
   if(!home.port){if(st.gold>=35&&provision(home,[[10,8],[2,6],[12,2]]))act('port first',()=>buildPort(s,home),(a,b)=>b.port===a.port+1);}
   else{for(const [k,q,floor] of [[9,24,Math.max(4,home.demand[9]*2)],[10,12,8],[12,2,2]])reserve(home,k,q,floor);}
   st.focus=5;
   const target=seaFrontier(s,home);if(home.port&&adoption(s,home,'coastal-sail')>=.5&&home.pop>=198&&st.gold>=36&&target!=null&&!s.discovery.expeditions.some(e=>e.f===f)&&provision(home,[[9,24],[10,12],[12,2]]))act('sea-survey',()=>launchExpedition(s,home,target,'sea'),(a,b,r)=>r==='Экспедиция отправлена');
  }else if(!(mode==='forward-stabilize'&&s.day>=720)&&!s.discovery.expeditions.some(e=>e.f===f)){
   // Use only charted traversable sites and own settlement state. Prefer a funded new forward base, otherwise scout from any supplied settlement.
   const sources=cities.slice().sort((a,b)=>(b.colony?.founded??0)-(a.colony?.founded??0)||a.id-b.id);
   for(const c of sources){const site=knownSite(c),towns=mode==='mainland-towns',purpose=towns?'colony':'factor';if(site!=null&&c.pop>=(towns?400:270)&&st.gold>=(towns?130:55)&&provision(c,[[9,55],[10,10],[12,3]])){if(act('forward '+purpose+' '+c.id,()=>launchExpedition(s,c,site,'land',purpose),(a,b,r)=>r==='Экспедиция отправлена'))break;}const target=landSurveyFrontier(s,c);if(target!=null&&c.pop>=192&&st.gold>=18&&provision(c,[[9,16],[10,2],[12,2]])){if(act('land-survey '+c.id,()=>launchExpedition(s,c,target,'land'),(a,b,r)=>r==='Экспедиция отправлена'))break;}}
  }
  if(s.day%20!==0||st.gold<80)return;
  for(const c of cities){const needed=(k,level)=>c.build[k]<level&&!c.orders.some(o=>o.kind===k);let k=null;
   if(c.stock[9]<(forward?55:24)&&c.stock[0]>3&&needed(0,3))k=0;
   else if(c.stock[10]<16&&c.stock[1]>3&&needed(1,2))k=1;
   else if(c.stock[12]<4&&c.stock[11]>.65&&needed(3,2))k=3;
   else if(c.stock[11]<4&&c.stock[3]>1&&c.stock[1]>.5&&needed(2,2))k=2;
   else if(phased&&c.stock[15]<3&&c.stock[7]>.8&&needed(6,2))k=6;
   if(k!==null&&c.stock[10]>=4&&c.stock[2]>=3&&c.stock[12]>=1){act('build '+BUILD[k][0]+' '+c.id,()=>build(s,c,k),(a,b,r)=>typeof r==='string'&&!r.includes('Недостаточно')&&!r.includes('недоступ'));break;}
  }
 }
 try{
  row.initialTerritoryDistance=territoryDistance();row.initialBoundaryDistance=territoryBoundaryDistance();
  samples.push(snapshot());if(mode==='delegated'){for(const domain of ['research','ports'])assert.ok(setDelegation(s,f,domain,'auto'));actions.push({day:s.day,name:'delegate ports and research',accepted:true});}else if(mode==='reserve-first'||phased){st.focus=5;capital(s).knowledge.funding=.25;actions.push({day:s.day,name:'navigation priority, low funding during provisioning',accepted:true});}
  plan();const duration=['forward-stabilize','mainland-towns'].includes(mode)||mode.endsWith('control-1440')?1440:phased||forward||mode.endsWith('control-720')?720:360;for(let d=1;d<=duration;d++){step(s);assert.ok(s.ledger.maxGoodsError<1e-5&&s.ledger.maxMoneyError<1e-5);if(d%4===0)plan();if(d%20===0||[60,180,360].includes(d))samples.push(snapshot());if([360,720,1080,1440].includes(d)){(row.realmCheckpoints??=[]).push({day:s.day,treasury:st.gold,settlements:s.cities.filter(c=>c.f===f).map(settlementReport),shipments:reconcileShipments(),territoryDistance:territoryDistance(),boundaryDistance:territoryBoundaryDistance()});}if([60,180,360,720,1080,1440].includes(d))assert.equal(simulationHash(restore(serialize(s))),simulationHash(s));}
  row.goal={landSurvey:history.some(e=>e.kind==='discovery:expedition'&&e.detail.kind==='land'),seaSurvey:history.some(e=>e.kind==='discovery:expedition'&&e.detail.kind==='sea'),contact:(own['discovery:contact']||0)>0,tradeRight:s.states.some(q=>q.id!==f&&politicalRight(s,f,q.id,'trade')),internationalDelivery:(own.internationalDelivered||0)>0};row.final=snapshot();row.finalTerritoryDistance=territoryDistance();row.finalBoundaryDistance=territoryBoundaryDistance();row.foreignRoutes=foreignRoutes();row.settlements=s.cities.filter(c=>c.f===f).map(settlementReport);row.shipmentReconciliation=reconcileShipments();row.returnedSea=s.discovery.archive.filter(e=>e.f===f&&e.kind==='sea'&&e.status==='returned').length;save();console.log('[breaking-isolation] '+JSON.stringify({role,mode,goal:row.goal,own,global,volume,final:row.final}));
 }finally{off();}
}
