import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  VERSION, BATTLE_COUNT, WORLD_WIDTH, WORLD_HEIGHT,
  FIELDS, ORDINARIES, MOTTOS, CATALOGS,
  createCampaign, hydrateCampaign, prepareBattle, recordBattle, applyOffer,
  doctrineLayers, doctrineName, createBattleState, stepBattle, summarizeBattle
} from './engine.js';
import { HERALDIC_SCHOOLS, heraldicIdentity, schoolForDoctrine, liveryForDoctrine } from './heraldry.js';

const RELEASE = '4.3.0';
installMobileRuntime();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const store = createVersionedStore({
  namespace:'pocket-works:blazon', version:VERSION,
  defaults:{settings:{sound:true},campaign:null,stats:{runs:0,victories:0}}
});

let settings=store.get('settings');
let campaign=hydrateCampaign(store.get('campaign'));
let stats=store.get('stats');
let setup={field:null,ordinary:null};
let battleState=null;
let battleSummary=null;
let battleRunning=false;
let paused=false;
let speed=1;
let lastFrame=0;
let accumulator=0;
let lastEventCount=0;
let audio=null;
let flashTimer=0;
let renderMetrics={dpr:1,width:1,height:1,baseScale:1};
let replayAnimation=0;
let replayMomentIndex=0;
let camera={x:WORLD_WIDTH/2,y:WORLD_HEIGHT/2,zoom:.93,targetX:WORLD_WIDTH/2,targetY:WORLD_HEIGHT/2,targetZoom:.93};

const screens={menu:$('#menuScreen'),doctrine:$('#doctrineScreen'),battle:$('#battleScreen')};
const dialogs={setup:$('#setupDialog'),rules:$('#rulesDialog'),result:$('#resultDialog'),reward:$('#rewardDialog'),ending:$('#endingDialog')};
const canvas=$('#battleCanvas');
const ctx=canvas.getContext('2d');

const livingStyle=document.createElement('link');
livingStyle.rel='stylesheet';
livingStyle.href=`./living-battle.css?v=${RELEASE}`;
document.head.append(livingStyle);
const footer=$('.menu-screen footer');
if(footer)footer.textContent=`v${RELEASE} · battle reading · видимая доктрина`;
const battleFooter=$('.battle-footer span');
if(battleFooter)battleFooter.hidden=true;

const resultReading=document.createElement('section');
resultReading.className='result-reading';
resultReading.innerHTML=`<div class="moment-replay"><canvas id="momentReplayCanvas" width="720" height="430" aria-label="Повтор ключевого момента"></canvas><div class="moment-replay-caption" id="momentReplayCaption"></div></div><div class="moment-buttons" id="momentButtons"></div>`;
$('#resultMeasures').after(resultReading);
const replayCanvas=$('#momentReplayCanvas');
const replayCtx=replayCanvas.getContext('2d');
const tacticalHeading=$('.tactical-log h3');
if(tacticalHeading)tacticalHeading.textContent='Почему решился бой';

