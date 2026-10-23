// PEREKOS magic v2: pure, deterministic spell assembly and state transitions.
// This module deliberately has NO DOM, storage, audio, timers, network or RNG side effects.
// It is the same rule contract intended for a new immutable PocketNet version.
// The v0.28 match rules remain in force until the full new match+UI is ready.
import {MAGIC_RUNES,MAGIC_SCHOOLS,MAGIC_TRANSFORMS,MAGIC_DESIGN_RULES} from './magic-v2-data.mjs';

export const MAGIC_RULES_VERSION=2;
export const MAGIC_RUNE_INDEX=new Map(MAGIC_RUNES.map(card=>[card.id,card]));
export const MAGIC_RARITIES=Object.freeze(['common','uncommon','rare','epic','transformation']);
export const MAGIC_SLOT_CAPS=Object.freeze({...MAGIC_DESIGN_RULES.spellLimits});
const BASIC_ATTACK=Object.freeze({stone:'st_throw',fire:'fi_ember',storm:'li_spark'});
const LEGACY_SCHOOLS=Object.freeze({
 kindle:'fire',cinder:'fire',wire:'storm',coil:'storm',pebble:'stone',slate:'stone',
 fire:'fire',storm:'storm',stone:'stone'
});
const LEGACY_MAPPING=Object.freeze({
 on_cast:'u_on_cast',on_hit:'u_on_hit',on_hurt:'u_on_hurt',
 on_dash:'u_after_dash',on_guard:'u_after_guard',on_expire:'u_on_expire',
 on_bounce:'u_on_barrier',armor:'u_guard',heal:'u_heal',
 push:'u_push',clone:'u_afterimage',double:'u_split',
 lasting:'u_duration',wide:'u_size',far:'u_range',
 fastshot:'u_speed',bounce:'u_ricochet',cheap:'u_efficient',
 ball:'@attack',mine:'@mine',wall:'@wall'
});
const FORMS={
 stone:new Set(['st_throw','st_shards','st_spikes','st_fault','st_tremor']),
 fire:new Set(['fi_ember','fi_scorch','fi_lash','fi_inferno']),
 storm:new Set(['li_spark','li_arc','li_link','li_discharge'])
};
const FORBIDDEN=new Set(MAGIC_TRANSFORMS.explicitlyForbidden.map(p=>[...p].sort().join(':')));
const copy=value=>JSON.parse(JSON.stringify(value));
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const card=id=>MAGIC_RUNE_INDEX.get(id)||null;
const idOf=owned=>owned?.defId;
const activeRunes=spell=>[
 ...(spell.when?[spell.when]:[]),
 ...spell.actions.flatMap(a=>[a.rune,...a.mods])
];
export const spellRuneCount=spell=>activeRunes(spell).length;
export const permittedRune=(school,id)=>{
 const def=card(id);
 return !!def &&(def.school==='common'||def.school===school);
};
const newSlot=id=>({id,when:null,actions:[]});
const invalid=(s,message)=>({ok:false,error:message,state:s});
const valid=(s)=>({ok:true,state:s,error:null});
const currentRevision=(s,command)=>{
 if(!Number.isInteger(command.revision)||s.revision!==command.revision)return false;
 if(command.nonce!=null&&(typeof command.nonce!=='string'||command.nonce.length<1||command.nonce.length>64))return false;
 return true;
};
const transformPair=(a,b)=>[a,b].sort().join(':');
function scopeFor(spell,action){
 const def=card(idOf(action.rune));
 return def?.id==='u_reform_base'?'base':def?.id;
}
function validateAction(def,mod){
 if(mod.rarity!=='transformation')return true;
 if(def.id==='u_reform_base')return true;
 if(def.school!==mod.school)return false;
 return !!FORMS[def.school]?.has(def.id);
}
function effectiveTransforms(spells){
 const byScope=new Map();
 for(const spell of spells){
  for(const action of spell.actions){
   const key=scopeFor(spell,action);
   for(const instance of action.mods){
    const def=card(idOf(instance));
    if(def?.rarity!=='transformation')continue;
    const keyName=key==='base'?'base':spell.id+':'+key;
    const aspects=byScope.get(keyName)||new Map();
    for(const prev of aspects.values()){
     if(prev.id===def.id)continue;
     if(prev.aspect===def.aspect||FORBIDDEN.has(transformPair(prev.id,def.id)))return {error:'Несовместимые преображения: '+prev.name+' и '+def.name};
    }
    aspects.set(def.aspect,def);byScope.set(keyName,aspects);
   }
  }
 }
 return {scopes:byScope};
}
export function validateMagicSpell(spell,{requireReady=false}={}){
 if(!spell||!Array.isArray(spell.actions)||!Number.isInteger(spell.id))return {ok:false,error:'Повреждён слот заклинания'};
 if(spell.actions.length>MAGIC_SLOT_CAPS.do)return {ok:false,error:'В заклинании не больше двух ЧТО'};
 if(spellRuneCount(spell)>5)return {ok:false,error:'В заклинании не больше пяти рун'};
 if(spell.when&&card(idOf(spell.when))?.kind!=='when')return {ok:false,error:'Неверная руна КОГДА'};
 let modCount=0,passiveCount=0;
 for(const a of spell.actions){
  const d=card(idOf(a.rune));
  if(!d||d.kind!=='do'||!Array.isArray(a.mods))return {ok:false,error:'Неверная руна ЧТО'};
  if(d.id==='u_reform_base')passiveCount++;
  for(const m of a.mods){
   const md=card(idOf(m));
   if(!md||md.kind!=='how'||!validateAction(d,md))return {ok:false,error:'Это КАК не подходит выбранному действию'};
   modCount++;
  }
 }
 if(modCount>MAGIC_SLOT_CAPS.how)return {ok:false,error:'В заклинании не больше двух КАК'};
 if(passiveCount&&(passiveCount!==1||spell.actions.length!==1||spell.when))return {ok:false,error:'Преображение основы должно быть самостоятельным без КОГДА'};
 if(requireReady){
  if(spell.actions.length===0)return {ok:false,error:'Нельзя использовать пустое заклинание'};
  if(passiveCount&&!spell.actions[0].mods.some(m=>card(idOf(m))?.rarity==='transformation'))return {ok:false,error:'Для преображения нужна руна формы'};
  if(!passiveCount&&!spell.when)return {ok:false,error:'Заклинанию нужна руна КОГДА'};
 }
 const compatible=effectiveTransforms([spell]);
 if(compatible.error)return {ok:false,error:compatible.error};
 return {ok:true,error:null};
}
function allSpells(state){return [...state.sealed,...state.slots]}
export function validateMagicState(s){
 if(!s||s.rulesetVersion!==MAGIC_RULES_VERSION||!MAGIC_SCHOOLS.includes(s.school)||!Number.isInteger(s.revision)||s.revision<0)return {ok:false,error:'Неизвестные правила или стихия'};
 if(!Array.isArray(s.reserve)||!Array.isArray(s.slots)||s.slots.length!==3||!Array.isArray(s.sealed)||!Number.isInteger(s.nextInstance))return {ok:false,error:'Повреждён гримуарий'};
 // A network or saved-state payload may contain malformed nested arrays. Reject
 // it before enumerating rune instances rather than throwing from flatMap.
 const spells=[...s.slots,...s.sealed];
 if(spells.some(spell=>!spell||typeof spell!=='object'||!Array.isArray(spell.actions)||
    spell.actions.some(a=>!a||!a.rune||!Array.isArray(a.mods))||
    (spell.when!==null&&spell.when!==undefined&&typeof spell.when!=='object')))
  return {ok:false,error:'Повреждена структура заклинаний'};
 if(!s.slots.every((slot,i)=>slot.id===i))return {ok:false,error:'Неверные номера трёх слотов'};
 if(!s.sealed.every((slot,i)=>slot.id===3+i))return {ok:false,error:'Повреждён порядок печатей'};
 const seen=new Set();
 for(const instance of [...s.reserve,...allSpells(s).flatMap(activeRunes)]){
  if(!instance||!Number.isSafeInteger(instance.instanceId)||instance.instanceId<1||
    !permittedRune(s.school,instance.defId)||seen.has(instance.instanceId))return {ok:false,error:'Дубликат или чужая руна'};
  seen.add(instance.instanceId);
 }
 if(seen.size>=s.nextInstance)return {ok:false,error:'Повреждён счётчик экземпляров рун'};
 for(const spell of s.slots){
  const check=validateMagicSpell(spell);
  if(!check.ok)return check;
 }
 for(const spell of s.sealed){
  const check=validateMagicSpell(spell,{requireReady:true});
  if(!check.ok)return check;
 }
 const transformations=effectiveTransforms(allSpells(s));
 if(transformations.error)return {ok:false,error:transformations.error};
 if(!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff)return {ok:false,error:'Повреждён seed'};
 if(!Array.isArray(s.offers)||s.offers.some(id=>!permittedRune(s.school,id)))return {ok:false,error:'Чужие предложения'};
 if(!Array.isArray(s.nonces)||s.nonces.length>48||s.nonces.some(n=>typeof n!=='string'||n.length>64))return {ok:false,error:'Повреждён журнал команд'};
 return {ok:true,error:null};
}
const makeInstance=(s,id)=>({instanceId:s.nextInstance++,defId:id});
export function createMagicLoadout(school,{seed=1,starter='defense'}={}){
 if(!MAGIC_SCHOOLS.includes(school))throw new RangeError('Unknown school');
 const s={rulesetVersion:MAGIC_RULES_VERSION,school,seed:(seed>>>0)||1,revision:0,
  reserve:[],slots:[newSlot(0),newSlot(1),newSlot(2)],sealed:[],
  offers:[],nextInstance:1,nonces:[]};
 const starterCards=starter==='attack'?['u_on_hit',BASIC_ATTACK[school]]:
  starter==='mobility'?['u_after_dash','u_guard']:['u_on_hurt','u_guard'];
 s.slots[0].when=makeInstance(s,starterCards[0]);
 s.slots[0].actions.push({rune:makeInstance(s,starterCards[1]),mods:[]});
 if(!validateMagicState(s).ok)throw Error('Invalid starter');
 return s;
}
export const availableMagicRunes=school=>MAGIC_RUNES.filter(r=>permittedRune(school,r.id));
export function compileMagic(s,{includeUnfinished=false}={}){
 const result=[];
 for(const spell of allSpells(s)){
  const check=validateMagicSpell(spell,{requireReady:true});
  if(!includeUnfinished&&!check.ok)continue;
  result.push({
   slotId:spell.id,sealed:spell.id>=3,ready:check.ok,
   trigger:spell.when?.defId||null,
   actions:spell.actions.map(a=>({
    id:a.rune.defId,instanceId:a.rune.instanceId,
    mods:a.mods.map(m=>m.defId)
   }))
  });
 }
 return result;
}
export function effectiveMagicForm(s){
 const transforms=effectiveTransforms(allSpells(s));
 if(transforms.error)return {ok:false,error:transforms.error};
 const base=transforms.scopes.get('base')||new Map();
 return {ok:true,school:s.school,shape:base.get('shape')?.id||null,
  origin:base.get('origin')?.id||null,
  motion:base.get('motion')?.id||null,
  impact:base.get('impact')?.id||null};
}
function editInner(s,cmd){
 const slot=s.slots[cmd.slot];
 if(!slot)return 'Нет такого слота';
 if(cmd.type==='equip'){
  const idx=s.reserve.findIndex(r=>r.instanceId===cmd.instanceId);
  if(idx<0)return 'Руна не принадлежит игроку или уже установлена';
  const inst=s.reserve[idx],def=card(inst.defId);
  if(def.kind==='when'){
   if(slot.when||slot.actions.some(a=>idOf(a.rune)==='u_reform_base'))return 'Нельзя добавить второе КОГДА';
   slot.when=inst;
  }else if(def.kind==='do'){
   if(slot.actions.length>=2)return 'Не больше двух ЧТО';
   if(def.id==='u_reform_base'&&(slot.when||slot.actions.length>0))return 'Преображение основы — отдельное заклинание';
   if(slot.actions.some(a=>idOf(a.rune)==='u_reform_base'))return 'К пассивной форме нельзя добавить второе ЧТО';
   slot.actions.push({rune:inst,mods:[]});
  }else{
   if(!Number.isInteger(cmd.action)||cmd.action<0||cmd.action>=slot.actions.length)return 'Сначала укажи ЧТО, которое изменяет КАК';
   if(slot.actions.reduce((n,a)=>n+a.mods.length,0)>=2)return 'Не больше двух КАК';
   if(!validateAction(card(idOf(slot.actions[cmd.action].rune)),def))return 'Руна КАК несовместима с действием';
   slot.actions[cmd.action].mods.push(inst);
  }
  s.reserve.splice(idx,1);
 }else if(cmd.type==='unequip'){
  if(slot.when?.instanceId===cmd.instanceId){s.reserve.push(slot.when);slot.when=null;return null}
  const index=slot.actions.findIndex(a=>a.rune.instanceId===cmd.instanceId);
  if(index>=0){const [removed]=slot.actions.splice(index,1);s.reserve.push(removed.rune,...removed.mods);return null}
  for(const a of slot.actions){
   const modIndex=a.mods.findIndex(m=>m.instanceId===cmd.instanceId);
   if(modIndex>=0){s.reserve.push(...a.mods.splice(modIndex,1));return null}
  }
  return 'Руна отсутствует в редактируемом слоте';
 }else if(cmd.type==='seal'){
  const ready=validateMagicSpell(slot,{requireReady:true});
  if(!ready.ok)return ready.error;
  const seal=copy(slot);seal.id=s.sealed.length+3;
  s.sealed.push(seal);s.slots[cmd.slot]=newSlot(cmd.slot);
 }else return 'Неизвестное действие редактора';
 return null;
}
export function applyMagicEdit(state,command){
 const first=validateMagicState(state);
 if(!first.ok)return invalid(state,first.error);
 if(!command||typeof command!=='object'||!currentRevision(state,command))return invalid(state,'Устаревшая версия сборки');
 if(command.nonce!=null&&state.nonces.includes(command.nonce))return invalid(state,'Повторная команда');
 if(!['equip','unequip','seal'].includes(command.type))return invalid(state,'Команда не разрешена');
 if(!Number.isInteger(command.slot)||command.slot<0||command.slot>=3)return invalid(state,'Нет такого слота');
 const draft=copy(state);
 const error=editInner(draft,command);
 if(error)return invalid(state,error);
 const check=validateMagicState(draft);
 if(!check.ok)return invalid(state,check.error);
 draft.revision++;
 if(command.nonce!=null){draft.nonces.push(command.nonce);if(draft.nonces.length>48)draft.nonces.shift()}
 return valid(draft);
}
export function grantEarnedMagicRune(state,id){
 const check=validateMagicState(state);
 if(!check.ok)return invalid(state,check.error);
 if(!permittedRune(state.school,id))return invalid(state,'Чужая стихия или неизвестная руна');
 // Different *instances* of the same card are intentional: a sealed rune is
 // permanently consumed, but another copy may be earned later in this match.
 if(state.nextInstance>80)return invalid(state,'Достигнут предел рун за партию');
 const s=copy(state);s.reserve.push(makeInstance(s,id));s.revision++;
 return valid(s);
}
const rarityWeights=[
 {common:60,uncommon:30,rare:9,epic:1,transformation:0},
 {common:35,uncommon:35,rare:20,epic:7,transformation:3},
 {common:20,uncommon:30,rare:28,epic:13,transformation:9}
];
const roll=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296};
const takeWeighted=(s,pool,weights)=>{
 const total=pool.reduce((sum,c)=>sum+(weights[c.rarity]||0),0);
 if(total<=0)return -1;
 let x=roll(s)*total;
 for(let i=0;i<pool.length;i++){x-=weights[pool[i].rarity]||0;if(x<0)return i}
 return pool.length-1;
};
export function dealMagicOffers(state,minute){
 const check=validateMagicState(state);
 if(!check.ok)return invalid(state,check.error);
 if(!Number.isInteger(minute)||minute<1||minute>9)return invalid(state,'Неверный этап Разлома');
 if(state.offers.length)return invalid(state,'Сначала выбери предложенную руну');
 const s=copy(state),available=new Set([...s.reserve,...allSpells(s).flatMap(activeRunes)].map(r=>r.defId));
 // Cards held in reserve/editable slots do not crowd the offer. Sealed copies
 // can reappear later, so early sealing never makes the rest of the match dead.
 const heldOutsideSeals=new Set([...s.reserve,...s.slots.flatMap(activeRunes)].map(r=>r.defId));
 const pool=availableMagicRunes(s.school).filter(r=>!heldOutsideSeals.has(r.id));
 const weights=rarityWeights[minute<=2?0:minute<=5?1:2];
 const picked=[];
 // On milestone minutes guarantee at least one *offer*, never a forced selection.
 if(minute===4||minute===7){
  const upgrades=pool.filter(r=>r.rarity==='transformation');
  if(upgrades.length){const choice=upgrades[Math.floor(roll(s)*upgrades.length)];picked.push(choice.id);pool.splice(pool.indexOf(choice),1)}
 }
 while(pool.length&&picked.length<3){
  const choice=takeWeighted(s,pool,weights);
  if(choice<0)break;
  picked.push(pool.splice(choice,1)[0].id);
 }
 s.offers=picked;s.revision++;
 return valid(s);
}
export function claimMagicOffer(state,id,revision){
 const check=validateMagicState(state);
 if(!check.ok)return invalid(state,check.error);
 if(!Number.isInteger(revision)||state.revision!==revision)return invalid(state,'Устаревшее предложение');
 if(!state.offers.includes(id))return invalid(state,'Руна не была предложена');
 const draft=copy(state);draft.offers=[];draft.reserve.push(makeInstance(draft,id));draft.revision++;
 return valid(draft);
}
export function previewLegacyMagic(legacy){
 const oldMage=legacy?.mageId||legacy?.mage||legacy?.school;
 const school=LEGACY_SCHOOLS[oldMage]||null;
 const oldRunes=Array.isArray(legacy?.runes)?legacy.runes:[];
 const mapped=[],unmapped=[];
 for(const old of oldRunes){
  let converted=LEGACY_MAPPING[old];
  if(converted==='@attack')converted=school&&BASIC_ATTACK[school];
  if(converted==='@wall')converted=school==='stone'?'st_wall':null;
  if(converted==='@mine')converted=school==='fire'?'fi_cindermine':school==='storm'?'li_coil':null;
  if(school&&permittedRune(school,converted)&&!mapped.some(x=>x.to===converted))mapped.push({from:old,to:converted});
  else unmapped.push(old);
 }
 return {supported:!!school,school,mapped,unmapped,original:copy(legacy||{})};
}
export function migrateLegacyMagic(legacy,{confirmed=false,seed=1}={}){
 const preview=previewLegacyMagic(legacy);
 if(!confirmed||!preview.supported)return {ok:false,needsConfirmation:!confirmed,preview,state:null};
 let s=createMagicLoadout(preview.school,{seed,starter:'defense'});
 // Keep existing starter equipped, and put extra compatible cards into reserve.
 for(const r of preview.mapped){
  if([...s.reserve,...allSpells(s).flatMap(activeRunes)].some(a=>a.defId===r.to))continue;
  s=grantEarnedMagicRune(s,r.to).state;
 }
 return {ok:true,needsConfirmation:false,preview,state:s};
}
