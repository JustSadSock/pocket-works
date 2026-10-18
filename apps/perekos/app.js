import {W,H,STEP,WALLS,RUNES,makeMatch,validState,tick,chooseRune,beginRound,reorderRunes,startRound,ringRadius,has,stats} from './core.mjs';
import {rune,description,compile,TYPES,legalRunes,chosenElement} from './runes.mjs';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {DEFAULT_APPEARANCE,COLORSETS,normalizeAppearance,decodeAppearance} from './avatar-profile.mjs';
import {drawMage,drawPortrait,drawHero} from './mage-art.mjs';
import {OnlineDuel,inviteCode,incomingCode} from './net-client.mjs';
import {MAGES,SCHOOLS,mage,validMage} from './mages.mjs';
import {ELEMENTS,reactionFor} from './elements.mjs';
import {createCourtBackdrop,drawCourtAtmosphere} from './court-art.mjs';
import {CombatPresentation,drawProjectileTrail} from './combat-presentation.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;
const storage='pocket-works:perekos:',prefsKey=storage+'prefs',saveKey=storage+'match',booksKey=storage+'grimoire';
let appearance={...DEFAULT_APPEARANCE},pendingAppearance=null,profileRequest=0,lastProfileFetch=0,avatarInFlight=null;
let online=null,onlinePreviewRunes=null,onlinePhase='',displayXY=[null,null];
let rivalAppearance={...DEFAULT_APPEARANCE,source:'rival',colors:['#b26258','#ecc08f','#7a393f']},pendingRival=null,rivalKey='',rivalRequest=0;
let selectedMage='kindle',mageFrom='menu',selectionDraft='kindle';
let sound=true,paused=false,mode='menu',active=null,last=performance.now(),acc=0,frame=0,quietTimer=0,audio=null,seen=0,quitPrompt=false,fxParticles=[],pendingRune=null,bookToDelete=null;
const combatPresentation=new CombatPresentation();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys=new Set(),input={x:0,y:0,attack:false,shield:false,dash:false,aim:null},stick={pointer:null,x:0,y:0},touches=new Map();
function stored(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const savedPrefs=stored(prefsKey);sound=savedPrefs?.sound!==false;selectedMage=validMage(savedPrefs?.mage)?savedPrefs.mage:'kindle';
function remember(){put(prefsKey,{sound,mage:selectedMage});if(!online?.active&&active&&validState(active))put(saveKey,active)}
function forget(){try{localStorage.removeItem(saveKey)}catch{}}
const resume=stored(saveKey);
if(resume&&validState(resume))$('continue').hidden=false;
function audioContext(){if(!sound)return null;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio}catch{return null}}
function sfx(type){const ac=audioContext();if(!ac)return;const now=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();const notes={overload:[96,440,.33,'sawtooth'],mine:[380,85,.22,'triangle'],shoot:[450,160,.085,'triangle'],hit:[120,55,.12,'square'],shield:[330,650,.2,'sine'],spark:[740,220,.09,'square'],heal:[480,700,.14,'sine'],dash:[230,520,.09,'triangle'],react_steam:[420,160,.23,'sine'],react_crack:[110,380,.19,'square'],react_slag:[150,85,.26,'sawtooth'],overtime:[95,160,.3,'sawtooth']};const [a,b,len,wave]=notes[type]||notes.shoot;o.type=wave;o.frequency.setValueAtTime(a,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,b),now+len);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(type==='hit'?.045:.028,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+len);o.connect(g).connect(ac.destination);o.start(now);o.stop(now+len+.02)}
function setAudio(){sound=!sound;remember();$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');if(sound)audioContext()}
$('menu-audio').addEventListener('click',setAudio);$('pause-audio').addEventListener('click',setAudio);
$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');
function show(name){mode=name;for(const id of ['menu','mage-select','draft','build','books','book-delete','result','pause','confirm','online-lobby','net-wait'])$(id).hidden=id!==name;$('controls').hidden=name!=='fight';$('hud').hidden=!active||['menu','mage-select','online-lobby','books','book-delete'].includes(name);if(name==='fight'||name==='menu')paused=false;if(name!=='fight')input.aim=null;input.attack=false;input.shield=false;input.dash=false;seen=active?.serial||0;updateHud()}
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
   const symbol=document.createElement('canvas');symbol.className='mage-sprite';symbol.width=50;symbol.height=54;const miniature=symbol.getContext('2d');miniature.imageSmoothingEnabled=false;drawMage(miniature,appearance,{x:25,y:38,scale:1,time:0,mageId:m.id});
   const label=document.createElement('span'),title=document.createElement('strong');title.textContent=m.name;label.append(title);
   if(!small){const detail=document.createElement('small');detail.textContent=m.description;label.append(detail)}
   btn.append(symbol,label);btn.addEventListener('click',()=>onPick(m.id));choices.append(btn);
  }group.append(choices);node.append(group);
 }
}
function updateSelectedMage(){
 $('chosen-mage-name').textContent=mage(selectedMage).name;drawHero($('hero-preview').getContext('2d'),appearance,0,[],selectedMage);
 $('attack-name').textContent={fire:'ЖАР',storm:'РАЗРЯД',stone:'КАМЕНЬ'}[mage(selectedMage).school];
}
$('choose-mage').addEventListener('click',()=>{
 mageFrom='menu';selectionDraft=selectedMage;show('mage-select');
 const pick=id=>{selectionDraft=id;mageCards($('mage-options'),id,pick)};
 mageCards($('mage-options'),selectedMage,pick);
});
$('mage-cancel').addEventListener('click',()=>show('menu'));
$('mage-confirm').addEventListener('click',()=>{selectedMage=selectionDraft;updateSelectedMage();remember();show('menu');toast('Выбран '+mage(selectedMage).name)});
updateSelectedMage();
function newMatch(){if(online?.active)online.leave();onlinePhase='';applyPendingAppearance();active=makeMatch((Date.now()>>>0)^Math.floor(Math.random()*0xffffffff),selectedMage,MAGES[(MAGES.findIndex(m=>m.id===selectedMage)+3)%MAGES.length].id);fxParticles=[];combatPresentation.reset();seen=0;audioContext();show('fight');toast('Зажми атаку, веди пальцем для прицеливания');remember()}
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
function myIndex(){return online?.active?online.me:0}
function myActor(){return active?.actors?.[myIndex()]}
function updateHud(){if(!active)return;const side=myIndex(),a=active.actors[side],b=active.actors[1-side];const am=stats(a),bm=stats(b);$('my-hp').style.width=Math.max(0,100*a.hp/am.max)+'%';$('bot-hp').style.width=Math.max(0,100*b.hp/bm.max)+'%';$('my-hp-text').textContent=Math.ceil(a.hp)+' / '+am.max;$('bot-hp-text').textContent=Math.ceil(b.hp)+' / '+bm.max;$('clock').textContent=Math.ceil(active.remaining);$('clock').style.color=active.overtime?'#f3a27c':'#f7edce';$('round-number').textContent=active.remaining<=10?'10 С ДО КОНЦА':'РАУНД '+active.round;$('score-me').textContent='● '.repeat(active.score[side])+'○ '.repeat(4-active.score[side]);$('score-bot').textContent='● '.repeat(active.score[1-side])+'○ '.repeat(4-active.score[1-side]);$('heat-fill').style.width=Math.round(a.heat)+'%';$('heat-value').textContent=Math.round(a.heat)+'%';
$('heat-fill').classList.toggle('danger',a.heat>=78);
$('dash-cooldown').style.height=100*Math.min(1,a.dashReady/2.5)+'%';$('shield-cooldown').style.height=100*Math.min(1,a.shieldReady/5)+'%';$('attack-cooldown').style.height=100*Math.min(1,a.cast/stats(a).reload)+'%';$('attack-name').textContent={fire:'ЖАР',storm:'РАЗРЯД',stone:'КАМЕНЬ'}[mage(a.mageId).school]}
const icons={when:'⌁',do:'✷',how:'↗'};
function typeName(type){return TYPES[type]||type}
function drawRuneNode(r,compact=false){
 const row=document.createElement('span');row.className='rune-node rune-'+r.type;
 const ic=document.createElement('span');ic.className='rune-icon';ic.textContent=icons[r.type];
 const text=document.createElement('span'),title=document.createElement('strong');title.textContent=r.name;
 const detail=document.createElement('small');detail.textContent=compact?typeName(r.type):typeName(r.type)+' · '+r.desc;
 text.append(title,detail);row.append(ic,text);return row;
}
function drawOwned(){
 $('loadout').replaceChildren();
 for(const id of myActor().runes){const r=rune(id);if(!r)continue;const b=document.createElement('b');b.textContent=r.name;$('loadout').append(b)}
}
function finishPick(id,slot=null){
 if(online?.active){if(!online.pick(id,slot))return false;pendingRune=null;$('replace-zone').hidden=true;toast('Руна выбрана.');return true}
 if(!chooseRune(active,id,slot))return false;
 pendingRune=null;$('replace-zone').hidden=true;sfx('heal');remember();show('build');renderWorkbench();return true;
}
function renderReplacement(id){
 pendingRune=id;$('replace-zone').hidden=false;$('rune-cards').hidden=true;const list=$('replace-list');list.replaceChildren();
 const slots=myActor().runes;
 slots.forEach((owned,i)=>{const r=rune(owned),btn=document.createElement('button');btn.type='button';btn.className='replacement';btn.textContent=(i+1)+'. '+r.name;btn.addEventListener('click',()=>finishPick(id,i));list.append(btn)});
}
$('replace-cancel').addEventListener('click',()=>{pendingRune=null;$('replace-zone').hidden=true;$('rune-cards').hidden=false});
function renderDraft(){
 if(!active)return;
 $('draft-score').textContent=active.score[myIndex()]+' : '+active.score[1-myIndex()];
 $('draft-outcome').textContent=active.lastOutcome==='draw'?'РАУНД ВНИЧЬЮ · 0 ОЧКОВ':'';
 $('draft-title').textContent=active.lastOutcome==='draw'?'Ничья. Очки не меняются. Возьми руну.':active.lastWinner===myIndex()?'Хороший раунд. Возьми руну.':'Проиграли раунд. Возьми руну.';
 $('rune-cards').hidden=false;$('replace-zone').hidden=true;pendingRune=null;
 const list=$('rune-cards');list.replaceChildren();
 for(const id of (online?.active?online.view?.offers||[]:active.pick)){
  const r=rune(id);if(!r)continue;const btn=document.createElement('button');btn.className='rune-choice';btn.type='button';btn.append(drawRuneNode(r));
  btn.addEventListener('click',()=>{if(myActor().runes.length>=9)renderReplacement(id);else finishPick(id)});list.append(btn);
 }
 drawOwned();
}
function reorderOnBench(from,to){if(online?.active){const list=onlinePreviewRunes;if(!Array.isArray(list)||from<0||to<0||from>=list.length||to>=list.length)return false;const [id]=list.splice(from,1);list.splice(to,0,id);return true}return reorderRunes(active,from,to)}
function renderWorkbench(){
 if(!active)return;const slots=online?.active?(onlinePreviewRunes||[...myActor().runes]):myActor().runes;
 const preview=$('bench-mage'),mini=preview.getContext('2d');mini.clearRect(0,0,64,80);
 drawMage(mini,appearance,{x:32,y:57,scale:1.25,time:0,runes:slots,mageId:myActor().mageId});
 $('bench-count').textContent=slots.length+' / 9';const rack=$('bench-slots'),previousScroll=rack.scrollTop;rack.replaceChildren();let lane=null,laneNumber=0;
 const info=description(slots);
 const available=new Set([mage(myActor().mageId).school]);
 for(const chain of info.chains)for(const action of chain.actions)if(['ball','blast','mine'].includes(action.id))available.add(chosenElement(action.mods,mage(myActor().mageId).school));
 const recipes=[];for(const first of available)for(const second of available)if(first<second){const reaction=reactionFor(first,second);if(reaction)recipes.push(reaction.label)}
 const recipeNode=$('chemistry-preview');recipeNode.classList.toggle('has-reaction',recipes.length>0);
 recipeNode.textContent=recipes.length?'Можно получить: '+recipes.join(' · ')+'. Попади двумя разными видами магии подряд.':'Для реакции добавь к шару руну «Дать разряд», «Сделать горячим» или «Добавить камень».';
 slots.forEach((id,i)=>{
  const r=rune(id);if(!r)return;
  if(r.type==='when'||!lane){laneNumber++;lane=document.createElement('div');lane.className='spell-lane';const head=document.createElement('div');head.className='spell-lane-head';head.textContent='ПРИЁМ '+Math.min(3,laneNumber);lane.append(head);rack.append(lane)}
  const row=document.createElement('div');row.className='bench-slot '+(info.dormant.includes(id)?'is-dormant':'');
  row.dataset.slot=String(i);
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
   const origin=e.clientY;let moved=false;drag.setPointerCapture(e.pointerId);drag.classList.add('dragging');
   const onMove=ev=>{if(ev.pointerId!==e.pointerId)return;const delta=ev.clientY-origin;if(Math.abs(delta)>5)moved=true;drag.style.transform='translateY('+delta+'px)'};
   const onEnd=ev=>{if(ev.pointerId!==e.pointerId)return;drag.removeEventListener('pointermove',onMove);drag.removeEventListener('pointerup',onEnd);drag.removeEventListener('pointercancel',onEnd);drag.style.transform='';drag.classList.remove('dragging');
    if(ev.type==='pointercancel'||!moved)return;const rows=[...rack.querySelectorAll('.bench-slot')];let index=i,nearest=Infinity;
    for(let j=0;j<rows.length;j++){const box=rows[j].getBoundingClientRect(),dist=Math.abs(ev.clientY-(box.top+box.height/2));if(dist<nearest){nearest=dist;index=j}}
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
function renderResult(){drawPortrait($('result-portrait').getContext('2d'),appearance,56);const won=active.champion===myIndex();$('result-title').textContent=won?'Ты выиграл.':'Ты проиграл.';$('result-copy').textContent=won?'Сборка выдержала проверку. А может, просто повезло.':'В следующий раз собери что-нибудь похуже для врага.';$('result-score').textContent=active.score[myIndex()]+' : '+active.score[1-myIndex()];if(online?.active){$('again').hidden=online.view?.host!==online.view?.seats?.[myIndex()];$('again').firstChild.textContent='Реванш ';$('net-result-leave').hidden=false}else{$('again').hidden=false;$('again').firstChild.textContent='Ещё один матч ';$('net-result-leave').hidden=true;forget();$('continue').hidden=true}}
function transition(){if(!active)return;if(active.phase==='draft'){void refreshAppearance();show('draft');renderDraft();remember();sfx('shield')}else if(active.phase==='build'){show('build');renderWorkbench();remember()}else if(active.phase==='result'){show('result');renderResult();sfx('overtime')}}
function savedBooks(){const books=stored(booksKey);return Array.isArray(books)?books.filter(b=>b&&legalRunes(b.runes)&&b.runes.length>=2).slice(0,12):[]}
function saveBuild(){
 if(!active||!legalRunes(myActor().runes))return false;
 const ids=[...(online?.active?onlinePreviewRunes||myActor().runes:myActor().runes)],list=savedBooks();
 if(!list.some(b=>b.runes.join('|')===ids.join('|')))list.unshift({id:Date.now()+':'+Math.floor(Math.random()*100000),runes:ids,date:Date.now()});
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
  const summary=document.createElement('small');summary.textContent=book.runes.length+' рун · '+book.runes.map(id=>rune(id).name).join(' · ');name.append(title,summary);
  const actions=document.createElement('div');actions.className='book-actions';
  const play=document.createElement('button');play.type='button';play.textContent='Испытать';play.addEventListener('click',()=>{
   applyPendingAppearance();active=makeMatch((Date.now()>>>0)^book.runes.length);active.actors[0].runes=[...book.runes];startRound(active);remember();show('fight');toast('Сборка из гримуара');
  });
  const del=document.createElement('button');del.type='button';del.textContent='Удалить';del.addEventListener('click',()=>{bookToDelete=book.id;show('book-delete')});
  actions.append(play,del);row.append(name,actions);root.append(row);
 }
}
$('open-grimoire').addEventListener('click',()=>{show('books');renderBooks()});
$('books-close').addEventListener('click',()=>show('menu'));
$('book-delete-no').addEventListener('click',()=>{bookToDelete=null;show('books');renderBooks()});
$('book-delete-yes').addEventListener('click',()=>{put(booksKey,savedBooks().filter(b=>b.id!==bookToDelete));bookToDelete=null;show('books');renderBooks();toast('Сборка удалена')});
document.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Escape'){if(mode==='fight')pause();else if(mode==='pause')$('resume').click();else if(mode==='confirm')$('quit-no').click();else if(mode==='books')$('books-close').click();else if(mode==='book-delete')$('book-delete-no').click()}if(mode!=='fight')return;if(['KeyQ','KeyE'].includes(e.code))input.shield=true;if(['ShiftLeft','ShiftRight','KeyF'].includes(e.code))input.dash=true;if(e.code==='Space')input.attack=true});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space')input.attack=false});
window.addEventListener('blur',()=>{keys.clear();input.attack=false;if(mode==='fight')pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(mode==='fight')pause();remember();last=performance.now()}else last=performance.now()});
window.addEventListener('pagehide',remember);
const stickEl=$('stick'),knob=$('stick-knob');
function stickFrom(e){const rect=stickEl.getBoundingClientRect();let x=(e.clientX-rect.left-rect.width/2)/(rect.width*.31),y=(e.clientY-rect.top-rect.height/2)/(rect.height*.31);const d=Math.hypot(x,y);if(d>1){x/=d;y/=d}stick.x=x;stick.y=y;knob.style.transform='translate('+Math.round(x*rect.width*.31)+'px,'+Math.round(y*rect.height*.31)+'px)'}
stickEl.addEventListener('pointerdown',e=>{if(mode!=='fight'||stick.pointer!==null)return;e.preventDefault();stick.pointer=e.pointerId;stickEl.setPointerCapture(e.pointerId);stickFrom(e)});
stickEl.addEventListener('pointermove',e=>{if(e.pointerId===stick.pointer)stickFrom(e)});
function releaseStick(e){if(e.pointerId!==stick.pointer)return;stick.pointer=null;stick.x=stick.y=0;knob.style.transform='translate(0,0)'}
stickEl.addEventListener('pointerup',releaseStick);stickEl.addEventListener('pointercancel',releaseStick);stickEl.addEventListener('lostpointercapture',releaseStick);
function binder(id,field){const b=$(id);b.addEventListener('pointerdown',e=>{if(mode!=='fight')return;e.preventDefault();b.setPointerCapture(e.pointerId);if(field==='attack')input.attack=true;else input[field]=true});const release=e=>{if(field==='attack')input.attack=false};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);b.addEventListener('click',()=>{if(mode==='fight'&&field!=='attack')input[field]=true})}
binder('attack-btn','attack');binder('shield-btn','shield');binder('dash-btn','dash');
const aimButton=$('attack-btn');let aimedPointer=null;
aimButton.addEventListener('pointerdown',e=>{if(mode==='fight'){aimedPointer=e.pointerId;input.aim=null;aimButton.classList.add('aiming')}});
aimButton.addEventListener('pointermove',e=>{
 if(mode!=='fight'||e.pointerId!==aimedPointer||!active)return;
 const r=aimButton.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
 if(Math.hypot(dx,dy)>11){const a=myActor(),d=Math.hypot(dx,dy);input.aim={x:Math.max(0,Math.min(W,a.x+dx/d*330)),y:Math.max(0,Math.min(H,a.y+dy/d*330))};}
});
const stopAim=e=>{if(e.pointerId!==aimedPointer)return;aimedPointer=null;aimButton.classList.remove('aiming');if(e.pointerType!=='mouse')input.aim=null};
aimButton.addEventListener('pointerup',stopAim);aimButton.addEventListener('pointercancel',stopAim);aimButton.addEventListener('lostpointercapture',stopAim);

