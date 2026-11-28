// Product preparation only: natural Grand Campaign starts, paired decisions,
// no sandbox grants, no fabricated activity targets. Run from repository root.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {grandCampaign,governmentType,coastal,adoption,build,buildPort,orderShip,recruit,subsidize,setTaxLaw,setTariffLaw,proposeConstitution,step,serialize,restore,simulationHash,materialTotals,discoveryContact} from './world.mjs';

const output=process.env.PW_QA_OUTPUT_DIR||'qa-artifacts/grand-scenario-preflight';
const seeds=[{seed:'grand-six-paths-173',mapShape:'continents'},{seed:'grand-six-paths-271',mapShape:'straits'},{seed:'grand-six-paths-419',mapShape:'archipelago'}];
const roles=[
 {id:'agrarian',title:'Аграрное государство',eligible:x=>x.fert>.54,score:x=>x.fert*1000+x.pop/100,action:(s,c)=>build(s,c,0),alternative:(s,c)=>build(s,c,'road'),chain:'зерно → мельница/логистика → еда, население, налоги'},
 {id:'merchant',title:'Торговая республика',eligible:x=>x.government==='merchant'&&x.coast,score:x=>x.contacts*100+x.gold,action:(s,c)=>setTariffLaw(s,c.f,Math.max(0,s.states[c.f].tariff-.04)),alternative:(s,c)=>build(s,c,'road'),chain:'торговые институты → пошлина или дорога → цены, перевозки, казна'},
 {id:'land-power',title:'Сухопутная держава',eligible:x=>!x.coast,score:x=>x.pop+x.gold*2+x.arms*10,action:(s,c)=>recruit(s,c,0),alternative:(s,c)=>build(s,c,'fort'),chain:'население и оружие → набор или укрепление → снабжение, безопасность, рабочая сила'},
 {id:'maritime',title:'Морская держава',eligible:x=>x.coast&&x.navigation>=.5,score:x=>x.gold+x.pop/10+x.navigation*200,action:(s,c)=>c.port?orderShip(s,c,1):buildPort(s,c),alternative:(s,c)=>build(s,c,1),chain:'доски, камень, инструменты → порт/флот либо лесопилка → ресурсы для экспедиций'},
 {id:'political',title:'Политическая и династическая трансформация',eligible:x=>['feudal','estates','central','aristocratic'].includes(x.government),score:x=>x.government==='feudal'?1000+x.gold:x.gold,action:(s,c)=>proposeConstitution(s,c.f,governmentType(s,c.f)==='central'?'estates':'central'),alternative:(s,c)=>setTaxLaw(s,c.f,Math.max(.05,s.states[c.f].tax-.04)),chain:'сословная поддержка → реформа либо налоговый компромисс → легитимность и бюджет'},
 {id:'survival',title:'Выживание слабой державы',eligible:x=>true,score:x=>-x.pop-x.gold*2-x.food*2,action:(s,c)=>build(s,c,'fort'),alternative:(s,c)=>subsidize(s,c,12),chain:'ограниченные средства → защита либо поддержка хозяйств → устойчивость и альтернативная стоимость'}
];
const catalog=[];
for(const cfg of seeds){
 const s=grandCampaign({...cfg,worldSize:'standard',states:6,goal:'sandbox'});
 for(const st of s.states){const c=s.cities.find(x=>x.f===st.id&&x.capital)??s.cities.find(x=>x.f===st.id);if(!c)continue;catalog.push({cfg,playerFaction:st.id,realm:st.name,city:c.name,cell:c.i,pop:c.pop,gold:st.gold,fert:s.map.fert[c.i],coast:coastal(s,c),government:governmentType(s,st.id),navigation:adoption(s,c,'coastal-sail'),arms:c.stock[13],food:c.stock[9],contacts:s.states.filter(x=>x.id!==st.id&&discoveryContact(s,st.id,x.id)).length});}
}
const snapshot=s=>{const f=s.playerFaction,st=s.states[f],cs=s.cities.filter(c=>c.f===f),g=s.society.architecture.governments[f],totals=materialTotals(s);return {day:s.day,realm:st.name,gold:st.gold,tax:st.tax,tariff:st.tariff,pop:cs.reduce((n,c)=>n+c.pop,0),cash:cs.reduce((n,c)=>n+c.cash,0),cities:cs.map(c=>({id:c.id,name:c.name,pop:c.pop,food:c.stock[9],grain:c.stock[0],tools:c.stock[12],arms:c.stock[13],foodRatio:c.lastFoodRatio,port:c.port,fort:c.fort,infra:c.infra,build:c.build.slice(),orders:c.orders.length,shipOrders:c.shipOrders.length})),government:governmentType(s,f),law:g.law??null,ruler:g.ruler,heir:g.heir,armies:s.armies.filter(a=>a.f===f).map(a=>({id:a.id,units:a.units.slice(),supply:a.supply})),fleets:s.fleets.filter(v=>v.f===f).length,shipments:s.shipments.filter(v=>v.f===f||cs.some(c=>v.from===c.id||v.to===c.id)).length,contacts:s.states.filter(x=>x.id!==f&&discoveryContact(s,f,x.id)).length,expeditions:s.discovery.expeditions.filter(e=>e.f===f).length,wars:s.wars.filter(w=>w.status==='active').length,goodsError:s.ledger.maxGoodsError,moneyError:s.ledger.maxMoneyError,worldMoney:totals.money};};
const rows=[],used=new Set(),days=Number(process.argv[2]??60);assert.ok(Number.isInteger(days)&&days>=4&&days<=360,'4–360 days');
mkdirSync(output,{recursive:true});
const save=()=>writeFileSync(join(output,'grand-scenario-preflight.json'),JSON.stringify({schema:1,revision:process.env.GITHUB_SHA??null,days,catalog,rows},null,2));
for(const role of roles){
 const choices=catalog.filter(x=>role.eligible(x)&&!used.has(x.cfg.seed+':'+x.playerFaction)).sort((a,b)=>role.score(b)-role.score(a));
 const start=choices[0];if(!start){rows.push({id:role.id,title:role.title,blocked:'No naturally eligible start in catalog'});save();continue;}
 used.add(start.cfg.seed+':'+start.playerFaction);
 const s=grandCampaign({...start.cfg,worldSize:'standard',states:6,goal:'sandbox',playerFaction:start.playerFaction});
 const raw=serialize(s),row={id:role.id,title:role.title,chain:role.chain,start,branches:[]};rows.push(row);save();
 for(const [label,act] of [['decision',role.action],['alternative',role.alternative]]){
  const game=restore(raw),c=game.cities.find(x=>x.f===game.playerFaction&&x.capital)??game.cities.find(x=>x.f===game.playerFaction);
  const before=snapshot(game),response=act(game,c),immediate=snapshot(game),changed=JSON.stringify(before)!==JSON.stringify(immediate),series=[];
  for(let i=0;i<days;i++){step(game);assert.ok(Number.isFinite(game.ledger.maxGoodsError)&&game.ledger.maxGoodsError<1e-5,'goods conservation '+role.id);assert.ok(Number.isFinite(game.ledger.maxMoneyError)&&game.ledger.maxMoneyError<1e-5,'money conservation '+role.id);if((i+1)%12===0||i===days-1)series.push(snapshot(game));}
  const end=snapshot(game),serialized=serialize(game),copy=restore(serialized);assert.equal(simulationHash(copy),simulationHash(game),'save roundtrip '+role.id);
  row.branches.push({label,response,changed,before,immediate,series,end,roundTrip:true});save();
 }
 console.log('[grand-scenario-preflight] '+JSON.stringify({id:row.id,start:row.start,branches:row.branches.map(b=>({label:b.label,response:b.response,changed:b.changed,end:b.end}))}));
}
save();
