function rleEncode(data) {
  const out=[];
  for (let i=0;i<data.length;) {
    const value=data[i]; let run=1;
    while (i+run<data.length && data[i+run]===value && run<65535) run++;
    out.push(value,run&255,run>>>8); i+=run;
  }
  const bytes=new Uint8Array(out); let binary='';
  for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
function rleDecode(encoded,length) {
  const binary=atob(encoded); const out=new Uint8Array(length); let p=0;
  for (let i=0;i+2<binary.length;i+=3) {
    const value=binary.charCodeAt(i), run=binary.charCodeAt(i+1)|(binary.charCodeAt(i+2)<<8);
    if (!run || p+run>length) throw new Error('Invalid world data'); out.fill(value,p,p+run); p+=run;
  }
  if (p!==length) throw new Error('Incomplete world data'); return out;
}
function saveWorld() {
  if (!hasWorld) return;
  try {
    const payload={version:1,appVersion:APP_VERSION,seed,world:rleEncode(world),changedBlocks,hotbar,selectedSlot,supplies,worldTime,worldDay,player:{x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch,health:player.health,hunger:player.hunger,air:player.air},savedAt:Date.now()};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));
    updateMenuMeta(payload.savedAt);
  } catch (error) { console.error(error); showToast('Не удалось сохранить мир'); }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer=setTimeout(saveWorld,650); }
function loadWorld() {
  try {
    const raw=localStorage.getItem(STORAGE_KEY); if (!raw) return false;
    const data=JSON.parse(raw); if (data.version!==1 || !data.world) return false;
    world=rleDecode(data.world,WORLD_X*WORLD_Y*WORLD_Z); seed=data.seed>>>0; changedBlocks=Number(data.changedBlocks)||0;
    worldTime=Number.isFinite(data.worldTime)?data.worldTime:.31;worldDay=Math.max(1,Number(data.worldDay)||1);
    hotbar=Array.isArray(data.hotbar)&&data.hotbar.length===9?data.hotbar.map(v=>isValidItemId(Number(v))?Number(v):1):[...HOTBAR_DEFAULT];
    supplies={apple:Math.max(0,Number(data.supplies?.apple)||0),meat:Math.max(0,Number(data.supplies?.meat)||0)};
    if(!data.supplies&&data.appVersion!=='1.1.0')supplies.apple=2;
    selectedSlot=clamp(Number(data.selectedSlot)||0,0,8);
    uploadWorldTexture();
    generatedSpawn=findSafeSpawn();
    if (data.player) Object.assign(player,{x:data.player.x,y:data.player.y,z:data.player.z,yaw:data.player.yaw,pitch:data.player.pitch,health:clamp(Number(data.player.health)||20,1,20),hunger:clamp(Number(data.player.hunger)||20,0,20),air:clamp(Number(data.player.air)||10,0,10),vx:0,vy:0,vz:0});
    spawnEntities();
    if (collidesAt(player.x,player.y,player.z)) respawn();
    hasWorld=true; updateMenuMeta(data.savedAt); return true;
  } catch (error) { console.warn('Saved world rejected',error); localStorage.removeItem(STORAGE_KEY); return false; }
}
function updateMenuMeta(savedAt=0) {
  $('#worldName').textContent=WORLD_NAMES[seed%WORLD_NAMES.length];
  $('#worldMeta').textContent=hasWorld ? `${changedBlocks} изменений · ${savedAt?new Date(savedAt).toLocaleDateString('ru-RU'):'сейчас'}` : 'ещё не создан';
  $('#continueLabel').textContent=hasWorld?'ПРОДОЛЖИТЬ':'СОЗДАТЬ МИР';
}

