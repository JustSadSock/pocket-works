function spawnPlayerProjectile(angle,damage,speed,kind) {
  runtime.projectiles.push({ owner:'player',kind,x:player.x+Math.cos(angle)*13,y:player.y+Math.sin(angle)*13,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,radius:kind==='thorn'?3:4,life:kind==='thorn'?.75:1.15,pierce:runtime.save.inventory.equipped.includes('salt-eye')?2:1,layer:runtime.save.layer });
}

function spawnEnemyProjectile(enemy,angle,speed=120,damage=enemy.damage,kind='orb') {
  runtime.projectiles.push({ owner:'enemy',kind,x:enemy.x,y:enemy.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage,radius:kind==='wave'?8:5,life:2.8,pierce:1,layer:runtime.save.layer });
}

function applyHit(enemy,damage,kind) {
  if(enemy.dead||enemy.stun>0&&kind==='hazard') return;
  const now=performance.now()/1000;
  let finalDamage=damage;
  let rupture=false;
  if(enemy.markLayer && enemy.markLayer!==runtime.save.layer && enemy.markUntil>now){
    finalDamage=computeRuptureDamage(runtime.save,damage,enemy); rupture=true;
    enemy.markLayer=null; enemy.markUntil=0; enemy.stun=enemy.boss?.55:1.15;
    runtime.save.stats.resolve=Math.min(runtime.save.stats.maxResolve,runtime.save.stats.resolve+28);
    runtime.save.quest.tutorialRuptures=Math.max(1,runtime.save.quest.tutorialRuptures);
    if(runtime.save.stats.ruptureHeal>0) runtime.save.stats.hp=Math.min(runtime.save.stats.maxHp,runtime.save.stats.hp+runtime.save.stats.maxHp*runtime.save.stats.ruptureHeal);
    if(enemy.boss&&runtime.save.inventory.equipped.includes('first-thread')) runtime.save.stats.resolve=runtime.save.stats.maxResolve;
  } else {
    enemy.markLayer=runtime.save.layer; enemy.markUntil=now+5;
  }
  if(player.shiftEmpower>0){ finalDamage*=1.35; player.shiftEmpower=0; }
  enemy.hp-=finalDamage; enemy.hitFlash=.14;
  const n=normalize(enemy.x-player.x,enemy.y-player.y);
  if(!enemy.boss){ enemy.x+=n.x*(rupture?18:7); enemy.y+=n.y*(rupture?18:7); }
  spawnFloater(enemy.x,enemy.y-12,Math.round(finalDamage),rupture?'#f4dc7b':'#efe7cb',rupture?1.35:1);
  spawnBurst(enemy.x,enemy.y,rupture?'#f4dc7b':enemy.color,rupture?18:7);
  sound.hit(rupture); camera.shake=Math.max(camera.shake,rupture?8:3);
  if(enemy.hp<=0) killEnemy(enemy);
  updateHud();
}

function killEnemy(enemy) {
  enemy.dead=true;
  const def=ENEMY_TYPES[enemy.type];
  const rng=seeded(hashString(`${enemy.id}:${Date.now()>>8}`));
  const threads=Math.round((def.threads[0]+rng()*(def.threads[1]-def.threads[0]))*runtime.save.stats.threadGain);
  runtime.save.inventory.threads+=threads;
  const levels=addXp(runtime.save,enemy.xp);
  spawnFloater(enemy.x,enemy.y-24,`+${threads} нитей`,'#d8b45b',1);
  spawnBurst(enemy.x,enemy.y,enemy.color,enemy.boss?35:16);
  if(enemy.type==='hush'&&runtime.zone.id==='threshold') runtime.save.quest.tutorialKills=Math.min(3,runtime.save.quest.tutorialKills+1);
  if(enemy.boss){
    sound.boss(); vibrate([40,40,80]);
    const key=enemy.type==='gardener'?'garden':enemy.type==='ferryman'?'drowned':enemy.type==='archivist'?'archive':'weaver';
    runtime.save.world.bosses[key]=true;
    const seal=sealForBoss(enemy.type);
    if(seal&&!runtime.save.quest.seals.includes(seal)) runtime.save.quest.seals.push(seal);
    if(enemy.final){ runtime.endingPending=true; setTimeout(showEndingChoice,700); }
    else setTimeout(()=>showBossDecision(key,enemy),550);
  }
  if(levels>0){ if(enemy.boss) runtime.pendingLevels+=levels; else setTimeout(()=>showLevelUp(levels),350); }
  persistSave(); updateHud();
}

function showLevelUp(levels=1) {
  if(runtime.mode!=='playing'&&runtime.mode!=='modal') return;
  const choices=randomUpgradeChoices(runtime.save,3);
  openModal(`<p class="eyebrow">УРОВЕНЬ ${runtime.save.stats.level}</p><h2>НИТЬ СТАЛА КРЕПЧЕ</h2><p>Выбери постоянное улучшение. Отмотать назад не получится — жизнь вообще плохо поддерживает undo.</p><div class="choice-grid">${choices.map(u=>`<button class="choice" data-upgrade="${u.id}" data-native-press><b>${u.name}</b><span>${u.text}</span></button>`).join('')}</div>`);
  modalRoot.querySelectorAll('[data-upgrade]').forEach(btn=>btn.onclick=()=>{
    applyUpgrade(runtime.save,btn.dataset.upgrade); sound.pickup(); persistSave(); closeModal(true); updateHud(); showToast('Улучшение вплетено в героя');
  });
}

