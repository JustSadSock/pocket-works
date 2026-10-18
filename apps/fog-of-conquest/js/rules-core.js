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
  return Object.freeze({reach,unitDamage,buildingDamage,advanceTurn,evaluateVictory});
})();
  root.FogRuleKernel=FogRuleKernel;
})(typeof window!=='undefined'?window:globalThis);
