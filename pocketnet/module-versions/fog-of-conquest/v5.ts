// PocketNet adaptation of the ORIGINAL Fog of Conquest, without rebalance.
// Original unit/building definitions and complete generator are embedded verbatim.
// Never broadcast raw state: enemies and fogged terrain remain private.
export const MIN_PLAYERS=2,MAX_PLAYERS=2,RULESET_VERSION=4;
const TERRAIN={PLAIN:0,WATER:1,FOREST:2,HILL:3,MOUNTAIN:4};
const TERR_COST=[1,2,2,2,999],TERR_DEF=[0,-1,1,2,0];
const BASE_ROWS=20,BASE_COLS=30;
const UNIT_TYPES = {
    swordsman:{move:2,atk:2,def:1,range:1,hpMax:5,cost:3,color:'#e74c3c'},
    // increased archer cost to better balance units
    archer:   {move:2,atk:3,def:0,range:2,hpMax:4,cost:4,color:'#2ecc71'},
    heavy:    {move:1,atk:3,def:2,range:1,hpMax:6,cost:5,color:'#2c3e50'},
    cavalry:  {move:3,atk:3,def:1,range:1,hpMax:5,cost:7,color:'#3498db'},
    mage:     {move:2,atk:0,def:0,range:1,hpMax:4,cost:7,color:'#9b59b6'},
    bog:      {move:1000,atk:2,def:1,range:1,hpMax:1000,cost:0,color:'#f1c40f'}
  };

  const BUILD_TYPES = {
    base:      {spawn:['swordsman','archer'],gen:0,def:1,hpMax:4},
    barracks:  {spawn:['heavy'],gen:0,def:0,hpMax:3},
    stable:    {spawn:['cavalry'],gen:0,def:0,hpMax:3},
    mageTower: {spawn:['mage'],gen:0,def:0,hpMax:3},
    // genUp indicates income after upgrade
    mill:      {spawn:[],gen:1,genUp:2,def:0,hpMax:2},
    fort:      {spawn:[],gen:0,def:2,hpMax:4}
  };
