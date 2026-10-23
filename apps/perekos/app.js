import {W,H,STEP,WALLS,RUNES,makeMatch,validState,tick,chooseRune,beginRound,reorderRunes,startRound,ringRadius,has,stats,EVOLUTIONS,FUSIONS,availableFusions,chooseEvolution,ARCHETYPES,validArchetype,forgeEdit} from './core.mjs';
import {rune,description,compile,TYPES,legalRunes,chosenElement} from './runes.mjs';
import {runeSeal} from './rune-seals.mjs';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {DEFAULT_APPEARANCE,COLORSETS,normalizeAppearance,decodeAppearance} from './avatar-profile.mjs';
import {drawMage,drawPortrait,drawHero} from './mage-art.mjs';
import {OnlineDuel,inviteCode,incomingCode} from './net-client.mjs';
import {MAGES,SCHOOLS,mage,validMage} from './mages.mjs';
import {ELEMENTS,reactionFor} from './elements.mjs';
import {createCourtBackdrop,drawCourtAtmosphere} from './court-art.mjs';
import {forgeCourtReady,drawForgeConstructs} from './forge-court.mjs';
import {CombatPresentation} from './combat-presentation.mjs';
import {drawGroundCues,drawActorCues,drawSpellLighting} from './combat-readability.mjs';
import {SpellChoreography,drawSpellGround,drawSpellActors,drawSpellForeground} from './spell-choreography.mjs';
import {drawKineticProjectiles,ContactTheater} from './spell-kinetics.mjs';
import {drawSignatureGround,drawSignatureForeground} from './signature-art.mjs';
import {DuelFeedback} from './duel-feedback.mjs';
import {MageMotion} from './mage-motion.mjs';
import {courtAim} from './aim-geometry.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;
const storage='pocket-works:perekos:',prefsKey=storage+'prefs',saveKey=storage+'match',booksKey=storage+'grimoire';
let appearance={...DEFAULT_APPEARANCE},pendingAppearance=null,profileRequest=0,lastProfileFetch=0,avatarInFlight=null;
let online=null,onlinePreviewRunes=null,onlinePhase='',displayXY=[null,null];
let rivalAppearance={...DEFAULT_APPEARANCE,source:'rival',colors:['#b26258','#ecc08f','#7a393f']},pendingRival=null,rivalKey='',rivalRequest=0;
let selectedMage='kindle',mageFrom='menu',selectionDraft='kindle',selectedGameMode='rupture',selectedArchetype='striker',selectionArchetype='striker',netSyncAt=0,evoPath='add';
let desktopPanelsVisible=true,lastTacticRunes='',sound=true,paused=false,mode='menu',active=null,last=performance.now(),acc=0,frame=0,quietTimer=0,audio=null,seen=0,quitPrompt=false,fxParticles=[],pendingRune=null,bookToDelete=null,debugSession=null;
const combatPresentation=new CombatPresentation();
const spellChoreography=new SpellChoreography();
const contactTheater=new ContactTheater();
const duelFeedback=new DuelFeedback();
const mageMotion=new MageMotion();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const ATTACK_NAMES={kindle:'ПОДЖОГ',cinder:'ОГНЕМЁТ',wire:'ПРОБОЙ',coil:'МОЛНИЯ',pebble:'ОСКОЛКИ',slate:'ВОЛНА'};
const keys=new Set(),input={x:0,y:0,attack:false,shield:false,dash:false,aim:null},stick={pointer:null,x:0,y:0},touches=new Map();
let tapAttackQueued=false,aimTouch=false,aimTouchStart=0,aimDragged=false,aimVector=null;
function stored(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const savedPrefs=stored(prefsKey);sound=savedPrefs?.sound!==false;desktopPanelsVisible=savedPrefs?.desktopPanels!==false;selectedMage=validMage(savedPrefs?.mage)?savedPrefs.mage:'kindle';selectedGameMode=savedPrefs?.gameMode==='duel'?'duel':'rupture';selectedArchetype=validArchetype(savedPrefs?.archetype)?savedPrefs.archetype:'striker';
function remember(){put(prefsKey,{sound,mage:selectedMage,gameMode:selectedGameMode,archetype:selectedArchetype,desktopPanels:desktopPanelsVisible});if(!debugSession&&!online?.active&&active&&validState(active))put(saveKey,active)}
function forget(){if(debugSession)return;try{localStorage.removeItem(saveKey)}catch{}}
const resume=stored(saveKey);
if(resume&&validState(resume))$('continue').hidden=false;
function audioContext(){if(!sound)return null;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio}catch{return null}}
function sfx(type,school='fire'){
 const ac=audioContext();if(!ac)return;
 const now=ac.currentTime;
 const tone=(start,end,length,wave='triangle',vol=.022,delay=0)=>{
  const o=ac.createOscillator(),g=ac.createGain(),at=now+delay;
  o.type=wave;o.frequency.setValueAtTime(Math.max(20,start),at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,end),at+length);
  g.gain.setValueAtTime(.0001,at);
  g.gain.exponentialRampToValueAtTime(vol,at+.006);
  g.gain.exponentialRampToValueAtTime(.0001,at+length);
  o.connect(g).connect(ac.destination);o.start(at);o.stop(at+length+.005);
 };
 const grit=(length,cutoff,vol=.017)=>{
  const samples=Math.ceil(ac.sampleRate*length),buffer=ac.createBuffer(1,samples,ac.sampleRate);
  const channel=buffer.getChannelData(0);
  let seed=34363+Math.floor(now*1000);
  for(let i=0;i<samples;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;
   channel[i]=((seed>>>1)/0x40000000-1)*Math.pow(1-i/samples,1.4)}
  const src=ac.createBufferSource(),filter=ac.createBiquadFilter(),g=ac.createGain();
  src.buffer=buffer;filter.type='highpass';filter.frequency.value=cutoff;
  g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.0001,now+length);
  src.connect(filter).connect(g).connect(ac.destination);src.start(now);src.stop(now+length);
 };
 if(type==='shoot'){
  if(school==='stone'){tone(165,53,.22,'triangle',.054);tone(80,39,.16,'sine',.034);grit(.10,300,.036)}
  else if(school==='storm'){tone(950,260,.11,'sawtooth',.017);tone(530,1030,.07,'square',.015);tone(280,112,.13,'triangle',.025)}
  else{tone(315,87,.19,'sawtooth',.032);tone(860,350,.085,'triangle',.026);grit(.055,1250,.019)}
 }else if(type.startsWith('impact_')){
  // Only server-confirmed collision events generate the contact sound.
  // Each material has a physically distinct envelope and mass.
  const style=type.slice(7);
  if(style==='rock'||style==='wave'){
   tone(style==='rock'?148:105,style==='rock'?43:37,.24,'triangle',.051);
   tone(68,36,.19,'sine',.034,.012);
   grit(style==='rock'?.15:.12,style==='rock'?250:430,.024);
  }else if(style==='bolt'||style==='arc'){
   tone(style==='arc'?1050:1280,style==='arc'?170:300,.085,'sawtooth',.023);tone(165,49,.19,'triangle',.032,.008);
   tone(460,130,.12,'triangle',.016,.008);
   grit(.042,2400,.012);
  }else if(style==='flame'||style==='orb'){
   tone(style==='flame'?360:270,65,.18,'triangle',.037);
   grit(style==='flame'?.11:.065,style==='flame'?780:1050,.02);
  }else{
   tone(340,120,.08,'sine',.012);
  }
 }else if(type==='charge_pebble'){
  tone(90,180,.20,'triangle',.024);grit(.075,220,.014);
 }else if(type==='charge_coil'){
  tone(420,990,.17,'sine',.015);tone(650,1200,.11,'triangle',.014,.03);
 }else if(type==='charge_slate'){
  tone(110,56,.16,'triangle',.024);
 }else if(type==='hurl'){
  tone(240,67,.23,'triangle',.045);grit(.15,320,.022);
 }else if(type==='thunder'){
  tone(1270,180,.15,'sawtooth',.022);tone(610,80,.19,'triangle',.016);
 }else if(type==='quake'){
  tone(115,36,.22,'triangle',.046);grit(.12,180,.026);
 }else if(type==='flame'){
  tone(210,75,.065,'sawtooth',.013);grit(.05,850,.01);
 }else if(type==='fracture'){
  tone(180,43,.11,'triangle',.023);grit(.11,360,.021);
 }else if(type==='hit'){
  tone(210,42,.18,'triangle',.046);tone(78,31,.14,'sine',.028,.015);grit(.075,620,.026);
 }else if(type==='shield'){
  tone(270,550,.18,'sine',.023);tone(440,310,.25,'triangle',.018,.015);
 }else if(type==='dash'){
  tone(130,490,.095,'triangle',.031);grit(.08,900,.012);
 }else if(type==='overload'){
  tone(84,380,.31,'sawtooth',.04);tone(520,90,.27,'triangle',.023,.03);grit(.18,450,.016);
 }else if(type==='react_crack'||type==='react_slag'||type==='react_steam'){
  tone(type==='react_crack'?220:650,75,.26,'sawtooth',.025);
  grit(.095,900,.016);
 }else if(type==='heal'){
  tone(430,760,.17,'sine',.019);tone(660,960,.24,'sine',.012,.028);
 }else if(type==='spark'){tone(950,330,.07,'square',.011)}
 else if(type==='mine'){tone(440,75,.17,'triangle',.022)}
 else if(type==='overtime'){tone(95,160,.31,'sawtooth',.022)}
}
function setAudio(){sound=!sound;remember();$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');if(sound)audioContext()}
$('menu-audio').addEventListener('click',setAudio);$('pause-audio').addEventListener('click',setAudio);
$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');
function applyDesktopPanels(){
 $('desktop-dashboard').dataset.open=String(desktopPanelsVisible);
 const toggle=$('desktop-panels-toggle');toggle.setAttribute('aria-expanded',String(desktopPanelsVisible));
 toggle.innerHTML=desktopPanelsVisible?'Скрыть панели <span aria-hidden="true">×</span>':'Показать панели <span aria-hidden="true">＋</span>';
}
$('desktop-panels-toggle').addEventListener('click',()=>{desktopPanelsVisible=!desktopPanelsVisible;applyDesktopPanels();remember()});
applyDesktopPanels();
function show(name){mode=name;$('desktop-dashboard').hidden=name!=='fight';tapAttackQueued=false;if(name==='menu'||name==='result'||name==='online-lobby')mageMotion.reset();for(const id of ['menu','mage-select','draft','build','books','book-delete','result','pause','confirm','online-lobby','net-wait'])$(id).hidden=id!==name;$('controls').hidden=name!=='fight';$('hud').hidden=!active||['menu','mage-select','online-lobby','books','book-delete'].includes(name);if(name==='fight'||name==='menu')paused=false;if(name!=='fight')input.aim=null;input.attack=false;input.shield=false;input.dash=false;seen=active?.serial||0;$('forge-edit').hidden=name!=='fight'||active?.gameMode!=='forge';updateHud()}
function mageCards(node,value,onPick,small=false){
 node.replaceChildren();
 for(const school of SCHOOLS){
  const group=document.createElement('div');group.className='mage-family mage-'+school.id;
  const heading=document.createElement('h3');heading.textContent=school.name;
  if(!small){const sub=document.createElement('small');sub.textContent=school.explain;heading.append(sub)}
  group.append(heading);
  const choices=document.createElement('div');choices.className='mage-family-choices';
  for(const m of MAGES.filter(m=>m.school===school.id)){
   const btn=document.createElement('button');btn.type='button';btn.dataset.mage=m.id;
   btn.className='mage-option'+(value===m.id?' picked':'');btn.setAttribute('aria-pressed',String(value===m.id));
   const symbol=document.createElement('canvas');symbol.className='mage-sprite';symbol.width=80;symbol.height=82;const miniature=symbol.getContext('2d');miniature.imageSmoothingEnabled=false;drawMage(miniature,appearance,{x:40,y:54,scale:2,time:0,mageId:m.id,face:Math.PI/4,pose:{still:true}});
   const label=document.createElement('span'),title=document.createElement('strong');title.textContent=m.name;label.append(title);
   if(!small){const detail=document.createElement('small');detail.textContent=m.description;label.append(detail)}
   btn.append(symbol,label);btn.addEventListener('click',()=>onPick(m.id));choices.append(btn);
  }group.append(choices);node.append(group);
 }
}
function archetypeCards(node,value,onPick){
 node.replaceChildren();
 for(const archetype of ARCHETYPES){
  const button=document.createElement('button');button.type='button';button.className='archetype-chip';button.setAttribute('aria-pressed',String(value===archetype.id));
  const name=document.createElement('strong');name.textContent=({striker:'➤ ',shaper:'⬡ ',distorter:'◈ '})[archetype.id]+archetype.name;
  const detail=document.createElement('small');detail.textContent=archetype.desc;
  button.append(name,detail);button.addEventListener('click',()=>onPick(archetype.id));node.append(button);
 }
}
function pickArchetype(id){selectionArchetype=id;archetypeCards($('archetype-options'),id,pickArchetype)}
function updateSelectedMage(){
 $('chosen-mage-name').textContent=mage(selectedMage).name+' · '+ARCHETYPES.find(x=>x.id===selectedArchetype).name;drawHero($('hero-preview').getContext('2d'),appearance,0,[],selectedMage,reducedMotion);
 $('attack-name').textContent=ATTACK_NAMES[selectedMage];
}
$('choose-mage').addEventListener('click',()=>{
 mageFrom='menu';selectionDraft=selectedMage;selectionArchetype=selectedArchetype;show('mage-select');pickArchetype(selectedArchetype);
 const pick=id=>{selectionDraft=id;mageCards($('mage-options'),id,pick)};
 mageCards($('mage-options'),selectedMage,pick);
});
$('mage-cancel').addEventListener('click',()=>show('menu'));
$('mage-confirm').addEventListener('click',()=>{selectedMage=selectionDraft;selectedArchetype=selectionArchetype;updateSelectedMage();remember();show('menu');toast('Выбран '+mage(selectedMage).name)});
updateSelectedMage();
function selectMode(kind){selectedGameMode=kind==='duel'?'duel':'rupture';for(const id of ['rupture','duel'])$('mode-'+id).setAttribute('aria-pressed',String(id===selectedGameMode));$('primary-action').firstChild.textContent=selectedGameMode==='rupture'?'Начать Разлом ':'Начать дуэль ';remember()}
for(const id of ['rupture','duel'])$('mode-'+id).addEventListener('click',()=>selectMode(id));
selectMode(selectedGameMode);
function newMatch(){if(online?.active)online.leave();onlinePhase='';applyPendingAppearance();active=makeMatch((Date.now()>>>0)^Math.floor(Math.random()*0xffffffff),selectedMage,MAGES[(MAGES.findIndex(m=>m.id===selectedMage)+3)%MAGES.length].id,selectedGameMode,selectedArchetype,'shaper');fxParticles=[];combatPresentation.reset();spellChoreography.reset();seen=0;audioContext();show('fight');toast(matchMedia('(hover:hover) and (pointer:fine)').matches?'WASD — ходьба · ЛКМ / Space — атака · Q — щит · Shift — рывок':'Зажми атаку, веди пальцем для прицеливания');remember()}
function startForge(){
 if(online?.active)online.leave();onlinePhase='';applyPendingAppearance();
 active=makeMatch((Date.now()>>>0)^0x1af20d,selectedMage,'pebble','forge',selectedArchetype,'shaper');
 active.forgeDummy=true;active.phase='build';fxParticles=[];combatPresentation.reset();spellChoreography.reset();seen=0;audioContext();
 show('build');renderWorkbench();remember();
}
$('open-forge').addEventListener('click',startForge);
$('forge-edit').addEventListener('click',()=>{if(active?.gameMode!=='forge'||online?.active)return;active.phase='build';show('build');renderWorkbench();remember()});
$('primary-action').addEventListener('click',newMatch);$('again').addEventListener('click',()=>online?.active?online.start():newMatch());
$('continue').addEventListener('click',()=>{const s=stored(saveKey);if(s&&validState(s)){active=s;if(s.phase!=='fight')applyPendingAppearance();show(s.phase);if(s.phase==='draft')renderDraft();if(s.phase==='build')renderWorkbench();if(s.phase==='result')renderResult()}else newMatch()});
function pause(){if(mode!=='fight')return;paused=true;show('pause');$('pause-title').textContent=online?.active?'Сетевой матч':'Передышка';$('pause-online-note').hidden=!online?.active;remember()}
$('pause-btn').addEventListener('click',pause);
$('resume').addEventListener('click',()=>{show('fight');last=performance.now()});
$('quit').addEventListener('click',()=>{$('quit-warning').textContent=online?.active?'Выход из комнаты засчитает поражение в текущем матче.':'Прогресс текущей серии будет потерян.';quitPrompt=true;$('pause').hidden=true;$('confirm').hidden=false;mode='confirm'});
$('quit-no').addEventListener('click',()=>{quitPrompt=false;show('pause')});
$('quit-yes').addEventListener('click',()=>{if(online?.active)online.leave();onlinePhase='';active=null;forget();$('continue').hidden=true;show('menu')});
let toastT=0;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');toastT=1.9}
function myIndex(){return debugSession?0:online?.active?online.me:0}
function myActor(){return active?.actors?.[myIndex()]}
function renderTacticalRunes(a){
 const runes=Array.isArray(a?.runes)?a.runes:[],key=runes.join('|')+'|'+(a?.evolution?.form||'')+'|'+(a?.evolution?.level||0)+'|'+(a?.fusions||[]).join(','),list=$('tactic-runes');
 if(key===lastTacticRunes)return;
 lastTacticRunes=key;list.replaceChildren();
 const info=description(runes);
 if(!info.chains.length){const empty=document.createElement('p');empty.textContent='Пока нет рунических приёмов. Первый появится после выбора рун.';list.append(empty);return}
 for(let i=0;i<Math.min(3,info.chains.length);i++){
  const chain=info.chains[i],block=document.createElement('div');block.className='rune-chain'+(chain.actions.length?'':' inactive');
  const title=document.createElement('strong');title.textContent='ЦЕПОЧКА '+(i+1);
  const body=document.createElement('p');body.textContent=(rune(chain.trigger)?.name||'Событие')+' → '+(chain.actions.length?chain.actions.map(action=>[rune(action.id)?.name,...action.mods.map(id=>rune(id)?.name)].filter(Boolean).join(' · ')).join(' / '):'нужна руна действия');
  block.append(title,body);list.append(block);
 }
 if(a.evolution){const p=document.createElement('p');p.className='evo-tactic';p.textContent='ФОРМА: '+(EVOLUTIONS.find(x=>x.id===a.evolution.form)?.name||'')+' · '+a.evolution.level+'/3';list.prepend(p)}
 if(a.fusions?.length){const p=document.createElement('p');p.className='evo-tactic';p.textContent='СЛИЯНИЯ: '+a.fusions.map(id=>FUSIONS.find(f=>f.id===id)?.name).join(' · ');list.prepend(p)}
}
function renderTacticalAbility(id,remaining,total){
 const value=Math.max(0,Number(remaining)||0),part=Math.max(0,Math.min(1,1-value/Math.max(.1,total)));
 $('tactic-'+id+'-bar').style.width=Math.round(part*100)+'%';
 $('tactic-'+id).textContent=value<=.05?'ГОТОВО':value.toFixed(1)+' с';
}
function updateTacticalHud(a){
 const m=mage(a.mageId);
 $('tactic-mage').textContent=m.name;
 $('tactic-school').textContent={fire:'Пиромантия',storm:'Грозовая магия',stone:'Каменная магия'}[m.school]||m.school;
 $('tactic-attack').textContent=ATTACK_NAMES[a.mageId]||'ЗАКЛИНАНИЕ';
 renderTacticalAbility('cast',a.cast,stats(a).reload);
 renderTacticalAbility('shield',a.shieldReady,5);
 renderTacticalAbility('dash',a.dashReady,2.5);
 renderTacticalRunes(a);
}
function updateHud(){if(!active)return;const side=myIndex(),a=active.actors[side],b=active.actors[1-side];const am=stats(a),bm=stats(b);$('my-hp').style.width=Math.max(0,100*a.hp/am.max)+'%';$('bot-hp').style.width=Math.max(0,100*b.hp/bm.max)+'%';$('my-hp-text').textContent=Math.ceil(a.hp)+' / '+am.max;$('bot-hp-text').textContent=Math.ceil(b.hp)+' / '+bm.max;const rupture=active.gameMode==='rupture',secs=Math.max(0,Math.ceil(active.remaining));$('clock').textContent=active.gameMode==='forge'?'∞':rupture?String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0'):secs;$('clock').style.color=rupture&&secs<=90?'#f3a27c':'#f7edce';$('round-number').textContent=active.gameMode==='forge'?'КУЗНИЦА · СВОБОДНЫЙ БОЙ':rupture?(secs<=90?'КОЛЛАПС':'ЭВОЛЮЦИЯ '+active.round+'/10'):(secs<=10?'10 С ДО КОНЦА':'РАУНД '+active.round);$('score-me').textContent=active.gameMode==='forge'?ARCHETYPES.find(x=>x.id===a.archetype)?.name:rupture?'✦ '+active.score[side]:'● '.repeat(active.score[side])+'○ '.repeat(Math.max(0,4-active.score[side]));$('score-bot').textContent=active.gameMode==='forge'?'МАНЕКЕН':rupture?'✦ '+active.score[1-side]:'● '.repeat(active.score[1-side])+'○ '.repeat(Math.max(0,4-active.score[1-side]));$('core-indicator').hidden=!rupture;if(rupture){const c=active.coreHold||[0,0];$('core-indicator').textContent='ЯДРО · '+Math.floor((c[side]||0)/8*100)+'%';}$('heat-fill').style.width=Math.round(a.heat)+'%';$('heat-value').textContent=Math.round(a.heat)+'%';
$('heat-fill').classList.toggle('danger',a.heat>=78);
$('dash-cooldown').style.height=100*Math.min(1,a.dashReady/2.5)+'%';$('shield-cooldown').style.height=100*Math.min(1,a.shieldReady/5)+'%';$('attack-cooldown').style.height=100*Math.min(1,a.cast/stats(a).reload)+'%';$('attack-name').textContent=ATTACK_NAMES[a.mageId];if(!$('desktop-dashboard').hidden)updateTacticalHud(a)}
function typeName(type){return TYPES[type]||type}
function drawRuneNode(r,compact=false){
 const row=document.createElement('span');row.className='rune-node rune-'+r.type;
 const ic=document.createElement('span');ic.className='rune-icon';ic.append(runeSeal(r));
 const text=document.createElement('span'),title=document.createElement('strong');title.textContent=r.name;
 const detail=document.createElement('small');detail.textContent=compact?typeName(r.type):r.desc;
 text.append(title,detail);row.append(ic,text);return row;
}
function drawOwned(){
 $('loadout').replaceChildren();
 for(const id of myActor().runes){const r=rune(id);if(!r)continue;const b=document.createElement('b');b.className='owned-rune rune-'+r.type;b.append(runeSeal(r));const label=document.createElement('span');label.textContent=r.name;b.append(label);$('loadout').append(b)}
}
function finishPick(id,slot=null){
 if(online?.active){if(!online.pick(id,slot))return false;pendingRune=null;$('replace-zone').hidden=true;toast('Руна выбрана.');return true}
 if(!chooseRune(active,id,slot))return false;
 pendingRune=null;$('replace-zone').hidden=true;sfx('heal');remember();show('build');renderWorkbench();return true;
}
function renderReplacement(id){
 pendingRune=id;$('replace-zone').hidden=false;$('rune-cards').hidden=true;const list=$('replace-list');list.replaceChildren();
 const slots=myActor().runes;
 slots.forEach((owned,i)=>{const r=rune(owned),btn=document.createElement('button');btn.type='button';btn.className='replacement rune-'+r.type;btn.append(runeSeal(r));const label=document.createElement('span');label.textContent=(i+1)+'. '+r.name;btn.append(label);btn.addEventListener('click',()=>finishPick(id,i));list.append(btn)});
}
$('replace-cancel').addEventListener('click',()=>{pendingRune=null;$('replace-zone').hidden=true;$('rune-cards').hidden=false});
function finishEvolution(kind,form){
 if(active?.gameMode!=='rupture'||active.phase!=='draft')return false;
 if(online?.active){if(!online.evolve(kind,form))return false;toast('Эволюция выбрана.');return true}
 if(!chooseEvolution(active,kind,form))return false;
 sfx('shield');remember();show('build');renderWorkbench();return true;
}
function renderEvolutionOffers(){
 const on=active?.gameMode==='rupture';
 $('draft-path').hidden=!on;$('evo-cards').hidden=!on||evoPath==='add';$('rune-cards').hidden=on&&evoPath!=='add';
 if(!on)return;
 for(const kind of ['add','mutate','fuse'])$('evo-path-'+kind).setAttribute('aria-pressed',String(evoPath===kind));
 if(evoPath==='add')return;
 const list=$('evo-cards'),options=evoPath==='mutate'?EVOLUTIONS:availableFusions(myActor());list.replaceChildren();
 if(!options.length){const p=document.createElement('p');p.className='evo-empty';p.textContent='Сначала собери рабочую цепочку: КОГДА → ШАР / МИНА / УДАР → ЖАР, ТОК или КАМЕНЬ. Тогда появится новая форма для объединения.';list.append(p);return}
 for(const option of options){
  const current=myActor().evolution,same=current?.form===option.id,level=same?current.level:0,locked=evoPath==='mutate'&&level>=3;
  const button=document.createElement('button');button.type='button';button.className='evo-offer evo-offer-'+option.id;button.disabled=locked;
  const glyph=document.createElement('span');glyph.className='evo-glyph';glyph.textContent=({beam:'━━━',swarm:'✣ ✣',field:'◎',ember_nova:'✹',storm_lattice:'ϟ',stone_crush:'⬡'})[option.id];
  const text=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small'),tier=document.createElement('em');
  name.textContent=option.name;description.textContent=option.desc;
  tier.textContent=evoPath==='mutate'?(locked?'МАКСИМУМ III':(same?'УСИЛИТЬ '+(level+1)+'/3':'НОВАЯ ФОРМА I/3')):'СЛИТЬ ДВЕ РУНЫ';
  text.append(name,description,tier);button.append(glyph,text);
  if(!locked)button.addEventListener('click',()=>finishEvolution(evoPath,option.id));
  list.append(button);
 }
}
for(const kind of ['add','mutate','fuse'])$('evo-path-'+kind).addEventListener('click',()=>{if(active?.gameMode!=='rupture')return;evoPath=kind;$('replace-zone').hidden=true;pendingRune=null;renderEvolutionOffers()});
function renderDraft(){
 if(!active)return;
 $('draft-score').textContent=active.score[myIndex()]+' : '+active.score[1-myIndex()];
 $('draft-outcome').textContent=active.lastOutcome==='draw'?'РАУНД ВНИЧЬЮ · 0 ОЧКОВ':'';
 $('draft-title').textContent=active.lastOutcome==='draw'?'Ничья. Очки не меняются. Возьми руну.':active.lastWinner===myIndex()?'Хороший раунд. Возьми руну.':'Проиграли раунд. Возьми руну.';
 if(active.gameMode==='rupture'){$('draft-outcome').textContent='СТАДИЯ '+active.round+' / 10';$('draft-title').textContent='Эволюция магии. Выбери новую руну.'}
 evoPath='add';$('rune-cards').hidden=false;$('replace-zone').hidden=true;pendingRune=null;
 const list=$('rune-cards');list.replaceChildren();
 for(const id of (debugSession?active.pick:online?.active?online.view?.offers||[]:active.pick)){
  const r=rune(id);if(!r)continue;const btn=document.createElement('button');btn.className='rune-choice rune-choice-'+r.type;btn.type='button';const number=document.createElement('span');number.className='rune-offer-number';number.textContent='0'+(list.children.length+1);const accept=document.createElement('span');accept.className='rune-accept';accept.textContent='ВЗЯТЬ ↗';btn.append(number,drawRuneNode(r),accept);
  btn.addEventListener('click',()=>{if(myActor().runes.length>=9)renderReplacement(id);else finishPick(id)});list.append(btn);
 }
 drawOwned();
 renderEvolutionOffers();
}
function reorderOnBench(from,to){if(online?.active){const list=onlinePreviewRunes;if(!Array.isArray(list)||from<0||to<0||from>=list.length||to>=list.length)return false;const [id]=list.splice(from,1);list.splice(to,0,id);return true}return reorderRunes(active,from,to)}
function renderForgeLab(){
 if(active?.gameMode!=='forge')return;
 const a=myActor(),owned=new Set(a.runes),list=$('forge-runes');list.replaceChildren();
 for(const category of ['when','do','how']){
  const group=document.createElement('div');group.className='forge-rune-group';
  const title=document.createElement('strong');title.textContent=TYPES[category];group.append(title);
  for(const r of RUNES.filter(x=>x.type===category)){
   const button=document.createElement('button');button.type='button';button.textContent=r.name;
   button.className='forge-token';button.setAttribute('aria-pressed',String(owned.has(r.id)));
   button.title=r.desc;button.disabled=!owned.has(r.id)&&(a.runes.length>=9||(category==='when'&&a.runes.filter(id=>rune(id)?.type==='when').length>=3));
   button.addEventListener('click',()=>{if(forgeEdit(active,owned.has(r.id)?'remove':'add',r.id)){remember();renderWorkbench();sfx('dash')}});
   group.append(button);
  }list.append(group);
 }
 const mutations=$('forge-mutations');mutations.replaceChildren();
 for(const evolution of EVOLUTIONS){
  const same=a.evolution?.form===evolution.id,level=same?a.evolution.level:0;
  const button=document.createElement('button');button.type='button';button.className='forge-upgrade';button.disabled=level>=3;
  button.textContent=evolution.name+' '+(level>=3?'III / III':same?'↑ '+(level+1)+'/3':'I / III');
  button.addEventListener('click',()=>{if(forgeEdit(active,'mutate',evolution.id)){remember();renderWorkbench();sfx('shield')}});
  mutations.append(button);
 }
 const fusions=$('forge-fusions');fusions.replaceChildren();const available=new Set(availableFusions(a).map(x=>x.id));
 for(const f of FUSIONS){
  const button=document.createElement('button');button.type='button';button.className='forge-upgrade';
  button.textContent=f.name+(a.fusions?.includes(f.id)?' ✓':'');button.disabled=!available.has(f.id);button.title=f.desc;
  button.addEventListener('click',()=>{if(forgeEdit(active,'fuse',f.id)){remember();renderWorkbench();sfx('shield')}});
  fusions.append(button);
 }
 $('forge-dummy').textContent=active.forgeDummy?'Манекен · не атакует':'Соперник · атакует';
 $('forge-status').textContent=a.runes.length+'/9 рун · '+(a.evolution?EVOLUTIONS.find(x=>x.id===a.evolution.form)?.name+' '+a.evolution.level+'/3':'Выбери форму');
}
$('forge-dummy').addEventListener('click',()=>{if(active?.gameMode!=='forge')return;active.forgeDummy=!active.forgeDummy;remember();renderForgeLab()});
$('forge-reset').addEventListener('click',()=>{$('forge-reset-confirm').hidden=false});
$('forge-reset-no').addEventListener('click',()=>{$('forge-reset-confirm').hidden=true});
$('forge-reset-yes').addEventListener('click',()=>{if(active?.gameMode==='forge'&&forgeEdit(active,'reset')){remember();renderWorkbench();toast('Сборка сброшена')}$('forge-reset-confirm').hidden=true});

function renderWorkbench(){
 if(!active)return;const slots=debugSession?myActor().runes:online?.active?(onlinePreviewRunes||[...myActor().runes]):myActor().runes;
 const preview=$('bench-mage'),mini=preview.getContext('2d');mini.clearRect(0,0,64,80);
 drawMage(mini,appearance,{x:32,y:57,scale:2,time:0,runes:slots,mageId:myActor().mageId});
 const evolved=myActor().evolution,fusions=myActor().fusions||[];$('evo-readout').hidden=!['rupture','forge'].includes(active.gameMode);$('evo-readout').textContent=evolved?(EVOLUTIONS.find(x=>x.id===evolved.form)?.name+' · УРОВЕНЬ '+evolved.level+(fusions.length?' · СЛИЯНИЯ: '+fusions.map(id=>FUSIONS.find(x=>x.id===id)?.name).join(', '):'')):(fusions.length?'СЛИЯНИЯ: '+fusions.map(id=>FUSIONS.find(x=>x.id===id)?.name).join(', '):'Форма ещё не пробуждена. Выбери «Мутировать» при эволюции.');$('bench-count').textContent=slots.length+' / 9';$('forge-lab').hidden=active.gameMode!=='forge';if(active.gameMode==='forge')renderForgeLab();const rack=$('bench-slots'),previousScroll=rack.scrollTop;rack.replaceChildren();let lane=null,laneNumber=0;
 const info=description(slots);
 const available=new Set([mage(myActor().mageId).school]);
 for(const chain of info.chains)for(const action of chain.actions)if(['ball','blast','mine'].includes(action.id))available.add(chosenElement(action.mods,mage(myActor().mageId).school));
 const recipes=[];for(const first of available)for(const second of available)if(first<second){const reaction=reactionFor(first,second);if(reaction)recipes.push(reaction.label)}
 const recipeNode=$('chemistry-preview');recipeNode.classList.toggle('has-reaction',recipes.length>0);
 recipeNode.textContent=(recipes.length?'Реакции: '+recipes.join(' · ')+'. ':'')+
 'Фирменная атака: '+ATTACK_NAMES[myActor().mageId]+'. Руны «КАК» в собранных цепочках усиливают её: сила, ширина, дальность и темп. Эффект зависит от класса.';
 slots.forEach((id,i)=>{
  const r=rune(id);if(!r)return;
  if(r.type==='when'||!lane){laneNumber++;lane=document.createElement('div');lane.className='spell-lane';const head=document.createElement('div');head.className='spell-lane-head';const title=document.createElement('strong');title.textContent='ПРИЁМ '+Math.min(3,laneNumber);const subtitle=document.createElement('small');subtitle.textContent='Цепочка '+laneNumber;head.append(title,subtitle);lane.append(head);rack.append(lane)}
  const row=document.createElement('div');row.className='bench-slot '+(info.dormant.includes(id)?'is-dormant':'');
  row.dataset.slot=String(i);
  const role=document.createElement('span');role.className='rune-stage';role.textContent=r.type==='when'?'01 / УСЛОВИЕ':r.type==='do'?'02 / ДЕЙСТВИЕ':'03 / МУТАЦИЯ';row.append(role);
  const drag=document.createElement('div');drag.className='slot-drag';drag.setAttribute('role','button');drag.setAttribute('tabindex','0');
  drag.setAttribute('aria-label','Перетащить руну '+r.name);drag.append(drawRuneNode(r,true));
  const moves=document.createElement('div');moves.className='slot-move';
  for(const [delta,label] of [[-1,'↑'],[1,'↓']]){
   const btn=document.createElement('button');btn.type='button';btn.textContent=label;
   btn.disabled=i+delta<0||i+delta>=slots.length;
   btn.setAttribute('aria-label',label==='↑'?'Передвинуть раньше':'Передвинуть позже');
   btn.addEventListener('click',()=>{if(reorderOnBench(i,i+delta)){remember();renderWorkbench();sfx('dash')}});moves.append(btn)
  }
  drag.addEventListener('keydown',e=>{if(e.code==='ArrowUp'||e.code==='ArrowDown'){e.preventDefault();const to=i+(e.code==='ArrowUp'?-1:1);if(reorderOnBench(i,to)){remember();renderWorkbench()}}});
  drag.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;
   const origin={x:e.clientX,y:e.clientY};let moved=false;drag.setPointerCapture(e.pointerId);drag.classList.add('dragging');
   const onMove=ev=>{if(ev.pointerId!==e.pointerId)return;const dx=ev.clientX-origin.x,dy=ev.clientY-origin.y;if(Math.hypot(dx,dy)>5)moved=true;drag.style.transform='translate('+dx+'px,'+dy+'px)'};
   const onEnd=ev=>{if(ev.pointerId!==e.pointerId)return;drag.removeEventListener('pointermove',onMove);drag.removeEventListener('pointerup',onEnd);drag.removeEventListener('pointercancel',onEnd);drag.style.transform='';drag.classList.remove('dragging');
    if(ev.type==='pointercancel'||!moved)return;const rows=[...rack.querySelectorAll('.bench-slot')];let index=i,nearest=Infinity;
    for(let j=0;j<rows.length;j++){const box=rows[j].getBoundingClientRect(),dist=Math.hypot(ev.clientX-(box.left+box.width/2),ev.clientY-(box.top+box.height/2));if(dist<nearest){nearest=dist;index=j}}
    if(reorderOnBench(i,index)){remember();renderWorkbench();sfx('dash')}
   };
   drag.addEventListener('pointermove',onMove);drag.addEventListener('pointerup',onEnd);drag.addEventListener('pointercancel',onEnd);
  });
  row.append(drag,moves);lane.append(row);
 });
 while(laneNumber<3){laneNumber++;const empty=document.createElement('div');empty.className='spell-lane spell-lane-empty';const label=document.createElement('div');label.className='spell-lane-head';label.textContent='ПРИЁМ '+laneNumber;const hint=document.createElement('p');hint.textContent='Для нового приёма нужна руна «КОГДА».';empty.append(label,hint);rack.append(empty)}
 const nav=$('spell-index');nav.replaceChildren();
 const lanes=[...rack.querySelectorAll('.spell-lane')];
 lanes.forEach((panel,i)=>{
  const button=document.createElement('button');button.type='button';
  const amount=panel.querySelectorAll('.bench-slot').length;
  button.textContent='ПРИЁМ '+(i+1)+' · '+amount;
  button.className='spell-index-button'+(i===0?' active':'');
  button.setAttribute('aria-label','Перейти к приёму '+(i+1)+', рун '+amount);
  button.addEventListener('click',()=>{
   nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
   button.classList.add('active');
   rack.scrollTo({top:Math.max(0,panel.offsetTop-rack.offsetTop),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  });nav.append(button);
 });
 rack.scrollTop=previousScroll;
 const display=$('chain-preview');display.replaceChildren();
 for(const text of info.lines.length?info.lines:['Добавь «КОГДА» и «ЧТО». Руна «КАК» меняет действие прямо перед ней.']){
  const p=document.createElement('p');p.textContent=text;display.append(p);
 }
 if(info.dormant.length){const p=document.createElement('p');p.className='dormant-hint';p.textContent='Без действия: '+info.dormant.map(id=>rune(id).name).join(', ');display.append(p)}
 drawBenchSample(slots);
}
function drawBenchSample(ids){
 const node=$('bench-canvas'),p=node.getContext('2d');if(!p)return;
 const compiled=compile(ids),actions=compiled.flatMap(c=>c.actions),special=actions[0]?.id||'ball';p.clearRect(0,0,340,66);
 p.fillStyle='#35453c';p.fillRect(0,0,340,66);p.fillStyle='#63745c';
 for(let i=0;i<18;i++)p.fillRect(i*20,52,15,2);
 const wizard=(x,color)=>{p.fillStyle='#17221f';p.fillRect(x-7,42,15,4);p.fillStyle=color;p.fillRect(x-7,27,15,19);p.fillRect(x-11,22,23,5);p.fillRect(x-4,11,10,13);p.fillStyle='#ffdb9e';p.fillRect(x-3,33,4,4)};
 wizard(50,'#d2b080');wizard(290,'#b46d62');
 p.strokeStyle='#c7a47a';p.lineWidth=2;p.setLineDash([5,5]);p.beginPath();p.moveTo(80,32);p.lineTo(260,32);p.stroke();p.setLineDash([]);
 p.fillStyle='#ffe6b0';
 if(special==='wall'){p.fillStyle='#82907a';p.fillRect(170,12,19,39);p.fillStyle='#4c5e54';p.fillRect(174,16,11,29)}
 else if(special==='armor'){p.strokeStyle='#d6dca8';p.beginPath();p.arc(50,28,22,0,Math.PI*2);p.stroke()}
 else if(special==='heal'||special==='cool'||special==='haste'){p.fillRect(58,16,12,5);p.fillRect(61,12,5,14)}
 else if(special==='clone'){wizard(123,'#d4bc93')}
 else{p.fillRect(171,26,13,13);p.fillStyle='#e59e65';p.fillRect(177,20,3,6);p.fillRect(181,33,8,4)}
}
$('bench-fight').addEventListener('click',()=>{if(online?.active){if(online.ready(onlinePreviewRunes||myActor().runes)){if(online.view?.phase==='draft'){show('net-wait');toast('Ждём второго мага')}}return}if(active&&beginRound(active)){applyPendingAppearance();sfx('shield');remember();show('fight');toast('Сборка готова')}});
function renderResult(){drawPortrait($('result-portrait').getContext('2d'),appearance,56);const won=active.champion===myIndex();$('result-title').textContent=active.champion===null?'Ничья.':won?'Ты выиграл.':'Ты проиграл.';$('result-copy').textContent=active.champion===null?'Магия не выбрала победителя.':active.gameMode==='rupture'?(won?'Разлом пережил твою магию.':'Захватывай ядро и усиливай сборку.'):(won?'Сборка выдержала проверку. А может, просто повезло.':'В следующий раз собери что-нибудь похуже для врага.');$('result-score').textContent=active.score[myIndex()]+' : '+active.score[1-myIndex()];if(online?.active&&!debugSession){$('again').hidden=online.view?.host!==online.view?.seats?.[myIndex()];$('again').firstChild.textContent='Реванш ';$('net-result-leave').hidden=false}else{$('again').hidden=false;$('again').firstChild.textContent='Ещё один матч ';$('net-result-leave').hidden=true;forget();$('continue').hidden=true}}
function transition(){if(!active)return;if(active.phase==='draft'){void refreshAppearance();show('draft');renderDraft();remember();sfx('shield')}else if(active.phase==='build'){show('build');renderWorkbench();remember()}else if(active.phase==='result'){show('result');renderResult();sfx('overtime')}}
function savedBooks(){const books=stored(booksKey);return Array.isArray(books)?books.filter(b=>b&&legalRunes(b.runes)&&b.runes.length>=2).slice(0,12):[]}
function saveBuild(){
 if(!active||!legalRunes(myActor().runes))return false;
 const ids=[...(online?.active?onlinePreviewRunes||myActor().runes:myActor().runes)],list=savedBooks();
 const actor=myActor(),evolution=actor.evolution?{...actor.evolution}:null,fusions=[...(actor.fusions||[])],archetype=actor.archetype||'striker',gameMode=active.gameMode==='forge'?'forge':undefined;
 if(!list.some(b=>b.runes.join('|')===ids.join('|')&&JSON.stringify(b.evolution||null)===JSON.stringify(evolution)&&JSON.stringify(b.fusions||[])===JSON.stringify(fusions)&&(b.archetype||'striker')===archetype&&b.gameMode===gameMode))list.unshift({id:Date.now()+':'+Math.floor(Math.random()*100000),runes:ids,evolution,fusions,archetype,gameMode,date:Date.now()});
 put(booksKey,list.slice(0,12));toast('Сборка в гримуаре');sfx('heal');return true;
}
$('bench-save').addEventListener('click',saveBuild);
$('result-save').addEventListener('click',()=>{if(saveBuild())$('result-save').textContent='Сохранено'});
function renderBooks(){
 const root=$('book-list');root.replaceChildren();const books=savedBooks();
 if(!books.length){const p=document.createElement('p');p.textContent='Пока пусто. Собери цепочку в дуэли и сохрани её.';root.append(p);return}
 for(const book of books){
  const row=document.createElement('div');row.className='book-row';
  const name=document.createElement('div');name.className='book-identity';
  const title=document.createElement('strong');title.textContent=description(book.runes).lines[0]||'Сборка без цепочки';
  const summary=document.createElement('small');summary.textContent=book.runes.length+' рун · '+book.runes.map(id=>rune(id).name).join(' · ')+(book.evolution?' · '+(EVOLUTIONS.find(x=>x.id===book.evolution.form)?.name||'Эволюция')+' '+book.evolution.level+'/3':'')+(book.fusions?.length?' · '+book.fusions.map(id=>FUSIONS.find(x=>x.id===id)?.name).join(' + '):'')+' · '+(ARCHETYPES.find(x=>x.id===book.archetype)?.name||'Стрелок')+(book.gameMode==='forge'?' · ЛАБОРАТОРИЯ':'');name.append(title,summary);
  const actions=document.createElement('div');actions.className='book-actions';
  const play=document.createElement('button');play.type='button';play.textContent='Испытать';play.addEventListener('click',()=>{
   applyPendingAppearance();active=makeMatch((Date.now()>>>0)^book.runes.length,selectedMage,'pebble',book.gameMode==='forge'?'forge':book.evolution||book.fusions?.length?'rupture':'duel',validArchetype(book.archetype)?book.archetype:selectedArchetype,'shaper');active.actors[0].runes=[...book.runes];active.actors[0].evolution=book.evolution?{...book.evolution}:null;active.actors[0].fusions=[...(book.fusions||[])];startRound(active);remember();show('fight');toast('Сборка из гримуара');
  });
  const del=document.createElement('button');del.type='button';del.textContent='Удалить';del.addEventListener('click',()=>{bookToDelete=book.id;show('book-delete')});
  actions.append(play,del);row.append(name,actions);root.append(row);
 }
}
$('open-grimoire').addEventListener('click',()=>{show('books');renderBooks()});
$('books-close').addEventListener('click',()=>show('menu'));
$('book-delete-no').addEventListener('click',()=>{bookToDelete=null;show('books');renderBooks()});
$('book-delete-yes').addEventListener('click',()=>{put(booksKey,savedBooks().filter(b=>b.id!==bookToDelete));bookToDelete=null;show('books');renderBooks();toast('Сборка удалена')});

/* Screen atlas. Previewing never simulates turns, saves, or sends network actions. */
const DEV_SCENES=[
 ['menu','Главное меню'],['mage-select','Выбор мага'],['online-lobby','PocketNet / комната'],
 ['net-wait','Ожидание друга'],['fight','Бой'],['draft','Выбор руны'],
 ['build','Мастерская'],['result','Итог матча'],['pause','Пауза'],
 ['confirm','Подтверждение'],['books','Мои сборки'],['book-delete','Удаление сборки']
];
const atlas=document.createElement('aside');atlas.id='debug-atlas';atlas.hidden=true;
atlas.setAttribute('aria-label','Просмотр экранов Перекоса');
const atlasTop=document.createElement('div');atlasTop.className='debug-atlas-top';
const atlasTitle=document.createElement('strong');atlasTitle.textContent='АТЛАС ЭКРАНОВ';
const atlasClose=document.createElement('button');atlasClose.type='button';atlasClose.textContent='Закрыть ×';atlasClose.addEventListener('click',toggleDebug);
atlasTop.append(atlasTitle,atlasClose);
const atlasButtons=document.createElement('nav');atlasButtons.className='debug-atlas-pages';atlas.append(atlasTop,atlasButtons);
const atlasMessage=document.createElement('p');atlasMessage.textContent='Предпросмотр. Действия игры отключены; матч и сохранение останутся прежними.';
atlas.append(atlasMessage);$('app').append(atlas);
function debugFixture(){
 const mock=makeMatch(0x5012,selectedMage,MAGES[(MAGES.findIndex(m=>m.id===selectedMage)+2)%MAGES.length].id);
 mock.actors[0].runes=['on_cast','ball','wide','on_hit','blast','strong'];
 mock.actors[1].runes=['on_dash','mine','fastshot'];mock.pick=['on_guard','clone','as_storm'];
 mock.lastWinner=0;mock.lastOutcome='win';mock.score=[2,1];mock.round=4;mock.remaining=17;mock.champion=0;
 return mock;
}
function previewDebug(name){
 if(!debugSession)return;
 const fixture=debugSession.fixture;active=fixture;
 fixture.phase=name==='draft'?'draft':name==='build'?'build':name==='result'?'result':'fight';
 show(name);
 if(name==='draft')renderDraft();
 else if(name==='build')renderWorkbench();
 else if(name==='result')renderResult();
 else if(name==='books')renderBooks();
 else if(name==='mage-select')mageCards($('mage-options'),selectedMage,()=>{});
 atlasButtons.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===name)));
 atlas.dataset.scene=name;
}
function toggleDebug(){
 if(debugSession){
  const prev=debugSession;debugSession=null;atlas.hidden=true;
  active=prev.active;onlinePreviewRunes=prev.onlinePreviewRunes;paused=prev.paused;displayXY=prev.displayXY;$('continue').hidden=prev.continueHidden;
  lastTacticRunes='';combatPresentation.reset();spellChoreography.reset();seen=active?.serial||0;
  if(online?.active&&online.view){onlinePhase='';onlineView(online.view)}
  else{show(prev.mode);if(prev.mode==='draft')renderDraft();else if(prev.mode==='build')renderWorkbench();else if(prev.mode==='result')renderResult();else if(prev.mode==='books')renderBooks()}
  last=performance.now();return;
 }
 debugSession={active,mode,paused,onlinePreviewRunes,displayXY,continueHidden:$('continue').hidden,fixture:debugFixture()};
 keys.clear();input.attack=false;input.shield=false;input.dash=false;tapAttackQueued=false;
 atlas.hidden=false;previewDebug(mode==='fight'?'fight':'menu');
}
for(const [name,label] of DEV_SCENES){
 const button=document.createElement('button');button.type='button';button.dataset.scene=name;button.textContent=label;
 button.addEventListener('click',()=>previewDebug(name));atlasButtons.append(button);
}
document.addEventListener('pointerdown',event=>{
 if(debugSession&&!event.target.closest('#debug-atlas')){event.preventDefault();event.stopImmediatePropagation()}
},true);
document.addEventListener('click',event=>{
 if(debugSession&&!event.target.closest('#debug-atlas')){event.preventDefault();event.stopImmediatePropagation()}
},true);

