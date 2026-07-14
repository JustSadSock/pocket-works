'use strict';

import('../../shared/mobile-runtime.js').then(({ installMobileRuntime, setDocumentScrollLocked }) => {
  installMobileRuntime();
  setDocumentScrollLocked(true);
});

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha:false });
const el = id => document.getElementById(id);
const ui = {
  score:el('score'),wave:el('wave'),health:el('health'),combo:el('combo'),hint:el('hint'),callout:el('callout'),
  menu:el('menu'),best:el('best'),bestWave:el('bestWave'),rules:el('rulesPanel'),settings:el('settingsPanel'),
  pause:el('pauseCard'),gameover:el('gameoverCard'),finalScore:el('finalScore'),finalKills:el('finalKills'),finalWave:el('finalWave'),
  finalBestCut:el('finalBestCut'),finalGrazes:el('finalGrazes'),finalBosses:el('finalBosses'),
  soundBtn:el('soundBtn'),pauseBtn:el('pauseBtn'),soundSwitch:el('soundSwitch'),vibeSwitch:el('vibeSwitch')
};
const ROMAN=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'];
const TAU=Math.PI*2;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let W=390,H=844,DPR=1,last=0,raf=0;
let running=false,paused=false,gameOver=false;
let score=0,kills=0,wave=1,waveClock=0,spawnClock=0,shake=0,flash=0,timeScale=1;
let dangerSlow=0,dangerPulse=0,healPulse=0,grazePulse=0;
let pointer={down:false,id:null,sx:0,sy:0,x:0,y:0};
let queuedDash=null;
let enemies=[],projectiles=[],particles=[],cutQueue=[],spawnWarnings=[],paperMarks=[],stamps=[],intersectionFx=[];
let waveStyle='mixed',bossPending=false,bossPhase=false,bossesKilled=0,bestCut=0,totalGrazes=0;
let runSeed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;
let settings={sound:true,vibe:true};
try{settings={...settings,...JSON.parse(localStorage.getItem('pocket-works:cherta:settings')||'{}')}}catch{}
let best=Number(localStorage.getItem('pocket-works:cherta:best')||0),bestWave=Number(localStorage.getItem('pocket-works:cherta:bestWave')||1);
const player={x:195,y:515,r:11,hp:4,maxHp:4,charges:3,focus:false,dashing:false,dashT:0,dashId:0,dashDur:.14,fromX:0,fromY:0,toX:0,toY:0,invuln:0,hitFlash:0,lines:[],comboTimer:0,detonating:false,grazes:0};
let hudHealthSig='';
let audio=null;

