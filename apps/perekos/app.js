import {W,H,STEP,WALLS,RUNES,makeMatch,validState,tick,chooseRune,has,stats} from './core.mjs';
import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {getPocketIdentity} from '../../shared/capabilities/identity.js';
installMobileRuntime();
const $=id=>document.getElementById(id),canvas=$('world'),ctx=canvas.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;
const storage='pocket-works:perekos:',prefsKey=storage+'prefs',saveKey=storage+'match';
const palette={clay:['#b56e5d','#d9b798'],moss:['#527e67','#b5c99c'],ink:['#55748a','#b2cdd6'],sun:['#c89a53','#f7df9f'],wave:['#457e93','#b3d7d3'],ember:['#a95440','#f1c191'],plum:['#825b83','#d4b5cb'],stone:['#797f73','#d9d7bd']};
let identityColor=palette.clay,identityName='Ты';
let sound=true,paused=false,mode='menu',active=null,last=performance.now(),acc=0,frame=0,quietTimer=0,audio=null,seen=0,quitPrompt=false,fxParticles=[];
const keys=new Set(),input={x:0,y:0,attack:false,shield:false,dash:false,aim:null},stick={pointer:null,x:0,y:0},touches=new Map();
function stored(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
const savedPrefs=stored(prefsKey);sound=savedPrefs?.sound!==false;
function remember(){put(prefsKey,{sound});if(active&&validState(active))put(saveKey,active)}
function forget(){try{localStorage.removeItem(saveKey)}catch{}}
const resume=stored(saveKey);
if(resume&&validState(resume))$('continue').hidden=false;
function audioContext(){if(!sound)return null;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio}catch{return null}}
function sfx(type){const ac=audioContext();if(!ac)return;const now=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();const notes={shoot:[450,160,.085,'triangle'],hit:[120,55,.12,'square'],shield:[330,650,.2,'sine'],spark:[740,220,.09,'square'],heal:[480,700,.14,'sine'],dash:[230,520,.09,'triangle'],overtime:[95,160,.3,'sawtooth']};const [a,b,len,wave]=notes[type]||notes.shoot;o.type=wave;o.frequency.setValueAtTime(a,now);o.frequency.exponentialRampToValueAtTime(Math.max(20,b),now+len);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(type==='hit'?.045:.028,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+len);o.connect(g).connect(ac.destination);o.start(now);o.stop(now+len+.02)}
function setAudio(){sound=!sound;remember();$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');if(sound)audioContext()}
$('menu-audio').addEventListener('click',setAudio);$('pause-audio').addEventListener('click',setAudio);
$('menu-audio').textContent=$('pause-audio').textContent='Звук: '+(sound?'вкл.':'выкл.');
function show(name){mode=name;for(const id of ['menu','draft','result','pause','confirm'])$(id).hidden=id!==name;$('controls').hidden=name!=='fight';$('hud').hidden=name==='menu';if(name==='fight'||name==='menu')paused=false;input.attack=false;input.shield=false;input.dash=false;seen=active?.serial||0;updateHud()}
function newMatch(){active=makeMatch((Date.now()>>>0)^Math.floor(Math.random()*0xffffffff));fxParticles=[];seen=0;audioContext();show('fight');toast('Двигайся и удерживай «Шар»');remember()}
$('primary-action').addEventListener('click',newMatch);$('again').addEventListener('click',newMatch);
$('continue').addEventListener('click',()=>{const s=stored(saveKey);if(s&&validState(s)){active=s;show(s.phase);if(s.phase==='draft')renderDraft();if(s.phase==='result')renderResult()}else newMatch()});
function pause(){if(mode!=='fight')return;paused=true;show('pause');remember()}
$('pause-btn').addEventListener('click',pause);
$('resume').addEventListener('click',()=>{show('fight');last=performance.now()});
$('quit').addEventListener('click',()=>{quitPrompt=true;$('pause').hidden=true;$('confirm').hidden=false;mode='confirm'});
$('quit-no').addEventListener('click',()=>{quitPrompt=false;show('pause')});
$('quit-yes').addEventListener('click',()=>{active=null;forget();$('continue').hidden=true;show('menu')});
let toastT=0;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');toastT=1.9}
function updateHud(){if(!active)return;const [a,b]=active.actors;const am=stats(a),bm=stats(b);$('my-hp').style.width=Math.max(0,100*a.hp/am.max)+'%';$('bot-hp').style.width=Math.max(0,100*b.hp/bm.max)+'%';$('my-hp-text').textContent=Math.ceil(a.hp)+' / '+am.max;$('bot-hp-text').textContent=Math.ceil(b.hp)+' / '+bm.max;$('clock').textContent=Math.ceil(active.remaining);$('clock').style.color=active.overtime?'#f3a27c':'#f7edce';$('round-number').textContent=active.overtime?'ДОП. ВРЕМЯ':'РАУНД '+active.round;$('score-me').textContent='● '.repeat(active.score[0])+'○ '.repeat(4-active.score[0]);$('score-bot').textContent='● '.repeat(active.score[1])+'○ '.repeat(4-active.score[1]);$('dash-cooldown').style.height=100*Math.min(1,a.dashReady/2.5)+'%';$('shield-cooldown').style.height=100*Math.min(1,a.shieldReady/5)+'%';$('attack-cooldown').style.height=100*Math.min(1,a.cast/stats(a).reload)+'%'}
function renderDraft(){if(!active)return;$('draft-score').textContent=active.score.join(' : ');$('draft-title').textContent=active.lastWinner===0?'Хороший раунд. Ещё руну.':'Проиграли раунд. Возьми руну.';const list=$('rune-cards');list.replaceChildren();for(const id of active.pick){const r=RUNES.find(x=>x.id===id);if(!r)continue;const button=document.createElement('button');button.className='rune-choice';button.type='button';const symbol={move:'↗',guard:'◈',attack:'✷'}[r.kind];const symbolSpan=document.createElement('span');symbolSpan.className='rune-icon';symbolSpan.textContent=symbol;const txt=document.createElement('span');const name=document.createElement('strong');name.textContent=r.name;const detail=document.createElement('small');detail.textContent=r.desc;txt.append(name,detail);button.append(symbolSpan,txt);button.addEventListener('click',()=>{if(chooseRune(active,id)){sfx('heal');remember();show('fight');toast(r.name)}});list.append(button)}$('loadout').replaceChildren();const title=document.createElement('span');title.textContent='УЖЕ ЕСТЬ: ';$('loadout').append(title);for(const id of active.actors[0].runes){const entry=RUNES.find(r=>r.id===id);if(!entry)continue;const b=document.createElement('b');b.textContent=entry.name;$('loadout').append(b)}}
function renderResult(){const won=active.champion===0;$('result-title').textContent=won?'Ты выиграл.':'Ты проиграл.';$('result-copy').textContent=won?'Сборка выдержала проверку. А может, просто повезло.':'В следующий раз собери что-нибудь похуже для врага.';$('result-score').textContent=active.score[0]+' : '+active.score[1];forget();$('continue').hidden=true}
function transition(){if(!active)return;if(active.phase==='draft'){show('draft');renderDraft();remember();sfx('shield')}else if(active.phase==='result'){show('result');renderResult();sfx('overtime')}}
document.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Escape'){if(mode==='fight')pause();else if(mode==='pause')$('resume').click();else if(mode==='confirm')$('quit-no').click()}if(mode!=='fight')return;if(['KeyQ','KeyE'].includes(e.code))input.shield=true;if(['ShiftLeft','ShiftRight','KeyF'].includes(e.code))input.dash=true;if(e.code==='Space')input.attack=true});
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
function playerInput(){let x=stick.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),y=stick.y+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const out={x,y,attack:input.attack||keys.has('Space'),shield:input.shield,dash:input.dash,aim:input.aim||{x:active.actors[1].x,y:active.actors[1].y}};input.shield=false;input.dash=false;return out}
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
function wizard(x,y,face,ticktime,enemy=false,alpha=1,shield=0,flash=0){const coat=enemy?'#b26258':identityColor[0],trim=enemy?'#ecc08f':identityColor[1],mid=enemy?'#7a393f':'#32473c';ctx.save();ctx.globalAlpha=alpha;const bob=Math.sin(ticktime*9+(enemy?3:0))*1.1;ctx.translate(Math.round(x),Math.round(y+bob));ctx.scale(enemy?-1:1,1);
ctx.fillStyle='#101c1eb0';ctx.beginPath();ctx.ellipse(0,12,16,6,0,0,Math.PI*2);ctx.fill();
pixel(-9,5,6,12,'#25322d');pixel(4,5,6,12,'#25322d');pixel(-9,13,5,3,trim);pixel(5,13,5,3,trim);
pixel(-12,-5,24,18,coat);pixel(-13,3,26,10,mid);pixel(-10,7,20,5,coat);pixel(-12,-4,5,10,trim);pixel(8,-4,5,10,trim);
pixel(-7,-16,14,15,'#d6b395');pixel(-5,-12,3,3,'#243a32');pixel(3,-12,3,3,'#243a32');pixel(-4,-5,8,2,'#b57d64');
pixel(-13,-18,26,5,trim);pixel(-8,-26,16,11,coat);pixel(-4,-33,10,9,coat);pixel(4,-29,5,7,coat);pixel(-6,-22,15,3,mid);pixel(-9,-17,19,2,'#efe0aa');
pixel(11,-1,4,10,'#c8ad81');pixel(14,-20,3,27,'#83694d');pixel(12,-23,7,7,trim);pixel(14,-27,4,5,'#fff0be');
if(Math.abs(face)>2)pixel(-5,-13,3,2,'#192a27');
if(enemy){pixel(-3,-25,7,3,'#f0d3bd');pixel(-9,5,5,4,'#ad4f43')}else if(has(active?.actors?.[0]||{runes:[]},'shield'))pixel(-13,-3,3,11,'#eddb9f');
if(flash>0)pixel(-15,-34,30,52,'#fff2bf8c');
if(shield>0){ctx.strokeStyle='#b6d9b4bb';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.beginPath();ctx.arc(0,-7,27,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);pixel(-20,-17,3,6,'#f7e3b0');pixel(20,0,3,6,'#f7e3b0')}
ctx.restore()}
function drawShots(s){for(const q of s.shots){const x=Math.round(q.x),y=Math.round(q.y);pixel(x-5,y-1,9,3,q.owner===0?'#dfa660':'#d7807c');circle(x,y,q.r+2,q.owner===0?'#ffc97999':'#df8d8099');pixel(x-3,y-3,6,6,'#ffecb9');pixel(x-1,y-5,3,2,'#fff4db');pixel(x-Math.sign(q.vx)*9,y-Math.sign(q.vy)*9,2,2,'#c4a46c')}}
function drawEffects(s){for(const e of s.echoes){wizard(e.x,e.y,0,frame/60,e.owner===1,Math.min(.5,e.life/4),0,0)}
for(const f of s.fx){const t=f.t/.38,r=Math.round(t*23)+3;if(f.k==='hit'){circle(f.x,f.y,Math.max(1,r),'#f5b36a30');for(let n=0;n<6;n++){const a=n*Math.PI/3+f.id;pixel(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,3,3,'#efc28c')}}else if(f.k==='shoot'){circle(f.x,f.y,8*(1-t),'#f9d39996')}else if(f.k==='shield'){ctx.strokeStyle='#c7edd0';ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y,14+27*t,0,Math.PI*2);ctx.stroke()}else if(f.k==='heal'){pixel(f.x-1,f.y-19-t*10,4,11,'#aff0b2');pixel(f.x-5,f.y-15-t*10,12,3,'#aff0b2')}else if(f.k==='dash'){pixel(f.x-15+t*8,f.y-10,24*(1-t),3,'#d6c3a3')}else if(f.k==='spark'){pixel(f.x-5+t*8,f.y-4,4,4,'#fbca87');pixel(f.x+6-t*7,f.y+5,3,3,'#f9ddab')}}}
function drawOverlay(s){if(s?.phase==='fight'&&s.overtime){ctx.fillStyle='#9c3c3044';ctx.fillRect(16,16,369,10);ctx.fillRect(16,594,369,9)}
for(let i=0;i<14;i++){const v=(frame*.2+i*71)%620,x=20+(i*71%360);pixel(x,(v+Math.sin(frame*.003+i)*3)%620,2,2,'#f3dca128')}}
function render(){if(!bgCanvas)bgCanvas=background();ctx.clearRect(0,0,W,H);ctx.drawImage(bgCanvas,0,0);
if(active){drawEffects(active);wizard(active.actors[0].x,active.actors[0].y,active.actors[0].face,frame/60,false,1,active.actors[0].shield,active.actors[0].flash);wizard(active.actors[1].x,active.actors[1].y,active.actors[1].face,frame/60,true,1,active.actors[1].shield,active.actors[1].flash);drawShots(active)}else{wizard(107,352,0,frame/60,false,1,12,0);wizard(297,252,Math.PI,frame/60,true,1,9,0);for(let j=0;j<6;j++){const x=180+Math.sin(frame/50+j*2)*35,y=270+j*19+Math.cos(frame/37+j)*14;circle(x,y,4,'#f1c880');pixel(x-1,y-1,3,3,'#fdf3ca')}}drawOverlay(active)}
function handleEvents(){if(!active)return;for(const f of active.fx){if(f.id>seen)sfx(f.k)}seen=active.serial}
function loop(now){const elapsed=Math.min(.13,(now-last)/1000||0);last=now;frame++;if(toastT>0){toastT-=elapsed;if(toastT<=0)$('toast').classList.remove('visible')}if(mode==='fight'&&active){acc+=elapsed;let steps=0;while(acc>=STEP&&steps<8){tick(active,playerInput());acc-=STEP;steps++;if(active.phase!=='fight')break}handleEvents();if(frame%5===0)updateHud();if(frame%120===0)remember();if(active.phase!=='fight')transition()}else acc=0;render();requestAnimationFrame(loop)}
requestAnimationFrame(loop);
getPocketIdentity().then(profile=>{if(!profile?.complete)return;identityName=profile.nickname||'Ты';identityColor=palette[profile.avatar]||palette.clay;$('identity').textContent=identityName;$('my-name').textContent=identityName.slice(0,13).toUpperCase()}).catch(()=>{});
window.__perekosTest={get state(){return active},get mode(){return mode},start:newMatch,step:()=>{if(active)tick(active,{attack:true})},pick:id=>{if(active?.phase==='draft')return chooseRune(active,id);return false}};
