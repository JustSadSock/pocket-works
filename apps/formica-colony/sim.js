export const WORLD = { width: 1120, height: 2450, surfaceY: 260, cell: 10 };
export const DAY_SECONDS = 120;
export const VIEW = Object.freeze({
  NORMAL: 'normal',
  PHEROMONE: 'pheromone',
  MOISTURE: 'moisture',
  TEMPERATURE: 'temperature'
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const SOIL = Object.freeze({ AIR: 0, TOP: 1, LOAM: 2, CLAY: 3, STONE: 4 });
const nx = Math.ceil(WORLD.width / WORLD.cell);
const ny = Math.ceil(WORLD.height / WORLD.cell);
const idx = (x, y) => y * nx + x;
const navSeen = new Uint32Array(nx * ny);
const navParent = new Int32Array(nx * ny);
const navQueue = new Int32Array(nx * ny);
let navStamp = 1;

function soilForY(y) {
  if (y < WORLD.surfaceY) return SOIL.AIR;
  if (y < 780) return Math.random() < 0.055 ? SOIL.STONE : SOIL.TOP;
  if (y < 1650) return Math.random() < 0.075 ? SOIL.STONE : SOIL.LOAM;
  return Math.random() < 0.095 ? SOIL.STONE : SOIL.CLAY;
}

function hard(t) {
  return t === SOIL.TOP ? 0.72 : t === SOIL.LOAM ? 1 : t === SOIL.CLAY ? 1.42 : t === SOIL.STONE ? 99 : 0;
}

function history(w, text, kind = 'normal') {
  const day = Math.floor(w.time / DAY_SECONDS) + 1;
  if (w.history.at(-1)?.text === text) return;
  w.history.push({ t: w.time, day, text, kind });
  if (w.history.length > 140) w.history.shift();
}

function carveCircle(w, cx, cy, r) {
  const ax = Math.max(0, Math.floor((cx - r) / WORLD.cell));
  const bx = Math.min(nx - 1, Math.ceil((cx + r) / WORLD.cell));
  const ay = Math.max(0, Math.floor((cy - r) / WORLD.cell));
  const by = Math.min(ny - 1, Math.ceil((cy + r) / WORLD.cell));
  for (let y = ay; y <= by; y += 1) {
    for (let x = ax; x <= bx; x += 1) {
      const wx = x * WORLD.cell + WORLD.cell / 2;
      const wy = y * WORLD.cell + WORLD.cell / 2;
      if (Math.hypot(wx - cx, wy - cy) <= r) {
        const i = idx(x, y);
        w.soil[i] = SOIL.AIR;
        w.moisture[i] = Math.min(w.moisture[i], 0.16);
      }
    }
  }
}

function carveTunnel(w, a, b, r) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / 6));
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    carveCircle(w, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r);
  }
}

function carvePolyline(w, points, radii) {
  for (let i = 0; i < points.length - 1; i += 1) {
    carveTunnel(w, points[i], points[i + 1], radii[i] ?? radii.at(-1) ?? 15);
  }
}

function ant(w, x, y, age = rand(0, DAY_SECONDS * 8)) {
  return {
    id: w.nextId++, kind: 'ant', x, y, vx: 0, vy: 0, age,
    energy: rand(0.68, 0.96), hp: 1, state: 'idle', carry: null,
    target: null, work: 0, wander: rand(0, Math.PI * 2), alive: true, alarm: 0,
    path: null, pathKey: '', pathAge: 0
  };
}

function brood(w, stage = 'egg', x = w.queen.x + rand(-28, 28), y = w.queen.y + rand(-14, 14)) {
  return { id: w.nextId++, kind: 'brood', stage, x, y, age: 0, fed: stage === 'larva' ? 0.7 : 1, alive: true };
}

function bug(w, species = 'beetle', x = rand(80, WORLD.width - 80), y = WORLD.surfaceY - 18) {
  const beetle = species === 'beetle';
  return {
    id: w.nextId++, kind: 'bug', species, x, y,
    hp: beetle ? 2.5 : 0.9, maxHp: beetle ? 2.5 : 0.9,
    speed: beetle ? 16 : 27, nutrition: beetle ? 2.6 : 0.8,
    dead: false, wander: rand(0, Math.PI * 2), age: 0
  };
}