document.addEventListener('keydown',e=>{if(e.code==='Backquote'){e.preventDefault();if(!e.repeat)toggleDebug();return}if(debugSession){e.preventDefault();if(e.code==='Escape')toggleDebug();return}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Escape'){if(mode==='fight')pause();else if(mode==='pause')$('resume').click();else if(mode==='confirm')$('quit-no').click();else if(mode==='books')$('books-close').click();else if(mode==='book-delete')$('book-delete-no').click()}if(mode!=='fight')return;if(['KeyQ','KeyE'].includes(e.code))input.shield=true;if(['ShiftLeft','ShiftRight','KeyF'].includes(e.code))input.dash=true;if(e.code==='Space')input.attack=true});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')input.attack=false});
window.addEventListener('blur',()=>{keys.clear();input.attack=false;if(mode==='fight'&&!debugSession)pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(mode==='fight'&&!debugSession)pause();remember();last=performance.now()}else last=performance.now()});
window.addEventListener('pagehide',remember);
const stickEl=$('stick'),knob=$('stick-knob');
function stickFrom(e){const rect=stickEl.getBoundingClientRect();let x=(e.clientX-rect.left-rect.width/2)/(rect.width*.31),y=(e.clientY-rect.top-rect.height/2)/(rect.height*.31);const d=Math.hypot(x,y);if(d>1){x/=d;y/=d}stick.x=x;stick.y=y;knob.style.transform='translate('+Math.round(x*rect.width*.31)+'px,'+Math.round(y*rect.height*.31)+'px)'}
stickEl.addEventListener('pointerdown',e=>{if(mode!=='fight'||stick.pointer!==null)return;e.preventDefault();stick.pointer=e.pointerId;stickEl.setPointerCapture(e.pointerId);stickFrom(e)});
stickEl.addEventListener('pointermove',e=>{if(e.pointerId===stick.pointer)stickFrom(e)});
function releaseStick(e){if(e.pointerId!==stick.pointer)return;stick.pointer=null;stick.x=stick.y=0;knob.style.transform='translate(0,0)'}
stickEl.addEventListener('pointerup',releaseStick);stickEl.addEventListener('pointercancel',releaseStick);stickEl.addEventListener('lostpointercapture',releaseStick);
function binder(id,field){const b=$(id);b.addEventListener('pointerdown',e=>{if(mode!=='fight')return;e.preventDefault();b.setPointerCapture(e.pointerId);if(field==='attack')input.attack=true;else input[field]=true});const release=e=>{if(field==='attack')input.attack=false};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);b.addEventListener('click',()=>{if(mode==='fight'&&field!=='attack')input[field]=true})}
binder('attack-btn','attack');binder('shield-btn','shield');binder('dash-btn','dash');
const aimButton=$('attack-btn');let aimedPointer=null,aimOrigin=null;
// A touch drag must establish its heading BEFORE the first shot. A brief tap
// still fires once; a deliberate hold fires repeatedly after the aim window.
aimButton.addEventListener('pointerdown',e=>{
 if(mode!=='fight')return;
 aimedPointer=e.pointerId;aimOrigin={x:e.clientX,y:e.clientY};aimTouch=e.pointerType!=='mouse';
 aimTouchStart=performance.now();aimDragged=false;aimVector=null;
 if(aimTouch){input.aim=null;input.attack=false}
 aimButton.classList.add('aiming');
});
aimButton.addEventListener('pointermove',e=>{
 if(mode!=='fight'||e.pointerId!==aimedPointer||!active)return;
 // The button scales and moves when pressed: its bounding rect is NOT a
 // stable drag origin. Use the first pointer coordinate for exact vectors.
 if(!aimOrigin)return;
 const dx=e.clientX-aimOrigin.x,dy=e.clientY-aimOrigin.y;
 if(Math.hypot(dx,dy)>11){
  const a=myActor();aimVector={dx,dy};input.aim=courtAim(a,dx,dy,W,H);
  aimDragged=true;input.attack=true;
 }
});
const stopAim=e=>{
 if(e.pointerId!==aimedPointer)return;
 if(aimTouch){
  if(e.type==='pointerup'&&!aimDragged)tapAttackQueued=true;
  input.aim=null;input.attack=false;
 }
 aimedPointer=null;aimOrigin=null;aimTouch=false;aimDragged=false;aimVector=null;aimButton.classList.remove('aiming');
};
aimButton.addEventListener('pointerup',stopAim);aimButton.addEventListener('pointercancel',stopAim);aimButton.addEventListener('lostpointercapture',stopAim);

