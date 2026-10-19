// PetriForge 0.2 — deterministic, headless grid lab. No DOM or browser globals.
export const WIDTH=30, HEIGHT=20;
export const TILE=Object.freeze({EMPTY:0,WALL:1,GOAL:2,HAZARD:3,REWARD:4});
export const ACTIONS=Object.freeze(['UP','DOWN','LEFT','RIGHT','STAY']);
const DELTA={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0],STAY:[0,0]};
export const SCENARIOS=Object.freeze([
  {id:'corridor',name:'Первый маршрут',detail:'Пройти к цели, избегая лишних движений'},
  {id:'maze',name:'Запутанные коридоры',detail:'Поиск выхода и обход препятствий'},
  {id:'hazards',name:'Опасная территория',detail:'Риск против длины маршрута'},
  {id:'rewards',name:'Сбор ресурсов',detail:'Собирать полезное по пути к выходу'},
  {id:'switchback',name:'Обход барьеров',detail:'Планировать проходы между стенами'},
  {id:'rooms',name:'Комнаты',detail:'Находить двери и переходы'}
]);
export function seeded(seed=1){
  let x=(Number(seed)>>>0)||1;
  return ()=>{x=(x+0x6d2b79f5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function validateScene(value,w=WIDTH,h=HEIGHT){
  if(!value||!Array.isArray(value.grid)||value.grid.length!==h)throw Error('Неверный размер карты');
  const grid=value.grid.map(row=>{
    if(!Array.isArray(row)||row.length!==w||row.some(t=>!Number.isInteger(t)||t<0||t>4))throw Error('Недопустимые клетки');
    return row.slice();
  });
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)&&p[0]>=0&&p[0]<w&&p[1]>=0&&p[1]<h;
  if(!point(value.spawn)||!point(value.goal))throw Error('Неверная позиция');
  const [sx,sy]=value.spawn,[gx,gy]=value.goal;
  if(grid[sy][sx]===TILE.WALL||grid[gy][gx]===TILE.WALL)throw Error('Старт или финиш внутри стены');
  if(sx===gx&&sy===gy)throw Error('Старт совпадает с финишем');
  return {grid,spawn:value.spawn.slice(),goal:value.goal.slice()};
}
export function createScenario(id='corridor',seed=1){
  const r=seeded(seed);
  const grid=Array.from({length:HEIGHT},()=>Array(WIDTH).fill(TILE.EMPTY));
  const wall=(x,y)=>{if(x>0&&x<WIDTH-1&&y>0&&y<HEIGHT-1)grid[y][x]=TILE.WALL;};
  for(let x=0;x<WIDTH;x++){grid[0][x]=TILE.WALL;grid[HEIGHT-1][x]=TILE.WALL;}
  for(let y=0;y<HEIGHT;y++){grid[y][0]=TILE.WALL;grid[y][WIDTH-1]=TILE.WALL;}
  if(id==='maze'){
    for(let x=4;x<WIDTH-3;x+=5){const gap=2+Math.floor(r()*16);for(let y=1;y<HEIGHT-1;y++)if(Math.abs(y-gap)>1)wall(x,y);}
  } else if(id==='switchback'){
    for(let x=6;x<WIDTH-3;x+=6){const upper=(Math.floor(x/6)%2===0);for(let y=1;y<HEIGHT-1;y++)if(upper?y<HEIGHT-5:y>4)wall(x,y);}
  } else if(id==='rooms'){
    for(let x=7;x<WIDTH-1;x+=7){for(let y=1;y<HEIGHT-1;y++)if(y!==9&&y!==10)wall(x,y);}
    for(let y=6;y<HEIGHT-1;y+=6){for(let x=1;x<WIDTH-1;x++)if(x%7!==3&&x%7!==4)wall(x,y);}
  } else if(id==='hazards'){
    for(let y=4;y<HEIGHT-3;y++)for(let x=7;x<WIDTH-5;x++)if(r()<.24)grid[y][x]=TILE.HAZARD;
    for(let x=5;x<WIDTH-3;x+=7)for(let y=1;y<HEIGHT-1;y++)if(y<7||y>11)wall(x,y);
  } else if(id==='rewards'){
    for(let i=0;i<40;i++){const x=2+Math.floor(r()*(WIDTH-4)),y=2+Math.floor(r()*(HEIGHT-4));grid[y][x]=TILE.REWARD;}
    for(let i=0;i<30;i++)wall(2+Math.floor(r()*(WIDTH-4)),2+Math.floor(r()*(HEIGHT-4)));
  } else {
    for(let i=0;i<32;i++)wall(4+Math.floor(r()*(WIDTH-8)),3+Math.floor(r()*(HEIGHT-6)));
  }
  const spawn=[2,2],goal=[WIDTH-3,HEIGHT-3];
  // Guaranteed traversable spine, so generated labs cannot be mathematically impossible.
  for(let x=1;x<WIDTH-1;x++){grid[2][x]=TILE.EMPTY;grid[HEIGHT-3][x]=TILE.EMPTY;}
  for(let y=2;y<HEIGHT-2;y++)grid[y][WIDTH-3]=TILE.EMPTY;
  grid[spawn[1]][spawn[0]]=TILE.EMPTY;grid[goal[1]][goal[0]]=TILE.EMPTY;
  return {grid,spawn,goal};
}
export class GridEnvironment {
  constructor(w=WIDTH,h=HEIGHT,rules={}){
    this.w=w;this.h=h;this.grid=Array.from({length:h},()=>Array(w).fill(TILE.EMPTY));
    this.rules={maxSteps:320,stepPenalty:-.015,hazardPunish:-.65,goalReward:8,rewardBonus:.45,progressBonus:.045,...rules};
    this.reset([1,1],[w-2,h-2]);
  }
  inBounds(x,y){return x>=0&&y>=0&&x<this.w&&y<this.h;}
  passable(x,y){return this.inBounds(x,y)&&this.grid[y][x]!==TILE.WALL;}
  setScene(scene){const safe=validateScene(scene,this.w,this.h);this.grid=safe.grid;this.reset(safe.spawn,safe.goal);return this.observe();}
  scene(){return {grid:this.grid.map(row=>row.slice()),spawn:[this.sx,this.sy],goal:[this.gx,this.gy]};}
  reset(spawn=[this.sx??1,this.sy??1],goal=[this.gx??this.w-2,this.gy??this.h-2]){
    this.sx=spawn[0];this.sy=spawn[1];this.ax=this.sx;this.ay=this.sy;
    this.gx=goal[0];this.gy=goal[1];this.steps=0;this.done=false;this.success=false;this.totalReward=0;
    this.collected=new Set();return this.observe();
  }
  observe(){
    const tiles=[];
    for(let dy=-3;dy<=3;dy++){const row=[];for(let dx=-3;dx<=3;dx++){
      const x=this.ax+dx,y=this.ay+dy,k=y*this.w+x;
      row.push(this.inBounds(x,y)?(this.collected.has(k)?TILE.EMPTY:this.grid[y][x]):TILE.WALL);
    }tiles.push(row);}
    return {tiles,pos:[this.ax,this.ay],goalVec:[this.gx-this.ax,this.gy-this.ay]};
  }
  step(a){
    if(this.done)return [this.observe(),0,true,{success:this.success}];
    if(!Object.hasOwn(DELTA,a))throw Error('Unknown action');
    const oldDist=Math.abs(this.gx-this.ax)+Math.abs(this.gy-this.ay);
    const [dx,dy]=DELTA[a],nx=this.ax+dx,ny=this.ay+dy;
    let reward=this.rules.stepPenalty;
    if(this.passable(nx,ny)){this.ax=nx;this.ay=ny;}else reward-=.06;
    const dist=Math.abs(this.gx-this.ax)+Math.abs(this.gy-this.ay);
    reward+=(oldDist-dist)*this.rules.progressBonus;
    const tile=this.grid[this.ay][this.ax],key=this.ay*this.w+this.ax;
    if(tile===TILE.HAZARD)reward+=this.rules.hazardPunish;
    if(tile===TILE.REWARD&&!this.collected.has(key)){this.collected.add(key);reward+=this.rules.rewardBonus;}
    if(this.ax===this.gx&&this.ay===this.gy){reward+=this.rules.goalReward;this.done=true;this.success=true;}
    this.steps++;
    if(this.steps>=this.rules.maxSteps)this.done=true;
    this.totalReward+=reward;
    return [this.observe(),reward,this.done,{success:this.success}];
  }
}
export function stateKey(o){
  const goal=o.goalVec.map(v=>Math.max(-4,Math.min(4,v))).join(',');
  const t=o.tiles;
  return goal+'|'+[t[2][3],t[3][2],t[3][4],t[4][3],t[2][2],t[2][4],t[4][2],t[4][4]].join('');
}
export class QAgent {
  constructor(seed=1,params={}){this.rng=seeded(seed);this.q=new Map();this.epsilon=params.epsilon??.24;this.alpha=params.alpha??.24;this.gamma=params.gamma??.96;}
  values(obs){const k=stateKey(obs);let q=this.q.get(k);if(!q){q=[0,0,0,0,0];this.q.set(k,q);}return q;}
  act(obs,explore=true){const v=this.values(obs);if(explore&&this.rng()<this.epsilon)return ACTIONS[Math.floor(this.rng()*ACTIONS.length)];let best=-Infinity;const ties=[];for(let i=0;i<v.length;i++){if(v[i]>best+1e-9){best=v[i];ties.length=0;ties.push(i);}else if(Math.abs(v[i]-best)<1e-9)ties.push(i);}return ACTIONS[ties[Math.floor(this.rng()*ties.length)]];}
  learn(s,a,reward,s2,done){const q=this.values(s),i=ACTIONS.indexOf(a),next=this.values(s2);q[i]+=this.alpha*(reward+(done?0:this.gamma*Math.max(...next))-q[i]);}
  serialize(){return {type:'qlearning',version:1,epsilon:this.epsilon,alpha:this.alpha,gamma:this.gamma,q:[...this.q.entries()].map(([k,v])=>[k,v.slice()])};}
  load(snapshot){
    if(snapshot?.type!=='qlearning'||snapshot.version!==1||!Array.isArray(snapshot.q)||snapshot.q.length>300000)throw Error('Неподдерживаемая модель');
    const map=new Map();for(const row of snapshot.q){if(!Array.isArray(row)||typeof row[0]!=='string'||row[0].length>120||!Array.isArray(row[1])||row[1].length!==5||row[1].some(x=>!Number.isFinite(x)||Math.abs(x)>1e6))throw Error('Модель повреждена');map.set(row[0],row[1].slice());}
    this.q=map;this.epsilon=Math.max(0,Math.min(1,Number(snapshot.epsilon)||0));this.alpha=Math.max(.01,Math.min(1,Number(snapshot.alpha)||.24));this.gamma=Math.max(0,Math.min(1,Number(snapshot.gamma)||.96));
  }
}
export class RandomAgent {
  constructor(seed=1){this.rng=seeded(seed);}
  act(){return ACTIONS[Math.floor(this.rng()*ACTIONS.length)];}
  learn(){}
  serialize(){return {type:'random',version:1};}
}
export function makeAgent(type,seed=1){return type==='random'?new RandomAgent(seed):new QAgent(seed);}
export function playEpisode(agent,scene,options={}){
  const env=new GridEnvironment(scene.grid[0].length,scene.grid.length,{maxSteps:options.maxSteps??320});
  env.setScene(scene);
  if(options.spawn)env.reset(options.spawn,scene.goal);
  let s=env.observe(),actions=0;
  const trace=options.trace?[{x:env.ax,y:env.ay,reward:0,action:'START'}]:null;
  while(!env.done){
    const action=agent.act(s,options.learn===true);
    const [s2,reward,done]=env.step(action);
    if(options.learn)agent.learn(s,action,reward,s2,done);
    s=s2;actions++;
    if(trace)trace.push({x:env.ax,y:env.ay,reward,action});
  }
  return {success:env.success,reward:env.totalReward,steps:actions,trace};
}
