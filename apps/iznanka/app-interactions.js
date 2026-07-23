function interact() {
  if(runtime.mode!=='playing'||player.dead) return;
  const target=runtime.nearby;
  if(!target){ showToast('Рядом нечего трогать'); return; }
  sound.ui();
  if(target.kind==='npc') talkTo(target.data);
  if(target.kind==='chest') openChest(target.data);
  if(target.kind==='shrine') useShrine();
  if(target.kind==='portal') usePortal(target.data);
}

function talkTo(npc) {
  if(npc.id==='mira'){
    if(runtime.save.quest.stage===0){
      showDialogue(DIALOGUES.mira.intro,()=>{ runtime.save.quest.stage=1; runtime.save.world.talked.mira=true; persistSave(); updateHud(); showToast('Обучение началось'); });
    } else if(runtime.save.quest.stage===1 && runtime.save.world.shrineSeen && runtime.save.quest.tutorialKills>=3 && runtime.save.quest.tutorialRuptures>=1){
      showDialogue(DIALOGUES.mira.ready,()=>{ runtime.save.quest.stage=2; persistSave(); updateHud(); showToast('Сад и Затопленные улицы открыты'); });
    } else if(runtime.save.quest.stage===1) showDialogue(DIALOGUES.mira.waiting);
    else showDialogue(DIALOGUES.mira.later);
    return;
  }
  if(npc.id==='rag') { openRagShop(); return; }
  if(npc.id==='weaver-before'){
    if(runtime.save.quest.seals.length<3){ showDialogue([['ПЕРВЫЙ ШОВ','Три Печати. Не две с половиной, не очень убедительная записка — три.']]); return; }
    if(!runtime.finalStarted){
      showDialogue(DIALOGUES['weaver-before'],()=>{ runtime.finalStarted=true; runtime.save.world.talked['weaver-before']=true; persistSave(); showToast('Первый Шов пробудился'); sound.boss(); });
    } else showDialogue([['ПЕРВЫЙ ШОВ','Мы уже всё сказали. Теперь аргументы будут короче и острее.']]);
    return;
  }
  const lines=DIALOGUES[npc.dialogue]||[[npc.name,'Молчание здесь тоже считается репликой.']];
  showDialogue(lines,()=>{runtime.save.world.talked[npc.id]=true;persistSave();});
}

function showDialogue(lines,onDone=null,index=0) {
  const [speaker,text]=lines[index];
  openModal(`<p class="speaker">${speaker}</p><h2>${index===0?'РАЗГОВОР':'…'}</h2><p>${text}</p><div class="panel-actions"><button class="cloth-button primary" id="dialogueNext" data-native-press>${index<lines.length-1?'Дальше':'Закончить'}</button></div>`);
  $('dialogueNext').onclick=()=>{
    if(index<lines.length-1) showDialogue(lines,onDone,index+1);
    else { closeModal(true); if(onDone) onDone(); }
  };
}

function openRagShop() {
  const price=40;
  openModal(`<p class="speaker">РАГ</p><h2>ТОРГОВЕЦ ПУСТОТАМИ</h2><p>Один настой возвращает 48 здоровья. Цена — ${price} нитей. Экономика мёртвого города наконец-то проще живой.</p><div class="stat-line"><span>Твои нити</span><b>${runtime.save.inventory.threads}</b></div><div class="panel-actions"><button class="cloth-button primary" id="buyPotion" ${runtime.save.inventory.threads<price?'disabled':''} data-native-press>Купить настой · ${price}</button><button class="cloth-button" id="shopClose" data-native-press>Уйти</button></div>`);
  $('buyPotion').onclick=()=>{ if(runtime.save.inventory.threads>=price){runtime.save.inventory.threads-=price;runtime.save.inventory.potions++;sound.pickup();persistSave();openRagShop();updateHud();} };
  $('shopClose').onclick=()=>closeModal(true);
}

function openChest(chest) {
  if(runtime.save.world.chests[chest.id]){ showToast('Сундук пуст'); return; }
  runtime.save.world.chests[chest.id]=true;
  const gained=applyChestReward(runtime.save,chest.reward);
  spawnBurst(chest.x,chest.y,'#d8b45b',24); sound.pickup(); vibrate([15,30,20]); persistSave(); updateHud();
  openModal(`<p class="eyebrow">НАЙДЕНО</p><h2>${chest.label}</h2><p>${gained.length?gained.join(' · '):'Внутри только убедительная пыль.'}</p><div class="panel-actions"><button class="cloth-button primary" id="chestClose" data-native-press>Забрать</button></div>`);
  $('chestClose').onclick=()=>closeModal(true);
}

function useShrine() {
  const s=runtime.save;
  s.stats.hp=s.stats.maxHp; s.stats.resolve=s.stats.maxResolve;
  s.checkpoint={zone:runtime.zone.id,position:{x:runtime.zone.shrine.x,y:runtime.zone.shrine.y}};
  s.world.shrineSeen=true;
  spawnBurst(runtime.zone.shrine.x,runtime.zone.shrine.y,s.layer===LAYERS.ASH?'#9d86c6':'#d8b45b',30);
  sound.shift(); vibrate(22); persistSave(); updateHud(); showToast('Святилище восстановило тебя и сохранило путь');
}

function usePortal(portal) {
  if(!requirementMet(portal.requirement,runtime.save)){
    const message=portal.requirement==='tutorial'?'Мира ещё не научила тебя держать шов':portal.requirement==='two-seals'?'Нужны две Печати':'Нужны все три Печати';
    showToast(message); camera.shake=4; return;
  }
  loadZone(portal.to,portal.spawn); showToast(ZONES[portal.to].name); sound.shift();
}

function updateNearby() {
  let best=null,bestD=42;
  const layer=runtime.save.layer;
  const consider=(kind,data,limit=42)=>{
    const d=Math.hypot(player.x-data.x,player.y-data.y);
    if(d<bestD&&d<limit){best={kind,data,d};bestD=d;}
  };
  for(const npc of runtime.zone.npcs){ if(npc.layer==='both'||npc.layer===layer) consider('npc',npc,44); }
  for(const chest of runtime.zone.chests){ if((chest.layer==='both'||chest.layer===layer)&&!runtime.save.world.chests[chest.id]) consider('chest',chest,38); }
  consider('shrine',runtime.zone.shrine,36);
  for(const portal of runtime.zone.portals){
    const center={x:portal.x+portal.w/2,y:portal.y+portal.h/2};
    if(player.x>portal.x-10&&player.x<portal.x+portal.w+10&&player.y>portal.y-10&&player.y<portal.y+portal.h+10){ best={kind:'portal',data:portal,d:0}; break; }
    consider('portal',{...portal,...center},28);
  }
  runtime.nearby=best;
  contextButton.hidden=!best;
  interactButton.classList.toggle('has-context',!!best);
  if(best){
    const label=best.kind==='npc'?'Говорить':best.kind==='chest'?'Открыть':best.kind==='shrine'?'Отдохнуть':best.data.label;
    contextButton.textContent=label;
  }
}

