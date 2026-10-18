/* Versioned, offline-only save contract. Parse and validate BEFORE mutating a live game. */
(function(root){
  'use strict';
  const SAVE_VERSION=5;
  const SIZES={tiny:[5,8],small:[10,15],medium:[20,30],large:[20,60]};
  const UNIT_TYPES=new Set(['swordsman','archer','heavy','cavalry','mage','bog']);
  const BUILD_TYPES=new Set(['base','barracks','stable','mageTower','mill','fort']);
  const assert=(ok,msg)=>{if(!ok)throw new Error('Повреждённое сохранение: '+msg);};
  const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isInteger(v)&&v>=min&&v<=max;
  const validMatrix=(v,rows,cols,type)=>Array.isArray(v)&&v.length===rows&&
    v.every(row=>Array.isArray(row)&&row.length===cols&&row.every(cell=>type==='bool'?typeof cell==='boolean':integer(cell,0,4)));
  function normalize(raw){
    assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'нет данных партии');
    assert(raw.origin!=='pocketnet'&&raw.onlineGame!==true&&raw.scope!=='online','сетевой снимок нельзя открыть как локальную партию');
    assert(raw.version===undefined||integer(raw.version,1,SAVE_VERSION),'неподдерживаемая версия');
    const map=raw.map;
    assert(Array.isArray(map)&&map.length>0&&Array.isArray(map[0]),'нет карты');
    const rows=map.length,cols=map[0].length;
    const size=Object.keys(SIZES).find(key=>SIZES[key][0]===rows&&SIZES[key][1]===cols);
    assert(Boolean(size)&&validMatrix(map,rows,cols,'terrain'),'недопустимый размер или рельеф карты');
    assert(Array.isArray(raw.units)&&raw.units.length<=5000,'неверный список войск');
    assert(Array.isArray(raw.buildings)&&raw.buildings.length<=3000,'неверный список построек');
    const inBounds=o=>integer(o?.r,0,rows-1)&&integer(o?.c,0,cols-1);
    const unitIDs=new Set();
    for(const u of raw.units){
      assert(inBounds(u)&&integer(u.id,1)&&!unitIDs.has(u.id)&&[1,2].includes(u.owner)
        &&UNIT_TYPES.has(u.type)&&integer(u.hp,1,1000)&&integer(u.mp,0,1000)
        &&integer(u.startR??u.r,0,rows-1)&&integer(u.startC??u.c,0,cols-1),
        'войска вне поля, с повреждённым здоровьем или повторяющимся ID');
      unitIDs.add(u.id);
    }
    for(const b of raw.buildings){
      assert(inBounds(b)&&[0,1,2].includes(b.owner)&&BUILD_TYPES.has(b.type)
        &&integer(b.hp,0,20)&&Number.isFinite(b.gen??0),'повреждённое строение');
    }
    const s=raw.state;
    assert(s&&typeof s==='object'&&[1,2].includes(s.currentPlayer)
      &&integer(s.turn,0)&&s.gold&&s.fog&&s.seen&&s.log&&s.grace,
      'отсутствует состояние ходов');
    for(const p of [1,2]){
      assert(Number.isFinite(s.gold[p])&&s.gold[p]>=0&&integer(s.gold[p],0),
        'неверный баланс золота');
      assert(validMatrix(s.fog[p],rows,cols,'bool')&&validMatrix(s.seen[p],rows,cols,'bool'),
        'отсутствуют данные тумана для обоих игроков');
      assert(Array.isArray(s.log[p])&&s.log[p].length<=100000&&
        s.log[p].every(item=>typeof item==='string'),'повреждён журнал');
      assert(s.grace[p]===null||integer(s.grace[p],0,10000),'повреждён счётчик защиты');
    }
    // v3 saves had no last-observed buildings: start with empty reconnaissance.
    const lastSeen={1:{},2:{}};
    if(s.lastSeen!==undefined){
      for(const p of [1,2]){
        const records=s.lastSeen[p]??{};
        assert(records&&typeof records==='object'&&!Array.isArray(records)&&
          Object.keys(records).length<=rows*cols,'повреждён архив разведки');
        for(const [key,b] of Object.entries(records)){
          assert(inBounds(b)&&key===b.r+','+b.c&&BUILD_TYPES.has(b.type)&&
            [0,1,2].includes(b.owner)&&integer(b.hp,0,20)&&
            (b.gen===undefined||Number.isFinite(b.gen)),'повреждённое известное строение');
          lastSeen[p][key]={id:b.id,r:b.r,c:b.c,type:b.type,owner:b.owner,hp:b.hp,gen:b.gen};
        }
      }
    }
    assert(!(raw.replayEvents!==undefined&&raw.replayArchive!==undefined),
      'дублирование форматов повтора');
    let replayEvents=raw.replayEvents===undefined?[]:raw.replayEvents;
    if(raw.replayArchive!==undefined){
      assert(root.FogReplayCodec&&typeof root.FogReplayCodec.expand==='function',
        'архив повторов не поддерживается этим клиентом');
      replayEvents=root.FogReplayCodec.expand(raw.replayArchive);
    }
    assert(Array.isArray(replayEvents)&&replayEvents.length<=30000&&
      replayEvents.every(e=>e&&typeof e==='object'&&!Array.isArray(e)),
      'повреждена запись повтора');
    const legacy=raw.version===undefined||raw.version<3;
    const modeBeta=typeof raw.modeBeta==='boolean'?raw.modeBeta:
      raw.mode==='beta'||raw.units.some(u=>u.type==='bog');
    const aiMode=typeof raw.aiMode==='boolean'?raw.aiMode:raw.mode==='ai';
    const aiLevel=integer(raw.aiLevel,0,6)?raw.aiLevel:2;
    const mode=aiMode?'ai':modeBeta?'beta':'hotseat';
    const nextUnitId=integer(raw.nextUnitId,1)?raw.nextUnitId:Math.max(0,...raw.units.map(u=>u.id))+1;
    assert(nextUnitId>Math.max(0,...raw.units.map(u=>u.id)),'счётчик ID меньше существующего');
    return {
      version:SAVE_VERSION, timestamp:integer(raw.timestamp,1)?raw.timestamp:Date.now(),
      mode,aiMode,aiLevel,modeBeta,mapSize:size,nextUnitId,
      map:map.map(row=>row.slice()),units:raw.units.map(u=>({...u})),
      buildings:raw.buildings.map(b=>({...b})),
      state:{
        currentPlayer:s.currentPlayer,turn:s.turn,
        gold:{1:s.gold[1],2:s.gold[2]},
        fog:{1:s.fog[1].map(r=>r.slice()),2:s.fog[2].map(r=>r.slice())},
        seen:{1:s.seen[1].map(r=>r.slice()),2:s.seen[2].map(r=>r.slice())},
        lastSeen,
        grace:{1:s.grace[1],2:s.grace[2]},
        log:{1:[...s.log[1]],2:[...s.log[2]]}
      },
      replayEvents,legacyModeUnknown:legacy&&raw.aiMode===undefined&&raw.mode===undefined
    };
  }
  const api=Object.freeze({SAVE_VERSION,normalize});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FogSaveSchema=api;
})(typeof window!=='undefined'?window:globalThis);
