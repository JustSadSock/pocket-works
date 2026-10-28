import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {createBattle,MAPS,TYPES,WIDTH,HEIGHT,distance,terrainAt,unitAt,leader,commanded,reachable,attackPreview,issue,endTurn,aiAction,validSaved} from './rules.mjs';
import {createCampaign,validCampaign,march,recruit,fortify,endSeason,startCampaignBattle,concludeCampaignBattle,retreatCampaignBattle,PROVINCES,FACTIONS,neighbors,armiesAt} from './campaign.mjs';
import {campaignMapSvg,campaignInfo,campaignHeader} from './campaign-ui.mjs';
installMobileRuntime();

const $=id=>document.getElementById(id);
const canvas=$('board'), ctx=canvas.getContext('2d'), veil=$('veil'), veilContent=$('veilContent');
const STORAGE='pocket-works:chernye-znamena:save-v1';
const PREFS='pocket-works:chernye-znamena:prefs-v1';
const CAMPAIGN_KEY='pocket-works:chernye-znamena:campaign-v1';
const LINKED_BATTLE_KEY='pocket-works:chernye-znamena:linked-battle-v1';
const SIDES=['Северный союз','Багровый орден'];
const SIDE_COLORS=['#76b9b5','#c9805c'];
const TERRAIN_COLORS={grass:'#778973',hill:'#a19d7f',forest:'#63785c',river:'#547778',ford:'#758887',marsh:'#576d62'};
let game=createBattle(), selected=null, tool='move', screen='home', pickMap='pass',pickMode='ai';
let audioEnabled=false,audio=null,aiTimer=null,noticeTimer=null,impact=null;
let size=30,originX=0,originY=0,viewWidth=400,viewHeight=400,dpr=1,portraitBoard=false;
let pointerStart=null;
let loadError='';
let previousModal='home';
let campaign=null,linkedSave=null,selectedProvince=1,selectedArmy='army-1',marchMode=false,marchDestination=null;
try{const s=JSON.parse(localStorage.getItem(STORAGE)||'null');if(s && validSaved(s))game=s;else if(s)loadError='Старое сохранение повреждено и не загружено';}
catch{loadError='Сохранение недоступно';}
try{audioEnabled=JSON.parse(localStorage.getItem(PREFS)||'{}').sound===true;}catch{}
try{const c=JSON.parse(localStorage.getItem(CAMPAIGN_KEY)||'null');if(c&&validCampaign(c))campaign=c;else if(c)loadError='Сохранение кампании повреждено';}catch{loadError='Не удалось прочитать кампанию';}
try{const b=JSON.parse(localStorage.getItem(LINKED_BATTLE_KEY)||'null');if(b&&validSaved(b)&&b.campaignContext)linkedSave=b;}catch{}
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function persist(){
  // A concluded campaign battle must never resurrect itself on pagehide or reload.
  if(game.campaignContext && (!campaign?.pending || game.campaignContext.to!==campaign.pending.to))return true;
  try{localStorage.setItem(game.campaignContext?LINKED_BATTLE_KEY:STORAGE,JSON.stringify(game));return true;}catch{showNotice('Не удалось сохранить бой');return false;}
}
function writePrefs(){try{localStorage.setItem(PREFS,JSON.stringify({sound:audioEnabled}));}catch{}}
function persistCampaign(){
  try{if(campaign)localStorage.setItem(CAMPAIGN_KEY,JSON.stringify(campaign));return true;}
  catch{showNotice('Кампания не сохранилась: проверь свободное место');return false;}
}
function setStage(section){
  const isMap=section==='campaign',isBattle=section==='battle';
  $('battleLayout').hidden=!isBattle;
  $('campaignView').hidden=!isMap;
  document.body.dataset.stage=section;
  if(isBattle)requestAnimationFrame(resize);
}
function campaignAction(result){
  if(result.error){showNotice(result.error);$('campaignTicker').textContent=result.error; sound('error');return false;}
  campaign=result.state;persistCampaign();sound('move');
  selectedArmy=campaign.armies.some(a=>a.id===selectedArmy)?selectedArmy:
    (campaign.armies.find(a=>a.side===0)?.id||null);
  if(campaign.pending){launchLinkedBattle(campaign.pending.attackerSide!==0);return true;}
  marchMode=false;renderStrategic();return true;
}
function renderStrategic(){
  if(!campaign)return;
  setStage('campaign');
  const portrait=window.matchMedia('(max-width:780px)').matches;
  $('campaignCounters').innerHTML=campaignHeader(campaign);
  $('campaignMap').innerHTML=campaignMapSvg(campaign,selectedProvince,selectedArmy,marchMode,portrait);
  $('campaignDetails').innerHTML=campaignInfo(campaign,selectedProvince,selectedArmy,marchMode);
  $('campaignTicker').textContent=campaign.history[0]||'Приказы ждут полководца.';
  $('campaignEndSeason').disabled=!!campaign.pending||campaign.winner!==null;
}
function openStrategic(showEnding=true){
  if(!campaign)campaign=createCampaign();
  if(campaign.pending){launchLinkedBattle(true);return;}
  marchMode=false;
  screen='campaign';
  veil.classList.add('hidden');
  renderStrategic();
  if(campaign.winner!==null&&showEnding)modal('campaignEnd');
}
function launchLinkedBattle(warning){
  if(!campaign?.pending)return;
  const match=linkedSave?.campaignContext?.to===campaign.pending.to && linkedSave?.campaignContext?.playerStrength===
    (campaign.pending.attackerSide===0?campaign.pending.attackerStrength:campaign.pending.defenderStrength);
  game=match?linkedSave:startCampaignBattle(campaign);
  linkedSave=game;
  selected=null;tool='move';
  setStage('battle');persist();
  if(game.winner!==null){modal('result');return;}
  if(warning){modal('campaignWarning');return;}
  screen='battle';veil.classList.add('hidden');resize();update();scheduleAi();
}
function finishLinkedBattle(){
  if(!campaign?.pending)return;
  const outcome=concludeCampaignBattle(campaign,game);
  if(outcome.error){showNotice(outcome.error);return;}
  campaign=outcome.state;selectedProvince=campaign.report?.province??selectedProvince;
  linkedSave=null;persistCampaign();
  try{localStorage.removeItem(LINKED_BATTLE_KEY);}catch{}
}
function sendArmy(to){
  if(!campaign || !selectedArmy)return;
  const a=campaign.armies.find(a=>a.id===selectedArmy && a.side===0);
  if(!a){showNotice('Сначала выбери свою дружину');return;}
  if(!neighbors(a.province).includes(to)){showNotice('Выбери соседнюю область');return;}
  if(campaign.provinces[to].owner!==0){
    marchDestination=to;modal('campaignMarchConfirm');return;
  }
  selectedProvince=to;
  campaignAction(march(campaign,a.id,to));
}
$('campaignMap').addEventListener('click',event=>{
  const region=event.target.closest('[data-province]');if(!region || screen!=='campaign')return;
  const id=Number(region.dataset.province);
  if(marchMode){sendArmy(id);return;}
  selectedProvince=id;
  const stationed=armiesAt(campaign,id,0);
  if(stationed.length)selectedArmy=stationed[0].id;
  renderStrategic();sound('move');
});
$('campaignMap').addEventListener('keydown',event=>{
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-province]')){
    event.preventDefault();event.target.click();
  }
});
$('campaignDetails').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button || screen!=='campaign'||!campaign)return;
  if(button.dataset.army){selectedArmy=button.dataset.army;renderStrategic();return;}
  const cmd=button.dataset.cmd;
  if(cmd==='march'){marchMode=true;renderStrategic();return;}
  if(cmd==='cancel-march'){marchMode=false;renderStrategic();return;}
  if(cmd==='recruit')campaignAction(recruit(campaign,selectedProvince,selectedArmy));
  if(cmd==='raise')campaignAction(recruit(campaign,selectedProvince));
  if(cmd==='fortify')campaignAction(fortify(campaign,selectedProvince));
});
$('campaignEndSeason').addEventListener('click',()=>{
  if(screen!=='campaign'||!campaign)return;
  campaignAction(endSeason(campaign));
  if(campaign?.winner!==null)modal('campaignEnd');
});

