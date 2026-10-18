/* PocketWorks original-rules kernel. The exact block from "const FogRuleKernel="
   to "})();" is embedded in each immutable PocketNet module.
   A parity test enforces byte-for-byte equality with the current source. */
(function(root){
const FogRuleKernel=(function(){
  'use strict';
  // Pure-ish rules use an explicit battlefield context, never DOM or PocketNet.
  const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
  function reach(map,units,buildings,unit,costs){
    const rows=map.length,cols=map[0].length;
    const rem=Array.from({length:rows},()=>Array(cols).fill(-1));
    if(!unit||unit.r<0||unit.r>=rows||unit.c<0||unit.c>=cols)return rem;
    const queue=[{r:unit.r,c:unit.c,mp:unit.mp}];rem[unit.r][unit.c]=unit.mp;
    for(let i=0;i<queue.length;i++){
      const p=queue[i];if(p.mp<=0)continue;
      for(const [dr,dc] of DIRECTIONS){
        const r=p.r+dr,c=p.c+dc;
        if(r<0||r>=rows||c<0||c>=cols)continue;
        if(units.some(other=>other.id!==unit.id&&other.r===r&&other.c===c))continue;
        if(buildings.some(b=>b.r===r&&b.c===c&&b.owner!==unit.owner&&b.hp>0))continue;
        const cost=costs[map[r][c]];
        if(!Number.isFinite(cost)||cost>p.mp)continue;
        const left=p.mp-cost;
        if(left>rem[r][c]){rem[r][c]=left;queue.push({r,c,mp:left});}
      }
    }
    return rem;
  }
  function unitDamage(att,def,map,buildings,unitTypes,buildingTypes,terrainDefense){
    if(att.type==='mage')return {damage:0,retaliation:0};
    const attacker=unitTypes[att.type],target=unitTypes[def.type];
    let atk=attacker.atk;
    const supporting=buildings.find(b=>b.r===def.r&&b.c===def.c&&b.owner===def.owner);
    if(att.type==='cavalry'&&(buildingTypes[supporting?.type]?.def||0)>0)atk--;
    const damage=Math.max(1,atk-target.def-terrainDefense[map[def.r][def.c]]);
    const targetSurvives=def.type==='bog'||def.hp-damage>0;
    const retaliation=attacker.range===1&&targetSurvives?
      Math.max(1,target.atk-attacker.def-terrainDefense[map[att.r][att.c]]):0;
    return {damage,retaliation};
  }
  function buildingDamage(att,b,map,unitTypes,buildingTypes,terrainDefense){
    if(att.type==='mage')return 0;
    const info=unitTypes[att.type],type=buildingTypes[b.type];
    const attack=info.atk-(att.type==='cavalry'&&type.def>0?1:0);
    return Math.max(1,attack-type.def-terrainDefense[map[b.r][b.c]]);
  }
  function advanceTurn(state,units,buildings,unitTypes,buildingTypes){
    const prev=state.currentPlayer;
    for(const u of units)if(u.owner===prev&&u.mp===unitTypes[u.type].move)
      u.hp=Math.min(unitTypes[u.type].hpMax,u.hp+1);
    state.turn++;
    state.currentPlayer=3-prev;
    const next=state.currentPlayer;
    state.gold[next]+=buildings.filter(b=>b.owner===next)
      .reduce((sum,b)=>sum+(b.gen??buildingTypes[b.type].gen),0);
    for(const u of units)if(u.owner===next){
      u.mp=unitTypes[u.type].move;u.startR=u.r;u.startC=u.c;
    }
    return prev;
  }
  function evaluateVictory(state,units,buildings,buildingTypes,endedSide=null){
    if(state.turn===0)return null;
    for(const side of [1,2]){
      const bases=buildings.filter(b=>b.owner===side&&(b.gen??buildingTypes[b.type].gen)===0).length;
      const alive=units.filter(u=>u.owner===side).length;
      if(!bases&&!alive)return 3-side;
      if(!bases){
        if(state.grace[side]===null)state.grace[side]=5;
        else if(endedSide===side&&--state.grace[side]<=0)return 3-side;
      }else state.grace[side]=null;
    }
    return null;
  }
  const manhattan=(a,b)=>Math.abs(a.r-b.r)+Math.abs(a.c-b.c);
  function canHeal(caster,target,side,unitTypes){
    return !!caster&&!!target&&caster.owner===side&&target.owner===side&&
      caster.type==='mage'&&caster.mp>0&&manhattan(caster,target)<=1&&
      target.hp<unitTypes[target.type].hpMax;
  }
  function canSpawn(map,units,buildings,state,building,unitType,point,unitTypes,buildTypes,beta){
    const info=unitTypes[unitType];
    const allowed=buildTypes[building?.type]?.spawn.includes(unitType)||
      (beta&&unitType==='bog'&&building?.type==='base');
    if(!building||!point||!info||building.owner!==state.currentPlayer||
      !allowed||(unitType==='bog'&&!beta))return false;
    if(!Number.isInteger(point.r)||!Number.isInteger(point.c)||
      point.r<0||point.r>=map.length||point.c<0||point.c>=map[0].length||
      manhattan(building,point)!==1||map[point.r][point.c]===4)return false;
    return units.length<140&&state.gold[state.currentPlayer]>=info.cost&&
      !units.some(u=>u.r===point.r&&u.c===point.c);
  }
  function capture(unit,building,buildTypes){
    if(!unit||!building||unit.r!==building.r||unit.c!==building.c||
      building.hp>0)return {valid:false,captured:false};
    const captured=building.owner!==unit.owner;
    building.owner=unit.owner;
    building.hp=buildTypes[building.type].hpMax;
    return {valid:true,captured};
  }
  function lineOfSight(map,r0,c0,r1,c1,forestBlock=true){
    if(!map.length||r0<0||c0<0||r1<0||c1<0||
      r0>=map.length||r1>=map.length||
      c0>=map[0].length||c1>=map[0].length)return false;
    let dx=Math.abs(c1-c0),dy=Math.abs(r1-r0),
        sx=c0<c1?1:-1,sy=r0<r1?1:-1,err=dx-dy,
        afterForest=forestBlock?-1:null;
    while(true){
      if(map[r0][c0]===4&&(r0!==r1||c0!==c1))return false;
      if(afterForest!==null){
        if(afterForest>=0)afterForest++;
        if(afterForest>1)return false;
        if(map[r0][c0]===2&&(r0!==r1||c0!==c1))afterForest=0;
      }
      if(r0===r1&&c0===c1)break;
      const e2=err*2;
      if(e2>-dy){err-=dy;c0+=sx;}
      if(e2<dx){err+=dx;r0+=sy;}
    }
    return true;
  }
  function fogForSide(map,units,buildings,side){
    if(!Array.isArray(map)||!map.length||!Array.isArray(map[0])||!map[0].length)
      return [];
    const rows=map.length,cols=map[0].length;
    const f=Array.from({length:rows},()=>Array(cols).fill(true));
    for(const o of [...buildings.filter(x=>x.owner===side),...units.filter(x=>x.owner===side)]){
      if(o.r<0||o.r>=rows||o.c<0||o.c>=cols)continue;
      const rad=map[o.r][o.c]===2?2:map[o.r][o.c]===3?4:3;
      for(let dr=-rad;dr<=rad;dr++)for(let dc=-rad;dc<=rad;dc++){
        const r=o.r+dr,c=o.c+dc;
        if(r>=0&&r<rows&&c>=0&&c<cols&&Math.abs(dr)+Math.abs(dc)<=rad&&
          lineOfSight(map,o.r,o.c,r,c,true))f[r][c]=false;
      }
    }
    return f;
  }
  return Object.freeze({reach,unitDamage,buildingDamage,advanceTurn,evaluateVictory,
    canHeal,canSpawn,capture,lineOfSight,fogForSide});
})();
  root.FogRuleKernel=FogRuleKernel;
})(typeof window!=='undefined'?window:globalThis);
