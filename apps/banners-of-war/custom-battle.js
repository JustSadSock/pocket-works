import {E} from './engine.js';
export const BUDGET=1500;
export const PRESETS=Object.freeze({
 balanced:['spear','spear','sword','pike','archer','crossbow','knight','lightHorse'],
 infantry:['spear','spear','pike','pike','sword','sword','crossbow','militia','archer'],
 mounted:['knight','knight','lightHorse','horseArcher','horseArcher','spear','archer'],
 levy:['militia','militia','militia','militia','militia','spear','spear','archer','archer','crossbow'],
 compact:['spear','sword','archer','lightHorse']
});
export const QUALITIES={regular:{cost:1,skill:1,discipline:1,morale:0},levy:{cost:.8,skill:.85,discipline:.85,morale:-8},veteran:{cost:1.3,skill:1.15,discipline:1.12,morale:6}};
export function armyCost(a){return a.roster.reduce((n,type)=>n+Math.round(E.types[type].cost*a.size*QUALITIES[a.quality].cost),0)}
export function validArmy(a){return !!a&&Array.isArray(a.roster)&&a.roster.length>=4&&a.roster.length<=12&&a.roster.every(t=>Object.hasOwn(E.types,t)&&t!=='guard')&&[.75,1,1.25].includes(a.size)&&Object.hasOwn(QUALITIES,a.quality)&&armyCost(a)<=BUDGET}
export function armyPopulation(a){return a.roster.reduce((n,t)=>n+Math.round(E.types[t].n*a.size),E.types.guard.n)}
export function customObjective(kind,F,seconds){
 const zone=(x,y,r,name)=>({x,y,r,name,weight:1});
 if(kind==='defend')return {kind:'zones',seconds,weights:{zone:.7,power:.3},zones:[zone(F.W*.32,F.H*.5,145,'Обороняемый рубеж')]};
 if(kind==='breakthrough')return {kind:'zones',seconds,weights:{zone:.7,power:.3},zones:[zone(F.W*.72,F.H*.5,145,'Рубеж прорыва')]};
 if(kind==='territory')return {kind:'territory',seconds};
 return {kind:'power',seconds};
}
export function createCustom(config){
 if(!config.armies?.every(validArmy)||config.armies.length!==2)throw Error('Состав армии вне лимитов');
 if(!Object.hasOwn(E.landscapes,config.landscape)||!['battle','time','territory','defend','breakthrough'].includes(config.objective))throw Error('Неизвестные условия боя');
 let seconds=[360,900,1800].includes(config.seconds)?config.seconds:360;
 let s=E.create(config.seed.trim().slice(0,80)||'Greyford',config.armies[0].roster,config.armies[1].roster,config.style,config.landscape),F=E.forState(s);
 for(let u of s.units){if(u.type==='guard')continue;let a=config.armies[u.side],q=QUALITIES[a.quality],base=E.types[u.type];u.n=u.initial=Math.round(base.n*a.size);u.morale=F.clamp(base.morale+q.morale,1,100);if(a.quality!=='regular')u.customSpec={skill:base.skill*q.skill,discipline:base.discipline*q.discipline}}
 s.custom={version:1,config:JSON.parse(JSON.stringify({...config,seconds})),...(config.campaign?{campaign:{id:config.seed+'|campaign',stage:1,records:[],nextId:1000}}:{})};
 s.aiVersion=4;s.difficulty=config.difficulty;s.fog=!!config.fog;s.objective=customObjective(config.objective,F,seconds);
 if(config.campaign)for(let u of s.units.filter(u=>u.side===0)){u.campaignId='R'+u.id;u.campaignCapacity=u.initial}
 F.deployAI(s,1);if(config.observer)F.deployAI(s,0);F.refreshVisibility(s);return s;
}
export function campaignSummary(s){
 if(!s.custom?.campaign||!s.result)throw Error('Нет завершённого кампанийного боя');
 const men=s.units.filter(u=>u.side===0).map(u=>({id:u.campaignId,type:u.type,n:Math.max(0,Math.floor(u.n)),capacity:u.campaignCapacity??u.initial,initial:u.initial}));
 return {stage:s.custom.campaign.stage,seed:s.seed,result:s.result,loss:men.reduce((n,u)=>n+u.initial-u.n,0),men};
}
export function nextCampaign(s,decision){
 let c=s.custom?.campaign;if(!c||!s.result||c.stage>=3||!['reinforce','recruit'].includes(decision))throw Error('Переход недоступен');
 let record=campaignSummary(s),men=record.men.filter(u=>u.n>0||u.type==='guard').map(u=>({...u})),nextId=c.nextId;
 // One fixed between-battle allocation: 80 replacements or a new 80-man militia.
 if(decision==='reinforce'){let left=80;for(let u of men.sort((a,b)=>(a.n/a.capacity)-(b.n/b.capacity)||a.id.localeCompare(b.id))){let n=Math.min(left,Math.max(0,u.capacity-u.n));u.n+=n;left-=n}}
 else {if(men.filter(u=>u.type!=='guard').length>=12)throw Error('Нет места для нового полка');men.push({id:'R'+nextId++,type:'militia',n:80,capacity:80,initial:80})}
 const oldConfig=s.custom.config,config=JSON.parse(JSON.stringify(oldConfig));config.seed=oldConfig.seed.split(' / ')[0]+' / '+(c.stage+1);config.landscape=c.stage===1?'ridge':'marsh';config.objective=c.stage===1?'defend':'breakthrough';config.seconds=360;config.observer=false;
 const troops=men.filter(u=>u.type!=='guard'&&u.n>0);if(!troops.length)throw Error('Армия утратила все полки; кампания завершена');
 // Use normal engine setup, even if a decimated campaign has fewer than four regiments.
 let t=E.create(config.seed,troops.map(u=>u.type),config.armies[1].roster,config.style,config.landscape),F=E.forState(t);
 let blue=t.units.filter(u=>u.side===0),guard=men.find(u=>u.type==='guard');for(let i=0;i<blue.length;i++){let u=blue[i],v=u.type==='guard'?guard:troops[i];u.n=u.initial=v?.n||0;u.campaignId=v?.id||'R-guard';u.campaignCapacity=v?.capacity||E.types.guard.n;let previous=s.units.find(q=>q.campaignId===u.campaignId);if(previous?.customSpec)u.customSpec={...previous.customSpec}}
 for(let u of t.units.filter(u=>u.side===1&&u.type!=='guard')){let a=config.armies[1],q=QUALITIES[a.quality],base=E.types[u.type];u.n=u.initial=Math.round(base.n*a.size);u.morale=F.clamp(base.morale+q.morale,1,100);if(a.quality!=='regular')u.customSpec={skill:base.skill*q.skill,discipline:base.discipline*q.discipline}}
 t.custom={version:1,config,campaign:{id:c.id,stage:c.stage+1,records:[...c.records,{...record,decision}],nextId}};t.aiVersion=4;t.difficulty=config.difficulty;t.fog=config.fog;t.objective=customObjective(config.objective,F,360);F.deployAI(t,1);F.refreshVisibility(t);return t;
}
