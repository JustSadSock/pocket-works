export const SIZE = 11;
export const CENTER = 5;
export const MAX_WAVE = 12;
export type Kind = 'wall' | 'tower' | 'gate' | 'archer' | 'brace';
export type Side = 'north' | 'east' | 'south' | 'west';
export type Phase = 'build' | 'siege' | 'won' | 'lost';
export interface Piece { x: number; z: number; kind: Kind; hp: number; level: number }
export interface Enemy { id: number; x: number; z: number; hp: number; maxHp: number; speed: number; attack: number; type: 'soldier' | 'ram' | 'ladder' | 'catapult'; cooldown: number; climb?: {x:number;z:number;fromX:number;fromZ:number} }
export interface Shot { x: number; z: number; tx: number; tz: number; age: number; duration: number; power: number; source: 'enemy' | 'defender' }
export interface Event { type: 'hit' | 'break' | 'shot' | 'kill' | 'keep'; x: number; z: number; power?: number }
export interface State {
  version: 1; phase: Phase; wave: number; stone: number; timber: number; iron: number;
  keep: number; pieces: Piece[]; enemies: Enemy[]; shots: Shot[]; elapsed: number;
  spawned: number; kills: number; score: number; seed: number; events: Event[];
}
export const COST: Record<Kind, { stone: number; timber: number; iron: number }> = {
  wall: { stone: 8, timber: 0, iron: 0 }, tower: { stone: 18, timber: 3, iron: 0 },
  gate: { stone: 5, timber: 10, iron: 2 }, archer: { stone: 1, timber: 7, iron: 1 },
  brace: { stone: 3, timber: 6, iron: 0 }
};
export const MAX_HP: Record<Kind, number> = { wall: 95, tower: 160, gate: 90, archer: 45, brace: 70 };
export const LABEL: Record<Kind, string> = { wall: 'Стена', tower: 'Башня', gate: 'Ворота', archer: 'Лучники', brace: 'Укрепление' };
export const THREATS: Side[] = ['north', 'east', 'south', 'west', 'north', 'south', 'east', 'west', 'north', 'east', 'south', 'west'];
const key = (x: number, z: number) => `${x},${z}`;
const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < SIZE && z < SIZE;
const dist = (x: number, z: number, a: number, b: number) => Math.abs(x-a) + Math.abs(z-b);
const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
export function newGame(): State {
  return { version: 1, phase: 'build', wave: 1, stone: 125, timber: 50, iron: 12, keep: 100,
    pieces: [], enemies: [], shots: [], elapsed: 0, spawned: 0, kills: 0, score: 0,
    seed: 737, events: [] };
}
export function pieceAt(s: State, x: number, z: number) { return s.pieces.find(p => p.x === x && p.z === z); }
export function canBuild(s: State, kind: Kind, x: number, z: number): string | null {
  if (s.phase !== 'build') return 'Стройте между осадами';
  if (!inside(x,z) || x === CENTER && z === CENTER) return 'Здесь находится донжон';
  if (pieceAt(s,x,z)) return 'Место занято';
  if (kind==='tower' && s.pieces.filter(p=>p.kind==='tower').length>=8) return 'Гарнизон занят: максимум восемь башен';
  if (kind==='archer' && s.pieces.filter(p=>p.kind==='archer').length>=10) return 'Гарнизон занят: максимум десять постов лучников';
  if (dist(x,z,CENTER,CENTER) < 2 && kind !== 'archer') return 'Слишком близко к донжону';
  const c = COST[kind];
  if (s.stone < c.stone || s.timber < c.timber || s.iron < c.iron) return 'Не хватает материалов';
  if (kind === 'archer' && !dirs.some(([dx,dz]) => {
    const p = pieceAt(s,x+dx,z+dz); return p && (p.kind === 'tower' || p.kind === 'wall');
  })) return 'Лучникам нужна стена или башня рядом';
  if (kind === 'brace' && !dirs.some(([dx,dz]) => {
    const p = pieceAt(s,x+dx,z+dz); return p && (p.kind === 'wall' || p.kind === 'tower' || p.kind === 'gate');
  })) return 'Поставьте рядом со стеной';
  return null;
}
export function build(s: State, kind: Kind, x: number, z: number): string | null {
  const error = canBuild(s,kind,x,z); if (error) return error;
  const c = COST[kind]; s.stone -= c.stone; s.timber -= c.timber; s.iron -= c.iron;
  s.pieces.push({ x,z,kind,hp:MAX_HP[kind],level:1 }); return null;
}
export function remove(s: State, x: number, z: number): string | null {
  if (s.phase !== 'build') return 'Подождите конца осады';
  const i = s.pieces.findIndex(p => p.x === x && p.z === z);
  if (i < 0) return 'Здесь нечего разобрать';
  const p = s.pieces.splice(i,1)[0], c = COST[p.kind], fraction = p.hp / MAX_HP[p.kind];
  s.stone += Math.floor(c.stone * .65 * fraction); s.timber += Math.floor(c.timber * .65 * fraction);
  s.iron += Math.floor(c.iron * .65 * fraction); return null;
}
export function repair(s: State, x: number, z: number): string | null {
  if (s.phase !== 'build') return 'Подождите конца осады';
  const p = pieceAt(s,x,z); if (!p) return 'Выберите повреждённую постройку';
  if (p.hp >= MAX_HP[p.kind]) return 'Постройка цела';
  const missing = 1-p.hp/MAX_HP[p.kind], c = COST[p.kind];
  const stone = Math.max(c.stone ? 1 : 0, Math.ceil(c.stone*missing*.5));
  const timber = Math.ceil(c.timber*missing*.5);
  if (s.stone < stone || s.timber < timber) return 'Не хватает материалов для ремонта';
  s.stone -= stone; s.timber -= timber; p.hp = MAX_HP[p.kind]; return null;
}
export function startWave(s: State) {
  if (s.phase !== 'build') return;
  s.phase = 'siege'; s.enemies = []; s.shots = []; s.elapsed = 0; s.spawned = 0; s.kills = 0; s.events = [];
}
function random(s: State) { s.seed = (Math.imul(s.seed,1664525)+1013904223) >>> 0; return s.seed/4294967296; }
export function wavePlan(wave: number) {
  return { side: THREATS[wave-1], total: 4 + wave*2,
    ram: wave >= 2, ladder: wave >= 4, catapult: wave >= 6,
    reward: { stone: 28+wave*5, timber: 12+wave*2, iron: 3+Math.floor(wave/3) } };
}
function spawn(s: State) {
  const plan = wavePlan(s.wave), n = s.spawned++;
  let type: Enemy['type'] = 'soldier';
  if (plan.catapult && n % 7 === 6) type = 'catapult';
  else if (plan.ram && n % 5 === 4) type = 'ram';
  else if (plan.ladder && n % 4 === 3) type = 'ladder';
  const offset = 2 + Math.floor(random(s)*7);
  const pos = plan.side === 'north' ? [offset,0] : plan.side === 'south' ? [offset,10] :
    plan.side === 'east' ? [10,offset] : [0,offset];
  const hp = Math.round((type === 'ram' ? 100 : type === 'catapult' ? 55 : type === 'ladder' ? 48 : 38)
    * (1+(s.wave-1)*.075));
  s.enemies.push({ id:n, x:pos[0], z:pos[1], hp, maxHp:hp, type,
    speed: type === 'ram' ? .65 : type === 'catapult' ? .36 : type === 'ladder' ? .8 : 1,
    attack: type === 'ram' ? 24 : type === 'catapult' ? 28 : 9+Math.floor(s.wave/3)*2,
    cooldown: random(s)*.6 });
}
function damage(s: State, p: Piece, value: number) {
  const brace = dirs.some(([dx,dz]) => pieceAt(s,p.x+dx,p.z+dz)?.kind === 'brace');
  p.hp -= value * (brace ? .65 : 1);
  s.events.push({type:'hit',x:p.x,z:p.z,power:value});
  if (p.hp > 0) return;
  s.pieces.splice(s.pieces.indexOf(p),1); s.events.push({type:'break',x:p.x,z:p.z,power:22});
  if (p.kind === 'tower') {
    for (const [dx,dz] of dirs) {
      const nearby = pieceAt(s,p.x+dx,p.z+dz);
      if (nearby) damage(s,nearby,nearby.kind==='archer'?35:22);
    }
    for(const enemy of s.enemies)if(dist(enemy.x,enemy.z,p.x,p.z)<2)enemy.hp-=30;
  }
}
// One shared weighted flow field per castle layout; rebuilt only when a section falls.
const flowCache=new WeakMap<State,{signature:string;costs:Map<string,number>}>();
function flow(s:State) {
  const signature=s.pieces.map(p=>`${p.x},${p.z},${p.kind}`).join(';');
  const cached=flowCache.get(s);if(cached?.signature===signature)return cached.costs;
  const costs = new Map<string,number>([[key(CENTER,CENTER),0]]);
  const seen = new Set<string>();
  const frontier: [number,number,number][] = [[0,CENTER,CENTER]];
  while (frontier.length) {
    frontier.sort((a,b)=>a[0]-b[0]); const [cost,x,z] = frontier.shift()!;
    const k = key(x,z); if (seen.has(k)) continue; seen.add(k);
    for (const [dx,dz] of dirs) {
      const nx=x+dx,nz=z+dz; if (!inside(nx,nz)) continue;
      const p = pieceAt(s,nx,nz);
      const penalty = p ? p.kind === 'gate' ? 2.3 : p.kind === 'brace' || p.kind === 'archer' ? 1.5 : 4.5 + Math.max(0,p.hp)/35 : 0;
      const next = cost+1+penalty;
      if (next < (costs.get(key(nx,nz)) ?? Infinity)) { costs.set(key(nx,nz),next); frontier.push([next,nx,nz]); }
    }
  }
  flowCache.set(s,{signature,costs});return costs;
}
function nextStep(s: State, e: Enemy): {x:number;z:number;piece?:Piece} | undefined {
  const sx = Math.round(e.x), sz = Math.round(e.z);
  if (!inside(sx,sz)) return;
  const costs=flow(s);
  let best: {x:number;z:number;cost:number}|undefined;
  for (const [dx,dz] of dirs) {
    const x=sx+dx,z=sz+dz; if (!inside(x,z)) continue;
    const p=pieceAt(s,x,z), penalty=p ? p.kind === 'gate' ? 2.3 : p.kind === 'brace'||p.kind === 'archer' ? 1.5 : 4.5+p.hp/35 : 0;
    const cost=(costs.get(key(x,z)) ?? Infinity)+penalty;
    if (!best || cost < best.cost) best={x,z,cost};
  }
  return best && { x:best.x,z:best.z,piece:pieceAt(s,best.x,best.z) };
}
export function tick(s: State, dt: number) {
  if (s.phase !== 'siege') return;
  dt = Math.min(dt,.05); s.events=[]; s.elapsed+=dt;
  const plan=wavePlan(s.wave);
  const spawnInterval=Math.max(.48,1.35-(s.wave-1)*.07);
  if (s.spawned < plan.total && s.elapsed > .8+s.spawned*spawnInterval) spawn(s);
  for (const shot of [...s.shots]) {
    shot.age+=dt;
    if (shot.age<shot.duration) continue;
    s.shots.splice(s.shots.indexOf(shot),1);
    if (shot.source === 'enemy') {
      const target=pieceAt(s,shot.tx,shot.tz);
      if (target) damage(s,target,shot.power); else if (dist(shot.tx,shot.tz,CENTER,CENTER) < 2) s.keep-=shot.power*.45;
    } else {
      const target=s.enemies.filter(e=>e.hp>0).sort((a,b)=>dist(a.x,a.z,shot.tx,shot.tz)-dist(b.x,b.z,shot.tx,shot.tz))[0];
      if (target && dist(target.x,target.z,shot.tx,shot.tz)<2) target.hp-=shot.power;
    }
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    e.cooldown-=dt;
    if(e.climb){
      const vx=e.climb.x-e.x,vz=e.climb.z-e.z,len=Math.hypot(vx,vz);
      if(len<=.04){e.x=e.climb.x;e.z=e.climb.z;e.climb=undefined;}
      else {const step=Math.min(len,e.speed*.53*dt);e.x+=vx/len*step;e.z+=vz/len*step;}
      continue;
    }
    if (e.type === 'catapult') {
      if (dist(e.x,e.z,CENTER,CENTER)>4.2) {
        const approach=nextStep(s,e);
        if(approach && !approach.piece){
          const vx=approach.x-e.x,vz=approach.z-e.z,len=Math.hypot(vx,vz);
          if(len>.03){const step=Math.min(len,e.speed*dt);e.x+=vx/len*step;e.z+=vz/len*step;}
        } else if(approach?.piece && e.cooldown<=0) {
          damage(s,approach.piece,e.attack);e.cooldown=2.2;
        }
        continue;
      }
      if (e.cooldown <= 0) {
        const targets=s.pieces.filter(p=>dist(p.x,p.z,CENTER,CENTER)<5);
        const p=targets.sort((a,b)=>dist(e.x,e.z,a.x,a.z)-dist(e.x,e.z,b.x,b.z))[0];
        const target=p ?? {x:CENTER,z:CENTER};
        s.shots.push({x:e.x,z:e.z,tx:target.x,tz:target.z,age:0,duration:.9,power:e.attack,source:'enemy'});
        s.events.push({type:'shot',x:e.x,z:e.z}); e.cooldown=4.5;
      }
      continue;
    }
    if (dist(Math.round(e.x),Math.round(e.z),CENTER,CENTER)<=1) {
      if (e.cooldown<=0) { s.keep-=e.attack; s.events.push({type:'keep',x:CENTER,z:CENTER,power:e.attack}); e.cooldown=1.35; }
      continue;
    }
    const next=nextStep(s,e); if (!next) continue;
    if (next.piece) {
      if(e.type==='ladder' && next.piece.kind==='wall') {
        e.climb={x:next.x,z:next.z,fromX:e.x,fromZ:e.z};continue;
      }
      if (e.cooldown<=0) {
        damage(s,next.piece,e.attack);
        e.cooldown=e.type==='ram' ? 1.55 : 1.1;
      }
    } else {
      const vx=next.x-e.x,vz=next.z-e.z,len=Math.hypot(vx,vz);
      if (len>.03) { const step=Math.min(len,e.speed*dt); e.x+=vx/len*step; e.z+=vz/len*step; }
    }
  }
  for (const p of s.pieces) if (p.kind==='tower'||p.kind==='archer') {
    const range=p.kind==='tower'?4.7:3.6;
    const target=s.enemies.filter(e=>e.hp>0 && dist(p.x,p.z,e.x,e.z)<=range)
      .sort((a,b)=>dist(a.x,a.z,CENTER,CENTER)-dist(b.x,b.z,CENTER,CENTER))[0];
    if (!target) continue;
    // Fire at a predictable cadence with an offset per building.
    const interval=p.kind==='tower'?1.9:1.2;
    if (Math.floor((s.elapsed-dt+(p.x*3+p.z)*.13)/interval) === Math.floor((s.elapsed+(p.x*3+p.z)*.13)/interval)) continue;
    s.shots.push({x:p.x,z:p.z,tx:target.x,tz:target.z,age:0,duration:.35,power:p.kind==='tower'?22:15,source:'defender'});
    s.events.push({type:'shot',x:p.x,z:p.z});
  }
  for (const e of [...s.enemies]) if (e.hp<=0) {
    s.enemies.splice(s.enemies.indexOf(e),1); s.kills++; s.events.push({type:'kill',x:e.x,z:e.z});
  }
  if (s.keep<=0) { s.keep=0;s.phase='lost'; return; }
  if (s.spawned>=plan.total && s.enemies.length===0 && s.shots.every(q=>q.source!=='enemy')) {
    s.score+=s.kills*10+Math.round(s.keep);
    if (s.wave===MAX_WAVE) { s.phase='won';return; }
    s.stone+=plan.reward.stone;s.timber+=plan.reward.timber;s.iron+=plan.reward.iron;
    s.keep=Math.min(100,s.keep+10);s.wave++;s.phase='build';s.shots=[];
  }
}
export function loadGame(raw:string|null):State {
  if (!raw) return newGame();
  try {
    const v=JSON.parse(raw);
    if (v.version!==1 || !Number.isInteger(v.wave)||v.wave<1||v.wave>MAX_WAVE ||
      !Array.isArray(v.pieces)||v.pieces.length>SIZE*SIZE||!['build','siege','won','lost'].includes(v.phase)) throw Error();
    const s=newGame();
    for (const k of ['wave','stone','timber','iron','keep','score','seed'] as const) {
      if (!Number.isFinite(v[k])) throw Error(); (s[k] as number)=v[k];
    }
    for (const p of v.pieces) {
      if (!inside(p.x,p.z)|| !Object.hasOwn(COST,p.kind)|| !Number.isFinite(p.hp) || p.hp<=0 ||
        s.pieces.some(q=>q.x===p.x&&q.z===p.z)) throw Error();
      s.pieces.push({x:p.x,z:p.z,kind:p.kind,hp:Math.min(p.hp,MAX_HP[p.kind as Kind]),level:1});
    }
    s.phase=v.phase==='siege'?'build':v.phase; return s;
  } catch { return newGame(); }
}
export function saveGame(s:State) {
  const { version,phase,wave,stone,timber,iron,keep,pieces,score,seed }=s;
  return JSON.stringify({version,phase,wave,stone,timber,iron,keep,pieces,score,seed});
}
