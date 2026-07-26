function raycast(maxDistance=6) {
  const {forward}=cameraVectors();
  const ox=player.x, oy=player.y+(player.crouching?1.28:EYE_HEIGHT), oz=player.z;
  let lastX=Math.floor(ox),lastY=Math.floor(oy),lastZ=Math.floor(oz);
  for (let d=.05;d<=maxDistance;d+=.045) {
    const x=Math.floor(ox+forward[0]*d), y=Math.floor(oy+forward[1]*d), z=Math.floor(oz+forward[2]*d);
    if (x===lastX&&y===lastY&&z===lastZ) continue;
    const id=getBlock(x,y,z);
    if (id!==0&&id!==5) return {x,y,z,id,px:lastX,py:lastY,pz:lastZ,distance:d};
    lastX=x;lastY=y;lastZ=z;
  }
  return null;
}
function updateTarget() {
  target=raycast();
  entityTarget=findEntityTarget();
  if(entityTarget&&(!target||entityTarget.distance<target.distance)){
    targetLabel.hidden=false;targetLabel.textContent=ENTITY_TYPES[entityTarget.entity.type].name.toUpperCase();
  }else if (target) {
    entityTarget=null;targetLabel.hidden=false; targetLabel.textContent=BLOCKS[target.id]?.name.toUpperCase()||'БЛОК';
  } else {entityTarget=null;targetLabel.hidden=true;}
}
function playerIntersectsBlock(x,y,z) {
  return x+1>player.x-PLAYER_RADIUS && x<player.x+PLAYER_RADIUS && z+1>player.z-PLAYER_RADIUS && z<player.z+PLAYER_RADIUS && y+1>player.y && y<player.y+PLAYER_HEIGHT;
}
function editBlock(x,y,z,id) {
  if (!inWorld(x,y,z)) return false;
  setBlockRaw(x,y,z,id); uploadVoxel(x,y,z); changedBlocks++; scheduleSave(); return true;
}
function settleSand(x,y,z) {
  for (let sy=y;sy<WORLD_Y-1;sy++) {
    if (getBlock(x,sy,z)!==4) continue;
    let ny=sy;
    while (ny>0 && (getBlock(x,ny-1,z)===0 || getBlock(x,ny-1,z)===5)) ny--;
    if (ny!==sy) {
      const displaced=getBlock(x,ny,z);
      setBlockRaw(x,sy,z,displaced===5?5:0); setBlockRaw(x,ny,z,4);
      uploadVoxel(x,sy,z); uploadVoxel(x,ny,z);
    }
  }
}
function letWaterIn(x,y,z) {
  if (getBlock(x,y,z)!==0) return;
  const neighbors=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];
  if (neighbors.some(([dx,dy,dz])=>getBlock(x+dx,y+dy,z+dz)===5)) {
    setTimeout(()=>{ if(getBlock(x,y,z)===0){setBlockRaw(x,y,z,5);uploadVoxel(x,y,z);scheduleSave();}},180);
  }
}
function mineTick(dt) {
  if (!mining || !target) { miningProgress=0; breakRing.classList.remove('active'); return; }
  const key=`${target.x},${target.y},${target.z}`;
  if (key!==miningCellKey) { miningCellKey=key; miningProgress=0; }
  const hardness=BLOCKS[target.id]?.hardness||.5;
  miningProgress+=dt/Math.max(.12,hardness);
  breakRing.classList.add('active');
  breakProgress.style.setProperty('--break-angle',`${miningProgress*360}deg`);
  if (miningProgress>=1) {
    const {x,y,z,id}=target;
    spawnParticles(x+.5,y+.55,z+.5,BLOCKS[id].color,14,id===3||id===11?1.05:.8);
    editBlock(x,y,z,0); settleSand(x,y+1,z); letWaterIn(x,y,z);
    if(id===7&&Math.random()<.24){supplies.apple++;showToast(`Яблоко найдено · ${supplies.apple}`);buildInventory();scheduleSave();}
    miningProgress=0; miningCellKey=''; swingHand(); pulseHaptic(id===3||id===11?32:18); playTone('break',id);
    updateTarget();
  }
}
function eatSelected(item){
  if(player.hunger>=19.9){showToast('Ты не голоден');return;}
  const count=supplies[item.key]||0;if(count<=0){showToast(`${item.name}: закончились`);return;}
  supplies[item.key]=count-1;player.hunger=Math.min(20,player.hunger+item.food);player.health=Math.min(20,player.health+1);
  swingHand();pulseHaptic(14);playTone('eat');spawnParticles(player.x,player.y+1.25,player.z,item.color,8,.35);buildInventory();updateVitalsHud();scheduleSave();showToast(`${item.name} · осталось ${supplies[item.key]}`);
}
function placeSelected() {
  const id=hotbar[selectedSlot],item=itemSpec(id);
  if(item.type==='food'){eatSelected(item);return;}
  if(entityTarget){showToast('Здесь животное');return;}
  if (mode!=='game' || !target) { showToast('Подойди ближе к поверхности'); return; }
  const {px:x,py:y,pz:z}=target;
  if (!inWorld(x,y,z) || playerIntersectsBlock(x,y,z)) { showToast('Здесь стоишь ты'); pulseHaptic(8); return; }
  if (getBlock(x,y,z)!==0 && getBlock(x,y,z)!==5) return;
  editBlock(x,y,z,id); spawnParticles(x+.5,y+.55,z+.5,BLOCKS[id].color,6,.42);swingHand(); pulseHaptic(18); playTone('place',id); updateTarget();
}

