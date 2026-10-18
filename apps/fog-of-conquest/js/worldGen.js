(function(global){
  'use strict';
  const abs = Math.abs;
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
      global.units.push({id:global.nextUnitId++,r:5,c:5,owner:1,type:'bog',
        hp:global.UNIT_TYPES.bog.hpMax,
        mp:global.UNIT_TYPES.bog.move,startR:5,startC:5});
      global.units.push({id:global.nextUnitId++,r:global.ROWS-6,c:global.COLS-6,
        owner:2,type:'bog',hp:global.UNIT_TYPES.bog.hpMax,
        mp:global.UNIT_TYPES.bog.move,startR:global.ROWS-6,startC:global.COLS-6});
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
      let r=1,c=1; while(r<global.ROWS-1&&c<global.COLS-1){
        global.map[r][c]=global.TERRAIN.PLAIN; r++; c++; }
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
          const r=Math.random()*global.ROWS|0, c=Math.random()*global.COLS|0;
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
      let r=2+Math.random()*(global.ROWS-4)|0,
          c=2+Math.random()*(global.COLS-4)|0;
      if(side===1&&c>=global.COLS/2) continue;
      if(side===2&&c<global.COLS/2)  continue;
      if(global.map[r][c]!==global.TERRAIN.PLAIN) continue;
      if(global.units.some(u=>u.r===r&&u.c===c)) continue;
      if(global.buildings.some(b=>abs(b.r-r)+abs(b.c-c)<7)) continue;
      return {r,c};
    }
    return null;
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = {
      generateWorld,
      freeCell
    };
  }
  if(global){
    global.generateWorld = generateWorld;
    global.freeCell = freeCell;
  }
})(typeof window !== 'undefined' ? window : global);
