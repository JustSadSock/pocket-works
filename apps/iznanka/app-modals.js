function showToast(text, duration=1800) {
  toastEl.textContent=text;
  toastEl.classList.add('is-visible');
  clearTimeout(runtime.toastTimer);
  runtime.toastTimer=setTimeout(()=>toastEl.classList.remove('is-visible'),duration);
}

function openModal(html) {
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="panel">${html}</div></div>`;
  modalRoot.classList.add('is-active');
  if (runtime.mode==='playing') runtime.mode='modal';
  modalRoot.querySelectorAll('[data-native-press]').forEach(bindPressFx);
}

function closeModal(resume=true) {
  modalRoot.innerHTML=''; modalRoot.classList.remove('is-active');
  if (resume && runtime.save) setMode('playing');
}

function confirmPanel(title, text, onConfirm) {
  openModal(`<h2>${title}</h2><p>${text}</p><div class="panel-actions two"><button class="cloth-button" id="confirmCancel" data-native-press>Отмена</button><button class="cloth-button primary" id="confirmOk" data-native-press>Подтвердить</button></div>`);
  $('confirmCancel').onclick=()=>{ closeModal(runtime.save!=null); if(!runtime.save) runtime.mode='title'; };
  $('confirmOk').onclick=()=>{ closeModal(false); onConfirm(); };
}

function pauseGame() {
  if (runtime.mode!=='playing') return;
  persistSave();
  runtime.mode='paused';
  controls.classList.remove('is-visible');
  openModal(`
    <p class="eyebrow">${runtime.zone.name}</p><h2>ПАУЗА</h2>
    <div class="stat-line"><span>Уровень</span><b>${runtime.save.stats.level}</b></div>
    <div class="stat-line"><span>Нити</span><b>${runtime.save.inventory.threads}</b></div>
    <div class="stat-line"><span>Настои</span><b>${runtime.save.inventory.potions}</b></div>
    <div class="panel-actions">
      <button class="cloth-button primary" id="resumeButton" data-native-press>Продолжить</button>
      <button class="cloth-button" id="journalButton" data-native-press>Журнал, реликвии и характеристики</button>
      <button class="cloth-button" id="settingsButton" data-native-press>Звук и управление</button>
      <button class="cloth-button launcher-button" id="pauseLauncher" data-native-press>Вернуться в Pocket Works</button>
    </div>`);
  $('resumeButton').onclick=()=>closeModal(true);
  $('journalButton').onclick=openJournal;
  $('settingsButton').onclick=()=>openSettings('pause');
  $('pauseLauncher').onclick=returnToLauncher;
}

function openJournal() {
  const s=runtime.save;
  const objective=questObjective(s);
  const decisions=Object.values(s.quest.decisions).filter(Boolean);
  const relicHtml=Object.entries(RELICS).map(([id,r])=>{
    const owned=s.inventory.relics.includes(id); const equipped=s.inventory.equipped.includes(id);
    return `<button class="relic ${owned?'':'locked'}" data-relic="${id}" ${owned?'':'disabled'} data-native-press><b>${owned?r.name:'Неизвестная реликвия'}${equipped?' · НАДЕТА':''}</b><span>${owned?r.text:'Найдётся в одном из слоёв мира.'}</span></button>`;
  }).join('');
  openModal(`
    <p class="eyebrow">ЖУРНАЛ</p><h2>${objective.chapter}</h2><p><b>${objective.text}</b></p>
    <div class="stat-line"><span>Уровень / опыт</span><b>${s.stats.level} · ${Math.floor(s.stats.xp)}/${s.stats.nextXp}</b></div>
    <div class="stat-line"><span>Здоровье</span><b>${Math.ceil(s.stats.hp)}/${s.stats.maxHp}</b></div>
    <div class="stat-line"><span>Печати</span><b>${s.quest.seals.length}/3</b></div>
    <div class="stat-line"><span>Принятые решения</span><b>${decisions.length}</b></div>
    <h2 style="margin-top:18px">РЕЛИКВИИ</h2><p>Можно носить две. Нажми на найденную реликвию, чтобы надеть или снять.</p>
    <div class="relics">${relicHtml}</div>
    <div class="panel-actions"><button class="cloth-button primary" id="journalClose" data-native-press>Назад</button></div>`);
  modalRoot.querySelectorAll('[data-relic]').forEach(btn=>btn.onclick=()=>toggleRelic(btn.dataset.relic));
  $('journalClose').onclick=()=>pauseGameFromSubmenu();
}

function toggleRelic(id) {
  const eq=runtime.save.inventory.equipped;
  const at=eq.indexOf(id);
  if(at>=0) eq.splice(at,1);
  else if(eq.length<2) eq.push(id);
  else { showToast('Можно носить только две реликвии'); return; }
  sound.ui(); openJournal(); persistSave();
}

function pauseGameFromSubmenu() {
  modalRoot.innerHTML=''; modalRoot.classList.remove('is-active');
  runtime.mode='playing'; pauseGame();
}

function openSettings(origin='title') {
  const s=runtime.save?.settings || loadStoredSave()?.settings || createInitialSave().settings;
  openModal(`
    <p class="eyebrow">НАСТРОЙКИ</p><h2>ЗВУК И УПРАВЛЕНИЕ</h2>
    <button class="choice" id="soundToggle" data-native-press><b>Звук: ${s.sound?'включён':'выключен'}</b><span>Тихие процедурные эффекты ударов, смены слоя и интерфейса.</span></button>
    <button class="choice" id="hapticToggle" data-native-press><b>Вибрация: ${s.haptics?'включена':'выключена'}</b><span>Короткая тактильная отдача, если устройство её поддерживает.</span></button>
    <p><b>Клавиатура:</b> WASD — движение, J — удар, K — Игла, Space — рывок, Q — слой, E — действие, R — настой, Esc — пауза.</p>
    <p><b>Телефон:</b> левый круг — движение. Кнопки справа отвечают за бой и смену слоя. Кнопка «Дело» взаимодействует с ближайшим объектом.</p>
    <div class="panel-actions"><button class="cloth-button primary" id="settingsClose" data-native-press>Назад</button></div>`);
  $('soundToggle').onclick=()=>{
    s.sound=!s.sound; if(runtime.save) runtime.save.settings.sound=s.sound; sound.enabled=s.sound; sound.ui(); openSettings(origin); persistSave();
  };
  $('hapticToggle').onclick=()=>{
    s.haptics=!s.haptics; if(runtime.save) runtime.save.settings.haptics=s.haptics; vibrate(12); openSettings(origin); persistSave();
  };
  $('settingsClose').onclick=()=>{
    closeModal(false);
    if(origin==='pause') { runtime.mode='playing'; pauseGame(); }
    else { runtime.mode='title'; titleScreen.classList.add('is-visible'); }
  };
}

function returnToLauncher() {
  persistSave(true);
  window.location.href='../../';
}

function bindPressFx(el) {
  if (el.dataset.boundPress) return;
  el.dataset.boundPress='1';
  el.addEventListener('pointerdown',()=>el.classList.add('is-pressed'));
  for (const ev of ['pointerup','pointercancel','pointerleave']) el.addEventListener(ev,()=>el.classList.remove('is-pressed'));
}

function updateHud() {
  if(!runtime.save) return;
  const s=runtime.save.stats;
  healthBar.style.width=`${Math.max(0,s.hp/s.maxHp*100)}%`;
  healthText.textContent=`${Math.ceil(s.hp)}/${s.maxHp}`;
  resolveBar.style.width=`${Math.max(0,s.resolve/s.maxResolve*100)}%`;
  potionCount.textContent=runtime.save.inventory.potions;
  const q=questObjective(runtime.save);
  questChapter.textContent=q.chapter;
  questText.textContent=q.text;
  const ash=runtime.save.layer===LAYERS.ASH;
  layerBadge.classList.toggle('ash',ash); layerBadge.classList.toggle('bloom',!ash);
  layerBadge.querySelector('b').textContent=ash?'ИЗНАНКА':'ЛИЦО';
  const boss=runtime.enemies.find(e=>e.boss&&!e.dead&&isEnemyVisible(e));
  bossBar.hidden=!boss;
  if(boss){ bossName.textContent=boss.name.toUpperCase(); bossHealth.style.width=`${Math.max(0,boss.hp/boss.maxHp*100)}%`; }
}

function usePotion() {
  if(runtime.mode!=='playing') return;
  const s=runtime.save;
  if(s.inventory.potions<=0){ showToast('Настои закончились'); return; }
  if(s.stats.hp>=s.stats.maxHp){ showToast('Здоровье уже полное'); return; }
  s.inventory.potions--; s.stats.hp=Math.min(s.stats.maxHp,s.stats.hp+48);
  spawnBurst(player.x,player.y,'#7daa68',16); sound.pickup(); vibrate(18); updateHud(); persistSave();
}

