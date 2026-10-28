// Stage IV. Politics is a deterministic contract system layered on the military campaign.
// This module intentionally does not import campaign.mjs; callers own the turn transaction.
const SIDES=[1,2];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const owned=(s,side)=>s.provinces.filter(p=>p.owner===side).length;
const force=(s,side)=>s.armies.filter(a=>a.side===side).reduce((n,a)=>n+a.strength,0);
const pact=(s,side)=>s.diplomacy?.treaties?.find(t=>t.side===side)||null;
const record=(s,message)=>{s.history.unshift(message);s.history.length=Math.min(s.history.length,12);};
const rejected=(s,reason)=>({state:s,error:reason});
const NAME={0:'Север',1:'Орден',2:'Князья'};
export const POLITICAL_ACTIONS=Object.freeze(['envoy','truce','alliance','submission','tribute','charter','break']);
export function createDiplomacy(){
 return {relations:{1:-32,2:-12},treaties:[],coalitionUntil:0};
}
export function ensureDiplomacy(s){
 if(!s.diplomacy)s.diplomacy=createDiplomacy();
 if(s.diplomacy.coalitionUntil===undefined)s.diplomacy.coalitionUntil=0;
 return s;
}
export function diplomacyValid(s){
 const d=s?.diplomacy;
 if(!d)return true; // v0.2/v0.3 compatibility
 if(!d.relations||!d.treaties||typeof d.relations!=='object'||Array.isArray(d.relations)
   ||!Array.isArray(d.treaties)||d.treaties.length>2
   ||!Number.isInteger(d.coalitionUntil??0)||d.coalitionUntil<0||d.coalitionUntil>10003)return false;
 if(!SIDES.every(side=>Number.isInteger(d.relations[side])&&Math.abs(d.relations[side])<=100))return false;
 const seen=new Set();
 return d.treaties.every(t=>{
  if(!t||!SIDES.includes(t.side)||seen.has(t.side)||!['truce','alliance','vassal'].includes(t.kind))return false;
  seen.add(t.side);
  if(t.kind==='vassal')return Number.isInteger(t.loyalty)&&t.loyalty>=0&&t.loyalty<=100&&t.until===0;
  return Number.isInteger(t.until)&&t.until>=1&&t.until<=10003;
 });
}
export function relation(s,side){return s.diplomacy?.relations?.[side]??createDiplomacy().relations[side];}
export function agreement(s,side){
 const t=pact(s,side);return t&&(t.kind==='vassal'||t.until>=s.season)?t:null;
}
export function vassal(s,side){return agreement(s,side)?.kind==='vassal';}
export function peace(s,side){
 const t=agreement(s,side);return !!t;
}
export function league(s){return (s.diplomacy?.coalitionUntil??0)>=s.season;}
export function freePassage(s,traveler,owner){
 if(traveler===owner)return true;
 if(![0,1,2].includes(traveler)||![0,1,2].includes(owner))return false;
 if(traveler===0||owner===0){
  return peace(s,traveler===0?owner:traveler);
 }
 return league(s);
}
export function pactName(p){
 return p?.kind==='vassal'?'Вассал':p?.kind==='alliance'?'Союз':'Перемирие';
}
export function tributeIncome(s){
 return SIDES.reduce((sum,side)=>{
  const t=agreement(s,side);
  if(t?.kind==='vassal')return sum+owned(s,side)*2;
  if(t?.kind==='alliance')return sum+1;
  return sum;
 },0);
}
export function diplomacyChoice(s,side,action){
 if(!SIDES.includes(side)||!POLITICAL_ACTIONS.includes(action))return {ok:false,reason:'Недоступные переговоры'};
 if(s.winner!==null||s.pending)return {ok:false,reason:'Во время битвы переговоры невозможны'};
 if(s.actions<1)return {ok:false,reason:'В этом сезоне больше нет приказов'};
 if(owned(s,side)===0)return {ok:false,reason:'Эта держава больше не владеет землями'};
 const current=agreement(s,side),loyal=current?.loyalty??0,rel=relation(s,side),power=force(s,side);
 const north=force(s,0);
 const price={envoy:4,truce:6,alliance:8,submission:0,tribute:0,charter:5,break:0}[action];
 if(s.coins<price)return {ok:false,reason:'Для переговоров требуется '+price+' серебра'};
 const fail=reason=>({ok:false,reason,cost:price});
 if(action==='envoy'){
  if(current?.kind==='vassal')return fail('С вассалом нужно договариваться через его привилегии');
  if(rel>=75)return fail('Доверие уже достигло предела');
 }
 if(action==='truce'){
  if(current)return fail('Действующий договор уже связывает державы');
  if(rel< -65)return fail('После жестокой войны послы не добьются аудиенции');
 }
 if(action==='alliance'){
  if(current?.kind==='alliance')return fail('Союз уже заключён');
  if(current?.kind==='vassal')return fail('Вассальная присяга сильнее обычного союза');
  if(rel<25)return fail('Для союза требуется доверие не менее +25');
  if(s.renown<1)return fail('Для присяги союза нужна хотя бы одна военная слава');
 }
 if(action==='submission'){
  if(current?.kind==='vassal')return fail('Держава уже признала северную корону');
  if(owned(s,side)>2)return fail('У державы ещё слишком много самостоятельных земель');
  if(power>8 || north<Math.max(8,power+5))return fail('Армия противника ещё способна защитить независимость');
  if(s.renown<2)return fail('Для вассальной присяги требуется две военные славы');
 }
 if(action==='tribute'){
  if(current?.kind!=='vassal')return fail('Дань можно потребовать только от вассала');
  if(loyal<=25)return fail('Новая поборная дань приведёт к немедленному восстанию');
 }
 if(action==='charter'){
  if(current?.kind!=='vassal')return fail('Привилегии предоставляются только подчинённым вассалам');
  if(loyal>=95)return fail('Верность уже обеспечена');
 }
 if(action==='break'){
  if(!current||current.kind==='vassal')return fail('Нельзя порвать несуществующий договор или вассальную присягу');
 }
 return {ok:true,reason:'',cost:price};
}
export function negotiate(state,side,action){
 const check=diplomacyChoice(state,side,action);
 if(!check.ok)return rejected(state,check.reason);
 const s={...state,
   diplomacy:{relations:{...state.diplomacy.relations},treaties:state.diplomacy.treaties.map(t=>({...t})),coalitionUntil:state.diplomacy.coalitionUntil},
   history:[...state.history],sieges:state.sieges.map(t=>({...t}))};
 const d=s.diplomacy,prev=agreement(s,side);
 s.actions--;s.coins-=check.cost;
 if(action==='envoy'){d.relations[side]=clamp(d.relations[side]+26,-100,100);record(s,'Посольство к '+NAME[side]+': доверие теперь '+d.relations[side]+'.');}
 if(action==='truce'||action==='alliance'){
  d.treaties=d.treaties.filter(t=>t.side!==side);
  d.treaties.push({side,kind:action,until:s.season+(action==='truce'?3:4)});
  d.coalitionUntil=0;
  // Contracts stop hostilities immediately, even where a siege is already ongoing.
  s.sieges=s.sieges.filter(x=>!(
    (x.side===0&&s.provinces[x.to].owner===side)||
    (x.side===side&&s.provinces[x.to].owner===0)
  ));
  record(s,(action==='truce'?'Заключено перемирие с ':'Заключён союз с ')+NAME[side]+'.');
 }
 if(action==='submission'){
  d.treaties=d.treaties.filter(t=>t.side!==side);
  d.treaties.push({side,kind:'vassal',until:0,loyalty:66});
  d.coalitionUntil=0;
  s.sieges=s.sieges.filter(x=>!(
    (x.side===0&&s.provinces[x.to].owner===side)||
    (x.side===side&&s.provinces[x.to].owner===0)
  ));
  record(s,NAME[side]+' приносит вассальную присягу и сохраняет собственные земли.');
 }
 if(action==='tribute'){
  prev.loyalty-=24;s.coins=Math.min(9999,s.coins+6);
  record(s,'С '+NAME[side]+' взыскана чрезвычайная дань. Верность упала до '+prev.loyalty+'.');
 }
 if(action==='charter'){
  prev.loyalty=clamp(prev.loyalty+26,0,100);
  d.relations[side]=clamp(d.relations[side]+8,-100,100);
  record(s,'Грамота о привилегиях дарована '+NAME[side]+'. Верность '+prev.loyalty+'.');
 }
 if(action==='break'){
  d.treaties=d.treaties.filter(t=>t.side!==side);
  d.relations[side]=clamp(d.relations[side]-45,-100,100);
  s.renown=Math.max(0,s.renown-1);
  record(s,'Север разорвал договор с '+NAME[side]+'. Доверие утрачено.');
 }
 return {state:s,error:null};
}
export function warDiplomacy(s,owner,attacker,kind){
 if(owner===0&&[1,2].includes(attacker)&&peace(s,attacker))return false;
 if(attacker===0&&[1,2].includes(owner)&&peace(s,owner))return false;
 if([1,2].includes(owner)&&[1,2].includes(attacker)&&league(s))return false;
 return true;
}
export function recordWar(s,aggressor,defender){
 const foe=aggressor===0?defender:defender===0?aggressor:null;
 if(!SIDES.includes(foe))return;
 if(!s.diplomacy)return;
 s.diplomacy.relations[foe]=clamp(s.diplomacy.relations[foe]-(aggressor===0?18:7),-100,100);
}
export function nextPoliticalSeason(s){
 ensureDiplomacy(s);
 const d=s.diplomacy;
 for(const t of [...d.treaties]){
  if(owned(s,t.side)===0){
   d.treaties=d.treaties.filter(x=>x!==t);
   record(s,'Дом '+NAME[t.side]+' лишился владений: его договоры утратили силу.');
   continue;
  }
  if(t.kind!=='vassal' && t.until<s.season){
   d.treaties=d.treaties.filter(x=>x!==t);
   record(s,pactName(t)+' с '+NAME[t.side]+' завершено.');
  }else if(t.kind==='alliance'){
   d.relations[t.side]=clamp(d.relations[t.side]+3,-100,100);
  }else if(t.kind==='vassal'){
   // A vassal is never static: its own court slowly challenges the liege.
   t.loyalty=Math.max(0,t.loyalty-5);
   if(t.loyalty<=12){
    d.treaties=d.treaties.filter(x=>x!==t);
    d.relations[t.side]=-65;
    const where=s.provinces.findIndex(p=>p.owner===t.side);
    if(where>=0){
     s.provinces[where].garrison=Math.min(10,s.provinces[where].garrison+2);
     if(s.armies.length<80){
      s.armies.push({id:'army-'+s.nextArmy++,side:t.side,province:where,strength:6,used:true});
     }
    }
    record(s,NAME[t.side]+' отвергает присягу. Война возвращается на границы.');
   }
  }
 }
 if(d.coalitionUntil<s.season)d.coalitionUntil=0;
 const playerTerritories=owned(s,0),canCoalition=playerTerritories>=6&&
  [1,2].every(side=>owned(s,side)>0&&!peace(s,side));
 if(canCoalition && d.coalitionUntil===0){
  d.coalitionUntil=s.season+2;
  // The pact also ends battles of attrition between its signatories.
  s.sieges=s.sieges.filter(x=>!([1,2].includes(x.side) &&
    [1,2].includes(s.provinces[x.to].owner)));
  record(s,'Орден и Князья образуют оборонительную лигу против Севера.');
 }
 return s;
}