function addFood(w, x, y, amount, type, age = 0) {
  const f = { id: w.nextId++, kind: 'food', x, y, amount, type, age };
  w.food.push(f);
  return f;
}

export function createWorld(seed = Math.floor(Math.random() * 1e9)) {
  const soil = new Uint8Array(nx * ny);
  const moisture = new Float32Array(nx * ny);
  const temp = new Float32Array(nx * ny);
  const pherFood = new Float32Array(nx * ny);
  const pherAlarm = new Float32Array(nx * ny);
  const pherBuild = new Float32Array(nx * ny);

  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      const wy = y * WORLD.cell;
      const i = idx(x, y);
      soil[i] = soilForY(wy);
      moisture[i] = wy < WORLD.surfaceY ? 0 : clamp(0.16 + (wy / WORLD.height) * 0.26 + rand(-0.045, 0.045), 0, 1);
      temp[i] = clamp(1 - (wy / WORLD.height) * 0.38, 0, 1);
    }
  }

  const w = {
    version: 2, seed, time: 0, nextId: 1, soil, moisture, temp, pherFood, pherAlarm, pherBuild,
    ants: [], brood: [], bugs: [], food: [], soilPiles: [], history: [],
    queen: { id: 0, kind: 'queen', x: 548, y: 595, energy: 0.9, hp: 1, alive: true, layTimer: DAY_SECONDS * 0.78 },
    weather: { rain: 0, surfaceTemp: 20, nextRain: rand(35, 70), rainEnd: 0 },
    stats: { excavated: 0, births: 0, deaths: 0, predatorsKilled: 0, foodDelivered: 0, soilMoved: 0 },
    colonyEnded: false, lastSeason: 'весна', fieldTimer: 0, climateTimer: 0
  };

  const entrance = { x: 528, y: WORLD.surfaceY + 5 };
  const neck = [entrance,{ x: 520, y: 318 },{ x: 548, y: 372 },{ x: 532, y: 432 },{ x: 570, y: 492 },{ x: 548, y: 550 }];
  carvePolyline(w, neck, [12, 13, 14, 14, 15]);
  carveTunnel(w, { x: 548, y: 550 }, { x: 548, y: 595 }, 17);
  carveCircle(w, 548, 595, 58);
  carveTunnel(w, { x: 530, y: 620 }, { x: 435, y: 672 }, 15);
  carveCircle(w, 420, 682, 48);
  carveTunnel(w, { x: 575, y: 584 }, { x: 668, y: 548 }, 14);
  carveCircle(w, 688, 542, 39);

  for (let i = 0; i < 9; i += 1) w.ants.push(ant(w, 548 + rand(-24, 24), 598 + rand(-18, 18)));
  w.brood.push(brood(w, 'larva', 430, 680), brood(w, 'egg', 406, 690), brood(w, 'egg', 446, 690));
  for (let i = 0; i < 10; i += 1) addFood(w, rand(55, WORLD.width - 55), WORLD.surfaceY - 11, rand(0.25, 0.72), Math.random() < 0.76 ? 'seed' : 'nectar');
  for (let i = 0; i < 3; i += 1) w.bugs.push(bug(w, Math.random() < 0.6 ? 'beetle' : 'mite'));
  history(w, 'Королева заняла первую камеру. Девять рабочих начали обустраивать молодое гнездо.', 'milestone');
  return w;
}

function cellAt(x, y) { const cx=Math.floor(x/WORLD.cell),cy=Math.floor(y/WORLD.cell); return cx<0||cy<0||cx>=nx||cy>=ny?-1:idx(cx,cy); }
function air(w,x,y){const i=cellAt(x,y);return i>=0&&w.soil[i]===SOIL.AIR;}
function canOccupy(w,x,y){return y<WORLD.surfaceY+4||air(w,x,y);}
function pher(arr,x,y,v){const cx=Math.floor(x/WORLD.cell),cy=Math.floor(y/WORLD.cell);for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){const X=cx+ox,Y=cy+oy;if(X<0||Y<0||X>=nx||Y>=ny)continue;const f=1-Math.min(1,Math.hypot(ox,oy)/3);arr[idx(X,Y)]=Math.min(1,arr[idx(X,Y)]+v*f);}}
function sample(arr,x,y){const i=cellAt(x,y);return i<0?0:arr[i];}
function lineClear(w,x0,y0,x1,y1){const d=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.ceil(d/5));for(let i=1;i<=n;i++){const t=i/n;if(!canOccupy(w,x0+(x1-x0)*t,y0+(y1-y0)*t))return false;}return true;}

