import * as core from './engine.js?core=4.3.0';

export const VERSION=5;
export const BATTLE_COUNT=core.BATTLE_COUNT;
export const WORLD_WIDTH=core.WORLD_WIDTH;
export const WORLD_HEIGHT=core.WORLD_HEIGHT;
export const TINCTURES=core.TINCTURES;
export const FIELDS=core.FIELDS;
export const ORDINARIES=core.ORDINARIES;
export const MAINS=core.MAINS;
export const SECONDARIES=core.SECONDARIES;
export const COMMANDS=core.COMMANDS;
export const MOTTOS=core.MOTTOS;
export const SCHOOLS={
  imperial:{id:'imperial',name:'Имперская школа',summary:'Осевая и торжественная композиция.',principle:'identity'},
  civic:{id:'civic',name:'Городская школа',summary:'Строгая геометрия и повторяющийся ритм.',principle:'identity'},
  knightly:{id:'knightly',name:'Рыцарская школа',summary:'Крупная героическая фигура и турнирный наклон.',principle:'identity'},
  northern:{id:'northern',name:'Северная школа',summary:'Узкий щит, пустоты и суровая вертикаль.',principle:'identity'}
};
export const EVOLUTIONS={
  'lion-bifurcated':{id:'lion-bifurcated',main:'lion',name:'Лев двухвостый',summary:'Две пары отрядов давят две разные слабые цели и не сбиваются в одну толпу.',principle:'pressure'},
  'lion-crowned':{id:'lion-crowned',main:'lion',name:'Лев коронованный',summary:'Разрушение общей цели собирает охотников и переносит их давление дальше.',principle:'cohesion'},
  'lion-regardant':{id:'lion-regardant',main:'lion',name:'Лев обращённый',summary:'Крайний отряд следит за тылом и перехватывает глубокий прорыв.',principle:'recovery'},
  'boar-armed':{id:'boar-armed',main:'boar',name:'Вепрь вооружённый',summary:'Первый отряд в проломе врезается тяжёлым толчком и расшатывает ряд.',principle:'breach'},
  'boar-coupled':{id:'boar-coupled',main:'boar',name:'Сцепленные вепри',summary:'Соседний отряд следует за первым прорывом и удерживает коридор.',principle:'cohesion'},
  'boar-blooded':{id:'boar-blooded',main:'boar',name:'Вепрь окровавленный',summary:'Прорыв ждёт первой потери строя, затем в разрыв идут все уцелевшие.',principle:'reserve'},
  'tower-gate':{id:'tower-gate',main:'tower',name:'Башня с вратами',summary:'Пересечение опорного участка возвращает отряду порядок.',principle:'recovery'},
  'tower-triple':{id:'tower-triple',main:'tower',name:'Три башни',summary:'Армия сохраняет три независимых опорных участка.',principle:'cohesion'},
  'tower-burning':{id:'tower-burning',main:'tower',name:'Горящая башня',summary:'Падение закреплённого участка вызывает немедленную контратаку.',principle:'pressure'},
  'stag-courant':{id:'stag-courant',main:'stag',name:'Олень бегущий',summary:'Уступающий отряд уходит по дуге и не ведёт врага к знамени.',principle:'adaptation'},
  'stag-crowned':{id:'stag-crowned',main:'stag',name:'Олень коронованный',summary:'Сошедшийся с союзником отряд быстрее восстанавливает мораль.',principle:'recovery'},
  'stag-regardant':{id:'stag-regardant',main:'stag',name:'Олень обращённый',summary:'Крайние отряды раньше замечают обход и встречают угрозу.',principle:'adaptation'}
};
export const CATALOGS={...core.CATALOGS,main:{...core.MAINS,...EVOLUTIONS},school:SCHOOLS};
const SCHOOL_IDS=Object.keys(SCHOOLS);
const MAIN_IDS=Object.keys(MAINS);

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function baseMain(doctrine={}){return EVOLUTIONS[doctrine.mainEvolution]?.main||EVOLUTIONS[doctrine.main]?.main||doctrine.main||'lion';}
function evolutionId(doctrine={}){return doctrine.mainEvolution||(EVOLUTIONS[doctrine.main]?doctrine.main:null);}
function normalizeDoctrine(doctrine={}){return{...doctrine,main:baseMain(doctrine),mainEvolution:evolutionId(doctrine)};}
function rand(state){state.rng=(Math.imul(state.rng>>>0,1664525)+1013904223)>>>0;return state.rng/4294967296;}
function shuffled(state,items){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rand(state)*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function pick(state,items){return items[Math.floor(rand(state)*items.length)]||items[0];}
function livingMember(m){return m.state!=='fallen'&&m.hp>0;}
function livingSquad(s){return !s.broken&&s.members.some(livingMember);}
function allMembers(army){return[...army.infantry,...army.archers].flatMap(s=>s.members);}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

export function emptyDoctrine(field='gules',ordinary='pale',main='lion',school='imperial'){return{field,ordinary,main,mainBase:main,mainEvolution:null,school,secondary:null,command:null,motto:null,axis:'center'};}
export function createCampaign(field='gules',ordinary='pale',seed=Date.now(),main=globalThis.__blazonFounder||'lion',school=globalThis.__blazonSchool||'imperial'){
  const campaign=core.createCampaign(field,ordinary,seed);campaign.version=VERSION;campaign.doctrine=emptyDoctrine(field,ordinary,main,school);return campaign;
}
export function hydrateCampaign(value){if(!value||!value.doctrine)return null;const campaign=core.hydrateCampaign(value);if(!campaign)return null;campaign.version=VERSION;const doctrine=campaign.doctrine;doctrine.mainBase=baseMain(doctrine);doctrine.mainEvolution=evolutionId(doctrine);doctrine.main=doctrine.mainEvolution||doctrine.mainBase;doctrine.school=SCHOOLS[doctrine.school]?doctrine.school:SCHOOL_IDS[(campaign.seed>>>2)%SCHOOL_IDS.length];return campaign;}
export function doctrineLayers(doctrine){const mainEvolution=evolutionId(doctrine),mainDefinition=mainEvolution?EVOLUTIONS[mainEvolution]:MAINS[baseMain(doctrine)];return[
  {slot:'field',id:doctrine.field,definition:FIELDS[doctrine.field]},
  {slot:'ordinary',id:doctrine.ordinary,definition:ORDINARIES[doctrine.ordinary]},
  {slot:'main',id:doctrine.main,definition:mainDefinition},
  {slot:'secondary',id:doctrine.secondary,definition:doctrine.secondary?SECONDARIES[doctrine.secondary]:null},
  {slot:'command',id:doctrine.command,definition:doctrine.command?COMMANDS[doctrine.command]:null},
  {slot:'motto',id:doctrine.motto,definition:doctrine.motto?MOTTOS[doctrine.motto]:null}
];}
export function doctrineName(doctrine){const evo=evolutionId(doctrine),figure=evo?EVOLUTIONS[evo]?.name:MAINS[baseMain(doctrine)]?.name;return`${figure||'Безымянное знамя'} · ${FIELDS[doctrine.field]?.epithet||''}`;}
export function nextUpgradeSlot(campaign){return campaign.battleIndex===1?'secondary':campaign.battleIndex===2?'command':campaign.battleIndex===3?'motto':campaign.battleIndex===4?'evolution':campaign.battleIndex===5?'revision':null;}
export function generateOffers(campaign){
  const slot=nextUpgradeSlot(campaign);if(!slot)return[];
  if(slot==='evolution')return shuffled(campaign,Object.values(EVOLUTIONS).filter(item=>item.main===baseMain(campaign.doctrine))).map(definition=>({slot:'main',id:definition.id,definition,evolution:true,replaces:campaign.doctrine.main}));
  if(slot!=='revision'){const catalog={secondary:SECONDARIES,command:COMMANDS,motto:MOTTOS}[slot];return shuffled(campaign,Object.keys(catalog)).slice(0,3).map(id=>({slot,id,definition:catalog[id],replaces:campaign.doctrine[slot]||null}));}
  const catalogs={field:FIELDS,ordinary:ORDINARIES,secondary:SECONDARIES,command:COMMANDS,motto:MOTTOS,school:SCHOOLS},out=[];
  for(const key of shuffled(campaign,Object.keys(catalogs))){const current=campaign.doctrine[key],id=shuffled(campaign,Object.keys(catalogs[key]).filter(value=>value!==current))[0];if(id)out.push({slot:key,id,definition:catalogs[key][id],replaces:current,revision:true});if(out.length===3)break;}return out;
}
export function applyOffer(campaign,offer){const next=clone(campaign);if(offer.evolution||EVOLUTIONS[offer.id]){next.doctrine.mainBase=EVOLUTIONS[offer.id].main;next.doctrine.mainEvolution=offer.id;next.doctrine.main=offer.id;}else next.doctrine[offer.slot]=offer.id;next.offers=[];next.phase='briefing';next.lastResult=null;return next;}
function enemyDoctrine(campaign){const state={rng:(campaign.seed^Math.imul(campaign.battleIndex+1,0x9e3779b9))>>>0},stage=campaign.battleIndex,main=pick(state,MAIN_IDS);const doctrine=emptyDoctrine(pick(state,Object.keys(FIELDS)),pick(state,Object.keys(ORDINARIES)),main,pick(state,SCHOOL_IDS));if(stage>=1)doctrine.secondary=pick(state,Object.keys(SECONDARIES));if(stage>=2)doctrine.command=pick(state,Object.keys(COMMANDS));if(stage>=3)doctrine.motto=pick(state,Object.keys(MOTTOS));if(stage>=4){const evo=pick(state,Object.values(EVOLUTIONS).filter(item=>item.main===main));doctrine.mainEvolution=evo.id;doctrine.main=evo.id;}doctrine.axis=pick(state,['left','center','right']);return doctrine;}
export function prepareBattle(campaign){const next=clone(campaign);if(!next.currentEnemy)next.currentEnemy=enemyDoctrine(next);if(!next.currentSeed)next.currentSeed=(next.seed^Math.imul(next.battleIndex+1,0x9e3779b9))>>>0;next.phase='briefing';return next;}
export function recordBattle(campaign,result){const next=clone(campaign),{replay,...persistable}=result;next.lastResult=clone(persistable);next.currentEnemy=null;next.currentSeed=null;if(result.winner==='player')next.victories++;else next.integrity--;if(next.integrity<=0||next.battleIndex>=BATTLE_COUNT-1){next.completed=true;next.phase='ending';return next;}next.battleIndex++;next.phase='reward';next.offers=generateOffers(next);return next;}

function setupArmyEvolution(army,visibleDoctrine){army.doctrine.main=baseMain(visibleDoctrine);army.doctrine.mainEvolution=evolutionId(visibleDoctrine);army.doctrine.school=visibleDoctrine.school;army.__evolution={id:evolutionId(visibleDoctrine),seenBroken:new Set(),triggered:false,lastSignal:-99};}
export function createBattleState(playerDoctrine,enemyDoctrine,seed=1,options={}){const state=core.createBattleState(normalizeDoctrine(playerDoctrine),normalizeDoctrine(enemyDoctrine),seed,options);state.version=5;setupArmyEvolution(state.player,playerDoctrine);setupArmyEvolution(state.enemy,enemyDoctrine);return state;}
function enemyArmy(state,army){return army.side==='player'?state.enemy:state.player;}
function memberById(state,id){for(const army of[state.player,state.enemy])for(const member of allMembers(army))if(member.id===id)return member;return null;}
function pushSignal(state,army,label,x,y){const evo=army.__evolution;if(!evo||state.time-evo.lastSignal<5)return;evo.lastSignal=state.time;state.signals.push({side:army.side,slot:'evolution',id:evo.id,label,x,y,life:1.35,maxLife:1.35});state.events.push({time:state.time,side:army.side,rule:'doctrine',slot:'evolution',doctrineId:evo.id,text:label,x,y});}
function deepThreat(enemy,army){return enemy.infantry.filter(livingSquad).sort((a,b)=>distance(a,army.banner)-distance(b,army.banner))[0]||null;}
function evolveLion(state,army,dt){const id=army.__evolution.id,enemy=enemyArmy(state,army);if(id==='lion-bifurcated'){const weak=enemy.infantry.filter(livingSquad).sort((a,b)=>a.morale-b.morale||a.strength-b.strength).slice(0,2);if(weak.length===2)for(const squad of army.infantry.filter(livingSquad)){const target=weak[squad.index%2];squad.targetSquadId=target.id;squad.goalX=target.x;squad.goalY=target.y+(army.side==='player'?34:-34);}if(weak[0])pushSignal(state,army,'ДВУХВОСТЫЙ ЛЕВ · ДВЕ ЦЕЛИ',weak[0].x,weak[0].y);}
  if(id==='lion-crowned'){for(const target of enemy.infantry.filter(s=>s.broken&&!army.__evolution.seenBroken.has(s.id))){army.__evolution.seenBroken.add(target.id);const hunters=army.infantry.filter(s=>s.targetSquadId===target.id);for(const squad of hunters)for(const m of squad.members)if(livingMember(m))m.morale=Math.min(1,m.morale+.11);pushSignal(state,army,'КОРОНОВАННЫЙ ЛЕВ · ЦЕЛЬ ПОВЕРЖЕНА',target.x,target.y);}}
  if(id==='lion-regardant'){const threat=deepThreat(enemy,army),guard=army.infantry[3];if(threat&&guard&&livingSquad(guard)&&distance(threat,army.banner)<390){guard.targetSquadId=threat.id;guard.goalX=threat.x;guard.goalY=threat.y+(army.side==='player'?45:-45);pushSignal(state,army,'ОБРАЩЁННЫЙ ЛЕВ · ЗАЩИТА ТЫЛА',threat.x,threat.y);}}
}
function evolveBoar(state,army,dt){const id=army.__evolution.id,enemy=enemyArmy(state,army);if(id==='boar-blooded'){army.doctrine.main=army.crisis?'boar':null;if(army.crisis&&!army.__evolution.triggered){army.__evolution.triggered=true;for(const squad of army.infantry.filter(livingSquad))squad.state='breach';pushSignal(state,army,'ОКРОВАВЛЕННЫЙ ВЕПРЬ · ОБЩИЙ НАТИСК',360,state.frontY);}}
  if(id==='boar-coupled'){const lead=army.infantry.filter(livingSquad).sort((a,b)=>army.side==='player'?a.y-b.y:b.y-a.y)[0],mate=army.infantry.filter(s=>livingSquad(s)&&s!==lead).sort((a,b)=>distance(a,lead)-distance(b,lead))[0];if(lead&&mate&&lead.state==='breach'){mate.state='breach';mate.goalX=lead.goalX;mate.goalY=lead.goalY+(army.side==='player'?55:-55);pushSignal(state,army,'СЦЕПЛЕННЫЕ ВЕПРИ · ОБЩИЙ КОРИДОР',lead.x,lead.y);}}
  if(id==='boar-armed'){for(const squad of army.infantry.filter(s=>s.state==='breach'))for(const m of squad.members){if(!livingMember(m)||m.__armedCharge||m.state!=='fighting')continue;const target=memberById(state,m.targetId);if(target&&livingMember(target)){m.__armedCharge=true;target.morale-=.08;target.hp-=.025;target.vy+=army.side==='player'?-8:8;pushSignal(state,army,'ВООРУЖЁННЫЙ ВЕПРЬ · ТАРАН',target.x,target.y);}}}
}
function evolveTower(state,army,dt){const id=army.__evolution.id,anchors=army.infantry.filter(s=>s.anchor);if(id!=='tower-triple'&&anchors.length>1)for(const squad of anchors.slice(1))squad.anchor=null;if(id==='tower-gate'){for(const squad of army.infantry.filter(livingSquad))if(anchors.some(a=>a.anchor&&distance(squad,a.anchor)<75))for(const m of squad.members)if(livingMember(m))m.morale=Math.min(1,m.morale+dt*.012);if(anchors[0])pushSignal(state,army,'БАШНЯ С ВРАТАМИ · СБОР',anchors[0].x,anchors[0].y);}
  if(id==='tower-burning'){for(const tower of anchors)if(tower.broken&&!army.__evolution.seenBroken.has(tower.id)){army.__evolution.seenBroken.add(tower.id);for(const squad of army.infantry.filter(livingSquad)){squad.state='breach';for(const m of squad.members)if(livingMember(m))m.morale=Math.min(1,m.morale+.09);}pushSignal(state,army,'ГОРЯЩАЯ БАШНЯ · КОНТРАТАКА',tower.x,tower.y);}}
}
function evolveStag(state,army,dt){const id=army.__evolution.id,enemy=enemyArmy(state,army);if(id==='stag-regardant'){const threat=deepThreat(enemy,army);if(threat&&distance(threat,army.banner)<400){const guards=[army.infantry[0],army.infantry[3]].filter(livingSquad);for(const guard of guards){guard.goalX=threat.x;guard.goalY=threat.y+(army.side==='player'?50:-50);}pushSignal(state,army,'ОБРАЩЁННЫЙ ОЛЕНЬ · ПЕРЕХВАТ',threat.x,threat.y);}}
  for(const squad of army.infantry.filter(livingSquad)){const backward=army.side==='player'?squad.goalY>squad.y:squad.goalY<squad.y;if(!backward)continue;const threat=enemy.infantry.filter(livingSquad).sort((a,b)=>distance(a,squad)-distance(b,squad))[0];if(id==='stag-courant'&&threat){squad.goalX=Math.max(70,Math.min(650,squad.x+(squad.x<threat.x?-95:95)));pushSignal(state,army,'БЕГУЩИЙ ОЛЕНЬ · БОКОВОЙ ОТХОД',squad.x,squad.y);}if(id==='stag-crowned'){for(const m of squad.members)if(livingMember(m))m.morale=Math.min(1,m.morale+dt*.018);pushSignal(state,army,'КОРОНОВАННЫЙ ОЛЕНЬ · СБОР',squad.x,squad.y);}}
}
function applyEvolution(state,army,dt){const id=army.__evolution?.id;if(!id)return;const main=EVOLUTIONS[id].main;if(main==='lion')evolveLion(state,army,dt);if(main==='boar')evolveBoar(state,army,dt);if(main==='tower')evolveTower(state,army,dt);if(main==='stag')evolveStag(state,army,dt);}
export function stepBattle(state,dt=.05){for(const army of[state.player,state.enemy])if(army.__evolution?.id!=='boar-blooded')army.doctrine.main=baseMain(army.doctrine);core.stepBattle(state,dt);for(const army of[state.player,state.enemy])applyEvolution(state,army,dt);return state;}
export function summarizeBattle(state){const summary=core.summarizeBattle(state);summary.evolutions={player:state.player.__evolution?.id||null,enemy:state.enemy.__evolution?.id||null};return summary;}
export function simulateBattle(a,b,seed=1,max=110){const state=createBattleState(a,b,seed,{captureReplay:false});while(state.status==='running'&&state.time<max)stepBattle(state,.05);return summarizeBattle(state);}
export function randomDoctrine(seed=1,stage=4){const state={rng:seed>>>0||1},main=pick(state,MAIN_IDS),doctrine=emptyDoctrine(pick(state,Object.keys(FIELDS)),pick(state,Object.keys(ORDINARIES)),main,pick(state,SCHOOL_IDS));if(stage>=1)doctrine.secondary=pick(state,Object.keys(SECONDARIES));if(stage>=2)doctrine.command=pick(state,Object.keys(COMMANDS));if(stage>=3)doctrine.motto=pick(state,Object.keys(MOTTOS));if(stage>=4){const evo=pick(state,Object.values(EVOLUTIONS).filter(item=>item.main===main));doctrine.mainEvolution=evo.id;doctrine.main=evo.id;}return doctrine;}
export function botAudit(iterations=100,seed=1){const result={player:0,enemy:0,averageDuration:0,timeouts:0};for(let i=0;i<iterations;i++){const a=randomDoctrine(seed+i*31,4),b=randomDoctrine(seed+i*31+7,4),r1=simulateBattle(a,b,seed+i*97),r2=simulateBattle(b,a,seed+i*97);result[r1.winner]++;result[r2.winner==='player'?'enemy':'player']++;result.averageDuration+=r1.duration+r2.duration;if(r1.duration>=105)result.timeouts++;if(r2.duration>=105)result.timeouts++;}result.averageDuration=Math.round(result.averageDuration/(iterations*2)*10)/10;return result;}
