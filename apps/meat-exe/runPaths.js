// MEAT.EXE / v1.8: deterministic organ routes and earned epigenetic memory.
// All effects are real simulation changes; UI is only a projection of this model.
export const ROUTES=Object.freeze([
 Object.freeze({id:'bypass',name:'ТИХИЙ ОБХОД',detail:'На 2 врага меньше · +10 HP · иммунитет −12',cost:'Меньше трофеев и очков',group:'safe',enemies:-2,heal:10,heat:-12,biomass:0,damage:0,hazard:0}),
 Object.freeze({id:'calcified',name:'КОСТЯНОЙ МОСТ',detail:'+3 урона · +8 HP',cost:'На 1 врага больше · иммунитет +9',group:'safe',enemies:1,heal:8,heat:9,biomass:0,damage:3,hazard:0}),
 Object.freeze({id:'rupture',name:'ПРОРЫВ',detail:'+2 биомассы сразу · +140 очков',cost:'+3 врага · иммунитет +24',group:'risk',enemies:3,heal:0,heat:24,biomass:2,damage:0,hazard:0}),
 Object.freeze({id:'necrosis',name:'НЕКРОЗ',detail:'+3 биомассы · +200 очков',cost:'+2 врага · ловушки больнее на 4 HP',group:'risk',enemies:2,heal:0,heat:12,biomass:3,damage:0,hazard:4})
]);
const routeMap=new Map(ROUTES.map(r=>[r.id,r]));
const u32=n=>Number.isInteger(n)&&n>=0&&n<=4294967295;
function hash(seed,wave,salt){
 let x=((seed>>>0)^Math.imul(wave,0x9e3779b1)^Math.imul(salt,0x85ebca6b))>>>0;
 x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);
 return ((x^(x>>>16))>>>0);
}
export function routeOptions(seed,wave){
 const s=u32(seed)?seed:0,w=Math.max(2,Math.min(5,Math.trunc(wave)||2));
 const a=ROUTES[hash(s,w,1)%2],b=ROUTES[2+hash(s,w,2)%2];
 return Object.freeze([a,b]);
}
export function sanitizeRouteHistory(value){
 if(!Array.isArray(value))return [];
 const used=new Set(),result=[];
 for(const item of value){
  if(!item||!Number.isInteger(item.wave)||item.wave<2||item.wave>5||!routeMap.has(item.id)||used.has(item.wave))continue;
  used.add(item.wave);result.push({wave:item.wave,id:item.id});
  if(result.length===4)break;
 }
 return result.sort((a,b)=>a.wave-b.wave);
}
export function applyRoute(state,id,wave){
 const route=routeMap.get(id);
 if(!route||!Number.isInteger(wave)||wave<2||wave>5||state.wave!==wave)return false;
 if((state.routeHistory||[]).some(r=>r.wave===wave))return false;
 const offered=routeOptions(state.seed,wave);
 if(!offered.some(o=>o.id===id))return false;
 state.routeHistory=[...sanitizeRouteHistory(state.routeHistory),{wave,id}];
 state.routeId=id;state.routeWave=wave;state.routeHazard=route.hazard;
 state.toSpawn=Math.max(0,Math.min(40,state.toSpawn+route.enemies));
 state.hp=Math.min(state.maxHp,state.hp+route.heal);
 state.immune.heat=Math.max(0,Math.min(100,(state.immune.heat||0)+route.heat));
 state.biomass=Math.max(0,Math.min(99,(state.biomass||0)+route.biomass));
 state.damageBonus=(state.damageBonus||0)+route.damage;
 if(route.group==='risk')state.score=(state.score||0)+(id==='necrosis'?200:140);
 state.selectedRoute='';
 return true;
}
export const GENES=Object.freeze([
 Object.freeze({id:'ossified',name:'КАЛЬЦИНОЗ',cost:3,description:'+14 к пределу здоровья'}),
 Object.freeze({id:'siphon',name:'ЭКСТРАКТОР',cost:4,description:'+2 биомассы · старт −10 HP'}),
 Object.freeze({id:'nerve',name:'НЕРВНЫЙ РУБЕЦ',cost:6,description:'+5 к урону · иммунитет +14'})
]);
const geneMap=new Map(GENES.map(g=>[g.id,g]));
export function sanitizeArchive(value){
 const v=value&&typeof value==='object'?value:{};
 const unlocked=Array.isArray(v.unlocked)?[...new Set(v.unlocked.filter(id=>geneMap.has(id)))]:[];
 return {echoes:Number.isInteger(v.echoes)?Math.max(0,Math.min(9999,v.echoes)):0,
  unlocked,equipped:unlocked.includes(v.equipped)?v.equipped:null,
  runs:Number.isInteger(v.runs)?Math.max(0,Math.min(99999,v.runs)):0};
}
export function unlockGene(archive,id){
 const g=geneMap.get(id);if(!g)return false;
 if(archive.unlocked.includes(id)||archive.echoes<g.cost)return false;
 archive.echoes-=g.cost;archive.unlocked.push(id);return true;
}
export function equipGene(archive,id){
 if(id!==null&&!archive.unlocked.includes(id))return false;
 archive.equipped=id;return true;
}
export function applyGene(state,id){
 if(!geneMap.has(id))return false;
 if(id==='ossified'){state.maxHp=Math.min(160,state.maxHp+14);state.hp=Math.min(state.maxHp,state.hp+14);}
 if(id==='siphon'){state.hp=Math.max(1,state.hp-10);state.biomass=Math.min(99,state.biomass+2);}
 if(id==='nerve'){state.damageBonus+=5;state.immune.heat=Math.min(100,state.immune.heat+14);}
 state.gene=id;return true;
}
export function earnEchoes(archive,run,victory){
 if(!run||!Number.isFinite(run.elapsed)||run.elapsed<0)return 0;
 const reward=Math.min(16,Math.max(1,Math.trunc(run.wave)||1)+Math.floor(Math.max(0,run.kills||0)/12)+(victory?5:0));
 archive.echoes=Math.min(9999,archive.echoes+reward);
 archive.runs=Math.min(99999,archive.runs+1);
 return reward;
}
