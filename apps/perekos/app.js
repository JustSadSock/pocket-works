import {W,H,STEP,WALLS,RUNES,makeMatch,validState,tick,chooseRune,beginRound,reorderRunes,startRound,has,stats} from './core.mjs';
import {rune,description,compile,TYPES,legalRunes} from './runes.mjs';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
import {DEFAULT_APPEARANCE,normalizeAppearance,decodeAppearance} from './avatar-profile.mjs';
import {drawMage,drawPortrait,drawHero} from './mage-art.mjs';
import {OnlineDuel,inviteCode,incomingCode} from './net-client.mjs';
installMobileRuntime();
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;
const storage='pocket-works:perekos:',prefsKey=storage+'prefs',saveKey=storage+'match',booksKey=storage+'grimoire';
let appearance={...DEFAULT_APPEARANCE},pendingAppearance=null,profileRequest=0,lastProfileFetch=0,avatarInFlight=null;
let online=null,onlinePreviewRunes=null,onlinePhase='',displayXY=[null,null];
let sound=true,paused=false,mode='menu',active=null,last=performance.now(),acc=0,frame=0,quietTimer=0,audio=null,seen=0,quitPrompt=false,fxParticles=[],pendingRune=null,bookToDelete=null;
const keys=new Set(),input={x:0,y:0,attack:false,shield:false,dash:false,aim:null},stick={pointer:null,x:0,y:0},touches=new Map();
function stored(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const savedPrefs=stored(prefsKey);sound=savedPrefs?.sound!==false;
function remember(){put(prefsKey,{sound});if(!online?.active&&active&&validState(active))put(saveKey,active)}
function forget(){try{localStorage.removeItem(saveKey)}catch{}}
const resume=stored(saveKey);
if(resume&&validState(resume))$('continue').hidden=false;
function audioContext(){if(!sound)return null;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio}catch{return null}}
function sfx(type){const ac=audioContext();if(!ac)return;const now=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();const notes={overload:[96,440,.33,'sawtooth'],mine:[380,85,.22,'triangle'],shoot:[450,160,.085,'triangle'],hit:[120,55,.12,'square'],shield:[330,650,.2,'sine'],spark:[740,220,.09,'square'],heal:[480,700,.14,'sine'],dash:[230,520,.09,'triangle'],overtime:[95,160,.3,'sawtooth']};const [a,b,len,wave]=notes[type]||notes.shoot;o.type=wave;o.frequency.setValueAtTime(a,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,b),now+len);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(type==='hit'?.045:.028,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+len);o.connect(g).connect(ac.destination);o.start(now);o.stop(now+len+.02)}
function setAudio(){sound=!sound;remember();$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');if(sound)audioContext()}
$('menu-audio').addEventListener('click',setAudio);$('pause-audio').addEventListener('click',setAudio);
$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');
function show(name){mode=name;for(const id of ['menu','draft','build','books','book-delete','result','pause','confirm','online-lobby','net-wait'])$(id).hidden=id!==name;$('controls').hidden=name!=='fight';$('hud').hidden=name==='menu'||name==='online-lobby';if(name==='fight'||name==='menu')paused=false;input.attack=false;input.shield=false;input.dash=false;seen=active?.serial||0;updateHud()}
function newMatch(){if(online?.active)online.leave();onlinePhase='';applyPendingAppearance();active=makeMatch((Date.now()>>>0)^Math.floor(Math.random()*0xffffffff));fxParticles=[];seen=0;audioContext();show('fight');toast('Двигайся и удерживай «Шар»');remember()}
$('primary-action').addEventListener('click',newMatch);$('again').addEventListener('click',newMatch);
$('continue').addEventListener('click',()=>{const s=stored(saveKey);if(s&&validState(s)){active=s;if(s.phase!=='fight')applyPendingAppearance();show(s.phase);if(s.phase==='draft')renderDraft();if(s.phase==='build')renderWorkbench();if(s.phase==='result')renderResult()}else newMatch()});
function pause(){if(mode!=='fight')return;paused=true;show('pause');$('pause-title').textContent=online?.active?'Сетевой матч':'Передышка';$('pause-online-note').hidden=!online?.active;remember()}
$('pause-btn').addEventListener('click',pause);
$('resume').addEventListener('click',()=>{show('fight');last=performance.now()});
$('quit').addEventListener('click',()=>{quitPrompt=true;$('pause').hidden=true;$('confirm').hidden=false;mode='confirm'});
$('quit-no').addEventListener('click',()=>{quitPrompt=false;show('pause')});
$('quit-yes').addEventListener('click',()=>{if(online?.active)online.leave();onlinePhase='';active=null;forget();$('continue').hidden=true;show('menu')});
let toastT=0;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');toastT=1.9}
function myIndex(){return online?.active?online.me:0}
function myActor(){return active?.actors?.[myIndex()]}
function updateHud(){if(!active)return;const side=myIndex(),a=active.actors[side],b=active.actors[1-side];const am=stats(a),bm=stats(b);$('my-hp').style.width=Math.max(0,100*a.hp/am.max)+'%';$('bot-hp').style.width=Math.max(0,100*b.hp/bm.max)+'%';$('my-hp-text').textContent=Math.ceil(a.hp)+' / '+am.max;$('bot-hp-text').textContent=Math.ceil(b.hp)+' / '+bm.max;$('clock').textContent=Math.ceil(active.remaining);$('clock').style.color=active.overtime?'#f3a27c':'#f7edce';$('round-number').textContent=active.overtime?'ДОП. ВРЕМЯ':'РАУНД '+active.round;$('score-me').textContent='● '.repeat(active.score[side])+'○ '.repeat(4-active.score[side]);$('score-bot').textContent='● '.repeat(active.score[1-side])+'○ '.repeat(4-active.score[1-side]);$('heat-fill').style.width=Math.round(a.heat)+'%';$('heat-value').textContent=Math.round(a.heat)+'%';
$('heat-fill').classList.toggle('danger',a.heat>=78);
$('dash-cooldown').style.height=100*Math.min(1,a.dashReady/2.5)+'%';$('shield-cooldown').style.height=100*Math.min(1,a.shieldReady/5)+'%';$('attack-cooldown').style.height=100*Math.min(1,a.cast/stats(a).reload)+'%'}
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
 $('draft-title').textContent=active.lastWinner===myIndex()?'Хороший раунд. Возьми руну.':'Проиграли раунд. Возьми руну.';
 $('rune-cards').hidden=false;$('replace-zone').hidden=true;pendingRune=null;
 const list=$('rune-cards');list.replaceChildren();
 for(const id of (online?.active?online.view?.offers||[]:active.pick)){
  const r=rune(id);if(!r)continue;const btn=document.createElement('button');btn.className='rune-choice';btn.type='button';btn.append(drawRuneNode(r));
  btn.addEventListener('click',()=>{if(myActor().runes.length>=5)renderReplacement(id);else finishPick(id)});list.append(btn);
 }
 drawOwned();
}
function reorderOnBench(from,to){if(online?.active){const list=onlinePreviewRunes;if(!Array.isArray(list)||from<0||to<0||from>=list.length||to>=list.length)return false;const [id]=list.splice(from,1);list.splice(to,0,id);return true}return reorderRunes(active,from,to)}
function renderWorkbench(){
 if(!active)return;const slots=online?.active?(onlinePreviewRunes||[...myActor().runes]):myActor().runes;
 const preview=$('bench-mage'),mini=preview.getContext('2d');mini.clearRect(0,0,64,80);
 drawMage(mini,appearance,{x:32,y:57,scale:1.25,time:0,runes:slots});
 $('bench-count').textContent=slots.length+' / 5';const rack=$('bench-slots');rack.replaceChildren();
 const info=description(slots);
 slots.forEach((id,i)=>{
  const r=rune(id);if(!r)return;
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
  row.append(drag,moves);rack.append(row);
 });
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
$('bench-fight').addEventListener('click',()=>{if(online?.active){if(online.ready(onlinePreviewRunes||myActor().runes)){show('net-wait');toast('Ждём второго мага')}return}if(active&&beginRound(active)){applyPendingAppearance();sfx('shield');remember();show('fight');toast('Сборка готова')}});
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
function canvasPoint(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(W,(e.clientX-r.left)/r.width*W)),y:Math.max(0,Math.min(H,(e.clientY-r.top)/r.height*H))}}
canvas.addEventListener('pointermove',e=>{if(mode==='fight'&&e.pointerType==='mouse')input.aim=canvasPoint(e)});
canvas.addEventListener('pointerdown',e=>{if(mode!=='fight')return;input.aim=canvasPoint(e);if(e.pointerType==='mouse')input.attack=true});
window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')input.attack=false});
function playerInput(){let x=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=stick.y+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const out={x,y,attack:input.attack||keys.has('Space'),shield:input.shield,dash:input.dash,aim:input.aim||{x:active.actors[1-myIndex()].x,y:active.actors[1-myIndex()].y}};input.shield=false;input.dash=false;return out}
let bgCanvas;
function rng(seed){let a=seed>>>0;return()=>((a=Math.imul(a,1664525)+1013904223>>>0)/4294967296)}
function background(){const b=document.createElement('canvas');b.width=W;b.height=H;const p=b.getContext('2d');p.imageSmoothingEnabled=false;
p.fillStyle='#192b29';p.fillRect(0,0,W,H);
p.fillStyle='#32483c';p.fillRect(16,16,368,588);
p.fillStyle='#394b3c';p.fillRect(22,22,356,576);
const r=rng(0x711129);
for(let j=0;j<20;j++)for(let i=0;i<13;i++){const x=23+i*27+(j%2)*5,y=24+j*29;const v=r();p.fillStyle=v<.15?'#42533f':v<.65?'#394b3b':'#3d4d40';p.fillRect(x,y,26,27);p.fillStyle='#253c34';p.fillRect(x,y+26,26,2);p.fillRect(x+25,y,2,27);if(v<.28){p.fillStyle='#55634a';p.fillRect(x+3,y+5,8,2);p.fillRect(x+8,y+6,2,5)}if(v>.88){p.fillStyle='#566049';p.fillRect(x+18,y+10,3,2);p.fillRect(x+15,y+12,3,2)}}
for(let i=0;i<420;i++){const x=26+Math.floor(r()*347),y=24+Math.floor(r()*573);p.fillStyle=r()<.6?'#5d6848':'#2c433b';p.fillRect(x,y,1+r()*2,1+r()*2)}
for(let i=0;i<110;i++){const x=22+Math.floor(r()*358),y=22+Math.floor(r()*576);if(r()<.7){p.fillStyle='#61754e';p.fillRect(x,y,3,2);p.fillRect(x+3,y+3,2,2);p.fillRect(x-1,y+4,2,3)}}
p.fillStyle='#142522';p.fillRect(0,0,400,15);p.fillRect(0,606,400,14);p.fillRect(0,0,16,620);p.fillRect(384,0,16,620);p.fillStyle='#7c7860';for(let i=16;i<386;i+=28){p.fillRect(i,11,26,5);p.fillRect(i,601,26,5)}for(let i=16;i<607;i+=28){p.fillRect(11,i,5,26);p.fillRect(384,i,5,26)}p.fillStyle='#b29b69';p.fillRect(16,15,367,2);p.fillRect(16,602,367,2);p.fillRect(15,16,2,588);p.fillRect(383,16,2,588);
for(const w of WALLS){p.fillStyle='#132522';p.fillRect(w.x+6,w.y+8,w.w+2,w.h+4);p.fillStyle='#607463';p.fillRect(w.x-1,w.y+2,w.w+2,w.h);p.fillStyle='#344b43';p.fillRect(w.x+4,w.y+9,w.w-8,w.h-9);p.fillStyle='#89927a';p.fillRect(w.x-3,w.y-5,w.w+6,14);p.fillStyle='#6f806b';p.fillRect(w.x,w.y-2,w.w,7);p.fillStyle='#304a42';p.fillRect(w.x+12,w.y+12,4,w.h-14);p.fillRect(w.x+w.w-19,w.y+18,4,w.h-19);p.fillStyle='#a5a889';p.fillRect(w.x+8,w.y-3,7,3);p.fillRect(w.x+w.w-17,w.y+1,8,3);p.fillStyle='#618363';for(let i=0;i<12;i++){const x=w.x+r()*w.w,y=w.y+r()*5;p.fillRect(x,y,3,2)}}
for(const [x,y] of [[54,63],[348,70],[62,558],[344,544]]){p.fillStyle='#1e3030';p.fillRect(x-11,y-5,22,17);p.fillStyle='#5b5c46';p.fillRect(x-8,y-8,16,15);p.fillStyle='#a18958';p.fillRect(x-3,y-14,6,10);p.fillStyle='#f3bc6f';p.fillRect(x-2,y-20,4,10);p.fillStyle='#ffdf97';p.fillRect(x-1,y-18,2,5)}
return b}
function pixel(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function line(x,y,a,b,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke()}
function wizard(x,y,face,ticktime,enemy=false,alpha=1,shield=0,flash=0){
 const look=enemy?DEFAULT_APPEARANCE:appearance;
 const runes=active?.actors?.[enemy?1-myIndex():myIndex()]?.runes||[];
 drawMage(ctx,look,{x,y,face,time:ticktime,enemy,alpha,shield,flash,runes});
}
function drawConstructs(s){
 for(const w of s.barriers){circle(w.x+3,w.y+6,w.r,'#12251f9e');circle(w.x,w.y,w.r,'#60745d');circle(w.x-3,w.y-5,Math.max(6,w.r-8),'#82917a');pixel(w.x-w.r*.35,w.y-3,5,3,'#a6ad89')}
 for(const m of s.mines){circle(m.x,m.y+3,9,'#111f1b90');circle(m.x,m.y,7,'#ae6a55');pixel(m.x-3,m.y-4,6,4,'#ffdf9f');pixel(m.x-1,m.y-8,2,4,'#f3a66e')}
}
function drawShots(s){for(const q of s.shots){const x=Math.round(q.x),y=Math.round(q.y);pixel(x-5,y-1,9,3,q.owner===0?'#dfa660':'#d7807c');circle(x,y,q.r+2,q.owner===0?'#ffc97999':'#df8d8099');pixel(x-3,y-3,6,6,'#ffecb9');pixel(x-1,y-5,3,2,'#fff4db');pixel(x-Math.sign(q.vx)*9,y-Math.sign(q.vy)*9,2,2,'#c4a46c')}}
function drawEffects(s){for(const e of s.echoes){wizard(e.x,e.y,0,frame/60,e.owner===1,Math.min(.5,e.life/4),0,0)}
for(const f of s.fx){const t=f.t/.38,r=Math.round(t*23)+3;if(f.k==='hit'){circle(f.x,f.y,Math.max(1,r),'#f5b36a30');for(let n=0;n<6;n++){const a=n*Math.PI/3+f.id;pixel(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,3,3,'#efc28c')}}else if(f.k==='shoot'){circle(f.x,f.y,8*(1-t),'#f9d39996')}else if(f.k==='shield'){ctx.strokeStyle='#c7edd0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y,14+27*t,0,Math.PI*2);ctx.stroke()}else if(f.k==='heal'){pixel(f.x-1,f.y-19-t*10,4,11,'#aff0b2');pixel(f.x-5,f.y-15-t*10,12,3,'#aff0b2')}else if(f.k==='dash'){pixel(f.x-15+t*8,f.y-10,24*(1-t),3,'#d6c3a3')}else if(f.k==='overload'){ctx.strokeStyle='#f6b16f';ctx.lineWidth=4;ctx.beginPath();ctx.arc(f.x,f.y,10+62*t,0,Math.PI*2);ctx.stroke()}else if(f.k==='mine'){circle(f.x,f.y,16*(1-t),'#f2b476ab')}else if(f.k==='spark'){pixel(f.x-5+t*8,f.y-4,4,4,'#fbca87');pixel(f.x+6-t*7,f.y+5,3,3,'#f9ddab')}}}
function drawOverlay(s){if(s?.phase==='fight'&&s.overtime){ctx.fillStyle='#9c3c3044';ctx.fillRect(16,16,369,10);ctx.fillRect(16,594,369,9)}
for(let i=0;i<14;i++){const v=(frame*.2+i*71)%620,x=20+(i*71%360);pixel(x,(v+Math.sin(frame*.003+i)*3)%620,2,2,'#f3dca128')}}
function render(){if(mode==='menu'&&frame%3===0)drawHero($('hero-preview').getContext('2d'),appearance,frame/60);if(!bgCanvas)bgCanvas=background();ctx.clearRect(0,0,W,H);ctx.drawImage(bgCanvas,0,0);
if(active){drawConstructs(active);drawEffects(active);for(let i=0;i<2;i++){const a=active.actors[i],mine=i===myIndex();if(!displayXY[i])displayXY[i]={x:a.x,y:a.y};const p=displayXY[i];if(online?.active){p.x+=(a.x-p.x)*.34;p.y+=(a.y-p.y)*.34}else{p.x=a.x;p.y=a.y}wizard(p.x,p.y,a.face,frame/60,!mine,1,a.shield,a.flash)}drawShots(active)}else{wizard(107,352,0,frame/60,false,1,12,0);wizard(297,252,Math.PI,frame/60,true,1,9,0);for(let j=0;j<6;j++){const x=180+Math.sin(frame/50+j*2)*35,y=270+j*19+Math.cos(frame/37+j)*14;circle(x,y,4,'#f1c880');pixel(x-1,y-1,3,3,'#fdf3ca')}}drawOverlay(active)}
function handleEvents(){if(!active)return;let count=0;const played=new Set();for(const f of active.fx){if(f.id<=seen||count>=5||played.has(f.k))continue;sfx(f.k);played.add(f.k);count++}seen=active.serial}
function loop(now){const elapsed=Math.min(.13,(now-last)/1000||0);last=now;frame++;if(toastT>0){toastT-=elapsed;if(toastT<=0)$('toast').classList.remove('visible')}if(online?.active){if(active&&online.view?.phase==='fight'){const ctl=mode==='fight'?playerInput():{x:0,y:0,aim:{x:active.actors[1-myIndex()].x,y:active.actors[1-myIndex()].y},attack:false,shield:false,dash:false};online.sample(ctl,active.round,now)}if(frame%5===0)updateHud();acc=0}else if(mode==='fight'&&active){acc+=elapsed;let steps=0;while(acc>=STEP&&steps<8){tick(active,playerInput());acc-=STEP;steps++;if(active.phase!=='fight')break}handleEvents();if(frame%5===0)updateHud();if(frame%120===0)remember();if(active.phase!=='fight')transition()}else acc=0;render();requestAnimationFrame(loop)}
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
drawHero($('hero-preview').getContext('2d'),appearance,0);
drawPortrait($('menu-portrait').getContext('2d'),appearance,42);
drawPortrait($('my-portrait').getContext('2d'),appearance,40);
drawPortrait($('result-portrait').getContext('2d'),appearance,56);
void refreshAppearance({force:true});

window.__perekosTest={get state(){return active},get mode(){return mode},get appearance(){return {source:appearance.source,accountId:appearance.accountId,preset:appearance.preset,mascot:appearance.mascot,colors:appearance.colors,hasArt:!!appearance.artCanvas}},get hasPendingAppearance(){return !!pendingAppearance},refreshAvatar:()=>refreshAppearance({force:true}),start:newMatch,step:()=>{if(active){tick(active,{attack:true});if(active.phase!=='fight')transition()}},pick:(id,slot=null)=>{if(active?.phase==='draft'){return finishPick(id,slot)}return false},build:()=>{$('bench-fight').click()},reorder:(from,to)=>{const result=reorderRunes(active,from,to);if(result)renderWorkbench();return result},save:saveBuild};
