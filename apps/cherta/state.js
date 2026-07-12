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
  soundBtn:el('soundBtn'),soundSwitch:el('soundSwitch'),vibeSwitch:el('vibeSwitch')
};
const ROMAN=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'];
const TAU=Math.PI*2;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let W=390,H=844,DPR=1,last=0,raf=0;
let running=false,paused=false,gameOver=false,firstRun=true;
let score=0,kills=0,wave=1,waveClock=0,spawnClock=0,shake=0,flash=0,timeScale=1;
let pointer={down:false,id:null,sx:0,sy:0,x:0,y:0};
let enemies=[],projectiles=[],particles=[],splashes=[],cutQueue=[];
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
function vibrate(ms=15){if(settings.vibe&&navigator.vibrate)navigator.vibrate(ms)}
function initAudio(){if(audio)return;try{audio=new (window.AudioContext||window.webkitAudioContext)()}catch{settings.sound=false}}
function tone(freq=220,dur=.08,type='triangle',gain=.035,slide=0){if(!settings.sound)return;initAudio();if(!audio)return;if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide),audio.currentTime+dur);g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}
function hiss(dur=.1,gain=.018){if(!settings.sound)return;initAudio();if(!audio)return;const n=audio.createBufferSource(),b=audio.createBuffer(1,audio.sampleRate*dur,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const g=audio.createGain();g.gain.value=gain;n.buffer=b;n.connect(g).connect(audio.destination);n.start()}
function callout(text,red=false){ui.callout.textContent=text;ui.callout.className='callout show'+(red?' red':'');clearTimeout(callout.t);callout.t=setTimeout(()=>ui.callout.className='callout',650)}
function saveSettings(){localStorage.setItem('pocket-works:cherta:settings',JSON.stringify(settings));syncSettings()}
function syncSettings(){ui.soundBtn.textContent=settings.sound?'♪':'×';ui.soundSwitch.textContent=settings.sound?'ВКЛ':'ВЫКЛ';ui.vibeSwitch.textContent=settings.vibe?'ВКЛ':'ВЫКЛ';ui.soundSwitch.classList.toggle('on',settings.sound);ui.vibeSwitch.classList.toggle('on',settings.vibe);ui.best.textContent=best;ui.bestWave.textContent=bestWave}
function resetGame(){
  score=0;kills=0;wave=1;waveClock=0;spawnClock=.65;shake=0;flash=0;enemies=[];projectiles=[];particles=[];splashes=[];cutQueue=[];
  Object.assign(player,{x:W*.5,y:H*.61,hp:4,maxHp:4,charges:3,focus:false,dashing:false,dashT:0,dashId:0,invuln:0,hitFlash:0,lines:[],comboTimer:0,detonating:false,grazes:0});hudHealthSig='';
  running=true;paused=false;gameOver=false;ui.pause.classList.add('hidden');ui.gameover.classList.add('hidden');ui.menu.classList.add('hidden');ui.rules.classList.add('hidden');ui.settings.classList.add('hidden');
  spawnEnemy('stalker');spawnEnemy('stalker');updateUI();ui.hint.classList.add('show');setTimeout(()=>ui.hint.classList.remove('show'),2600);tone(150,.15,'sine',.035,140);
}
function updateUI(){
  ui.score.textContent=Math.floor(score);ui.wave.textContent=ROMAN[Math.min(ROMAN.length-1,wave-1)]||wave;
  const healthSig=`${player.hp}/${player.maxHp}/${player.hitFlash>0}`;if(healthSig!==hudHealthSig){hudHealthSig=healthSig;ui.health.innerHTML='';for(let i=0;i<player.maxHp;i++){const s=document.createElement('span');s.className=i<player.hp?'on':'';if(player.hitFlash>0&&i===player.hp)s.classList.add('hit');ui.health.appendChild(s)}}
  [...ui.combo.children].forEach((n,i)=>{n.className=i<3-player.charges?'on':'';n.style.removeProperty('--progress')});
  if(player.lines.length&&player.comboTimer>0&&!player.detonating){const last=ui.combo.children[Math.max(0,player.lines.length-1)];last.classList.add('timer');last.style.setProperty('--progress',clamp(player.comboTimer/.95,0,1))}
}
function startGame(){initAudio();resetGame();if(!raf){last=performance.now();raf=requestAnimationFrame(loop)}}
function quitToMenu(){running=false;paused=false;gameOver=false;pointer.down=false;ui.pause.classList.add('hidden');ui.gameover.classList.add('hidden');ui.settings.classList.add('hidden');ui.menu.classList.remove('hidden');syncSettings()}
function pauseGame(v=true){if(!running||gameOver)return;paused=v;pointer.down=false;player.focus=false;ui.pause.classList.toggle('hidden',!v)}
