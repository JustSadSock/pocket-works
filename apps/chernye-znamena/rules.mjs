// Black Banners: deterministic, DOM-free tactical rules.
export const WIDTH = 7;
export const HEIGHT = 5;
export const ORDER_LIMIT = 3;
export const MAX_ROUNDS = 12;
export const TYPES = Object.freeze({
  sword: { name: 'Мечники', hp: 4, attack: 3, armor: 2, move: 2, range: 1 },
  spear: { name: 'Копейщики', hp: 4, attack: 2, armor: 2, move: 2, range: 1 },
  bow: { name: 'Лучники', hp: 3, attack: 3, armor: 1, move: 2, range: 3 },
  knight: { name: 'Всадники', hp: 4, attack: 4, armor: 2, move: 3, range: 1 }
});
export const MAPS = Object.freeze({
  pass: {
    name: 'Пепельный перевал',
    description: 'Холмы прикрывают наступление. Брод в центре решает исход боя.',
    terrain: {
      '1,0': 'forest', '2,1': 'hill', '3,0': 'forest', '4,0': 'hill',
      '1,4': 'forest', '2,3': 'hill', '3,4': 'forest', '4,3': 'hill',
      '3,1': 'river', '3,2': 'ford', '3,3': 'river', '5,1': 'forest'
    }
  },
  moor: {
    name: 'Туманный пустошь',
    description: 'Болота замедляют всадников. Высоты позволяют лучникам держать центр.',
    terrain: {
      '1,1': 'forest', '2,0': 'hill', '2,3': 'marsh', '3,1': 'marsh',
      '3,2': 'hill', '3,3': 'marsh', '4,1': 'forest', '4,4': 'hill',
      '5,3': 'forest', '1,4': 'marsh', '5,0': 'forest'
    }
  }
});
export const DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];
export const key = (q, r) => q + ',' + r;
export const inside = (q,r) => q >= 0 && q < WIDTH && r >= 0 && r < HEIGHT;
export function distance(a,b) { return (Math.abs(a.q-b.q)+Math.abs(a.r-b.r)+Math.abs(a.q+a.r-b.q-b.r))/2; }
export function terrainAt(state,q,r) { return MAPS[state.mapId].terrain[key(q,r)] || 'grass'; }
export function unitAt(state,q,r) { return state.units.find(u=>u.hp>0 && u.q===q && u.r===r) || null; }
export function leader(state,side) { return state.units.find(u=>u.side===side && u.hp>0 && u.banner) || null; }
export function commanded(state,unit) {
  const b=leader(state,unit.side);
  return !!b && (b.id===unit.id || distance(unit,b)<=2);
}
function makeUnit(id,side,type,q,r,banner=false) {
  return {id,side,type,q,r,hp:TYPES[type].hp,banner,used:false,guard:false};
}
export function createBattle(mapId='pass',mode='ai') {
  if (!MAPS[mapId]) throw new Error('Unknown battlefield');
  if (!['ai','hotseat'].includes(mode)) throw new Error('Unknown game mode');
  const lineup=[
    ['sword',0,2,true], ['spear',1,1,false],
    ['bow',0,4,false], ['knight',1,3,false], ['sword',0,0,false]
  ];
  const units = lineup.flatMap(([type,q,r,banner],i)=>[
    makeUnit('a'+i,0,type,q,r,banner),
    makeUnit('b'+i,1,type,WIDTH-1-q,HEIGHT-1-r,banner)
  ]);
  return {version:1,mapId,mode,units,turn:0,round:1,orders:ORDER_LIMIT,hold:[0,0],
    winner:null,reason:'',log:['Войска построены. Знамёна развёрнуты.']};
}
export function movementCost(state,unit,q,r) {
  const t=terrainAt(state,q,r);
  if (t==='river' || t==='marsh') return unit.type==='knight' ? 3 : 2;
  if (t==='forest' && unit.type==='knight') return 2;
  return 1;
}
export function reachable(state,unitId) {
  const u=state.units.find(u=>u.id===unitId && u.hp>0);
  if (!u) return [];
  const steps=[{q:u.q,r:u.r,cost:0}], costs=new Map([[key(u.q,u.r),0]]);
  for(let i=0;i<steps.length;i++) {
    const node=steps[i];
    for(const [dq,dr] of DIRECTIONS) {
      const q=node.q+dq,r=node.r+dr;
      if(!inside(q,r) || unitAt(state,q,r)) continue;
      const next=node.cost+movementCost(state,u,q,r), k=key(q,r);
      if(next>TYPES[u.type].move || next >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k,next); steps.push({q,r,cost:next});
    }
  }
  return steps.slice(1).filter(p=>costs.get(key(p.q,p.r))===p.cost);
}
export function canAttack(state,attacker,target) {
  if (!attacker || !target || attacker.hp<=0 || target.hp<=0 || attacker.side===target.side) return false;
  if (!commanded(state,attacker)) return false;
  const d=distance(attacker,target);
  if (attacker.type==='bow') {
    if(d<2 || d>3) return false;
    // A forest between archer and victim blocks the line of sight.
    for(let q=0;q<WIDTH;q++) for(let r=0;r<HEIGHT;r++) {
      if(terrainAt(state,q,r)==='forest' && distance(attacker,{q,r})<d && distance({q,r},target)<d &&
        distance(attacker,{q,r})+distance({q,r},target)===d) return false;
    }
    return true;
  }
  return d===1;
}
export function attackPreview(state,attacker,target) {
  if (!canAttack(state,attacker,target)) return null;
  const adjacent=state.units.filter(u=>u.hp>0 && u.side===attacker.side && u.id!==attacker.id && distance(u,target)===1).length;
  const terrain=terrainAt(state,target.q,target.r);
  const cover=(terrain==='hill' || terrain==='forest') ? 1 : 0;
  const guard=target.guard ? 1 : 0;
  let matchup=0;
  if(attacker.type==='spear' && target.type==='knight') matchup+=2;
  if(attacker.type==='knight' && target.type==='spear') matchup-=2;
  if(attacker.type==='bow' && terrain==='forest') matchup-=1;
  if(attacker.type==='knight' && distance(attacker,target)===1 && terrainAt(state,attacker.q,attacker.r)==='hill') matchup+=1;
  const flank=adjacent>=2 ? 1 : 0;
  const damage=Math.max(1, TYPES[attacker.type].attack + Math.min(2,adjacent) + flank + matchup - TYPES[target.type].armor - cover - guard);
  const counter=attacker.type!=='bow' && target.hp>damage ? (target.type==='spear' && attacker.type==='knight' ? 2 : 1) : 0;
  return {damage,counter,support:Math.min(2,adjacent),cover,guard,flank,matchup};
}
function clone(s) { return {...s, units:s.units.map(u=>({...u})),hold:[...s.hold],log:[...s.log]}; }
function log(s,text) { s.log.unshift(text);s.log=s.log.slice(0,6); }
function victory(s) {
  const a=s.units.some(u=>u.side===0 && u.hp>0),b=s.units.some(u=>u.side===1 && u.hp>0);
  if(!a || !b) {s.winner=a?0:b?1:'draw';s.reason='Армия противника уничтожена';return;}
  if(s.hold[0]>=2 || s.hold[1]>=2) {s.winner=s.hold[0]>=2?0:1;s.reason='Знамя удержало срединный камень два хода';}
}
function passBanner(s,side) {
  if(leader(s,side)) return;
  const alive=s.units.filter(u=>u.side===side && u.hp>0).sort((a,b)=>distance(a,{q:3,r:2})-distance(b,{q:3,r:2}));
  if(alive.length) {
    alive[0].banner=true;
    log(s, 'Пало знамя. Командование принимает ' + TYPES[alive[0].type].name.toLowerCase() + '.');
  }
}
export function issue(state,action) {
  if(state.winner!==null) return {state,error:'Сражение уже закончено'};
  const u=state.units.find(x=>x.id===action.unitId);
  if(!u || u.hp<=0 || u.side!==state.turn || u.used || state.orders<1)
    return {state,error:'Этот отряд сейчас не может получить приказ'};
  const s=clone(state),actor=s.units.find(x=>x.id===action.unitId);
  if(action.kind==='move') {
    if(!reachable(s,actor.id).some(p=>p.q===action.q && p.r===action.r)) return {state,error:'Нельзя пройти в выбранную клетку'};
    actor.q=action.q;actor.r=action.r;
    log(s,TYPES[actor.type].name+' занимают новую позицию');
  } else if(action.kind==='attack') {
    const enemy=s.units.find(x=>x.id===action.targetId);
    const p=attackPreview(s,actor,enemy);
    if(!p) return {state,error:'Цель недоступна: проверьте дистанцию и знамя'};
    enemy.hp=Math.max(0,enemy.hp-p.damage);
    if(enemy.hp>0) actor.hp=Math.max(0,actor.hp-p.counter);
    log(s,TYPES[actor.type].name+' наносят '+p.damage+' урона'+(p.counter?' · ответный удар '+p.counter:''));
    if(enemy.hp===0) passBanner(s,enemy.side);
    if(actor.hp===0) passBanner(s,actor.side);
  } else if(action.kind==='guard') {
    actor.guard=true;
    log(s,TYPES[actor.type].name+' держат оборону (+1 защита)');
  } else {
    return {state,error:'Неизвестный приказ'};
  }
  actor.used=true;s.orders--;victory(s);
  return {state:s,error:null};
}
export function endTurn(state) {
  if(state.winner!==null) return state;
  const s=clone(state), side=s.turn;
  const occupant=unitAt(s,3,2);
  s.hold[side]=(occupant?.side===side)?s.hold[side]+1:0;
  if(occupant?.side===side) log(s,(side===0?'Север':'Юг')+' удерживает камень ('+s.hold[side]+'/2)');
  victory(s);if(s.winner!==null)return s;
  s.turn=1-side;
  if(s.turn===0) s.round++;
  for(const u of s.units) if(u.side===s.turn) {u.used=false;u.guard=false;}
  s.orders=ORDER_LIMIT;
  if(s.round>MAX_ROUNDS) {
    const score=side=>s.units.filter(u=>u.side===side).reduce((v,u)=>v+u.hp,0)+s.hold[side]*3;
    s.winner=score(0)===score(1)?'draw':score(0)>score(1)?0:1;
    s.reason='Истекли двенадцать раундов';
  }
  return s;
}
export function aiAction(state) {
  if(state.winner!==null || state.turn!==1 || state.orders<=0) return null;
  const own=state.units.filter(u=>u.side===1 && u.hp>0 && !u.used);
  if(!own.length) return null;
  let candidates=[];
  for(const u of own) {
    for(const t of state.units.filter(x=>x.side===0 && x.hp>0)) {
      const p=attackPreview(state,u,t);if(!p)continue;
      const v=p.damage*15+(p.damage>=t.hp?30:0)+(t.banner?10:0)-p.counter*12+((t.q===3&&t.r===2)?18:0);
      candidates.push({value:v,action:{unitId:u.id,kind:'attack',targetId:t.id}});
    }
    for(const p of reachable(state,u.id)) {
      const foes=state.units.filter(x=>x.side===0&&x.hp>0);
      const min=(q,r)=>Math.min(...foes.map(x=>distance({q,r},x)));
      const progress=min(u.q,u.r)-min(p.q,p.r);
      let v=progress*5;
      const objDist=distance({q:p.q,r:p.r},{q:3,r:2});
      v+= (distance(u,{q:3,r:2})-objDist)*4;
      if(p.q===3 && p.r===2) v+=42;
      if(terrainAt(state,p.q,p.r)==='hill') v+=5;
      if(terrainAt(state,p.q,p.r)==='marsh') v-=3;
      const threat=foes.some(x=>distance(x,p)<=1 && x.type==='knight');
      if(threat && u.type==='bow') v-=12;
      const follow={...u,q:p.q,r:p.r};
      if(!commanded({...state,units:state.units.map(x=>x.id===u.id?follow:x)},follow)) v-=12;
      candidates.push({value:v,action:{unitId:u.id,kind:'move',q:p.q,r:p.r}});
    }
    candidates.push({value:1,action:{unitId:u.id,kind:'guard'}});
  }
  candidates.sort((a,b)=>b.value-a.value || JSON.stringify(a.action).localeCompare(JSON.stringify(b.action)));
  return candidates[0]?.action || null;
}
export function validSaved(s) {
  if(!s || s.version!==1 || !MAPS[s.mapId] || !['ai','hotseat'].includes(s.mode) ||
    !Array.isArray(s.units) || s.units.length!==10 || ![0,1].includes(s.turn) ||
    !Number.isInteger(s.round) || s.round<1 || s.round>MAX_ROUNDS+1 ||
    !Number.isInteger(s.orders) || s.orders<0 || s.orders>ORDER_LIMIT ||
    !Array.isArray(s.hold) || s.hold.length!==2 ||
    !['draw',0,1,null].includes(s.winner)) return false;
  const seen=new Set();
  return s.units.every(u=>typeof u.id==='string' && TYPES[u.type] &&
    [0,1].includes(u.side) && Number.isInteger(u.q)&&Number.isInteger(u.r)&&inside(u.q,u.r) &&
    Number.isInteger(u.hp) && u.hp>=0 && u.hp<=TYPES[u.type].hp &&
    typeof u.used==='boolean' && typeof u.guard==='boolean' && typeof u.banner==='boolean' &&
    (u.hp===0 || !seen.has(key(u.q,u.r))) && (u.hp===0 || !!seen.add(key(u.q,u.r))));
}
