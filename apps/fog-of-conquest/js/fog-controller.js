/* Fog of Conquest: local fog and last-seen memory.
 * Keep the battlefield authoritative, snapshots immutable and UI presentation separate.
 * No browser dependencies: headless AI QA uses this exact module.
 */
(function(root){
  'use strict';
  function project({map,units,buildings,state,side,modeBeta=false,revealAll=false,online=false,kernel}){
    if(online)return false; // Never recalculate server-projected secrets.
    if(!Array.isArray(map)||!map.length||!Array.isArray(map[0])||!map[0].length)return false;
    const fog=state.fog?.[side],seen=state.seen?.[side];
    if(!fog||!seen)return false;
    if(!modeBeta&&!revealAll){
      const next=kernel.fogForSide(map,units,buildings,side);
      for(let r=0;r<map.length;r++)for(let c=0;c<map[r].length;c++){
        fog[r][c]=next[r][c];
        if(!next[r][c])seen[r][c]=true;
      }
    }
    state.lastSeen??={1:{},2:{}};
    const memory=state.lastSeen[side]??={};
    const locations=new Map(buildings.map(b=>[b.r+','+b.c,b]));
    for(let r=0;r<map.length;r++)for(let c=0;c<map[r].length;c++){
      if(fog[r][c])continue;
      const key=r+','+c,b=locations.get(key);
      if(b)memory[key]={id:b.id,r,c,type:b.type,owner:b.owner,hp:b.hp,gen:b.gen};
      else delete memory[key];
    }
    return true;
  }
  function visible({state,buildings,side,revealAll=false}){
    const fog=state.fog?.[side],seen=state.seen?.[side];
    const live=buildings.filter(b=>!b.lastSeen&&(!fog?.[b.r]?.[b.c]||revealAll));
    if(revealAll)return live;
    const remembered=Object.values(state.lastSeen?.[side]||{})
      .filter(b=>fog?.[b.r]?.[b.c]&&seen?.[b.r]?.[b.c]&&
        !live.some(x=>x.r===b.r&&x.c===b.c))
      .map(b=>({...b,stale:true}));
    return [...live,...remembered];
  }
  const api=Object.freeze({project,visible});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FogVisibility=api;
})(typeof window!=='undefined'?window:globalThis);