function persist(){store.patch({settings,campaign,stats});}
function showScreen(name){Object.entries(screens).forEach(([key,node])=>node.classList.toggle('is-active',key===name));}
function openDialog(dialog){if(!dialog.open)dialog.showModal();}
function closeDialog(dialog){if(dialog.open)dialog.close();}
function fmtTime(value){const sec=Math.max(0,Math.floor(value));return`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function roman(number){return['I','II','III','IV','V','VI'][number-1]||number;}
function vibrate(value){try{navigator.vibrate?.(value);}catch{}}
function sound(type){
  if(!settings.sound)return;
  try{
    audio||=new AudioContext();if(audio.state==='suspended')audio.resume();
    const map={tap:[220,.04],seal:[150,.1],horn:[95,.35],win:[180,.45],lose:[90,.4],impact:[72,.05],volley:[118,.11]};
    const[f,d]=map[type]||map.tap,o=audio.createOscillator(),g=audio.createGain();
    o.type=type==='horn'?'sawtooth':'triangle';o.frequency.setValueAtTime(f,audio.currentTime);
    if(type==='win')o.frequency.exponentialRampToValueAtTime(f*2.2,audio.currentTime+d);
    g.gain.setValueAtTime(.0001,audio.currentTime);g.gain.exponentialRampToValueAtTime(.045,audio.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+d);
    o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d+.03);
  }catch{}
}

function ordinaryMarkup(id,fill,clip){
  const common=`fill="${fill}" clip-path="url(#${clip})" class="ordinary"`;
  if(id==='pale')return`<rect x="45" y="30" width="30" height="146" ${common}/>`;
  if(id==='fess')return`<rect x="14" y="79" width="92" height="31" ${common}/>`;
  if(id==='bend')return`<path d="M-5 48 18 26 126 146 104 169Z" ${common}/>`;
  if(id==='chevron')return`<path d="M22 134 60 86 99 134" fill="none" stroke="${fill}" stroke-width="22" stroke-linejoin="miter" clip-path="url(#${clip})" class="ordinary"/>`;
  return'';
}
function useCharge(id,placement,color,outline,className){
  if(!id||!placement)return'';const flip=placement.flip?-1:1,rotate=placement.rotate||0,anchorX=placement.flip?placement.x+120*placement.scale:placement.x;
  return`<g class="${className}" style="color:${color};--detail:${outline};--charge-outline:${outline}" transform="translate(${anchorX} ${placement.y}) rotate(${rotate}) scale(${placement.scale*flip} ${placement.scale})"><use href="#charge-${id}"></use></g>`;
}
function schoolOrnament(identity,compact){
  if(compact)return'';const{school,palette}=identity;
  if(school.id==='imperial')return`<path class="mantle mantle-imperial" d="M22 34C5 59 7 121 18 160L39 133L60 177L81 133L102 160C113 121 115 59 98 34L78 52L60 25L42 52Z"/><path class="mantle-lining" d="M30 45C18 73 21 119 28 141L44 119L60 158L76 119L92 141C99 119 102 73 90 45L73 59L60 39L47 59Z"/>`;
  if(school.id==='civic')return`<g class="civic-wreath" style="color:${palette.accent}"><path d="M18 151C5 116 8 80 28 51M102 151c13-35 10-71-10-100"/><path d="m20 130-14-10m18-7-16-8m21-9-16-6m75 40 14-10m-18-7 16-8m-21-9 16-6"/></g><path class="mural-crown" d="M35 29V15h10v8h10v-8h10v8h10v-8h10v14Z"/>`;
  if(school.id==='knightly')return`<path class="mantle mantle-knightly" d="M25 39C8 67 10 128 24 159L42 128L60 170L78 128L96 159C110 128 112 67 95 39L77 55L60 31L43 55Z"/><path class="mantle-lining" d="M34 50C24 79 27 117 32 136L46 114L60 151L74 114L88 136C93 117 96 79 86 50L70 62L60 45L50 62Z"/>`;
  return`<path class="mantle mantle-northern" d="M29 34C15 62 16 120 25 160L43 133L60 179L77 133L95 160C104 120 105 62 91 34L76 51L60 27L44 51Z"/><path class="fur-edge" d="M30 42c6 4 10-5 16 0 6 5 9-6 15 0 6 5 10-5 16 0 6 5 9-5 14 0"/>`;
}
function commandMarkup(doctrine,identity){
  const{palette,school}=identity;
  if(doctrine.command==='crown')return useCharge('crown',{x:39,y:school.id==='civic'?18:3,scale:.35},palette.metal,palette.ink,'external-mark command-crown');
  if(doctrine.command==='helmet')return`${useCharge('helmet',{x:38,y:2,scale:.37},'#8e8b82',palette.ink,'external-mark command-helmet')}<path class="crest-plume" style="fill:${palette.accent}" d="M52 9C61-8 80-5 86 8C73 4 65 10 59 22Z"/>`;
  if(doctrine.command==='chain')return`<ellipse class="achievement-chain" cx="60" cy="106" rx="49" ry="62" style="stroke:${palette.metal}"/>`;
  return'';
}
function achievementMarkup(doctrine,id='coat',compact=false){
  const identity=heraldicIdentity(doctrine),{palette,shield,composition,school}=identity,clip=`${id}-clip`,gradient=`${id}-field`;
  const main=doctrine.main?useCharge(doctrine.main,composition.main,palette.main,palette.ink,'charge-main'):'';
  const secondary=doctrine.secondary?composition.secondary.map(p=>useCharge(doctrine.secondary,p,palette.accent,palette.metal,'charge-secondary')).join(''):'';
  const motto=doctrine.motto?(MOTTOS[doctrine.motto]?.name||''):'—';
  return`<svg class="achievement achievement-${school.id}" data-school="${school.id}" viewBox="0 0 120 190" role="img" aria-label="${doctrineName(doctrine)}"><defs><clipPath id="${clip}"><path d="${shield.path}"/></clipPath><linearGradient id="${gradient}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.field}"/><stop offset=".5" stop-color="${palette.field}"/><stop offset="1" stop-color="${palette.ink}" stop-opacity=".28"/></linearGradient><pattern id="${id}-grain" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 1h7M2 0v7" stroke="rgba(255,255,255,.055)" stroke-width=".45"/></pattern></defs>${schoolOrnament(identity,compact)}${compact?'':commandMarkup(doctrine,identity)}<path class="achievement-shadow" d="${shield.path}" transform="translate(0 2)"/><path class="achievement-shield" fill="url(#${gradient})" d="${shield.path}"/><path class="achievement-grain" fill="url(#${id}-grain)" d="${shield.path}"/>${ordinaryMarkup(doctrine.ordinary,palette.metal,clip)}<path class="ordinary-highlight" d="${shield.path}" clip-path="url(#${clip})"/><path class="achievement-inner" d="${shield.inner}"/>${main}${secondary}<path class="achievement-edge" d="${shield.path}" style="stroke:${palette.metal}"/>${compact?'':`<path class="motto-scroll" style="fill:${palette.metal};stroke:${palette.ink}" d="M11 158C31 153 89 153 109 158L101 181C81 176 39 176 19 181Z"/><text class="motto-copy" x="60" y="171" text-anchor="middle">${motto}</text>`}</svg>`;
}
function layerLabel(slot){return{field:'Поле',ordinary:'Строй',main:'Ратники',secondary:'Лучники',command:'Командование',motto:'Девиз'}[slot];}
function renderLedger(node,doctrine){node.innerHTML=doctrineLayers(doctrine).map(({slot,definition})=>`<div class="layer-row${definition?'':' is-empty'}"><span>${layerLabel(slot)}</span><div><strong>${definition?.name||'Не начертано'}</strong><small>${definition?.summary||'Этот слой откроется после следующего боя.'}</small></div></div>`).join('');}
function renderMenu(){
  $('#soundButton').textContent=`Звук: ${settings.sound?'вкл':'выкл'}`;$('#continueButton').hidden=!campaign||campaign.completed;
  if(campaign&&!campaign.completed)$('#continueCaption').textContent=`Битва ${campaign.battleIndex+1} из ${BATTLE_COUNT}`;
  const d=campaign?.doctrine||{field:'gules',ordinary:'bend',main:'lion',secondary:'eagle',command:'helmet',motto:'breach'};$('#menuHeraldry').innerHTML=achievementMarkup(d,'menu',true);
}
function renderDoctrine(){
  campaign=prepareBattle(campaign);persist();const ps=HERALDIC_SCHOOLS[schoolForDoctrine(campaign.doctrine)],es=HERALDIC_SCHOOLS[schoolForDoctrine(campaign.currentEnemy)];
  $('#battleIndexLabel').textContent=`БИТВА ${roman(campaign.battleIndex+1)} ИЗ ${roman(BATTLE_COUNT)}`;$('#integrityMarks').textContent=`${'◆'.repeat(campaign.integrity)}${'◇'.repeat(3-campaign.integrity)}`;
  $('#playerDoctrineName').textContent=doctrineName(campaign.doctrine);$('#enemyDoctrineName').textContent=doctrineName(campaign.currentEnemy);$('#playerSchoolName').textContent=ps.name;$('#enemySchoolName').textContent=es.name;
  $('#playerAchievement').innerHTML=achievementMarkup(campaign.doctrine,'player');$('#enemyAchievement').innerHTML=achievementMarkup(campaign.currentEnemy,'enemy');renderLedger($('#playerLedger'),campaign.doctrine);renderLedger($('#enemyLedger'),campaign.currentEnemy);
}
function renderSetup(){
  $('#fieldChoices').innerHTML=Object.values(FIELDS).map(item=>{const l=liveryForDoctrine({field:item.id,ordinary:setup.ordinary||'pale'});return`<button class="doctrine-choice${setup.field===item.id?' is-selected':''}" data-field="${item.id}"><i class="tincture-swatch" style="--field:${l.primary};--metal:${l.metal};--accent:${l.accent}"></i><strong>${item.name}</strong><span>${item.summary}</span></button>`;}).join('');
  $('#ordinaryChoices').innerHTML=Object.values(ORDINARIES).map(item=>{const school=HERALDIC_SCHOOLS[schoolForDoctrine({ordinary:item.id})];return`<button class="doctrine-choice${setup.ordinary===item.id?' is-selected':''}" data-ordinary-choice="${item.id}"><i class="ordinary-preview" data-ordinary="${item.id}" data-school="${school.id}"></i><em>${school.short}</em><strong>${item.name}</strong><span>${item.summary}</span></button>`;}).join('');
  $('#sealSetupButton').disabled=!(setup.field&&setup.ordinary);$$('[data-field]').forEach(b=>b.addEventListener('click',()=>{setup.field=b.dataset.field;sound('tap');renderSetup();}));$$('[data-ordinary-choice]').forEach(b=>b.addEventListener('click',()=>{setup.ordinary=b.dataset.ordinaryChoice;sound('tap');renderSetup();}));
}
function startNewSetup(){setup={field:null,ordinary:null};renderSetup();openDialog(dialogs.setup);}
function sealSetup(){if(!setup.field||!setup.ordinary)return;campaign=createCampaign(setup.field,setup.ordinary,Date.now());stats.runs++;persist();closeDialog(dialogs.setup);renderDoctrine();showScreen('doctrine');sound('seal');vibrate(15);}
function continueCampaign(){if(!campaign)return;if(campaign.phase==='reward'&&campaign.offers?.length){renderRewards();openDialog(dialogs.reward);}else if(campaign.phase==='ending'){renderEnding();openDialog(dialogs.ending);}else{renderDoctrine();showScreen('doctrine');}}

function startBattle(replay=false){
  if(!replay){campaign=prepareBattle(campaign);persist();}
  battleState=createBattleState(campaign.doctrine,campaign.currentEnemy,campaign.currentSeed);battleSummary=null;battleRunning=true;paused=false;speed=1;accumulator=0;lastEventCount=0;
  camera={x:WORLD_WIDTH/2,y:WORLD_HEIGHT/2,zoom:.93,targetX:WORLD_WIDTH/2,targetY:WORLD_HEIGHT/2,targetZoom:.93};
  $$('.speed-controls button').forEach(b=>b.classList.toggle('is-active',b.dataset.speed==='1'));$('#hudPlayerShield').innerHTML=achievementMarkup(campaign.doctrine,'hud-player',true);$('#hudEnemyShield').innerHTML=achievementMarkup(campaign.currentEnemy,'hud-enemy',true);
  showScreen('battle');sound('horn');requestAnimationFrame(()=>{resizeCanvas();lastFrame=performance.now();requestAnimationFrame(frame);});
}
function resizeCanvas(){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));
  renderMetrics={dpr,width:rect.width,height:rect.height,baseScale:Math.min(rect.width/WORLD_WIDTH,rect.height/WORLD_HEIGHT)};
}
function frame(now){
  if(!battleRunning)return;const elapsed=Math.min(.08,(now-lastFrame)/1000);lastFrame=now;
  if(!paused){accumulator+=elapsed*speed;while(accumulator>=.05&&battleState.status==='running'){stepBattle(battleState,.05);accumulator-=.05;}}
  updateCamera(elapsed);drawBattle();updateBattleHud();
  if(battleState.events.length>lastEventCount){const fresh=battleState.events.slice(lastEventCount).filter(event=>event.rule!=='deployment'&&event.rule!=='casualty');if(fresh.length)flashRule(fresh.at(-1));if(fresh.some(event=>event.rule==='volley'))sound('volley');lastEventCount=battleState.events.length;}
  if(battleState.status==='finished'){battleRunning=false;battleSummary=summarizeBattle(battleState);setTimeout(showResult,450);return;}
  requestAnimationFrame(frame);
}
function aliveCount(army){return[...army.infantry,...army.archers].flatMap(s=>s.members).filter(m=>m.state!=='fallen'&&m.hp>0).length;}
function cohesionMarks(army){return army.infantry.map(s=>s.broken?'◇':s.cohesion<.45?'◈':'◆').join('');}
function updateBattleHud(){
  $('#battleClock').textContent=fmtTime(battleState.time);
  $('#playerFormation').innerHTML=`<span>${aliveCount(battleState.player)}</span><small>${cohesionMarks(battleState.player)}</small>`;
  $('#enemyFormation').innerHTML=`<span>${aliveCount(battleState.enemy)}</span><small>${cohesionMarks(battleState.enemy)}</small>`;
}
function flashRule(event){
  const node=$('#ruleFlash'),prefix={break:'◇',crisis:'!',motto:'✦',contact:'⚔',main:'◆',field:'◌',doctrine:'◆',volley:'➶',victory:'✦'}[event.rule]||'·';
  node.textContent=`${prefix} ${event.text}`;node.classList.add('is-visible');clearTimeout(flashTimer);flashTimer=setTimeout(()=>node.classList.remove('is-visible'),760);
}
function updateCamera(dt){
  const state=battleState;if(!state)return;
  camera.targetX=WORLD_WIDTH/2;camera.targetY=WORLD_HEIGHT/2;camera.targetZoom=.93;
  if(state.firstContact){
    const engaged=[];for(const army of[state.player,state.enemy])for(const squad of army.infantry)for(const m of squad.members)if(m.state==='fighting')engaged.push(m);
    camera.targetY=engaged.length?engaged.reduce((n,m)=>n+m.y,0)/engaged.length:state.frontY;camera.targetX=engaged.length?engaged.reduce((n,m)=>n+m.x,0)/engaged.length:WORLD_WIDTH/2;camera.targetZoom=1.08;
  }
  const pCapture=state.player.banner.capture,eCapture=state.enemy.banner.capture;
  if(pCapture>.2||eCapture>.2||state.player.brokenCount>=2||state.enemy.brokenCount>=2){camera.targetZoom=.98;camera.targetY=pCapture>eCapture?state.player.banner.y-100:eCapture>pCapture?state.enemy.banner.y+100:state.frontY;}
  const ease=1-Math.exp(-dt*2.4);camera.x+=(camera.targetX-camera.x)*ease;camera.y+=(camera.targetY-camera.y)*ease;camera.zoom+=(camera.targetZoom-camera.zoom)*ease;
  const visibleH=renderMetrics.height/(renderMetrics.baseScale*camera.zoom);camera.y=Math.max(visibleH/2-15,Math.min(WORLD_HEIGHT-visibleH/2+15,camera.y));
}
function setWorldTransform(){
  const {dpr,width,height,baseScale}=renderMetrics,scale=baseScale*camera.zoom,ox=width/2-camera.x*scale,oy=height/2-camera.y*scale;
  ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
}
function drawField(){
  const gradient=ctx.createLinearGradient(0,0,0,WORLD_HEIGHT);gradient.addColorStop(0,'#38493e');gradient.addColorStop(.48,'#596b54');gradient.addColorStop(.52,'#596b54');gradient.addColorStop(1,'#334438');ctx.fillStyle=gradient;ctx.fillRect(0,0,WORLD_WIDTH,WORLD_HEIGHT);
  ctx.fillStyle='rgba(218,202,150,.055)';ctx.beginPath();ctx.moveTo(292,0);ctx.bezierCurveTo(335,220,275,390,318,560);ctx.bezierCurveTo(368,760,313,930,350,1120);ctx.lineTo(445,1120);ctx.bezierCurveTo(402,920,458,748,410,560);ctx.bezierCurveTo(365,382,428,210,390,0);ctx.closePath();ctx.fill();
  for(let y=120;y<WORLD_HEIGHT;y+=82){ctx.strokeStyle='rgba(236,218,160,.08)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(180,y-13,535,y+14,WORLD_WIDTH,y-4);ctx.stroke();}
  for(let i=0;i<95;i++){const x=(i*149)%WORLD_WIDTH,y=60+((i*89)%(WORLD_HEIGHT-100));ctx.strokeStyle=i%4?'rgba(18,31,21,.25)':'rgba(226,204,144,.13)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+((i%5)-2)*1.8,y-5-(i%4));ctx.stroke();}
  ctx.strokeStyle='rgba(224,204,147,.13)';ctx.setLineDash([9,13]);ctx.beginPath();ctx.moveTo(42,battleState.frontY);ctx.lineTo(WORLD_WIDTH-42,battleState.frontY);ctx.stroke();ctx.setLineDash([]);
}
function drawTinyEmblem(id,x,y,size,color){
  ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,size*.12);
  if(id==='lion'){ctx.beginPath();ctx.arc(0,0,size*.27,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.2,size*.15);ctx.lineTo(-size*.42,size*.42);ctx.moveTo(size*.18,size*.15);ctx.lineTo(size*.42,size*.4);ctx.stroke();}
  else if(id==='boar'){ctx.beginPath();ctx.ellipse(0,0,size*.38,size*.24,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(size*.28,-size*.05);ctx.lineTo(size*.48,-size*.18);ctx.lineTo(size*.37,size*.08);ctx.fill();}
  else if(id==='tower'){ctx.fillRect(-size*.32,-size*.3,size*.64,size*.65);for(let i=-1;i<=1;i++)ctx.fillRect(i*size*.23-size*.08,-size*.45,size*.16,size*.18);}
  else if(id==='stag'){ctx.beginPath();ctx.arc(0,size*.05,size*.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-size*.12,-size*.12);ctx.lineTo(-size*.32,-size*.43);ctx.moveTo(size*.12,-size*.12);ctx.lineTo(size*.32,-size*.43);ctx.stroke();}
  else if(id==='eagle'){ctx.beginPath();ctx.moveTo(0,size*.3);ctx.lineTo(-size*.46,-size*.25);ctx.lineTo(-size*.08,-size*.08);ctx.lineTo(0,-size*.38);ctx.lineTo(size*.08,-size*.08);ctx.lineTo(size*.46,-size*.25);ctx.closePath();ctx.fill();}
  else if(id==='rose'){for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*Math.PI*2/5);ctx.beginPath();ctx.ellipse(0,-size*.24,size*.15,size*.28,0,0,Math.PI*2);ctx.fill();ctx.restore();}}
  else if(id==='key'){ctx.beginPath();ctx.arc(-size*.18,-size*.16,size*.16,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-size*.05,-size*.04);ctx.lineTo(size*.35,size*.36);ctx.moveTo(size*.2,size*.2);ctx.lineTo(size*.34,size*.07);ctx.stroke();}
  else if(id==='sun'){ctx.beginPath();ctx.arc(0,0,size*.24,0,Math.PI*2);ctx.fill();for(let i=0;i<8;i++){ctx.save();ctx.rotate(i*Math.PI/4);ctx.beginPath();ctx.moveTo(0,-size*.32);ctx.lineTo(0,-size*.5);ctx.stroke();ctx.restore();}}
  ctx.restore();
}
function drawBanner(army,doctrine){
  const l=liveryForDoctrine(doctrine),top=army.side==='enemy',side=top?-1:1,wave=Math.sin(battleState.time*2.2+(top?1:4))*5;
  ctx.save();ctx.translate(army.banner.x,army.banner.y);ctx.strokeStyle='#5b3b1b';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,45);ctx.lineTo(0,-72);ctx.stroke();
  ctx.fillStyle=l.primary;ctx.beginPath();ctx.moveTo(0,-67);ctx.quadraticCurveTo(side*42,-72+wave,side*86,-54);ctx.lineTo(side*78,-7);ctx.quadraticCurveTo(side*38,-25-wave*.45,0,-18);ctx.closePath();ctx.fill();ctx.strokeStyle=l.metal;ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle=l.metal;if(doctrine.ordinary==='pale')ctx.fillRect(Math.min(side*50,side*30),-64,20,52);else if(doctrine.ordinary==='fess')ctx.fillRect(Math.min(side*79,0),-43,79,13);else if(doctrine.ordinary==='bend'){ctx.save();ctx.translate(side*43,-39);ctx.rotate(-side*.55);ctx.fillRect(-6,-37,12,74);ctx.restore();}else{ctx.strokeStyle=l.metal;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(side*18,-15);ctx.lineTo(side*43,-47);ctx.lineTo(side*68,-15);ctx.stroke();}
  drawTinyEmblem(doctrine.main,side*43,-38,26,l.emblem);ctx.fillStyle='rgba(0,0,0,.26)';ctx.fillRect(-31,49,62,8);ctx.restore();
  if(army.banner.capture>0){ctx.fillStyle=l.metal;ctx.fillRect(army.banner.x-32,army.banner.y+64,64*(army.banner.capture/3),5);}
}
function warriorList(){const list=[];for(const army of[battleState.player,battleState.enemy])for(const squad of[...army.archers,...army.infantry])for(const member of squad.members)list.push({army,squad,member});return list;}
function drawFallen(member,squad,doctrine){
  if(member.fallenAt===null)return;const l=liveryForDoctrine(doctrine),fade=Math.max(.25,1-(battleState.time-member.fallenAt)/19);ctx.save();ctx.globalAlpha=fade;ctx.translate(member.x,member.y);ctx.rotate((member.side==='player'?-1:1)*Math.PI*.46);ctx.fillStyle='rgba(0,0,0,.24)';ctx.beginPath();ctx.ellipse(0,5,14,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=l.primary;ctx.fillRect(-9,-4,18,8);ctx.fillStyle=l.metal;ctx.beginPath();ctx.ellipse(-3,-4,8,6,0,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawWarrior(member,squad,doctrine){
  if(member.state==='fallen')return;const l=liveryForDoctrine(doctrine),moving=Math.hypot(member.vx,member.vy),bob=moving>.8?Math.sin(member.phase)*1.25:0,angle=member.facingY>0?Math.PI:0,attack=member.state==='fighting'?Math.sin(member.phase*1.7)*.5:0,drawing=member.state==='drawing';
  ctx.save();ctx.translate(member.x,member.y+bob);ctx.rotate(angle);ctx.globalAlpha=.43+.57*member.morale;
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,10,10,4.2,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=member.hitFlash>0?'#fff1c9':l.primary;ctx.beginPath();ctx.roundRect(-6,-7,12,17,3);ctx.fill();ctx.fillStyle=l.accent;ctx.fillRect(-6,-7,12,4);
  ctx.fillStyle='#c79f73';ctx.beginPath();ctx.arc(0,-11,4.7,0,Math.PI*2);ctx.fill();ctx.fillStyle=squad.index%2?l.metal:l.accent;ctx.beginPath();ctx.arc(0,-12,5.2,Math.PI,Math.PI*2);ctx.fill();
  if(member.type==='infantry'){
    ctx.save();ctx.rotate(attack);ctx.strokeStyle='#51402c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(4,-2);ctx.lineTo(13,-18);ctx.stroke();ctx.restore();
    ctx.fillStyle=l.metal;ctx.beginPath();ctx.moveTo(-3,-6);ctx.quadraticCurveTo(-13,-4,-11,10);ctx.lineTo(-3,8);ctx.closePath();ctx.fill();ctx.strokeStyle=l.ink;ctx.lineWidth=.8;ctx.stroke();drawTinyEmblem(doctrine.main,-7,2,5.2,l.emblem);
  }else{
    ctx.strokeStyle='#4b3722';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(5,-2,drawing?10:8,-Math.PI/2,Math.PI/2);ctx.stroke();ctx.beginPath();ctx.moveTo(drawing?1:5,-10);ctx.lineTo(drawing?1:5,7);ctx.stroke();if(drawing){ctx.strokeStyle=l.metal;ctx.beginPath();ctx.moveTo(1,-10);ctx.lineTo(-4,-2);ctx.lineTo(1,7);ctx.stroke();}ctx.strokeStyle=l.metal;ctx.beginPath();ctx.moveTo(-5,4);ctx.lineTo(-10,-6);ctx.stroke();drawTinyEmblem(doctrine.secondary,-2,3,4.8,l.metal);
  }
  if(squad.leader&&member.index===0){ctx.fillStyle=l.metal;ctx.beginPath();ctx.moveTo(-5,-17);ctx.lineTo(0,-26);ctx.lineTo(5,-17);ctx.fill();}
  if(member.state==='rout'){ctx.strokeStyle='rgba(244,231,192,.8)';ctx.setLineDash([2,3]);ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
  ctx.restore();
}
function drawArrow(arrow){
  if(arrow.delay>0)return;
  const p=1-Math.max(0,arrow.life)/arrow.duration,x=arrow.x1+(arrow.x2-arrow.x1)*p,y=arrow.y1+(arrow.y2-arrow.y1)*p-Math.sin(p*Math.PI)*32,p0=Math.max(0,p-.07),x0=arrow.x1+(arrow.x2-arrow.x1)*p0,y0=arrow.y1+(arrow.y2-arrow.y1)*p0-Math.sin(p0*Math.PI)*32;
  ctx.save();ctx.strokeStyle='#e2cf99';ctx.lineWidth=arrow.volleyId?1.75:1.5;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x,y);ctx.stroke();ctx.restore();
}
function drawEffects(){for(const e of battleState.effects){ctx.save();ctx.globalAlpha=Math.min(1,e.life*4);if(e.type==='hit'||e.type==='arrow-hit'){ctx.translate(e.x,e.y);ctx.strokeStyle=e.type==='arrow-hit'?'#ead39c':'#fff0bd';ctx.lineWidth=1.6;for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(3,0);ctx.lineTo(9+e.life*8,0);ctx.stroke();}}else{ctx.fillStyle='rgba(212,191,136,.18)';ctx.beginPath();ctx.arc(e.x,e.y,13*(1.3-e.life),0,Math.PI*2);ctx.fill();}ctx.restore();}}

function drawDoctrineSignals(){
  for(const signal of battleState.signals||[]){const l=signal.side==='player'?liveryForDoctrine(battleState.player.doctrine):liveryForDoctrine(battleState.enemy.doctrine),p=1-signal.life/signal.maxLife,r=24+p*35;ctx.save();ctx.translate(signal.x,signal.y);ctx.globalAlpha=Math.sin(Math.min(1,p)*Math.PI)*.9;ctx.strokeStyle=l.metal;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(18,24,19,.84)';ctx.strokeStyle=l.accent;ctx.lineWidth=1;const label=signal.label||signal.id,w=Math.min(190,Math.max(76,label.length*6.4));ctx.beginPath();ctx.roundRect(-w/2,-46,w,22,5);ctx.fill();ctx.stroke();ctx.fillStyle=l.metal;ctx.font='700 10px Inter, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,0,-35);ctx.restore();}
}

function drawSquadShape(squad,doctrine){
  if(squad.broken||squad.type==='archer')return;const active=squad.members.filter(m=>m.state!=='fallen'&&m.state!=='rout');if(active.length<2)return;const l=liveryForDoctrine(doctrine),minX=Math.min(...active.map(m=>m.x))-12,maxX=Math.max(...active.map(m=>m.x))+12,minY=Math.min(...active.map(m=>m.y))-12,maxY=Math.max(...active.map(m=>m.y))+12;
  ctx.save();ctx.globalAlpha=.05+.08*(1-squad.cohesion);ctx.fillStyle=l.metal;ctx.beginPath();ctx.roundRect(minX,minY,maxX-minX,maxY-minY,12);ctx.fill();ctx.restore();
}
function drawBattle(){
  const {dpr}=renderMetrics;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,renderMetrics.width,renderMetrics.height);setWorldTransform();
  const shake=battleState.impact*2.3,angle=battleState.time*31.7;ctx.save();ctx.translate(Math.sin(angle)*shake,Math.cos(angle*.77)*shake*.5);drawField();
  for(const army of[battleState.player,battleState.enemy])drawBanner(army,army.doctrine);
  for(const army of[battleState.player,battleState.enemy])for(const squad of army.infantry)drawSquadShape(squad,army.doctrine);
  const units=warriorList();for(const unit of units.filter(u=>u.member.state==='fallen').sort((a,b)=>a.member.y-b.member.y))drawFallen(unit.member,unit.squad,unit.army.doctrine);
  for(const arrow of battleState.arrows)drawArrow(arrow);
  for(const unit of units.filter(u=>u.member.state!=='fallen').sort((a,b)=>a.member.y-b.member.y))drawWarrior(unit.member,unit.squad,unit.army.doctrine);
  drawEffects();drawDoctrineSignals();ctx.restore();
}
function sideWord(side){return side==='player'?'ТВОЙ':side==='enemy'?'ВРАЖЕСКИЙ':'ПОЛЕ';}
function replaySnapshotAt(time){
  const frames=battleSummary?.replay||[];if(!frames.length)return null;let a=frames[0],b=frames.at(-1);for(let i=1;i<frames.length;i++){if(frames[i].time>=time){a=frames[i-1];b=frames[i];break;}}
  if(a===b||b.time===a.time)return a;const t=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))),bm=new Map(b.units.map(u=>[u.id,u]));
  return{time,frontY:a.frontY+(b.frontY-a.frontY)*t,playerCapture:a.playerCapture+(b.playerCapture-a.playerCapture)*t,enemyCapture:a.enemyCapture+(b.enemyCapture-a.enemyCapture)*t,units:a.units.map(u=>{const v=bm.get(u.id)||u;return{...u,x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t,state:t>.55?v.state:u.state,hp:u.hp+(v.hp-u.hp)*t,morale:u.morale+(v.morale-u.morale)*t};}),arrows:t<.5?a.arrows:b.arrows,signals:t<.5?a.signals:b.signals};
}
function resizeReplayCanvas(){const rect=replayCanvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),width=Math.max(1,Math.floor(rect.width*dpr)),height=Math.max(1,Math.floor(rect.height*dpr));if(replayCanvas.width!==width)replayCanvas.width=width;if(replayCanvas.height!==height)replayCanvas.height=height;return{width:rect.width,height:rect.height,dpr};}
function drawReplayUnit(context,unit,livery,scale){
  if(unit.state==='fallen'||unit.hp<=0){context.globalAlpha=.35;context.fillStyle=livery.primary;context.beginPath();context.ellipse(unit.x,unit.y,9/scale,4/scale,.5,0,Math.PI*2);context.fill();context.globalAlpha=1;return;}
  context.globalAlpha=.35+.65*unit.morale;context.fillStyle='rgba(0,0,0,.26)';context.beginPath();context.ellipse(unit.x,unit.y+8/scale,7/scale,3/scale,0,0,Math.PI*2);context.fill();context.fillStyle=livery.primary;context.beginPath();context.roundRect(unit.x-5/scale,unit.y-7/scale,10/scale,15/scale,2/scale);context.fill();context.fillStyle=unit.type==='archer'?livery.accent:livery.metal;context.beginPath();context.arc(unit.x,unit.y-9/scale,4/scale,0,Math.PI*2);context.fill();if(unit.state==='rout'){context.strokeStyle='#f2ddb0';context.lineWidth=1/scale;context.beginPath();context.arc(unit.x,unit.y,11/scale,0,Math.PI*2);context.stroke();}context.globalAlpha=1;
}
function drawReplayFrame(snapshot,moment){
  if(!snapshot)return;const {width,height,dpr}=resizeReplayCanvas(),context=replayCtx;context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);const focusY=moment?.y??snapshot.frontY,visibleH=600,scale=Math.min(width/WORLD_WIDTH,height/visibleH),ox=(width-WORLD_WIDTH*scale)/2,oy=height/2-focusY*scale;context.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
  const grad=context.createLinearGradient(0,focusY-visibleH/2,0,focusY+visibleH/2);grad.addColorStop(0,'#36483d');grad.addColorStop(.5,'#607158');grad.addColorStop(1,'#304137');context.fillStyle=grad;context.fillRect(0,focusY-visibleH/2,WORLD_WIDTH,visibleH);context.strokeStyle='rgba(236,218,160,.16)';context.setLineDash([8,12]);context.beginPath();context.moveTo(30,snapshot.frontY);context.lineTo(WORLD_WIDTH-30,snapshot.frontY);context.stroke();context.setLineDash([]);
  const playerL=liveryForDoctrine(campaign.doctrine),enemyL=liveryForDoctrine(campaign.currentEnemy);for(const unit of [...snapshot.units].sort((a,b)=>a.y-b.y))drawReplayUnit(context,unit,unit.side==='player'?playerL:enemyL,scale);
  for(const signal of snapshot.signals||[]){context.strokeStyle=signal.side==='player'?playerL.metal:enemyL.metal;context.globalAlpha=.55;context.lineWidth=2/scale;context.beginPath();context.arc(signal.x,signal.y,25/scale,0,Math.PI*2);context.stroke();context.globalAlpha=1;}
  if(moment){context.strokeStyle='#f1d27a';context.lineWidth=2/scale;context.beginPath();context.arc(moment.x??360,moment.y??snapshot.frontY,32/scale,0,Math.PI*2);context.stroke();}
}
function stopMomentReplay(){if(replayAnimation){cancelAnimationFrame(replayAnimation);replayAnimation=0;}}
function playMoment(index=0){
  stopMomentReplay();const moments=battleSummary?.moments||[];if(!moments.length||!battleSummary?.replay?.length)return;replayMomentIndex=Math.max(0,Math.min(index,moments.length-1));const moment=moments[replayMomentIndex],start=Math.max(0,moment.time-1.2),end=Math.min(battleSummary.duration,moment.time+2.5),began=performance.now();
  $$('.moment-buttons button').forEach((button,i)=>button.classList.toggle('is-active',i===replayMomentIndex));$('#momentReplayCaption').innerHTML=`<b>${fmtTime(moment.time)}</b><span>${moment.label}</span>`;
  const tick=(now)=>{const elapsed=(now-began)/1000,time=Math.min(end,start+elapsed);drawReplayFrame(replaySnapshotAt(time),moment);if(time<end)replayAnimation=requestAnimationFrame(tick);else replayAnimation=0;};replayAnimation=requestAnimationFrame(tick);
}
function renderBattleReading(){
  const moments=battleSummary.moments||[];$('#momentButtons').innerHTML=moments.map((moment,index)=>`<button type="button" data-moment="${index}"><span>${fmtTime(moment.time)}</span><b>${moment.label}</b></button>`).join('');$$('[data-moment]').forEach(button=>button.addEventListener('click',()=>playMoment(Number(button.dataset.moment))));
  $('#decisiveEvents').innerHTML=(battleSummary.analysis||[]).map(item=>`<article class="analysis-card" data-side="${item.side}"><time>${fmtTime(item.time)} · ${sideWord(item.side)}</time><div><b>${item.title}</b><span>${item.summary}</span></div></article>`).join('')||`<article><span>Недостаточно событий для причинного разбора.</span></article>`;
  requestAnimationFrame(()=>playMoment(0));
}
function showResult(){
  const won=battleSummary.winner==='player';$('#resultEyebrow').textContent=`БИТВА ${roman(campaign.battleIndex+1)} ЗАВЕРШЕНА`;$('#resultTitle').textContent=won?'Вражеское знамя обрушено':'Твой фронт разрушен';
  $('#resultMeasures').innerHTML=`<div><span>Время</span><b>${fmtTime(battleSummary.duration)}</b></div><div><span>Твои</span><b>${battleSummary.playerRemaining}/48</b></div><div><span>Враг</span><b>${battleSummary.enemyRemaining}/48</b></div><div><span>Итог</span><b class="result-outcome">${won?'Победа':'Поражение'}</b></div>`;
  renderBattleReading();$('#continueResultButton').querySelector('small').textContent=campaign.battleIndex===BATTLE_COUNT-1?'Завершить поход':'Изменить доктрину';openDialog(dialogs.result);sound(won?'win':'lose');vibrate(won?[20,40,20]:80);
}
function continueAfterResult(){stopMomentReplay();campaign=recordBattle(campaign,battleSummary);if(battleSummary.winner==='player')stats.victories++;persist();closeDialog(dialogs.result);if(campaign.completed){renderEnding();openDialog(dialogs.ending);return;}renderRewards();openDialog(dialogs.reward);}
function rewardHeading(slot){return{main:['ГЛАВНАЯ ФИГУРА','Как будут действовать ратники?'],secondary:['ВТОРИЧНАЯ ФИГУРА','Как лучники свяжутся со строем?'],command:['ВНЕШНИЙ ЭЛЕМЕНТ','Кто задаёт высший порядок?'],motto:['ДЕВИЗ','Какое правило один раз превысит остальные?'],revision:['ПЕРЕСМОТР УСТАВА','Что изменить перед последним полем?']}[slot]||['НОВЫЙ СЛОЙ','Как изменится армия?'];}
function principleCopy(p){return{pressure:'Создаёт последовательное давление, но делает замысел заметнее.',adaptation:'Лучше реагирует на бой, но чаще прерывает начатое.',cohesion:'Связывает части армии, рискуя сделать их слишком зависимыми.',reserve:'Сохраняет решение до кризиса, ослабляя ранний этап.',breach:'Превращает разрыв в глубокий успех, но открывает прорвавшихся.',recovery:'Возвращает потерянную организацию ценой темпа.'}[p]||'Меняет решение отрядов, а не их характеристики.';}
function rewardPreview(offer,index){return achievementMarkup({...campaign.doctrine,[offer.slot]:offer.id},`reward-${campaign.battleIndex}-${index}`,true);}
function renderRewards(){const offers=campaign.offers||[],first=offers[0],[eyebrow,title]=rewardHeading(first?.revision?'revision':first?.slot);$('#rewardEyebrow').textContent=eyebrow;$('#rewardTitle').textContent=title;$('#rewardGrid').innerHTML=offers.map((offer,index)=>`<button class="reward-card" data-offer="${index}"><div class="reward-card-preview">${rewardPreview(offer,index)}</div><div class="reward-card-copy"><em>${offer.revision?`Заменит: ${CATALOGS[offer.slot][offer.replaces]?.name}`:layerLabel(offer.slot)}</em><strong>${offer.definition.name}</strong><p>${offer.definition.summary}</p><small>${offer.definition.detail||principleCopy(offer.definition.principle)}</small></div></button>`).join('');$$('.reward-card').forEach(b=>b.addEventListener('click',()=>chooseReward(Number(b.dataset.offer))));}
function chooseReward(index){const offer=campaign.offers[index];campaign=applyOffer(campaign,offer);persist();closeDialog(dialogs.reward);renderDoctrine();showScreen('doctrine');sound('seal');vibrate(18);}
function renderEnding(){const won=campaign.integrity>0;$('#endingAchievement').innerHTML=achievementMarkup(campaign.doctrine,'ending');$('#endingTitle').textContent=won?`Доктрина выиграла ${campaign.victories} из ${BATTLE_COUNT}`:'Знамя рода не пережило поход';$('#endingCopy').textContent=`Сохранено целостности: ${campaign.integrity} из 3. Победы: ${campaign.victories}. Геральдическая школа: ${HERALDIC_SCHOOLS[schoolForDoctrine(campaign.doctrine)].name}.`;}
function leaveBattle(){stopMomentReplay();battleRunning=false;paused=false;showScreen('doctrine');renderDoctrine();}

