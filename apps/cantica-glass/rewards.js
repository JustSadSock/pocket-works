import {canticaAchievements} from '../../shared/capabilities/cantica-achievements.js';
const STORAGE='pocket-works:cantica-glass:pending-proofs-v1';
const $=id=>document.getElementById(id);
const asInt=n=>Number.isInteger(n)&&n>=0?n:0;
const caption={
 title:'Титул',background:'Фон профиля',portraitFrame:'Рамка портрета',
 hat:'Головной убор',accessory:'Аксессуар',clothes:'Одежда'
};
export function createCanticaRewards({onAward=()=>{}}={}){
 let accountId='',verified=0,earned=new Set(),bests=new Map();
 let status='loading',message='Синхронизация Pocket ID…',processing=false,visible=false,priorFocus=null;
 const shelf=$('rewardShelf'),entries=$('rewardCards');
 const read=()=>{try{const a=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(a)?a:[]}catch{return []}};
 const write=list=>{try{localStorage.setItem(STORAGE,JSON.stringify(list.slice(-100)))}catch{}};
 const pending=()=>read().filter(p=>p.accountId===accountId);
 const goal=()=>{
  if(verified<1)return {name:'Первый луч',need:1};
  if(verified<10)return {name:'Малый свод',need:10};
  if(verified<25)return {name:'Лунная часовня',need:25};
  if(verified<50)return {name:'Золотая роза',need:50};
  if(verified<100)return {name:'Хранитель света',need:100};
  return {name:'Великая книга',need:500};
 };
 function display(){
  const count=earned.size;
  if($('rewardCount'))$('rewardCount').textContent=count+' / '+canticaAchievements.length;
  if($('rewardVerified'))$('rewardVerified').textContent=String(verified)+' / 500';
  if($('rewardGoal')){
   const next=goal();
   $('rewardGoal').textContent=verified>=500?'Книга завершена':next.name;
   $('rewardGoalValue').textContent=verified>=500?'500 / 500':verified+' / '+next.need;
   $('rewardGoalFill').style.width=Math.min(100,verified/next.need*100)+'%';
  }
  if($('rewardSync'))$('rewardSync').textContent=status==='guest'?'Нужен Pocket ID':
    status==='error'?'Не удалось проверить награды':
    status==='loading'?'Загружаем награды…':
    pending().length?'Неотправленные результаты: '+pending().length:message;
  const medal=$('rewardMedal');
  if(medal)medal.textContent=count?'✧ '+count:'✧';
  if(visible)renderShelf();
 }
 function renderShelf(){
  if(!entries)return;
  entries.replaceChildren();
  for(const a of canticaAchievements){
   const acquired=earned.has(a.id);
   const card=document.createElement('article');
   card.className='reward-entry'+(acquired?' is-earned':'');
   const mark=document.createElement('span');
   mark.className='reward-glyph';mark.textContent=acquired?'✦':'◇';
   const info=document.createElement('div');info.className='reward-entry-copy';
   const title=document.createElement('strong');title.textContent=a.name;
   const tier=document.createElement('small');tier.textContent=a.tier+' · '+(acquired?'Получено':'Не открыто');
   const description=document.createElement('p');description.textContent=a.detail;
   const reward=document.createElement('em');reward.textContent=a.reward;
   info.append(title,tier,description,reward);card.append(mark,info);entries.append(card);
  }
  const shelfCount=$('shelfCount');if(shelfCount)shelfCount.textContent=earned.size+' / '+canticaAchievements.length;
  const notice=$('shelfNotice');
  if(notice)notice.textContent=status==='ready'?
    'Награды выдаются после проверки поворотов на сервере. Примерить можно в Pocket ID.':
    status==='guest'?'Войди в Pocket ID: без аккаунта прохождение доступно, но награды в профиль не выдаются.':
    status==='loading'?'Загружаем подтверждённые достижения…':
    'Нет связи с Pocket Social. Локальные результаты сохранены; подтверждение появится после подключения.';
 }
 function open(){
  if(visible)return;
  priorFocus=document.activeElement;visible=true;
  shelf.hidden=false;shelf.setAttribute('aria-hidden','false');
  renderShelf();
  $('rewardClose')?.focus({preventScroll:true});
 }
 function close(){
  if(!visible)return;
  visible=false;shelf.hidden=true;shelf.setAttribute('aria-hidden','true');
  if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});priorFocus=null;
 }
 async function request(path,body){
  const response=await fetch('/pocket-social/cantica/'+path,{
   method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
   headers:body?{'content-type':'application/json'}:{},
   body:body?JSON.stringify(body):undefined
  });
  const result=await response.json().catch(()=>({error:'invalid_response'}));
  if(!response.ok){const error=new Error(result.error||'network');error.status=response.status;throw error;}
  return result;
 }
 async function init(){
  status='loading';display();
  try{
   const result=await request('progress');
   if(!result?.accountId)throw Error('invalid_response');
   accountId=result.accountId;
   verified=asInt(result.completed);
   earned=new Set((result.achievements||[]).map(a=>a.id).filter(id=>canticaAchievements.some(a=>a.id===id)));
   bests=new Map((result.best||[]).map(x=>[x.level,x.moves]));
   status='ready';message='Награды подтверждены сервером';
   display();void flush();
  }catch(error){
   status=error.status===401?'guest':'error';
   message=error.message||'Нет соединения';display();
  }
 }
 async function flush(){
  if(processing||!accountId||status!=='ready')return;
  processing=true;
  try{
   for(const queued of pending()){
    try{
     const result=await request('complete',{level:queued.level,variant:queued.variant,turns:queued.turns});
     verified=asInt(result.completed);
     const old=read(),idx=old.findIndex(p=>p.accountId===accountId&&p.level===queued.level&&p.variant===queued.variant);
     if(idx>=0){old.splice(idx,1);write(old)}
     for(const id of result.awarded||[]){
      if(earned.has(id))continue;
      earned.add(id);const award=canticaAchievements.find(a=>a.id===id);
      if(award)onAward(award);
     }
     bests.set(queued.level,result.bestMoves);
     message='Прогресс сохранён в Pocket ID';
     display();
    }catch(error){
     if(error.status===400){
      const left=read().filter(p=>!(p.accountId===accountId&&p.level===queued.level&&p.variant===queued.variant));
      write(left);message='Один неподтверждённый результат отклонён';display();continue;
     }
     message='Сервер недоступен: результаты ожидают синхронизации';display();break;
    }
   }
  }finally{processing=false;display()}
 }
 function complete(payload){
  if(!accountId||status!=='ready')return;
  if(!Array.isArray(payload.turns)||payload.turns.length<1||payload.turns.length>512){
   message='Слишком длинное прохождение: результат не подтверждён';display();return;
  }
  const queue=read();
  if(!queue.some(p=>p.accountId===accountId&&p.level===payload.level&&p.variant===payload.variant)){
   queue.push({...payload,accountId});write(queue);
  }
  void flush();
 }
 for(const el of document.querySelectorAll('.rewards-open'))el.addEventListener('click',open);
 $('rewardClose')?.addEventListener('click',close);
 $('rewardRefresh')?.addEventListener('click',()=>{void init()});
 shelf?.addEventListener('pointerdown',event=>{if(event.target===shelf)close()});
 shelf?.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.stopPropagation();event.preventDefault();close();return}
   if(event.key==='Tab'){
    const items=[...shelf.querySelectorAll('button:not(:disabled),a[href]')];
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&status==='ready')void flush()});
 window.addEventListener('online',()=>{void init()});
 void init();
 return {complete,open,close,isVisible:()=>visible,refresh:()=>void init()};
}
