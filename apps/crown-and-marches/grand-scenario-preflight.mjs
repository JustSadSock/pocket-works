import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {grandCampaign,governmentType,adoption,build,buildPort,fundInstitute,launchExpedition,step,serialize,restore,simulationHash,materialTotals,discoveryContact,beginCampaignCausalityAudit} from './world.mjs';
import {NAV,roles,catalogStarts,selectStarts,capital,seaFrontier,maritimeBlockers,isolation} from './grand-campaign-cases.mjs';
const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/grand-scenario-preflight';
const days=Number(process.argv[2]??360),shard=process.argv[3]==null?null:Number(process.argv[3]);assert.ok(Number.isInteger(days)&&days>=4&&days<=360);assert.ok(shard===null||Number.isInteger(shard)&&roles[shard]);
const catalog=catalogStarts(),selected=selectStarts(catalog),rows=[];
mkdirSync(output,{recursive:true});const save=()=>writeFileSync(join(output,'grand-scenario-preflight-'+(shard??'all')+'.json'),JSON.stringify({schema:2,revision:process.env.GITHUB_SHA??null,days,catalog,selected,rows},null,2));
function snapshot(s){const f=s.playerFaction,st=s.states[f],cs=s.cities.filter(c=>c.f===f),g=s.society.architecture.governments[f],c=capital(s),totals=materialTotals(s);return {day:s.day,realm:st.name,gold:st.gold,tax:st.tax,tariff:st.tariff,budget:{...st.budget},pop:cs.reduce((n,c)=>n+c.pop,0),cash:cs.reduce((n,c)=>n+c.cash,0),cities:cs.map(c=>({id:c.id,name:c.name,pop:c.pop,food:c.stock[9],grain:c.stock[0],wood:c.stock[1],planks:c.stock[10],cloth:c.stock[15],tools:c.stock[12],arms:c.stock[13],foodRatio:c.lastFoodRatio,port:c.port,fort:c.fort,infra:c.infra,build:c.build.slice(),orders:c.orders.length,shipOrders:c.shipOrders.length,knownNavigation:c.knowledge.known[NAV],navigation:adoption(s,c,'coastal-sail'),funding:c.knowledge.funding,institutes:{...c.knowledge.institutes},knowledgeBlockers:{...c.knowledge.blockers}})),government:governmentType(s,f),law:g.law?{...g.law}:null,ruler:g.ruler,heir:g.heir,armies:s.armies.filter(a=>a.f===f).map(a=>({id:a.id,units:a.units.slice(),supply:a.supply})),fleets:s.fleets.filter(v=>v.f===f).length,activeShipments:s.shipments.filter(v=>v.fromFaction===f||v.toFaction===f).length,contacts:s.states.filter(x=>x.id!==f&&discoveryContact(s,f,x.id)).length,charted:s.discovery.charts[f].filter(Boolean).length,activeExpeditions:s.discovery.expeditions.filter(e=>e.f===f).length,wars:s.wars.filter(w=>w.status==='active').length,goodsError:s.ledger.maxGoodsError,moneyError:s.ledger.maxMoneyError,worldMoney:totals.money,isolation:c?isolation(s,c):[],maritimeBlockers:c?maritimeBlockers(s,c):[]};}
for(const [index,role] of roles.entries()){
 if(shard!==null&&index!==shard)continue;const start=selected[role.id];if(!start){rows.push({id:role.id,blocked:'No naturally eligible start'});save();continue;}
 const s=grandCampaign({...start.cfg,worldSize:'standard',states:6,goal:'sandbox',playerFaction:start.playerFaction}),raw=serialize(s),row={id:role.id,title:role.title,chain:role.chain,start,branches:[]};rows.push(row);save();
 for(const label of ['decision','alternative','control']){
  const game=restore(raw),f=game.playerFaction,history=[],actions=[],counts={},cumulative={dispatch:0,delivered:0,lost:0,internationalDispatch:0,internationalDelivered:0,internationalLost:0,deliveredVolume:0,internationalDeliveredVolume:0,expeditionsLaunched:0,expeditionsReturned:0,expeditionsLost:0,contacts:0,refusals:0};let launched=false;
  const off=beginCampaignCausalityAudit(game,e=>{const own=e.f===f||e.a===f||e.b===f||e.from===f||e.to===f||e.kind==='discovery:contact'&&e.detail?.other===f;if(!own)return;history.push(structuredClone(e));counts[e.kind]=(counts[e.kind]||0)+1;if(e.kind.startsWith('shipment-')){const k=e.kind==='shipment-dispatched'?'dispatch':e.kind==='shipment-delivered'?'delivered':'lost';cumulative[k]++;if(e.from!==e.to)cumulative['international'+k[0].toUpperCase()+k.slice(1)]++;if(k==='delivered'){cumulative.deliveredVolume+=e.volume;if(e.from!==e.to)cumulative.internationalDeliveredVolume+=e.volume;}}else if(e.kind==='discovery:expedition')cumulative.expeditionsLaunched++;else if(e.kind==='discovery:returned')cumulative.expeditionsReturned++;else if(e.kind==='discovery:lost')cumulative.expeditionsLost++;else if(e.kind==='discovery:contact')cumulative.contacts++;else if(e.kind.includes('refusal'))cumulative.refusals++;});
  const act=(name,fn)=>{const response=fn(),accepted=/^(Построено|Учреждение основано|Порт построен|Экспедиция отправлена|Реформа принята|Налоговая ставка принята|Пошлина согласована|Субсидия|Набрано|Сформирован|Полк)/.test(String(response));actions.push({day:game.day,name,response,accepted});if(!accepted)cumulative.refusals++;return response;};
  const before=snapshot(game),series=[],checkpoints=[];
  function maritime(){const c=capital(game);if(!c||launched)return;const k=c.knowledge;
   if(game.day===before.day){game.states[f].focus=5;k.funding=.75;actions.push({day:game.day,name:'navigation priority and funding',response:'5 / 0.75',accepted:true});if(!c.build[0]||c.lastFoodRatio<.9)act('mill',()=>build(game,c,0));}
   if(!k.institutes.navigation)act('navigation institute',()=>fundInstitute(game,c,'navigation'));
   if(c.stock[10]<20&&c.build[1]<2&&!c.orders.some(o=>o.kind===1))act('sawmill',()=>build(game,c,1));
   if(c.lastFoodRatio<.85&&c.build[0]<3&&!c.orders.some(o=>o.kind===0))act('mill',()=>build(game,c,0));
   if(!c.port)act('port',()=>buildPort(game,c));
   const blockers=maritimeBlockers(game,c);actions.push({day:game.day,name:'survey readiness',blockers});
   if(!blockers.length){const target=seaFrontier(game,c);launched=act('sea survey',()=>launchExpedition(game,c,target,'sea','survey'))==='Экспедиция отправлена';}
  }
  try{
   if(label==='decision'){if(role.id==='maritime')maritime();else act(role.id,()=>role.action(game,capital(game)));}else if(label==='alternative')act(role.id+' alternative',()=>role.alternative(game,capital(game)));
   const immediate=snapshot(game);
   for(let i=1;i<=days;i++){step(game);assert.ok(Number.isFinite(game.ledger.maxGoodsError)&&game.ledger.maxGoodsError<1e-5,'goods '+role.id);assert.ok(Number.isFinite(game.ledger.maxMoneyError)&&game.ledger.maxMoneyError<1e-5,'money '+role.id);if(label==='decision'&&role.id==='maritime'&&i%40===0&&i<days)maritime();if([60,180,360].includes(i)||i===days){const current=snapshot(game),raw=serialize(game);assert.equal(simulationHash(restore(raw)),simulationHash(game),'save roundtrip '+role.id+' '+i);checkpoints.push({elapsed:i,state:current,cumulative:{...cumulative},counts:{...counts},roundTrip:true});}if(i%20===0||i===days)series.push({state:snapshot(game),cumulative:{...cumulative}});}
   row.branches.push({label,before,immediate,actions,series,checkpoints,history,cumulative,counts,end:snapshot(game)});save();
  }finally{off();}
 }
 console.log('[grand-causality] '+JSON.stringify({id:row.id,start:row.start,branches:row.branches.map(b=>({label:b.label,actions:b.actions,cumulative:b.cumulative,checkpoints:b.checkpoints.map(c=>({elapsed:c.elapsed,pop:c.state.pop,gold:c.state.gold,contacts:c.state.contacts,charted:c.state.charted,cities:c.state.cities,roundTrip:c.roundTrip}))}))}));
}
save();
