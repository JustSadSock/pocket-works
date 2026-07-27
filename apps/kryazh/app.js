import { installMobileRuntime, setDocumentScrollLocked } from '../../shared/mobile-runtime.js';
import { BLOCK_BY_ID, ITEM_BY_ID, ITEMS, RECIPES, SMELT_RECIPES } from './src/data.js';
import { seedFromText } from './src/noise.js';
import { VoxelWorld, raycast } from './src/world.js';
import { Player } from './src/player.js';
import { createInventory, addItem, removeItem, craft, canCraft, moveStack, damageTool, countItem, emptySlot } from './src/inventory.js';
import { VoxelRenderer } from './src/renderer.js';
import { InputController } from './src/input.js';
import { EntitySystem } from './src/entities.js';
import { AudioSystem } from './src/audio.js';
import { listWorlds, loadWorld, saveWorld, deleteWorld, duplicateWorld, exportWorld, importWorld } from './src/persistence.js';

installMobileRuntime();
setDocumentScrollLocked(true);

const makeId = () => globalThis.crypto?.randomUUID?.() || `kryazh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const root = $('#app');
const canvas = $('#game-canvas');

const defaults = {
  sensitivity:.32, controlScale:1, controlOpacity:.78, leftHanded:false, vibration:true,
  autoJump:false, splitControls:true, renderDistance:4, simulationDistance:3,
  quality:.72, dynamicResolution:true, reducedParticles:false, reducedShadows:false,
  fov:74, sound:true, masterVolume:.7, musicVolume:.45, ambienceVolume:.6, creaturesVolume:.7, effectsVolume:.75,
  debug:false
};
let settings = {...defaults, ...JSON.parse(localStorage.getItem('pocket-works:kryazh:settings')||'{}')};
let state = {screen:'title', worldRecord:null, world:null, player:null, inventory:null, equipment:{head:emptySlot(),chest:emptySlot(),legs:emptySlot(),feet:emptySlot(),offhand:emptySlot()}, entities:null, renderer:null, input:null, audio:null, selected:0, time:.34, weather:'clear', difficulty:'normal', paused:true, breakTarget:null, breakProgress:0, last:0, saveTimer:0, worldTick:0, stepTimer:0, station:false, selectedSlot:null, processing:[]};

function persistSettings(){localStorage.setItem('pocket-works:kryazh:settings',JSON.stringify(settings));applySettings();}
function applySettings(){document.documentElement.style.setProperty('--control-scale',settings.controlScale);document.documentElement.style.setProperty('--control-opacity',settings.controlOpacity);root.classList.toggle('left-handed',settings.leftHanded);root.classList.toggle('debug-on',settings.debug);if(state.renderer){state.renderer.settings=settings;state.renderer.resize();}if(state.audio?.master)state.audio.master.gain.value=settings.masterVolume;}
applySettings();

function showScreen(id){$$('.screen').forEach(s=>s.classList.toggle('active',s.id===id));state.screen=id;root.dataset.screen=id;}
function toast(text, tone='normal'){const box=$('#toast');box.textContent=text;box.dataset.tone=tone;box.classList.remove('show');void box.offsetWidth;box.classList.add('show');}
function haptic(ms=10){if(settings.vibration)navigator.vibrate?.(ms);}
function iconFor(id){const i=ITEM_BY_ID[id];if(!i)return '';if(i.icon?.startsWith('block:'))return `<span class="mini-block" style="--block:${BLOCK_BY_ID[id]?.color||'#777'}"></span>`;const glyph={pickaxe:'⛏',axe:'◆',shovel:'◒',sword:'†',hoe:'⌁',bow:'⌒',stick:'╱',dart:'➤',head:'◉',chest:'▣',legs:'Ⅱ',feet:'∪',shield:'◖',raw:'●',cooked:'◉',bread:'▬',grain:'✦',seed:'•',fiber:'≈',reed:'ǂ',cap:'♠',copper:'●',tin:'◆',sun:'✶',lumen:'✧',coal:'●',copperbar:'▬',tinbar:'▬',bronze:'▬'};return `<span class="item-glyph">${glyph[i.icon?.split(':')[1]]||'◆'}</span>`;}
function slotHTML(slot,index,extra=''){const item=ITEM_BY_ID[slot?.id];return `<button class="slot ${state.selectedSlot===index?'picked':''}" data-slot="${index}" ${extra}>${slot?.id?iconFor(slot.id):''}${slot?.count>1?`<b>${slot.count}</b>`:''}${item?.durability?`<i style="--dur:${Math.max(0,(slot.durability||0)/item.durability)}"></i>`:''}</button>`;}

async function refreshWorldList(){
  const list=$('#world-list');list.innerHTML='<div class="loading-line">Reading local worlds…</div>';
  try{const worlds=await listWorlds();if(!worlds.length){list.innerHTML='<div class="empty-state"><strong>No worlds yet</strong><span>Create one. The ridge is not going to ruin itself.</span></div>';return;}list.innerHTML=worlds.map(w=>`<article class="world-card" data-id="${w.id}"><button class="world-open"><span class="world-thumb" style="--seed:${w.seed%360}"></span><span><strong>${escapeHtml(w.name)}</strong><small>${w.mode==='creative'?'Creative':'Survival'} · seed ${w.seed} · ${new Date(w.updated).toLocaleDateString()}</small></span></button><div class="world-actions"><button data-action="duplicate">Duplicate</button><button data-action="export">Export</button><button data-action="delete" class="danger">Delete</button></div></article>`).join('');}
  catch(e){list.innerHTML=`<div class="empty-state error"><strong>Storage error</strong><span>${escapeHtml(e.message)}</span></div>`;}
}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function findSpawn(world){for(let r=0;r<48;r+=4)for(let a=0;a<Math.PI*2;a+=.5){const x=Math.floor(Math.cos(a)*r),z=Math.floor(Math.sin(a)*r),y=world.heightAt(x,z)+1;if(world.get(x,y,z)===0&&world.get(x,y+1,z)===0&&world.biomeAt(x,z)!==7)return{x:x+.5,y,z:z+.5};}return{x:.5,y:30,z:.5};}
function starterInventory(mode){const inv=createInventory();if(mode==='creative'){[1,2,3,4,5,8,10,18,19,20,21,30,31,32,34,35,36,37,38,40].forEach((id,i)=>inv[i]={id,count:64,durability:0});}return inv;}

async function createNewWorld(){
  const name=$('#world-name').value.trim()||'Untitled Ridge';const seedText=$('#world-seed').value.trim()||makeId();const seed=/^-?\d+$/.test(seedText)?Math.abs(Number(seedText))>>>0:seedFromText(seedText);const mode=$('input[name="mode"]:checked')?.value||'survival';const difficulty=$('#difficulty').value;const record={id:makeId(),name,seed,mode,difficulty,created:Date.now(),updated:Date.now(),settings:{renderDistance:Number($('#new-render-distance').value),simulationDistance:Number($('#new-sim-distance').value)},revision:0};
  const world=new VoxelWorld(seed);const spawn=findSpawn(world);const player=new Player();player.mode=mode;player.pos={...spawn};player.spawn={...spawn};const inv=starterInventory(mode);record.game={world:world.serialize(),player:player.serialize(),inventory:inv,equipment:state.equipment,entities:[],drops:[],time:.34,weather:'clear',processing:[]};await saveWorld(record);await enterWorld(record);
}

async function enterWorld(record){
  showScreen('loading-screen');$('#loading-title').textContent=`Entering ${record.name}`;const bar=$('#loading-progress');bar.style.width='5%';
  const world=new VoxelWorld(record.seed);world.apply(record.game?.world);const player=new Player();player.apply(record.game?.player);player.mode=record.mode||player.mode;const inventory=(record.game?.inventory||starterInventory(player.mode)).map(s=>({...emptySlot(),...s}));while(inventory.length<36)inventory.push(emptySlot());
  const entities=new EntitySystem(world,record.seed);entities.apply(record.game?.entities);entities.drops=Array.isArray(record.game?.drops)?record.game.drops.map(d=>({...d})):[];state.worldRecord=record;state.world=world;state.player=player;state.inventory=inventory;state.equipment={head:emptySlot(),chest:emptySlot(),legs:emptySlot(),feet:emptySlot(),offhand:emptySlot(),...(record.game?.equipment||{})};state.entities=entities;state.time=record.game?.time??.34;state.weather=record.game?.weather||'clear';state.processing=record.game?.processing||[];state.difficulty=record.difficulty||'normal';settings.renderDistance=record.settings?.renderDistance||settings.renderDistance;settings.simulationDistance=record.settings?.simulationDistance||settings.simulationDistance;
  const cx=Math.floor(player.pos.x/16),cz=Math.floor(player.pos.z/16),r=Math.min(1,settings.renderDistance);let total=0;for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){world.requestChunk(cx+dx,cz+dz);total++;}let done=0;while(world.queue.length){done+=world.processQueue(12);bar.style.width=`${10+done/total*80}%`;await new Promise(requestAnimationFrame);}bar.style.width='95%';
  state.renderer=new VoxelRenderer(canvas,world,settings);state.input=state.input||new InputController(root,settings);state.audio=state.audio||new AudioSystem(settings);state.input.onLook=(dx,dy)=>{player.yaw-=dx*settings.sensitivity*.006;player.pitch=Math.max(-1.48,Math.min(1.48,player.pitch-dy*settings.sensitivity*.006));};state.input.onHotbar=(v,relative=false)=>selectHotbar(relative?(state.selected+(v>0?1:-1)+9)%9:v);bindGameInputEvents();state.paused=false;state.last=performance.now();showScreen('game-screen');renderHotbar();updateHUD();state.audio.unlock();toast(`${record.name} · ${BIOME_NAME()}`);requestAnimationFrame(loop);
}

function BIOME_NAME(){return state.world?['Plains','Emberwood','Pale Grove','Amber Waste','Salt Expanse','High Ridges','Mire','Open Water','Beach'][state.world.biomeAt(state.player.pos.x,state.player.pos.z)]:'Unknown';}
function bindGameInputEvents(){if(root.dataset.gameEventsBound)return;root.dataset.gameEventsBound='1';root.addEventListener('openinventory',openInventory);root.addEventListener('pausegame',pauseGame);root.addEventListener('crouch',e=>{if(state.player)state.player.crouch=e.detail;},{once:false});root.addEventListener('toggleflight',()=>{if(state.player?.mode==='creative'){state.player.flying=!state.player.flying;toast(state.player.flying?'Flight enabled':'Flight disabled');}});}
function selectHotbar(i){state.selected=(i+9)%9;renderHotbar();haptic(5);}
function selectedSlot(){return state.inventory?.[state.selected]||emptySlot();}

function loop(now){if(state.screen!=='game-screen'||state.paused)return;const dt=Math.min(.05,(now-state.last)/1000||.016);state.last=now;const {world,player,input,entities,renderer}=state;input.update();player.crouch=input.crouch;player.sprint=Math.hypot(input.moveX,input.moveY)>.9&&!player.crouch;player.update(dt,input,world,settings);
  const cx=Math.floor(player.pos.x/16),cz=Math.floor(player.pos.z/16),rd=settings.renderDistance;for(let dz=-rd;dz<=rd;dz++)for(let dx=-rd;dx<=rd;dx++)world.requestChunk(cx+dx,cz+dz);world.processQueue(3.5);if(Math.random()<.004)world.unloadFar(player.pos.x,player.pos.z,rd);
  state.time=(state.time+dt/720)%1;state.worldTick+=dt;if(state.worldTick>1){state.worldTick=0;world.tick();if(Math.random()<.002)state.weather=Math.random()<.38?'storm':Math.random()<.65?'rain':'clear';if(state.weather!=='clear'&&Math.random()<.012)state.weather='clear';}
  entities.update(dt,player,state.time,state.inventory);processJobs();handleInteraction(dt);const target=raycast(world,player.eye(),player.dir(),6,false);renderer.target=target;state.currentTarget=target;const visible=[...entities.entities,...entities.drops.map(d=>({x:d.x,y:d.y,z:d.z,color:BLOCK_BY_ID[d.id]?.color||'#e0b95e',hurt:0,dead:false,flying:false}))];renderer.render(player,visible,state.time,state.weather,state.breakProgress,selectedSlot().id);
  state.stepTimer-=dt;if(player.onGround&&Math.hypot(player.vel.x,player.vel.z)>1.3&&state.stepTimer<=0){state.stepTimer=player.sprint?.28:.42;state.audio.step(world.get(player.pos.x,player.pos.y-.1,player.pos.z));}
  state.audio.ambience(dt,world.biomeAt(player.pos.x,player.pos.z),state.weather);state.saveTimer+=dt;if(state.saveTimer>25){state.saveTimer=0;saveCurrent(false);}updateHUD();if(player.dead)onDeath();requestAnimationFrame(loop);
}

function handleInteraction(dt){const {input,player,world,entities,audio}=state;const slot=selectedSlot(),item=ITEM_BY_ID[slot.id];if(input.breaking){const hit=state.currentTarget;const attacked=player.attackCooldown<=0&&entities.attack(player.eye(),player.dir(),item?.damage||1.5,2.4);if(attacked){player.attackCooldown=.45;player.swing=1;audio.break(1);input.breaking=false;return;}if(!hit){state.breakTarget=null;state.breakProgress=0;return;}const key=`${hit.x},${hit.y},${hit.z}`;if(state.breakTarget!==key){state.breakTarget=key;state.breakProgress=0;}const b=BLOCK_BY_ID[hit.id];let speed=1;if(player.mode==='creative')speed=100;else if(item?.tool===b.preferredTool&&item.tier>=b.requiredTier)speed=item.speed||1;else if(b.requiredTier>0)speed=.18;let duration=Math.max(.05,b.hardness*1.2/speed);if(player.inBlock(world,7))duration*=3.2;if(!player.onGround)duration*=1.4;state.breakProgress+=dt/duration;player.swing=1;if(state.breakProgress>=1){breakBlock(hit,slot,item);state.breakProgress=0;state.breakTarget=null;}}
  else{state.breakProgress=Math.max(0,state.breakProgress-dt*6);state.breakTarget=null;}
  if(input.consumeUse())useSelected();
}
function breakBlock(hit,slot,item){const b=BLOCK_BY_ID[hit.id];if(!b||!Number.isFinite(b.hardness))return;state.world.set(hit.x,hit.y,hit.z,0);state.audio.break(hit.id);haptic(18);if(state.player.mode!=='creative'){if(b.drops)addItem(state.inventory,b.drops,1);if(item?.durability)damageTool(slot,1);}if(hit.id===8||hit.id===10)decayLeaves(hit);renderHotbar();}
function decayLeaves(hit){setTimeout(()=>{for(let y=hit.y-3;y<=hit.y+6;y++)for(let z=hit.z-4;z<=hit.z+4;z++)for(let x=hit.x-4;x<=hit.x+4;x++){const id=state.world?.get(x,y,z);if((id===9||id===11)&&Math.random()<.35)state.world.set(x,y,z,0);}},1800);}
function useSelected(){const {world,player,audio}=state;const hit=state.currentTarget,slot=selectedSlot(),item=ITEM_BY_ID[slot.id];if(hit){const b=BLOCK_BY_ID[hit.id];if(b?.functional==='craft'){state.station=true;openInventory();return;}if(b?.functional==='furnace'){openFurnace(hit);return;}if(b?.functional==='chest'){openChest(hit);return;}if(b?.functional==='door'){const key=`door:${hit.x},${hit.y},${hit.z}`;world.set(hit.x,hit.y,hit.z,0);world.functional.set(key,{id:35,open:true});toast('Door opened');audio.place(35);setTimeout(()=>{if(state.world===world&&world.get(hit.x,hit.y,hit.z)===0){world.set(hit.x,hit.y,hit.z,35);world.functional.delete(key);}},1400);return;}if(item?.tool==='hoe'&&(hit.id===1||hit.id===2)){world.set(hit.x,hit.y,hit.z,25);damageTool(slot);audio.place(25);renderHotbar();return;}if(slot.id===54&&(hit.id===25||hit.id===26)&&world.get(hit.x,hit.y+1,hit.z)===0){world.set(hit.x,hit.y+1,hit.z,27);if(player.mode!=='creative'){slot.count--;if(!slot.count)state.inventory[state.selected]=emptySlot();}audio.place(27);renderHotbar();return;}}
  if(item?.food&&player.hunger<20){player.hunger=Math.min(20,player.hunger+item.food);if(player.mode!=='creative'){slot.count--;if(!slot.count)state.inventory[state.selected]=emptySlot();}audio.pickup();renderHotbar();return;}
  if(item?.place){const t=hit;if(!t)return;const x=t.x+t.face.x,y=t.y+t.face.y,z=t.z+t.face.z;if(world.get(x,y,z)!==0)return toast('Space is occupied','bad');if(intersectsPlayer(x,y,z))return toast('Cannot place inside yourself. Ambitious, but no.','bad');world.set(x,y,z,item.place);if(player.mode!=='creative'){slot.count--;if(!slot.count)state.inventory[state.selected]=emptySlot();}audio.place(item.place);haptic(9);renderHotbar();return;}
  if(player.attackCooldown<=0&&state.entities.attack(player.eye(),player.dir(),item?.damage||1.5,2.4)){player.attackCooldown=.45;state.audio.creature('hostile');}player.swing=1;
}
function intersectsPlayer(x,y,z){const p=state.player,r=.3,h=p.crouch?1.5:1.8;return p.pos.x+r>x&&p.pos.x-r<x+1&&p.pos.z+r>z&&p.pos.z-r<z+1&&p.pos.y+h>y&&p.pos.y<y+1;}

function updateHUD(){if(!state.player)return;const p=state.player;$('#health-fill').style.width=`${p.health/20*100}%`;$('#hunger-fill').style.width=`${p.hunger/20*100}%`;$('#oxygen').classList.toggle('visible',p.oxygen<19.5);$('#oxygen-fill').style.width=`${p.oxygen/20*100}%`;$('#time-label').textContent=state.time>.72||state.time<.23?'NIGHT':'DAY';$('#biome-label').textContent=BIOME_NAME();$('#coords').textContent=`${Math.floor(p.pos.x)}  ${Math.floor(p.pos.y)}  ${Math.floor(p.pos.z)}`;if(settings.debug&&state.renderer){$('#debug-panel').innerHTML=`FPS ${state.renderer.fps.toFixed(0)}<br>Frame ${state.renderer.frameMs.toFixed(1)} ms<br>Chunks ${state.world.chunks.size}<br>Entities ${state.entities.entities.length}<br>Queue ${state.world.queue.length}<br>Pixels ${(state.renderer.w*state.renderer.h/1000).toFixed(1)}k`;}}
function renderHotbar(){const bar=$('#hotbar');bar.innerHTML=state.inventory?.slice(0,9).map((s,i)=>`<button class="hot-slot ${i===state.selected?'active':''}" data-hot="${i}">${s.id?iconFor(s.id):''}${s.count>1?`<b>${s.count}</b>`:''}</button>`).join('')||'';}

function openInventory(){if(!state.player||state.screen!=='game-screen')return;state.paused=true;state.selectedSlot=null;showScreen('inventory-screen');renderInventory();}
function closeInventory(){state.station=false;showScreen('game-screen');state.paused=false;state.last=performance.now();requestAnimationFrame(loop);}
function renderInventory(){
  $('#inventory-title').textContent=state.station?'Craft Bench':'Pack';$('#inventory-grid').innerHTML=state.inventory.map((s,i)=>slotHTML(s,i)).join('');
  $('#equipment-grid').innerHTML=['head','chest','legs','feet','offhand'].map((k,i)=>`<button class="equip-slot" data-equip="${k}"><span>${k}</span>${state.equipment[k]?.id?iconFor(state.equipment[k].id):''}</button>`).join('');
  const q=$('#recipe-search').value.toLowerCase();const recipes=RECIPES.filter(r=>(state.station||!r.station)&&r.label.toLowerCase().includes(q));$('#recipe-list').innerHTML=recipes.map(r=>`<button class="recipe ${canCraft(state.inventory,r)?'ready':'missing'}" data-recipe="${r.id}">${iconFor(r.out[0])}<span><strong>${r.label}</strong><small>${recipeIngredients(r)}</small></span><b>×${r.out[1]}</b></button>`).join('')||'<div class="empty-state"><span>No matching recipes.</span></div>';
  $('#creative-catalog').classList.toggle('visible',state.player.mode==='creative');if(state.player.mode==='creative')renderCreative();
}
function recipeIngredients(r){const ids=r.shapeless||r.shape.flat().filter(Boolean);const counts={};ids.forEach(id=>counts[id]=(counts[id]||0)+1);return Object.entries(counts).map(([id,n])=>`${ITEM_BY_ID[id]?.name} ${n}`).join(' · ');}
function renderCreative(){const q=$('#creative-search').value.toLowerCase();$('#creative-grid').innerHTML=ITEMS.filter(i=>i.id&&i.name.toLowerCase().includes(q)).slice(0,120).map(i=>`<button class="slot" data-creative="${i.id}">${iconFor(i.id)}<em>${i.name}</em></button>`).join('');}

function openFurnace(hit){state.paused=true;showScreen('furnace-screen');$('#furnace-coords').textContent=`${hit.x}, ${hit.y}, ${hit.z}`;renderFurnace();}
function renderFurnace(){const fuel=countItem(state.inventory,51)+countItem(state.inventory,18)+countItem(state.inventory,19);$('#fuel-count').textContent=`Fuel: ${fuel}`;$('#smelt-list').innerHTML=Object.entries(SMELT_RECIPES).map(([id,r])=>`<button class="smelt-row" data-smelt="${id}" ${countItem(state.inventory,Number(id))<1||fuel<1?'disabled':''}>${iconFor(Number(id))}<span>${ITEM_BY_ID[id]?.name}</span><i>→</i>${iconFor(r.out)}<span>${ITEM_BY_ID[r.out]?.name}</span><b>${r.time}s</b></button>`).join('');$('#job-list').innerHTML=state.processing.map((j,i)=>`<div class="job"><span>${ITEM_BY_ID[j.out]?.name}</span><i style="--p:${Math.min(1,(Date.now()-j.start)/(j.end-j.start))}"></i></div>`).join('')||'<small>No active batch.</small>';}
function startSmelt(id){const recipe=SMELT_RECIPES[id];if(!recipe)return;if(removeItem(state.inventory,Number(id),1)<1)return;if(removeItem(state.inventory,51,1)<1&&removeItem(state.inventory,18,1)<1&&removeItem(state.inventory,19,1)<1){addItem(state.inventory,Number(id),1);return;}state.processing.push({out:recipe.out,start:Date.now(),end:Date.now()+recipe.time*1000});state.audio.craft();renderFurnace();renderHotbar();}
function processJobs(){let changed=false;for(const j of state.processing)if(!j.done&&Date.now()>=j.end){j.done=true;addItem(state.inventory,j.out,1);toast(`${ITEM_BY_ID[j.out]?.name} finished`);changed=true;}state.processing=state.processing.filter(j=>!j.done);if(changed)renderHotbar();}
function closeFunctional(){showScreen('game-screen');state.paused=false;state.last=performance.now();requestAnimationFrame(loop);}
function openChest(hit){state.paused=true;const key=`chest:${hit.x},${hit.y},${hit.z}`;let chest=state.world.functional.get(key);if(!chest){chest={slots:createInventory(18)};state.world.functional.set(key,chest);}state.chestKey=key;showScreen('chest-screen');renderChest();}
function renderChest(){const chest=state.world.functional.get(state.chestKey);$('#chest-grid').innerHTML=chest.slots.map((s,i)=>slotHTML(s,100+i,`data-chest="${i}"`)).join('');$('#chest-inventory').innerHTML=state.inventory.map((s,i)=>slotHTML(s,i)).join('');}

function pauseGame(){if(state.screen!=='game-screen')return;state.paused=true;showScreen('pause-screen');$('#pause-world-name').textContent=state.worldRecord?.name||'World';}
function resumeGame(){showScreen('game-screen');state.paused=false;state.last=performance.now();requestAnimationFrame(loop);}
async function saveCurrent(notify=true){if(!state.worldRecord||!state.world)return;const rec=state.worldRecord;rec.game={world:state.world.serialize(),player:state.player.serialize(),inventory:state.inventory,equipment:state.equipment,entities:state.entities.serialize(),drops:state.entities.drops.map(d=>({...d})),time:state.time,weather:state.weather,processing:state.processing};try{await saveWorld(rec);if(notify)toast('World saved');}catch(e){toast(`Save failed: ${e.message}`,'bad');}}
async function saveAndQuit(){await saveCurrent(false);state.paused=true;state.world=null;state.player=null;state.inventory=null;showScreen('title-screen');await refreshWorldList();}

function onDeath(){if(state.screen==='death-screen')return;state.paused=true;for(const s of state.inventory)if(s.id)state.entities.drop(s.id,s.count,state.player.pos.x+(Math.random()-.5),state.player.pos.y+.5,state.player.pos.z+(Math.random()-.5));state.inventory=createInventory();showScreen('death-screen');$('#death-place').textContent=`Lost at ${Math.floor(state.player.pos.x)}, ${Math.floor(state.player.pos.y)}, ${Math.floor(state.player.pos.z)}`;}
function respawn(){const p=state.player;p.pos={...p.spawn};p.vel={x:0,y:0,z:0};p.health=20;p.hunger=14;p.oxygen=20;p.dead=false;showScreen('game-screen');state.paused=false;state.last=performance.now();renderHotbar();requestAnimationFrame(loop);}

function bindUI(){
  $('#play-btn').onclick=async()=>{showScreen('play-screen');await refreshWorldList();};$('#settings-btn').onclick=()=>{showScreen('settings-screen');renderSettings();};$('#about-btn').onclick=()=>showScreen('about-screen');
  $$('.back-title').forEach(b=>b.onclick=()=>showScreen('title-screen'));$('#new-world-btn').onclick=()=>showScreen('new-world-screen');$('#create-world-btn').onclick=createNewWorld;
  $('#random-seed').onclick=()=>$('#world-seed').value=Math.floor(Math.random()*2147483647);$('#import-world-btn').onclick=()=>$('#import-input').click();$('#import-input').onchange=async e=>{try{await importWorld(e.target.files[0]);await refreshWorldList();toast('World imported');}catch(err){toast(err.message,'bad');}};
  $('#world-list').onclick=async e=>{const card=e.target.closest('.world-card');if(!card)return;const id=card.dataset.id,action=e.target.closest('[data-action]')?.dataset.action;if(!action){const rec=await loadWorld(id);if(rec)await enterWorld(rec);return;}if(action==='duplicate'){await duplicateWorld(id);await refreshWorldList();}if(action==='export'){const rec=await loadWorld(id);exportWorld(rec);}if(action==='delete'){openConfirm('Delete this world permanently?',async()=>{await deleteWorld(id);await refreshWorldList();});}};
  $('#hotbar').onclick=e=>{const b=e.target.closest('[data-hot]');if(b)selectHotbar(Number(b.dataset.hot));};$('#inventory-close').onclick=closeInventory;$('#recipe-search').oninput=renderInventory;$('#creative-search').oninput=renderCreative;
  $('#inventory-grid').onclick=e=>inventoryClick(e, state.inventory);$('#recipe-list').onclick=e=>{const b=e.target.closest('[data-recipe]');if(!b)return;const made=craft(state.inventory,b.dataset.recipe,e.shiftKey?64:1,state.station);if(made){state.audio.craft();haptic(12);toast(`Crafted ×${made}`);renderInventory();renderHotbar();}else toast('Missing materials','bad');};
  $('#creative-grid').onclick=e=>{const b=e.target.closest('[data-creative]');if(b){addItem(state.inventory,Number(b.dataset.creative),ITEM_BY_ID[b.dataset.creative]?.stack||1);renderInventory();renderHotbar();}};
  $('#equipment-grid').onclick=e=>{const b=e.target.closest('[data-equip]');if(!b||state.selectedSlot===null)return;const slot=state.inventory[state.selectedSlot],item=ITEM_BY_ID[slot.id],key=b.dataset.equip;if(item?.armorSlot===key||(key==='offhand'&&item)){const old=state.equipment[key];state.equipment[key]=slot;state.inventory[state.selectedSlot]=old;state.selectedSlot=null;renderInventory();}};
  $('#furnace-close').onclick=closeFunctional;$('#smelt-list').onclick=e=>{const b=e.target.closest('[data-smelt]');if(b)startSmelt(Number(b.dataset.smelt));};$('#chest-close').onclick=closeFunctional;$('#chest-screen').onclick=e=>chestClick(e);
  $('#resume-btn').onclick=resumeGame;$('#pause-settings-btn').onclick=()=>{showScreen('settings-screen');renderSettings(true);};$('#save-quit-btn').onclick=saveAndQuit;$('#launcher-pause').onclick=()=>{saveCurrent(false);location.href='../../';};
  $('#respawn-btn').onclick=respawn;$('#death-quit-btn').onclick=saveAndQuit;$('#launcher-death').onclick=()=>location.href='../../';$('#launcher-title').onclick=()=>location.href='../../';
  $('#settings-close').onclick=()=>{showScreen(state.world?'pause-screen':'title-screen');};$('#settings-form').oninput=e=>{const k=e.target.dataset.setting;if(!k)return;settings[k]=e.target.type==='checkbox'?e.target.checked:Number(e.target.value);persistSettings();};
  $('#confirm-cancel').onclick=()=>$('#confirm').classList.remove('open');
  addEventListener('pagehide',()=>saveCurrent(false));document.addEventListener('visibilitychange',()=>{if(document.hidden){if(state.screen==='game-screen')pauseGame();saveCurrent(false);}});
}
function inventoryClick(e,inv){const b=e.target.closest('[data-slot]');if(!b)return;const i=Number(b.dataset.slot);if(state.selectedSlot===null){if(inv[i].id){state.selectedSlot=i;renderInventory();}}else{moveStack(inv,state.selectedSlot,i,e.altKey||e.pointerType==='touch'&&e.detail===2);state.selectedSlot=null;renderInventory();renderHotbar();}}
function chestClick(e){const invSlot=e.target.closest('#chest-inventory [data-slot]'),chestSlot=e.target.closest('#chest-grid [data-chest]'),chest=state.world.functional.get(state.chestKey);if(invSlot){const i=Number(invSlot.dataset.slot),s=state.inventory[i];if(s.id){const left=addItem(chest.slots,s.id,s.count,s.durability);s.count=left;if(!left)state.inventory[i]=emptySlot();renderChest();renderHotbar();}}else if(chestSlot){const i=Number(chestSlot.dataset.chest),s=chest.slots[i];if(s.id){const left=addItem(state.inventory,s.id,s.count,s.durability);s.count=left;if(!left)chest.slots[i]=emptySlot();renderChest();renderHotbar();}}}
function openConfirm(text,action){$('#confirm-text').textContent=text;$('#confirm').classList.add('open');$('#confirm-ok').onclick=async()=>{$('#confirm').classList.remove('open');await action();};}
function renderSettings(fromGame=false){$('#settings-context').textContent=fromGame?'World paused':'Global defaults';for(const el of $$('[data-setting]')){const k=el.dataset.setting;if(el.type==='checkbox')el.checked=!!settings[k];else el.value=settings[k];}$('#render-value').textContent=settings.renderDistance;$('#quality-value').textContent=Math.round(settings.quality*100)+'%';}

bindUI();showScreen('title-screen');
