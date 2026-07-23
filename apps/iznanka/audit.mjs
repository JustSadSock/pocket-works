import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ZONES, TILE, LAYERS, createInitialSave, validateSave, isBlocked,
  computeHitDamage, computeRuptureDamage, addXp, requirementMet, applyChestReward
} from './engine.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const save=createInitialSave();
assert.equal(save.zone,'threshold');
assert.equal(validateSave({zone:'garbage'}).zone,'threshold');
assert.ok(computeRuptureDamage(save,computeHitDamage(save,'attack',1))>computeHitDamage(save,'attack',1)*2);
assert.equal(addXp(save,500)>0,true);
assert.equal(requirementMet('three-seals',save),false);
save.quest.seals=['root','depth','name'];
assert.equal(requirementMet('three-seals',save),true);
const rewards=applyChestReward(save,{threads:10,potion:1,relic:'split-knot'});
assert.equal(rewards.length,3);
assert.ok(save.inventory.relics.includes('split-knot'));

function reachable(zoneId,start,target,maxDistance=30){
  const zone=ZONES[zoneId];
  const sx=Math.floor(start.x/TILE),sy=Math.floor(start.y/TILE);
  const queue=[[sx,sy,LAYERS.BLOOM],[sx,sy,LAYERS.ASH]];
  const seen=new Set();
  while(queue.length){
    const [x,y,layer]=queue.shift();
    const key=`${x},${y},${layer}`;
    if(seen.has(key))continue;seen.add(key);
    const px=x*TILE+TILE/2,py=y*TILE+TILE/2;
    if(Math.hypot(px-target.x,py-target.y)<=maxDistance)return true;
    const other=layer===LAYERS.BLOOM?LAYERS.ASH:LAYERS.BLOOM;
    if(!isBlocked(zoneId,other,px,py,6))queue.push([x,y,other]);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,npx=nx*TILE+TILE/2,npy=ny*TILE+TILE/2;
      if(nx<0||ny<0||nx>=zone.size[0]||ny>=zone.size[1])continue;
      if(!isBlocked(zoneId,layer,npx,npy,6))queue.push([nx,ny,layer]);
    }
  }
  return false;
}

for(const [zoneId,zone] of Object.entries(ZONES)){
  for(const layer of [LAYERS.BLOOM,LAYERS.ASH]){
    assert.equal(isBlocked(zoneId,layer,zone.spawn.x,zone.spawn.y,6),false,`${zoneId} spawn blocked in ${layer}`);
  }
  const bossTuple=zone.enemies.find(e=>['gardener','ferryman','archivist','weaver'].includes(e[1]));
  if(bossTuple){
    const target={x:bossTuple[2]*TILE+8,y:bossTuple[3]*TILE+8};
    assert.equal(reachable(zoneId,zone.spawn,target,42),true,`${zoneId} boss unreachable`);
  }
  for(const npc of zone.npcs) assert.equal(reachable(zoneId,zone.spawn,npc,44),true,`${zoneId}/${npc.id} unreachable`);
}

const required=['index.html','styles.css','app-loader.js','app-core.js','app-modals.js','app-input.js','app-combat.js','app-interactions.js','app-ai.js','app-effects.js','app-render-world.js','app-render-actors.js','app-boot.js','engine.js','manifest.webmanifest','sw.js','README.md','icons/icon.svg','icons/icon-maskable.svg'];
for(const file of required) await access(path.join(root,file));
const html=await readFile(path.join(root,'index.html'),'utf8');
for(const id of ['continueButton','newGameButton','pauseButton','potionButton','attackButton','skillButton','dashButton','shiftButton','interactButton','modalRoot']) assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
const js=(await Promise.all(['app-loader.js','app-core.js','app-modals.js','app-input.js','app-combat.js','app-interactions.js','app-ai.js','app-effects.js','app-render-world.js','app-render-actors.js','app-boot.js'].map(file=>readFile(path.join(root,file),'utf8')))).join('\n');
assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(js),'browser modal API used');
assert.ok(js.includes("window.location.href='../../'"),'launcher return missing');
const sw=await readFile(path.join(root,'sw.js'),'utf8');
for(const file of ['./index.html','./styles.css','./app-loader.js','./app-core.js','./app-modals.js','./app-input.js','./app-combat.js','./app-interactions.js','./app-ai.js','./app-effects.js','./app-render-world.js','./app-render-actors.js','./app-boot.js','./engine.js','../../shared/mobile-runtime.css','../../shared/mobile-runtime.js']) assert.ok(sw.includes(file),`SW missing ${file}`);
console.log('ИЗНАНКА audit: OK');
