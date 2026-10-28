// Чёрные знамёна · campaign rules. Pure deterministic strategic layer.
import { createBattle, TYPES } from './rules.mjs';
import {createDiplomacy,ensureDiplomacy,diplomacyValid,freePassage,warDiplomacy,recordWar,nextPoliticalSeason,tributeIncome,vassal,negotiate} from './diplomacy.mjs';

export const CAMPAIGN_VERSION = 1;
export const MAX_STRENGTH = 18;
export const PROVINCES = Object.freeze([
  {id:0,name:'Северный оплот',type:'highland',capital:0,income:3},
  {id:1,name:'Кедровая марка',type:'forest',income:2},
  {id:2,name:'Ледяной перевал',type:'highland',income:2},
  {id:3,name:'Угольный мыс',type:'highland',capital:2,income:4},
  {id:4,name:'Медные поля',type:'plain',income:3},
  {id:5,name:'Белый брод',type:'river',income:2},
  {id:6,name:'Степные ворота',type:'plain',income:3},
  {id:7,name:'Красный гарнизон',type:'fort',income:3},
  {id:8,name:'Долина колоколов',type:'plain',income:2},
  {id:9,name:'Пепельный кряж',type:'highland',income:2},
  {id:10,name:'Каменоломни',type:'highland',income:3},
  {id:11,name:'Багровый трон',type:'fort',capital:1,income:4}
]);
export const FACTIONS=Object.freeze([
  {name:'Северный союз',short:'Север',color:'#89bab0',dark:'#3c6a62'},
  {name:'Багровый орден',short:'Орден',color:'#c8886a',dark:'#805041'},
  {name:'Каменные князья',short:'Князья',color:'#c9b68e',dark:'#736850'},
  {name:'Вольные земли',short:'Вольные',color:'#9ca7a0',dark:'#515f58'}
]);
export function neighbors(id) {
  if (!Number.isInteger(id) || id<0 || id>=PROVINCES.length) return [];
  const x=id%4,y=Math.floor(id/4);
  return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([cx,cy])=>cx>=0&&cx<4&&cy>=0&&cy<3).map(([cx,cy])=>cy*4+cx);
}
export function province(state,id){return state.provinces[id];}
export function armiesAt(state,id,side=null){
  return state.armies.filter(a=>a.province===id && a.strength>0 && (side===null || a.side===side));
}
export function createCampaign(){
  const owners=[0,0,2,2,0,3,2,1,3,3,1,1];
  const garrisons=[5,3,5,7,3,3,4,5,2,3,4,7];
  return {
    version:CAMPAIGN_VERSION,season:1,coins:16,renown:0,actions:2,nextArmy:7,
    provinces:owners.map((owner,id)=>({id,owner,garrison:garrisons[id],fort:PROVINCES[id].capital!==undefined?1:0,raidedUntil:0})),
    armies:[
      {id:'army-1',side:0,province:1,strength:11,used:false},
      {id:'army-2',side:0,province:4,strength:8,used:false},
      {id:'army-3',side:1,province:7,strength:9,used:false},
      {id:'army-4',side:1,province:11,strength:8,used:false},
      {id:'army-5',side:2,province:2,strength:9,used:false},
      {id:'army-6',side:2,province:6,strength:7,used:false}
    ],
    sieges:[],diplomacy:createDiplomacy(),pending:null,winner:null,report:null,
    history:['Весна первого года. Три державы готовятся к войне.']
  };
}
function copy(s){
  return {...s,provinces:s.provinces.map(p=>({...p})),armies:s.armies.map(a=>({...a})),sieges:(s.sieges||[]).map(x=>({...x})),diplomacy:s.diplomacy?{relations:{...s.diplomacy.relations},treaties:s.diplomacy.treaties.map(t=>({...t})),coalitionUntil:s.diplomacy.coalitionUntil??0}:createDiplomacy(),history:[...s.history],
    pending:s.pending?{...s.pending}:null,report:s.report?{...s.report}:null};
}
function note(s,text){s.history.unshift(text);s.history=s.history.slice(0,12);}
function error(state,text){return {state,error:text};}
function canAct(s){return s.winner===null && !s.pending && s.actions>0;}
function finish(s){
  if((s.provinces[3].owner===0||(s.provinces[3].owner===2&&vassal(s,2))) &&
    (s.provinces[11].owner===0||(s.provinces[11].owner===1&&vassal(s,1)))){s.winner=0;note(s,'Оба вражеских престола покорены. Союз победил.');}
  if(s.provinces[0].owner!==0){s.winner=1;note(s,'Северный оплот пал. Союз потерял войну.');}
}
export function income(s){return s.provinces.reduce((n,p)=>n+(p.owner===0?Math.max(0,PROVINCES[p.id].income-(p.raidedUntil>s.season?2:0)):0),0)+tributeIncome(s);}
export function politicalOrder(s,side,action){
 const result=negotiate(s,side,action);
 if(!result.error)finish(result.state);
 return result;
}
export function upkeep(s){return s.armies.filter(a=>a.side===0).reduce((n,a)=>n+Math.ceil(a.strength/6),0);}
export function recruit(state,id,armyId=null){
  if(!canAct(state))return error(state,'Сейчас нельзя собирать войска');
  const p=state.provinces[id];
  if(!p||p.owner!==0)return error(state,'Набор доступен только в собственных владениях');
  if(!supplyNetwork(state,0).has(id))return error(state,'Линия снабжения прервана: новые войска не прибудут');
  if((p.raidedUntil||0)>state.season)return error(state,'После набега дороги закрыты до следующего сезона');
  const army=armyId?state.armies.find(a=>a.id===armyId && a.side===0 && a.province===id):null;
  if(armyId&&!army)return error(state,'Эта армия не находится здесь');
  if(army?.used)return error(state,'Армия уже получила приказ в этом сезоне');
  const cost=army?6:9,added=army?4:6;
  if(state.coins<cost)return error(state,'Недостаточно серебра: требуется '+cost);
  if(army&&army.strength>=MAX_STRENGTH)return error(state,'В этой армии уже достаточно солдат');
  if(!army && armiesAt(state,id,0).length>=2)return error(state,'На одной земле может стоять не более двух полевых армий');
  const s=copy(state);s.coins-=cost;s.actions--;
  if(army){
    const a=s.armies.find(a=>a.id===armyId);
    a.strength=Math.min(MAX_STRENGTH,a.strength+added);a.used=true;
    note(s,'Пополнение дружины в '+PROVINCES[id].name+': '+a.strength+' воинов.');
  }else{
    s.armies.push({id:'army-'+s.nextArmy++,side:0,province:id,strength:added,used:true});
    note(s,'Собрана новая дружина в '+PROVINCES[id].name+'.');
  }
  return {state:s,error:null};
}
export function fortify(state,id){
  if(!canAct(state))return error(state,'В этом сезоне приказы исчерпаны');
  const p=state.provinces[id];
  if(!p||p.owner!==0)return error(state,'Здесь нет союзного гарнизона');
  if(!supplyNetwork(state,0).has(id))return error(state,'Гарнизон отрезан от столицы: укрепление невозможно');
  if(p.garrison>=10)return error(state,'Гарнизон полностью укомплектован');
  if(state.coins<5)return error(state,'Для усиления гарнизона нужно 5 серебра');
  const s=copy(state),target=s.provinces[id];
  target.garrison=Math.min(10,target.garrison+3);target.fort=Math.min(2,target.fort+1);
  s.coins-=5;s.actions--;
  note(s,'Усилена оборона: '+PROVINCES[id].name+'.');
  return {state:s,error:null};
}
export function march(state,armyId,to){
  if(!canAct(state))return error(state,'Поход невозможен до завершения битвы или нового сезона');
  const army=state.armies.find(a=>a.id===armyId && a.side===0&&a.strength>0);
  if(!army||army.used)return error(state,'Выберите свободную дружественную армию');
  const besieging=(state.sieges||[]).find(x=>x.armyId===armyId);
  if(besieging && besieging.to!==to)return error(state,'Армия держит блокаду: можно лишь штурмовать осаждённую крепость');
  if(!neighbors(army.province).includes(to))return error(state,'Марш возможен лишь в соседнюю область');
  const target=state.provinces[to];
  if(!target)return error(state,'Неизвестная земля');
  if(target.owner===0 && armiesAt(state,to,0).length>=2)return error(state,'Две армии уже занимают эту область');
  if(target.owner!==0&&!warDiplomacy(state,target.owner,0))return error(state,'Действующий договор запрещает нападение на эту державу');
  const s=copy(state),a=s.armies.find(x=>x.id===armyId);
  s.actions--;a.used=true;
  if(besieging)s.sieges=s.sieges.filter(x=>x.armyId!==armyId);
  if(target.owner===0){
    a.province=to;
    note(s,'Дружина перешла в '+PROVINCES[to].name+'.');
  }else{
    recordWar(s,0,target.owner);
    s.pending={kind:'invasion',attackerId:armyId,from:a.province,to,attackerSide:0,defenderSide:target.owner,attackerStrength:a.strength,
      defenderStrength:defensePower(s,to),defenderGarrison:target.garrison};
    note(s,'Начался штурм: '+PROVINCES[to].name+'.');
  }
  return {state:s,error:null};
}
export function defensePower(s,id){
  const p=s.provinces[id];
  const field=armiesAt(s,id,p.owner).reduce((sum,a)=>sum+a.strength,0);
  return Math.max(1,p.garrison+field+Math.min(2,p.fort));
}
export function validCampaign(c){
  if(!c || c.version!==CAMPAIGN_VERSION || !Number.isInteger(c.season) || c.season<1 || c.season>10000 ||
    !Number.isInteger(c.coins)||c.coins<0||c.coins>9999||!Number.isInteger(c.actions)||c.actions<0||c.actions>2||
    !Array.isArray(c.provinces)||c.provinces.length!==PROVINCES.length || !Array.isArray(c.armies) || c.armies.length>100 ||
    ![null,0,1].includes(c.winner)||!Number.isInteger(c.nextArmy)||c.nextArmy<1 ||
    !diplomacyValid(c)||
    !Array.isArray(c.history)||c.history.length>16 || !c.history.every(v=>typeof v==='string'&&v.length<300))return false;
  const ids=new Set();
  if(!c.provinces.every((p,id)=>p.id===id&&[0,1,2,3].includes(p.owner)&&Number.isInteger(p.garrison)&&p.garrison>=0&&p.garrison<=10&&Number.isInteger(p.fort)&&p.fort>=0&&p.fort<=2&&
    (p.raidedUntil===undefined||(Number.isInteger(p.raidedUntil)&&p.raidedUntil>=0&&p.raidedUntil<=10002))))return false;
  if(c.sieges!==undefined) {
    if(!Array.isArray(c.sieges)||c.sieges.length>12)return false;
    const byArmy=new Set(),byTarget=new Set();
    if(!c.sieges.every(x=>typeof x.armyId==='string'&&!byArmy.has(x.armyId)&&!!byArmy.add(x.armyId) &&
      Number.isInteger(x.from)&&Number.isInteger(x.to)&&neighbors(x.from).includes(x.to) &&
      [0,1,2].includes(x.side)&&x.side!==c.provinces[x.to].owner&&
      c.provinces[x.from].owner===x.side&&!byTarget.has(x.to)&&!!byTarget.add(x.to) &&
      Number.isInteger(x.progress)&&x.progress>=0&&x.progress<=10000 &&
      c.armies.some(a=>a.id===x.armyId&&a.side===x.side&&a.province===x.from)))return false;
  }
  if(!c.armies.every(a=>typeof a.id==='string' && /^army-\d+$/.test(a.id) && !ids.has(a.id)&&!!ids.add(a.id) && [0,1,2].includes(a.side)&&Number.isInteger(a.province)&&a.province>=0&&a.province<PROVINCES.length && Number.isInteger(a.strength)&&a.strength>0&&a.strength<=MAX_STRENGTH&&typeof a.used==='boolean' && c.provinces[a.province].owner===a.side))return false;
  if(c.pending){
    const p=c.pending;
    if(!['invasion','counterattack'].includes(p.kind)||!Number.isInteger(p.from)||!Number.isInteger(p.to)||
      !neighbors(p.from).includes(p.to)||![0,1,2].includes(p.attackerSide)||![0,1,2,3].includes(p.defenderSide)||
      !Number.isInteger(p.attackerStrength)||p.attackerStrength<1||p.attackerStrength>MAX_STRENGTH||
      !Number.isInteger(p.defenderStrength)||p.defenderStrength<1||p.defenderStrength>50 ||
      !Number.isInteger(p.defenderGarrison)||p.defenderGarrison<0||p.defenderGarrison>10 ||
      !c.armies.some(a=>a.id===p.attackerId && a.side===p.attackerSide&&a.province===p.from) ||
      c.provinces[p.to].owner!==p.defenderSide)return false;
  }
  return true;
}
export function startCampaignBattle(s){
  if(!s.pending)throw new Error('No campaign battle pending');
  const p=s.pending, terrain=PROVINCES[p.to].type;
  const battle=createBattle(s.provinces[p.to].fort>0||terrain==='fort'?'bastion':
    ['river','forest','plain'].includes(terrain)?'pass':'moor','ai');
  const playerStrength=p.attackerSide===0?p.attackerStrength:p.defenderStrength;
  const enemyStrength=p.attackerSide===0?p.defenderStrength:p.attackerStrength;
  const initial=[squadStrength(battle,0,playerStrength),squadStrength(battle,1,enemyStrength)];
  battle.campaignContext={to:p.to,playerStrength,enemyStrength,initial};
  battle.log=['Поход в '+PROVINCES[p.to].name+'. Исход боя определит судьбу области.'];
  return battle;
}
function squadStrength(battle,side,power){
  // Each campaign soldier buys approximately one HP on the board; weak armies lose figures.
  const desired=Math.min(19,Math.max(2,Math.round(power*1.25)));
  const candidates=battle.units.filter(u=>u.side===side);
  const order=[0,1,3,4,2];
  for(const unit of candidates)unit.hp=0;
  let remaining=desired;
  for(const index of order){if(remaining<=0)break;candidates[index].hp=1;remaining--;}
  while(remaining>0){
    let changed=false;
    for(const index of order){
      const u=candidates[index];if(u.hp>=TYPES[u.type].hp)continue;
      u.hp++;remaining--;changed=true;if(remaining===0)break;
    }
    if(!changed)break;
  }
  return candidates.reduce((n,u)=>n+u.hp,0);
}
export function concludeCampaignBattle(state,battle){
  if(!state.pending)return error(state,'Нет ожидающего сражения');
  if(!battle || !battle.campaignContext || battle.winner===null)return error(state,'Сражение не завершено');
  const p=state.pending,context=battle.campaignContext;
  if(context.to!==p.to)return error(state,'Партия не соответствует текущему походу');
  const s=copy(state),target=s.provinces[p.to],attacker=s.armies.find(a=>a.id===p.attackerId);
  if(!attacker)return error(state,'Полевая армия не найдена');
  const remaining=side=>battle.units.filter(u=>u.side===side).reduce((sum,u)=>sum+u.hp,0);
  const humanRatio=context.initial[0]?remaining(0)/context.initial[0]:0;
  const enemyRatio=context.initial[1]?remaining(1)/context.initial[1]:0;
  const attackerRatio=p.attackerSide===0?humanRatio:enemyRatio;
  const defenderRatio=p.attackerSide===0?enemyRatio:humanRatio;
  const attackersLeft=Math.min(p.attackerStrength,Math.floor(p.attackerStrength*attackerRatio));
  const defendersLeft=Math.min(p.defenderStrength,Math.floor(p.defenderStrength*defenderRatio));
  const attackerWins=battle.winner!=='draw' && battle.winner===(p.attackerSide===0?0:1);
  attacker.strength=attackersLeft;
  // Apply surviving defenders to the original garrison and field armies proportionally.
  const defenders=s.armies.filter(a=>a.side===p.defenderSide&&a.province===p.to);
  const defenderOriginal=defenders.reduce((sum,a)=>sum+a.strength,0);
  const totalOriginal=p.defenderGarrison+defenderOriginal;
  const survivingFraction=totalOriginal?Math.max(0,Math.min(1,defendersLeft/totalOriginal)):0;
  target.garrison=Math.floor(p.defenderGarrison*survivingFraction);
  for(const a of defenders)a.strength=Math.floor(a.strength*survivingFraction);
  if(attackerWins){
    target.owner=p.attackerSide;
    target.garrison=Math.max(1,Math.min(3,Math.floor(attackersLeft/4)));
    target.fort=Math.max(0,target.fort-1);
    if(attacker.strength>0)attacker.province=p.to;
    // Retreating defenders cannot remain inside a newly conquered province.
    for(const a of defenders){
      if(a.strength<=0)continue;
      const retreat=neighbors(p.to).find(n=>s.provinces[n].owner===a.side);
      if(retreat!==undefined)a.province=retreat;
      else a.strength=0;
    }
    if(p.attackerSide===0){s.coins=Math.min(9999,s.coins+4);s.renown+=1;}
    note(s,FACTIONS[p.attackerSide].short+' захватывает '+PROVINCES[p.to].name+'.');
  }else{
    // An unsuccessful invasion falls back to its staging province.
    note(s,'Штурм '+PROVINCES[p.to].name+' отбит.');
  }
  s.armies=s.armies.filter(a=>a.strength>0);
  s.sieges=(s.sieges||[]).filter(x=>x.to!==p.to&&x.from!==p.to&&x.armyId!==p.attackerId &&
    s.provinces[x.from].owner===x.side && s.armies.some(a=>a.id===x.armyId&&a.side===x.side&&a.province===x.from));
  s.pending=null;
  s.report={province:p.to,victory:attackerWins,playerWon:attackerWins?(p.attackerSide===0):(p.defenderSide===0),
    attackerLoss:p.attackerStrength-attackersLeft,defenderLoss:p.defenderStrength-defendersLeft,season:s.season};
  finish(s);
  return {state:s,error:null};
}
export function retreatCampaignBattle(state){
  if(!state.pending)return error(state,'Отступать некуда');
  const p=state.pending,s=copy(state);
  const a=s.armies.find(a=>a.id===p.attackerId);
  a.strength=Math.max(0,Math.floor(a.strength*.65));
  s.armies=s.armies.filter(a=>a.strength>0);s.sieges=(s.sieges||[]).filter(x=>x.armyId!==p.attackerId);s.pending=null;
  s.report={province:p.to,victory:false,playerWon:p.defenderSide===0,attackerLoss:p.attackerStrength-a.strength,
    defenderLoss:0,season:s.season,retreat:true};
  note(s,'Поход на '+PROVINCES[p.to].name+' отменён. В отступлении потеряна треть войска.');
  return {state:s,error:null};
}
function moveEnemy(s,army,to){
  const p=s.provinces[to],from=army.province;
  if(!warDiplomacy(s,p.owner,army.side))return;
  army.used=true;
  if(p.owner===army.side){army.province=to;return;}
  if(p.owner===0){
    recordWar(s,army.side,0);
    s.pending={kind:'counterattack',attackerId:army.id,from,to,attackerSide:army.side,defenderSide:0,
      attackerStrength:army.strength,defenderStrength:defensePower(s,to),defenderGarrison:p.garrison};
    note(s,'Враг приближается к '+PROVINCES[to].name+'. Защищай владение!');
    return;
  }
  const resist=defensePower(s,to);
  if(army.strength<=resist+1)return;
  army.strength=Math.max(1,army.strength-Math.ceil(resist*.6));
  const losers=s.armies.filter(a=>a.province===to&&a.side===p.owner);
  for(const loser of losers){const retreat=neighbors(to).find(n=>s.provinces[n].owner===loser.side);if(retreat!==undefined)loser.province=retreat;else loser.strength=0;}
  p.owner=army.side;p.garrison=1;p.fort=Math.max(0,p.fort-1);army.province=to;
  note(s,FACTIONS[army.side].short+' занимает '+PROVINCES[to].name+'.');
}
function distanceToOpponent(s,start,side){
  const queue=[[start,0]],seen=new Set([start]);
  for(let i=0;i<queue.length;i++){
    const [id,d]=queue[i];
    if(s.provinces[id].owner===0)return d;
    for(const n of neighbors(id))if(!seen.has(n)){seen.add(n);queue.push([n,d+1]);}
  }
  return 99;
}
function enemyOrder(s,side){
  const armies=s.armies.filter(a=>a.side===side&&a.strength>0).sort((a,b)=>b.strength-a.strength);
  let choices=[];
  for(const army of armies)for(const id of neighbors(army.province)){
    const p=s.provinces[id];
    let value=0;
    if(!warDiplomacy(s,p.owner,side))continue;
    if(p.owner===0)value=130+(id===0?32:0)-(defensePower(s,id)*3);
    else if(p.owner===3)value=100-defensePower(s,id)*6;
    else if(p.owner!==side)value=65-defensePower(s,id)*5;
    else value=10-distanceToOpponent(s,id,side)*3;
    if(p.owner!==0 && p.owner!==side&&army.strength<=defensePower(s,id)+1 && !isStronghold(s,id))continue;
    if((s.sieges||[]).some(x=>x.armyId===army.id||x.to===id))continue;
    if(p.owner===side && armiesAt(s,id,side).length>=2)continue;
    choices.push({army,id,value});
  }
  choices.sort((a,b)=>b.value-a.value || a.id-b.id || a.army.id.localeCompare(b.army.id));
  const pick=choices[0];
  if(pick&&pick.value>0){
    const {army,id}=pick,p=s.provinces[id],defense=defensePower(s,id);
    const supply=supplyNetwork(s,army.side).has(army.province);
    if(isStronghold(s,id) && p.owner!==army.side && supply &&
       army.strength<=defense+4 && army.strength>=4){
      s.sieges.push({armyId:army.id,side,from:army.province,to:id,progress:0});
      army.used=true;note(s,FACTIONS[side].short+' осаждает '+PROVINCES[id].name+'.');
    }else if(p.owner===0 && !isStronghold(s,id) && army.strength<defense+1 && supply &&
      army.strength>=4 && p.garrison>=2 && armiesAt(s,id).length===0 && (p.raidedUntil||0)<=s.season){
      army.strength=Math.max(1,army.strength-1);army.used=true;
      p.garrison=Math.max(0,p.garrison-2);p.raidedUntil=s.season+2;
      note(s,FACTIONS[side].short+' совершает набег на '+PROVINCES[id].name+'.');
    }else moveEnemy(s,army,id);
  }
}
export function endSeason(state){
  if(state.winner!==null)return error(state,'Кампания закончена');
  if(state.pending)return error(state,'Сначала завершите текущую битву');
  const s=copy(state);
  const funds=income(s),expenses=upkeep(s);
  s.coins=Math.min(9999,Math.max(0,s.coins+funds-expenses));
  if(state.coins+funds<expenses){
    for(const a of s.armies.filter(a=>a.side===0))a.strength=Math.max(1,a.strength-1);
    note(s,'В казне недостача: армии теряют людей из-за нехватки снабжения.');
  }
  s.season++;s.actions=2;
  nextPoliticalSeason(s);
  resolveSieges(s);
  applyIsolation(s);
  s.armies.forEach(a=>{a.used=false;});
  note(s,'Сезон '+s.season+'. Доход '+funds+', содержание '+expenses+'.');
  for(const side of [1,2]){
    enemyOrder(s,side);
    if(s.pending)break;
  }
  s.armies=s.armies.filter(a=>a.strength>0);
  finish(s);
  return {state:s,error:null};
}