function canvasPoint(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(W,(e.clientX-r.left)/r.width*W)),y:Math.max(0,Math.min(H,(e.clientY-r.top)/r.height*H))}}
canvas.addEventListener('pointermove',e=>{if(mode==='fight'&&e.pointerType==='mouse')input.aim=canvasPoint(e)});
canvas.addEventListener('pointerdown',e=>{if(mode!=='fight')return;input.aim=canvasPoint(e);if(e.pointerType==='mouse')input.attack=true});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')input.attack=false});
function playerInput(){
 if(aimedPointer!==null&&aimTouch&&!aimDragged&&performance.now()-aimTouchStart>260){aimDragged=true;input.attack=true}
 if(aimedPointer!==null&&aimTouch&&aimVector&&active)input.aim=courtAim(myActor(),aimVector.dx,aimVector.dy,W,H);
 let x=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=stick.y+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const speed=Math.hypot(x,y);if(speed>1){x/=speed;y/=speed}const out={x,y,attack:input.attack||tapAttackQueued||keys.has('Space'),shield:input.shield,dash:input.dash,aim:input.aim||{x:active.actors[1-myIndex()].x,y:active.actors[1-myIndex()].y}};input.shield=false;input.dash=false;tapAttackQueued=false;return out}
let bgCanvas;
// When Forge assets decode, swap the previously rendered fallback stage once.
void forgeCourtReady().then(ok=>{if(ok)bgCanvas=null});
function rng(seed){let a=seed>>>0;return()=>((a=Math.imul(a,1664525)+1013904223>>>0)/4294967296)}
function background(){return createCourtBackdrop(WALLS)}
function pixel(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function line(x,y,a,b,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke()}
function wizard(x,y,face,ticktime,enemy=false,alpha=1,shield=0,flash=0,moving=0,animate=false){
 const look=enemy?(online?.active?rivalAppearance:DEFAULT_APPEARANCE):appearance;
 const runes=active?.actors?.[enemy?1-myIndex():myIndex()]?.runes||[];
 const a=active?.actors?.[enemy?1-myIndex():myIndex()];
 const pose=animate&&a?mageMotion.sample(a,{x,y},performance.now()/1000,active?.round||0,reducedMotion):null;
 drawMage(ctx,look,{x,y,face,time:ticktime,enemy,alpha,scale:1,shield,flash,runes,mageId:a?.mageId||selectedMage,casting:a?.windup?.remaining>0?a.windup.remaining*2.7:a?.cast||0,dashing:a?.dash||0,moving,pose});
}
function drawEvolutionMagic(s){
 if(s?.gameMode!=='rupture')return;
 const colors={fire:'#efa464',storm:'#7ce1de',stone:'#d1d4aa'};
 ctx.save();
 for(const f of s.fields||[]){
  const color=colors[f.element]||colors.storm;
  ctx.globalAlpha=Math.max(.15,Math.min(.65,f.life*.17));ctx.strokeStyle=color;ctx.lineWidth=2+f.level;
  ctx.beginPath();ctx.arc(f.x,f.y,f.r*(.96+.04*Math.sin(frame*.13)),0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=.48;ctx.fillStyle=color;ctx.fillRect(f.x-8,f.y-8,16,16);ctx.strokeRect(f.x-14,f.y-14,28,28);
  for(let i=0;i<6;i++){const a=i*Math.PI/3+frame*.016;ctx.fillRect(f.x+Math.cos(a)*f.r-2,f.y+Math.sin(a)*f.r-2,4,4)}
 }
 for(const b of s.beams||[])if(b.style==='evo-beam'){
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.globalAlpha=Math.min(1,b.life*4);
  ctx.fillStyle=colors[b.element]||colors.storm;ctx.fillRect(4,-b.width,b.length,b.width*2);
  ctx.fillStyle='#fff2d5';ctx.fillRect(4,-Math.max(2,b.width*.26),b.length,Math.max(4,b.width*.52));
  ctx.restore();
 }
 ctx.restore();
}
function drawRuptureCore(s){
 if(s?.gameMode!=='rupture')return;
 const near=s.actors.map(a=>a.hp>0&&Math.hypot(a.x-200,a.y-310)<52),owner=near[0]&&!near[1]?0:near[1]&&!near[0]?1:-1;
 const hold=owner>=0?s.coreHold?.[owner]||0:0,pulse=3+Math.sin(frame*.07)*2;
 ctx.save();ctx.translate(200,310);ctx.strokeStyle=owner===0?'#a7d8e3':owner===1?'#e3ac83':'#c3b999';ctx.lineWidth=2;
 ctx.strokeRect(-29-pulse/2,-29-pulse/2,58+pulse,58+pulse);ctx.strokeRect(-17,-17,34,34);
 ctx.fillStyle='#152f32';ctx.fillRect(-12,-12,24,24);ctx.fillStyle='#e6c580';ctx.fillRect(-8,-8,16,16);ctx.fillStyle='#fff2c5';ctx.fillRect(-3,-3,6,6);
 if(hold>0){ctx.fillStyle=owner===0?'#93dce9':'#efb68d';ctx.fillRect(-25,32,50*hold/8,4)}ctx.restore();
}
function drawConstructs(s){
 if(drawForgeConstructs(ctx,s,frame/60,reducedMotion))return;
 for(const b of s.barriers){
  const wob=Math.sin(frame*.09+b.x*.13),r=b.r,life=Math.min(1,b.life/.5);
  ctx.save();ctx.globalAlpha=.7+.3*life;
  circle(b.x+5,b.y+10,r+4,'#102621b6');
  pixel(b.x-r+1,b.y-r+6,r*2,r*2,'#263a32');
  pixel(b.x-r,b.y-r+1,r*2-2,r*1.76,'#526653');
  pixel(b.x-r-3,b.y-r-6,r*2+6,9,'#abb497');
  pixel(b.x-r,b.y-r-7,r*2,3,'#d2c59e');
  pixel(b.x-r+6,b.y-r+11,4,r,'#2c463a');
  pixel(b.x+r-8,b.y-r+12,4,r-3,'#273d32');
  for(let j=0;j<5;j++){
   pixel(b.x-r+6+j*8,b.y-r-1+Math.sin(j+wob)*2,3,3,'#93a985');
  }
  ctx.restore();
 }
 for(const m of s.mines){
  const bob=Math.sin(frame*.11+m.x)*2,life=Math.min(1,m.life);
  circle(m.x+1,m.y+6,14,'#14211e92');
  ctx.strokeStyle='#8e9d78';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(m.x,m.y,16,8,frame*.01,0,Math.PI*2);ctx.stroke();
  pixel(m.x-8,m.y-9+bob,16,15,'#503a35');
  pixel(m.x-8,m.y-12+bob,16,6,'#a46c4c');
  pixel(m.x-3,m.y-15+bob,6,5,'#f6bd7c');
  pixel(m.x-1,m.y-17+bob,2,4,'#fff1b8');
  if(life<1)pixel(m.x-10,m.y-17+bob,20,2,'#ddb38e');
 }
}
// The stage-presentation layer now owns every confirmed combat burst.
// Echoes remain world objects and preserve the player's actual PocketWorks avatar.
function drawEffects(s){
 for(const e of s.echoes){
  wizard(e.x,e.y,0,frame/60,e.owner!==myIndex(),Math.min(.48,e.life/4),0,0);
  ctx.globalAlpha=.56;
  for(let i=0;i<5;i++)pixel(e.x-15+i*7,e.y-18+((i+Math.floor(frame/5))%3)*6,2,2,'#9cd0ba');
  ctx.globalAlpha=1;
 }
}
function drawOverlay(s){
 if(s?.phase==='fight'&&(s.gameMode==='rupture'?s.remaining<=90:s.remaining<10)){
  const radius=ringRadius(s),warning=.65+Math.sin(frame*.19)*.15;
  ctx.strokeStyle='#df9972';ctx.globalAlpha=warning;ctx.lineWidth=4;ctx.setLineDash([8,5]);
  ctx.beginPath();ctx.arc(200,310,radius,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);ctx.lineWidth=1.5;ctx.strokeStyle='#f0ce9b';ctx.beginPath();ctx.arc(200,310,radius-4,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=1;
 }
for(let i=0;i<14;i++){const v=(frame*.2+i*71)%620,x=20+(i*71%360);pixel(x,(v+Math.sin(frame*.003+i)*3)%620,2,2,'#f3dca128')}}
function render(){
 if(mode==='menu'&&frame%3===0)drawHero($('hero-preview').getContext('2d'),appearance,frame/60,[],selectedMage,reducedMotion);
 if(!bgCanvas)bgCanvas=background();
 combatPresentation.ingest(active,reducedMotion);
 spellChoreography.ingest(active,reducedMotion);
 contactTheater.ingest(active,reducedMotion);
 contactTheater.advance(1/60);
 combatPresentation.advance(1/60,reducedMotion);
 spellChoreography.advance(1/60);
 const offset=combatPresentation.offset(reducedMotion);
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#13201d';ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(offset.x,offset.y);
 ctx.drawImage(bgCanvas,0,0);
 drawCourtAtmosphere(ctx,frame/60,reducedMotion);
 if(active){
  drawSpellLighting(ctx,active,frame/60,reducedMotion);
  // Telegraphs belong to the physical court: visible projectiles and placed
  // mines only. No enemy hidden runes, damage estimates or artificial aim.
  drawGroundCues(ctx,active,myIndex(),frame/60,reducedMotion);
  drawRuptureCore(active);
  drawEvolutionMagic(active);
  drawSpellGround(ctx,spellChoreography,reducedMotion);
  drawSignatureGround(ctx,active,frame,reducedMotion);
  combatPresentation.ground(ctx);
  drawConstructs(active);
  drawEffects(active);
  drawSpellActors(ctx,active,frame/60,reducedMotion);
  for(let i=0;i<2;i++){
   const a=active.actors[i],mine=i===myIndex();
   if(!displayXY[i])displayXY[i]={x:a.x,y:a.y};
   const p=displayXY[i],oldX=p.x,oldY=p.y;
   if(combatPresentation.hold<=0){if(online?.active){p.x+=(a.x-p.x)*.34;p.y+=(a.y-p.y)*.34}else{p.x=a.x;p.y=a.y}}
   const moving=Math.min(1,Math.hypot(p.x-oldX,p.y-oldY)*.48);
   wizard(p.x,p.y,a.face,frame/60,!mine,1,a.shield,a.flash,moving,true);
   drawActorCues(ctx,a,p.x,p.y,mine,frame/60,reducedMotion);
   if(a.markLife>0&&ELEMENTS[a.mark]){
    const color=ELEMENTS[a.mark].color;
    pixel(p.x-3,p.y-37,6,5,color);pixel(p.x-1,p.y-34,2,3,'#fff3cf');
    for(let j=0;j<3;j++)pixel(p.x-14+j*14,p.y-20+(j===1?-3:2),2,2,color);
   }
  }
  duelFeedback.actors(ctx,active,frame/60,reducedMotion);
  drawKineticProjectiles(ctx,active,frame/60,{reduced:reducedMotion});
  drawSignatureForeground(ctx,active,frame,reducedMotion);
  contactTheater.draw(ctx,reducedMotion);
  drawSpellForeground(ctx,spellChoreography,reducedMotion,{impacts:false});
  combatPresentation.foreground(ctx);
  if(mode==='fight'&&input.aim)duelFeedback.aim(ctx,active.actors[myIndex()],input.aim,{reduced:reducedMotion});
 }else{
  wizard(107,352,0,frame/60,false,1,12,0);
  wizard(297,252,Math.PI,frame/60,true,1,9,0);
  for(let j=0;j<6;j++){
   const x=180+Math.sin(frame/50+j*2)*35,y=270+j*19+Math.cos(frame/37+j)*14;
   circle(x,y,4,'#f1c880');pixel(x-1,y-1,3,3,'#fdf3ca');
  }
 }
 drawOverlay(active);
 ctx.restore();
 combatPresentation.screen(ctx);
}
function handleEvents(){if(!active)return;let count=0;const played=new Set();for(const f of active.fx){if(f.id<=seen||count>=5||played.has(f.k))continue;sfx(f.k,active.actors.reduce((closest,a)=>!closest||Math.hypot(a.x-f.x,a.y-f.y)<Math.hypot(closest.x-f.x,closest.y-f.y)?a:closest,null)?.mageId?mage(active.actors.reduce((closest,a)=>!closest||Math.hypot(a.x-f.x,a.y-f.y)<Math.hypot(closest.x-f.x,closest.y-f.y)?a:closest,null).mageId).school:'fire');played.add(f.k);count++}seen=active.serial}
function loop(now){const elapsed=Math.min(.13,(now-last)/1000||0);last=now;frame++;if(toastT>0){toastT-=elapsed;if(toastT<=0)$('toast').classList.remove('visible')}if(online?.active){if(!debugSession&&online.view?.phase==='draft'&&now-netSyncAt>1700){netSyncAt=now;online.sync()}if(!debugSession&&active&&online.view?.phase==='fight'){online.sample(()=>mode==='fight'?playerInput():{x:0,y:0,aim:{x:active.actors[1-myIndex()].x,y:active.actors[1-myIndex()].y},attack:false,shield:false,dash:false},active.round,now);handleEvents()}if(frame%5===0)updateHud();acc=0}else if(mode==='fight'&&active&&!debugSession){acc+=elapsed;let steps=0;while(acc>=STEP&&steps<8){tick(active,playerInput());acc-=STEP;steps++;if(active.phase!=='fight')break}handleEvents();if(frame%5===0)updateHud();if(frame%120===0)remember();if(active.phase!=='fight')transition()}else acc=0;render();requestAnimationFrame(loop)}
requestAnimationFrame(loop);
// The authenticated avatar is presentation only: never serialize art into a
// combat save. Switching profiles does not change the sprite mid-round.
function applyPendingAppearance(){
 if(!pendingAppearance)return false;
 appearance=pendingAppearance;pendingAppearance=null;
 const label=appearance.source==='guest'?'Гостевой маг':appearance.name;
 const status={guest:'Открой профиль PocketWorks',preset:'Цвет из Pocket ID',maskot:'Маскот из PocketWorks',drawing:'Рисунок из PocketWorks'}[appearance.source];
 $('identity').textContent=label;$('identity-kind').textContent=status||'';
 $('my-name').textContent=(appearance.source==='guest'?'ТЫ':appearance.name).slice(0,13).toUpperCase();
 for(const [id,size] of [['menu-portrait',42],['my-portrait',40],['result-portrait',56]])drawPortrait($(id).getContext('2d'),appearance,size);
 if(active?.phase==='build')renderWorkbench();
 if(mode==='menu')drawHero($('hero-preview').getContext('2d'),appearance,frame/60,[],selectedMage,reducedMotion);
 return true;
}
function refreshAppearance({force=false}={}){
 // Safari dispatches focus/visibility events during navigation. Coalesce them
 // rather than issuing multiple forced Pocket ID requests and racing outcomes.
 if(avatarInFlight)return avatarInFlight;
 if(!force&&Date.now()-lastProfileFetch<10000)return Promise.resolve();
 lastProfileFetch=Date.now();const request=++profileRequest;
 const task=(async()=>{
  let identity=null,social=null;
  try{
   identity=await getPocketIdentity({force});
   if(identity?.complete){
    const result=await fetch('/pocket-social/me',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(3500)});
    if(result.ok)social=await result.json();
   }
  }catch{/* safe guest/preset fallback */}
  let next=normalizeAppearance(identity,social);
  next=await decodeAppearance(next);
  if(request!==profileRequest)return;
  pendingAppearance=next;
  if(!active||mode==='menu'||mode==='books'||mode==='result')applyPendingAppearance();
 })();
 avatarInFlight=task;
 return task.finally(()=>{if(avatarInFlight===task)avatarInFlight=null});
}
window.addEventListener('focus',()=>{if(mode==='menu'||mode==='books')void refreshAppearance({force:true})});
document.addEventListener('pocket-social:portrait',()=>{void refreshAppearance({force:true})});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(mode==='menu'||mode==='books'))void refreshAppearance({force:true})});
drawHero($('hero-preview').getContext('2d'),appearance,0,[],selectedMage);
drawPortrait($('menu-portrait').getContext('2d'),appearance,42);
drawPortrait($('my-portrait').getContext('2d'),appearance,40);
drawPortrait($('result-portrait').getContext('2d'),appearance,56);
void refreshAppearance({force:true});


