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
export const defaultForm=t=>E.types[t].horse?'wedge':E.types[t].range?'loose':t==='pike'?'spears':'line';
export function allowedForms(type){let t=E.types[type];return t.horse?['wedge','line','column','loose']:t.range?['loose','line','column','block']:['line','column','block','shield',...(type==='spear'||type==='pike'?['spears']:[]),'loose']}
export function regiment(a,i){let type=a.roster[i],o=a.overrides?.[i]||{};return {type,size:o.size??a.size,quality:o.quality??a.quality,form:o.form??defaultForm(type)}}
export function regimentCost(r){return Math.round(E.types[r.type].cost*r.size*QUALITIES[r.quality].cost)}
export function armyCost(a){return a.roster.reduce((n,_,i)=>n+regimentCost(regiment(a,i)),0)}
export function validArmy(a){return !!a&&Array.isArray(a.roster)&&a.roster.length>=4&&a.roster.length<=12&&a.roster.every((t,i)=>Object.hasOwn(E.types,t)&&t!=='guard'&&[.75,1,1.25].includes(regiment(a,i).size)&&Object.hasOwn(QUALITIES,regiment(a,i).quality)&&allowedForms(t).includes(regiment(a,i).form))&&armyCost(a)<=BUDGET}
export function armyPopulation(a){return a.roster.reduce((n,t,i)=>n+Math.round(E.types[t].n*regiment(a,i).size),E.types.guard.n)}
function equip(u,r,F){let q=QUALITIES[r.quality],base=E.types[u.type];u.n=u.initial=Math.round(base.n*r.size);u.morale=F.clamp(base.morale+q.morale,1,100);u.form=r.form;u.cols=E.forms[r.form].cols;u.regimentQuality=r.quality;u.regimentSize=r.size;if(r.quality!=='regular')u.customSpec={skill:base.skill*q.skill,discipline:base.discipline*q.discipline}}
export const CAMPAIGN_POOL=160;
export const CAMPAIGN_ROUTES={secure:{name:'Защищённый рубеж',landscape:'dry-ridge',objective:'defend',reward:15,risk:'Умеренный противник; оборонительная задача'},bold:{name:'Дальний рейд',landscape:'forest',objective:'territory',reward:40,risk:'Контроль территории в лесу; противник получает дополнительный полк, если позволяет бюджет'}};
export function campaignOptions(s){let c=s.custom?.campaign,earned=s.result==='win'?(CAMPAIGN_ROUTES[c?.route]?.reward||0):0,resource=(c?.resource??CAMPAIGN_POOL)+earned,men=s.units.filter(u=>u.side===0&&Math.floor(u.n)>=1),missing=men.reduce((n,u)=>n+Math.max(0,(u.campaignCapacity??u.initial)-Math.floor(u.n)),0);return {resource,earned,missing,reinforce:Math.min(80,resource,missing),recruit:resource>=80&&men.filter(u=>u.type!=='guard').length<12,canContinue:men.some(u=>u.type!=='guard')&&E.power(s,0)>=15,routes:CAMPAIGN_ROUTES}}

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
 for(let u of s.units){if(u.type==='guard')continue;equip(u,regiment(config.armies[u.side],u.id%100),F)}
 s.custom={version:2,rules:config.rules??'coordinated',config:JSON.parse(JSON.stringify({...config,seconds})),...(config.campaign?{campaign:{id:config.seed+'|campaign',stage:1,records:[],nextId:1000,resource:CAMPAIGN_POOL,route:null,baseEnemy:JSON.parse(JSON.stringify(config.armies[1]))}}:{})};
 s.aiVersion=4;s.difficulty=config.difficulty;s.fog=!!config.fog;s.objective=customObjective(config.objective,F,seconds);
 if(config.campaign)for(let u of s.units.filter(u=>u.side===0)){u.campaignId='R'+u.id;u.campaignCapacity=u.initial;u.campaignExperience=0}
 F.deployAI(s,1);if(config.observer)F.deployAI(s,0);F.refreshVisibility(s);return s;
}
export function campaignSummary(s){
 if(!s.custom?.campaign||!s.result)throw Error('Нет завершённого кампанийного боя');
 const men=s.units.filter(u=>u.side===0).map(u=>({id:u.campaignId,type:u.type,n:Math.max(0,Math.floor(u.n)),capacity:u.campaignCapacity??u.initial,initial:u.initial,experience:u.campaignExperience??0}));
 return {stage:s.custom.campaign.stage,seed:s.seed,result:s.result,loss:men.reduce((n,u)=>n+u.initial-u.n,0),men};
}
export function nextCampaign(s,decision,route='secure'){
 let c=s.custom?.campaign;if(!c||!s.result||c.stage>=3||!['reinforce','recruit','rest'].includes(decision)||!Object.hasOwn(CAMPAIGN_ROUTES,route))throw Error('Переход недоступен');
 let options=campaignOptions(s);if(!options.canContinue)throw Error('Армия больше не боеспособна; кампания завершена');let record=campaignSummary(s),men=record.men.filter(u=>u.n>0||u.type==='guard').map(u=>({...u})),nextId=c.nextId,resource=options.resource,spent=0,reward=options.earned;
 // One fixed between-battle allocation: 80 replacements or a new 80-man militia.
 if(decision==='reinforce'){let left=Math.min(80,resource);for(let u of men.sort((a,b)=>(a.n/a.capacity)-(b.n/b.capacity)||a.id.localeCompare(b.id))){let n=Math.min(left,Math.max(0,u.capacity-u.n));u.n+=n;left-=n;spent+=n}}
 else if(decision==='recruit'){if(resource<80)throw Error('Недостаточно резерва пополнения');if(men.filter(u=>u.type!=='guard').length>=12)throw Error('Нет места для нового полка');men.push({id:'R'+nextId++,type:'militia',n:80,capacity:80,initial:80,experience:0});spent=80}
 const oldConfig=s.custom.config,config=JSON.parse(JSON.stringify(oldConfig));config.seed=oldConfig.seed.split(' / ')[0]+' / '+(c.stage+1);config.landscape=CAMPAIGN_ROUTES[route].landscape;config.objective=CAMPAIGN_ROUTES[route].objective;config.seconds=360;config.observer=false;if(route==='bold'){let a=config.armies[1];if(a.roster.length<12){let candidate={...a,roster:[...a.roster,'militia']};if(validArmy(candidate))config.armies[1]=candidate}}else{config.armies[1]=JSON.parse(JSON.stringify(s.custom.campaign.baseEnemy||s.custom.config.armies[1]))}
 const troops=men.filter(u=>u.type!=='guard'&&u.n>0);if(!troops.length)throw Error('Армия утратила все полки; кампания завершена');
 // Use normal engine setup, even if a decimated campaign has fewer than four regiments.
 let t=E.create(config.seed,troops.map(u=>u.type),config.armies[1].roster,config.style,config.landscape),F=E.forState(t);
 let blue=t.units.filter(u=>u.side===0),guard=men.find(u=>u.type==='guard');for(let i=0;i<blue.length;i++){let u=blue[i],v=u.type==='guard'?guard:troops[i];u.n=u.initial=v?.n||0;u.campaignId=v?.id||'R-guard';u.campaignCapacity=v?.capacity||E.types.guard.n;let previous=s.units.find(q=>q.campaignId===u.campaignId);u.campaignExperience=Math.min(3,(previous?.campaignExperience||0)+(previous&&previous.n>=1&&!previous.rout&&((previous.causes?.melee||0)>0||(previous.causes?.missiles||0)>0||(E.types[previous.type].ammo||0)>previous.ammo||previous.contact>0)?1:0));if(previous){u.regimentQuality=previous.regimentQuality;u.regimentSize=previous.regimentSize;u.form=previous.form;u.cols=E.forms[u.form].cols;u.morale=F.clamp(E.types[u.type].morale+(QUALITIES[u.regimentQuality]?.morale||0),1,100);if(previous.customSpec)u.customSpec={...previous.customSpec}}if(u.campaignExperience){let base=E.types[u.type],q=QUALITIES[u.regimentQuality]||QUALITIES.regular;u.customSpec={...u.customSpec,skill:base.skill*q.skill*(1+u.campaignExperience*.025),discipline:base.discipline*q.discipline*(1+u.campaignExperience*.02)}}}
 for(let u of t.units.filter(u=>u.side===1&&u.type!=='guard'))equip(u,regiment(config.armies[1],u.id%100),F);
 t.custom={version:2,rules:s.custom.rules??'coordinated',config,campaign:{id:c.id,stage:c.stage+1,records:[...c.records,{...record,decision,route,spent,reward,resourceAfter:resource-spent}],nextId,resource:resource-spent,route,baseEnemy:c.baseEnemy||s.custom.config.armies[1]}};t.aiVersion=4;t.difficulty=config.difficulty;t.fog=config.fog;t.objective=customObjective(config.objective,F,360);F.deployAI(t,1);F.refreshVisibility(t);return t;
}