$('#newButton').addEventListener('click',startNewSetup);
$('#continueButton').addEventListener('click',continueCampaign);
$('#sealSetupButton').addEventListener('click',sealSetup);
$('#rulesButton').addEventListener('click',()=>openDialog(dialogs.rules));
$('#codexButton').addEventListener('click',()=>openDialog(dialogs.rules));
$('#doctrineMenuButton').addEventListener('click',()=>{showScreen('menu');renderMenu();});
$('#startBattleButton').addEventListener('click',()=>startBattle(false));
$('#leaveBattleButton').addEventListener('click',leaveBattle);
$('#pauseSimulationButton').addEventListener('click',()=>{paused=!paused;$('#pauseSimulationButton').textContent=paused?'Продолжить':'Пауза';});
$('#replayButton').addEventListener('click',()=>{stopMomentReplay();closeDialog(dialogs.result);startBattle(true);});
$('#continueResultButton').addEventListener('click',continueAfterResult);
$('#endingMenuButton').addEventListener('click',()=>{closeDialog(dialogs.ending);campaign=null;persist();renderMenu();showScreen('menu');});
$('#endingRestartButton').addEventListener('click',()=>{closeDialog(dialogs.ending);startNewSetup();});
$('#soundButton').addEventListener('click',()=>{settings.sound=!settings.sound;persist();renderMenu();sound('tap');});
$$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>{if(b.closest('dialog')===dialogs.result)stopMomentReplay();closeDialog(b.closest('dialog'));}));
$$('[data-speed]').forEach(b=>b.addEventListener('click',()=>{speed=Number(b.dataset.speed);$$('[data-speed]').forEach(other=>other.classList.toggle('is-active',other===b));sound('tap');}));
window.addEventListener('resize',()=>{if(screens.battle.classList.contains('is-active'))resizeCanvas();if(dialogs.result.open&&battleSummary?.moments?.length)drawReplayFrame(replaySnapshotAt(battleSummary.moments[replayMomentIndex].time),battleSummary.moments[replayMomentIndex]);});
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});
createWorkshopMode({appName:'БЛАЗОН: Доктрина',version:RELEASE,cachePrefix:'blazon-',storageNamespace:'pocket-works:blazon',onReset(){store.reset();campaign=null;settings=store.get('settings');stats=store.get('stats');renderMenu();showScreen('menu');}});
watchConnectivity(online=>document.documentElement.dataset.network=online?'online':'offline');
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
renderMenu();showScreen('menu');