function nearestPassableCell(w,tx,ty){const cx=clamp(Math.floor(tx/WORLD.cell),0,nx-1),cy=clamp(Math.floor(ty/WORLD.cell),0,ny-1),center=idx(cx,cy);if(w.soil[center]===SOIL.AIR)return center;for(let r=1;r<=4;r++)for(let oy=-r;oy<=r;oy++)for(let ox=-r;ox<=r;ox++){if(Math.abs(ox)!==r&&Math.abs(oy)!==r)continue;const X=cx+ox,Y=cy+oy;if(X<0||Y<0||X>=nx||Y>=ny)continue;const i=idx(X,Y);if(w.soil[i]===SOIL.AIR)return i;}return -1;}
function findPath(w,sx,sy,tx,ty){const start=nearestPassableCell(w,sx,sy),goal=nearestPassableCell(w,tx,ty);if(start<0||goal<0)return null;if(start===goal)return[];navStamp+=1;if(navStamp===0xffffffff){navSeen.fill(0);navStamp=1;}let head=0,tail=0;navQueue[tail++]=start;navSeen[start]=navStamp;navParent[start]=-1;const dirs=[1,-1,nx,-nx];let found=false,visited=0;while(head<tail&&visited++<16000){const cur=navQueue[head++];if(cur===goal){found=true;break;}const x=cur%nx,y=(cur/nx)|0;for(const d of dirs){const next=cur+d;if(next<0||next>=nx*ny)continue;const xx=next%nx,yy=(next/nx)|0;if(Math.abs(xx-x)+Math.abs(yy-y)!==1)continue;if(navSeen[next]===navStamp||w.soil[next]!==SOIL.AIR)continue;navSeen[next]=navStamp;navParent[next]=cur;navQueue[tail++]=next;}}if(!found&&navSeen[goal]!==navStamp)return null;const rev=[];let cur=goal;while(cur!==start&&cur>=0&&rev.length<1200){const x=cur%nx,y=(cur/nx)|0;rev.push({x:(x+.5)*WORLD.cell,y:(y+.5)*WORLD.cell});cur=navParent[cur];}rev.reverse();const path=[];let lastDir='';for(let i=0;i<rev.length;i++){const prev=i===0?{x:sx,y:sy}:rev[i-1],dx=Math.sign(rev[i].x-prev.x),dy=Math.sign(rev[i].y-prev.y),dir=`${dx},${dy}`;if(dir!==lastDir&&i>0)path.push(rev[i-1]);lastDir=dir;}if(rev.length)path.push(rev.at(-1));return path;}
function moveStep(w,a,tx,ty,speed,dt){const dx=tx-a.x,dy=ty-a.y,d=Math.hypot(dx,dy)||1;if(d<7){if(canOccupy(w,tx,ty)){a.x=tx;a.y=ty;}return true;}const vx=dx/d,vy=dy/d,step=Math.min(d,speed*dt),xx=a.x+vx*step,yy=a.y+vy*step;if(canOccupy(w,xx,yy)){a.x=xx;a.y=yy;a.vx=vx;a.vy=vy;return d<9;}return false;}
function move(w,a,tx,ty,speed,dt){let goalX=tx,goalY=ty;if(a.y>WORLD.surfaceY+12&&ty<WORLD.surfaceY+2){goalX=528;goalY=WORLD.surfaceY+2;}a.pathAge=(a.pathAge||0)+dt;if(lineClear(w,a.x,a.y,goalX,goalY)){a.path=null;a.pathKey='';a.pathAge=0;const reachedLeg=moveStep(w,a,goalX,goalY,speed,dt);if(reachedLeg&&goalX!==tx)return moveStep(w,a,tx,ty,speed,dt);return goalX===tx?reachedLeg:false;}const key=`${Math.round(goalX/10)},${Math.round(goalY/10)}`;if(!a.path||a.pathKey!==key||a.pathAge>1.2){a.path=findPath(w,a.x,a.y,goalX,goalY);a.pathKey=key;a.pathAge=0;}if(!a.path?.length)return false;const wp=a.path[0];if(moveStep(w,a,wp.x,wp.y,speed,dt))a.path.shift();if(a.path.length===0&&Math.hypot(a.x-goalX,a.y-goalY)<12){a.path=null;if(goalX!==tx)return false;return true;}return false;}

