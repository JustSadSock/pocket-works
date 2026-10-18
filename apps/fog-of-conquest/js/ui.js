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
    if(!a || isTestEnv) return;
    if(a.dataset.type==='sfx' && !sfxEnabled) return;
    if(a.dataset.type==='music' && !musicEnabled) return;
    try{
      a.currentTime = 0;
      a.play && a.play().catch(()=>{});
    }catch(e){}
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
  let lobbyConn = null;
  let gameConn = null;
  let onlineGame = false;
  // terrain and unit data moved to gameState.js

  const SETTINGS_KEY = 'focSettings';
  const SAVE_PREFIX = 'focSave_';
  const SAVE_VERSION = 2;
  const isTestEnv = navigator.userAgent.includes('jsdom');
  let style = 'toen',
      musicVolume = 0.5,
      sfxVolume = 0.5,
      musicEnabled = false,
      sfxEnabled = true,
      lang = 'en',
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
    document.querySelectorAll('audio').forEach(a=>{
      if(a.dataset.type==='sfx'){
        a.volume = sfxVolume;
        a.muted = !sfxEnabled;
      } else {
        a.volume = musicVolume;
        a.muted = !musicEnabled;
      }
    });
    if(bgm){
      if(musicEnabled){
        playAudio(bgm);
      } else {
        bgm.pause();
      }
    }
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
      spawnMode = false, spawnType = null, spawnZones = [],
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
    gameConn,
    onlineGame
  });
  window.gameConn = gameConn;
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

  function recordEvent(txt){
    const p = state.currentPlayer;
    state.log[p].push(txt);
    if(aiMode && p===2) state.log[1].push(t('logEnemy').replace('{text}', txt));
    const ev = {type:'action',action:lastAction,text:txt,snapshot:snapshot()};
    replayEvents.push(ev);
    if(onlineGame && gameConn) gameConn.send({event:ev});
    lastAction=null;
    renderLog();
  }
  function recordTurn(){
    const p = state.currentPlayer;
    state.log[p].push(t('logTurn').replace('{turn}', state.turn+1));
    const ev = {type:'turn',turn:state.turn+1,snapshot:snapshot()};
    replayEvents.push(ev);
    if(onlineGame && gameConn) gameConn.send({event:ev});
    renderLog();
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
    u.animMove={fr,fc,tr,tc,start:Date.now(),dur};
    requestAnimationFrame(redraw);
  }
  function animateShake(u,dur=100){
    u.animShake={start:Date.now(),dur};
    requestAnimationFrame(redraw);
  }

  function initFog(){
    [1,2].forEach(p=>{
      state.fog[p]  = Array.from({length:ROWS},()=>Array(COLS).fill(true));
      state.seen[p] = Array.from({length:ROWS},()=>Array(COLS).fill(false));
    });
  }

  // === Resize ===
  window.addEventListener('resize',()=>{
    const size = Math.floor(Math.min(
      window.innerWidth / COLS,
      (window.innerHeight - MIN_INFO_HEIGHT) / ROWS
    ));
    cellW = cellH = size;
    canvas.width  = cellW * COLS;
    canvas.height = cellH * ROWS;
    const panelH = Math.max(MIN_INFO_HEIGHT, window.innerHeight - canvas.height);
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
    const arr = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(SAVE_PREFIX)){
        try{
          const d = JSON.parse(localStorage.getItem(k));
          if(d && d.timestamp) arr.push({key:k, timestamp:d.timestamp});
        }catch(e){}
      }
    }
    return arr.sort((a,b)=>b.timestamp-a.timestamp);
  }

  function saveGame(){
    const data = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      map,
      buildings,
      units,
      state,
      mapSize,
      nextUnitId,
      replayEvents
    };
    try{ localStorage.setItem(SAVE_PREFIX+data.timestamp, JSON.stringify(data)); }
    catch(e){}
  }

  function loadGameData(key){
    try{
      const d = JSON.parse(localStorage.getItem(key));
      if(!d) return;
      resetState();
      map.length = 0; d.map.forEach(row=>map.push([...row]));
      buildings.length = 0; d.buildings.forEach(b=>buildings.push({...b}));
      units.length = 0; d.units.forEach(u=>units.push({...u}));
      Object.assign(state, d.state);
      if(Array.isArray(d.replayEvents)){
        replayEvents.length = 0;
        d.replayEvents.forEach(ev => replayEvents.push(ev));
        window.replayEvents = replayEvents;
      }
      mapSize = d.mapSize || mapSize;
      ROWS = map.length; COLS = map[0].length;
      nextUnitId = d.nextUnitId || (Math.max(0,...units.map(u=>u.id))+1);
      startPanel.style.display='none';
      window.dispatchEvent(new Event('resize'));
      updateAll();
    }catch(e){}
  }

  function deleteSave(key){
    localStorage.removeItem(key);
  }


  // expose for tests
  Object.assign(window, {
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
    handleNetEvent, handleNetMessage, attachConnection });

  // === LOS ===
  function hasLOS(r0,c0,r1,c1,{forestBlock=true}={}){
    let dx=abs(c1-c0), dy=abs(r1-r0),
        sx=c0<c1?1:-1, sy=r0<r1?1:-1, err=dx-dy,
        afterForest = forestBlock ? -1 : null;
    while(true){
      if(map[r0][c0]===TERRAIN.MOUNTAIN && (r0!==r1||c0!==c1)) return false;
      if(afterForest!==null){
        if(afterForest>=0) afterForest++;
        if(afterForest>1) return false;
        if(map[r0][c0]===TERRAIN.FOREST && (r0!==r1||c0!==c1)) afterForest=0;
      }
      if(r0===r1&&c0===c1) break;
      let e2=err*2;
      if(e2>-dy){ err-=dy; c0+=sx }
      if(e2< dx){ err+=dx; r0+=sy }
    }
    return true;
  }

  // === Fog ===
  function updateFog(){
    if(!modeBeta && !revealAll){
      const p=state.currentPlayer, F=state.fog[p], S=state.seen[p];
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)F[r][c]=true;
      [...buildings.filter(b=>b.owner===p),
        ...units.filter(u=>u.owner===p)].forEach(o=>{
        let rad = map[o.r][o.c]===TERRAIN.FOREST?2:
                  map[o.r][o.c]===TERRAIN.HILL?4:3;
        for(let dr=-rad;dr<=rad;dr++)for(let dc=-rad;dc<=rad;dc++){
          let rr=o.r+dr, cc=o.c+dc;
          if(rr<0||rr>=ROWS||cc<0||cc>=COLS) continue;
          if(abs(dr)+abs(dc)<=rad && hasLOS(o.r,o.c,rr,cc)){
            F[rr][cc]=false; S[rr][cc]=true;
          }
        }
      });
    }
  }

  // === Draw ===

  function redrawSimple(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const p=state.currentPlayer, F=state.fog[p], S=state.seen[p];

    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      let x=c*cellW, y=r*cellH;
      if(!S[r][c]&&!revealAll){
        ctx.fillStyle='#000'; ctx.fillRect(x,y,cellW,cellH);
      } else {
        ctx.fillStyle=TERR_COL[map[r][c]]; ctx.fillRect(x,y,cellW,cellH);
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

    buildings.forEach(b=>{
      if((!F[b.r][b.c]||S[b.r][b.c]||revealAll)){
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
    if(style==='simple'){ redrawSimple(); return; }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const p=state.currentPlayer, F=state.fog[p], S=state.seen[p];

    // terrain
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      let x=c*cellW, y=r*cellH;
      if(!S[r][c]&&!revealAll){
        ctx.fillStyle='#000'; ctx.fillRect(x,y,cellW,cellH);
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
    buildings.forEach(b=>{
      if((!F[b.r][b.c]||S[b.r][b.c]||revealAll)){
        const img = getBuildingSprite(b);
        if(img) ctx.drawImage(img,b.c*cellW,b.r*cellH,cellW,cellH);
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
    const rem=Array.from({length:ROWS},()=>Array(COLS).fill(-1)),
          q=[{r:u.r,c:u.c,mp:u.mp}];
    rem[u.r][u.c]=u.mp;
    while(q.length){
      let o=q.shift();
      if(o.mp<=0) continue;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(d=>{
        let rr=o.r+d[0], cc=o.c+d[1];
        if(rr<0||rr>=ROWS||cc<0||cc>=COLS) return;
        if(units.some(us=>us.r===rr&&us.c===cc&&us!==u)) return;
        let bldBlock = buildings.find(b=>b.r===rr&&b.c===cc && b.owner!==u.owner && b.hp>0);
        if(bldBlock) return;
        let cost=TERR_COST[map[rr][cc]];
        if(cost>o.mp) return;
        let left=o.mp-cost;
        if(left>rem[rr][cc]){
          rem[rr][cc]=left; q.push({r:rr,c:cc,mp:left});
        }
      });
    }
    const list=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(rem[r][c]>=0&&(r!==u.r||c!==u.c) && !units.find(us=>us.r===r&&us.c===c)) list.push({r,c});
    }
    return {rem,list};
  }


  // === doAttack ===
  function doAttack(att,def){
    if(att.type==='mage') return {dmg:0,rdmg:0};
    const info=UNIT_TYPES[att.type];
    let atk=info.atk;
    if(att.type==='cavalry'){
      let cellDef=(BUILD_TYPES[(buildings.find(b=>b.r===def.r&&b.c===def.c&&b.owner===def.owner)||{}).type]?.def)||0;
      if(cellDef>0) atk--;
    }
    let defV=UNIT_TYPES[def.type].def+TERR_DEF[map[def.r][def.c]];
    let dmg=Math.max(1,atk-defV);
    if(def.type!=='bog') def.hp-=dmg;
    let rdmg=0;
    if(info.range===1&&def.hp>0){
      let attD=UNIT_TYPES[att.type].def+TERR_DEF[map[att.r][att.c]];
      rdmg=Math.max(1,UNIT_TYPES[def.type].atk-attD);
      if(att.type!=='bog') att.hp-=rdmg;
    }
    let killed=false;
    if(def.hp<=0&&def.type!=='bog'){ units.splice(units.indexOf(def),1); killed=true; }
    if(att.hp<=0&&att.type!=='bog') units.splice(units.indexOf(att),1);
    return {dmg,rdmg,killed};
  }

  function doAttackBuilding(att,bld){
    if(att.type==='mage') return {dmg:0};
    const info=UNIT_TYPES[att.type];
    let atk=info.atk;
    if(att.type==='cavalry' && BUILD_TYPES[bld.type].def>0) atk--;
    let defV=BUILD_TYPES[bld.type].def+TERR_DEF[map[bld.r][bld.c]];
    let dmg=Math.max(1,atk-defV);
    damageBuilding(bld, dmg);
    return {dmg};
  }

  function damageBuilding(b, dmg=1){
    if(!b) return;
    b.hp -= dmg;
    if(b.hp <= 0){
      b.hp = 0;
    }
  }

  function attemptCapture(unit, building){
    if(!building) return;
    if(unit.r===building.r && unit.c===building.c && building.hp<=0){
      const already = building.owner === unit.owner;
      const baseTaken = (building.gen ?? BUILD_TYPES[building.type].gen) === 0;
      if(!already){
        recordEvent(baseTaken
          ? t('eventBaseCaptured')
          : t('eventResourceCaptured').replace('{building}', BUILD_LABELS[building.type]));
        playAudio(captureSfx);
        building.owner = unit.owner;
        if(!aiMode) addReplay({type:'capture', building});
      }
      building.hp = BUILD_TYPES[building.type].hpMax;
    }
  }

  // === spawn ===
  function spawn(type,r,c){
    const p=state.currentPlayer, cost=UNIT_TYPES[type].cost;
    if(state.gold[p]<cost) return;
    const unit={id:nextUnitId++,r,c,owner:p,type,hp:UNIT_TYPES[type].hpMax,mp:0,startR:r,startC:c};
    units.push(unit);
    if(!aiMode) addReplay({type:'spawn',unit});
    state.gold[p]-=cost;
    recordEvent(t('eventUnitCreated').replace('{unit}', UNIT_LABELS[type]));
    spawnMode=false; spawnZones=[]; window.spawnZones = spawnZones;
    updateAll();
  }

  // === checkVictory ===
  function checkVictory(){
    if(state.turn===0) return;      // не проверяем до первого хода
    if(gameOver) return;
    [1,2].forEach(p=>{
      let bases=buildings.filter(b=>b.owner===p&& (b.gen ?? BUILD_TYPES[b.type].gen)===0).length,
          unts=units.filter(u=>u.owner===p).length,
          other=p===1?2:1;
      if(bases===0&&unts===0) endGame(other);
      else if(bases===0&&unts>0){
        if(state.grace[p]===null) state.grace[p]=5;
        else if(--state.grace[p]<=0) endGame(other);
      } else state.grace[p]=null;
    });
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
  }


  // === click handler ===
  canvas.addEventListener('click',e=>{
    if(gameOver) return;
    const rect=canvas.getBoundingClientRect(),
          x=Math.floor((e.clientX-rect.left)/cellW),
          y=Math.floor((e.clientY-rect.top)/cellH),
          p=state.currentPlayer;

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
      if(tgt&&abs(tgt.r-sel.r)+abs(tgt.c-sel.c)<=1){
        sel.mp=0; tgt.hp=Math.min(UNIT_TYPES[tgt.type].hpMax,tgt.hp+2);
        recordEvent(t('mageHeal').replace('{unit}', UNIT_LABELS[tgt.type]));
        playAudio(healSfx);
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
                spawnType=type;
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
          playAudio(attackSfx);
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
          playAudio(attackSfx);
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
    const x=Math.floor((e.clientX-rect.left)/cellW);
    const y=Math.floor((e.clientY-rect.top)/cellH);
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
      saveBtn.style.display = (startPanel.style.display === 'none') ? 'block' : 'none';
    }
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
        `<button data-key="${s.key}" class="delBtn game-btn" data-i18n="deleteSave">${t('deleteSave')}</button></span>`;
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
      loadGameData(key);
      loadOverlay.style.display='none';
    }else if(e.target.classList.contains('delBtn')){
      deleteSave(key);
      populateLoadList();
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
    initFog();
    window.dispatchEvent(new Event('resize'));
  }

  function nextTurn(){
    const prev=state.currentPlayer;
    sel=null; zoneMap=null; zoneList=[];
    // heal units that didn't spend movement
    units.filter(u=>u.owner===prev).forEach(u=>{
      if(u.mp===UNIT_TYPES[u.type].move){
        u.hp=Math.min(UNIT_TYPES[u.type].hpMax,u.hp+1);
      }
    });

    state.turn++;
    state.currentPlayer = prev===1?2:1;
    state.gold[state.currentPlayer] += buildings
      .filter(b=>b.owner===state.currentPlayer)
      .reduce((s,b)=>s+(b.gen ?? BUILD_TYPES[b.type].gen),0);
    units.filter(u=>u.owner===state.currentPlayer).forEach(u=>{
      u.mp=UNIT_TYPES[u.type].move; u.startR=u.r; u.startC=u.c;
    });
    recordTurn(); updateAll();
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

  lobbyBackBtn.addEventListener('click', ()=>{
    if(lobbyConn){ lobbyConn.close(); lobbyConn=null; }
    gameConn = null; onlineGame = false;
    window.gameConn = gameConn; window.onlineGame = onlineGame;
    lobbyPanel.style.display='none';
    startPanel.style.display='flex';
    if(newGameOptions) newGameOptions.style.display='flex';
  });

  function connectLobbyWrapper(){
    if(lobbyConn){ lobbyConn.close(); }
    lobbyConn = connectLobby();
    lobbyConn.on('message', data=>{
      if(data && data.action==='start'){
        lobbyPanel.style.display='none';
        waitOverlay.style.display='none';
        gameConn = lobbyConn;
        onlineGame = true;
        window.gameConn = gameConn;
        window.onlineGame = onlineGame;
        gameConn.on('message', handleNetMessage);
        twoBtn.click();
      }
    });
  lobbyConn.on('disconnect', ()=>{
    waitOverlay.style.display='none';
    lobbyPanel.style.display='flex';
    gameConn = null; onlineGame = false;
    window.gameConn = gameConn; window.onlineGame = onlineGame;
  });
  }

  createRoomBtn.addEventListener('click', ()=>{
    connectLobbyWrapper();
    const room = roomIdInput.value.trim();
    lobbyConn.on('connected', ()=> lobbyConn.send({action:'create', room}));
    lobbyPanel.style.display='none';
    waitOverlay.style.display='flex';
  });

  joinRoomBtn.addEventListener('click', ()=>{
    connectLobbyWrapper();
    const room = roomIdInput.value.trim();
    lobbyConn.on('connected', ()=> lobbyConn.send({action:'join', room}));
    lobbyPanel.style.display='none';
    waitOverlay.style.display='flex';
  });

  // === Инициализация ===
  (async ()=>{
    await loadImages('assets');
    if(style==='ai') await loadAiTiles();
    setupLegend();
    window.dispatchEvent(new Event('resize'));
    handleOrientation();
  })();
});