function originalGenerator(global){
'use strict';
  const abs = Math.abs;
  const random = typeof global.random==='function' ? global.random : Math.random;
  const NOISE_FREQS = [8, 16, 32];
  const WATER_RATIO = 0.1;
  const HILL_RATIO = 0.15;
  const MOUNTAIN_RATIO = 0.1;
  const FOREST_CHANCE = 0.25;
  const RESOURCE_CHANCE = 0.05;
  const START_CLEAR_RADIUS = 2;

  function generateWorld(beta = global.modeBeta){
    global.buildings.length = 0;
    global.units.length = 0;

    const heightMap = layeredNoise(global.ROWS, global.COLS);
    classifyBiome(heightMap);
    placeBases();
    addForests();
    addResources();
    ensureConnectivity();
    balanceStarts();
    spiceRandom();
    ensureTerrainPresence();
    ensureConnectivity(); // verify after all terrain modifiers

    global.units.push({id:global.nextUnitId++,r:1,c:2,owner:1,type:'swordsman',
      hp:global.UNIT_TYPES.swordsman.hpMax,
      mp:global.UNIT_TYPES.swordsman.move,startR:1,startC:2});
    global.units.push({id:global.nextUnitId++,r:2,c:1,owner:1,type:'archer',
      hp:global.UNIT_TYPES.archer.hpMax,
      mp:global.UNIT_TYPES.archer.move,startR:2,startC:1});
    global.units.push({id:global.nextUnitId++,r:global.ROWS-2,c:global.COLS-3,
      owner:2,type:'swordsman',
      hp:global.UNIT_TYPES.swordsman.hpMax,
      mp:global.UNIT_TYPES.swordsman.move,startR:global.ROWS-2,startC:global.COLS-3});
    global.units.push({id:global.nextUnitId++,r:global.ROWS-3,c:global.COLS-2,
      owner:2,type:'archer',
      hp:global.UNIT_TYPES.archer.hpMax,
      mp:global.UNIT_TYPES.archer.move,startR:global.ROWS-3,startC:global.COLS-2});
    if(beta){
      // Preserve the original fixed positions where safe, otherwise choose
      // a free tile near each side's stronghold (tiny is only 5x8).
      const placeBog=(owner,r0,c0)=>{
        const base=global.buildings.find(b=>b.owner===owner&&b.type==='base');
        const cells=[{r:r0,c:c0}];
        for(let r=0;r<global.ROWS;r++)for(let c=0;c<global.COLS;c++)cells.push({r,c});
        cells.sort((a,b)=>{
          const score=o=>o.r===r0&&o.c===c0?-1000:Math.abs(o.r-base.r)+Math.abs(o.c-base.c);
          return score(a)-score(b);
        });
        const cell=cells.find(({r,c})=>r>=0&&r<global.ROWS&&c>=0&&c<global.COLS&&
          global.map[r][c]!==global.TERRAIN.MOUNTAIN&&
          !global.units.some(u=>u.r===r&&u.c===c)&&
          !global.buildings.some(b=>b.r===r&&b.c===c));
        if(!cell)return;
        global.units.push({id:global.nextUnitId++,r:cell.r,c:cell.c,owner,type:'bog',
          hp:global.UNIT_TYPES.bog.hpMax,mp:global.UNIT_TYPES.bog.move,
          startR:cell.r,startC:cell.c});
      };
      placeBog(1,5,5);
      placeBog(2,global.ROWS-6,global.COLS-6);
    }
  }

  function layeredNoise(rows, cols){
    const map = Array.from({length:rows},()=>Array(cols).fill(0));
    const weights = [1,0.5,0.25];
    for(let i=0;i<NOISE_FREQS.length;i++){
      const freq = NOISE_FREQS[i];
      const w = weights[i];
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const x=r/freq, y=c/freq;
        map[r][c]+=smoothNoise(x,y)*w;
      }
    }
    let min=Infinity,max=-Infinity;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const v=map[r][c];if(v<min)min=v;if(v>max)max=v;}
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      let v=(map[r][c]-min)/(max-min);
      const dx=r-rows/2, dy=c-cols/2;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const maxDist=Math.sqrt((rows/2)**2+(cols/2)**2);
      const falloff=1-dist/maxDist;
      map[r][c]=v*0.7+falloff*0.3;
    }
    for(let k=0;k<2;k++) boxBlur(map);
    return map;
  }

  function classifyBiome(hm){
    const values=[];
    for(let r=0;r<global.ROWS;r++)for(let c=0;c<global.COLS;c++) values.push(hm[r][c]);
    values.sort((a,b)=>a-b);
    const q=(p)=>values[Math.floor(values.length*p)];
    const tWater=q(WATER_RATIO);
    const tMountain=q(1-MOUNTAIN_RATIO);
    const tHill=q(1-(MOUNTAIN_RATIO+HILL_RATIO));
    global.map.length=0;
    for(let r=0;r<global.ROWS;r++){
      global.map[r]=[];
      for(let c=0;c<global.COLS;c++){
        const h=hm[r][c];
        let t=global.TERRAIN.PLAIN;
        if(h<tWater) t=global.TERRAIN.WATER;
        else if(h>tMountain) t=global.TERRAIN.MOUNTAIN;
        else if(h>tHill) t=global.TERRAIN.HILL;
        global.map[r][c]=t;
      }
    }
  }

  function placeBases(){
    const spots=[[1,1],[global.ROWS-2,global.COLS-2]];
    spots.forEach(([br,bc])=>{
      for(let dr=-START_CLEAR_RADIUS;dr<=START_CLEAR_RADIUS;dr++)
        for(let dc=-START_CLEAR_RADIUS;dc<=START_CLEAR_RADIUS;dc++){
          const rr=br+dr, cc=bc+dc;
          if(rr>=0&&rr<global.ROWS&&cc>=0&&cc<global.COLS)
            global.map[rr][cc]=global.TERRAIN.PLAIN;
        }
    });
    global.buildings.push({r:1,c:1,owner:1,type:'base',
      gen:global.BUILD_TYPES.base.gen,hp:global.BUILD_TYPES.base.hpMax});
    global.buildings.push({r:global.ROWS-2,c:global.COLS-2,owner:2,type:'base',
      gen:global.BUILD_TYPES.base.gen,hp:global.BUILD_TYPES.base.hpMax});
  }

  function addForests(){
    const freq=NOISE_FREQS[1];
    for(let r=0;r<global.ROWS;r++)for(let c=0;c<global.COLS;c++){
      if(global.map[r][c]===global.TERRAIN.PLAIN){
        const v=smoothNoise(r/freq,c/freq);
        if(v<FOREST_CHANCE) global.map[r][c]=global.TERRAIN.FOREST;
      }
    }
  }

  function addResources(){
    const scale = global.ROWS / global.BASE_ROWS;
    function addRes(owner,type){
      const b=global.buildings.find(x=>x.owner===owner&&x.type==='base');
      [[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc])=>{
        let rr=b.r+dr, cc=b.c+dc;
        if(rr>=0&&rr<global.ROWS&&cc>=0&&cc<global.COLS&&
          global.map[rr][cc]===global.TERRAIN.PLAIN){
          global.buildings.push({r:rr,c:cc,owner,type,
            gen:global.BUILD_TYPES[type].gen,
            hp:global.BUILD_TYPES[type].hpMax});
          return true;
        }
      });
    }
    addRes(1,'mill');
    addRes(2,'mill');

    [['mill',4],['barracks',2],['stable',2],['mageTower',1],['fort',4]]
      .forEach(([type,count])=>{
        count=Math.max(1,Math.round(count*scale));
        let half=count/2|0;
        for(let i=0;i<half;i++){
          let p=freeCell(1); if(!p){p=freeCell();}
          if(p) global.buildings.push({r:p.r,c:p.c,owner:0,type,
            gen:global.BUILD_TYPES[type].gen,
            hp:global.BUILD_TYPES[type].hpMax});
        }
        for(let i=0;i<count-half;i++){
          let p=freeCell(2); if(!p){p=freeCell();}
          if(p) global.buildings.push({r:p.r,c:p.c,owner:0,type,
            gen:global.BUILD_TYPES[type].gen,
            hp:global.BUILD_TYPES[type].hpMax});
        }
      });
  }

  function ensureConnectivity(){
    const pass=t=>t!==global.TERRAIN.MOUNTAIN&&t!==global.TERRAIN.WATER;
    const visited=Array.from({length:global.ROWS},()=>Array(global.COLS).fill(false));
    const q=[[1,1]]; visited[1][1]=true;
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    while(q.length){
      const [r,c]=q.shift();
      for(const [dr,dc] of dirs){
        const rr=r+dr, cc=c+dc;
        if(rr>=0&&rr<global.ROWS&&cc>=0&&cc<global.COLS&&
          !visited[rr][cc]&&pass(global.map[rr][cc])){
          visited[rr][cc]=true; q.push([rr,cc]);
        }
      }
    }
    if(!visited[global.ROWS-2][global.COLS-2]){
      // Replace the disconnected diagonal carve with a four-neighbour corridor.
      for(let c=1;c<=global.COLS-2;c++)global.map[1][c]=global.TERRAIN.PLAIN;
      for(let r=1;r<=global.ROWS-2;r++)global.map[r][global.COLS-2]=global.TERRAIN.PLAIN;
    }
  }

  function balanceStarts(){
    for(let r=0;r<global.ROWS;r++){
      for(let c=0;c<global.COLS;c++){
        const rr=global.ROWS-1-r, cc=global.COLS-1-c;
        if(r>rr || (r===rr && c>cc)) continue;
        const t1=global.map[r][c], t2=global.map[rr][cc];
        if(t1===t2) continue;
        const pass=t=>t!==global.TERRAIN.MOUNTAIN && t!==global.TERRAIN.WATER;
        let chosen;
        if(pass(t1) && !pass(t2)) chosen=t1;
        else if(pass(t2) && !pass(t1)) chosen=t2;
        else chosen=rand2(r,c)<0.5?t1:t2;
        global.map[r][c]=global.map[rr][cc]=chosen;
      }
    }
  }

  function spiceRandom(){
    const safe=START_CLEAR_RADIUS+3;
    for(let r=0;r<global.ROWS;r++)for(let c=0;c<global.COLS;c++){
      if(abs(r-1)<=safe && abs(c-1)<=safe) continue;
      if(abs(r-(global.ROWS-2))<=safe && abs(c-(global.COLS-2))<=safe) continue;
      if(global.map[r][c]!==global.TERRAIN.PLAIN) continue;
      const v=rand2(r+77,c+33);
      if(v<RESOURCE_CHANCE/2) global.map[r][c]=global.TERRAIN.FOREST;
      else if(v<RESOURCE_CHANCE) global.map[r][c]=global.TERRAIN.HILL;
    }
  }

  function ensureTerrainPresence(){
    const types=[global.TERRAIN.WATER,global.TERRAIN.FOREST,global.TERRAIN.HILL,global.TERRAIN.MOUNTAIN];
    types.forEach(t=>{
      if(!global.map.some(row=>row.includes(t))){
        for(let i=0;i<1000;i++){
          const r=random()*global.ROWS|0, c=random()*global.COLS|0;
          if(global.map[r][c]===global.TERRAIN.PLAIN){ global.map[r][c]=t; break; }
        }
      }
    });
  }

  function rand2(x,y){
    return Math.abs(Math.sin(x*374761393 + y*668265263 + 1337))%1;
  }

  function smoothNoise(x,y){
    const x0=Math.floor(x), y0=Math.floor(y);
    const x1=x0+1, y1=y0+1;
    const sx=x-x0, sy=y-y0;
    const n00=rand2(x0,y0), n10=rand2(x1,y0), n01=rand2(x0,y1), n11=rand2(x1,y1);
    const ix0=n00+(n10-n00)*sx, ix1=n01+(n11-n01)*sx;
    return ix0+(ix1-ix0)*sy;
  }

  function boxBlur(arr){
    const rows=arr.length, cols=arr[0].length;
    const cp=arr.map(r=>r.slice());
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      let sum=0,count=0;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        const rr=r+dr, cc=c+dc;
        if(rr>=0&&rr<rows&&cc>=0&&cc<cols){ sum+=cp[rr][cc]; count++; }
      }
      arr[r][c]=sum/count;
    }
  }

  function freeCell(side){
    for(let i=0;i<500;i++){
      let r=2+random()*(global.ROWS-4)|0,
          c=2+random()*(global.COLS-4)|0;
      if(side===1&&c>=global.COLS/2) continue;
      if(side===2&&c<global.COLS/2)  continue;
      if(global.map[r][c]!==global.TERRAIN.PLAIN) continue;
      if(global.units.some(u=>u.r===r&&u.c===c)) continue;
      if(global.buildings.some(b=>abs(b.r-r)+abs(b.c-c)<7)) continue;
      return {r,c};
    }
    return null;
  }
