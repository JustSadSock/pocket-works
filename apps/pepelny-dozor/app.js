import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
installMobileRuntime();
createWorkshopMode({
 appName:'ПЕПЕЛЬНЫЙ ДОЗОР',version:'1.0.1',
 cachePrefix: 'pepelny-dozor-',storageNamespace: 'pocket-works:pepelny-dozor'
});
(() => {
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('world'),stage=$('stage'),ctx=canvas.getContext('2d',{alpha:false});
const panel=$('panel'),primary=$('primary'),secondary=$('secondary'),choices=$('choices');
const bell=$('bell'),sound=$('sound'),pause=$('pause'),toastEl=$('toast');
const KEY='pocket-works:pepelny-dozor',TOTAL_WAVES=5,TAU=Math.PI*2;
const spriteIDs={lamp:0,hollow:2,hound:4,warden:6,moth:8,abbot:10};
const enemyStats={
 hollow:{hp:31,speed:23,harm:8,size:32,score:1},
 hound:{hp:23,speed:43,harm:11,size:32,score:2},
 warden:{hp:95,speed:15,harm:17,size:39,score:3},
 moth:{hp:19,speed:36,harm:7,size:28,score:2},
 abbot:{hp:340,speed:14,harm:30,size:57,score:12}
};
const upgrades=[
 {id:'wide',name:'Раскрыть створки',desc:'Луч становится шире на 14°.',apply:()=>buff.width+=14},
 {id:'reach',name:'Длинный огонь',desc:'Дальность света +24%.',apply:()=>buff.range*=1.24},
 {id:'burn',name:'Живой уголь',desc:'Свет наносит на 30% больше урона.',apply:()=>buff.damage*=1.3},
 {id:'bell',name:'Медный колокол',desc:'Импульс откатывается на 22% быстрее.',apply:()=>buff.bellCd=Math.max(4.3,buff.bellCd*.78)},
 {id:'heal',name:'Священная зола',desc:'Восстановить 27 прочности.',apply:()=>health=Math.min(100,health+27)},
 {id:'pulse',name:'Раскалённый язык',desc:'Колокол дополнительно сжигает +14.',apply:()=>buff.pulse+=14},
 {id:'slow',name:'Тяжесть пепла',desc:'Освещённые тени движутся медленнее.',apply:()=>buff.slow=Math.min(.68,buff.slow+.13)}
];
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rnd=x=>{const v=Math.sin(x*127.1+32.77)*43758.5453;return v-Math.floor(v)};
const roman=['I','II','III','IV','V'];
let W=390,H=660,dpr=1,phase='menu',prevPhase='play',frameTime=0,last=0,anim=0;
let atlas=null,ready=false,loadFailed=false,save={},bestWave=0,wins=0,totalKills=0;
let health=100,wave=1,kills=0,spawned=0,downed=0,waveGoal=0,spawnClock=0,waveWait=0,elapsed=0;
let aim=-Math.PI/2,aimPointer=false,bellRemaining=0,ring=0,shake=0,flash=0,damageFlash=0,selected=[];
let enemies=[],particles=[],buff={},toastLeft=0,initializedAudio=false,audio=null,soundOn=true;
const center=()=>({x:195,y:H*.515});
const freshBuff=()=>({width:46,range:1,damage:1,bellCd:11,pulse:14,slow:0});
function read(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'{}'); if(s&&typeof s==='object')save=s}catch{save={}}
 bestWave=Number.isFinite(save.bestWave)?clamp(save.bestWave,0,TOTAL_WAVES):0;
 wins=Number.isFinite(save.wins)?clamp(save.wins,0,999999):0;
 totalKills=Number.isFinite(save.totalKills)?clamp(save.totalKills,0,999999):0;
 soundOn=save.sound!==false;
}
function persist(clearRun=false){
 const run=clearRun?null:(phase==='play'||phase==='paused'||phase==='upgrade')?
 {wave,health,kills,buff:{...buff}}:(phase==='menu'?save.run||null:null);
 const next={bestWave,wins,totalKills,sound:soundOn,run};save=next;
 try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
}
function setAudio(){sound.textContent=soundOn?'♪':'×';sound.setAttribute('aria-label',soundOn?'Выключить звук':'Включить звук')}
function tone(f=440,len=.15,type='sine',vol=.08,slide=1){
 if(!soundOn)return;
 try{
 if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)()}
 if(audio.state==='suspended')audio.resume().catch(()=>{});
 const start=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();
 o.type=type;o.frequency.setValueAtTime(f,start);o.frequency.exponentialRampToValueAtTime(Math.max(55,f*slide),start+len);
 g.gain.setValueAtTime(.001,start);g.gain.exponentialRampToValueAtTime(Math.max(.002,vol),start+.015);
 g.gain.exponentialRampToValueAtTime(.001,start+len);
 o.connect(g);g.connect(audio.destination);o.start(start);o.stop(start+len+.02);
 }catch{}
}
function chime(){tone(290,.48,'triangle',.115,.51);tone(438,.75,'sine',.05,.72);tone(590,.4,'sine',.03,.8)}
function announce(text){toastEl.textContent=text;toastEl.classList.add('visible');toastLeft=1.35}
function size(){
 const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;
 dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
 W=390;H=390*r.height/r.width;
}
window.addEventListener('resize',size,{passive:true});size();
// Art Forge sources live outside the published web root. The exported PNG
// atlas under assets/ is the canonical runtime texture and the offline asset.
function loadSpriteAtlas(){
 return new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>{
   if(image.naturalWidth!==384||image.naturalHeight!==32){
    reject(new Error('Wrong sprite atlas dimensions: '+image.naturalWidth+'×'+image.naturalHeight));return;
   }
   resolve(image);
  };
  image.onerror=()=>reject(new Error('Cannot load published atlas: assets/creatures.png'));
  image.src='./assets/creatures.png';
 });
}
let artAttempt=0;
async function art(){
 const attempt=++artAttempt;
 ready=false;loadFailed=false;primary.disabled=true;
 $('panelKicker').textContent='ПОДГОТОВКА АББАТСТВА';
 $('panelTitle').textContent='ЗАЖИГАЕМ ОГОНЬ';
 $('panelText').textContent='Загружаем игровые спрайты…';
 try{
  const image=await loadSpriteAtlas();
  if(attempt!==artAttempt)return;
  atlas=image;ready=true;loadFailed=false;showMenu();
 }catch(error){
  if(attempt!==artAttempt)return;
  loadFailed=true;
  console.error('Пепельный дозор: ошибка графики',error);
  showPanel('ОШИБКА ЗАГРУЗКИ','ОГОНЬ НЕ ЗАЖЁГСЯ',
   'Готовые игровые спрайты недоступны. Проверь соединение или повтори загрузку.',
   'ПОВТОРИТЬ',()=>art());
 }
}
function showPanel(kicker,title,text,button,action){
 panel.hidden=false;$('panelKicker').textContent=kicker;$('panelTitle').textContent=title;$('panelText').textContent=text;
 choices.hidden=true;choices.innerHTML='';primary.hidden=false;primary.disabled=false;primary.textContent=button;primary.onclick=action;
 secondary.hidden=true;primary.focus({preventScroll:true});
}
function showMenu(){
 phase='menu';pause.disabled=true;bell.disabled=true;$('statusLabel').textContent='ОЖИДАНИЕ';
 const hasRun=save.run&&typeof save.run==='object'&&save.run.wave>=1&&save.run.wave<=TOTAL_WAVES;
 showPanel('ПОСЛЕДНИЙ ОГОНЬ','ПЕПЕЛЬНЫЙ ДОЗОР','Направляй луч пальцем. Свет сжигает тени. Колокол отбрасывает врагов. Продержись пять волн.',hasRun?'ПРОДОЛЖИТЬ ДОЗОР':'ЗАЖЕЧЬ МАЯК',()=>{
 if(hasRun)restore(save.run);else startRun();
 });
 if(hasRun){secondary.hidden=false;secondary.textContent='НАЧАТЬ ЗАНОВО';secondary.onclick=()=>{if(confirm('Начать новый дозор? Сохранённая попытка будет заменена.'))startRun()}}
 $('personalBest').textContent=(bestWave?'ЛУЧШАЯ ВОЛНА '+bestWave+'/5 · ':'')+'ПРОЙДЕНО '+wins;
}
function startRun(){
 buff=freshBuff();health=100;kills=0;wave=1;aim=-Math.PI/2;bellRemaining=0;enemies=[];particles=[];persist(true);startWave();
}
function restore(run){
 buff={...freshBuff()};
 for(const key of Object.keys(buff)){const v=run.buff?.[key];if(typeof v==='number'&&Number.isFinite(v))buff[key]=clamp(v,0.1,500)}
 health=clamp(Number(run.health)||100,1,100);kills=clamp(Number(run.kills)||0,0,999999);wave=clamp(Math.floor(run.wave),1,5);bellRemaining=0;enemies=[];particles=[];startWave();
}
function startWave(){
 spawned=0;downed=0;waveWait=0;elapsed=0;spawnClock=1.6;ring=0;enemies=[];waveGoal=6+wave*3+(wave===5?3:0);
 phase='play';panel.hidden=true;pause.disabled=false;bell.disabled=false;
 $('waveLabel').textContent=String(wave).padStart(2,'0')+' / 05';
 $('waveBottom').textContent=roman[wave-1];$('statusLabel').textContent='НОЧНАЯ ВОЛНА';
 announce('ВОЛНА '+roman[wave-1]);tone(220,.3,'triangle',.06,1.6);persist();
}
function spawn(){
 const i=spawned++,seed=i*29+wave*89+Math.round(elapsed*5);
 let type='hollow';const choice=rnd(seed);
 if(wave>=2&&choice>.61)type='hound';
 if(wave>=3&&choice>.81)type='warden';
 if(wave>=4&&choice>.46&&choice<.67)type='moth';
 if(wave===5&&i===waveGoal-1)type='abbot';
 const a=rnd(seed+4)*TAU,r=210+(rnd(seed+8)*35),c=center(),s=enemyStats[type];
 enemies.push({type,x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r,hp:s.hp,max:s.hp,wiggle:rnd(seed+12)*TAU,lit:false,flash:0,knock:0,id:seed});
}
function sparks(x,y,color,count=6,speed=62){
 if(particles.length>180)particles.splice(0,40);
 for(let i=0;i<count;i++){const a=rnd(frameTime*78+i*7+x)*TAU,v=speed*(.35+rnd(i*51+y));particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.4+rnd(i*43+x)*.4,max:.8,color,size:1.5+rnd(i*23)*2})}
}
function bellAction(){
 if(phase!=='play'||bellRemaining>0)return;
 bellRemaining=buff.bellCd;ring=.52;shake=3;chime();
 const c=center();for(const e of enemies){const d=Math.hypot(e.x-c.x,e.y-c.y);if(d<174){e.hp-=buff.pulse;e.knock=95;e.flash=.24;sparks(e.x,e.y,'#f5ce85',7)}}
 announce('ЗВОН');if(navigator.vibrate)navigator.vibrate(35);
}
function finishWave(){
 if(wave===TOTAL_WAVES){phase='win';wins++;bestWave=TOTAL_WAVES;totalKills+=kills;persist(true);
 showPanel('РАССВЕТ · ОБОРОНА УДАЛАСЬ','СВЕТ ОСТАЛСЯ','Аббатство пережило последнюю ночь. Изгнано теней: '+kills+'.','НОВЫЙ ДОЗОР',startRun);tone(392,.6,'triangle',.12,1.5);secondary.hidden=false;secondary.textContent='К ВЫБОРУ';secondary.onclick=showMenu;return}
 phase='upgrade';health=Math.min(100,health+8);bestWave=Math.max(bestWave,wave);const pool=[...upgrades].sort((a,b)=>rnd(a.id.length*wave+wave*13)-rnd(b.id.length*wave+wave*7));
 selected=pool.slice(0,3);panel.hidden=false;choices.hidden=false;choices.innerHTML='';
 $('panelKicker').textContent='ПЕРЕДЫШКА · '+roman[wave];$('panelTitle').textContent='УКРЕПИТЬ ОГОНЬ';$('panelText').textContent='Выбери одно улучшение перед следующей волной.';
 for(const up of selected){const btn=document.createElement('button');btn.className='choice';btn.type='button';const b=document.createElement('b'),span=document.createElement('span');b.textContent=up.name;span.textContent=up.desc;btn.append(b,span);
 btn.addEventListener('click',()=>{up.apply();wave++;tone(540,.26,'sine',.08,.7);startWave()});choices.append(btn)}
 primary.hidden=true;secondary.hidden=true;persist();
}
function defeat(){
 phase='lost';bestWave=Math.max(bestWave,wave);totalKills+=kills;persist(true);pause.disabled=true;bell.disabled=true;
 showPanel('МАЯК ПОГАС','ТЬМА ВЗЯЛА СВОЁ','Ты удержал '+wave+'-ю волну и изгнал '+kills+' теней. Измени направление луча раньше, чтобы не подпускать быстрых тварей.','ЕЩЁ ОДНА НОЧЬ',startRun);
 secondary.hidden=false;secondary.textContent='К ВЫБОРУ';secondary.onclick=showMenu;tone(140,.75,'sawtooth',.085,.42);
}
function update(dt){
 frameTime+=dt;if(toastLeft>0){toastLeft-=dt;if(toastLeft<=0)toastEl.classList.remove('visible')}
 ring=Math.max(0,ring-dt);shake=Math.max(0,shake-dt*12);flash=Math.max(0,flash-dt);damageFlash=Math.max(0,damageFlash-dt);
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.06,dt);p.vy*=Math.pow(.06,dt);p.life-=dt;if(p.life<=0)particles.splice(i,1)}
 if(phase!=='play')return;
 elapsed+=dt;bellRemaining=Math.max(0,bellRemaining-dt);
 if(spawned<waveGoal){spawnClock-=dt;if(spawnClock<=0){spawn();spawnClock=Math.max(.45,1.12-wave*.095)}}
 const c=center(),half=buff.width*Math.PI/360,range=202*buff.range;
 for(let i=enemies.length-1;i>=0;i--){
 const e=enemies[i],s=enemyStats[e.type],dx=c.x-e.x,dy=c.y-e.y,dist=Math.hypot(dx,dy)||1;
 const diff=Math.atan2(Math.sin(Math.atan2(e.y-c.y,e.x-c.x)-aim),Math.cos(Math.atan2(e.y-c.y,e.x-c.x)-aim));
 const inside=Math.abs(diff)<half&&dist<range;
 e.lit=inside;if(inside){e.hp-=38*buff.damage*dt;e.flash=Math.max(e.flash,.04)}
 if(e.hp<=0){kills+=s.score;downed++;sparks(e.x,e.y,inside?'#efbb79':'#a7c7c0',e.type==='abbot'?28:8,e.type==='abbot'?105:63);tone(e.type==='abbot'?330:130,.09,'triangle',.016,1.7);enemies.splice(i,1);continue}
 const slowing=inside?1-buff.slow:1;const speed=s.speed*(1+(wave-1)*.05)*slowing;
 const recoil=e.knock>0?e.knock:0;
 e.x+=dx/dist*(speed-recoil)*dt;e.y+=dy/dist*(speed-recoil)*dt;
 e.knock=Math.max(0,e.knock-dt*320);e.flash=Math.max(0,e.flash-dt);
 if(dist<32){health=Math.max(0,health-s.harm);downed++;damageFlash=.36;shake=5;sparks(e.x,e.y,'#d16d54',12);tone(95,.26,'sawtooth',.075,.4);enemies.splice(i,1);
 if(health<=0){defeat();break}
 }
 }
 if(phase==='play'&&spawned>=waveGoal&&enemies.length===0){waveWait+=dt;if(waveWait>.9)finishWave()}
 else waveWait=0;
 $('healthBar').style.width=health+'%';$('killCount').textContent=String(kills);
 $('bellFill').style.width=(100*(1-bellRemaining/buff.bellCd)).toFixed(1)+'%';
 $('bellTime').textContent=bellRemaining>0?bellRemaining.toFixed(1)+' СЕК':'ГОТОВ';bell.disabled=bellRemaining>0;
}
function sprite(id,x,y,size,flip=false){
 if(!atlas)return;const cell=32,frame=spriteIDs[id]+(Math.floor(frameTime*4)%2);
 ctx.save();ctx.translate(Math.round(x),Math.round(y));if(flip)ctx.scale(-1,1);ctx.imageSmoothingEnabled=false;
 ctx.drawImage(atlas,frame*cell,0,cell,cell,-size*.5,-size*.91,size,size);ctx.restore();
}
function background(){
 ctx.fillStyle='#293939';ctx.fillRect(0,0,W,H);
 const step=35,offset=Math.floor(H/step);
 for(let y=-step;y<H+step;y+=step){for(let x=-step;x<W+step;x+=step){
 const id=(Math.floor(x/step)+12)*31+(Math.floor(y/step)+offset)*53;
 ctx.fillStyle=rnd(id)>.5?'#334543':'#2b3e3c';ctx.fillRect(x+1,y+1,step-2,step-2);
 ctx.fillStyle=rnd(id*3)>.77?'#455957':'#253734';ctx.fillRect(x+3,y+3,rnd(id*4)*11+4,2);
 if(rnd(id*5)>.76){ctx.fillStyle='#52615a';ctx.fillRect(x+8,y+18,11,1)}
 }}
 // Four architecture wings and weathered arched galleries.
 for(let side=0;side<2;side++){ctx.save();ctx.translate(side?W:0,0);ctx.scale(side?-1:1,1);
 ctx.fillStyle='#182a2c';ctx.fillRect(0,0,24,H);ctx.fillStyle='#536662';ctx.fillRect(23,0,6,H);
 for(let y=42;y<H;y+=103){
 ctx.fillStyle='#596960';ctx.fillRect(0,y-9,47,72);ctx.fillStyle='#223637';ctx.fillRect(9,y+9,31,42);
 ctx.beginPath();ctx.arc(24,y+11,16,Math.PI,TAU);ctx.lineTo(40,y+54);ctx.lineTo(8,y+54);ctx.fill();
 ctx.fillStyle='#8b785b';ctx.fillRect(18,y+2,3,4);ctx.fillRect(29,y+2,3,4);
 ctx.fillStyle='#789088';ctx.fillRect(3,y+63,45,5);
 }ctx.restore()}
 // faded engraved circular floor
 const c=center();ctx.strokeStyle='#68736b';ctx.lineWidth=2;ctx.globalAlpha=.55;
 for(const r of [52,83,121,173]){ctx.beginPath();ctx.arc(c.x,c.y,r,0,TAU);ctx.stroke()}
 ctx.globalAlpha=1;
 for(let i=0;i<12;i++){const a=i*TAU/12;ctx.save();ctx.translate(c.x+Math.cos(a)*122,c.y+Math.sin(a)*122);ctx.rotate(a);
 ctx.fillStyle='#61706a';ctx.fillRect(-10,-5,20,10);ctx.fillStyle='#182a2c';ctx.fillRect(-7,-4,14,8);ctx.restore()}
 for(let i=0;i<22;i++){const x=30+rnd(i*32)*330,y=rnd(i*21+1)*H;
 ctx.fillStyle=i%3===0?'#536954':'#425a50';ctx.beginPath();ctx.ellipse(x,y,2+rnd(i)*5,1.8+rnd(i+1)*4,0,0,TAU);ctx.fill()}
 // distant masonry benches, non-interactive so silhouettes remain distinct
 for(let k=0;k<4;k++){const x=65+k*85;ctx.fillStyle='#1d3032';ctx.fillRect(x,-6,14,48);ctx.fillRect(x,H-37,14,52);ctx.fillStyle='#718076';ctx.fillRect(x-3,32,20,5);ctx.fillRect(x-3,H-41,20,5)}
}
function beam(){
 const c=center(),half=buff.width*Math.PI/360,len=202*buff.range;ctx.save();
 // Narrow concentric penumbra and an interior bright core.
 const grad=ctx.createRadialGradient(c.x,c.y,14,c.x,c.y,len);
 grad.addColorStop(0,'rgba(255,212,128,.72)');grad.addColorStop(.36,'rgba(240,167,86,.31)');grad.addColorStop(.76,'rgba(237,155,70,.20)');grad.addColorStop(1,'rgba(225,147,68,0)');
 ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.arc(c.x,c.y,len,aim-half-.13,aim+half+.13);ctx.closePath();ctx.fill();
 const core=ctx.createRadialGradient(c.x,c.y,8,c.x,c.y,len*.95);
 core.addColorStop(0,'rgba(255,242,195,.42)');core.addColorStop(1,'rgba(255,191,104,0)');
 ctx.fillStyle=core;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.arc(c.x,c.y,len,aim-half*.69,aim+half*.69);ctx.closePath();ctx.fill();
 ctx.strokeStyle='rgba(250,211,141,.18)';ctx.lineWidth=2;for(const edge of [-half,half]){ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x+Math.cos(aim+edge)*len,c.y+Math.sin(aim+edge)*len);ctx.stroke()}
 ctx.restore();
}
function draw(){
 if(!canvas.width)return;
 ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
 ctx.clearRect(0,0,W,H);
 ctx.save();if(shake>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches)ctx.translate(Math.sin(frameTime*75)*shake,Math.cos(frameTime*66)*shake);
 background();
 // Outside the light, the monastery remains dark and fog-bound.
 const darkness=ctx.createRadialGradient(195,H*.5,30,195,H*.5,Math.max(H*.7,300));
 darkness.addColorStop(0,'rgba(2,11,14,.16)');darkness.addColorStop(1,'rgba(2,9,13,.72)');
 ctx.fillStyle=darkness;ctx.fillRect(0,0,W,H);
 beam();
 const c=center();
 // dark edge of raised central plinth
 ctx.fillStyle='#111e20';ctx.beginPath();ctx.ellipse(c.x,c.y+13,43,22,0,0,TAU);ctx.fill();
 ctx.fillStyle='#657067';ctx.beginPath();ctx.ellipse(c.x,c.y+8,37,19,0,0,TAU);ctx.fill();
 ctx.fillStyle='#b1aa87';ctx.beginPath();ctx.ellipse(c.x,c.y+4,32,13,0,0,TAU);ctx.fill();
 ctx.fillStyle='#46524b';ctx.fillRect(c.x-23,c.y-3,46,10);
 sprite('lamp',c.x,c.y+15,57,false);
 // warm animated fire
 const flicker=1+Math.sin(frameTime*13)*.07;
 const lampGlow=ctx.createRadialGradient(c.x,c.y-23,0,c.x,c.y-23,38*flicker);
 lampGlow.addColorStop(0,'rgba(255,242,182,.7)');lampGlow.addColorStop(.32,'rgba(246,176,81,.28)');lampGlow.addColorStop(1,'rgba(240,157,82,0)');
 ctx.fillStyle=lampGlow;ctx.fillRect(c.x-45,c.y-69,90,90);
 const sorted=[...enemies].sort((a,b)=>a.y-b.y);
 for(const e of sorted){
 const s=enemyStats[e.type];ctx.fillStyle='rgba(0,8,10,.5)';ctx.beginPath();ctx.ellipse(e.x,e.y,9*s.size/32,4*s.size/32,0,0,TAU);ctx.fill();
 sprite(e.type,e.x,e.y+5+Math.sin(frameTime*5+e.wiggle)*1.5,s.size,e.x>c.x);
 if(e.lit){const glow=ctx.createRadialGradient(e.x,e.y-10,1,e.x,e.y-10,s.size*.7);glow.addColorStop(0,'rgba(255,214,135,.27)');glow.addColorStop(1,'rgba(255,188,99,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(e.x,e.y-10,s.size*.7,0,TAU);ctx.fill()}
 if(e.flash>.05){ctx.globalAlpha=clamp(e.flash*2,0,.65);ctx.fillStyle='#ffdc93';ctx.beginPath();ctx.arc(e.x,e.y-13,s.size*.35,0,TAU);ctx.fill();ctx.globalAlpha=1}
 if(e.hp<e.max||e.type==='abbot'){ctx.fillStyle='#111c1d';ctx.fillRect(e.x-13,e.y-s.size-6,26,4);ctx.fillStyle='#e3af69';ctx.fillRect(e.x-12,e.y-s.size-5,24*(Math.max(0,e.hp)/e.max),2)}
 }
 if(ring>0){ctx.lineWidth=4*ring+.5;ctx.strokeStyle='rgba(255,218,157,'+(ring*1.5)+')';ctx.beginPath();ctx.arc(c.x,c.y,(1-ring/.52)*180,0,TAU);ctx.stroke()}
 for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.globalAlpha=1;
 if(damageFlash>0){ctx.fillStyle='rgba(206,72,52,'+(damageFlash*.34)+')';ctx.fillRect(0,0,W,H)}
 // Atmospheric pixellated embers on top of the stage, deterministic animation.
 for(let i=0;i<21;i++){const a=(i*137.5)%360,dist=43+(i*23)%126,x=c.x+Math.cos(a)*dist+Math.sin(frameTime*.43+i)*7,y=c.y+Math.sin(a)*dist-(frameTime*7+i*23)%40;
 ctx.fillStyle=i%4===0?'#f6ce88':'#837e62';ctx.globalAlpha=.13+(.14*(1+Math.sin(frameTime+i))*.5);ctx.fillRect(Math.round(x),Math.round(y),i%3===0?2:1,i%4===0?2:1)}
 ctx.globalAlpha=1;ctx.restore();
}
function run(now){
 if(!last)last=now;const dt=Math.min(.037,Math.max(0,(now-last)/1000));last=now;
 if(!document.hidden){update(dt);draw()}anim=requestAnimationFrame(run);
}
function pointer(e){
 const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H,c=center();
 aim=Math.atan2(y-c.y,x-c.x);
 $('sceneHint').textContent='ДЕРЖИ ТЕНИ В ЛУЧЕ';
}
canvas.addEventListener('pointerdown',e=>{if(phase!=='play')return;aimPointer=true;canvas.setPointerCapture(e.pointerId);pointer(e)},{passive:true});
canvas.addEventListener('pointermove',e=>{if(phase==='play'&&(aimPointer||e.pointerType==='mouse'&&e.buttons))pointer(e)},{passive:true});
canvas.addEventListener('pointerup',()=>{aimPointer=false},{passive:true});canvas.addEventListener('pointercancel',()=>{aimPointer=false},{passive:true});
document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();bellAction()}if(e.key==='ArrowRight'||e.key==='d'||e.key==='D')aim+=.16;if(e.key==='ArrowLeft'||e.key==='a'||e.key==='A')aim-=.16;if(e.key==='Escape'||e.key==='p'||e.key==='P')togglePause()});
bell.addEventListener('click',bellAction);
sound.addEventListener('click',()=>{soundOn=!soundOn;setAudio();tone(680,.09);persist()});
pause.addEventListener('click',togglePause);
// A diagnostics overlay must never let a live wave injure the player unseen.
window.addEventListener('workshopopen',()=>{if(phase==='play')togglePause();});
function togglePause(){
 if(phase==='play'){phase='paused';prevPhase='play';panel.hidden=false;showPanel('ПЕРЕДЫШКА','ДОЗОР ПРИОСТАНОВЛЕН','Огонь продолжит гореть, когда ты вернёшься.','ПРОДОЛЖИТЬ',()=>{phase='play';panel.hidden=true});secondary.hidden=false;secondary.textContent='ВЫЙТИ К МЕНЮ';secondary.onclick=()=>{persist();showMenu()};pause.textContent='▶';persist()}
 else if(phase==='paused'){phase='play';panel.hidden=true;pause.textContent='Ⅱ'}
}
document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden&&phase==='play')togglePause();persist()});
window.addEventListener('pagehide',()=>persist());
window.__DOZOR_QA__={get state(){return {phase,wave,health,kills,spawned,enemies:enemies.length,bellRemaining,ready,loadFailed}},aim(angle){aim=angle},ring:bellAction,advance(ms){const n=Math.ceil(ms/16);for(let i=0;i<n;i++)update(ms/n/1000);draw()}};
read();setAudio();buff=freshBuff();art();anim=requestAnimationFrame(run);
// Service worker activation is deferred to the shared update manager.
})();