function sound(kind){
  if(!audioEnabled)return;
  try {
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audio)audio=new AC();
    if(audio.state==='suspended')audio.resume();
    const t=audio.currentTime, dur=kind==='attack'?.19:.105;
    const count=Math.floor(audio.sampleRate*dur),buffer=audio.createBuffer(1,count,audio.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<count;i++){const decay=Math.pow(1-i/count,kind==='attack'?2:3);data[i]=(Math.random()*2-1)*decay;}
    const source=audio.createBufferSource();source.buffer=buffer;
    const filter=audio.createBiquadFilter();filter.type='bandpass';filter.frequency.value=kind==='attack'?940:kind==='move'?320:650;filter.Q.value=kind==='attack'?1.2:.7;
    const gain=audio.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(kind==='attack'?.075:.034,t+.009);gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
    source.connect(filter).connect(gain).connect(audio.destination);source.start(t);source.stop(t+dur+.01);
    if(kind==='attack'||kind==='turn'){
      const osc=audio.createOscillator(),g=audio.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(kind==='attack'?130:175,t);osc.frequency.exponentialRampToValueAtTime(kind==='attack'?72:115,t+.14);
      g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.0001,t+.15);
      osc.connect(g).connect(audio.destination);osc.start(t);osc.stop(t+.16);
    }
  } catch{}
}
function showNotice(message){
  const el=$('battleNotice');el.textContent=message;el.classList.add('show');
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('show'),2300);
}
function hexPoint(q,r){
  if(portraitBoard)return {
    x:originX-1.5*size*(r-(HEIGHT-1)/2),
    y:originY+Math.sqrt(3)*size*(q+r/2-((WIDTH-1)/2+(HEIGHT-1)/4))
  };
  return {x:originX+Math.sqrt(3)*size*(q+r/2),y:originY+1.5*size*r};
}
function poly(x,y,r,angle=portraitBoard?0:-Math.PI/2){
  ctx.beginPath();for(let i=0;i<6;i++){
    const a=angle+i*Math.PI/3,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
    if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
  }ctx.closePath();
}
function line(x1,y1,x2,y2,color,width=1){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
function disc(x,y,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function ellipse(x,y,rx,ry,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function highlightFor(q,r){
  if(!selected)return '';
  const u=game.units.find(v=>v.id===selected);
  if(!u||u.side!==game.turn||u.used)return '';
  if(tool==='move' && reachable(game,u.id).some(p=>p.q===q&&p.r===r))return 'move';
  const foe=unitAt(game,q,r);
  if((tool==='attack'||tool==='move') && foe && attackPreview(game,u,foe))return 'attack';
  return '';
}
function backdrop(){
  const grad=ctx.createRadialGradient(viewWidth*.54,viewHeight*.45,size*2,viewWidth*.5,viewHeight*.55,Math.max(viewWidth,viewHeight));
  grad.addColorStop(0,'#485b4a');grad.addColorStop(.58,'#314139');grad.addColorStop(1,'#1b2725');
  ctx.fillStyle=grad;ctx.fillRect(0,0,viewWidth,viewHeight);
  ctx.save();ctx.globalAlpha=.14;
  const gap=Math.max(20,size*.9);
  for(let i=-viewHeight;i<viewWidth+viewHeight;i+=gap)line(i,0,i+viewHeight,viewHeight,'#a8aa8b',.6);
  ctx.restore();
  ctx.save();ctx.globalAlpha=.10;ctx.strokeStyle='#d3dbc9';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(viewWidth/2,viewHeight/2,Math.max(size*5,viewWidth*.35),0,Math.PI*2);ctx.stroke();ctx.restore();
}
function paintTile(q,r){
  const {x,y}=hexPoint(q,r),terrain=terrainAt(game,q,r);
  const kind=highlightFor(q,r),u=unitAt(game,q,r),chosen=u?.id===selected;
  // The thick shadowed rim makes each cell an individual stone war-table tile.
  poly(x+size*.10,y+size*.15,size*.985);ctx.fillStyle='#26372e';ctx.fill();
  poly(x,y,size*.97);ctx.fillStyle=TERRAIN_COLORS[terrain];ctx.fill();
  ctx.strokeStyle='#c1c7ab45';ctx.lineWidth=Math.max(.65,size*.025);ctx.stroke();
  ctx.save();poly(x,y,size*.91);ctx.clip();
  const g=ctx.createLinearGradient(x-size,y-size,x+size,y+size);g.addColorStop(0,'#e7d5b522');g.addColorStop(1,'#172b2d55');ctx.fillStyle=g;ctx.fillRect(x-size,y-size,size*2,size*2);
  const seed=(q*43+r*97+3);
  for(let i=0;i<5;i++){const tx=x+Math.sin(seed+i*13)*size*.68,ty=y+Math.cos(seed+i*7)*size*.6;disc(tx,ty,size*.028,'#d7d8bc22');}
  ctx.restore();
  if(terrain==='hill'){
    ctx.fillStyle='#4d5f53';
    ctx.beginPath();ctx.moveTo(x-size*.5,y+size*.33);ctx.lineTo(x-size*.1,y-size*.45);ctx.lineTo(x+size*.44,y+size*.24);ctx.closePath();ctx.fill();
    ctx.fillStyle='#c6c2a5';ctx.beginPath();ctx.moveTo(x-size*.1,y-size*.45);ctx.lineTo(x+size*.12,y-size*.04);ctx.lineTo(x-size*.27,y-size*.05);ctx.closePath();ctx.fill();
  }
  if(terrain==='forest'){
    for(const [dx,dy,sc] of [[-.36,-.15,.48],[.25,-.32,.4],[.35,.31,.37]]){
      const tx=x+dx*size,ty=y+dy*size;line(tx,ty+size*sc*.3,tx,ty+size*sc*.68,'#3e4a3d',Math.max(2,size*.055));
      ctx.fillStyle='#2e5348';ctx.beginPath();ctx.moveTo(tx,ty-size*sc);ctx.lineTo(tx-size*sc*.48,ty+size*sc*.23);ctx.lineTo(tx+size*sc*.48,ty+size*sc*.23);ctx.closePath();ctx.fill();
      line(tx,ty-size*sc*.6,tx-size*sc*.19,ty,'#9bad7a77',size*.028);
    }
  }
  if(terrain==='river'||terrain==='ford'){
    ctx.save();poly(x,y,size*.9);ctx.clip();
    for(let n=-2;n<=2;n++){ctx.beginPath();ctx.moveTo(x-size,y+n*size*.27);ctx.bezierCurveTo(x-size*.3,y+n*size*.3,x+size*.2,y+n*size*.21,x+size,y+n*size*.3);ctx.strokeStyle='#c7d2c36e';ctx.lineWidth=size*.026;ctx.stroke();}
    if(terrain==='ford'){for(let i=-2;i<=2;i++)ellipse(x+i*size*.26,y+Math.sin(i)*size*.14,size*.10,size*.07,'#b5ae8d');}
    ctx.restore();
  }
  if(terrain==='marsh'){for(let i=0;i<4;i++){const tx=x+Math.sin(q*13+r*7+i*2)*size*.57,ty=y+Math.cos(q*7+r*19+i)*size*.4;line(tx,ty,tx+size*.035,ty-size*.23,'#cad09a',size*.025);}}
  if(q===3&&r===2){
    // The objective is an ancient carved cairn, not a numerical UI marker.
    ellipse(x,y+size*.34,size*.42,size*.19,'#29332c90');
    ctx.fillStyle='#d6c7a4';ctx.beginPath();ctx.moveTo(x-size*.16,y+size*.28);ctx.lineTo(x-size*.20,y-size*.27);ctx.lineTo(x+size*.08,y-size*.47);ctx.lineTo(x+size*.28,y+size*.17);ctx.closePath();ctx.fill();
    line(x+size*.025,y-size*.28,x+size*.035,y+size*.1,'#655d4b',Math.max(1,size*.07));
    line(x-size*.08,y-size*.06,x+size*.12,y-size*.06,'#655d4b',Math.max(1,size*.07));
  }
  if(kind||chosen){
    poly(x,y,size*.94);ctx.lineWidth=chosen?Math.max(3,size*.09):Math.max(2,size*.075);
    ctx.strokeStyle=chosen?'#f7e4b1':kind==='attack'?'#f1a08a':'#a8dad0';ctx.stroke();
    if(kind==='move'){disc(x,y,size*.15,'#b9e4d7cc');}
  }
}
function paintUnit(u){
  const p=hexPoint(u.q,u.r),s=size,friend=u.side===0,main=SIDE_COLORS[u.side],dark=friend?'#244e56':'#673b34';
  const x=p.x,y=p.y+s*.04;
  ellipse(x+s*.06,y+s*.37,s*.42,s*.15,'#1a292a8c');
  ellipse(x,y+s*.23,s*.37,s*.14,'#27372f');ellipse(x,y+s*.18,s*.36,s*.145,main);
  ellipse(x,y+s*.11,s*.30,s*.10,dark);
  ctx.save();ctx.translate(x,y-s*.03);
  // Heavy miniature silhouettes: each piece keeps a readable weapon profile.
  if(u.type==='knight'){
    ellipse(0,s*.04,s*.29,s*.17,'#303634');
    ctx.fillStyle='#c4c3ae';ctx.fillRect(-s*.16,-s*.06,s*.18,s*.18);
    ellipse(-s*.2,s*.14,s*.1,s*.16,'#373e38');ellipse(s*.19,s*.14,s*.1,s*.16,'#373e38');
    poly(s*.02,-s*.19,s*.17);ctx.fillStyle=main;ctx.fill();
    line(s*.24,-s*.33,s*.32,-s*.01,'#d7d3bb',Math.max(2,s*.045));
  } else {
    ctx.fillStyle=dark;ctx.fillRect(-s*.16,-s*.02,s*.32,s*.23);
    ctx.fillStyle=main;ctx.beginPath();ctx.moveTo(-s*.15,s*.08);ctx.lineTo(0,-s*.22);ctx.lineTo(s*.17,s*.08);ctx.closePath();ctx.fill();
    disc(0,-s*.18,s*.16,'#c8c5b0');
    ctx.fillStyle='#414e48';ctx.fillRect(-s*.17,-s*.24,s*.34,s*.075);
    ctx.fillStyle=main;ctx.fillRect(-s*.055,-s*.31,s*.11,s*.18);
    if(u.type==='sword'){line(s*.18,-s*.3,s*.36,s*.02,'#e3dfc9',Math.max(2,s*.07));ellipse(-s*.22,s*.05,s*.13,s*.19,main);}
    if(u.type==='spear'){line(s*.24,-s*.55,s*.19,s*.15,'#d2c4a8',Math.max(2,s*.055));ctx.fillStyle='#e2e5da';ctx.beginPath();ctx.moveTo(s*.24,-s*.58);ctx.lineTo(s*.16,-s*.43);ctx.lineTo(s*.3,-s*.44);ctx.closePath();ctx.fill();}
    if(u.type==='bow'){ctx.strokeStyle='#d7b88c';ctx.lineWidth=Math.max(2,s*.07);ctx.beginPath();ctx.arc(s*.19,-s*.10,s*.2,-1.1,1.1);ctx.stroke();line(s*.29,-s*.28,s*.29,s*.08,'#eee5c7',Math.max(1,s*.025));}
  }
  ctx.restore();
  // Banner doubles as the command-range beacon.
  if(u.banner) {
    const topY=y-s*.65;
    line(x-s*.24,y+s*.12,x-s*.24,topY,'#d6c8a7',Math.max(2,s*.06));
    ctx.fillStyle=main;ctx.beginPath();ctx.moveTo(x-s*.24,topY);ctx.lineTo(x+s*.18,topY+s*.05);ctx.lineTo(x+s*.04,topY+s*.32);ctx.lineTo(x-s*.24,topY+s*.25);ctx.closePath();ctx.fill();
    line(x-s*.14,topY+s*.07,x-s*.02,topY+s*.2,'#e9ded1',Math.max(1,s*.036));
  }
  if(u.guard){ctx.strokeStyle='#e9dbbc';ctx.lineWidth=Math.max(1.5,s*.06);ctx.beginPath();ctx.arc(x,y-s*.03,s*.42,Math.PI*1.12,Math.PI*1.88);ctx.stroke();}
  // Health is shown on the base, without tiny unreadable numbers.
  for(let i=0;i<TYPES[u.type].hp;i++){
    const px=x+(i-(TYPES[u.type].hp-1)/2)*s*.17;
    ctx.fillStyle=i<u.hp?'#f0e7c9':'#2d3d38';ctx.fillRect(px-s*.055,y+s*.43,s*.11,Math.max(2,s*.075));
  }
  if(u.used){ctx.fillStyle='#17262178';ellipse(x,y+s*.02,s*.42,s*.44,'#1b2a2877');}
}
function draw(){
  if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewWidth,viewHeight);backdrop();
  if(portraitBoard){originX=viewWidth/2;originY=viewHeight/2;}
  else {
    const width=Math.sqrt(3)*size*(WIDTH+HEIGHT/2-1)+size*1.9;
    const height=1.5*size*(HEIGHT-1)+size*2;
    originX=(viewWidth-width)/2+size*.92;
    originY=(viewHeight-height)/2+size;
  }
  for(let r=0;r<HEIGHT;r++)for(let q=0;q<WIDTH;q++)paintTile(q,r);
  const b=selected?game.units.find(u=>u.id===selected):null;
  if(b?.banner && b.hp>0){
    for(let r=0;r<HEIGHT;r++)for(let q=0;q<WIDTH;q++)if(distance(b,{q,r})===2){
      const p=hexPoint(q,r);poly(p.x,p.y,size*.85);ctx.strokeStyle='#ece4bf55';ctx.lineWidth=1.3;ctx.stroke();
    }
  }
  for(const unit of game.units.filter(u=>u.hp>0).sort((a,b)=>hexPoint(a.q,a.r).y-hexPoint(b.q,b.r).y))paintUnit(unit);
  if(impact){
    const u=game.units.find(u=>u.id===impact.targetId),p=u?hexPoint(u.q,u.r):impact.p;
    if(p){ctx.strokeStyle='#ffd9aa';ctx.lineWidth=Math.max(2,size*.085);ctx.beginPath();ctx.arc(p.x,p.y,size*.6,0,Math.PI*2);ctx.stroke();}
  }
}
function resize(){
  const rect=canvas.getBoundingClientRect();
  viewWidth=Math.max(1,rect.width);viewHeight=Math.max(1,rect.height);
  dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(viewWidth*dpr);canvas.height=Math.round(viewHeight*dpr);
  portraitBoard=viewWidth<740 && viewHeight>viewWidth*1.05;
  size=portraitBoard
    ? Math.min((viewWidth-24)/8.4,(viewHeight-36)/16.2)
    : Math.min((viewWidth-18)/(Math.sqrt(3)*(WIDTH+HEIGHT/2)+1),(viewHeight-22)/(1.5*(HEIGHT-1)+2.3));
  size=Math.max(6,size);draw();
}
function update(){
  $('battleName').textContent=MAPS[game.mapId].name;
  $('roundLabel').textContent='РАУНД '+game.round+' / '+12;
  $('orders').textContent=game.orders;
  $('turnSmall').textContent=game.turn===0?'ХОД СЕВЕРА':'ХОД ЮГА';
  $('turnName').textContent=SIDES[game.turn];
  $('turnName').style.color=SIDE_COLORS[game.turn];
  const u=game.units.find(x=>x.id===selected && x.hp>0);
  const usable=!!u && u.side===game.turn&&!u.used&&game.winner===null && screen==='battle' && (game.mode==='hotseat'||game.turn===0);
  $('moveBtn').disabled=!usable;
  $('attackBtn').disabled=!usable||!game.units.some(t=>t.side!==u.side&&attackPreview(game,u,t));
  $('guardBtn').disabled=!usable;
  $('moveBtn').classList.toggle('active',usable&&tool==='move');
  $('attackBtn').classList.toggle('active',usable&&tool==='attack');
  $('unitMark').textContent=u?(u.banner?'⚑':({sword:'✦',spear:'⟐',bow:'⌁',knight:'♞'}[u.type])):'✧';
  $('unitMark').style.color=u?SIDE_COLORS[u.side]:'#dbc6a4';
  $('unitEyebrow').textContent=u?(u.banner?'НОСИТЕЛЬ ЗНАМЕНИ':'БОЕВОЙ ОТРЯД'):'ОТРЯД НЕ ВЫБРАН';
  $('unitName').textContent=u?TYPES[u.type].name:'Выбери войско';
  $('unitDescription').textContent=u?
     'Здоровье '+u.hp+'/'+TYPES[u.type].hp+' · ход '+TYPES[u.type].move+' · '+(commanded(game,u)?'под командованием':'вне связи со знаменем')+(u.used?' · приказ отдан':''):
     'Коснись своего отряда. Подсвеченные клетки покажут возможные действия.';
  $('rangeHint').textContent=u?'ДАЛЬНОСТЬ '+TYPES[u.type].range:'—';
  $('tacticalHint').textContent=game.turn===1&&game.mode==='ai'?'Противник отдаёт приказы…':u&&!commanded(game,u)?'Вне радиуса знамени: можно идти, нельзя атаковать.':
   'Удерживай центральный камень два своих хода для победы.';
  $('endTurn').disabled=game.winner!==null||(game.mode==='ai'&&game.turn===1)||screen!=='battle';
  $('endTurn').firstChild.textContent=game.mode==='ai'&&game.turn===1?'ХОД ПРОТИВНИКА ': 'ЗАВЕРШИТЬ ХОД ';
  $('dispatch').textContent=game.log[0]||'';
  draw();
}
function hitHex(x,y){
  let best=null,ds=Infinity;
  for(let r=0;r<HEIGHT;r++)for(let q=0;q<WIDTH;q++){
    const p=hexPoint(q,r),d=Math.hypot(p.x-x,p.y-y);
    if(d<ds){best={q,r};ds=d;}
  }
  return ds<=size*.98?best:null;
}
function activeTurn(){return screen==='battle' && game.winner===null && (game.mode==='hotseat'||game.turn===0);}
function selectUnit(u){
  if(!u || u.side!==game.turn){showNotice('Выбери собственный отряд');return;}
  if(u.used){showNotice('Отряд уже исполнил приказ');return;}
  selected=u.id;tool='move';update();sound('move');
}
function perform(action){
  const result=issue(game,action);
  if(result.error){showNotice(result.error);sound('error');return false;}
  game=result.state;selected=null;tool='move';persist();sound(action.kind==='attack'?'attack':action.kind==='move'?'move':'guard');
  if(action.kind==='attack'){impact={targetId:action.targetId};setTimeout(()=>{impact=null;draw();},170);}
  update();
  if(game.winner!==null){setTimeout(()=>modal('result'),220);return true;}
  if(game.orders===0){showNotice('Приказы исчерпаны — завершите ход');}
  return true;
}
canvas.addEventListener('pointerdown',event=>{pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY};});
canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
canvas.addEventListener('pointerup',event=>{
  if(!pointerStart||pointerStart.id!==event.pointerId)return;
  const moved=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y);
  pointerStart=null;
  if(moved>12)return;
  if(!activeTurn()||veil.classList.contains('hidden')===false)return;
  const rect=canvas.getBoundingClientRect(),p=hitHex(event.clientX-rect.left,event.clientY-rect.top);
  if(!p)return;
  const clicked=unitAt(game,p.q,p.r);
  if(clicked?.side===game.turn){selectUnit(clicked);return;}
  if(!selected){showNotice('Сначала выбери свой отряд');return;}
  const u=game.units.find(v=>v.id===selected);
  if(clicked && clicked.side!==game.turn){
    if(!attackPreview(game,u,clicked)){showNotice('Цель вне радиуса удара или командования');sound('error');return;}
    perform({kind:'attack',unitId:selected,targetId:clicked.id});return;
  }
  if(tool==='attack'){showNotice('Коснись вражеского отряда');return;}
  perform({kind:'move',unitId:selected,q:p.q,r:p.r});
});
$('moveBtn').addEventListener('click',()=>{tool='move';sound('move');update();});
$('attackBtn').addEventListener('click',()=>{tool='attack';sound('move');update();});
$('guardBtn').addEventListener('click',()=>{if(selected)perform({kind:'guard',unitId:selected});});
$('endTurn').addEventListener('click',()=>{
  if(!activeTurn())return;
  game=endTurn(game);selected=null;tool='move';persist();sound('turn');update();
  if(game.winner!==null){modal('result');return;}
  if(game.mode==='hotseat')modal('pass');else scheduleAi();
});
function scheduleAi(){
  clearTimeout(aiTimer);
  if(screen!=='battle'||!veil.classList.contains('hidden')||document.hidden||game.mode!=='ai'||game.turn!==1||game.winner!==null)return;
  aiTimer=setTimeout(()=>{
    if(screen!=='battle'||!veil.classList.contains('hidden')||document.hidden||game.turn!==1)return;
    const action=aiAction(game);
    if(action){
      const result=issue(game,action);
      if(!result.error){game=result.state;persist();sound(action.kind==='attack'?'attack':'move');update();}
      if(game.winner!==null){modal('result');return;}
    }
    if(game.orders===0||!action){
      game=endTurn(game);persist();update();
      if(game.winner!==null){modal('result');return;}
      showNotice('Твой ход');return;
    }
    scheduleAi();
  },310);
}
const sceneArt='<svg class="modal-art" viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="120" fill="#526357"/><path d="M0 78 80 48 144 66 210 24 270 54 332 19 400 54v67H0" fill="#3a5146"/><path d="M0 107q75-31 154-9 72-22 131-12 69-25 115-4v40H0" fill="#263b31"/><path d="M200 92V3" stroke="#d4c0a5" stroke-width="5"/><path d="M202 7 287 20 255 55 202 48Z" fill="#b66b54" stroke="#ddb99f" stroke-width="2"/><path d="M218 20V43M210 31h25" stroke="#f0dfca" stroke-width="4"/><path d="M45 99V64l22-18 24 18v35" fill="#a8ae99" stroke="#304239" stroke-width="3"/><path d="M41 65V52l28-22 28 23v14" fill="#4b5c51"/><path d="M320 101V65l20-15 20 15v35" fill="#a5ab96" stroke="#304239" stroke-width="3"/><path d="M317 69V54l24-20 23 19v16" fill="#455c4d"/><path d="M0 115h400" stroke="#b5b89e" stroke-width="2"/></svg>';
function modal(kind){
  clearTimeout(aiTimer);
  if(kind==='result'&&game.campaignContext){finishLinkedBattle();kind='campaignBattleResult';}
  if(kind==='home')setStage('home');
  screen=kind;
  veil.classList.remove('hidden');
  let html='';
  if(kind==='home'){
    html='<div class="modal-kicker">КНИГА I · ТАКТИЧЕСКИЙ ПРОЛОГ</div><h1 id="modalTitle">Чёрные знамёна</h1>'+sceneArt+
    '<p>Пять отрядов. Три приказа за ход. Удержи срединный камень два хода или уничтожь войско противника.</p>'+
    '<div class="modal-kicker">ПРОТИВНИК</div><div class="modal-setting"><button data-mode="ai">Против ИИ</button><button data-mode="hotseat">Вдвоём</button></div>'+
    '<div class="modal-kicker">ПОЛЕ</div><div class="modal-setting"><button data-map="pass">Пепельный перевал</button><button data-map="moor">Туманная пустошь</button></div>'+
    '<p id="mapDescription" class="modal-note"></p><div class="modal-actions">'+
    '<button class="primary" data-action="new">Начать сражение</button>'+
    (!game.winner&&readSaveExists()?'<button data-action="continue">Продолжить сохранённый бой</button>':'')+
    '<button class="secondary" data-action="rules">Правила</button><button class="secondary" data-action="sound">Звук: '+(audioEnabled?'включён':'выключен')+'</button><a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>'+
    (loadError?'<p class="modal-alert">'+esc(loadError)+'</p>':'');
  }
  if(kind==='home'){
    html=html.replace('КНИГА I · ТАКТИЧЕСКИЙ ПРОЛОГ','КНИГА II · ВОЙНА ТРЁХ КОРОН');
    html=html.replace('Пять отрядов. Три приказа за ход. Удержи срединный камень два хода или уничтожь войско противника.',
      'Три державы и двенадцать областей. Веди дружины по карте королевств, захватывай столицы и решай исход похода на гексагональном поле боя.');
    html=html.replace('<div class="modal-kicker">ПРОТИВНИК</div>',
      '<div class="modal-actions"><button class="primary" data-action="startCampaign">'+
      (campaign?.winner===null?'Продолжить кампанию':'Начать кампанию')+'</button>'+
      (campaign?'<button class="secondary" data-action="restartCampaign">Новая кампания</button>':'')+
      '</div><div class="modal-kicker" style="margin-top:16px">ОТДЕЛЬНАЯ БИТВА · ПРОТИВНИК</div>');
    html=html.replace('<button class="primary" data-action="new">Начать сражение</button>',
      '<button data-action="new">Начать отдельное сражение</button>');
  }
  if(kind==='pause'){
    html='<div class="modal-kicker">СТОЯНКА ПОЛКОВ</div><h1 id="modalTitle">Совет полководца</h1><p>Бой сохранён. Ты можешь вернуться к нему позднее.</p><div class="modal-actions">'+
    '<button class="primary" data-action="resume">Вернуться в бой</button><button data-action="rules">Правила и тактика</button>'+
    '<button data-action="sound">Звук: '+(audioEnabled?'включён':'выключен')+'</button>'+
    '<button class="danger" data-action="confirmRestart">Начать другой бой</button><a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='pause'&&game.campaignContext){
    html=html.replace('<button class="danger" data-action="confirmRestart">Начать другой бой</button>',
      campaign?.pending?.attackerSide===0?'<button class="danger" data-action="withdraw">Отступить с потерями</button>':'');
  }
  if(kind==='campaignPause'){
    html='<div class="modal-kicker">СТРАТЕГИЧЕСКИЙ СОВЕТ</div><h1 id="modalTitle">На карте королевств</h1>'+
    '<p>Война сохраняется после каждого приказа. Захвати Угольный мыс и Багровый трон, чтобы объединить пограничье.</p>'+
    '<div class="modal-actions"><button class="primary" data-action="returnCampaign">Вернуться к карте</button>'+
    '<button data-action="campaignRules">Правила кампании</button>'+
    '<button data-action="sound">Звук: '+(audioEnabled?'включён':'выключен')+'</button>'+
    '<button class="danger" data-action="restartCampaign">Начать новую кампанию</button>'+
    '<a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='campaignRules'){
    html='<div class="modal-kicker">УСТАВ ГРАНИЦЫ</div><h1 id="modalTitle">Как вести войну</h1>'+
    '<div class="modal-rules"><p><b>1.</b> Выбери свою область и одну из дружин. Прикажи ей марш, затем коснись соседней земли. Вражеское владение запускает настоящую тактическую битву.</p>'+
    '<p><b>2.</b> Доступны два стратегических приказа за сезон. Одна дружина может идти или пополняться лишь один раз за сезон. Победа приносит землю, но потери остаются с армией.</p>'+
    '<p><b>3.</b> Новая дружина стоит 9 серебра, пополнение +4 — 6, гарнизон +3 — 5. Сезон приносит доход земель и списывает содержание армий.</p>'+
    '<p><b>4.</b> Орден и Князья ходят после каждого сезона. Вражеское нападение на наши земли требует лично защитить провинцию.</p>'+
    '<p><b>5.</b> Захвати обе столицы врага: Угольный мыс и Багровый трон. Если падёт Северный оплот — война проиграна.</p></div>'+
    '<div class="modal-actions"><button class="primary" data-action="returnCampaign">На карту</button></div>';
  }
  if(kind==='campaignMarchConfirm'){
    const dest=PROVINCES[marchDestination];
    html='<div class="modal-kicker">ПРИКАЗ О НАСТУПЛЕНИИ</div><h1 id="modalTitle">'+esc(dest.name)+'</h1>'+
    '<p>Войска встретят сопротивление. Захват или оборона этой области будут решены на тактическом поле. Потери не исчезнут после боя.</p>'+
    '<div class="modal-actions"><button class="primary" data-action="commitMarch">Начать наступление</button>'+
    '<button data-action="returnCampaign">Отменить приказ</button></div>';
  }
  if(kind==='campaignWarning'){
    const p=campaign?.pending;
    html='<div class="modal-kicker">'+(p.attackerSide===0?'ПОХОД НЕ ЗАВЕРШЁН':'ВОЙНА ПРИШЛА НА ПОРОГ')+'</div><h1 id="modalTitle">'+esc(PROVINCES[p.to].name)+'</h1>'+
    '<p>'+esc(FACTIONS[p.attackerSide].name)+' ведёт армию силой '+p.attackerStrength+'. Защитники располагают '+p.defenderStrength+' силами. Исход изменит границу.</p>'+
    '<div class="modal-actions"><button class="primary" data-action="resume">'+(p.attackerSide===0?'Продолжить штурм':'Оборонять владение')+'</button>'+
    '<button data-action="rules">Правила боя</button></div>';
  }
  if(kind==='campaignBattleResult'){
    const rep=campaign?.report,place=rep?PROVINCES[rep.province]:null;
    html='<div class="modal-kicker">ИСХОД ПОХОДА</div><h1 id="modalTitle">'+(rep?.playerWon?'Знамя устояло':'Тяжёлый исход')+'</h1>'+
    '<p>'+(rep?.retreat?'Войско отошло. ':rep?.victory?'Область сменила владельца. ':'Защитники удержали землю. ')+
    esc(place?.name||'')+'. Потери наступавших: '+(rep?.attackerLoss||0)+', защитников: '+(rep?.defenderLoss||0)+'.</p>'+
    '<div class="modal-actions"><button class="primary" data-action="returnCampaign">Вернуться к карте</button>'+
    '<a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='campaignEnd'){
    html='<div class="modal-kicker">ПОСЛЕДНЯЯ ХРОНИКА</div><h1 id="modalTitle">'+
      (campaign?.winner===0?'Три короны объединены':'Северный союз пал')+'</h1>'+
      '<p>Война длилась '+(campaign?.season||0)+' сезонов. Завоёвано областей: '+
      (campaign?.provinces.filter(p=>p.owner===0).length||0)+'. Начни новую историю или изучи карту последнего года.</p>'+
      '<div class="modal-actions"><button class="primary" data-action="returnCampaign">Осмотреть карту</button>'+
      '<button data-action="restartCampaign">Новая кампания</button>'+
      '<a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='confirmCampaignRestart'){
    html='<div class="modal-kicker">ПОДТВЕРЖДЕНИЕ</div><h1 id="modalTitle">Стереть историю войны?</h1>'+
    '<p>Текущая кампания, её армии, территории и хронология будут безвозвратно заменены новой.</p>'+
    '<div class="modal-actions"><button class="danger" data-action="restartCampaignConfirmed">Начать новую войну</button>'+
    '<button class="primary" data-action="home">Не стирать</button></div>';
  }
  if(kind==='withdrawConfirm'){
    html='<div class="modal-kicker">ТЯЖЁЛОЕ РЕШЕНИЕ</div><h1 id="modalTitle">Приказать отход?</h1>'+
    '<p>Нападение будет сорвано. Армия сохранит только около двух третей своей силы. Отменить последствия нельзя.</p>'+
    '<div class="modal-actions"><button class="danger" data-action="withdrawConfirmed">Отступить</button>'+
    '<button class="primary" data-action="resume">Остаться в бою</button></div>';
  }
  if(kind==='rules'){
    html='<div class="modal-kicker">ПОЛЕВОЙ УСТАВ</div><h1 id="modalTitle">Порядок битвы</h1>'+
    '<div class="modal-rules"><p><b>1.</b> Выбери свой отряд, затем соседнюю доступную клетку для марша или противника для удара. Один отряд исполняет один приказ за ход.</p>'+
    '<p><b>2.</b> За ход доступны три приказа. Оборона даёт +1 защиты до твоего следующего хода. Удар и ответный удар рассчитываются без случайности.</p>'+
    '<p><b>3.</b> Мечники универсальны, копья особенно опасны коннице, лучники стреляют с 2–3 клеток, всадники быстры, но вязнут в лесу и болоте.</p>'+
    '<p><b>4.</b> Союзники возле цели усиливают атаку. Лес и холмы укрывают. Лучники не стреляют сквозь лес.</p>'+
    '<p><b>5.</b> Атака возможна лишь в радиусе двух гексов от твоего знамени. Если знаменосец погибнет, другой уцелевший отряд поднимет стяг.</p>'+
    '<p><b>6.</b> Удержи центральный камень два собственных хода подряд. Если бой затянется, после двенадцати раундов победит сохранивший больше сил.</p></div>'+
    '<div class="modal-actions"><button class="primary" data-action="back">Понятно</button><a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='pass'){
    html='<div class="modal-kicker">СМЕНА КОМАНДОВАНИЯ</div><h1 id="modalTitle">Передай устройство</h1><p>Теперь действует '+esc(SIDES[game.turn])+'. Другой полководец готов принять командование.</p><div class="modal-actions"><button class="primary" data-action="resume">Принять командование</button><a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='result'){
    const title=game.winner==='draw'?'Ничья':game.winner===0?'Север одержал верх':'Юг одержал верх';
    const score0=game.units.filter(u=>u.side===0).reduce((x,u)=>x+u.hp,0);
    const score1=game.units.filter(u=>u.side===1).reduce((x,u)=>x+u.hp,0);
    html='<div class="modal-kicker">ХРОНИКА СРАЖЕНИЯ</div><h1 id="modalTitle">'+title+'</h1>'+sceneArt+
    '<p>'+esc(game.reason)+'. Север сохранил '+score0+' здоровья войска, Юг — '+score1+'.</p>'+
    '<div class="modal-actions"><button class="primary" data-action="replay">Переиграть битву</button><button data-action="home">Выбрать другое поле</button><a href="../../" data-app-control>← Вернуться в Pocket Works</a></div>';
  }
  if(kind==='confirmNew'){
    html='<div class="modal-kicker">ПОДТВЕРЖДЕНИЕ</div><h1 id="modalTitle">Забыть прежнюю битву?</h1><p>Новое сражение заменит сохранённый поход. Это действие невозможно отменить.</p><div class="modal-actions"><button class="danger" data-action="newConfirmed">Да, начать новую битву</button><button class="primary" data-action="home">Вернуться к выбору</button></div>';
  }
  if(kind==='confirmRestart'){
    html='<div class="modal-kicker">ПОДТВЕРЖДЕНИЕ</div><h1 id="modalTitle">Покинуть поход?</h1><p>Текущий бой будет заменён новым. Его ход уже нельзя будет восстановить.</p><div class="modal-actions"><button class="danger" data-action="home">Да, завершить этот бой</button><button class="primary" data-action="resume">Нет, вернуться</button></div>';
  }
  veilContent.innerHTML=html;
  if(kind==='home')syncOptions();
  update();
}
function readSaveExists(){try{const raw=localStorage.getItem(STORAGE);return !!raw && validSaved(JSON.parse(raw));}catch{return false;}}
function syncOptions(){
  veilContent.querySelectorAll('[data-mode]').forEach(el=>el.classList.toggle('chosen',el.dataset.mode===pickMode));
  veilContent.querySelectorAll('[data-map]').forEach(el=>el.classList.toggle('chosen',el.dataset.map===pickMap));
  if($('mapDescription'))$('mapDescription').textContent=MAPS[pickMap].description;
}
function closeModal(){setStage('battle');screen='battle';veil.classList.add('hidden');resize();update();scheduleAi();}
$('openMenu').addEventListener('click',()=>{
 if(screen==='campaign')modal('campaignPause');
 else if(screen==='home')modal('home');
 else if(screen==='campaignEnd'||screen==='campaignBattleResult')modal(screen);
 else modal('pause');
});
veilContent.addEventListener('click',event=>{
  const el=event.target.closest('button');if(!el)return;
  if(el.dataset.map){pickMap=el.dataset.map;syncOptions();sound('move');return;}
  if(el.dataset.mode){pickMode=el.dataset.mode;syncOptions();sound('move');return;}
  const action=el.dataset.action;
  if(action==='sound'){audioEnabled=!audioEnabled;writePrefs();sound('turn');modal(screen);return;}
  if(action==='startCampaign'){
    if(!campaign||campaign.winner!==null){campaign=createCampaign();selectedArmy='army-1';selectedProvince=1;persistCampaign();}
    openStrategic();return;
  }
  if(action==='restartCampaign'){modal('confirmCampaignRestart');return;}
  if(action==='restartCampaignConfirmed'){
    campaign=createCampaign();selectedProvince=1;selectedArmy='army-1';linkedSave=null;persistCampaign();
    try{localStorage.removeItem(LINKED_BATTLE_KEY);}catch{}
    openStrategic();return;
  }
  if(action==='returnCampaign'){openStrategic(false);return;}
  if(action==='campaignRules'){previousModal=screen;modal('campaignRules');return;}
  if(action==='commitMarch'){
    const a=campaign?.armies.find(a=>a.id===selectedArmy);
    if(!a){openStrategic();return;}
    selectedProvince=marchDestination;
    campaignAction(march(campaign,a.id,marchDestination));return;
  }
  if(action==='withdraw'){modal('withdrawConfirm');return;}
  if(action==='withdrawConfirmed'){
    const result=retreatCampaignBattle(campaign);
    if(result.error){showNotice(result.error);modal('pause');return;}
    campaign=result.state;linkedSave=null;persistCampaign();
    try{localStorage.removeItem(LINKED_BATTLE_KEY);}catch{}
    modal('campaignBattleResult');return;
  }

  if(action==='new' && readSaveExists() && game.winner===null){
    modal('confirmNew');return;
  }
  if(action==='newConfirmed'||action==='new'||action==='replay'){
    game=createBattle(action==='replay'?game.mapId:pickMap,action==='replay'?game.mode:pickMode);
    selected=null;tool='move';persist();sound('turn');closeModal();showNotice('Веди войска к срединному камню');return;
  }
  if(action==='continue'||action==='resume'){
    if(action==='continue'){try{const saved=JSON.parse(localStorage.getItem(STORAGE)||'null');if(saved&&validSaved(saved))game=saved;}catch{}}
    closeModal();return;
  }
  if(action==='rules'){previousModal=screen;modal('rules');return;}
  if(action==='back'){modal(previousModal||'home');return;}
  if(action==='confirmRestart'){modal('confirmRestart');return;}
  if(action==='home'){modal('home');return;}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && screen==='campaign')modal('campaignPause');
  else if(e.key==='Escape' && screen==='campaignPause')openStrategic();
  else if(e.key==='Escape' && screen==='battle')modal('pause');
  else if(e.key==='Escape' && screen==='pause')closeModal();
  else if(screen==='battle'&&['1','2','3','4','5'].includes(e.key) && activeTurn()){
    const units=game.units.filter(u=>u.side===game.turn&&u.hp>0);
    if(units[Number(e.key)-1])selectUnit(units[Number(e.key)-1]);
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(aiTimer);persist();persistCampaign();}else{if(screen==='campaign')renderStrategic();else{resize();scheduleAi();}}});
window.addEventListener('pagehide',()=>{clearTimeout(aiTimer);persist();persistCampaign();});
window.addEventListener('resize',()=>{if(screen==='campaign')renderStrategic();else resize();});
if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe($('canvasFrame'));
window.__blackBannersTestState=()=>({screen,game,selected,tool,campaign,marchMode,selectedArmy,selectedProvince});
update();resize();modal('home');