generateWorld(global.modeBeta);
}
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const abs=Math.abs,dist=(a,b)=>abs(a.r-b.r)+abs(a.c-b.c);
const copy=x=>structuredClone(x);
const matrix=(g,v)=>Array.from({length:g.rows},()=>Array(g.cols).fill(v));
const inMap=(g,r,c)=>Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&c>=0&&r<g.rows&&c<g.cols;
const unitAt=(g,r,c)=>g.units.find(u=>u.r===r&&u.c===c);
const buildingAt=(g,r,c)=>g.buildings.find(b=>b.r===r&&b.c===c);
function los(g,r0,c0,r1,c1,forestBlock=true){
 let dx=abs(c1-c0),dy=abs(r1-r0),sx=c0<c1?1:-1,sy=r0<r1?1:-1,err=dx-dy,afterForest=forestBlock?-1:null;
 while(true){
  if(g.map[r0][c0]===4&&(r0!==r1||c0!==c1))return false;
  if(afterForest!==null){if(afterForest>=0)afterForest++;if(afterForest>1)return false;if(g.map[r0][c0]===2&&(r0!==r1||c0!==c1))afterForest=0;}
  if(r0===r1&&c0===c1)break;
  const e2=err*2;if(e2>-dy){err-=dy;c0+=sx}if(e2<dx){err+=dx;r0+=sy}
 }
 return true;
}
function visibility(g,side){
 const f=matrix(g,true);
 for(const o of [...g.buildings.filter(x=>x.owner===side),...g.units.filter(x=>x.owner===side)]){
  const rad=g.map[o.r][o.c]===TERRAIN.FOREST?2:g.map[o.r][o.c]===TERRAIN.HILL?4:3;
  for(let dr=-rad;dr<=rad;dr++)for(let dc=-rad;dc<=rad;dc++){
   const r=o.r+dr,c=o.c+dc;
   if(inMap(g,r,c)&&abs(dr)+abs(dc)<=rad&&los(g,o.r,o.c,r,c))f[r][c]=false;
  }
 }
 return f;
}
function refresh(g){
 g.state.lastSeen??={1:{},2:{}};
 for(const side of [1,2]){
  const f=visibility(g,side);g.state.fog[side]=f;
  const memory=g.state.lastSeen[side]??={};
  for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++){
   if(f[r][c])continue;
   g.state.seen[side][r][c]=true;
   const key=r+','+c;
   const b=g.buildings.find(x=>x.r===r&&x.c===c);
   if(b)memory[key]={id:b.id,r,c,type:b.type,owner:b.owner,hp:b.hp,gen:b.gen};
   else delete memory[key];
  }
 }
}
// Only terrain's original random choices are seeded. A missing seed preserves
// normal gameplay; a supplied seed makes QA worlds exactly reproducible.
function seededRandom(seed){
 let x=(seed>>>0)||0x9e3779b9;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
function dimensions(size){
 if(size==='tiny')return [5,8];
 if(size==='small')return [10,15];
 if(size==='large')return [20,60];
 return [20,30];
}
export function createOriginalMatch(options={}){
 const size=['tiny','small','medium','large'].includes(options.size)?options.size:'medium',modeBeta=options.beta===true,[rows,cols]=dimensions(size);
 const seed=Number.isInteger(options.seed)&&options.seed>=0&&options.seed<=0xffffffff?options.seed:null;
 const g={schema:2,rows,cols,map:[],units:[],buildings:[],nextUnitId:1,modeBeta,seed,
   state:{currentPlayer:1,turn:0,gold:{1:5,2:5},fog:{},seen:{},lastSeen:{1:{},2:{}},grace:{1:null,2:null},log:{1:[],2:[]}},phase:'battle',winner:null,revision:1};
 for(const side of [1,2]){g.state.fog[side]=matrix(g,true);g.state.seen[side]=matrix(g,false);}
 const global={ROWS:rows,COLS:cols,BASE_ROWS,BASE_COLS,TERRAIN,TERR_COST,TERR_DEF,UNIT_TYPES,BUILD_TYPES:copy(BUILD_TYPES),modeBeta,nextUnitId:1,random:seed===null?Math.random:seededRandom(seed),
   map:g.map,units:g.units,buildings:g.buildings};
 if(modeBeta)global.BUILD_TYPES.base.spawn.push('bog');
 originalGenerator(global);
 g.nextUnitId=global.nextUnitId;
 g.buildings.forEach((building,index)=>{building.id='building-'+index;});
 refresh(g);return g;
}
function log(g,side,message){g.state.log[side].push(message);if(g.state.log[side].length>50)g.state.log[side].shift();}
function zones(g,u){
 const rem=matrix(g,-1),q=[{r:u.r,c:u.c,mp:u.mp}];rem[u.r][u.c]=u.mp;
 while(q.length){
  const p=q.shift();if(p.mp<=0)continue;
  for(const [dr,dc] of dirs){
   const r=p.r+dr,c=p.c+dc;
   if(!inMap(g,r,c)||g.units.some(other=>other.id!==u.id&&other.r===r&&other.c===c))continue;
   if(g.buildings.some(b=>b.r===r&&b.c===c&&b.owner!==u.owner&&b.hp>0))continue;
   const cost=TERR_COST[g.map[r][c]];if(cost>p.mp)continue;
   const left=p.mp-cost;if(left>rem[r][c]){rem[r][c]=left;q.push({r,c,mp:left})}
  }
 }return rem;
}
function woundBuilding(b,d=1){b.hp=Math.max(0,b.hp-d)}
function capture(g,u,b){
 if(!b||u.r!==b.r||u.c!==b.c||b.hp>0)return;
 if(b.owner!==u.owner)log(g,u.owner,'Захвачено строение.');
 b.owner=u.owner;b.hp=BUILD_TYPES[b.type].hpMax;
}
function victory(g,endedSide=null){
 if(g.state.turn===0||g.phase==='finished')return;
 for(const side of [1,2]){
  // Preserve the original definition: all zero-income military buildings.
  const bases=g.buildings.filter(b=>b.owner===side&&(b.gen??BUILD_TYPES[b.type].gen)===0).length;
  const alive=g.units.filter(u=>u.owner===side).length;
  if(!bases&&!alive){g.phase='finished';g.winner=3-side;return;}
  if(!bases){
   if(g.state.grace[side]===null)g.state.grace[side]=5;
   else if(endedSide===side&&--g.state.grace[side]<=0){
    g.phase='finished';g.winner=3-side;return;
   }
  }else g.state.grace[side]=null;
 }
}

export function originalAction(source,side,action){
 const failure=msg=>({state:source,error:msg});
 if(!source||source.schema!==2||source.phase!=='battle')return failure('Партия закончена.');
 if(source.state.currentPlayer!==side)return failure('Ход другого полководца.');
 if(!action||typeof action!=='object')return failure('Неизвестный приказ.');
 const g=copy(source),p=g.state.currentPlayer;
 const u=g.units.find(x=>x.id===action.unit);
 const ok=inMap(g,action.r,action.c);
 const target=ok?unitAt(g,action.r,action.c):null;
 const targetBuilding=ok?buildingAt(g,action.r,action.c):null;
 if(action.type==='end'){
   for(const x of g.units.filter(x=>x.owner===p))if(x.mp===UNIT_TYPES[x.type].move)x.hp=Math.min(UNIT_TYPES[x.type].hpMax,x.hp+1);
   g.state.turn++;g.state.currentPlayer=3-p;
   const next=g.state.currentPlayer;
   g.state.gold[next]+=g.buildings.filter(b=>b.owner===next).reduce((sum,b)=>sum+(b.gen??BUILD_TYPES[b.type].gen),0);
   for(const x of g.units.filter(x=>x.owner===next)){x.mp=UNIT_TYPES[x.type].move;x.startR=x.r;x.startC=x.c;}
   log(g,next,'Начало хода '+(g.state.turn+1));
 }else if(action.type==='move'){
   if(!u||u.owner!==p||u.mp<=0||!ok||u.r===action.r&&u.c===action.c)return failure('Отряд не может переместиться.');
   const rem=zones(g,u);
   if(rem[action.r][action.c]<0||target&&target.id!==u.id)return failure('Клетка недоступна.');
   const from=u.r+','+u.c;u.mp=rem[action.r][action.c];
   if(targetBuilding&&targetBuilding.owner!==p)woundBuilding(targetBuilding);
   u.r=action.r;u.c=action.c;capture(g,u,targetBuilding);
   log(g,p,'Переход '+from+' → '+u.r+','+u.c);
 }else if(action.type==='attack'){
   if(!u||u.owner!==p||u.mp<=0||u.type==='mage'||!ok)return failure('Атака невозможна.');
   const enemy=target&&target.owner!==p?target:null;
   const building=!enemy&&targetBuilding&&targetBuilding.owner!==p?targetBuilding:null;
   if(!enemy&&!building)return failure('Вражеская цель не найдена.');
   if(dist(u,action)>UNIT_TYPES[u.type].range||!los(g,u.r,u.c,action.r,action.c,false)||visibility(g,p)[action.r][action.c])return failure('Цель вне видимости.');
   if(g.map[u.r][u.c]===TERRAIN.WATER)return failure('Из воды нельзя атаковать.');
   let atk=UNIT_TYPES[u.type].atk;
   if(enemy){
     const defBuilding=buildingAt(g,enemy.r,enemy.c);
     if(u.type==='cavalry'&&(BUILD_TYPES[defBuilding?.type]?.def||0)>0)atk--;
     const damage=Math.max(1,atk-UNIT_TYPES[enemy.type].def-TERR_DEF[g.map[enemy.r][enemy.c]]);
     if(enemy.type!=='bog')enemy.hp-=damage;
     let ret=0;
     if(UNIT_TYPES[u.type].range===1&&enemy.hp>0){
       ret=Math.max(1,UNIT_TYPES[enemy.type].atk-UNIT_TYPES[u.type].def-TERR_DEF[g.map[u.r][u.c]]);
       if(u.type!=='bog')u.hp-=ret;
     }
     if(enemy.hp<=0&&enemy.type!=='bog')g.units=g.units.filter(x=>x.id!==enemy.id);
     if(u.hp<=0&&u.type!=='bog')g.units=g.units.filter(x=>x.id!==u.id);
     if(enemy.hp<=0&&UNIT_TYPES[u.type].range===1&&g.units.some(x=>x.id===u.id)){
       u.r=enemy.r;u.c=enemy.c;
       const b=buildingAt(g,u.r,u.c);if(b&&b.owner!==p)woundBuilding(b);
       capture(g,u,b);
     }
     log(g,p,'Урон '+damage+(ret?', ответный удар '+ret:''));
   }else{
     if(u.type==='cavalry'&&BUILD_TYPES[building.type].def>0)atk--;
     const damage=Math.max(1,atk-BUILD_TYPES[building.type].def-TERR_DEF[g.map[building.r][building.c]]);
     woundBuilding(building,damage);
     if(building.hp<=0&&dist(u,building)===1){u.r=building.r;u.c=building.c;capture(g,u,building);}
     log(g,p,'Урон строению '+damage);
   }
   u.mp=0;
 }else if(action.type==='heal'){
   if(!u||u.owner!==p||u.type!=='mage'||u.mp<=0||!target||target.owner!==p||dist(u,target)>1||target.hp>=UNIT_TYPES[target.type].hpMax)return failure('Цель не нуждается в лечении.');
   target.hp=Math.min(UNIT_TYPES[target.type].hpMax,target.hp+2);u.mp=0;log(g,p,'Отряд исцелён.');
 }else if(action.type==='spawn'){
   const b=g.buildings.find(b=>b.id===action.building),info=UNIT_TYPES[action.unitType];
   if(!b||b.owner!==p||!info||!BUILD_TYPES[b.type]?.spawn.includes(action.unitType)||action.unitType==='bog'&&!g.modeBeta)return failure('Нельзя нанять такой отряд.');
   if(g.state.gold[p]<info.cost)return failure('Недостаточно золота.');
   if(!ok||dist(b,action)!==1||g.map[action.r][action.c]===TERRAIN.MOUNTAIN||target)return failure('Место для отряда недоступно.');
   if(g.units.length>=140)return failure('Армия слишком велика.');
   g.state.gold[p]-=info.cost;g.units.push({id:g.nextUnitId++,r:action.r,c:action.c,owner:p,type:action.unitType,hp:info.hpMax,mp:0,startR:action.r,startC:action.c});
   log(g,p,'Отряд нанят.');
 }else return failure('Неизвестный приказ.');
 g.revision++;refresh(g);victory(g,action.type==='end'?p:null);return {state:g,error:null};
}
function privateView(g,side){
 const v=copy(g),fog=g.state.fog[side],seen=g.state.seen[side];
 v.map=g.map.map((row,r)=>row.map((t,c)=>seen[r][c]?t:0));
 v.units=g.units.filter(u=>u.owner===side||!fog[u.r][u.c]).map(copy);
 const memory=g.state.lastSeen?.[side]||{};
 v.buildings=g.buildings.filter(b=>b.owner===side||!fog[b.r][b.c]).map(copy);
 for(const remembered of Object.values(memory)){
  if(fog[remembered.r]?.[remembered.c]&&seen[remembered.r]?.[remembered.c]&&
     !v.buildings.some(b=>b.r===remembered.r&&b.c===remembered.c)){
   v.buildings.push({...remembered,lastSeen:true});
  }
 }
 v.state={...g.state,gold:{[side]:g.state.gold[side]},fog:{[side]:fog},seen:{[side]:seen},lastSeen:{[side]:copy(memory)},log:{[side]:g.state.log[side]},grace:{[side]:g.state.grace[side]}};
 // Never disclose a seeded map's reconstruction key while fog is active.
 delete v.seed;
 v.nextUnitId=0;return v;
}
const stateEvent=()=>[{type:'state',payload:null}];
const notice=(id,msg,requestId)=>[{type:'notice',to:id,payload:msg,...(requestId?{requestId}:{})}];
const receipt=(id,requestId,revision,status='applied')=>requestId?
 {type:'ack',to:id,requestId,revision,status}:null;
const validRequestId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(id);
// Store only a bounded window of accepted command IDs: old duplicates may
// never execute again because each command also carries the original revision.
const alreadyApplied=(s,id,key)=>Array.isArray(s.commandHistory)&&
 s.commandHistory.some(x=>x.player===id&&x.requestId===key);
const remember=(s,id,key)=>{
 if(!key)return;
 s.commandHistory??=[];
 s.commandHistory.push({player:id,requestId:key});
 if(s.commandHistory.length>64)s.commandHistory.splice(0,s.commandHistory.length-64);
};
const seat=(s,id)=>s.seats.findIndex(p=>p.id===id)+1;
const module={
 protocolVersion:1,
 createRoom({player}){return {state:{phase:'lobby',host:player.id,seats:[player],game:null,revision:1,commandHistory:[]}};},
 onJoin({state,player,players}){
   if(players.length>2)throw Error('room_full');
   if(state.phase!=='lobby'&&!state.seats.some(p=>p.id===player.id))throw Error('match_in_progress');
   if(!state.seats.some(p=>p.id===player.id))state.seats.push(player);
   state.revision++;return {state,events:stateEvent()};
 },
 onLeave({state,player}){
   const side=seat(state,player.id);
   if(side===0)return {state,events:stateEvent()};
   if(state.phase==='battle'&&state.game){
     // A deliberate departure is a forfeit; a socket disconnect never
     // invokes onLeave and must keep both seats resumable.
     state.game.phase='finished';state.game.winner=3-side;state.phase='finished';
   }
   if(state.phase==='lobby'){
     state.seats=state.seats.filter(p=>p.id!==player.id);
     if(state.host===player.id)state.host=state.seats[0]?.id??null;
     if(!state.seats.length)state.phase='closed';
   }
   state.revision++;return {state,events:stateEvent()};
 },
 viewForPlayer({state,player}){
   const side=seat(state,player.id);
   return {phase:state.phase,host:state.host,viewerId:player.id,seats:state.seats,side,revision:state.revision,game:state.game&&side?privateView(state.game,side):null};
 },
 onMessage({state,player,players,payload}){
   const action=payload&&typeof payload==='object'?payload:{},side=seat(state,player.id);
   if(!side)return {state,events:notice(player.id,'Нет места в комнате.')};
   if(action.type==='sync')return {state,events:[{type:'state',to:player.id,payload:null}]};
   const requestId=action.requestId;
   if(requestId!==undefined&&!validRequestId(requestId))
     return {state,events:notice(player.id,'Некорректный ID приказа.')};
   if(requestId&&alreadyApplied(state,player.id,requestId)){
     // Full private state lets a reconnecting client reconcile a lost receipt.
     return {state,events:[{type:'state',to:player.id,payload:null},
       receipt(player.id,requestId,state.game?.revision??state.revision,'duplicate')]};
   }
   if(action.type==='start'){
     if(state.phase!=='lobby'||state.host!==player.id||state.seats.length!==2||players.length!==2)return {state,events:notice(player.id,'Ожидается второй полководец.')};
     state.game=createOriginalMatch({size:action.size,beta:action.beta});
     state.phase='battle';state.revision++;
     remember(state,player.id,requestId);
     return {state,events:[...stateEvent(),...(requestId?[receipt(player.id,requestId,state.game.revision)]:[])]};
   }
   if(action.type==='act'){
     if(state.phase!=='battle'||!state.game)return {state,events:notice(player.id,'Нет активной партии.',requestId)};
     if(action.revision!==state.game.revision)
       return {state,events:[...notice(player.id,'Устаревший приказ.',requestId),
         {type:'state',to:player.id,payload:null}]};
     const result=originalAction(state.game,side,action.action);
     if(result.error)return {state,events:notice(player.id,result.error,requestId)};
     state.game=result.state;state.phase=result.state.phase;state.revision++;
     remember(state,player.id,requestId);
     return {state,events:[...stateEvent(),...(requestId?[receipt(player.id,requestId,state.game.revision)]:[])]};
   }
   if(action.type==='resign'){
     if(state.phase!=='battle')return {state,events:notice(player.id,'Нет активной партии.')};
     state.game.phase='finished';state.game.winner=3-side;state.phase='finished';state.revision++;
     remember(state,player.id,requestId);
     return {state,events:[...stateEvent(),...(requestId?[receipt(player.id,requestId,state.game.revision)]:[])]};
   }
   return {state,events:notice(player.id,'Неизвестная команда.')};
 }
};
export default module;