function resize(){
  const rect=canvas.getBoundingClientRect();W=Math.max(300,rect.width);H=Math.max(560,rect.height);DPR=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.floor(W*DPR);canvas.height=Math.floor(H*DPR);ctx.setTransform(DPR,0,0,DPR,0,0);
  if(!running){player.x=W*.5;player.y=H*.61}
}
window.addEventListener('resize',resize);resize();
function arena(){return {l:18,r:W-18,t:92,b:H-104}}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function rand(a,b){return a+Math.random()*(b-a)}
function dist(ax,ay,bx,by){return Math.hypot(ax-bx,ay-by)}
function lerp(a,b,t){return a+(b-a)*t}
function ease(t){return 1-Math.pow(1-t,3)}
function segDist(px,py,x1,y1,x2,y2){const vx=x2-x1,vy=y2-y1,wx=px-x1,wy=py-y1;const c1=vx*wx+vy*wy;if(c1<=0)return Math.hypot(px-x1,py-y1);const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(px-x2,py-y2);const t=c1/c2;return Math.hypot(px-(x1+t*vx),py-(y1+t*vy))}
function segmentIntersection(a,b){
  const x1=a.x1,y1=a.y1,x2=a.x2,y2=a.y2,x3=b.x1,y3=b.y1,x4=b.x2,y4=b.y2;
  const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);if(Math.abs(den)<.001)return null;
  const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den,u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/den;
  if(t<=.06||t>=.94||u<=.06||u>=.94)return null;
  return{x:x1+t*(x2-x1),y:y1+t*(y2-y1)}
}
function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function vibrate(ms=15){if(settings.vibe&&navigator.vibrate)navigator.vibrate(ms)}
function initAudio(){if(audio)return;try{audio=new (window.AudioContext||window.webkitAudioContext)()}catch{settings.sound=false}}
function tone(freq=220,dur=.08,type='triangle',gain=.035,slide=0){if(!settings.sound)return;initAudio();if(!audio)return;if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),audio.currentTime+dur);g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}
function hiss(dur=.1,gain=.018){if(!settings.sound)return;initAudio();if(!audio)return;const n=audio.createBufferSource(),b=audio.createBuffer(1,audio.sampleRate*dur,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const g=audio.createGain();g.gain.value=gain;n.buffer=b;n.connect(g).connect(audio.destination);n.start()}
function callout(text,red=false){ui.callout.textContent=text;ui.callout.className='callout show'+(red?' red':'');clearTimeout(callout.t);callout.t=setTimeout(()=>ui.callout.className='callout',720)}
function saveSettings(){localStorage.setItem('pocket-works:cherta:settings',JSON.stringify(settings));syncSettings()}
function syncMenuLayer(){const panelOpen=!ui.rules.classList.contains('hidden')||!ui.settings.classList.contains('hidden');el('app').classList.toggle('menu-open',!ui.menu.classList.contains('hidden')&&!panelOpen)}
function syncChrome(){ui.pauseBtn.hidden=!running||gameOver;ui.pauseBtn.setAttribute('aria-pressed',String(paused));syncMenuLayer()}
function syncSettings(){ui.soundBtn.textContent=settings.sound?'♪':'×';ui.soundBtn.setAttribute('aria-pressed',String(settings.sound));ui.soundSwitch.textContent=settings.sound?'ВКЛ':'ВЫКЛ';ui.vibeSwitch.textContent=settings.vibe?'ВКЛ':'ВЫКЛ';ui.soundSwitch.classList.toggle('on',settings.sound);ui.vibeSwitch.classList.toggle('on',settings.vibe);ui.best.textContent=best;ui.bestWave.textContent=bestWave;syncChrome()}
function styleForWave(n){const styles=['rush','needle','heavy','mixed'];return styles[((runSeed>>>3)+n*5)%styles.length]}
function resetGame(){
  score=0;kills=0;wave=1;waveClock=0;spawnClock=.75;shake=0;flash=0;dangerSlow=0;dangerPulse=0;healPulse=0;grazePulse=0;
  queuedDash=null;pointer.down=false;enemies=[];projectiles=[];particles=[];cutQueue=[];spawnWarnings=[];paperMarks=[];stamps=[];intersectionFx=[];
  runSeed=(Date.now()^Math.floor(Math.random()*0xffffffff))>>>0;waveStyle=styleForWave(1);bossPending=false;bossPhase=false;bossesKilled=0;bestCut=0;totalGrazes=0;
  Object.assign(player,{x:W*.5,y:H*.61,hp:4,maxHp:4,charges:3,focus:false,dashing:false,dashT:0,dashId:0,invuln:0,hitFlash:0,lines:[],comboTimer:0,detonating:false,grazes:0});hudHealthSig='';
  running=true;paused=false;gameOver=false;ui.pause.classList.add('hidden');ui.gameover.classList.add('hidden');ui.menu.classList.add('hidden');ui.rules.classList.add('hidden');ui.settings.classList.add('hidden');syncChrome();
  queueEnemy('stalker',.32);queueEnemy('stalker',.56);updateUI();ui.hint.classList.add('show');setTimeout(()=>ui.hint.classList.remove('show'),2600);tone(150,.15,'sine',.035,140);
}
function updateUI(){
  ui.score.textContent=Math.floor(score);ui.wave.textContent=ROMAN[Math.min(ROMAN.length-1,wave-1)]||wave;
  const healthSig=`${player.hp}/${player.maxHp}/${player.hitFlash>0}/${healPulse>0}`;if(healthSig!==hudHealthSig){hudHealthSig=healthSig;ui.health.innerHTML='';for(let i=0;i<player.maxHp;i++){const s=document.createElement('span');s.className=i<player.hp?'on':'';if(player.hitFlash>0&&i===player.hp)s.classList.add('hit');if(healPulse>0&&i===player.hp-1)s.classList.add('heal');ui.health.appendChild(s)}}
  [...ui.combo.children].forEach((n,i)=>{n.className=i<3-player.charges?'on':'';n.style.removeProperty('--progress');if(i===2&&player.charges===0)n.classList.add('third')});
  if(player.lines.length&&player.comboTimer>0&&!player.detonating){const last=ui.combo.children[Math.max(0,player.lines.length-1)];last.classList.add('timer');last.style.setProperty('--progress',clamp(player.comboTimer/.95,0,1))}
}
function startGame(){initAudio();resetGame();if(!raf){last=performance.now();raf=requestAnimationFrame(loop)}}
function quitToMenu(){running=false;paused=false;gameOver=false;pointer.down=false;queuedDash=null;player.focus=false;shake=0;flash=0;ui.pause.classList.add('hidden');ui.gameover.classList.add('hidden');ui.settings.classList.add('hidden');ui.rules.classList.add('hidden');ui.menu.classList.remove('hidden');syncSettings()}
function pauseGame(v=true){if(!running||gameOver)return;paused=v;pointer.down=false;queuedDash=null;player.focus=false;ui.pause.classList.toggle('hidden',!v);syncChrome()}