function buildHotbar() {
  hotbarEl.innerHTML='';
  hotbar.forEach((id,index)=>{
    const item=itemSpec(id),count=item.type==='food'?(supplies[item.key]||0):null;
    const button=document.createElement('button'); button.className=`hotbar-slot${index===selectedSlot?' selected':''}`; button.dataset.slot=index;
    button.setAttribute('aria-label',`${index+1}. ${item.name}${count!==null?`, ${count} шт.`:''}`);
    button.innerHTML=`<i class="block-icon${item.type==='food'?' food-icon':''}" style="--block:${item.color}"></i>${count!==null?`<b class="item-count">${count}</b>`:''}`;
    button.addEventListener('pointerdown',(event)=>{event.preventDefault();selectSlot(index);}); hotbarEl.append(button);
  });
  updateHeldBlock();
}
function buildInventory() {
  inventoryGrid.innerHTML='';
  const catalog=[...BLOCKS.slice(1),...Object.values(ITEMS)];
  catalog.forEach(item=>{
    const count=item.type==='food'?(supplies[item.key]||0):null;
    const button=document.createElement('button'); button.className=`inventory-item${hotbar[selectedSlot]===item.id?' selected':''}`; button.dataset.block=item.id;
    button.innerHTML=`<i class="block-icon${item.type==='food'?' food-icon':''}" style="--block:${item.color}"></i><span>${item.name}${count!==null?` · ${count}`:''}</span>`;
    button.addEventListener('click',()=>{hotbar[selectedSlot]=item.id;buildHotbar();buildInventory();$('#selectedBlockName').textContent=item.name;playTone('ui');scheduleSave();});
    inventoryGrid.append(button);
  });
  $('#selectedBlockName').textContent=itemSpec(hotbar[selectedSlot]).name;
}
function selectSlot(index) { selectedSlot=clamp(index,0,8); buildHotbar(); buildInventory(); playTone('ui'); scheduleSave(); }
function buildVitals(){
  const make=(el,count)=>{el.innerHTML='';for(let i=0;i<count;i++){const pip=document.createElement('i');pip.className='stat-pip';el.append(pip);}};
  make(healthBar,10);make(hungerBar,10);make(airBar,10);updateVitalsHud();
}
function setPips(el,value){[...el.children].forEach((pip,i)=>{const amount=value-i*2;pip.classList.toggle('full',amount>=2);pip.classList.toggle('half',amount>0&&amount<2);});}
function updateVitalsHud(){
  setPips(healthBar,player.health);setPips(hungerBar,player.hunger);setPips(airBar,player.air*2);
  airBar.style.visibility=player.underwater||player.air<9.9?'visible':'hidden';
}
function updateHeldBlock() {const item=itemSpec(hotbar[selectedSlot]);heldBlock.style.setProperty('--held',item.color);heldBlock.classList.toggle('food',item.type==='food');$('#placeButton span').textContent=item.type==='food'?'●':'■';$('#placeButton small').textContent=item.type==='food'?'ЕСТЬ':'СТАВИТЬ';}
function swingHand() { hand.classList.remove('swing'); void hand.offsetWidth; hand.classList.add('swing'); }
function showToast(message) { toastEl.textContent=message; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1350); }
function pulseHaptic(duration) { if (settings.haptic && navigator.vibrate) navigator.vibrate(duration); }
function ensureAudio() {
  if (!settings.sound) return null;
  if (!audioContext) audioContext=new (window.AudioContext||window.webkitAudioContext)();
  if (audioContext.state==='suspended') audioContext.resume(); return audioContext;
}
function playTone(type,id=1) {
  const ctx=ensureAudio(); if (!ctx) return;
  const now=ctx.currentTime, osc=ctx.createOscillator(), gain=ctx.createGain();
  let f=180,d=.07,wave='square',volume=.035;
  if(type==='break'){f=90+(id%4)*22;d=.11;volume=.055;wave='sawtooth';}
  if(type==='place'){f=150+(id%5)*18;d=.065;volume=.045;}
  if(type==='jump'){f=250;d=.08;wave='triangle';}
  if(type==='step'){f=70+(Math.random()*20);d=.035;volume=.018;wave='square';}
  if(type==='ui'){f=420;d=.025;volume=.018;}
  if(type==='hit'){f=118;d=.09;volume=.052;wave='sawtooth';}
  if(type==='hurt'){f=82;d=.13;volume=.06;wave='square';}
  if(type==='heal'){f=520;d=.12;volume=.025;wave='sine';}
  if(type==='eat'){f=210;d=.16;volume=.04;wave='triangle';}
  osc.type=wave; osc.frequency.setValueAtTime(f,now); osc.frequency.exponentialRampToValueAtTime(Math.max(40,f*.72),now+d);
  gain.gain.setValueAtTime(volume,now); gain.gain.exponentialRampToValueAtTime(.0001,now+d);
  osc.connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now+d+.01);
}

