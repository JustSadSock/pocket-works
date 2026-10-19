// js/core.js

window.addEventListener('DOMContentLoaded', ()=>{
  // === Утилиты ===
  const abs = Math.abs;

  const IMG = {};

  const orientationQuery = (typeof window.matchMedia==='function')
    ? window.matchMedia('(orientation: portrait)')
    : { matches:false, addEventListener:()=>{}, removeEventListener:()=>{} };

  function handleOrientation(){
    window.dispatchEvent(new Event('resize'));
  }
  orientationQuery.addEventListener('change', handleOrientation);

  function playAudio(a){
    // IDs preserve the original action bindings; all sounds are offline Web Audio.
    if(!a||isTestEnv)return;
    const names={attackSfx:'attack',healSfx:'heal',captureSfx:'capture',
      uiClickSfx:'uiClick',uiHoverSfx:'uiHover'};
    window.FogAudio?.play(names[a.id]);
  }

  function loadImages(basePath='assets'){
    const files = {
      tiles:[
        'grass1','grass2','hill','hill2','mountains1','mountains2','mountains3',
        'trees1','trees2','trees3','water','pound','pound2','pound3'
      ],
      buildings:[
        'barracks','base_ally','base_enemy','fort_ally','fort_enemy','fort_neutral',
        'healers_tents_ally','healers_tents_enemy','healers_tents_neutral','stable','windmill'
      ],
      units:[
        'archer_ally','archer_enemy','healer_ally','healer_enemy','heavy_ally','heavy_enemy',
        'horseman_ally','horseman_enemy','militia_ally','militia_enemy'
      ],
      symbols:[
        'green_selection','red_selection','white_shield','yellow_selection','yellow_shield'
      ]
    };
    const promises = [];
    Object.entries(files).forEach(([dir,names])=>{
      names.forEach(n=>{
        const img=new Image();
        img.src=`${basePath}/${dir}/${n}.png`;
        IMG[`${dir}/${n}`]=img;
        promises.push(new Promise(res=>{img.onload=res; img.onerror=res;}));
      });
    });
    return Promise.all(promises);
  }

  function loadAiTiles(){
    const map = {
      'tiles/grass1':'tile_grass',
      'tiles/grass2':'tile_grass_bottom',
      'tiles/hill':'tile_hill',
      'tiles/hill2':'tile_hill',
      'tiles/mountains1':'tile_mountain',
      'tiles/mountains2':'tile_mountain',
      'tiles/mountains3':'tile_mountain',
      'tiles/trees1':'tile_trees',
      'tiles/trees2':'tile_trees',
      'tiles/trees3':'tile_trees',
      'tiles/water':'tile_water',
      'tiles/pound':'tile_water',
      'tiles/pound2':'tile_water',
      'tiles/pound3':'tile_water'
    };
    const promises = [];
    Object.entries(map).forEach(([key,name])=>{
      const img = new Image();
      img.src = `assets(ai)/${name}.png`;
      IMG[key] = img;
      promises.push(new Promise(res=>{img.onload=res; img.onerror=res;}));
    });

    const units = [
      'archer_ally','archer_enemy','healer_ally','healer_enemy',
      'heavy_warrior_ally','heavy_warrior_enemy','horseman_ally',
      'horseman_enemy','warrior_ally','warrior_enemy'
    ];
    units.forEach(n=>{
      const img = new Image();
      img.src = `assets(ai)/${n}.png`;
      IMG[`ai_units/${n}`] = img;
      promises.push(new Promise(res=>{img.onload=res; img.onerror=res;}));
    });

    const buildings = [
      'main_castle_ally','main_castle_enemy','heavy_barracks_ally',
      'heavy_barracks_enemy','stable_ally','stable_enemy',
      'healer_tent_ally','healer_tent_enemy','windmill_ally',
      'windmill_enemy','field_fortifications_ally',
      'field_fortification_enemy'
    ];
    buildings.forEach(n=>{
      const img = new Image();
      img.src = `assets(ai)/${n}.png`;
      IMG[`ai_buildings/${n}`] = img;
      promises.push(new Promise(res=>{img.onload=res; img.onerror=res;}));
    });

    return Promise.all(promises);
  }

  // === DOM-элементы ===
  const startPanel = document.getElementById('startPanel'),
        twoBtn      = document.getElementById('twoBtn'),
        aiBtn       = document.getElementById('aiBtn'),
        betaBtn     = document.getElementById('betaBtn'),
        overlay     = document.getElementById('overlay'),
        overlayMsg  = document.getElementById('overlayMessage'),
        yesBtn      = document.getElementById('yesBtn'),
        noBtn       = document.getElementById('noBtn'),
        canvas      = document.getElementById('canvas'),
        ctx         = canvas.getContext('2d'),
        spawnPanel  = document.getElementById('spawnPanel'),
        revealBtn   = document.getElementById('revealBtn'),
        legendBtn   = document.getElementById('legendBtn'),
        legendOverlay = document.getElementById('legendOverlay'),
        legendPanel = document.getElementById('legendPanel'),
        legendCloseBtn = document.getElementById('legendCloseBtn'),
        victoryOverlay = document.getElementById('victoryOverlay'),
        victoryText = document.getElementById('victoryText'),
        viewReplayBtn = document.getElementById('viewReplayBtn'),
        victoryOkBtn = document.getElementById('victoryOkBtn'),
        victoryMenuBtn = document.getElementById('victoryMenuBtn'),
        replayOverlay = document.getElementById('replayOverlay'),
        replayControls = document.getElementById('replayControls'),
        replaySeek = document.getElementById('replaySeek'),
        replayRestartBtn = document.getElementById('replayRestartBtn'),
        saveReplayBtn = document.getElementById('saveReplayBtn'),
        exitReplayBtn = document.getElementById('exitReplayBtn'),
        endTurnBtn  = document.getElementById('endTurnBtn'),
        panelToggleBtn = document.getElementById('panelToggleBtn'),
        infoPanel  = document.getElementById('infoPanel'),
        leftStats   = document.getElementById('leftStats'),
        rightLog    = document.getElementById('rightLog'),
        mapSizeSel  = document.getElementById('mapSizeSelect'),
        aiLevelSel  = document.getElementById('aiLevelSelect'),
        aiPanel     = document.getElementById('aiPanel'),
        aiStartBtn  = document.getElementById('aiStartBtn'),
        waitOverlay = document.getElementById('waitOverlay'),
        waitText    = document.getElementById('waitText'),
        skipReplayBtn = document.getElementById('skipReplayBtn'),
        startSettingsBtn = document.getElementById('startSettingsBtn'),
        settingsBtn   = document.getElementById('settingsBtn'),
        settingsOverlay = document.getElementById('settingsOverlay'),
        styleSelect   = document.getElementById('styleSelect'),
        musicEnableEl = document.getElementById('musicEnable'),
        musicVolumeEl = document.getElementById('musicVolume'),
        sfxEnableEl   = document.getElementById('sfxEnable'),
        sfxVolumeEl   = document.getElementById('sfxVolume'),
        langSelect    = document.getElementById('langSelect'),
        settingsCloseBtn = document.getElementById('settingsCloseBtn'),
        settingsMenuBtn = document.getElementById('settingsMenuBtn'),
        hintsChk = document.getElementById('hintsChk'),
        tooltipDiv   = document.getElementById('tooltip'),
        bgm          = document.getElementById('bgm'),
        attackSfx    = document.getElementById('attackSfx'),
        healSfx      = document.getElementById('healSfx'),
        captureSfx   = document.getElementById('captureSfx'),
        uiClickSfx   = document.getElementById('uiClickSfx'),
        uiHoverSfx   = document.getElementById('uiHoverSfx'),
        loadBtn      = document.getElementById('loadBtn'),
        loadOverlay  = document.getElementById('loadOverlay'),
        loadList     = document.getElementById('loadList'),
        loadCloseBtn = document.getElementById('loadCloseBtn'),
        saveBtn      = document.getElementById('saveBtn'),
        fullscreenBtn = document.getElementById('fullscreenBtn'),
        newGameBtn   = document.getElementById('newGameBtn'),
        newGameOptions = document.getElementById('newGameOptions'),
        onlineBtn   = document.getElementById('onlineBtn'),
        tutorialBtn = document.getElementById('tutorialBtn'),
        tutorialOverlay = document.getElementById('tutorialOverlay'),
        tutorialCloseBtn = document.getElementById('tutorialCloseBtn'),
        lobbyPanel  = document.getElementById('lobbyPanel'),
        roomIdInput = document.getElementById('roomIdInput'),
        createRoomBtn = document.getElementById('createRoomBtn'),
        joinRoomBtn = document.getElementById('joinRoomBtn'),
        lobbyBackBtn = document.getElementById('lobbyBackBtn'),
        replaySideBtn = document.getElementById('replaySideBtn'),
        replayToggleBtn = document.getElementById('replayToggleBtn'),
        replayPauseBtn = document.getElementById('replayPauseBtn');
  const speedBtns = document.querySelectorAll('.speedBtn');

  Object.assign(window, {
    waitOverlay, waitText, skipReplayBtn,
    replayOverlay, replayControls, replaySeek,
    replayRestartBtn, saveReplayBtn, exitReplayBtn,
    replayToggleBtn, replayPauseBtn, speedBtns, canvas
  });

  // === Константы ===
  // default orientation switched to horizontal
  // constants moved to gameState.js
  const MIN_INFO_HEIGHT = 140;
  let aiMode = false, aiLevel = 2;
  // No legacy root-WebSocket connection: PocketNet owns all network state.
  let onlineGame = false;
  // terrain and unit data moved to gameState.js

  const SETTINGS_KEY = 'focSettings';
  const SAVE_PREFIX = 'focSave_';
  const SAVE_VERSION = window.FogSaveSchema.SAVE_VERSION;
  const isTestEnv = navigator.userAgent.includes('jsdom');
  let style = 'ai',
      musicVolume = 0.5,
      sfxVolume = 0.5,
      musicEnabled = false,
      sfxEnabled = true,
      lang = 'ru',
      strings = {};

  function loadSettings(){
    try{
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if(saved){
        if(typeof saved.style==='string') style = saved.style;
        else if(typeof saved.simplified==='boolean') style = saved.simplified ? 'simple' : 'toen';
        if(typeof saved.musicVolume==='number') musicVolume = saved.musicVolume;
        if(typeof saved.sfxVolume==='number') sfxVolume = saved.sfxVolume;
        if(typeof saved.musicEnabled==='boolean') musicEnabled = saved.musicEnabled;
        if(typeof saved.sfxEnabled==='boolean') sfxEnabled = saved.sfxEnabled;
        if(typeof saved.lang==='string') lang = saved.lang;
      }
    }catch(e){}
  }

  function saveSettings(){
    const obj = {
      style,
      musicVolume,
      sfxVolume,
      musicEnabled,
      sfxEnabled,
      lang
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
  }

  function applyVolumes(){
    window.FogAudio?.configure({musicEnabled,musicVolume,sfxEnabled,sfxVolume});
  }

  function loadLangStrings(){
    try{
      if(location.protocol === 'file:' && typeof require==='function'){
        const fs = require('fs');
        const path = require('path');
        const base = path.dirname(location.pathname);
        const file = path.join(base,'data','lang',lang+'.json');
        strings = JSON.parse(fs.readFileSync(file,'utf8'));
      } else {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `data/lang/${lang}.json`, false);
        xhr.send(null);
        if(xhr.status===200) strings = JSON.parse(xhr.responseText);
      }
    }catch(e){ strings = {}; }
  }

  function t(key){ return strings[key] || key; }

  function updateLabels(){
    TERR_LABELS = [
      t('terrPlain'),
      t('terrWater'),
      t('terrForest'),
      t('terrHill'),
      t('terrMountain')
    ];
    UNIT_LABELS = {
      swordsman:t('unitSwordsman'),
      archer:t('unitArcher'),
      heavy:t('unitHeavy'),
      cavalry:t('unitCavalry'),
      mage:t('unitMage'),
      bog:t('unitBog')
    };
  }

  function applyStrings(){
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const k=el.getAttribute('data-i18n');
      if(strings[k]) el.innerHTML=strings[k];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el=>{
      const k=el.getAttribute('data-i18n-title');
      if(strings[k]) el.setAttribute('title', strings[k]);
    });
    if(panelToggleBtn){
      panelToggleBtn.textContent = infoPanel.classList.contains('collapsed') ? '▲' : '▼';
    }
  }

  loadSettings();
  loadLangStrings();
  applyStrings();
  applyVolumes();

  function getUnitSprite(u){
    const side = u.owner===1?'ally':'enemy';
    if(style==='ai'){
      const map = {
        swordsman:'warrior',
        archer:'archer',
        heavy:'heavy_warrior',
        cavalry:'horseman',
        mage:'healer',
        bog:'warrior'
      };
      return IMG[`ai_units/${map[u.type]}_${side}`];
    }
    return IMG[`units/${UNIT_IMG_MAP[u.type]}_${side}`];
  }

  function getBuildingSprite(b){
    if(style==='ai'){
      const owner = b.owner===1?'ally':b.owner===2?'enemy':'ally';
      const map = {
        base:`ai_buildings/main_castle_${owner}`,
        barracks:`ai_buildings/heavy_barracks_${owner}`,
        stable:`ai_buildings/stable_${owner}`,
        mageTower:`ai_buildings/healer_tent_${owner}`,
        mill:`ai_buildings/windmill_${owner}`,
        fort:`ai_buildings/${owner==='enemy'?'field_fortification_enemy':'field_fortifications_ally'}`
      };
      return IMG[map[b.type]];
    }
    const owner = b.owner===1?'ally':b.owner===2?'enemy':'neutral';
    const map = {
      base:`buildings/base_${owner}`,
      barracks:'buildings/barracks',
      stable:'buildings/stable',
      mageTower:`buildings/healers_tents_${owner}`,
      mill:'buildings/windmill',
      fort:`buildings/fort_${owner}`
    };
    return IMG[map[b.type]];
  }

  function getGrassSprite(){
    return IMG[TILE_IMAGES.grass[0]];
  }

  function getWaterSprite(r,c){
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    const isolated = dirs.every(([dr,dc])=>{
      let rr=r+dr, cc=c+dc;
      return rr<0||rr>=ROWS||cc<0||cc>=COLS||map[rr][cc]!==TERRAIN.WATER;
    });
    const set = isolated?TILE_IMAGES.pond:TILE_IMAGES.water;
    return IMG[set[0]];
  }

  // UNIT_TYPES and BUILD_TYPES come from data.js


  let UNIT_LABELS = {};
  const BUILD_LABELS = {
    base:'🏰',
    barracks:'⚔',
    stable:'🐴',
    mageTower:'🔮',
    mill:'🌾',
    fort:'🏯'
  };
  updateLabels();

  function setupLegend(){
    const unitRows = Object.entries(UNIT_TYPES)
      .filter(([type]) => type !== 'bog')
      .map(([type, info]) =>
        `<div class="legendItem"><span class="legendColor" style="background:${info.color}"></span>${UNIT_LABELS[type]} — ${t('moveShort')} ${info.move}, ${t('attackShort')} ${info.atk}, ${t('defShort')} ${info.def}, ${t('rangeShort')} ${info.range}, HP ${info.hpMax}, ${info.cost} ${t('goldShort')}</div>`
      ).join('');
    const terrRows = TERR_LABELS.map((label,i) => {
      const bonus = TERR_DEF[i];
      const txt = i===TERRAIN.MOUNTAIN ? t('impassable') :
        (bonus ? (bonus>0?`+${bonus}`:bonus)+' '+t('defShort') : '');
      return `<div class="legendItem"><span class="legendColor" style="background:${TERR_COL[i]}"></span>${label} ${txt}</div>`;
    }).join('');
    legendPanel.innerHTML = `<h3>${t('legendUnits')}</h3>${unitRows}<h3 style="margin-top:8px;">${t('legendTerrain')}</h3>${terrRows}`;
  }

  // === Состояние ===
  let modeBeta = false,
      revealAll = false,
      gameOver = false,
      sel = null,
      zoneMap = null, zoneList = [],
      spawnMode = false, spawnType = null, spawnZones = [], spawnSource = null,
      continueAfter = null,
      fogSnapshot = null,
      tooltipEnabled = false;

  // replay state globals
  window.aiReplay = [];
  window.replayTimer = null;
  let replayEvents = [];
  window.replayEvents = replayEvents;
  window.replaySpeed = 1;
  window.replayPaused = false;
  window.replayIndex = 0;
  window.runReplayStep = null;
  window.replaySide = null;
  window.currentReplaySnapshot = null;
  window.videoRecorder = null;
  window.recordedChunks = [];
  window.revealAll = revealAll;

  Object.assign(window, { spawnZones });

  // state and map data moved to gameState.js

  // expose for tests
  Object.assign(window, {
    map, buildings, units, state,
    TERRAIN, TERR_COST, TERR_DEF,
    UNIT_TYPES, BUILD_TYPES,
    UNIT_LABELS, BUILD_LABELS,
    aiLevel,
    fogSnapshot,
    replayEvents,
    replayPaused,
    onlineGame
  });
  window.onlineGame = onlineGame;

  let cellW, cellH;

  // === Лог событий ===
  let lastAction=null;

  function snapshot(){
    return {
      units: units.map(u=>({...u})),
      buildings: buildings.map(b=>({...b})),
      state: {
        turn: state.turn,
        currentPlayer: state.currentPlayer,
        gold: {...state.gold}
      }
    };
  }

  // Offline snapshots must never contain a server-projected multiplayer view.
  function gameSavePayload(replays=replayEvents){
    return {
      version:SAVE_VERSION,timestamp:Date.now(),origin:'offline',
      mode:aiMode?'ai':modeBeta?'beta':'hotseat',aiMode,aiLevel,modeBeta,
      map,buildings,units,state,mapSize,nextUnitId,replayEvents:replays
    };
  }
  function safeSavePayload(replays=replayEvents){
    // Validate first, then encode. A network-projected view can never enter
    // offline storage, even by importing or calling this code directly.
    const verified=window.FogSaveSchema.normalize(gameSavePayload(replays));
    return window.FogReplayCodec.packSave(verified);
  }
  const saveNotice=document.createElement('div');
  saveNotice.id='fogSaveNotice';saveNotice.setAttribute('role','status');
  saveNotice.setAttribute('aria-live','polite');
  saveNotice.hidden=true;document.body.append(saveNotice);
  function reportSave(message,isError=false){
    saveNotice.textContent=message;
    saveNotice.dataset.level=isError?'error':'ok';
    saveNotice.hidden=false;
  }
  window.FogCurrentMode=()=>({aiMode,aiLevel,modeBeta,onlineGame});

  // One fixed autosave slot avoids unbounded save-list growth.
  // The game's original explicit numbered saves are preserved.
  function persistAutoSave(){
    if(onlineGame || startPanel.style.display!=='none' || !map.length || !units.length)return;
    try {
      const data=safeSavePayload(replayEvents.slice(-180));
      localStorage.setItem(SAVE_PREFIX+'autosave',JSON.stringify(data));
    }catch(error){
      console.warn('fog_autosave_unavailable',String(error));
      reportSave('Автосохранение не удалось. Проверь свободное место.',true);
    }
  }
  window.addEventListener('pagehide',persistAutoSave);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistAutoSave()});

  function recordEvent(txt){
    const p = state.currentPlayer;
    state.log[p].push(txt);
    if(aiMode && p===2) state.log[1].push(t('logEnemy').replace('{text}', txt));
    const ev = {type:'action',action:lastAction,text:txt,snapshot:snapshot()};
    replayEvents.push(ev);
    if(replayEvents.length>window.FogReplayCodec.LIMIT)
      replayEvents.splice(0,replayEvents.length-window.FogReplayCodec.LIMIT);
    lastAction=null;
    renderLog();
    persistAutoSave();
  }
  function recordTurn(){
    const p = state.currentPlayer;
    state.log[p].push(t('logTurn').replace('{turn}', state.turn+1));
    const ev = {type:'turn',turn:state.turn+1,snapshot:snapshot()};
    replayEvents.push(ev);
    if(replayEvents.length>window.FogReplayCodec.LIMIT)
      replayEvents.splice(0,replayEvents.length-window.FogReplayCodec.LIMIT);
    renderLog();
    persistAutoSave();
  }
  function renderLog(){
    rightLog.innerHTML = '';
    state.log[state.currentPlayer].forEach(line => {
      const d = document.createElement('div');
      d.textContent = line;
      rightLog.appendChild(d);
    });
    rightLog.scrollTop = rightLog.scrollHeight;
  }

  function addReplay(evt){
    aiReplay.push(evt);
    lastAction = JSON.parse(JSON.stringify(evt));
  }

  function animateMove(u,fr,fc,tr,tc,dur=200){
    if(!window.matchMedia?.('(prefers-reduced-motion:reduce)').matches){
      u.animMove={fr,fc,tr,tc,start:Date.now(),dur};
      requestAnimationFrame(redraw);
    }
  }
  function animateShake(u,dur=100){
    if(!window.matchMedia?.('(prefers-reduced-motion:reduce)').matches){
      u.animShake={start:Date.now(),dur};
      requestAnimationFrame(redraw);
    }
  }

  function initFog(){
    [1,2].forEach(p=>{
      state.fog[p]  = Array.from({length:ROWS},()=>Array(COLS).fill(true));
      state.seen[p] = Array.from({length:ROWS},()=>Array(COLS).fill(false));
    });
  }

  // === Resize ===
  window.addEventListener('resize',()=>{
    // Keep the original cell arithmetic while making the battlefield
    // physically tappable. Large maps scroll inside #battleViewport.
    const fitted=Math.floor(Math.min(Math.max(250,window.innerWidth-8)/COLS,
      Math.max(180,window.innerHeight-MIN_INFO_HEIGHT-40)/ROWS));
    const size=window.innerWidth<720?Math.max(30,fitted):Math.max(18,fitted);
    cellW = cellH = size;
    canvas.width  = cellW * COLS;
    canvas.height = cellH * ROWS;
    const panelH=164;
    if(!infoPanel.classList.contains('collapsed')){
      infoPanel.style.height = panelH + 'px';
    }
    infoPanel.style.bottom = '0';
    if(state.fog[state.currentPlayer]){
      updateAll();
    }
  });

  // === Сброс перед новой игрой ===
  function resetState(){
    gameOver = false;
    revealAll = false;
    sel = null;
    zoneMap = null; zoneList = [];
    spawnMode = false; spawnType = null; spawnZones = [];
    window.spawnZones = spawnZones;
    continueAfter = null;
    state.currentPlayer = 1;
    state.turn = 0;
    state.gold = {1:5,2:5};
    state.grace = {1:null,2:null};
    state.log   = {1:[],2:[]};
    replayEvents = [];
    window.replayEvents = replayEvents;
    fogSnapshot = null;
    window.fogSnapshot = fogSnapshot;
    initFog();
    state.lastSeen={1:{},2:{}};
    overlay.style.display = 'none';
    spawnPanel.style.display = 'none';
  }

  function goToMenu(){
    resetState();
    startPanel.style.display='flex';
    if(newGameOptions) newGameOptions.style.display='none';
    if(newGameBtn) newGameBtn.style.display='inline-block';
  }

  function listSaves(){
    const arr=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!k?.startsWith(SAVE_PREFIX))continue;
        try{
          const d=JSON.parse(localStorage.getItem(k));
          if(d?.timestamp)arr.push({key:k,timestamp:d.timestamp});
        }catch(e){}
      }
    }catch(e){reportSave('Не удаётся прочитать список сохранений.',true);}
    return arr.sort((a,b)=>b.timestamp-a.timestamp);
  }

  function saveGame(){
    if(onlineGame){
      reportSave('Интернет-партия сохраняется на сервере PocketNet. Вернись в свою комнату для продолжения.',true);
      return false;
    }
    if(startPanel.style.display!=='none'||!map.length){
      reportSave('Сначала начни локальную партию.',true);return false;
    }
    try{
      const data=safeSavePayload();
      const key=SAVE_PREFIX+data.timestamp+'-'+Math.floor(Math.random()*100000);
      localStorage.setItem(key,JSON.stringify(data));
      reportSave('Партия сохранена. Её можно загрузить из главного меню.');
      return true;
    }catch(e){
      reportSave('Не удалось сохранить партию: '+(e?.name==='QuotaExceededError'?'закончилось место в хранилище.':String(e?.message||e)),true);
      return false;
    }
  }

  function applySavedData(d){
    // Expand/validate before clearing a live game (also applies to rollback).
    d=window.FogSaveSchema.normalize(d);
    resetState();
    mapSize=d.mapSize;ROWS=d.map.length;COLS=d.map[0].length;
    window.ROWS=ROWS;window.COLS=COLS;
    map.length=0;d.map.forEach(row=>map.push([...row]));
    buildings.length=0;d.buildings.forEach(b=>buildings.push({...b}));
    units.length=0;d.units.forEach(u=>units.push({...u}));
    Object.assign(state,d.state);
    aiMode=d.aiMode;aiLevel=d.aiLevel;window.aiLevel=aiLevel;
    modeBeta=d.modeBeta;
    BUILD_TYPES.base.spawn=modeBeta?[...BASE_SPAWN_DEFAULT,'bog']:[...BASE_SPAWN_DEFAULT];
    revealAll=false;revealBtn.style.display=modeBeta?'inline-block':'none';
    replayEvents=d.replayEvents.slice();window.replayEvents=replayEvents;
    nextUnitId=d.nextUnitId;mapSizeSel.value=d.mapSize;
    aiLevelSel.value=String(aiLevel);
    onlineGame=false;window.onlineGame=false;
    startPanel.style.display='none';aiPanel.style.display='none';
    lobbyPanel.style.display='none';waitOverlay.style.display='none';
    overlay.style.display='none';victoryOverlay.style.display='none';
    endTurnBtn.disabled=false;viewReplayBtn.style.display='';
    window.dispatchEvent(new Event('resize'));updateAll();
    requestAnimationFrame(()=>window.FogCenterCamera?.(state.currentPlayer));
  }

  function loadGameData(key){
    if(onlineGame){
      reportSave('Сначала выйди из интернет-партии. Её состояние хранится на PocketNet.',true);
      return false;
    }
    let data;
    try{
      const json=localStorage.getItem(key);
      if(!json)throw new Error('Файл не найден.');
      // ALL validation happens before touching the running match.
      data=window.FogSaveSchema.normalize(JSON.parse(json));
    }catch(e){reportSave('Не удалось загрузить партию: '+String(e?.message||e),true);return false;}
    let backup=null;
    try{
      if(map.length&&units.length)backup=safeSavePayload();
      applySavedData(data);
      reportSave(data.legacyModeUnknown
        ?'Старая партия загружена как игра вдвоём: прежний файл не содержал режима ИИ.'
        :'Партия восстановлена.');
      if(aiMode&&state.currentPlayer===2&&!gameOver)
        requestAnimationFrame(()=>{if(aiMode&&state.currentPlayer===2){aiTakeTurn();}});
      return true;
    }catch(e){
      if(backup)try{applySavedData(backup)}catch(rollbackError){console.error('fog_restore_rollback_failed',rollbackError);}
      reportSave('Ошибка восстановления; предыдущая партия сохранена: '+String(e?.message||e),true);
      return false;
    }
  }

  function deleteSave(key){
    try{localStorage.removeItem(key);return true}
    catch(e){reportSave('Не удалось удалить сохранение: '+String(e?.message||e),true);return false;}
  }


  // expose for tests
  Object.assign(window, {
    FogVisibleBuildings: visibleBuildings,
    computeZone,
    hasLOS,
    doAttack,
    doAttackBuilding,
    spawn,
    addReplay,
    updateFog,
    nextTurn,
    recordEvent,
    snapshot,
    recordTurn,
    damageBuilding,
    attemptCapture,
    resetState,
    endGame,
    t,
    animateMove,
    animateShake,
    redraw,
    updateAll,
    recordReplayVideo,
    replayIndex,
    updateReplayPauseBtn,
    saveGame, loadGameData, listSaves, deleteSave,
    startMatchReplay, stopMatchReplay, seekReplay,
    });

  // === LOS ===
  function hasLOS(r0,c0,r1,c1,{forestBlock=true}={}){
    return window.FogRuleKernel.lineOfSight(map,r0,c0,r1,c1,forestBlock);
  }

  // Fog storage and last-seen memory are in a side-private, testable module.
  function visibleBuildings(){
    return window.FogVisibility.visible({state,buildings,side:state.currentPlayer,revealAll});
  }
  window.FogVisibleBuildings=visibleBuildings;
  function updateFog(){
    return window.FogVisibility.project({
      map,units,buildings,state,side:state.currentPlayer,modeBeta,revealAll,
      online:onlineGame,kernel:window.FogRuleKernel
    });
  }

  // === Draw ===

  // Unknown ground remains hidden. Paper-grain rendering prevents a
  // featureless black canvas without leaking unseen terrain or units.
  function drawUnknownGround(r,c,x,y){
    const seed=Math.abs(Math.sin((r+1)*127.1+(c+1)*311.7)*43758.5);
    const tint=seed%1;
    ctx.fillStyle=tint<.34?'#1e2720':tint<.68?'#202a23':'#222b25';
    ctx.fillRect(x,y,cellW+1,cellH+1);
    ctx.strokeStyle='rgba(181,174,131,0.075)';
    ctx.lineWidth=Math.max(.5,cellW/65);
    ctx.beginPath();
    const ox=(seed*7%1)*cellW*.35;
    ctx.moveTo(x+ox+cellW*.1,y+cellH*.13);
    ctx.lineTo(x+ox+cellW*.5,y+cellH*.34);
    ctx.moveTo(x+cellW*.48,y+cellH*.77);
    ctx.lineTo(x+cellW*.87,y+cellH*.54);
    ctx.stroke();
    ctx.fillStyle='rgba(231,218,170,0.065)';
    ctx.fillRect(x+cellW*(.25+tint*.15),y+cellH*.7,Math.max(1,cellW*.055),Math.max(1,cellH*.055));
  }

  function redrawSimple(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const p=state.currentPlayer, F=state.fog[p], S=state.seen[p];

    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      let x=c*cellW, y=r*cellH;
      if(!S[r][c]&&!revealAll){
        drawUnknownGround(r,c,x,y);
      } else {
        ctx.fillStyle=TERR_COL[map[r][c]]; ctx.fillRect(x,y,cellW,cellH);
        window.FogVisual?.depth(ctx,map[r][c],r,c,x,y,cellW,cellH,style==='toen');
        if(!revealAll&&F[r][c]){
          ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(x,y,cellW,cellH);
        }
      }
    }

    if(sel&&sel.mp>0){
      ctx.fillStyle='rgba(255,255,255,0.3)';
      zoneList.forEach(z=>ctx.fillRect(z.c*cellW,z.r*cellH,cellW,cellH));
      ctx.strokeStyle='#888'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      zoneList.forEach(z=>ctx.strokeRect(z.c*cellW+1,z.r*cellH+1,cellW-2,cellH-2));
      ctx.setLineDash([]);

      // attackable enemies considering mountains
      units.filter(u=>u.owner!==sel.owner &&
          Math.abs(u.r-sel.r)+Math.abs(u.c-sel.c)<=UNIT_TYPES[sel.type].range &&
          hasLOS(sel.r,sel.c,u.r,u.c,{forestBlock:false}))
        .forEach(u=>{
          ctx.fillStyle='rgba(255,0,0,0.3)';
          ctx.fillRect(u.c*cellW,u.r*cellH,cellW,cellH);
        });

      // healable allies for mage
      if(sel.type==='mage'){
        units.filter(u=>u.owner===sel.owner &&
            u.hp<UNIT_TYPES[u.type].hpMax &&
            Math.abs(u.r-sel.r)+Math.abs(u.c-sel.c)<=1)
          .forEach(u=>{
            ctx.fillStyle='rgba(0,255,0,0.3)';
            ctx.fillRect(u.c*cellW,u.r*cellH,cellW,cellH);
          });
      }
    }

    if(spawnMode){
      ctx.fillStyle='rgba(0,200,200,0.3)';
      spawnZones.forEach(z=>ctx.fillRect(z.c*cellW,z.r*cellH,cellW,cellH));
    }

    visibleBuildings().forEach(b=>{
      if((!F[b.r][b.c]||S[b.r][b.c]||revealAll)){
        if(b.stale)ctx.globalAlpha=0.5;
        let col = BUILD_TYPES[b.type].gen? '#fc0'
                : b.type==='fort'? '#666'
                : b.owner===p? '#00f'
                : b.owner? '#f00':'#888';
        ctx.fillStyle=col;
        ctx.fillRect(b.c*cellW+cellW*0.1,b.r*cellH+cellH*0.1,cellW*0.8,cellH*0.8);
        ctx.fillStyle='#000';
        ctx.font=`${cellH*0.5}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(BUILD_LABELS[b.type],b.c*cellW+cellW/2,b.r*cellH+cellH/2);
        if(BUILD_TYPES[b.type].gen>0||BUILD_TYPES[b.type].def>0){
          ctx.strokeStyle=b.owner===p?'#00f':b.owner? '#f00':'#888';
          ctx.lineWidth=2; ctx.setLineDash([4,4]);
          ctx.strokeRect(b.c*cellW,b.r*cellH,cellW,cellH);
          ctx.setLineDash([]);
        }
        let bw=cellW*0.6, bh=cellH*0.08,
            bx=b.c*cellW+(cellW-bw)/2,
            by=b.r*cellH+cellH*0.05;
        ctx.fillStyle='#600'; ctx.fillRect(bx,by,bw,bh);
        let frac=b.hp/BUILD_TYPES[b.type].hpMax;
        ctx.fillStyle=b.owner===p?'#0f0':'#f00';
        ctx.fillRect(bx,by,bw*frac,bh);
        ctx.globalAlpha=1;
      }
    });

    let animRunning=false;
    units.forEach(u=>{
      if((!F[u.r][u.c]||revealAll)&&S[u.r][u.c]){
        let cx=u.c*cellW+cellW/2, cy=u.r*cellH+cellH/2, rad=Math.min(cellW,cellH)/3;
        if(u.animMove){
          let t=Math.min(1,(Date.now()-u.animMove.start)/u.animMove.dur);
          cx=(u.animMove.fc+(u.animMove.tc-u.animMove.fc)*t)*cellW+cellW/2;
          cy=(u.animMove.fr+(u.animMove.tr-u.animMove.fr)*t)*cellH+cellH/2;
          if(t<1) animRunning=true; else delete u.animMove;
        }
        if(u.animShake){
          let t=(Date.now()-u.animShake.start)/u.animShake.dur;
          if(t<1){
            let amp=2;
            cx+=(Math.random()*2-1)*amp;
            cy+=(Math.random()*2-1)*amp;
            animRunning=true;
          } else delete u.animShake;
        }
        ctx.fillStyle=UNIT_TYPES[u.type].color;
        ctx.beginPath(); ctx.arc(cx,cy,rad,0,2*Math.PI); ctx.fill();
        ctx.lineWidth=0;

        let bld=buildings.find(b=>b.r===u.r&&b.c===u.c&&b.owner===u.owner),
            bonus=bld?BUILD_TYPES[bld.type].def:0;
        for(let k=0;k<bonus;k++){
          ctx.font=`${cellH*0.35}px sans-serif`;
          ctx.fillStyle='#ffd700'; ctx.textAlign='center';
          ctx.fillText('🛡',cx+(k-(bonus-1)/2)*(cellW*0.4),cy-rad-2);
        }

        let w=cellW*0.6,h=cellH*0.1,
            bx=u.c*cellW+(cellW-w)/2,
            by=u.r*cellH+cellH*0.1;
        ctx.fillStyle='#600'; ctx.fillRect(bx,by,w,h);
        let frac=u.hp/UNIT_TYPES[u.type].hpMax;
        ctx.fillStyle=u.owner===p?'#0f0':'#f00';
        ctx.fillRect(bx,by,w*frac,h);
        if(u.mp>0){
          ctx.fillStyle='#fff';
          ctx.beginPath();
          ctx.arc(cx+rad*0.6,cy-rad*0.6,rad*0.2,0,2*Math.PI);
          ctx.fill();
        }
      }
    });

    if(sel){
      ctx.strokeStyle='yellow'; ctx.lineWidth=2; ctx.setLineDash([]);
      ctx.strokeRect(sel.c*cellW+2,sel.r*cellH+2,cellW-4,cellH-4);
    }
    if(animRunning) requestAnimationFrame(redrawSimple);
  }

  function redraw(){
    // Preserve hard-edged classic sprites when the tactical canvas is zoomed.
    ctx.imageSmoothingEnabled=style!=='toen';
    canvas.style.imageRendering=style==='toen'?'pixelated':'auto';
    if(style==='simple'){ redrawSimple(); return; }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const p=state.currentPlayer, F=state.fog[p], S=state.seen[p];

    // terrain
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      let x=c*cellW, y=r*cellH;
      if(!S[r][c]&&!revealAll){
        drawUnknownGround(r,c,x,y);
      } else {
        ctx.drawImage(getGrassSprite(),x,y,cellW,cellH);
        if(map[r][c]===TERRAIN.WATER){
          ctx.drawImage(getWaterSprite(r,c),x,y,cellW,cellH);
        }
        if(map[r][c]===TERRAIN.HILL){
          ctx.drawImage(IMG[TILE_IMAGES.hill[0]],x,y,cellW,cellH);
        }else if(map[r][c]===TERRAIN.MOUNTAIN){
          ctx.drawImage(IMG[TILE_IMAGES.mountain[0]],x,y,cellW,cellH);
        }else if(map[r][c]===TERRAIN.FOREST){
          ctx.drawImage(IMG[TILE_IMAGES.forest[0]],x,y,cellW,cellH);
        }
        window.FogVisual?.depth(ctx,map[r][c],r,c,x,y,cellW,cellH,style==='toen');
        if(!revealAll&&F[r][c]){
          ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(x,y,cellW,cellH);
        }
      }
    }

    // move zone
    if(sel&&sel.mp>0){
      ctx.strokeStyle='white';
      ctx.lineWidth=2;
      ctx.setLineDash([4,4]);
      zoneList.forEach(z=>ctx.strokeRect(z.c*cellW,z.r*cellH,cellW,cellH));
      ctx.setLineDash([]);


      // attackable enemies considering mountains
      units.filter(u=>u.owner!==sel.owner &&
          Math.abs(u.r-sel.r)+Math.abs(u.c-sel.c)<=UNIT_TYPES[sel.type].range &&
          hasLOS(sel.r,sel.c,u.r,u.c,{forestBlock:false}))
        .forEach(u=>{
          const img=IMG['symbols/red_selection'];
          if(img) ctx.drawImage(img,u.c*cellW,u.r*cellH,cellW,cellH);
        });

      // healable allies for mage
      if(sel.type==='mage'){
        units.filter(u=>u.owner===sel.owner &&
            u.hp<UNIT_TYPES[u.type].hpMax &&
            Math.abs(u.r-sel.r)+Math.abs(u.c-sel.c)<=1)
          .forEach(u=>{
            const img=IMG['symbols/green_selection'];
            if(img) ctx.drawImage(img,u.c*cellW,u.r*cellH,cellW,cellH);
          });
      }
    }

    // spawn zone
    if(spawnMode){
      ctx.fillStyle='rgba(0,200,200,0.3)';
      spawnZones.forEach(z=>ctx.fillRect(z.c*cellW,z.r*cellH,cellW,cellH));
    }

    // buildings
    visibleBuildings().forEach(b=>{
      if((!F[b.r][b.c]||S[b.r][b.c]||revealAll)){
        if(b.stale)ctx.globalAlpha=0.5;
        const img = getBuildingSprite(b);
        if(img) ctx.drawImage(img,b.c*cellW,b.r*cellH,cellW,cellH);
        // Illustrated neutral assets fall back to an allied sprite; this seal
        // marks neutral ownership without replacing any original artwork.
        if(b.owner===0){
          const cx=b.c*cellW+cellW*.76,cy=b.r*cellH+cellH*.23;
          ctx.beginPath();ctx.arc(cx,cy,Math.max(4,cellW*.16),0,Math.PI*2);
          ctx.fillStyle='#d8d0b2';ctx.fill();
          ctx.strokeStyle='#514c3c';ctx.lineWidth=Math.max(1,cellW*.04);ctx.stroke();
          ctx.fillStyle='#413d32';ctx.font=`bold ${Math.max(8,cellH*.24)}px serif`;
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('•',cx,cy);
        }
        const bGen = b.gen ?? BUILD_TYPES[b.type].gen;
        if(bGen>0||BUILD_TYPES[b.type].def>0){
          ctx.strokeStyle=b.owner===p?'#00f':b.owner? '#f00':'#888';
          ctx.lineWidth=2; ctx.setLineDash([4,4]);
          ctx.strokeRect(b.c*cellW,b.r*cellH,cellW,cellH);
          ctx.setLineDash([]);
        }
        let bw=cellW*0.6, bh=cellH*0.08,
            bx=b.c*cellW+(cellW-bw)/2,
            by=b.r*cellH+cellH*0.05;
        ctx.fillStyle='#600'; ctx.fillRect(bx,by,bw,bh);
        let frac=b.hp/BUILD_TYPES[b.type].hpMax;
        ctx.fillStyle=b.owner===p?'#0f0':'#f00';
        ctx.fillRect(bx,by,bw*frac,bh);
        ctx.globalAlpha=1;
      }
    });

    // units + HP + shields
    let animRunning=false;
    units.forEach(u=>{
      if((!F[u.r][u.c]||revealAll)&&S[u.r][u.c]){
        let rad=Math.min(cellW,cellH)/3;
        let cx=u.c*cellW+cellW/2, cy=u.r*cellH+cellH/2;
        if(u.animMove){
          let t=Math.min(1,(Date.now()-u.animMove.start)/u.animMove.dur);
          cx=(u.animMove.fc+(u.animMove.tc-u.animMove.fc)*t)*cellW+cellW/2;
          cy=(u.animMove.fr+(u.animMove.tr-u.animMove.fr)*t)*cellH+cellH/2;
          if(t<1) animRunning=true; else delete u.animMove;
        }
        if(u.animShake){
          let t=(Date.now()-u.animShake.start)/u.animShake.dur;
          if(t<1){
            let amp=2;
            cx+=(Math.random()*2-1)*amp;
            cy+=(Math.random()*2-1)*amp;
            animRunning=true;
          } else delete u.animShake;
        }
        const sprite = getUnitSprite(u);
        if(sprite) ctx.drawImage(sprite,cx-rad,cy-rad,rad*2,rad*2);

        let bld=buildings.find(b=>b.r===u.r&&b.c===u.c&&b.owner===u.owner),
            bonus=bld?BUILD_TYPES[bld.type].def:0;
        for(let k=0;k<bonus;k++){
          ctx.font=`${cellH*0.35}px sans-serif`;
          ctx.fillStyle='#ffd700'; ctx.textAlign='center';
          ctx.fillText('🛡',cx+(k-(bonus-1)/2)*(cellW*0.4),cy-rad-2);
        }

        let terrainBonus = TERR_DEF[map[u.r][u.c]];
        if(terrainBonus>0){
          for(let k=0;k<terrainBonus;k++){
            ctx.font=`${cellH*0.25}px sans-serif`;
            ctx.fillStyle='#8cf'; ctx.textAlign='center';
            ctx.fillText('🛡',cx+(k-(terrainBonus-1)/2)*(cellW*0.3),cy-rad-cellH*0.35-2);
          }
        }

        let w=cellW*0.6,h=cellH*0.1,
            bx=u.c*cellW+(cellW-w)/2,
            by=u.r*cellH+cellH*0.1;
        ctx.fillStyle='#600'; ctx.fillRect(bx,by,w,h);
        let frac=u.hp/UNIT_TYPES[u.type].hpMax;
        ctx.fillStyle=u.owner===p?'#0f0':'#f00';
        ctx.fillRect(bx,by,w*frac,h);
        if(u.mp>0){
          ctx.fillStyle='#fff';
          ctx.beginPath();
          ctx.arc(cx+rad*0.6,cy-rad*0.6,rad*0.2,0,2*Math.PI);
          ctx.fill();
        }
      }
    });

    // selection
    if(sel){
      const img=IMG['symbols/yellow_selection'];
      if(img) ctx.drawImage(img,sel.c*cellW,sel.r*cellH,cellW,cellH);
    }

    // map border
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1;
    ctx.strokeRect(0,0,canvas.width,canvas.height);
    if(animRunning) requestAnimationFrame(redraw);
  }

  // === computeZone ===
  function computeZone(u){
    const rem=window.FogRuleKernel.reach(map,units,buildings,u,TERR_COST);
    const list=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(rem[r][c]>=0&&(r!==u.r||c!==u.c)&&
         !units.some(other=>other.r===r&&other.c===c))list.push({r,c});
    }
    return {rem,list};
  }

  // === doAttack ===
  function doAttack(att,def){
    if(att.type==='mage')return {dmg:0,rdmg:0};
    const result=window.FogRuleKernel.unitDamage(att,def,map,buildings,
      UNIT_TYPES,BUILD_TYPES,TERR_DEF);
    const dmg=result.damage,rdmg=result.retaliation;
    if(def.type!=='bog')def.hp-=dmg;
    if(att.type!=='bog')att.hp-=rdmg;
    let killed=false;
    if(def.hp<=0&&def.type!=='bog'){units.splice(units.indexOf(def),1);killed=true;}
    if(att.hp<=0&&att.type!=='bog')units.splice(units.indexOf(att),1);
    return {dmg,rdmg,killed};
  }

  function doAttackBuilding(att,bld){
    if(att.type==='mage')return {dmg:0};
    const dmg=window.FogRuleKernel.buildingDamage(att,bld,map,UNIT_TYPES,
      BUILD_TYPES,TERR_DEF);
    damageBuilding(bld,dmg);
    return {dmg};
  }

  function damageBuilding(b, dmg=1){
    if(!b) return;
    b.hp -= dmg;
    if(b.hp <= 0){
      b.hp = 0;
    }
  }

  function attemptCapture(unit,building){
    if(!building)return;
    const result=window.FogRuleKernel.capture(unit,building,BUILD_TYPES);
    if(!result.valid||!result.captured)return;
    const baseTaken=(building.gen??BUILD_TYPES[building.type].gen)===0;
    recordEvent(baseTaken?t('eventBaseCaptured'):
      t('eventResourceCaptured').replace('{building}',BUILD_LABELS[building.type]));
    playAudio(captureSfx);
    window.FogVisual?.action('capture',building.r,building.c);
    if(!aiMode)addReplay({type:'capture',building});
  }

  // === spawn ===
  function spawn(type,r,c){
    const p=state.currentPlayer, cost=UNIT_TYPES[type].cost;
    const source=spawnSource||buildings.find(b=>b.owner===p&&
      BUILD_TYPES[b.type]?.spawn.includes(type)&&Math.abs(b.r-r)+Math.abs(b.c-c)===1);
    if(!window.FogRuleKernel.canSpawn(map,units,buildings,state,source,type,
      {r,c},UNIT_TYPES,BUILD_TYPES,modeBeta)){
      reportSave(units.length>=140?'Лимит армии: 140 отрядов.':
        'Наём невозможен: проверь золото и свободную клетку.',true);
      return;
    }
    const unit={id:nextUnitId++,r,c,owner:p,type,hp:UNIT_TYPES[type].hpMax,mp:0,startR:r,startC:c};
    units.push(unit);
    window.FogAudio?.play('spawn');window.FogVisual?.action('spawn',r,c);
    if(!aiMode) addReplay({type:'spawn',unit});
    state.gold[p]-=cost;
    recordEvent(t('eventUnitCreated').replace('{unit}', UNIT_LABELS[type]));
    spawnMode=false; spawnSource=null; spawnZones=[]; window.spawnZones = spawnZones;
    updateAll();
  }

  // === checkVictory ===
  // Five completed turns by the affected side, never five redraws/actions.
  // Military buildings (gen=0) retain the original game's base definition.
  function checkVictory(endedSide=null){
    if(onlineGame||gameOver)return;
    const winner=window.FogRuleKernel.evaluateVictory(state,units,buildings,
      BUILD_TYPES,endedSide);
    if(winner!==null)endGame(winner);
  }

  function endGame(w){
    gameOver=true;
    if(!replayEvents.length || replayEvents[replayEvents.length-1].type!=='end'){
      replayEvents.push({type:'end', winner:w, snapshot:snapshot()});
    }
    victoryText.textContent = t('victory').replace('{player}', w);
    victoryOverlay.style.display = 'flex';
  }

  // === updateLeft ===
  function updateLeft(){
    const p=state.currentPlayer;
    let income=buildings.filter(b=>b.owner===p)
                        .reduce((s,b)=>s+(b.gen ?? BUILD_TYPES[b.type].gen),0),
        mbases=buildings.filter(b=>b.owner===p&& (b.gen ?? BUILD_TYPES[b.type].gen)===0).length,
        mres=buildings.filter(b=>b.owner===p&& (b.gen ?? BUILD_TYPES[b.type].gen)>0).length;
    let counts={};
    units.filter(u=>u.owner===p).forEach(u=>counts[u.type]=(counts[u.type]||0)+1);
    let selInfo=sel
      ? sel.type==='mage'
        ? t('selectedMage')
            .replace('{unit}', UNIT_LABELS[sel.type])
            .replace('{mp}', sel.mp)
            .replace('{move}', UNIT_TYPES[sel.type].move)
        : t('selectedUnit')
            .replace('{unit}', UNIT_LABELS[sel.type])
            .replace('{hp}', sel.hp)
            .replace('{hpMax}', UNIT_TYPES[sel.type].hpMax)
            .replace('{mp}', sel.mp)
            .replace('{move}', UNIT_TYPES[sel.type].move)
      : t('notSelected');
    leftStats.innerHTML=
      `<div>${t('statsTurn').replace('{turn}', state.turn).replace('{player}', p)}</div>
       <div>${t('statsGold').replace('{gold}', state.gold[p]).replace('{income}', income)}</div>
       <div>${t('statsBases').replace('{count}', mbases)}</div>
       <div>${t('statsResources').replace('{count}', mres)}</div>
       <div>${t('statsUnits')}</div>
       ${Object.entries(counts).map(([t,c])=>`<div style="margin-left:10px;">${UNIT_LABELS[t]}: ${c}</div>`).join('')}
       <div style="margin-top:8px;">${selInfo}</div>`;
  }

  // === updateAll ===
  function updateAll(){
    updateFog(); redraw(); updateLeft(); checkVictory(); renderLog();
    window.FogRefreshMap?.();
  }


  // === click handler ===
  canvas.addEventListener('click',e=>{
    if(onlineGame){ onlineCanvasClick(e); return; }
    if(gameOver) return;
    const rect=canvas.getBoundingClientRect(),
          x=Math.floor((e.clientX-rect.left)*COLS/rect.width),
          y=Math.floor((e.clientY-rect.top)*ROWS/rect.height),
          p=state.currentPlayer;
    if(x<0||y<0||x>=COLS||y>=ROWS)return;

    if(spawnMode){
      let z=spawnZones.find(z=>z.r===y&&z.c===x);
      if(z) spawn(spawnType,y,x);
      else { spawnMode=false; spawnZones=[]; window.spawnZones = spawnZones; updateAll(); }
      return;
    }
    if(spawnPanel.style.display==='block'){ spawnPanel.style.display='none'; return; }
    if(overlay.style.display==='flex') return;

    if(sel&&sel.type==='mage'&&sel.mp>0){
      let tgt=units.find(u=>u.r===y&&u.c===x&&u.owner===p&&u.hp<UNIT_TYPES[u.type].hpMax);
      if(window.FogRuleKernel.canHeal(sel,tgt,p,UNIT_TYPES)){
        sel.mp=0; tgt.hp=Math.min(UNIT_TYPES[tgt.type].hpMax,tgt.hp+2);
        recordEvent(t('mageHeal').replace('{unit}', UNIT_LABELS[tgt.type]));
        playAudio(healSfx);window.FogVisual?.action('heal',y,x,{amount:2});
        sel=null; zoneMap=null; zoneList=[]; updateAll(); return;
      }
    }

    if(sel){
      let bd=buildings.find(b=>b.r===y&&b.c===x&&b.owner===p&&BUILD_TYPES[b.type].spawn.length);
      if(bd&&sel.r===y&&sel.c===x){
        spawnPanel.innerHTML=`<strong>${BUILD_LABELS[bd.type]}</strong>`;
          BUILD_TYPES[bd.type].spawn
            .filter(type=>type!=='bog'||modeBeta)
            .forEach(type=>{
              let btn=document.createElement('button');
              btn.textContent=`${UNIT_LABELS[type]} (${UNIT_TYPES[type].cost} ${t('goldShort')})`;
              btn.onclick=()=>{
                spawnType=type;spawnSource=bd;
              spawnZones=[
                {r:bd.r-1,c:bd.c},{r:bd.r+1,c:bd.c},
                {r:bd.r,c:bd.c-1},{r:bd.r,c:bd.c+1}
              ].filter(z=>
                z.r>=0&&z.r<ROWS&&z.c>=0&&z.c<COLS&&
                map[z.r][z.c]!==TERRAIN.MOUNTAIN&&
                !units.find(u=>u.r===z.r&&u.c===z.c)
              );
              window.spawnZones = spawnZones;
              spawnMode=true; spawnPanel.style.display='none'; updateAll();
            };
            spawnPanel.appendChild(btn);
          });
        spawnPanel.style.display='block';
        sel=null; zoneMap=null; zoneList=[]; return;
      }
      if(sel.mp>0){
        const info=UNIT_TYPES[sel.type];
        const dist=abs(y-sel.r)+abs(x-sel.c);
        const tgt=units.find(u=>u.r===y&&u.c===x&&u.owner!==p);
        const bldTgt=!tgt && buildings.find(b=>b.r===y&&b.c===x&&b.owner!==p);
        if(tgt&&dist<=info.range && hasLOS(sel.r,sel.c,tgt.r,tgt.c,{forestBlock:false})){
          if(map[sel.r][sel.c]===TERRAIN.WATER){
            recordEvent(t('noAttackWater'));
            sel=null; zoneMap=null; zoneList=[]; updateAll(); return;
          }
          sel.mp=0;
          const {dmg,rdmg,killed}=doAttack(sel,tgt);
          if(!aiMode) addReplay({type:'attack',target:tgt});
          playAudio(attackSfx);window.FogVisual?.action('attack',tgt.r,tgt.c,{amount:dmg});
          animateShake(tgt);
          if(killed && UNIT_TYPES[sel.type].range===1){
            if(!aiMode) addReplay({type:'move',unit:sel,from:{r:sel.r,c:sel.c},to:{r:tgt.r,c:tgt.c}});
            animateMove(sel,sel.r,sel.c,tgt.r,tgt.c);
            sel.r=tgt.r; sel.c=tgt.c;
            let bb=buildings.find(b=>b.r===sel.r&&b.c===sel.c&&b.owner!==p);
            if(bb) damageBuilding(bb);
            bb=buildings.find(b=>b.r===sel.r&&b.c===sel.c);
            if(bb) attemptCapture(sel, bb);
          }
          recordEvent(
            t('eventAttackUnit')
              .replace('{attacker}', UNIT_LABELS[sel.type])
              .replace('{target}', UNIT_LABELS[tgt.type])
              .replace('{dmg}', dmg)
              + (rdmg ? t('eventRetaliation').replace('{dmg}', rdmg) : '')
          );
          if(sel.mp>0){
            let cz=computeZone(sel); zoneMap=cz; zoneList=cz.list;
          } else {
            sel=null; zoneMap=null; zoneList=[];
          }
          updateAll(); return;
        }
        if(bldTgt && dist<=info.range && hasLOS(sel.r,sel.c,bldTgt.r,bldTgt.c,{forestBlock:false})){
          if(map[sel.r][sel.c]===TERRAIN.WATER){
            recordEvent(t('noAttackWater'));
            sel=null; zoneMap=null; zoneList=[]; updateAll(); return;
          }
          const hadMove = sel.mp>0;
          sel.mp=0;
          const {dmg}=doAttackBuilding(sel,bldTgt);
          if(!aiMode) addReplay({type:'attack',target:bldTgt});
          playAudio(attackSfx);window.FogVisual?.action('attack',bldTgt.r,bldTgt.c,{amount:dmg});
          animateShake(bldTgt);
          let destroyed = bldTgt.hp<=0;
          if(destroyed && hadMove && dist===1){
            if(!aiMode) addReplay({type:'move',unit:sel,from:{r:sel.r,c:sel.c},to:{r:bldTgt.r,c:bldTgt.c}});
            animateMove(sel,sel.r,sel.c,bldTgt.r,bldTgt.c);
            sel.r=bldTgt.r; sel.c=bldTgt.c;
            attemptCapture(sel,bldTgt);
          }
          recordEvent(
            t('eventAttackBuilding')
              .replace('{attacker}', UNIT_LABELS[sel.type])
              .replace('{building}', BUILD_LABELS[bldTgt.type])
              .replace('{dmg}', dmg)
          );
          if(sel.mp>0){
            let cz=computeZone(sel); zoneMap=cz; zoneList=cz.list;
          } else {
            sel=null; zoneMap=null; zoneList=[];
          }
          updateAll(); return;
        }
        if(zoneMap.rem[y][x]>=0 && !units.find(u=>u.r===y&&u.c===x)){
          const from={r:sel.r,c:sel.c};
          sel.mp=zoneMap.rem[y][x];
          let moved = (y!==sel.r || x!==sel.c);
          let bb=buildings.find(b=>b.r===y&&b.c===x&&b.owner!==p);
          if(bb) damageBuilding(bb);
          if(moved && !aiMode) addReplay({type:'move',unit:sel,from,to:{r:y,c:x}});
          animateMove(sel,sel.r,sel.c,y,x);
          if(moved){window.FogAudio?.play('move');window.FogVisual?.action('move',y,x);}
          sel.r=y; sel.c=x;
          bb=buildings.find(b=>b.r===sel.r&&b.c===sel.c);
          if(bb) attemptCapture(sel, bb);
          if(moved) recordEvent(t('eventMove').replace('{unit}', UNIT_LABELS[sel.type]));
          if(sel.mp>0){
            let cz=computeZone(sel); zoneMap=cz; zoneList=cz.list;
          } else {
            sel=null; zoneMap=null; zoneList=[];
          }
          updateAll(); return;
        }
      }
      sel=null; zoneMap=null; zoneList=[]; updateAll(); return;
    }

    let u=units.find(u=>u.owner===p&&u.r===y&&u.c===x);
    if(u){ sel=u; 
      if(u.mp>0){ let cz=computeZone(u); zoneMap=cz; zoneList=cz.list; }
      else { zoneMap=null; zoneList=[]; }
      updateAll(); return;
    }

    let bld=buildings.find(b=>b.owner===p&&BUILD_TYPES[b.type].spawn.length&&b.r===y&&b.c===x);
    if(bld){
      spawnPanel.innerHTML=`<strong>${BUILD_LABELS[bld.type]}</strong>`;
        BUILD_TYPES[bld.type].spawn
          .filter(type=>type!=='bog'||modeBeta)
          .forEach(type=>{
            let btn=document.createElement('button');
            btn.textContent=`${UNIT_LABELS[type]} (${UNIT_TYPES[type].cost} ${t('goldShort')})`;
            if(state.gold[p] < UNIT_TYPES[type].cost) btn.style.color='red';
            btn.onclick=()=>{
              spawnType=type;
            spawnZones=[
              {r:bld.r-1,c:bld.c},{r:bld.r+1,c:bld.c},
              {r:bld.r,c:bld.c-1},{r:bld.r,c:bld.c+1}
            ].filter(z=>
              z.r>=0&&z.r<ROWS&&z.c>=0&&z.c<COLS&&
              map[z.r][z.c]!==TERRAIN.MOUNTAIN&&
              !units.find(u=>u.r===z.r&&u.c===z.c)
            );
            window.spawnZones = spawnZones;
            spawnMode=true; spawnPanel.style.display='none'; updateAll();
          };
          spawnPanel.appendChild(btn);
        });
      spawnPanel.style.display='block';
    }
  });

  // === right-click cancels selection ===
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(spawnMode){
      spawnMode=false; spawnZones=[]; window.spawnZones = spawnZones; spawnPanel.style.display='none';
    } else if(sel){
      sel=null; zoneMap=null; zoneList=[];
    }
    updateAll();
  });

  canvas.addEventListener('mousemove',e=>{
    if(!tooltipEnabled) return;
    const rect=canvas.getBoundingClientRect();
    const x=Math.floor((e.clientX-rect.left)*COLS/rect.width);
    const y=Math.floor((e.clientY-rect.top)*ROWS/rect.height);
    if(x<0||y<0||x>=COLS||y>=ROWS){ tooltipDiv.style.display='none'; return; }
    const p=state.currentPlayer, F=state.fog[p], S=state.seen[p];
    if(!revealAll && !S[y][x]){ tooltipDiv.style.display='none'; return; }
    let txt=TERR_LABELS[map[y][x]];
    let u=units.find(u=>u.r===y&&u.c===x && (revealAll || !F[y][x]) && S[y][x]);
    if(u) txt += ' — '+UNIT_LABELS[u.type];
    let b=buildings.find(b=>b.r===y&&b.c===x && (revealAll || !F[y][x]) && S[y][x]);
    if(b) txt += ' '+BUILD_LABELS[b.type];
    tooltipDiv.textContent=txt;
    tooltipDiv.style.left=(e.clientX+10)+'px';
    tooltipDiv.style.top=(e.clientY+10)+'px';
    tooltipDiv.style.display='block';
  });

  canvas.addEventListener('mouseleave',()=>{ tooltipDiv.style.display='none'; });

  // === Передача хода ===
  endTurnBtn.addEventListener('click',()=>{
    if(onlineGame){
      if(!window.FogPocketNet?.canIssue())return;
      overlayMsg.textContent='Передать ход сопернику?';
      overlay.style.display='flex';
      continueAfter=()=>{window.FogPocketNet.issue({type:'end'});};
      return;
    }
    if(gameOver) return;
    spawnMode=false; spawnZones=[]; window.spawnZones = spawnZones; spawnPanel.style.display='none';
    overlayMsg.textContent = t('passTurnConfirm').replace('{player}', state.currentPlayer===1?2:1);
    overlay.style.display = 'flex';
    continueAfter = ()=>{
      overlay.style.display='none';
      if(aiMode){
        fogSnapshot = state.fog[1].map(r=>r.slice());
        window.fogSnapshot = fogSnapshot;
        waitText.textContent = t('waitEnemyTurn');
        skipReplayBtn.style.display='none';
        waitOverlay.style.display='flex';
        nextTurn();
        aiTakeTurn();
        replayAI();
      } else {
        nextTurn();
        if(aiReplay.length){
          waitText.textContent = t('replayEnemyTurn');
          skipReplayBtn.style.display='block';
          waitOverlay.style.display='flex';
          replayAI();
        }
      }
    };
  });
  yesBtn.addEventListener('click',()=>{ overlay.style.display='none'; continueAfter&&continueAfter(); });
  noBtn.addEventListener('click',()=>{ overlay.style.display='none'; });

  legendBtn.addEventListener('click',()=>{ legendOverlay.style.display='flex'; });
  legendBtn.addEventListener('keydown',e=>{
    if(e.key==='Enter' || e.key===' '){
      e.preventDefault();
      legendOverlay.style.display='flex';
    }
  });
  panelToggleBtn.addEventListener('click',()=>{
    const collapsed = infoPanel.classList.toggle('collapsed');
    panelToggleBtn.textContent = collapsed ? '▲' : '▼';
    panelToggleBtn.setAttribute('title', t(collapsed ? 'infoExpand' : 'infoCollapse'));
  });
  legendOverlay.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      legendOverlay.style.display='none';
      legendBtn.focus();
    }
  });
  legendCloseBtn.addEventListener('click',()=>{ legendOverlay.style.display='none'; });
  victoryOkBtn.addEventListener('click',()=>{
    victoryOverlay.style.display='none';
    goToMenu();
  });

  victoryMenuBtn.addEventListener('click',()=>{
    victoryOverlay.style.display='none';
    goToMenu();
  });

  viewReplayBtn.addEventListener('click',()=>{
    victoryOverlay.style.display='none';
    startMatchReplay();
  });

  exitReplayBtn.addEventListener('click',()=>{
    stopMatchReplay();
    goToMenu();
  });

  speedBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const sp = parseFloat(btn.dataset.speed);
      speedBtns.forEach(b=>b.classList.remove('speed-selected'));
      btn.classList.add('speed-selected');
      const wasPaused = replayPaused;
      replaySpeed = sp;
      replayPaused = false;
      if(wasPaused && typeof runReplayStep === 'function') runReplayStep();
      updateReplayPauseBtn();
      window.replayPaused = replayPaused;
    });
  });
  if(replaySideBtn){
    replaySideBtn.addEventListener('click',()=>{
      replaySide = replaySide===1?2:1;
      applySnapshot(currentReplaySnapshot);
    });
  }

  if(replaySeek){
    replaySeek.addEventListener('input',()=>{
      seekReplay(parseInt(replaySeek.value,10));
    });
  }
  if(replayRestartBtn){
    replayRestartBtn.addEventListener('click',()=>{
      replayPaused = false;
      seekReplay(0);
      window.replayPaused = replayPaused;
      updateReplayPauseBtn();
    });
  }
  if(saveReplayBtn){
    saveReplayBtn.addEventListener('click', recordReplayVideo);
  }

  if(replayToggleBtn){
    replayToggleBtn.addEventListener('click',()=>{
      const collapsed = replayControls.classList.toggle('collapsed');
      if(collapsed){
        replayToggleBtn.setAttribute('title', t('replayExpand'));
      }else{
        replayToggleBtn.setAttribute('title', t('replayCollapse'));
      }
      window.replayPaused = replayPaused;
    });
  }

  function updateReplayPauseBtn(){
    if(!replayPauseBtn) return;
    replayPauseBtn.textContent = replayPaused ? '▶' : '⏸';
  }

  if(replayPauseBtn){
    replayPauseBtn.addEventListener('click',()=>{
      if(replayPaused){
        replayPaused = false;
        speedBtns.forEach(b=>b.classList.remove('speed-selected'));
        const def=document.querySelector(`.speedBtn[data-speed="${replaySpeed}"]`);
        if(def) def.classList.add('speed-selected');
        if(typeof runReplayStep === 'function') runReplayStep();
      }else{
        replayPaused = true;
      }
      updateReplayPauseBtn();
      window.replayPaused = replayPaused;
    });
  }

  skipReplayBtn.addEventListener('click', stopReplay);

  hintsChk.addEventListener('change',()=>{
    tooltipEnabled = hintsChk.checked;
    if(!tooltipEnabled) tooltipDiv.style.display = 'none';
  });

  settingsBtn.addEventListener('click',()=>{
    styleSelect.value = style;
    musicEnableEl.checked = musicEnabled;
    musicVolumeEl.disabled = !musicEnabled;
    musicVolumeEl.value = musicVolume;
    sfxEnableEl.checked = sfxEnabled;
    sfxVolumeEl.disabled = !sfxEnabled;
    sfxVolumeEl.value = sfxVolume;
    langSelect.value = lang;
    hintsChk.checked = tooltipEnabled;
    if(saveBtn){
      saveBtn.style.display = (!onlineGame && startPanel.style.display === 'none') ? 'block' : 'none';
    }
    const exportCurrent=document.getElementById('fogExportCurrentBtn');
    if(exportCurrent)exportCurrent.style.display=(!onlineGame&&startPanel.style.display==='none'
      &&map.length)?'block':'none';
    settingsOverlay.style.display='flex';
  });

  if(startSettingsBtn){
    startSettingsBtn.addEventListener('click', ()=>{
      settingsBtn.click();
    });
  }
  if(newGameBtn){
    newGameBtn.addEventListener('click', ()=>{
      newGameBtn.style.display='none';
      if(newGameOptions) newGameOptions.style.display='flex';
    });
  }
  async function applySettings(){
    style = styleSelect.value;
    musicEnabled = musicEnableEl.checked;
    musicVolumeEl.disabled = !musicEnabled;
    musicVolume = parseFloat(musicVolumeEl.value);
    sfxEnabled = sfxEnableEl.checked;
    sfxVolumeEl.disabled = !sfxEnabled;
    sfxVolume = parseFloat(sfxVolumeEl.value);
    lang = langSelect.value;
    loadLangStrings();
    applyStrings();
    updateLabels();
    setupLegend();
    applyVolumes();
    await loadImages('assets');
    if(style==='ai') await loadAiTiles();
    saveSettings();
    if(state.fog[state.currentPlayer]){
      updateAll();
    }
  }

  [styleSelect,musicEnableEl,musicVolumeEl,sfxEnableEl,sfxVolumeEl,langSelect].forEach(el=>{
    el.addEventListener('input', applySettings);
    el.addEventListener('change', applySettings);
  });

  settingsCloseBtn.addEventListener('click',()=>{
    settingsOverlay.style.display='none';
  });

  settingsMenuBtn.addEventListener('click',()=>{
    settingsOverlay.style.display='none';
    goToMenu();
  });

  if(fullscreenBtn){
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      }
    });
  }

  // === UI sounds ===
  document.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('mouseenter',()=>playAudio(uiHoverSfx));
    btn.addEventListener('click',()=>playAudio(uiClickSfx));
  });

  if(saveBtn){
    saveBtn.addEventListener('click', saveGame);
  }
  function downloadParty(payload){
    // Export is an explicit gesture; never upload personal offline play data.
    const valid=window.FogSaveSchema.normalize(payload);
    const packed=window.FogReplayCodec.packSave(valid);
    const blob=new Blob([JSON.stringify(packed)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='fog-conquest-'+new Date(packed.timestamp).toISOString().slice(0,10)+'.json';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    reportSave('Файл партии подготовлен для скачивания.');
  }
  document.getElementById('fogExportCurrentBtn')?.addEventListener('click',()=>{
    if(onlineGame||startPanel.style.display!=='none'||!map.length){
      reportSave('Экспорт доступен только для локальной партии.',true);return;
    }
    try{downloadParty(safeSavePayload());}
    catch(e){reportSave('Экспорт не удался: '+String(e?.message||e),true);}
  });
  const importButton=document.getElementById('fogImportSaveBtn');
  const importInput=document.getElementById('fogImportSaveInput');
  importButton?.addEventListener('click',()=>importInput?.click());
  importInput?.addEventListener('change',async()=>{
    const file=importInput.files?.[0];
    importInput.value='';
    if(!file)return;
    if(file.size>3*1024*1024){
      reportSave('Файл слишком большой (максимум 3 МБ).',true);return;
    }
    try{
      const raw=JSON.parse(await file.text());
      // Import never overwrites the active match or PocketNet session.
      const normalized=window.FogSaveSchema.normalize(raw);
      const archive=window.FogReplayCodec.packSave(normalized);
      const key=SAVE_PREFIX+archive.timestamp+'-import-'+Date.now();
      localStorage.setItem(key,JSON.stringify(archive));
      populateLoadList();
      reportSave('Партия импортирована. Выбери её в списке для загрузки.');
    }catch(e){
      reportSave('Импорт отклонён: '+String(e?.message||e),true);
    }
  });

  if(loadBtn){
    loadBtn.addEventListener('click', ()=>{
      populateLoadList();
      loadOverlay.style.display='flex';
    });
  }

  function populateLoadList(){
    loadList.innerHTML = '';
    const saves = listSaves();
    if(!saves.length){
      const div=document.createElement('div');
      div.textContent = t('noSaves');
      loadList.appendChild(div);
      return;
    }
    saves.forEach(s=>{
      const row=document.createElement('div');
      row.className='load-item';
      const date=new Date(s.timestamp).toLocaleString();
      row.innerHTML = `<span>${date}</span>`+
        `<span><button data-key="${s.key}" class="loadBtn game-btn" data-i18n="loadSave">${t('loadSave')}</button>`+
        `<button data-key="${s.key}" class="delBtn game-btn" data-i18n="deleteSave">${t('deleteSave')}</button>`+
        `<button data-key="${s.key}" class="exportBtn game-btn">Экспорт</button></span>`;
      loadList.appendChild(row);
    });
    applyStrings();
    loadList.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('mouseenter',()=>playAudio(uiHoverSfx));
      btn.addEventListener('click',()=>playAudio(uiClickSfx));
    });
  }

  loadList.addEventListener('click',e=>{
    const key=e.target.dataset.key;
    if(e.target.classList.contains('loadBtn')){
      if(loadGameData(key))loadOverlay.style.display='none';
    }else if(e.target.classList.contains('delBtn')){
      deleteSave(key);
      populateLoadList();
    }else if(e.target.classList.contains('exportBtn')){
      try{
        const raw=JSON.parse(localStorage.getItem(key));
        downloadParty(raw);
      }catch(error){
        reportSave('Не удалось экспортировать сохранение: '+String(error?.message||error),true);
      }
    }
  });

  loadCloseBtn.addEventListener('click',()=>{loadOverlay.style.display='none';});

  // === Туман войны (бета) ===
  revealBtn.addEventListener('click',()=>{
    if(!modeBeta) return;
    revealAll = !revealAll;
    revealBtn.textContent = revealAll ? t('revealHide') : t('revealShow');
    updateAll();
  });

  // === Стартовые кнопки ===
  function setMapSize(size){
    mapSize=size;
    if(size==='tiny'){
      ROWS=Math.round(BASE_ROWS*0.25);
      COLS=Math.round(BASE_COLS*0.25);
    }else if(size==='small'){
      ROWS=Math.round(BASE_ROWS*0.5);
      COLS=Math.round(BASE_COLS*0.5);
    }else if(size==='large'){
      ROWS=BASE_ROWS;
      COLS=BASE_COLS*2;
    }else{
      ROWS=BASE_ROWS; COLS=BASE_COLS;
    }
    // The tactical atlas runs outside the legacy closure and needs accurate
    // dimensions for every original map size, not only restored/online games.
    window.ROWS=ROWS;window.COLS=COLS;window.mapSize=mapSize;
    initFog();
    window.dispatchEvent(new Event('resize'));
  }

  function nextTurn(){
    const prev=state.currentPlayer;
    if(!aiMode&&!onlineGame)window.FogShowHandoff?.(3-prev);
    sel=null;zoneMap=null;zoneList=[];
    window.FogRuleKernel.advanceTurn(state,units,buildings,UNIT_TYPES,BUILD_TYPES);
    checkVictory(prev);
    recordTurn();updateAll();
    if(!aiMode)window.FogCenterCamera?.(state.currentPlayer);
  }


  twoBtn.addEventListener('click',()=>{
    resetState();
    modeBeta=false; revealBtn.style.display='none';
    BUILD_TYPES.base.spawn = [...BASE_SPAWN_DEFAULT];
    aiMode=false;
    setMapSize(mapSizeSel.value);
    startPanel.style.display='none';
    generateWorld(modeBeta);
    replayEvents.push({type:'start', snapshot:snapshot()});
    recordTurn(); updateAll();
  });

  aiBtn.addEventListener('click',()=>{
    startPanel.style.display='none';
    aiPanel.style.display='flex';
  });

  aiStartBtn.addEventListener('click',()=>{
    resetState();
    modeBeta=false; revealBtn.style.display='none';
    BUILD_TYPES.base.spawn = [...BASE_SPAWN_DEFAULT];
    aiMode=true;
    aiLevel=parseInt(aiLevelSel.value,10);
    window.aiLevel = aiLevel;
    setMapSize(mapSizeSel.value);
    aiPanel.style.display='none';
    generateWorld(modeBeta);
    replayEvents.push({type:'start', snapshot:snapshot()});
    recordTurn(); updateAll();
  });

  betaBtn.addEventListener('click',()=>{
    resetState();
    modeBeta=true; revealBtn.style.display='inline-block';
    BUILD_TYPES.base.spawn = [...BASE_SPAWN_DEFAULT, 'bog'];
    aiMode=false;
    setMapSize(mapSizeSel.value);
    startPanel.style.display='none';
    generateWorld(modeBeta);
    replayEvents.push({type:'start', snapshot:snapshot()});
    recordTurn(); updateAll();
  });

  onlineBtn.addEventListener('click', ()=>{
    if(newGameOptions) newGameOptions.style.display='none';
    startPanel.style.display='none';
    lobbyPanel.style.display='flex';
  });

  if(tutorialBtn){
    tutorialBtn.addEventListener('click', ()=>{
      startPanel.style.display='none';
      tutorialOverlay.style.display='flex';
    });
  }

  if(tutorialCloseBtn){
    tutorialCloseBtn.addEventListener('click', ()=>{
      tutorialOverlay.style.display='none';
      startPanel.style.display='flex';
    });
  }

  lobbyBackBtn.addEventListener('click',()=>{
    if(window.FogPocketNet){window.FogPocketNet.leave();return;}
    lobbyPanel.style.display='none';
    startPanel.style.display='flex';
    if(newGameOptions)newGameOptions.style.display='flex';
  });

  // PocketNet is the only transport; historical root-WebSocket code removed.
  createRoomBtn.addEventListener('click',()=>{
    if(window.FogPocketNet)void window.FogPocketNet.create(mapSizeSel.value);
    else reportSave('PocketNet ещё загружается. Повтори действие.',true);
  });
  joinRoomBtn.addEventListener('click',()=>{
    if(window.FogPocketNet)void window.FogPocketNet.join(roomIdInput.value.trim());
    else reportSave('PocketNet ещё загружается. Повтори действие.',true);
  });

  // === Инициализация ===
  (async ()=>{
    await loadImages('assets');
    if(style==='ai') await loadAiTiles();
    setupLegend();
    window.dispatchEvent(new Event('resize'));
    handleOrientation();
  })();

  // PocketNet adapter: retain original rendering, UI logic and local rules in solo mode.
  // Online commands are intents sent to authoritative matching rules, never full snapshots.
  let onlineSide=0,onlineTurn=0,onlineBuilding=null;
  function onlineCanvasClick(e){
    if(!window.FogPocketNet?.canIssue())return;
    const rect=canvas.getBoundingClientRect();
    const c=Math.floor((e.clientX-rect.left)*COLS/rect.width),
          r=Math.floor((e.clientY-rect.top)*ROWS/rect.height);
    if(r<0||c<0||r>=ROWS||c>=COLS)return;
    const action=command=>{spawnMode=false;spawnPanel.style.display='none';onlineBuilding=null;sel=null;zoneMap=null;zoneList=[];updateAll();window.FogPocketNet.issue(command);};
    if(spawnMode&&onlineBuilding){
      if(spawnZones.some(x=>x.r===r&&x.c===c)){action({type:'spawn',building:onlineBuilding,unitType:spawnType,r,c});return;}
      spawnMode=false;onlineBuilding=null;spawnPanel.style.display='none';
    }
    if(state.fog[onlineSide]?.[r]?.[c]){sel=null;zoneMap=null;zoneList=[];updateAll();return;}
    const own=units.find(u=>u.owner===onlineSide&&u.r===r&&u.c===c);
    if(sel?.type==='mage'&&own&&distanceFrom(sel,own)<=1&&own.hp<UNIT_TYPES[own.type].hpMax&&sel.mp>0){
      action({type:'heal',unit:sel.id,r,c});return;
    }
    if(sel&&sel.mp>0){
      const enemy=units.find(u=>u.owner!==onlineSide&&u.r===r&&u.c===c);
      const bld=buildings.find(b=>b.owner!==onlineSide&&b.r===r&&b.c===c);
      if((enemy||bld)&&distanceFrom(sel,{r,c})<=UNIT_TYPES[sel.type].range){
        action({type:'attack',unit:sel.id,r,c});return;
      }
      if(zoneMap?.rem?.[r]?.[c]>=0&&!units.some(u=>u.r===r&&u.c===c)){
        action({type:'move',unit:sel.id,r,c});return;
      }
    }
    if(own){
      sel=own;zoneMap=own.mp>0?computeZone(own):null;zoneList=zoneMap?.list||[];
      spawnPanel.style.display='none';spawnMode=false;onlineBuilding=null;updateAll();return;
    }
    const b=buildings.find(b=>b.owner===onlineSide&&b.r===r&&b.c===c&&BUILD_TYPES[b.type].spawn.length);
    if(b){
      onlineBuilding=b.id;spawnMode=false;spawnPanel.replaceChildren();
      const label=document.createElement('strong');label.textContent=BUILD_LABELS[b.type];spawnPanel.append(label);
      for(const type of BUILD_TYPES[b.type].spawn.filter(t=>t!=='bog'||modeBeta)){
        const button=document.createElement('button');
        button.textContent=UNIT_LABELS[type]+' · '+UNIT_TYPES[type].cost+' зол.';
        button.disabled=state.gold[onlineSide]<UNIT_TYPES[type].cost;
        button.onclick=()=>{
          spawnType=type;spawnMode=true;
          spawnZones=[[b.r-1,b.c],[b.r+1,b.c],[b.r,b.c-1],[b.r,b.c+1]].map(([r,c])=>({r,c}))
            .filter(p=>p.r>=0&&p.c>=0&&p.r<ROWS&&p.c<COLS&&map[p.r][p.c]!==TERRAIN.MOUNTAIN&&!units.some(u=>u.r===p.r&&u.c===p.c));
          window.spawnZones=spawnZones;spawnPanel.style.display='none';updateAll();
        };
        spawnPanel.append(button);
      }
      spawnPanel.style.display='block';sel=null;zoneMap=null;zoneList=[];updateAll();return;
    }
    sel=null;zoneMap=null;zoneList=[];spawnPanel.style.display='none';updateAll();
  }
  const distanceFrom=(a,b)=>abs(a.r-b.r)+abs(a.c-b.c);
  window.FogLeaveOnline=function(){
    onlineGame=false;window.onlineGame=false;onlineSide=0;onlineTurn=0;
    gameOver=false;sel=null;spawnMode=false;zoneMap=null;zoneList=[];
    spawnPanel.style.display='none';victoryOverlay.style.display='none';
    endTurnBtn.disabled=false;viewReplayBtn.style.display='';
    resetState();
  };
  window.FogApplyOnlineView=function(roomView){
    if(!roomView||!roomView.side)return;
    onlineSide=roomView.side;
    if(!roomView.game){
      onlineGame=false;window.onlineGame=false;
      lobbyPanel.style.display='flex';startPanel.style.display='none';return;
    }
    const g=roomView.game;
    const firstView=!onlineGame||ROWS!==g.rows||COLS!==g.cols;
    onlineGame=true;window.onlineGame=true;aiMode=false;gameOver=false;
    onlineTurn=g.state.currentPlayer;modeBeta=g.modeBeta;
    if(modeBeta)BUILD_TYPES.base.spawn=[...BASE_SPAWN_DEFAULT,'bog'];else BUILD_TYPES.base.spawn=[...BASE_SPAWN_DEFAULT];
    ROWS=g.rows;COLS=g.cols;window.ROWS=ROWS;window.COLS=COLS;
    map.length=0;g.map.forEach(row=>map.push([...row]));
    buildings.length=0;g.buildings.forEach(b=>buildings.push({...b}));
    units.length=0;g.units.forEach(u=>units.push({...u}));
    state.turn=g.state.turn;state.currentPlayer=onlineSide;
    state.gold={1:g.state.gold[1]||0,2:g.state.gold[2]||0};
    state.fog={[onlineSide]:g.state.fog[onlineSide]};
    state.seen={[onlineSide]:g.state.seen[onlineSide]};
    state.lastSeen={[onlineSide]:g.state.lastSeen?.[onlineSide]||{}};
    state.log={[onlineSide]:g.state.log[onlineSide]||[]};
    state.grace=g.state.grace||{1:null,2:null};
    sel=null;zoneMap=null;zoneList=[];spawnMode=false;onlineBuilding=null;
    spawnPanel.style.display='none';startPanel.style.display='none';lobbyPanel.style.display='none';
    waitOverlay.style.display='none';revealBtn.style.display='none';
    endTurnBtn.disabled=onlineTurn!==onlineSide||g.phase!=='battle';
    endTurnBtn.title=onlineTurn===onlineSide?'Твой ход':'Ожидание соперника';
    window.dispatchEvent(new Event('resize'));
    updateAll();
    // Each client starts at their own stronghold, not the host's top-left corner.
    // Never re-center after routine state updates: manual map panning must persist.
    if(firstView)requestAnimationFrame(()=>window.FogCenterCamera?.(onlineSide));
    if(g.phase==='finished'){
      gameOver=true;victoryText.textContent=g.winner===onlineSide?'Победа!':g.winner===3-onlineSide?'Поражение':'Игра завершена';
      viewReplayBtn.style.display='none';victoryOverlay.style.display='flex';
    }
    const status=document.getElementById('onlineTurnStatus');
    if(status)status.textContent=onlineTurn===onlineSide?'Твой ход':'Ход противника';
  };
});
