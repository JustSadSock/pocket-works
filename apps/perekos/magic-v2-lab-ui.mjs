// PocketWorks-integrated rune forge for the first fully playable 0.29a
// offline vertical slice. Only combat-implemented cards can be obtained here.
import {
 createMagicLoadout,applyMagicEdit,grantEarnedMagicRune,
 validateMagicState,effectiveMagicForm,compileMagic
} from './magic-v2-rules.mjs';
import {MAGIC_V2_PRACTICE_RUNES,magicV2PracticeModifierFits} from './core.mjs';
import {MAGIC_RUNE_INDEX} from './magic-v2-rules.mjs';
import {MAGIC_TRANSFORMS} from './magic-v2-data.mjs';

const SCHOOL_LABELS={stone:'Камень',fire:'Огонь',storm:'Молния'};
const SCHOOL_EXPLAINS={
 stone:'Тяжёлые удары, каменные осколки и настоящие укрытия.',
 fire:'Огненные сгустки, ожоги и опасные участки земли.',
 storm:'Быстрые разряды и точные электрические атаки.'
};
const RARITY={common:'Обычная',uncommon:'Необычная',rare:'Редкая',epic:'Эпическая',transformation:'Преображение'};
const KIND={when:'КОГДА',do:'ЧТО',how:'КАК'};
const el=(tag,cls,text)=>{
 const n=document.createElement(tag);
 if(cls)n.className=cls;
 if(text!=null)n.textContent=text;
 return n;
};
const btn=(text,action,cls='')=>{
 const n=el('button',cls,text);
 n.type='button';n.addEventListener('click',action);
 return n;
};
export function installMagicV2Lab({root,onStart,onFight,onClose,getMatch,setLoadout,isRemote=()=>false,onServerEdit=()=>false}){
 let selectedSlot=0,status='',targetAction=0;
 const feedback=message=>{status=message;render()};
 const panel=el('div','v2-stage');
 root.append(panel);
 const change=action=>{
  const match=getMatch(),current=match?.magicLoadouts?.[0];
  if(!current){feedback('Сначала выбери стихию');return}
  const result=action(current);
  if(!result.ok){feedback(result.error);return}
  setLoadout(result.state);status='Изменения сохранены';render();
 };
 const edit=(type,fields={})=>{
  if(isRemote()){
   const book=getMatch()?.magicLoadouts?.[getMatch().magicSeat??0];
   if(!book){feedback('Сетевой гримуар пока недоступен');return}
   const command={type,slot:selectedSlot,revision:book.revision,nonce:'net-'+book.revision+'-'+type,...fields};
   if(!onServerEdit(command))feedback('Сервер не принял команду');
   return;
  }
  change(current=>applyMagicEdit(current,{
   type,slot:selectedSlot,revision:current.revision,nonce:'ui-'+current.revision,...fields
  }));
 };
 const add=(id)=>change(current=>grantEarnedMagicRune(current,id));
 function render(){
  const previousScroll=panel.scrollTop;
  panel.replaceChildren();
  const match=getMatch(),remote=isRemote(),book=match?.magicModeV2?match.magicLoadouts[remote?(match.magicSeat??0):0]:null;
  if(!book){
   panel.append(el('div','v2-kicker','ПЕРЕКОС / ЭКСПЕРИМЕНТАЛЬНАЯ КУЗНИЦА'));
   panel.append(el('h2','','Начни с одной стихии'));
   panel.append(el('p','v2-copy','Это настоящая тренировка с коллизиями и манекеном. Здесь доступны только уже реализованные руны; действующие онлайн-комнаты не затрагиваются.'));
   const schools=el('div','v2-schools');
   for(const [school,label] of Object.entries(SCHOOL_LABELS)){
    const card=btn(label+' ↗',()=>{selectedSlot=0;status='';onStart(school);render()},'v2-school v2-'+school);
    card.append(el('small','',SCHOOL_EXPLAINS[school]));schools.append(card);
   }
   panel.append(schools,btn('Вернуться в меню',()=>onClose(),'v2-exit'));
   return;
  }
  const check=validateMagicState(book);
  panel.append(el('div','v2-kicker','МАГИЯ 2.0 / '+SCHOOL_LABELS[book.school]));
  const head=el('div','v2-top');
  const title=el('div','');title.append(el('h2','','Собери свою магию'),el('small','', '3 слота · до 1 КОГДА / 2 ЧТО / 2 КАК · печати навсегда'));
  head.append(title,btn('В бой ↗',()=>{
    if(!check.ok){feedback(check.error);return}
    status='';onFight();
  },'v2-play'));
  panel.append(head);
  const form=effectiveMagicForm(book);
  const shape=form.ok&&form.shape?MAGIC_RUNE_INDEX.get(form.shape):null;
  if(shape){
   const chosen=[form.shape,form.origin,form.motion,form.impact].filter(Boolean);
   const recipe=MAGIC_TRANSFORMS.recipes.find(r=>r.school===book.school&&r.requires.every(id=>chosen.includes(id)));
   const summary=el('div','v2-form-summary');
   summary.append(el('strong','',recipe?.name||shape.name));
   summary.append(el('p','',recipe?.effect||shape.effect));
   summary.append(el('small','',form.origin
    ?'Источник: '+(MAGIC_RUNE_INDEX.get(form.origin)?.name||'неизвестен')
    :'Источник: обычная точка атаки'));
   panel.append(summary);
  }else if(book.slots.some(sp=>sp.actions.some(a=>a.rune.defId==='u_reform_base'))){
   panel.append(el('p','v2-empty','Преображение начато: присоедини КАК с формой, чтобы заменить базовую атаку.'));
  }
  const tools=el('div','v2-tools');
  tools.append(btn(remote?'Покинуть комнату':'В меню',()=>{
    if(window.confirm(remote?'Покинуть сетевую комнату?':'Закончить тренировку? Несохранённая магия этой партии будет потеряна.'))onClose();
  }));if(!remote)tools.append(btn('Сменить стихию',()=>{
    if(window.confirm('Начать новую тренировку? Все руны и печати текущей партии будут потеряны.')){
      onStart(null);selectedSlot=0;status='';render();
    }
  }));
  panel.append(tools);
  const tabs=el('div','v2-tabs');
  for(let i=0;i<3;i++){
   const count=(book.slots[i].when?1:0)+book.slots[i].actions.reduce((sum,a)=>sum+1+a.mods.length,0);
   tabs.append(btn('ЗАКЛИНАНИЕ '+(i+1)+' · '+count+'/5',()=>{selectedSlot=i;targetAction=0;status='';render()},'v2-tab'+(selectedSlot===i?' selected':'')));
  }
  panel.append(tabs);
  const spell=book.slots[selectedSlot],details=el('div','v2-editor');
  details.append(el('h3','','Заклинание '+(selectedSlot+1)));
  const remove=instanceId=>edit('unequip',{instanceId});
  const runeRow=(instance,kind)=>{
   const def=MAGIC_RUNE_INDEX.get(instance.defId),row=el('div','v2-installed');
   row.append(el('span','v2-tag',kind),el('strong','',def?.name||instance.defId));
   row.append(btn('Убрать',()=>remove(instance.instanceId),'v2-remove'));
   return row;
  };
  if(spell.when)details.append(runeRow(spell.when,'КОГДА'));
  else details.append(el('p','v2-empty','Нет условия. Добавь «Когда», чтобы действие срабатывало.'));
  for(const [i,action] of spell.actions.entries()){
   const group=el('div','v2-action');
   group.append(runeRow(action.rune,'ЧТО '+(i+1)));
   for(const mod of action.mods)group.append(runeRow(mod,'КАК → '+(i+1)));
   details.append(group);
  }
  if(!spell.actions.length)details.append(el('p','v2-empty','Добавь «Что» — настоящее действие твоей стихии.'));
  const seal=btn('Запечатать комбинацию',()=>{
   if(!window.confirm(remote?'Запечатать до конца сетевого матча? Сервер запретит возвращать эти руны.':'Запечатать заклинание навсегда до конца тренировки? Вернуть или заменить руны будет нельзя.'))return;
   edit('seal');
  },'v2-seal');
  seal.disabled=!spell.actions.length;
  details.append(seal);
  panel.append(details);
  const reserve=el('section','v2-reserve');
  reserve.append(el('h3','','Полученные руны · '+book.reserve.length));
  if(!book.reserve.length)reserve.append(el('p','v2-empty','Пока нет свободных рун. Возьми новые ниже.'));
  const slotActionCount=spell.actions.length;
  for(const instance of book.reserve){
   const def=MAGIC_RUNE_INDEX.get(instance.defId);
   const item=el('div','v2-reserve-item');
   item.append(el('div','v2-item-name',def.name));
   item.append(el('small','',KIND[def.kind]+' · '+RARITY[def.rarity]));
   if(def.kind==='how'){
    for(let j=0;j<slotActionCount;j++){
     const fits=magicV2PracticeModifierFits(spell.actions[j].rune.defId,def.id);
     if(fits)item.append(btn('К '+(j+1),()=>edit('equip',{instanceId:instance.instanceId,action:j}),'v2-equip'));
    }
    if(!spell.actions.some(a=>magicV2PracticeModifierFits(a.rune.defId,def.id)))
     item.append(el('small','','Не подходит к этому ЧТО'));
   }else item.append(btn('В слот',()=>edit('equip',{instanceId:instance.instanceId}),'v2-equip'));
   reserve.append(item);
  }
  panel.append(reserve);
  const seals=el('section','v2-seals');
  seals.append(el('h3','','Запечатанные комбинации · '+book.sealed.length));
  if(!book.sealed.length)seals.append(el('p','v2-empty','Печати ещё не созданы.'));
  for(const [i,spell] of book.sealed.entries()){
   const names=spell.actions.map(a=>MAGIC_RUNE_INDEX.get(a.rune.defId)?.name).join(' + ');
   seals.append(el('div','v2-sealed','ПЕЧАТЬ '+(i+1)+' · '+names+' · НЕИЗМЕНЯЕМА'));
  }
  panel.append(seals);
  const catalogue=el('section','v2-catalogue');
  catalogue.append(el('h3','','Добавить руну'));
  catalogue.append(el('p','v2-hint','В кузнице можно экспериментировать без ограничений по времени. В PvP получение рун будет ограничено ходом партии.'));
  const existing=new Set([...book.reserve,...book.slots.flatMap(s=>[
   ...(s.when?[s.when]:[]),...s.actions.flatMap(a=>[a.rune,...a.mods])
  ])].map(inst=>inst.defId));
  const allowed=MAGIC_V2_PRACTICE_RUNES.map(id=>MAGIC_RUNE_INDEX.get(id))
   .filter(def=>def&&(def.school==='common'||def.school===book.school))
   .filter(def=>!existing.has(def.id));
  if(!allowed.length)catalogue.append(el('p','v2-empty','Все доступные для этого этапа руны уже получены. Запечатай комбинацию, чтобы освободить их типы для повторного получения.'));
  for(const kind of ['when','do','how']){
   const sectionCards=allowed.filter(d=>d.kind===kind);
   if(!sectionCards.length)continue;
   catalogue.append(el('h4','',KIND[kind]));
   const grid=el('div','v2-cards');
   for(const def of sectionCards){
    const card=btn(def.name,()=>add(def.id),'v2-card');
    card.append(el('small','',RARITY[def.rarity]+' · '+def.effect));
    grid.append(card);
   }
   catalogue.append(grid);
  }
  if(!remote)panel.append(catalogue);
  else panel.append(el('p','v2-hint','Сервер выдал одинаковый запас рун обоим игрокам. Всё редактирование и запечатывание проверяются PocketNet.'));
  const notice=el('p','v2-notice',status||(remote?'Сетевая сборка сохраняется на сервере.':'Все изменения действуют в следующем бою.'));
  notice.setAttribute('role','status');panel.append(notice);
  // Receiving an acknowledged remote edit should not throw a player who is
  // browsing their rune reserve back to the top of this scrollport.
  panel.scrollTop=previousScroll;
 }
 return {render,open:()=>{selectedSlot=0;status='';render()},setStatus:feedback};
}