function approachDigCell(w,a,t,speed,dt){const cx=Math.floor(t.x/WORLD.cell),cy=Math.floor(t.y/WORLD.cell);let best=null,bd=Infinity;for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=cx+ox,Y=cy+oy;if(X<0||Y<0||X>=nx||Y>=ny)continue;const i=idx(X,Y);if(w.soil[i]!==SOIL.AIR)continue;const p={x:(X+.5)*WORLD.cell,y:(Y+.5)*WORLD.cell},d=Math.hypot(p.x-a.x,p.y-a.y);if(d<bd){bd=d;best=p;}}if(!best)return false;return move(w,a,best.x,best.y,speed,dt)||Math.hypot(best.x-a.x,best.y-a.y)<8;}
function nearest(arr,a,filter=()=>true){let best=null,bd=Infinity;for(const x of arr){if(!filter(x))continue;const d=dist(a,x);if(d<bd){bd=d;best=x;}}return best;}
function nestFood(w){return w.food.filter(f=>f.y>WORLD.surfaceY+30).reduce((s,f)=>s+f.amount,0);}
function consume(w,amount){let left=amount;for(const f of w.food){if(left<=0)break;if(f.y<=WORLD.surfaceY+30)continue;const take=Math.min(left,f.amount);f.amount-=take;left-=take;}w.food=w.food.filter(f=>f.amount>.012);return amount-left;}
function depositFood(w,carry){if(!carry?.amount)return;const target=w.food.find(f=>f.y>WORLD.surfaceY+30&&f.type===carry.foodType&&dist(f,{x:688,y:542})<36&&f.amount<1.4);if(target){target.amount+=carry.amount;target.age=Math.min(target.age||0,20);}else addFood(w,688+rand(-25,25),542+rand(-15,15),carry.amount,carry.foodType,0);}
function digTarget(w,a){const radial=Math.atan2(a.y-w.queen.y,a.x-w.queen.x),base=Number.isFinite(radial)&&dist(a,w.queen)>28?radial:rand(0,Math.PI*2);for(let k=0;k<28;k++){const ang=base+rand(-1.05,1.05),r=rand(22,72),x=a.x+Math.cos(ang)*r,y=a.y+Math.sin(ang)*r;if(y<WORLD.surfaceY+42||y>WORLD.height-50)continue;const i=cellAt(x,y);if(i<0||w.soil[i]===SOIL.AIR||w.soil[i]===SOIL.STONE)continue;const cx=Math.floor(x/WORLD.cell),cy=Math.floor(y/WORLD.cell);let edge=false;for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=cx+ox,Y=cy+oy;if(X>=0&&Y>=0&&X<nx&&Y<ny&&w.soil[idx(X,Y)]===SOIL.AIR)edge=true;}if(edge)return{x:(cx+.5)*WORLD.cell,y:(cy+.5)*WORLD.cell,i};}return null;}
function removeSoil(w,t){const s=w.soil[t.i];if(s===SOIL.AIR||s===SOIL.STONE)return false;w.soil[t.i]=SOIL.AIR;w.moisture[t.i]*=.4;w.stats.excavated+=1;return{mass:hard(s)};}
function excavationDemand(w){const target=110+w.ants.length*12+w.brood.length*4;return clamp((target-w.stats.excavated)/Math.max(60,target),.04,1);}

