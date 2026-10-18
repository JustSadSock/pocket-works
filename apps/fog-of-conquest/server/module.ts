/* FOG OF CONQUEST — portable deterministic rules, schema 1.
   Based on the original unit/building roster and terrain economy; reimplemented
   without mutable browser globals, Math.random, or implicit DOM state. */
export const TERRAIN=['plain','water','forest','hill','mountain'];
export const COST=[1,3,2,2,999];
export const COVER=[0,-1,1,2,3];
export const UNITS={
  swordsman:{name:'Мечники',glyph:'⚔',move:3,atk:3,def:1,range:1,hp:6,cost:3,sight:3},
  archer:{name:'Лучники',glyph:'➶',move:2,atk:3,def:0,range:3,hp:4,cost:4,sight:4},
  heavy:{name:'Латники',glyph:'✚',move:2,atk:4,def:3,range:1,hp:8,cost:6,sight:2},
  cavalry:{name:'Конница',glyph:'♞',move:5,atk:4,def:1,range:1,hp:6,cost:7,sight:4},
  mage:{name:'Целители',glyph:'✧',move:3,atk:1,def:0,range:1,hp:4,cost:7,sight:3,heal:3},
  scout:{name:'Разведчики',glyph:'⌁',move:5,atk:2,def:0,range:1,hp:3,cost:2,sight:6}
};
export const BUILDINGS={
  base:{name:'Цитадель',glyph:'♜',hp:10,def:3,gen:2,spawn:['swordsman','archer','scout']},
  mill:{name:'Мельница',glyph:'✥',hp:3,def:0,gen:2,spawn:[]},
  barracks:{name:'Казармы',glyph:'⚒',hp:4,def:1,gen:0,spawn:['heavy','swordsman']},
  stable:{name:'Конюшня',glyph:'♞',hp:4,def:1,gen:0,spawn:['cavalry','scout']},
  mageTower:{name:'Башня лекарей',glyph:'✣',hp:4,def:1,gen:0,spawn:['mage','archer']},
  fort:{name:'Форт',glyph:'♟',hp:6,def:3,gen:0,spawn:['swordsman','archer']}
};
export const SIZES={compact:[12,16],standard:[16,22],expanse:[20,28]};
const DIR=[[1,0],[-1,0],[0,1],[0,-1]];
const man=(a,b)=>Math.abs(a.r-b.r)+Math.abs(a.c-b.c);
const inside=(s,r,c)=>Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&c>=0&&r<s.h&&c<s.w;
function hash(n){n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return (n^(n>>>16))>>>0;}
function noise(seed,r,c){return hash((seed|0)^Math.imul(r+7919,73856093)^Math.imul(c+1049,19349663))/4294967296;}
function smooth(seed,r,c){let a=0,z=0;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){const w=3-Math.max(Math.abs(dr),Math.abs(dc));a+=noise(seed,Math.floor((r+dr)/4),Math.floor((c+dc)/4))*w;z+=w;}return a/z;}
function blank(h,w,v=false){return Array.from({length:h},()=>Array(w).fill(v));}
function addUnit(s,type,owner,r,c){s.units.push({id:s.nextId++,type,owner,r,c,hp:UNITS[type].hp,mp:UNITS[type].move,acted:false,moved:false});}
function addBuilding(s,type,owner,r,c){s.buildings.push({id:s.nextId++,type,owner,r,c,hp:BUILDINGS[type].hp,level:1,trainedTurn:-1});s.map[r][c]=0;}
function vision(s,side){
  const visible=blank(s.h,s.w);
  const origins=s.units.filter(u=>u.owner===side).map(u=>({...u,sight:UNITS[u.type].sight})).concat(
    s.buildings.filter(b=>b.owner===side).map(b=>({...b,sight:b.type==='fort'?4:3})));
  for(const u of origins)for(let dr=-u.sight;dr<=u.sight;dr++)for(let dc=-u.sight;dc<=u.sight;dc++){
    const r=u.r+dr,c=u.c+dc;if(!inside(s,r,c)||Math.abs(dr)+Math.abs(dc)>u.sight)continue;
    if(lineClear(s,u.r,u.c,r,c))visible[r][c]=true;
  }
  return visible;
}
function lineClear(s,r0,c0,r1,c1){
  const steps=Math.max(Math.abs(r1-r0),Math.abs(c1-c0));
  for(let i=1;i<steps;i++){const r=Math.round(r0+(r1-r0)*i/steps),c=Math.round(c0+(c1-c0)*i/steps);
    if(s.map[r][c]===4)return false;}
  return true;
}
function refreshSight(s){for(const side of [1,2]){const v=vision(s,side);for(let r=0;r<s.h;r++)for(let c=0;c<s.w;c++)if(v[r][c])s.seen[side][r][c]=true;}}
export function createGame(seed=Date.now()>>>0,size='standard'){
  const [h,w]=SIZES[size]||SIZES.standard;seed=Number(seed)>>>0;
  const s={schema:1,seed,size,h,w,map:blank(h,w,0),buildings:[],units:[],nextId:1,seen:{1:blank(h,w),2:blank(h,w)},
    current:1,round:1,gold:{1:7,2:7},winner:0,phase:'battle',revision:1,history:['Разведчики принесли первые карты.']};
  for(let r=0;r<h;r++)for(let c=0;c<w;c++){
    const rr=Math.min(r,h-1-r),cc=Math.min(c,w-1-c);
    const v=.68*smooth(seed,rr,cc)+.32*noise(seed+1337,rr,cc);
    const river=Math.abs(r-(h/2+Math.sin(c*.52+seed%7)*1.1))<.65 && c>3&&c<w-4;
    s.map[r][c]=v<.37||river?1:v>.67?4:v>.59?3:v<.43?2:0;
  }
  // Rotational symmetry and a guaranteed continental land passage.
  for(let r=0;r<h;r++)for(let c=0;c<w;c++){
    if(r>h-1-r||(r===h-1-r&&c>w-1-c))continue;
    s.map[h-1-r][w-1-c]=s.map[r][c];
  }
  for(let c=2;c<w-2;c++){s.map[2][c]=0;s.map[h-3][w-1-c]=0;}
  for(let r=2;r<h-2;r++){s.map[r][w-3]=0;s.map[h-1-r][2]=0;}
  for(const [r,c] of [[2,2],[h-3,w-3]]){
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)if(inside(s,r+dr,c+dc))s.map[r+dr][c+dc]=0;
  }
  addBuilding(s,'base',1,2,2);addBuilding(s,'base',2,h-3,w-3);
  addBuilding(s,'mill',1,3,3);addBuilding(s,'mill',2,h-4,w-4);
  for(const [type,ar,ac] of [['mill',Math.floor(h/2)-2,Math.floor(w/2)-4],
    ['barracks',Math.floor(h/2)-3,Math.floor(w/2)-2],
    ['stable',Math.floor(h/2)-1,Math.floor(w/2)-4],
    ['mageTower',Math.floor(h/2)-4,Math.floor(w/2)-5],
    ['fort',Math.floor(h/2)-1,Math.floor(w/2)-1]]){
    const r=Math.max(5,Math.min(h-6,ar)),c=Math.max(5,Math.min(w-6,ac));
    if(!s.buildings.some(b=>man(b,{r,c})<2))addBuilding(s,type,0,r,c);
    const rr=h-1-r,cc=w-1-c;
    if(!s.buildings.some(b=>man(b,{r:rr,c:cc})<2))addBuilding(s,type,0,rr,cc);
  }
  addUnit(s,'swordsman',1,2,3);addUnit(s,'archer',1,3,2);addUnit(s,'scout',1,1,2);
  addUnit(s,'swordsman',2,h-3,w-4);addUnit(s,'archer',2,h-4,w-3);addUnit(s,'scout',2,h-2,w-3);
  refreshSight(s);return s;
}
export function reach(s,u){
  if(!u||!UNITS[u.type])return {};
  const dist=blank(s.h,s.w,Infinity),out={};dist[u.r][u.c]=0;
  const q=[{r:u.r,c:u.c,d:0}];
  while(q.length){q.sort((a,b)=>a.d-b.d);const p=q.shift();if(p.d!==dist[p.r][p.c])continue;
    for(const [dr,dc] of DIR){const r=p.r+dr,c=p.c+dc;
      if(!inside(s,r,c)||s.map[r][c]===4||s.map[r][c]===1)continue;
      if(s.units.some(x=>x.id!==u.id&&x.r===r&&x.c===c))continue;
      const d=p.d+COST[s.map[r][c]];if(d<=u.mp&&d<dist[r][c]){
        dist[r][c]=d;out[r+','+c]=d;q.push({r,c,d});}
    }
  }
  return out;
}
const findUnit=(s,r,c)=>s.units.find(x=>x.r===r&&x.c===c);
const findBuilding=(s,r,c)=>s.buildings.find(x=>x.r===r&&x.c===c);
const addLog=(s,text)=>{s.history.unshift(text);s.history.length=Math.min(12,s.history.length);};
function conclude(s){
  for(const side of [1,2])if(!s.buildings.some(b=>b.owner===side&&b.type==='base')){s.winner=3-side;s.phase='finished';addLog(s,'Цитадель пала.');}
  if(s.round>120&&s.phase!=='finished'){
    const score=side=>s.units.filter(u=>u.owner===side).length+2*s.buildings.filter(b=>b.owner===side).length+s.gold[side]/8;
    s.winner=score(1)>score(2)?1:score(2)>score(1)?2:3;s.phase='finished';
  }
}
function beginNextTurn(s){
  s.current=s.current===1?2:1;if(s.current===1)s.round++;
  const side=s.current;
  s.gold[side]=Math.min(99,s.gold[side]+s.buildings.filter(b=>b.owner===side).reduce((a,b)=>a+(b.type==='mill'?b.level*BUILDINGS.mill.gen:BUILDINGS[b.type].gen),0));
  s.units.filter(u=>u.owner===side).forEach(u=>{if(!u.moved&&!u.acted)u.hp=Math.min(UNITS[u.type].hp,u.hp+1);u.mp=UNITS[u.type].move;u.acted=false;u.moved=false;});
  addLog(s,'Ход '+s.round+' · '+(side===1?'Север':'Юг')+' вступает в бой.');
}
export function transition(source,side,action){
  if(!source||source.schema!==1||source.phase!=='battle')return {state:source,error:'Партия завершена.'};
  if(side!==source.current)return {state:source,error:'Ход противника.'};
  if(!action||typeof action!=='object')return {state:source,error:'Неизвестный приказ.'};
  const s=structuredClone(source),unit=s.units.find(u=>u.id===action.unit),bld=s.buildings.find(b=>b.id===action.building);
  const fail=error=>({state:source,error});
  const type=action.type;
  if(type==='end'){beginNextTurn(s);}
  else if(type==='move'){
    if(!unit||unit.owner!==side||unit.moved)return fail('Этот отряд уже двигался.');
    if(!inside(s,action.r,action.c)||!(action.r+','+action.c in reach(s,unit)))return fail('Клетка недоступна.');
    unit.r=action.r;unit.c=action.c;unit.mp=0;unit.moved=true;
    const target=findBuilding(s,unit.r,unit.c);
    if(target&&target.owner!==side&&target.type!=='base'){
      target.owner=side;target.hp=BUILDINGS[target.type].hp;target.level=1;target.trainedTurn=-1;
      addLog(s,UNITS[unit.type].name+' захватили '+BUILDINGS[target.type].name.toLowerCase()+'.');
    }else addLog(s,UNITS[unit.type].name+' заняли позицию.');
  }else if(type==='attack'){
    if(!unit||unit.owner!==side||unit.acted||UNITS[unit.type].heal)return fail('Этот отряд не может атаковать.');
    if(!inside(s,action.r,action.c))return fail('Недопустимая цель.');
    const target=findUnit(s,action.r,action.c),targetB=findBuilding(s,action.r,action.c);
    if((!target||target.owner===side)&&(!targetB||targetB.owner===side||targetB.owner===0))return fail('Нет вражеской цели.');
    if(man(unit,action)>UNITS[unit.type].range||!lineClear(s,unit.r,unit.c,action.r,action.c)||!vision(s,side)[action.r][action.c])return fail('Цель вне видимости или дальности.');
    const defender=target&&target.owner!==side?target:targetB;
    let defence=defender.type in UNITS ? UNITS[defender.type].def : BUILDINGS[defender.type].def;
    defence+=COVER[s.map[defender.r][defender.c]];
    const supporting=s.units.filter(a=>a.owner===side&&a.id!==unit.id&&man(a,defender)===1).length;
    const bonus=s.map[unit.r][unit.c]===3?1:0;
    const dmg=Math.max(1,UNITS[unit.type].atk+Math.min(supporting,2)+bonus-Math.max(0,defence));
    defender.hp-=dmg;unit.acted=true;
    addLog(s,UNITS[unit.type].name+' наносят '+dmg+' урона.');
    if(defender.hp<=0){if(target&&target.owner!==side)s.units=s.units.filter(x=>x.id!==target.id);
      else s.buildings=s.buildings.filter(x=>x.id!==targetB.id);addLog(s,'Цель уничтожена.');}
    else if(target&&man(unit,target)===1&&UNITS[target.type].range===1){
      const counter=Math.max(1,Math.floor(UNITS[target.type].atk/2)-UNITS[unit.type].def);
      unit.hp-=counter;if(unit.hp<=0)s.units=s.units.filter(x=>x.id!==unit.id);
    }
  }else if(type==='heal'){
    if(!unit||unit.owner!==side||unit.acted||!UNITS[unit.type].heal)return fail('Нужен свободный целитель.');
    const target=findUnit(s,action.r,action.c);
    if(!target||target.owner!==side||man(unit,target)>1||target.hp>=UNITS[target.type].hp)return fail('Нет раненого союзника рядом.');
    target.hp=Math.min(UNITS[target.type].hp,target.hp+UNITS[unit.type].heal);unit.acted=true;addLog(s,'Раны исцелены.');
  }else if(type==='recruit'){
    if(!bld||bld.owner!==side||!BUILDINGS[bld.type].spawn.includes(action.unitType))return fail('Этот гарнизон не обучает такие войска.');
    const info=UNITS[action.unitType];if(!info||s.gold[side]<info.cost)return fail('Недостаточно золота.');
    if(bld.trainedTurn===s.round*2+side)return fail('Этот гарнизон уже набирал войска.');
    if(s.units.filter(u=>u.owner===side).length>=35)return fail('Достигнут предел армии.');
    if(!inside(s,action.r,action.c)||man(bld,action)!==1||s.map[action.r][action.c]===1||s.map[action.r][action.c]===4||findUnit(s,action.r,action.c))return fail('Выбери свободную соседнюю клетку.');
    s.gold[side]-=info.cost;bld.trainedTurn=s.round*2+side;addUnit(s,action.unitType,side,action.r,action.c);
    // Recruits act from the next turn.
    s.units[s.units.length-1].mp=0;s.units[s.units.length-1].acted=true;s.units[s.units.length-1].moved=true;
    addLog(s,UNITS[action.unitType].name+' пополнили армию.');
  }else if(type==='upgrade'){
    if(!bld||bld.owner!==side||bld.type!=='mill'||bld.level>=2||s.gold[side]<6)return fail('Улучшение мельницы недоступно.');
    s.gold[side]-=6;bld.level=2;addLog(s,'Мельница расширена. +2 дохода.');
  }else return fail('Неизвестный приказ.');
  s.revision++;refreshSight(s);conclude(s);return {state:s,error:null};
}
export function project(s,side){
  if(!s||s.phase==='lobby')return s;
  const visible=vision(s,side),seen=s.seen[side],copy=structuredClone(s);
  copy.map=s.map.map((row,r)=>row.map((t,c)=>seen[r][c]?t:null));
  copy.units=s.units.filter(u=>u.owner===side||visible[u.r][u.c]).map(u=>({...u}));
  copy.buildings=s.buildings.filter(b=>b.owner===side||visible[b.r][b.c]).map(b=>({...b}));
  copy.gold={[side]:s.gold[side]};copy.visible=visible;copy.seen={[side]:seen};
  copy.nextId=null;copy.seed=0;return copy;
}
export function aiTurn(input,level=3){
  let s=input;const side=2;if(s.phase!=='battle'||s.current!==side)return s;
  level=Math.max(1,Math.min(6,Number(level)||3));let count=0;
  const act=a=>{const out=transition(s,side,a);if(!out.error){s=out.state;return true;}return false;};
  for(const b of [...s.buildings.filter(x=>x.owner===side&&BUILDINGS[x.type].spawn.length)]){
    const options=BUILDINGS[b.type].spawn.filter(t=>UNITS[t].cost<=s.gold[side]);
    options.sort((a,b)=>(UNITS[b].atk+UNITS[b].move*.3)-(UNITS[a].atk+UNITS[a].move*.3));
    if(level<3&&s.gold[side]<5)continue;
    const dirs=DIR.map(([dr,dc])=>({r:b.r+dr,c:b.c+dc})).filter(p=>inside(s,p.r,p.c)&&s.map[p.r][p.c]!==1&&s.map[p.r][p.c]!==4&&!findUnit(s,p.r,p.c));
    if(options[0]&&dirs.length&&s.units.filter(u=>u.owner===side).length<Math.min(6+level*3,24))
      act({type:'recruit',building:b.id,unitType:options[level>=4?0:options.length-1],...dirs[0]});
  }
  const own=s.units.filter(x=>x.owner===side).map(x=>x.id);
  for(const id of own){
    if(++count>35)break;
    let u=s.units.find(x=>x.id===id);if(!u)continue;
    const enemySight=vision(s,side);
    const targets=s.units.filter(x=>x.owner===1&&enemySight[x.r][x.c]);
    const friends=s.units.filter(x=>x.owner===side&&x.hp<UNITS[x.type].hp);
    if(UNITS[u.type].heal){
      const h=friends.find(x=>man(u,x)<=1);if(h)act({type:'heal',unit:id,r:h.r,c:h.c});
    }else{
      const inRange=targets.filter(x=>man(u,x)<=UNITS[u.type].range&&lineClear(s,u.r,u.c,x.r,x.c))
        .sort((a,b)=>a.hp-b.hp);
      const cit=s.buildings.find(b=>b.owner===1&&b.type==='base'&&enemySight[b.r][b.c]&&man(u,b)<=UNITS[u.type].range);
      const victim=inRange[0]||cit;if(victim){act({type:'attack',unit:id,r:victim.r,c:victim.c});}
    }
    u=s.units.find(x=>x.id===id);if(!u||u.moved)continue;
    const vis=vision(s,side);
    const buildings=s.buildings.filter(b=>b.owner!==side&&(b.owner===0||vis[b.r][b.c]));
    const rivals=s.units.filter(x=>x.owner===1&&vis[x.r][x.c]);
    const goals=buildings.length?buildings:rivals.length?rivals:[{r:2,c:2}];
    const zones=reach(s,u);
    const candidates=Object.entries(zones).map(([key,cost])=>{const [r,c]=key.split(',').map(Number);return {r,c,cost};});
    const evalPos=p=>Math.min(...goals.map(g=>man(p,g)))+.12*p.cost+(s.map[p.r][p.c]===3?-.4:0);
    candidates.sort((a,b)=>evalPos(a)-evalPos(b)||noise(s.seed+s.round,a.r,a.c)-noise(s.seed+s.round,b.r,b.c));
    const choice=candidates.find(p=>!findUnit(s,p.r,p.c)&&evalPos(p)<evalPos({...u,cost:0})-.1);
    if(choice)act({type:'move',unit:id,r:choice.r,c:choice.c});
    u=s.units.find(x=>x.id===id);if(!u||u.acted||UNITS[u.type].heal)continue;
    const visible=vision(s,side);
    const attackTarget=s.units.filter(x=>x.owner===1&&visible[x.r][x.c]&&man(u,x)<=UNITS[u.type].range).sort((a,b)=>a.hp-b.hp)[0]||
      s.buildings.find(x=>x.owner===1&&visible[x.r][x.c]&&man(u,x)<=UNITS[u.type].range);
    if(attackTarget)act({type:'attack',unit:id,r:attackTarget.r,c:attackTarget.c});
  }
  act({type:'end'});return s;
}
export function isValidSave(s){return !!(s&&s.schema===1&&SIZES[s.size]&&s.h===SIZES[s.size][0]&&s.w===SIZES[s.size][1]&&Array.isArray(s.map)&&s.map.length===s.h&&s.map.every(r=>Array.isArray(r)&&r.length===s.w&&r.every(v=>Number.isInteger(v)&&v>=0&&v<5))&&Array.isArray(s.units)&&s.units.length<=80&&Array.isArray(s.buildings)&&s.buildings.length<=60&&[1,2].includes(s.current)&&[1,2,3,0].includes(s.winner)&&['battle','finished'].includes(s.phase)&&s.gold&&s.seen&&s.seen[1]&&s.seen[2]&&Number.isInteger(s.round)&&s.round>=1&&s.round<=121);}