function showBossDecision(key,enemy) {
  const map={
    garden:{title:'ПЕЧАТЬ КОРНЯ',keep:['Оставить сад живым','Корни станут мягче: +15 к максимальному здоровью.'],cut:['Выжечь сердцевину','Терновая ярость: +10% к урону атак.']},
    drowned:{title:'ПЕЧАТЬ ГЛУБИНЫ',keep:['Вернуть имена утопленным','Эвра отдаст два настоя и течение станет спокойнее.'],cut:['Осушить память воды','Решимость восстанавливается на 3 ед. быстрее.']},
    archive:{title:'ПЕЧАТЬ ИМЕНИ',keep:['Сохранить ненаписанные жизни','Игла требует на 5 решимости меньше.'],cut:['Сжечь каталог вариантов','Разрыв наносит ещё +20% урона.']}
  }[key];
  if(!map) return;
  openModal(`<p class="eyebrow">${enemy.name}</p><h2>${map.title}</h2><p>Победа дала Печать, но оставила выбор. Оба варианта полезны. Оба — чья-то маленькая катастрофа.</p><div class="choice-grid"><button class="choice" id="keepChoice" data-native-press><b>${map.keep[0]}</b><span>${map.keep[1]}</span></button><button class="choice" id="cutChoice" data-native-press><b>${map.cut[0]}</b><span>${map.cut[1]}</span></button></div>`);
  $('keepChoice').onclick=()=>resolveDecision(key,'keep');
  $('cutChoice').onclick=()=>resolveDecision(key,'cut');
}

function resolveDecision(key,choice) {
  runtime.save.quest.decisions[key]=choice;
  const s=runtime.save.stats;
  if(key==='garden'&&choice==='keep'){s.maxHp+=15;s.hp+=15;}
  if(key==='garden'&&choice==='cut') s.attack*=1.1;
  if(key==='drowned'&&choice==='keep') runtime.save.inventory.potions+=2;
  if(key==='drowned'&&choice==='cut') s.resolveRegen+=3;
  if(key==='archive'&&choice==='keep') runtime.save.world.talked['cheap-needle']=true;
  if(key==='archive'&&choice==='cut') s.rupture*=1.2;
  closeModal(true); sound.pickup(); persistSave(); updateHud();
  showToast(runtime.save.quest.seals.length===3?'Все Печати собраны. Башня открыта.':'Печать вплетена в ключ');
  if(runtime.pendingLevels>0){ const pending=runtime.pendingLevels; runtime.pendingLevels=0; setTimeout(()=>showLevelUp(pending),300); }
}

function showEndingChoice() {
  if(!runtime.endingPending) return;
  runtime.endingPending=false;
  const decisions=Object.values(runtime.save.quest.decisions);
  const kept=decisions.filter(v=>v==='keep').length;
  openModal(`<p class="eyebrow">ПЕРВЫЙ ШОВ ПОВЕРЖЕН</p><h2>КАКОЙ МИР ОСТАНЕТСЯ?</h2><p>Шов распущен. Две стороны города больше не могут делить одну плоть. Можно выбрать одну — или рискнуть и связать их иначе.</p><div class="choice-grid"><button class="choice" data-ending="bloom" data-native-press><b>Оставить Лицо</b><span>Живой город сохранится. Изнанка исчезнет вместе со всеми своими эхо.</span></button><button class="choice" data-ending="ash" data-native-press><b>Оставить Изнанку</b><span>Мёртвые варианты станут настоящими. Живой слой превратится в память.</span></button><button class="choice" data-ending="seam" data-native-press><b>Сшить заново</b><span>${kept>=2?'Твои решения сохранили достаточно нитей для устойчивого нового Шва.':'Нитей мало: новый Шов будет болезненным, но всё ещё возможным.'}</span></button></div>`);
  modalRoot.querySelectorAll('[data-ending]').forEach(btn=>btn.onclick=()=>finishGame(btn.dataset.ending));
}

function finishGame(ending) {
  runtime.save.quest.ending=ending;
  runtime.pendingLevels=0;
  runtime.save.quest.stage=4;
  persistSave();
  const copy={
    bloom:['ЛИЦО ОСТАЛОСЬ','Утром город проснулся цельным. Никто не помнил вторую сторону — кроме тебя и странного ощущения, будто г каждого дома когда-то была ещё одна дверь.'],
    ash:['ИЗНАНКА СТАЛА ЛИЦОМ','Эхо получили тела, несбывшиеся жизни — улицы, а память стала единственным законом. Живые остались снами, которые иногда снятся мёртвым.'],
    seam:['НОВЫЙ ШОВ','Два города больше не лежат друг на друге. Они стоят рядом и соединяются мостами, которые появляются только тем, кто признаёт обе версии правды.']
  }[ending];
  openModal(`<p class="eyebrow">ФИНАЛ</p><h2>${copy[0]}</h2><p>${copy[1]}</p><div class="stat-line"><span>Уровень</span><b>${runtime.save.stats.level}</b></div><div class="stat-line"><span>Реликвии</span><b>${runtime.save.inventory.relics.length}/5</b></div><div class="stat-line"><span>Время</span><b>${formatTime(runtime.save.playTime)}</b></div><div class="panel-actions"><button class="cloth-button primary" id="continueAfterEnding" data-native-press>Продолжить исследование</button><button class="cloth-button launcher-button" id="endingLauncher" data-native-press>Вернуться в Pocket Works</button></div>`);
  $('continueAfterEnding').onclick=()=>{ closeModal(false); loadZone('threshold',ZONES.threshold.spawn); setMode('playing'); };
  $('endingLauncher').onclick=returnToLauncher;
}