function task(w,a,dt){
  a.age+=dt;a.energy-=dt*(a.carry?.type==='soil'?.00055:.00043);if(a.energy<=0||a.hp<=0){a.alive=false;w.stats.deaths+=1;history(w,`Рабочая #${a.id} погибла.`,'critical');return;}
  if(a.carry?.type==='food')pher(w.pherFood,a.x,a.y,.045*dt);if(a.alarm>0){a.alarm-=dt;pher(w.pherAlarm,a.x,a.y,.11*dt);}
  if(a.state==='returnFood'){if(move(w,a,688,542,47,dt)){depositFood(w,a.carry);w.stats.foodDelivered+=a.carry?.amount||0;a.carry=null;a.state='idle';a.energy=Math.min(1,a.energy+.035);}return;}
  if(a.state==='returnSoil'){if(move(w,a,528,WORLD.surfaceY-8,43,dt)){w.soilPiles.push({x:528+rand(-78,78),y:WORLD.surfaceY-5,mass:a.carry?.mass||1,age:0});if(w.soilPiles.length>150)w.soilPiles.splice(0,25);w.stats.soilMoved+=a.carry?.mass||1;a.carry=null;a.state='idle';}return;}
  if(a.state==='dig'){if(!a.target){a.state='idle';return;}const t=w.soil[a.target.i];if(t===SOIL.AIR||t===SOIL.STONE){a.state='idle';a.target=null;return;}if(approachDigCell(w,a,a.target,31,dt)){a.work+=dt;pher(w.pherBuild,a.x,a.y,.025*dt);if(a.work>hard(t)*1.55){const chunk=removeSoil(w,a.target);a.work=0;a.target=null;if(chunk){a.carry={type:'soil',mass:chunk.mass};a.state='returnSoil';}else a.state='idle';}}return;}
  if(a.state==='attack'){const b=w.bugs.find(x=>x.id===a.target&&!x.dead);if(!b){a.state='idle';a.target=null;return;}if(move(w,a,b.x,b.y,54,dt)){b.hp-=dt*(.46+Math.random()*.22);a.alarm=1.2;if(Math.random()<dt*.045)a.hp-=.08;if(b.hp<=0){b.dead=true;w.stats.predatorsKilled+=1;history(w,`Рабочие обезвредили ${b.species==='beetle'?'жука':'клеща'} у тропы.`,'hunt');addFood(w,b.x,b.y,b.nutrition,'prey');a.state='forage';a.target=null;}}return;}
  if(a.state==='forage'){let f=a.target?w.food.find(x=>x.id===a.target&&x.y<WORLD.surfaceY+5&&x.amount>.025):null;if(!f){f=nearest(w.food,a,x=>x.y<WORLD.surfaceY+5&&x.amount>.025);a.target=f?.id||null;}if(!f){a.state='idle';return;}if(move(w,a,f.x,f.y,50,dt)){const cap=f.type==='prey'?.18:f.type==='seed'?.28:.22,amount=Math.min(cap,f.amount);f.amount-=amount;a.carry={type:'food',amount,foodType:f.type};a.state='returnFood';a.target=null;w.food=w.food.filter(x=>x.amount>.012);}return;}
  if(a.state==='feedBrood'){const b=w.brood.find(x=>x.id===a.target&&x.alive);if(!b){a.state='idle';return;}if(move(w,a,b.x,b.y,37,dt)){b.fed=clamp(b.fed+consume(w,.07)*2.25,0,1);a.state='idle';a.target=null;}return;}
  if(a.state==='feedQueen'){if(move(w,a,w.queen.x,w.queen.y,37,dt)){w.queen.energy=clamp(w.queen.energy+consume(w,.08)*1.25,0,1);a.state='idle';}return;}
  if(a.energy<.48&&nestFood(w)>.035)a.energy=clamp(a.energy+consume(w,.055)*5.2,0,1);
  const danger=nearest(w.bugs,a,b=>!b.dead&&b.y<WORLD.surfaceY+20&&dist(a,b)<115);if(danger){a.state='attack';a.target=danger.id;a.alarm=1.6;return;}
  if(sample(w.pherAlarm,a.x,a.y)>.27){const d=nearest(w.bugs,a,b=>!b.dead&&b.y<WORLD.surfaceY+20);if(d){a.state='attack';a.target=d.id;return;}}
  const hungry=w.brood.filter(b=>b.alive&&b.stage==='larva'&&b.fed<.62);if(hungry.length&&nestFood(w)>.06&&Math.random()<.42){const b=pick(hungry);a.state='feedBrood';a.target=b.id;return;}
  if(w.queen.energy<.63&&nestFood(w)>.08&&Math.random()<.28){a.state='feedQueen';return;}
  const surfaceFoodAvailable=w.food.some(f=>f.y<WORLD.surfaceY+5&&f.amount>.025);if(surfaceFoodAvailable&&(a.y<WORLD.surfaceY+90||Math.random()<.24)){a.state='forage';a.target=null;return;}
  if(Math.random()<.18*excavationDemand(w)){const t=digTarget(w,a);if(t){a.state='dig';a.target=t;return;}}
  a.wander+=rand(-.72,.72);move(w,a,clamp(a.x+Math.cos(a.wander)*rand(10,52),15,WORLD.width-15),clamp(a.y+Math.sin(a.wander)*rand(10,52),25,WORLD.height-25),25,dt);
}