// Server-authoritative PocketNet module. All gameplay transitions above are
// deterministic, and player-specific projections redact fogged terrain and units.
export const MIN_PLAYERS=2,MAX_PLAYERS=2,RULESET_VERSION=1;
const event=s=>[{type:'state',payload:null}];
const notice=(id,msg)=>[{type:'notice',to:id,payload:msg}];
const invalid=(s,id,msg)=>({state:s,events:notice(id,msg)});
function seat(s,id){return s.seats.findIndex(p=>p.id===id)+1;}
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,seats:[player],game:null,revision:1}};},
 onJoin({state,player,players}){
   if(players.length>2)throw Error('room_full');
   if(state.phase!=='lobby'&&!state.seats.some(p=>p.id===player.id))throw Error('match_in_progress');
   if(!state.seats.some(p=>p.id===player.id))state.seats.push(player);
   state.revision++;
   return {state,events:event(state)};
 },
 onLeave({state,player}){
   // Network disconnect does not invoke onLeave, so seats survive temporary
   // disconnection. Explicit "leave room" is treated as a forfeit.
   if(state.phase==='battle'&&state.game){
     state.game.phase='finished';state.game.winner=seat(state,player.id)===1?2:1;state.phase='finished';
   }
   if(state.phase==='lobby')state.seats=state.seats.filter(p=>p.id!==player.id);
   state.revision++;return {state,events:event(state)};
 },
 viewForPlayer({state,player}){
   const side=seat(state,player.id);
   return {phase:state.phase,host:state.host,viewerId:player.id,seats:state.seats,
     side:side||0,revision:state.revision,
     game:state.game&&side?project(state.game,side):null};
 },
 onMessage({state,player,players,payload}){
   const raw=payload&&typeof payload==='object'?payload:{};
   const side=seat(state,player.id);
   if(!side)return invalid(state,player.id,'Нет места в комнате.');
   if(raw.type==='sync')return {state,events:event(state)};
   if(raw.type==='start'){
     if(state.phase!=='lobby'||state.host!==player.id||state.seats.length!==2||players.length!==2)
       return invalid(state,player.id,'Для старта нужны два полководца.');
     const size=SIZES[raw.size]?raw.size:'standard';
     state.game=createGame(Date.now()>>>0,size);state.phase='battle';state.revision++;
     return {state,events:event(state)};
   }
   if(raw.type==='act'){
     if(state.phase!=='battle'||!state.game)return invalid(state,player.id,'Партия сейчас неактивна.');
     if(raw.revision!==state.game.revision)return invalid(state,player.id,'Поле обновилось. Повтори приказ.');
     const output=transition(state.game,side,raw.action);
     if(output.error)return invalid(state,player.id,output.error);
     state.game=output.state;state.phase=state.game.phase;state.revision++;
     return {state,events:event(state)};
   }
   return invalid(state,player.id,'Неизвестная команда.');
 }
};
export default module;