function canvasPoint(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(W,(e.clientX-r.left)/r.width*W)),y:Math.max(0,Math.min(H,(e.clientY-r.top)/r.height*H))}}
canvas.addEventListener('pointermove',e=>{if(mode==='fight'&&e.pointerType==='mouse')input.aim=canvasPoint(e)});
canvas.addEventListener('pointerdown',e=>{if(mode!=='fight')return;input.aim=canvasPoint(e);if(e.pointerType==='mouse')input.attack=true});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')input.attack=false});
function playerInput(){let x=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=stick.y+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const speed=Math.hypot(x,y);if(speed>1){x/=speed;y/=speed}const out={x,y,attack:input.attack||keys.has('Space'),shield:input.shield,dash:input.dash,aim:input.aim||{x:active.actors[1-myIndex()].x,y:active.actors[1-myIndex()].y}};input.shield=false;input.dash=false;return out}
let bgCanvas;
function rng(seed){let a=seed>>>0;return()=>((a=Math.imul(a,1664525)+1013904223>>>0)/4294967296)}
function background(){return createCourtBackdrop(WALLS)}
function pixel(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function line(x,y,a,b,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke()}
function wizard(x,y,face,ticktime,enemy=false,alpha=1,shield=0,flash=0,moving=0){
 const look=enemy?(online?.active?rivalAppearance:DEFAULT_APPEARANCE):appearance;
 const runes=active?.actors?.[enemy?1-myIndex():myIndex()]?.runes||[];
 const a=active?.actors?.[enemy?1-myIndex():myIndex()];drawMage(ctx,look,{x,y,face,time:ticktime,enemy,alpha,scale:1.18,shield,flash,runes,mageId:a?.mageId||selectedMage,casting:a?.cast||0,dashing:a?.dash||0,moving});
}
function drawConstructs(s){
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
function drawShots(s){
 for(const q of s.shots){
  const x=Math.round(q.x),y=Math.round(q.y),style=q.style||'orb',friendly=q.owner===myIndex();
  drawProjectileTrail(ctx,q,frame/60);
  const backX=q.vx/(Math.hypot(q.vx,q.vy)||1),backY=q.vy/(Math.hypot(q.vx,q.vy)||1);
  const element=ELEMENTS[q.element];if(element){circle(x,y,Math.max(4,q.r+3),element.color+'52');pixel(x-backX*13-2,y-backY*13-2,4,4,element.color)}
  if(style==='bolt'||style==='arc'){
   ctx.lineWidth=style==='arc'?4:2;ctx.strokeStyle=friendly?'#a6e6d7':'#eab7df';
   ctx.beginPath();ctx.moveTo(x-backX*27,y-backY*27);ctx.lineTo(x-backX*11-backY*5,y-backY*11+backX*5);
   ctx.lineTo(x,y);ctx.stroke();circle(x,y,style==='arc'?4:3,'#eafdf4');
   pixel(x-backX*13-3,y-backY*13-3,3,3,'#b5e7d6');
  }else if(style==='rock'){
   const wob=Math.sin(frame*.32+q.owner*3)*2;
   pixel(x-11,y-9+wob,21,17,'#293c3d');pixel(x-9,y-11+wob,17,17,'#8c9a7c');
   pixel(x-7,y-9+wob,9,4,'#c4c5a1');pixel(x+3,y+wob,6,3,'#4f6760');
   pixel(x-backX*16-2,y-backY*16-2,5,5,'#84937a');
  }else if(style==='wave'){
   ctx.strokeStyle=friendly?'#c9d4a4':'#d4b0a4';ctx.lineWidth=5;
   ctx.beginPath();ctx.arc(x,y,10,Math.atan2(q.vy,q.vx)-1.1,Math.atan2(q.vy,q.vx)+1.1);ctx.stroke();
   pixel(x-backX*16-4,y-backY*16-4,6,6,'#9aa68c');
  }else if(style==='flame'){
   circle(x,y,8,'#ee8651');pixel(x-5,y-5,10,10,'#ffbb70');
   pixel(x-2,y-7,6,7,'#ffe4a2');
   for(let i=0;i<3;i++){const t=(frame*.19+i*.37)%1;pixel(x-backX*(12+t*16)+Math.sin(frame*.22+i)*4,y-backY*(12+t*16)+Math.cos(frame*.22+i)*4,3,3,i%2?'#c85c44':'#edae69')}
  }else{
   circle(x,y,q.r+2,friendly?'#e6a568':'#c47b78');circle(x,y,Math.max(3,q.r-1),'#ffe2a2');
   pixel(x-backX*12-2,y-backY*12-2,4,4,'#dda36e');
  }
 }
}
// The stage-presentation layer now owns every confirmed combat burst.
// Echoes remain world objects and preserve the player's actual PocketWorks avatar.
function drawEffects(s){
 for(const e of s.echoes){
  wizard(e.x,e.y,0,frame/60,e.owner!==myIndex(),Math.min(.48,e.life/4),0,0);
  ctx.strokeStyle='#b6e1cd66';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(e.x,e.y,21+Math.sin(frame*.12+e.x)*2,-Math.PI*.5,Math.PI*.55);ctx.stroke();
 }
}
function drawOverlay(s){
 if(s?.phase==='fight'&&s.remaining<10){
  const radius=ringRadius(s),warning=.65+Math.sin(frame*.19)*.15;
  ctx.strokeStyle='#df9972';ctx.globalAlpha=warning;ctx.lineWidth=4;ctx.setLineDash([8,5]);
  ctx.beginPath();ctx.arc(200,310,radius,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);ctx.lineWidth=1.5;ctx.strokeStyle='#f0ce9b';ctx.beginPath();ctx.arc(200,310,radius-4,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=1;
 }
for(let i=0;i<14;i++){const v=(frame*.2+i*71)%620,x=20+(i*71%360);pixel(x,(v+Math.sin(frame*.003+i)*3)%620,2,2,'#f3dca128')}}
function render(){
 if(mode==='menu'&&frame%3===0)drawHero($('hero-preview').getContext('2d'),appearance,frame/60,[],selectedMage);
 if(!bgCanvas)bgCanvas=background();
 combatPresentation.ingest(active,reducedMotion);
 combatPresentation.advance(1/60,reducedMotion);
 const offset=combatPresentation.offset(reducedMotion);
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#13201d';ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(offset.x,offset.y);
 ctx.drawImage(bgCanvas,0,0);
 drawCourtAtmosphere(ctx,frame/60,reducedMotion);
 if(active){
  combatPresentation.ground(ctx);
  drawConstructs(active);
  drawEffects(active);
  for(let i=0;i<2;i++){
   const a=active.actors[i],mine=i===myIndex();
   if(!displayXY[i])displayXY[i]={x:a.x,y:a.y};
   const p=displayXY[i],oldX=p.x,oldY=p.y;
   if(online?.active){p.x+=(a.x-p.x)*.34;p.y+=(a.y-p.y)*.34}else{p.x=a.x;p.y=a.y}
   const moving=Math.min(1,Math.hypot(p.x-oldX,p.y-oldY)*.48);
   wizard(p.x,p.y,a.face,frame/60,!mine,1,a.shield,a.flash,moving);
   if(a.markLife>0&&ELEMENTS[a.mark]){
    const color=ELEMENTS[a.mark].color;
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.globalAlpha=.55+.2*Math.sin(frame*.09);
    ctx.beginPath();ctx.arc(p.x,p.y-5,23+Math.sin(frame*.09)*2,-.95*Math.PI,.2*Math.PI);ctx.stroke();ctx.globalAlpha=1;
    pixel(p.x-3,p.y-37,6,5,color);pixel(p.x-1,p.y-34,2,3,'#fff3cf');
   }
  }
  drawShots(active);
  combatPresentation.foreground(ctx);
  if(mode==='fight'&&input.aim){
   ctx.strokeStyle='#eee1b1a0';ctx.lineWidth=1.5;const{x,y}=input.aim;
   ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.moveTo(x-15,y);ctx.lineTo(x-6,y);
   ctx.moveTo(x+6,y);ctx.lineTo(x+15,y);ctx.stroke();
  }
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
function handleEvents(){if(!active)return;let count=0;const played=new Set();for(const f of active.fx){if(f.id<=seen||count>=5||played.has(f.k))continue;sfx(f.k);played.add(f.k);count++}seen=active.serial}
function loop(now){const elapsed=Math.min(.13,(now-last)/1000||0);last=now;frame++;if(toastT>0){toastT-=elapsed;if(toastT<=0)$('toast').classList.remove('visible')}if(online?.active){if(active&&online.view?.phase==='fight'){online.sample(()=>mode==='fight'?playerInput():{x:0,y:0,aim:{x:active.actors[1-myIndex()].x,y:active.actors[1-myIndex()].y},attack:false,shield:false,dash:false},active.round,now);handleEvents()}if(frame%5===0)updateHud();acc=0}else if(mode==='fight'&&active){acc+=elapsed;let steps=0;while(acc>=STEP&&steps<8){tick(active,playerInput());acc-=STEP;steps++;if(active.phase!=='fight')break}handleEvents();if(frame%5===0)updateHud();if(frame%120===0)remember();if(active.phase!=='fight')transition()}else acc=0;render();requestAnimationFrame(loop)}
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
 if(mode==='menu')drawHero($('hero-preview').getContext('2d'),appearance,frame/60);
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
}
function roomInfo(roomId){
 $('net-room-info').hidden=!roomId;$('net-choice').hidden=!!roomId;
 $('net-copy-code').textContent=roomId?inviteCode(roomId):'--------';
 $('net-title').textContent=roomId?'Комната готова':'Играть вдвоём';
}
function onlineView(view){
 if(!online?.active||!view)return;
 void refreshRival(view);
 online.view=view;active=view.match||null;
 const stamp=[view.phase,active?.round??0,view.picked,view.ready].join(':');
 if(stamp===onlinePhase){if(view.phase==='lobby'){updateNetworkLobby(view);drawNetworkMageOptions()}return}
 onlinePhase=stamp;displayXY=[null,null];
 if(view.phase==='lobby'){applyRival();show('online-lobby');updateNetworkLobby(view);drawNetworkMageOptions();if(view.mages?.[view.me]!==selectedMage)online.chooseMage(selectedMage)}
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
 $('net-help').textContent=full?'Оба мага на месте. Создатель комнаты запускает дуэль.':'Пришли код другу. Оба игрока смогут участвовать со своих устройств.';
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

window.__perekosTest={get state(){return active},get mode(){return mode},get appearance(){return {source:appearance.source,accountId:appearance.accountId,preset:appearance.preset,mascot:appearance.mascot,colors:appearance.colors,hasArt:!!appearance.artCanvas}},get hasPendingAppearance(){return !!pendingAppearance},refreshAvatar:()=>refreshAppearance({force:true}),start:newMatch,step:()=>{if(active){tick(active,{attack:true});if(active.phase!=='fight')transition()}},pick:(id,slot=null)=>{if(active?.phase==='draft'){return finishPick(id,slot)}return false},build:()=>{$('bench-fight').click()},reorder:(from,to)=>{const result=reorderRunes(active,from,to);if(result)renderWorkbench();return result},save:saveBuild};