function updateBrood(w,dt){for(const b of w.brood){if(!b.alive)continue;b.age+=dt;if(b.stage==='larva')b.fed-=dt*.0005;if(b.fed<=0){b.alive=false;continue;}if(b.stage==='egg'&&b.age>DAY_SECONDS*2.8){b.stage='larva';b.age=0;b.fed=.72;}else if(b.stage==='larva'&&b.age>DAY_SECONDS*4.4&&b.fed>.46){b.stage='pupa';b.age=0;b.fed=1;}else if(b.stage==='pupa'&&b.age>DAY_SECONDS*3.5){b.alive=false;w.ants.push(ant(w,b.x,b.y,0));w.stats.births+=1;history(w,`Рабочая #${w.ants.at(-1).id} вышла из куколки.`,'milestone');}}w.brood=w.brood.filter(b=>b.alive);}
function updateQueen(w,dt){if(!w.queen.alive)return;w.queen.energy-=dt*.00018;if(w.queen.energy<=0){w.queen.alive=false;w.colonyEnded=true;history(w,'Королева погибла. Колония больше не может воспроизводиться.','critical');return;}w.queen.layTimer-=dt;const broodCap=Math.max(4,Math.floor(w.ants.length*.55)+2);if(w.queen.layTimer<=0){if(w.queen.energy>.58&&nestFood(w)>.28&&w.brood.length<broodCap){w.queen.energy-=.045;w.brood.push(brood(w,'egg'));w.queen.layTimer=DAY_SECONDS*rand(.6,1.05);}else w.queen.layTimer=DAY_SECONDS*rand(.16,.28);}}
function updateBugs(w,dt){for(const b of w.bugs){b.age+=dt;if(b.dead)continue;b.wander+=rand(-.48,.48)*dt;b.x=clamp(b.x+Math.cos(b.wander)*b.speed*dt,20,WORLD.width-20);if(Math.random()<dt*.012)b.wander+=Math.PI*rand(.6,1.4);}if(w.bugs.filter(b=>!b.dead).length<5&&Math.random()<dt*.006)w.bugs.push(bug(w,Math.random()<.42?'beetle':'mite'));w.bugs=w.bugs.filter(b=>!b.dead||b.age<DAY_SECONDS*.35);}
function updateFood(w,dt){for(const f of w.food){f.age=(f.age||0)+dt;const surface=f.y<WORLD.surfaceY+5,decay=f.type==='nectar'?(surface?.0015:.00045):f.type==='prey'?(surface?.001:.00028):.000055;f.amount-=decay*dt;}w.food=w.food.filter(f=>f.amount>.012);for(const p of w.soilPiles)p.age=(p.age||0)+dt;}
function surfaceFood(w,dt){const s=getSeason(w),cap=s==='зима'?5:s==='осень'?16:s==='лето'?19:15,count=w.food.filter(f=>f.y<WORLD.surfaceY+5).length,rate=s==='зима'?.006:s==='осень'?.024:.034;if(count<cap&&Math.random()<dt*rate)addFood(w,rand(35,WORLD.width-35),WORLD.surfaceY-11,rand(.22,.68),Math.random()<.78?'seed':'nectar');}
function weather(w,dt){const day=w.time/DAY_SECONDS,seasonWave=Math.sin(day/365*Math.PI*2),daylight=Math.sin((w.time%DAY_SECONDS)/DAY_SECONDS*Math.PI*2-Math.PI/2)*.5+.5;w.weather.surfaceTemp=14+seasonWave*8+daylight*9;if(w.time>w.weather.nextRain&&w.weather.rain<=0){w.weather.rain=1;w.weather.rainEnd=w.time+rand(7,15);history(w,'Начался дождь. Верхние ходы набирают влагу.','critical');}if(w.weather.rain>0&&w.time>w.weather.rainEnd){w.weather.rain=0;w.weather.nextRain=w.time+rand(40,90);}}
function updateClimateGrid(w,elapsed){for(let y=0;y<ny;y+=2)for(let x=0;x<nx;x+=2){const i=idx(x,y),depth=Math.max(0,y*WORLD.cell-WORLD.surfaceY),nearSurface=y<Math.min(ny,42);if(w.weather.rain>0&&nearSurface&&w.soil[i]!==SOIL.AIR)w.moisture[i]=clamp(w.moisture[i]+elapsed*.012,0,1);const target=clamp((w.weather.rain?.58:.16)+depth/WORLD.height*.27,0,1);w.moisture[i]+=(target-w.moisture[i])*elapsed*.0035;const tt=clamp((w.weather.surfaceTemp-3-depth*.002)/35,0,1);w.temp[i]+=(tt-w.temp[i])*elapsed*.01;}}
function occupied(w,x,y,r=16){if(w.queen.alive&&Math.hypot(w.queen.x-x,w.queen.y-y)<r)return true;for(const a of w.ants)if(Math.hypot(a.x-x,a.y-y)<r)return true;for(const b of w.brood)if(Math.hypot(b.x-x,b.y-y)<r)return true;return false;}
function collapse(w,dt){if(w.weather.rain<=0||Math.random()>dt*.16)return;for(let k=0;k<18;k++){const x=1+((Math.random()*(nx-2))|0),y=Math.floor(WORLD.surfaceY/WORLD.cell)+1+((Math.random()*34)|0),i=idx(x,y);if(w.soil[i]===SOIL.AIR||w.soil[i]===SOIL.STONE||w.moisture[i]<.72)continue;const below=idx(x,y+1),wx=(x+.5)*WORLD.cell,wy=(y+1.5)*WORLD.cell;let airNeighbours=0;for(const[ox,oy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+ox,Y=y+1+oy;if(X>=0&&Y>=0&&X<nx&&Y<ny&&w.soil[idx(X,Y)]===SOIL.AIR)airNeighbours++;}if(w.soil[below]===SOIL.AIR&&airNeighbours>=3&&!occupied(w,wx,wy,18)&&Math.random()<.13){w.soil[below]=w.soil[i];w.soil[i]=SOIL.AIR;w.moisture[below]=w.moisture[i];w.moisture[i]=.12;}}}

export function getSeason(w){const d=Math.floor(w.time/DAY_SECONDS)%365;return d<90?'весна':d<180?'лето':d<270?'осень':'зима';}
export function updateWorld(w,dt){if(!w||w.colonyEnded)return;w.time+=dt;const s=getSeason(w);if(s!==w.lastSeason){w.lastSeason=s;history(w,`Наступил сезон: ${s}.`,'milestone');}weather(w,dt);collapse(w,dt);w.fieldTimer=(w.fieldTimer||0)+dt;if(w.fieldTimer>=.38){const elapsed=w.fieldTimer;w.fieldTimer=0;const decay=Math.pow(.993,elapsed*10);for(const arr of[w.pherFood,w.pherAlarm,w.pherBuild])for(let i=0;i<arr.length;i++)arr[i]*=decay;}w.climateTimer=(w.climateTimer||0)+dt;if(w.climateTimer>=.8){const elapsed=w.climateTimer;w.climateTimer=0;updateClimateGrid(w,elapsed);}for(const a of w.ants)if(a.alive)task(w,a,dt);w.ants=w.ants.filter(a=>a.alive);updateBrood(w,dt);updateQueen(w,dt);updateBugs(w,dt);updateFood(w,dt);surfaceFood(w,dt);if(w.ants.length===0&&w.queen.alive&&w.time>DAY_SECONDS*2){w.colonyEnded=true;history(w,'Последняя рабочая погибла. Королева осталась без кормильцев.','critical');}}
export function getStats(w){return{day:Math.floor(w.time/DAY_SECONDS)+1,workers:w.ants.length,brood:w.brood.length,food:nestFood(w),season:getSeason(w),queen:w.queen.alive,excavated:w.stats.excavated,births:w.stats.births,deaths:w.stats.deaths,predatorsKilled:w.stats.predatorsKilled};}
export function inspectAt(w,x,y,r=26){const all=[];if(w.queen.alive)all.push(w.queen);all.push(...w.ants,...w.brood,...w.bugs.filter(b=>!b.dead));let best=null,bd=r;for(const o of all){const d=Math.hypot(o.x-x,o.y-y);if(d<bd){bd=d;best=o;}}return best;}
export function temperatureAt(w,x,y){const i=cellAt(x,y);return i<0?.5:w.temp[i];}
export function gridInfo(){return{nx,ny,SOIL};}
export function getDiagnostics(w){const antsInSolid=w.ants.filter(a=>a.y>WORLD.surfaceY+4&&!air(w,a.x,a.y)).length,broodInSolid=w.brood.filter(b=>b.y>WORLD.surfaceY+4&&!air(w,b.x,b.y)).length,queenInSolid=w.queen.alive&&!air(w,w.queen.x,w.queen.y)?1:0;return{antsInSolid,broodInSolid,queenInSolid,nestFood:nestFood(w),worldTime:w.time};}

function bytesToBase64(bytes){let binary='';const step=0x4000;for(let i=0;i<bytes.length;i+=step)binary+=String.fromCharCode(...bytes.subarray(i,i+step));return btoa(binary);}
function base64ToBytes(text){const binary=atob(text),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
function quantize01(arr){const bytes=new Uint8Array(arr.length);for(let i=0;i<arr.length;i++)bytes[i]=Math.round(clamp(arr[i],0,1)*255);return bytesToBase64(bytes);}
function dequantize01(text,length){const bytes=base64ToBytes(text),out=new Float32Array(length);for(let i=0;i<out.length;i++)out[i]=(bytes[i]??0)/255;return out;}
function rebuildTemp(w){const out=new Float32Array(nx*ny);for(let y=0;y<ny;y++){const depth=Math.max(0,y*WORLD.cell-WORLD.surfaceY),value=clamp((w.weather.surfaceTemp-3-depth*.002)/35,0,1);for(let x=0;x<nx;x++)out[idx(x,y)]=value;}return out;}
function migrateAntCarry(a,food){if(a.carry?.type!=='food'||!a.carry.ref)return a;const ref=a.carry.ref,amount=Math.min(ref.type==='prey'?.18:.26,ref.amount||.18),original=food.find(f=>f.id===ref.id);if(original){original.amount=Math.max(0,original.amount-amount);delete original.carriedBy;}a.carry={type:'food',amount,foodType:ref.type||'seed'};return a;}
export function serializeWorld(w){return{version:2,seed:w.seed,time:w.time,nextId:w.nextId,soilB64:bytesToBase64(w.soil),moistureB64:quantize01(w.moisture),ants:w.ants.map(({path,pathKey,pathAge,...a})=>a),brood:w.brood,bugs:w.bugs,food:w.food,soilPiles:w.soilPiles,history:w.history,queen:w.queen,weather:w.weather,stats:w.stats,colonyEnded:w.colonyEnded,lastSeason:w.lastSeason,fieldTimer:w.fieldTimer||0,climateTimer:w.climateTimer||0};}
export function restoreWorld(raw){if(!raw||(raw.version!==1&&raw.version!==2))throw new Error('Unsupported FORMICA save');if(raw.version===1){const food=(raw.food||[]).map(f=>({...f,age:f.age||0})),ants=(raw.ants||[]).map(a=>migrateAntCarry({...a,path:null,pathKey:'',pathAge:0},food));return{...raw,version:2,ants,food:food.filter(f=>f.amount>.012),soil:Uint8Array.from(raw.soil),moisture:Float32Array.from(raw.moisture),temp:Float32Array.from(raw.temp),pherFood:new Float32Array(nx*ny),pherAlarm:new Float32Array(nx*ny),pherBuild:new Float32Array(nx*ny),fieldTimer:0,climateTimer:0};}const soil=base64ToBytes(raw.soilB64);if(soil.length!==nx*ny)throw new Error('FORMICA soil size mismatch');const w={...raw,soil,moisture:dequantize01(raw.moistureB64,nx*ny),temp:null,pherFood:new Float32Array(nx*ny),pherAlarm:new Float32Array(nx*ny),pherBuild:new Float32Array(nx*ny),fieldTimer:raw.fieldTimer||0,climateTimer:raw.climateTimer||0};w.temp=rebuildTemp(w);w.ants=(w.ants||[]).map(a=>({...a,path:null,pathKey:'',pathAge:0}));w.food=(w.food||[]).map(f=>({...f,age:f.age||0}));w.soilPiles=(w.soilPiles||[]).map(p=>({...p,age:p.age||0}));return w;}
