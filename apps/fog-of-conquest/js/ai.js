// js/ai.js
(function(global){
  const UNIT_VALUE = {
    swordsman:10,
    archer:12,
    heavy:16,
    cavalry:14,
    mage:20,
    bog:0
  };
  const BUILD_VALUE = {
    base:50,
    barracks:20,
    stable:20,
    mageTower:20,
    mill:10,
    fort:30
  };

  function aStar(unit, target){
    const {map, TERRAIN, TERR_COST, units} = global;
    if(!map) return null;
    const ROWS = map.length, COLS = map[0].length;
    const passCosts = TERR_COST.filter(c=>c<999);
    const avgMove = passCosts.reduce((a,b)=>a+b,0)/passCosts.length;
    class PriorityQueue{
      constructor(compare){ this.compare=compare; this.data=[]; }
      push(item){ this.data.push(item); this._up(this.data.length-1); }
      _up(i){ const d=this.data,c=this.compare; while(i>0){ const p=(i-1)>>1; if(c(d[i],d[p])>=0) break; [d[i],d[p]]=[d[p],d[i]]; i=p; } }
      pop(){ const d=this.data,c=this.compare;if(!d.length) return undefined; const top=d[0]; const last=d.pop(); if(d.length){ d[0]=last; this._down(0); } return top; }
      _down(i){ const d=this.data,c=this.compare; const l=d.length; while(true){ let left=i*2+1,right=left+1,small=i; if(left<l&&c(d[left],d[small])<0) small=left; if(right<l&&c(d[right],d[small])<0) small=right; if(small===i) break; [d[i],d[small]]=[d[small],d[i]]; i=small; } }
      isEmpty(){ return this.data.length===0; }
    }
    const open = new PriorityQueue((a,b)=>a.f-b.f);
    const openMap = new Map();
    const closed = new Set();
    const key = (r,c) => r+","+c;
    const startNode = {r:unit.r, c:unit.c, g:0, f:0, prev:null};
    open.push(startNode);
    openMap.set(key(unit.r,unit.c), startNode);
    while(!open.isEmpty()){
      const cur = open.pop();
      const k = key(cur.r,cur.c);
      if(openMap.get(k)!==cur) continue;
      openMap.delete(k);
      if(closed.has(k)) continue;
      if(cur.r===target.r && cur.c===target.c){
        const path=[];
        let n=cur;
        while(n){ path.push({r:n.r,c:n.c}); n=n.prev; }
        path.reverse();
        return {path,cost:cur.g};
      }
      closed.add(k);
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
        const rr=cur.r+dr, cc=cur.c+dc;
        if(rr<0||rr>=ROWS||cc<0||cc>=COLS) return;
        if(map[rr][cc]===TERRAIN.MOUNTAIN) return;
        if(units.some(us=>us!==unit && us.r===rr && us.c===cc)) return;
        const g=cur.g+TERR_COST[map[rr][cc]];
        const h=(Math.abs(target.r-rr)+Math.abs(target.c-cc))*avgMove;
        const nodeKey = key(rr,cc);
        const existing=openMap.get(nodeKey);
        if(!existing || g<existing.g){
          const node={r:rr,c:cc,g,f:g+h,prev:cur};
          open.push(node);
          openMap.set(nodeKey,node);
        }
      });
    }
    return null;
  }
  function computeDistanceMap(targets){
    const map = global.map;
    const TERRAIN = global.TERRAIN;
    const TERR_COST = global.TERR_COST;
    if(!map) return [];
    const ROWS = map.length, COLS = map[0].length;
    const dist=Array.from({length:ROWS},()=>Array(COLS).fill(Infinity));
    class PriorityQueue{
      constructor(compare){ this.compare=compare; this.data=[]; }
      push(item){ this.data.push(item); this._up(this.data.length-1); }
      _up(i){ const d=this.data,c=this.compare; while(i>0){ const p=(i-1)>>1; if(c(d[i],d[p])>=0) break; [d[i],d[p]]=[d[p],d[i]]; i=p; } }
      pop(){ const d=this.data,c=this.compare;if(!d.length) return undefined; const top=d[0]; const last=d.pop(); if(d.length){ d[0]=last; this._down(0); } return top; }
      _down(i){ const d=this.data,c=this.compare; const l=d.length; while(true){ let left=i*2+1,right=left+1,small=i; if(left<l&&c(d[left],d[small])<0) small=left; if(right<l&&c(d[right],d[small])<0) small=right; if(small===i) break; [d[i],d[small]]=[d[small],d[i]]; i=small; } }
      isEmpty(){ return this.data.length===0; }
    }
    const q=new PriorityQueue((a,b)=>a.d-b.d);
    targets.forEach(t=>{ dist[t.r][t.c]=0; q.push({r:t.r,c:t.c,d:0}); });
    while(!q.isEmpty()){
      const o=q.pop();
      if(o.d!==dist[o.r][o.c]) continue;
      const d=dist[o.r][o.c];
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
        const rr=o.r+dr, cc=o.c+dc;
        if(rr<0||rr>=ROWS||cc<0||cc>=COLS) return;
        if(map[rr][cc]===TERRAIN.MOUNTAIN) return;
        const nd=d+TERR_COST[map[rr][cc]];
        if(nd<dist[rr][cc]){ dist[rr][cc]=nd; q.push({r:rr,c:cc,d:nd}); }
      });
    }
    return dist;
  }

  function aiTakeTurn(){
    const {state, units, buildings, BUILD_TYPES, UNIT_TYPES, map, TERRAIN, TERR_DEF, aiLevel} = global;
    if(!map) return;
    const ROWS = map.length, COLS = map[0].length;
    const p=2,
          F=state.fog[p];
    const enemyUnits=units.filter(u=>u.owner===1 && !F[u.r][u.c]);
    const captureBuildings=buildings.filter(b=>b.owner!==p && !F[b.r][b.c]);
    const enemyBuildings=captureBuildings.filter(b=>b.owner===1);
    const enemyBases=enemyBuildings.filter(b=>BUILD_TYPES[b.type].gen===0);
    const baseDist=enemyBases.length?computeDistanceMap(enemyBases):null;
    const captureDist=captureBuildings.length?computeDistanceMap(captureBuildings):null;
    const unitDist=enemyUnits.length?computeDistanceMap(enemyUnits):null;
    const allEnemies=[...enemyUnits,...enemyBuildings];
    const allDist=allEnemies.length?computeDistanceMap(allEnemies):null;
    const unseenCells=[];
    if(state.seen&&state.seen[p]){
      for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
        if(!state.seen[p][r][c]) unseenCells.push({r,c});
      }
    }
    const exploreDist=unseenCells.length?computeDistanceMap(unseenCells):null;
    const enemyCounts={};
    enemyUnits.forEach(u=>enemyCounts[u.type]=(enemyCounts[u.type]||0)+1);
    buildings.filter(b=>b.owner===p && BUILD_TYPES[b.type].spawn.length).forEach(b=>{
      const avail=BUILD_TYPES[b.type].spawn.filter(t=>UNIT_TYPES[t].cost<=state.gold[p]);
      const zones=[{r:b.r-1,c:b.c},{r:b.r+1,c:b.c},{r:b.r,c:b.c-1},{r:b.r,c:b.c+1}]
        .filter(z=>z.r>=0&&z.r<ROWS&&z.c>=0&&z.c<COLS&&
               map[z.r][z.c]!==TERRAIN.MOUNTAIN&&
               !units.find(u=>u.r===z.r&&u.c===z.c));
      if(avail.length&&zones.length){
        let best=null,bestScore=-Infinity;
        avail.forEach(t=>{
          const info=UNIT_TYPES[t];
          const base=info.atk+info.def+info.range;
          const goldFactor=state.gold[p]/info.cost;
          const compFactor=(enemyCounts[t]||0)*2;
          const levelFactor = 1 + Math.max(0,aiLevel-2)*0.5;
          const score=base+goldFactor+compFactor+ (UNIT_VALUE[t]||0)*0.1*levelFactor;
          if(score>bestScore){ bestScore=score; best=t; }
        });
        const type=best;
        const z=zones[Math.random()*zones.length|0];
        units.push({id:global.nextUnitId++,r:z.r,c:z.c,owner:p,type,hp:UNIT_TYPES[type].hpMax,mp:0,startR:z.r,startC:z.c});
        state.gold[p]-=UNIT_TYPES[type].cost;
        global.addReplay && global.addReplay({type:'spawn',unit:units[units.length-1]});
        global.recordEvent && global.recordEvent(`Создан ${global.UNIT_LABELS[type]}`);
      }
    });

    units.filter(u=>u.owner===p).forEach(u=>{
      while(u.mp>0){
        const enemy=units.find(t=>t.owner===1 && !F[t.r][t.c] &&
          Math.abs(t.r-u.r)+Math.abs(t.c-u.c)<=UNIT_TYPES[u.type].range &&
          global.hasLOS(u.r,u.c,t.r,t.c,{forestBlock:false}));
        if(enemy){
          if(map[u.r][u.c]!==TERRAIN.WATER){
            const res=global.doAttack(u,enemy);
            global.addReplay && global.addReplay({type:'attack',target:enemy});
            global.recordEvent && global.recordEvent(`${global.UNIT_LABELS[u.type]} атаковал ${global.UNIT_LABELS[enemy.type]}`);
            if(res.killed && UNIT_TYPES[u.type].range===1){
              global.addReplay && global.addReplay({type:'move',unit:u,from:{r:u.r,c:u.c},to:{r:enemy.r,c:enemy.c}});
              u.r=enemy.r; u.c=enemy.c;
              let bb=buildings.find(b=>b.r===u.r&&b.c===u.c&&b.owner!==p);
              if(bb){
                global.damageBuilding && global.damageBuilding(bb);
              }
              bb=buildings.find(b=>b.r===u.r&&b.c===u.c);
              if(bb) global.attemptCapture && global.attemptCapture(u, bb);
            }
          }
          u.mp=0;
          break;
        }
        const cz=global.computeZone(u);
        if(!cz.list.length) break;
        let target=null;
        if(aiLevel<=1){
          target=cz.list[Math.random()*cz.list.length|0];
        }else if(aiLevel===2){
          if(allDist){
            target=cz.list.sort((a,b)=>allDist[a.r][a.c]-allDist[b.r][b.c])[0];
          } else if(captureDist){
            target=cz.list.sort((a,b)=>captureDist[a.r][a.c]-captureDist[b.r][b.c])[0];
          } else if(exploreDist){
            target=cz.list.sort((a,b)=>exploreDist[a.r][a.c]-exploreDist[b.r][b.c])[0];
          } else target=cz.list[Math.random()*cz.list.length|0];
        }else{
          let best=null,bestScore=-Infinity;
          cz.list.forEach(pos=>{
            let score=0;
            const br=baseDist?baseDist[pos.r][pos.c]:null,
                  bd=captureDist?captureDist[pos.r][pos.c]:null,
                  ud=unitDist?unitDist[pos.r][pos.c]:null;
            let bw,blw,uw;
            if(aiLevel>=6){
              bw=7; blw=5; uw=6;
            }else if(aiLevel>=5){
              bw=6; blw=4; uw=5;
            }else if(aiLevel===4){
              bw=5; blw=3; uw=4;
            }else if(aiLevel===3){
              bw=4; blw=1; uw=2;
            }else{
              bw=3; blw=1; uw=2;
            }
            if(baseDist) score-= (br||100)*bw;
            if(captureDist) score-= (bd||100)*blw;
            if(unitDist) score-= (ud||100)*uw;

            const terrainBonus=(TERR_DEF?TERR_DEF[map[pos.r][pos.c]]:0);
            score+=terrainBonus;

            const bld=buildings.find(b=>b.r===pos.r&&b.c===pos.c);
            if(bld){
              if(bld.owner!==p){
                let val=BUILD_VALUE[bld.type]||20;
                if(bld.owner===1 && BUILD_TYPES[bld.type].gen===0) val*=2;
                if(aiLevel>=3) val*=1.2;
                score+=val;
              }else{
                score+= (BUILD_TYPES[bld.type].def||0)*2;
              }
            }

            enemyUnits.forEach(e=>{
              const dist=Math.abs(e.r-pos.r)+Math.abs(e.c-pos.c);
              if(dist<=UNIT_TYPES[u.type].range &&
                 global.hasLOS(pos.r,pos.c,e.r,e.c,{forestBlock:false})){
                   let atk=UNIT_TYPES[u.type].atk;
                   if(u.type==='cavalry'){
                     let cellDef=(BUILD_TYPES[(buildings.find(b=>b.r===e.r&&b.c===e.c&&b.owner===e.owner)||{}).type]?.def)||0;
                     if(cellDef>0) atk--;
                   }
                   const defV=UNIT_TYPES[e.type].def+(TERR_DEF?TERR_DEF[map[e.r][e.c]]:0);
                   let dmg=Math.max(1,atk-defV);
                   score+=dmg;
                   if(dmg>=e.hp) score+= (UNIT_VALUE[e.type]||0)*(aiLevel>=4?2:1);
              }
            });

            let risk=0;
            enemyUnits.forEach(e=>{
              const dist=Math.abs(e.r-pos.r)+Math.abs(e.c-pos.c);
              if(dist<=UNIT_TYPES[e.type].range &&
                 global.hasLOS(e.r,e.c,pos.r,pos.c,{forestBlock:false})){
                   let atk=UNIT_TYPES[e.type].atk;
                   if(e.type==='cavalry'){
                     let cellDef=(BUILD_TYPES[(buildings.find(b=>b.r===pos.r&&b.c===pos.c&&b.owner===p)||{}).type]?.def)||0;
                     if(cellDef>0) atk--;
                   }
                   const defV=UNIT_TYPES[u.type].def+(TERR_DEF?TERR_DEF[map[pos.r][pos.c]]:0);
                   let dmg=Math.max(1,atk-defV);
                   risk+=dmg;
              }
            });
            if(risk>=u.hp) risk+= (UNIT_VALUE[u.type]||UNIT_TYPES[u.type].cost||0);
            score-=risk;
            if(exploreDist){
              score-= (exploreDist[pos.r][pos.c]||100)*0.5;
            }

            if(aiLevel>=4 && u.hp<=UNIT_TYPES[u.type].hpMax/2){
              let distAway=allDist?allDist[pos.r][pos.c]:0;
              score+=distAway*2;
            }

            if(baseDist && br!==null && br<=UNIT_TYPES[u.type].move*5){
              score+=10;
            }
            if(score>bestScore){ bestScore=score; best=pos; }
          });
          if(aiLevel===3 && Math.random()<0.3){
            target=cz.list[Math.random()*cz.list.length|0];
          }else{
            target=best||cz.list[0];
          }
        }
        if(target){
          const pathInfo=aStar(u,target);
          let moveCost=0;
          if(pathInfo){
            moveCost=pathInfo.cost;
            const last=pathInfo.path[pathInfo.path.length-1];
            target={r:last.r,c:last.c};
          }else moveCost=u.mp;
          u.mp-=moveCost;
          let bb=buildings.find(b=>b.r===target.r&&b.c===target.c&&b.owner!==p);
          if(bb){
            global.damageBuilding && global.damageBuilding(bb);
          }
          global.addReplay && global.addReplay({type:'move',unit:u,from:{r:u.r,c:u.c},to:{r:target.r,c:target.c}});
          global.recordEvent && global.recordEvent(`${global.UNIT_LABELS[u.type]} переместился`);
          u.r=target.r; u.c=target.c;
          bb = buildings.find(b=>b.r===u.r && b.c===u.c);
          if(bb) global.attemptCapture && global.attemptCapture(u, bb);
        } else break;
      }
    });

    global.updateFog();
    global.nextTurn();
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = { aiTakeTurn, computeDistanceMap };
  }
  if(global){
    global.aiTakeTurn = aiTakeTurn;
    global.computeDistanceMap = computeDistanceMap;
  }
})(typeof window !== 'undefined' ? window : global);