/** Supply travels along uninterrupted friendly land from the faction's capital.
 * Besieged provinces are encircled and never relay supplies. */
export function supplyNetwork(s,side){
  const origin=PROVINCES.find(p=>p.capital===side)?.id;
  if(origin===undefined||s.provinces[origin].owner!==side)return new Set();
  const blocked=new Set((s.sieges||[]).filter(x=>x.side!==side).map(x=>x.to));
  if(blocked.has(origin))return new Set();
  const seen=new Set([origin]),queue=[origin];
  for(const id of queue)for(const n of neighbors(id)){
    if(seen.has(n)||blocked.has(n)||!freePassage(s,side,s.provinces[n].owner))continue;
    seen.add(n);queue.push(n);
  }
  return seen;
}
export function isStronghold(s,id){
  return !!s.provinces[id] && (s.provinces[id].fort>0 || PROVINCES[id].capital!==undefined || PROVINCES[id].type==='fort');
}
export function siegeAt(s,id){return (s.sieges||[]).find(x=>x.to===id)||null;}
export function siegeByArmy(s,id){return (s.sieges||[]).find(x=>x.armyId===id)||null;}
export function campaignUpgrade(s){
  if(!validCampaign(s))return null;
  const out=copy(s);
  ensureDiplomacy(out);
  out.sieges=(s.sieges||[]).map(x=>({...x}));
  for(const p of out.provinces)p.raidedUntil??=0;
  return validCampaign(out)?out:null;
}
export function startSiege(state,armyId,to){
  if(!canAct(state))return error(state,'Сначала завершите ожидающий бой или начните новый сезон');
  const army=state.armies.find(a=>a.id===armyId && a.side===0&&a.strength>0);
  if(!army||army.used)return error(state,'Для блокады нужна свободная дружина');
  if(!neighbors(army.province).includes(to)||state.provinces[to].owner===0)return error(state,'Осада возможна лишь в соседней чужой области');
  if(!warDiplomacy(state,state.provinces[to].owner,0))return error(state,'Договор не позволяет осаждать союзную крепость');
  if(!isStronghold(state,to))return error(state,'Здесь нет укреплений. Совершите обычное вторжение');
  if(siegeAt(state,to)||siegeByArmy(state,armyId))return error(state,'Эта дружина уже связана осадой');
  if(!supplyNetwork(state,0).has(army.province))return error(state,'Без снабжения осадную блокаду не удержать');
  if(army.strength<4)return error(state,'Для осады необходимо хотя бы четыре воина');
  const s=copy(state);s.actions--;
  s.armies.find(a=>a.id===armyId).used=true;
  s.sieges.push({armyId,side:0,from:army.province,to,progress:0});
  recordWar(s,0,s.provinces[to].owner);
  note(s,'Знамёна сомкнули кольцо вокруг '+PROVINCES[to].name+'.');
  return {state:s,error:null};
}
export function liftSiege(state,armyId){
  if(state.winner!==null||state.pending)return error(state,'Невозможно отдать приказ во время сражения');
  const existing=siegeByArmy(state,armyId);
  if(!existing||existing.side!==0)return error(state,'Эта дружина не участвует в осаде');
  const s=copy(state);s.sieges=s.sieges.filter(x=>x.armyId!==armyId);
  note(s,'Блокада '+PROVINCES[existing.to].name+' прекращена.');
  return {state:s,error:null};
}
export function raid(state,armyId,to){
  if(!canAct(state))return error(state,'Для рейда больше нет приказов');
  const army=state.armies.find(a=>a.id===armyId&&a.side===0);
  if(!army||army.used||army.strength<4)return error(state,'Рейд требует свободную дружину из четырёх воинов');
  if(!neighbors(army.province).includes(to)||state.provinces[to].owner===0)return error(state,'Выберите соседнюю вражескую землю');
  if(!warDiplomacy(state,state.provinces[to].owner,0))return error(state,'Набег нарушит действующий договор');
  if(PROVINCES[to].capital!==undefined)return error(state,'Столицу невозможно разграбить без настоящего штурма');
  if(siegeByArmy(state,armyId)||siegeAt(state,to))return error(state,'Блокада исключает рейд');
  if(!supplyNetwork(state,0).has(army.province))return error(state,'Нет снабжения для глубокого рейда');
  if(armiesAt(state,to).length)return error(state,'Полевые дружины противника прикрывают дорогу. Требуется сражение');
  if(state.provinces[to].garrison<2)return error(state,'Здесь уже нечего грабить: гарнизон и запасы истощены');
  if((state.provinces[to].raidedUntil||0)>state.season)return error(state,'Эта земля уже разграблена');
  const s=copy(state);const a=s.armies.find(a=>a.id===armyId),p=s.provinces[to];
  a.strength--;a.used=true;s.actions--;s.coins=Math.min(9999,s.coins+4);
  p.garrison=Math.max(0,p.garrison-2);p.raidedUntil=s.season+2;
  recordWar(s,0,p.owner);
  note(s,'Рейд на '+PROVINCES[to].name+': +4 серебра, гарнизон ослаблен, доход сожжён на два сезона.');
  return {state:s,error:null};
}
function captureBySiege(s,siege,army){
  const target=s.provinces[siege.to],defender=target.owner;
  for(const a of s.armies.filter(a=>a.province===siege.to && a.side===defender)){
    const retreat=neighbors(siege.to).find(n=>s.provinces[n].owner===defender);
    if(retreat===undefined)a.strength=0;else a.province=retreat;
  }
  target.owner=siege.side;target.fort=Math.max(0,target.fort-1);target.garrison=2;target.raidedUntil=0;
  army.province=siege.to;
  s.sieges=s.sieges.filter(x=>x!==siege);
  s.sieges=s.sieges.filter(x=>x.from!==siege.to && x.to!==siege.to);
  if(siege.side===0){s.coins=Math.min(9999,s.coins+3);s.renown++;}
  s.report={province:siege.to,victory:true,playerWon:siege.side===0,attackerLoss:0,defenderLoss:0,season:s.season,siege:true};
  note(s,PROVINCES[siege.to].name+' капитулирует после блокады.');
}
function resolveSieges(s){
  const current=[...s.sieges];
  for(const siege of current){
    if(!s.sieges.includes(siege))continue;
    const a=s.armies.find(a=>a.id===siege.armyId&&a.side===siege.side&&a.province===siege.from&&a.strength>0);
    if(!a||s.provinces[siege.from].owner!==siege.side||s.provinces[siege.to].owner===siege.side){
      s.sieges=s.sieges.filter(x=>x!==siege);continue;
    }
    if(!supplyNetwork(s,siege.side).has(siege.from)){
      a.strength=Math.max(0,a.strength-2);
      note(s,'Блокадная дружина у '+PROVINCES[siege.to].name+' лишилась обозов.');
      if(a.strength===0)s.sieges=s.sieges.filter(x=>x!==siege);
      continue;
    }
    siege.progress++;
    const fort=s.provinces[siege.to];
    const defenders=s.armies.filter(u=>u.side===fort.owner&&u.province===siege.to);
    fort.garrison=Math.max(0,fort.garrison-2);
    for(const unit of defenders)unit.strength=Math.max(0,unit.strength-1);
    const defendersLeft=defenders.reduce((sum,x)=>sum+x.strength,0);
    const need=PROVINCES[siege.to].capital!==undefined?3:2;
    note(s,'Блокада '+PROVINCES[siege.to].name+': '+siege.progress+' сезон, гарнизон '+fort.garrison+'.');
    if(siege.progress>=need && fort.garrison<=1 && defendersLeft<=1 && a.strength>=3)captureBySiege(s,siege,a);
  }
  s.armies=s.armies.filter(a=>a.strength>0);
}
function applyIsolation(s){
  for(const side of [0,1,2]){
    const connected=supplyNetwork(s,side);
    for(const a of s.armies.filter(a=>a.side===side&&!connected.has(a.province))){
      a.strength=Math.max(0,a.strength-2);
      note(s,FACTIONS[side].short+': дружина в '+PROVINCES[a.province].name+' отрезана от снабжения.');
    }
    for(const p of s.provinces.filter(p=>p.owner===side&&!connected.has(p.id))){
      // Besieged garrisons already lose manpower in resolveSieges.
      if(siegeAt(s,p.id))continue;
      p.garrison=Math.max(0,p.garrison-1);
    }
  }
  s.armies=s.armies.filter(a=>a.strength>0);
  s.sieges=s.sieges.filter(x=>s.armies.some(a=>a.id===x.armyId));
}