function applyRival(){if(pendingRival){rivalAppearance=pendingRival;pendingRival=null}}
async function refreshRival(view){
 const index=1-view.me,member=view.players?.find(p=>p.id===view.seats?.[index]);
 if(!member)return;
 const id=member.verified&&typeof member.accountId==='string'?member.accountId:'';
 const key=id+'|'+(member.avatar||'')+'|'+(member.verified?'verified':'guest');
 if(key===rivalKey)return;
 rivalKey=key;const request=++rivalRequest;
 let next={...DEFAULT_APPEARANCE,source:'rival',colors:['#b26258','#ecc08f','#7a393f']};
 if(id&&/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(id)){
  const identity={id,complete:true,avatar:member.avatar,nickname:member.name};
  let social=null;
  try{
   const response=await fetch('/pocket-social/user?id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(3500)});
   if(response.ok)social=await response.json();
  }catch{}
  next=await decodeAppearance(normalizeAppearance(identity,social));
 }else if(Object.hasOwn(COLORSETS,member.avatar)){
  next={...DEFAULT_APPEARANCE,source:'preset',preset:member.avatar,colors:COLORSETS[member.avatar]};
 }
 if(request!==rivalRequest||!online?.active)return;
 pendingRival=next;
 if(['online-lobby','draft','build','net-wait'].includes(mode))applyRival();
}
function roomRoster(players=[],disconnected=''){
 const root=$('net-players');root.replaceChildren();
 for(let i=0;i<2;i++){
  const row=document.createElement('div');row.className='net-player';
  const p=players[i]||null,face=document.createElement('span');face.className='net-avatar';face.textContent=p?String(i+1):'○';
  const title=document.createElement('strong');title.textContent=p?.name||'Ждём второго мага';
  const tag=document.createElement('small');tag.textContent=p?(p.id===disconnected?'Не в сети':p.verified?'Pocket ID':'В комнате'):'';
  row.append(face,title,tag);root.append(row);
 }
}
function drawNetworkMageOptions(){
 const m=online?.view?.mages?.[online.me]||selectedMage;
 const pick=id=>{selectedMage=id;updateSelectedMage();remember();if(online?.active)online.chooseMage(id);mageCards($('net-mages'),id,pick,true)};
 mageCards($('net-mages'),m,pick,true);
 const chosen=online?.view?.archetypes?.[online.me]||selectedArchetype;
 const set=id=>{selectedArchetype=id;updateSelectedMage();remember();online?.chooseArchetype(id);archetypeCards($('net-archetypes'),id,set)};
 archetypeCards($('net-archetypes'),chosen,set);
}
function roomInfo(roomId){
 $('net-room-info').hidden=!roomId;$('net-choice').hidden=!!roomId;
 $('net-copy-code').textContent=roomId?inviteCode(roomId):'--------';
 $('net-title').textContent=roomId?'Комната готова':'Играть вдвоём';
}
function onlineView(view){
 if(!online?.active||!view)return;
 if(debugSession){online.view=view;return}
 void refreshRival(view);
 online.view=view;active=view.match||null;
 const stamp=[view.phase,active?.round??0,view.picked,view.ready,view.gameMode].join(':');
 if(stamp===onlinePhase){if(view.phase==='lobby'){updateNetworkLobby(view);drawNetworkMageOptions()}return}
 onlinePhase=stamp;displayXY=[null,null];
 if(view.phase==='lobby'){applyRival();show('online-lobby');updateNetworkLobby(view);drawNetworkMageOptions();if(view.mages?.[view.me]!==selectedMage)online.chooseMage(selectedMage);if(view.archetypes?.[view.me]!==selectedArchetype)online.chooseArchetype(selectedArchetype)}
 else if(view.phase==='fight'){onlinePreviewRunes=null;applyRival();applyPendingAppearance();show('fight');toast('Дуэль началась')}
 else if(view.phase==='draft'){
  applyRival();if(view.ready){show('net-wait')}
  else if(view.picked){onlinePreviewRunes=[...myActor().runes];show('build');renderWorkbench()}
  else{onlinePreviewRunes=null;show('draft');renderDraft()}
 }else if(view.phase==='result'){show('result');renderResult()}
}
function updateNetworkLobby(view){
 const full=(view?.seats?.length||0)===2;
 const isHost=view?.host===view?.seats?.[view.me];
 $('net-start').hidden=!full||!isHost;
 for(const kind of ['rupture','duel']){const btn=$('net-mode-'+kind);btn.disabled=!isHost;btn.setAttribute('aria-pressed',String((view.gameMode||'rupture')===kind))}
 $('net-start').firstChild.textContent=view.gameMode==='duel'?'Начать дуэль ':'Начать Разлом ';
 $('net-help').textContent=full?'Создатель комнаты выбирает режим и запускает матч.':'Пришли код другу. Оба игрока смогут участвовать со своих устройств.';
 roomRoster(view?.players||[]);
}
online=new OnlineDuel({
 onView:onlineView,
 onRoom:roomId=>{roomInfo(roomId);if(!roomId){onlinePhase='';rivalKey='';rivalRequest++;pendingRival=null;rivalAppearance={...DEFAULT_APPEARANCE,source:'rival',colors:['#b26258','#ecc08f','#7a393f']}}},
 onStatus:message=>{$('net-feedback').textContent=message;$('net-signal').textContent=message.includes('потеряна')?'НЕТ СВЯЗИ':online?.connected?'В СЕТИ':'ПОДКЛЮЧЕНИЕ';if(!['fight','draft','build','result','net-wait'].includes(mode))$('net-feedback').textContent=message},
 onError:message=>{$('net-feedback').textContent=message;toast(message);$('net-signal').textContent='ОШИБКА'},
 onPresence:roomRoster
});
function startNetwork(kind,code=''){
 show('online-lobby');onlinePhase='';active=null;displayXY=[null,null];
 $('net-feedback').textContent='Подключаемся…';
 roomInfo(null);online.open(kind,code).catch(e=>{$('net-feedback').textContent=e.message||String(e)});
}
$('online-open').addEventListener('click',()=>{roomInfo(null);show('online-lobby');onlinePhase='';$('net-feedback').textContent='Создай комнату или введи код друга.'});
$('net-create').addEventListener('click',()=>startNetwork('create'));
$('net-join').addEventListener('click',()=>{
 const code=$('net-code').value.trim().toUpperCase();
 if(!/^[0-9A-F]{8}$/.test(code)&&!/^[0-9A-F-]{36}$/.test(code)){$('net-feedback').textContent='Введите восемь символов из приглашения.';return}
 startNetwork('join',code);
});
$('net-resume').addEventListener('click',()=>startNetwork('resume'));
$('net-start').addEventListener('click',()=>online.start());
for(const kind of ['rupture','duel'])$('net-mode-'+kind).addEventListener('click',()=>{if(online?.active)online.chooseMode(kind)});
$('net-back').addEventListener('click',()=>{online.leave();onlinePhase='';active=null;show('menu')});
$('net-wait-leave').addEventListener('click',()=>{online.leave();onlinePhase='';active=null;show('menu')});
$('net-result-leave').addEventListener('click',()=>{online.leave();onlinePhase='';active=null;show('menu')});
async function copyRoom(link){
 const code=online.room;if(!code)return;
 const value=link?location.origin+location.pathname+'?room='+encodeURIComponent(inviteCode(code)):inviteCode(code);
 try{await navigator.clipboard.writeText(value);toast(link?'Приглашение скопировано':'Код скопирован')}
 catch{$('net-feedback').textContent=value;toast('Текст приглашения показан внизу. Его можно выделить.')}
}
$('net-copy-code').addEventListener('click',()=>void copyRoom(false));
$('net-copy-link').addEventListener('click',()=>void copyRoom(true));
try{
 const prefix='perekos-net:pocket-net:'+location.origin+'/pocketnet';
 const saved=JSON.parse(localStorage.getItem(prefix)||'null');
 $('net-resume').hidden=!saved?.roomId;
}catch{}
const invite=incomingCode();
if(invite){$('net-code').value=invite;show('online-lobby');$('net-feedback').textContent='Приглашение готово. Нажми «Войти».'}

window.__perekosTest={get state(){return active},get mode(){return mode},get aim(){return input.aim?{...input.aim}:null},get appearance(){return {source:appearance.source,accountId:appearance.accountId,preset:appearance.preset,mascot:appearance.mascot,colors:appearance.colors,hasArt:!!appearance.artCanvas}},get hasPendingAppearance(){return !!pendingAppearance},get selectedGameMode(){return selectedGameMode},get selectedArchetype(){return selectedArchetype},forge:startForge,forgeEdit:(action,id)=>{if(!active||!forgeEdit(active,action,id))return false;remember();renderWorkbench();return true},refreshAvatar:()=>refreshAppearance({force:true}),start:newMatch,step:()=>{if(active){tick(active,{attack:true});if(active.phase!=='fight')transition()}},pick:(id,slot=null)=>{if(active?.phase==='draft'){return finishPick(id,slot)}return false},build:()=>{$('bench-fight').click()},reorder:(from,to)=>{const result=reorderRunes(active,from,to);if(result)renderWorkbench();return result},save:saveBuild};
