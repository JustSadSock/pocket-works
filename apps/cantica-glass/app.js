import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {LEVELS,LEVEL_COUNT,DIRECTIONS,createBoard,restoreTurns,traceLight,maskOf,neededTurns} from './logic.js';
import {createManuscript} from './manuscript.js';
import {fitChapel} from './playfield-layout.js';

installMobileRuntime();

const $=id=>document.getElementById(id);
const canvas=$('glass'),ctx=canvas.getContext('2d',{alpha:false});
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const SAVE_KEY='pocket-works:cantica-glass:save-v2';
const LEGACY_KEY='pocket-works:cantica-glass:save-v1';
const colors=['#296987','#a33c50','#c18b42','#3d7869','#784e82','#c2a56c','#385b71','#963e48'];
const glyphs=['✣','✦','✤','✧'];
const state={level:0,variant:0,board:[],moves:0,hints:0,unlocked:1,best:{},solved:false,sound:false,highlight:-1,highlightUntil:0,selected:0,pressedIndex:-1,sunAngle:0};
let animation=0,lastFrame=0,view={...fitChapel(320,450,4,1),dpr:1};
let audio=null,press=null,modalFocus=null;
const toneNumber=n=>String(n).padStart(2,'0');
const windowNumber=n=>String(n).padStart(3,'0');
const currentLevel=()=>LEVELS[state.level];
const N=()=>currentLevel().size;

function safeRead(){
  try{const newer=localStorage.getItem(SAVE_KEY);const item=JSON.parse(newer||localStorage.getItem(LEGACY_KEY)||'null');return item&&typeof item==='object'?{...item,__legacy:!newer}:null;}
  catch{return null;}
}
function save(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({level:state.level,variant:state.variant,turns:state.board.map(t=>t.turns),moves:state.moves,hints:state.hints,unlocked:state.unlocked,best:state.best,solved:state.solved,sound:state.sound,sunAngle:state.sunAngle}));}catch{}
}
function hydrate(){
  const old=safeRead();
  if(old){
    state.unlocked=Number.isInteger(old.unlocked)?Math.max(1,Math.min(LEVELS.length,old.unlocked)):1;
    state.level=Number.isInteger(old.level)?Math.max(0,Math.min(state.unlocked-1,old.level)):0;
    state.variant=Number.isInteger(old.variant)?Math.max(0,Math.min(99999,old.variant)):0;
    state.moves=!old.__legacy&&Number.isInteger(old.moves)?Math.max(0,Math.min(99999,old.moves)):0;
    state.hints=!old.__legacy&&Number.isInteger(old.hints)?Math.max(0,Math.min(99999,old.hints)):0;
    state.sunAngle=Number.isFinite(old.sunAngle)?Math.max(-.8,Math.min(.8,old.sunAngle)):0;
    state.sound=old.sound===true;
    if(!old.__legacy&&old.best&&typeof old.best==='object'&&!Array.isArray(old.best))
      for(const [key,value] of Object.entries(old.best))
        if(/^(?:[0-9]|[1-9][0-9]|[1-4][0-9]{2})$/.test(key)&&Number.isInteger(value)&&value>0&&value<99999)state.best[key]=value;
    state.board=createBoard(state.level,state.variant);
    if(old.__legacy||!restoreTurns(state.board,old.turns)){
      state.board=createBoard(state.level,state.variant);state.moves=0;state.hints=0;
    }
    state.solved=Boolean(old.solved)&&traceLight(state.board,state.level).complete;
  }else state.board=createBoard(0,0);
  state.selected=Math.floor(state.board.length/2);
  updateCopy();save();
}
function updateCopy(){
  const level=LEVELS[state.level],light=traceLight(state.board,state.level);
  $('levelName').textContent=level.name;
  $('levelNote').textContent=level.subtitle;
  $('chapterLabel').textContent='КНИГА '+(level.bookIndex+1)+' · '+level.book.toUpperCase()+' · ОКНО '+windowNumber(state.level+1)+' / 500';
  $('progressFill').style.width=(state.unlocked/LEVEL_COUNT*100)+'%';
  $('progressText').textContent=state.unlocked+' / 500';
  $('moves').textContent=toneNumber(state.moves);
  $('flames').textContent=light.lit.filter(Boolean).length+' / '+level.exits.length;
  $('status').textContent=state.solved?'Все реликвии озарены':light.lit.some(Boolean)?'Свет дошёл до алтаря':'Стекло — повернуть · солнце — потянуть';
  $('soundBtn').textContent=state.sound?'Звук вкл.':'Звук выкл.';
  $('soundBtn').setAttribute('aria-pressed',String(state.sound));
  canvas.setAttribute('aria-label','Витраж '+level.size+' на '+level.size+'. Нажмите на фрагмент для поворота, стрелки и Enter — управление с клавиатуры.');
  document.title='CANTICA · '+level.name;
}
function startLevel(index,variant=0){
  if(index<0||index>=state.unlocked)return;
  state.level=index;state.variant=variant;state.board=createBoard(index,variant);
  state.moves=0;state.hints=0;state.solved=false;state.highlight=-1;state.selected=Math.floor(state.board.length/2);
  measure();updateCopy();save();closeModal();chime(500,'turn');
}
function turnTile(index){
  if(state.solved){showVictory();return;}
  if(index<0||index>=state.board.length)return;
  const tile=state.board[index];
  tile.turns=(tile.turns+1)%4;
  tile.targetAngle+=Math.PI/2;
  if(reduced.matches)tile.angle=tile.targetAngle;
  state.moves++;state.selected=index;
  state.highlight=-1;state.highlightUntil=0;
  const result=traceLight(state.board,state.level);
  chime(result.lit.some(Boolean)?640:370,'turn');
  if(result.complete) {
    state.solved=true;
    const prev=state.best[state.level];
    if(!prev||state.moves<prev)state.best[state.level]=state.moves;
    state.unlocked=Math.max(state.unlocked,Math.min(LEVELS.length,state.level+2));
    updateCopy();save();chime(780,'success');
    window.setTimeout(()=>{if(state.solved&&!document.hidden)showVictory();},500);
  }else{updateCopy();save();}
}
function chime(frequency,kind){
  if(!state.sound)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    if(!audio)audio=new Audio();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const now=audio.currentTime;
    for(let i=0;i<(kind==='success'?3:2);i++){
      const oscillator=audio.createOscillator(),gain=audio.createGain();
      oscillator.type='sine';
      oscillator.frequency.setValueAtTime(frequency*(i===0?1:i===1?1.5:2),now+i*.085);
      oscillator.frequency.exponentialRampToValueAtTime(frequency*(i===0?1.004:i===1?1.495:1.98),now+i*.085+.24);
      gain.gain.setValueAtTime(.0001,now+i*.085);
      gain.gain.exponentialRampToValueAtTime(kind==='success'?.065:.027,now+i*.085+.014);
      gain.gain.exponentialRampToValueAtTime(.0001,now+i*.085+.32);
      oscillator.connect(gain);gain.connect(audio.destination);
      oscillator.start(now+i*.085);oscillator.stop(now+i*.085+.34);
    }
  }catch{}
}
function closeModal(){
  if($('scrim').hidden)return;
  $('scrim').hidden=true;$('chapterList').hidden=true;
  $('modalPrimary').onclick=null;$('modalSecondary').onclick=null;
  if(modalFocus?.isConnected)try{modalFocus.focus({preventScroll:true});}catch{}
  modalFocus=null;
}
function openModal({kicker='КНИГА СВЕТА',title,copy,icon='✦',primary='Продолжить',secondary='К витражу',onPrimary=closeModal,onSecondary=closeModal,showList=false}){
  if($('scrim').hidden)modalFocus=document.activeElement;
  $('scrim').hidden=false;
  $('modalKicker').textContent=kicker;
  $('modalTitle').textContent=title;
  $('modalCopy').textContent=copy;
  $('modalIcon').textContent=icon;
  $('modalPrimary').textContent=primary;
  $('modalSecondary').textContent=secondary;
  $('modalPrimary').onclick=onPrimary;
  $('modalSecondary').onclick=onSecondary;
  $('chapterList').hidden=!showList;
  try{$('modalPrimary').focus({preventScroll:true});}catch{}
}
function showVictory(){
  const last=state.level===LEVELS.length-1;
  const newBook=(state.level+1)%50===0&&!last&&state.unlocked>state.level+1;
  const best=state.best[state.level];
  const bookNumber=Math.floor((state.level+1)/50);
  openModal({
    kicker:newBook?'LIBER '+(bookNumber+1)+' · APERTUS':'ОКНО '+windowNumber(state.level+1)+' · ОСВЕЩЕНО',
    title:last?'Великий рассвет':newBook?'Новая книга открыта':'Свет возвращён',
    copy:LEVELS[state.level].epilogue+' '+state.moves+' поворотов. Лучший результат: '+best+'.'+
      (state.hints?' Подсказок: '+state.hints+'.':'')+
      (newBook?' Теперь доступна книга «'+LEVELS[state.level+1].book+'».':''),
    icon:last?'✺':newBook?'✠':'✧',
    primary:last?'Открыть книгу света':newBook?'Открыть новую книгу':'Следующее окно',
    secondary:'Посмотреть витраж',
    onPrimary:()=>last?showChapters():newBook?showChapters(bookNumber):startLevel(state.level+1),
    onSecondary:closeModal
  });
}
function showChapters(book=null){
  closeModal();
  if(Number.isInteger(book)&&book>=0&&book<10)manuscript.show({book:true,level:book*50});
  else manuscript.show();
}
function showRestart(){
  openModal({kicker:'ПЕРЕПЛЁТ СВЕТА',title:'Переложить стекло?',copy:'Расположение фрагментов изменится. Уже пройденные главы и лучшие результаты сохранятся.',
    icon:'↶',primary:'Начать заново',onPrimary:()=>startLevel(state.level,state.variant+1),secondary:'Оставить как есть'});
}
function hint(){
  if(state.solved){showVictory();return;}
  const next=neededTurns(state.board,state.level);
  if(!next)return;
  state.hints++;
  state.highlight=next.index;
  state.highlightUntil=performance.now()+4800;
  state.selected=next.index;
  const row=next.row+1,col=next.col+1;
  $('status').textContent='Строка '+row+', столбец '+col+': повернуть '+next.clockwise+' р.';
  canvas.focus({preventScroll:true});
  chime(660,'turn');save();
}
function pageRustle(){
  if(!state.sound)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    if(!audio)audio=new Audio();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const frames=Math.floor(audio.sampleRate*.14),buffer=audio.createBuffer(1,frames,audio.sampleRate);
    const samples=buffer.getChannelData(0);
    for(let i=0;i<frames;i++){
      const envelope=Math.pow(Math.sin(Math.PI*i/frames),1.2);
      samples[i]=(Math.random()*2-1)*envelope;
    }
    const src=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
    src.buffer=buffer;filter.type='bandpass';filter.frequency.value=1180;filter.Q.value=.7;
    gain.gain.value=.022;src.connect(filter);filter.connect(gain);gain.connect(audio.destination);src.start();
  }catch{}
}
function resetApp(){
  try{localStorage.removeItem(SAVE_KEY);}catch{}
  state.level=0;state.variant=0;state.unlocked=1;state.best={};state.moves=0;state.hints=0;state.solved=false;
  state.board=createBoard(0,0);state.sunAngle=0;state.selected=Math.floor(state.board.length/2);measure();updateCopy();save();closeModal();
}
function hash(n){let t=(Math.imul(n^0x7f4a7c15,0x27d4eb2d)>>>0);t=Math.imul(t^(t>>>15),0x85ebca6b)>>>0;return(t^(t>>>13))>>>0;}
function rand(n){return(hash(n)%10000)/10000;}
function hexRGB(hex){const c=parseInt(hex.slice(1),16);return[(c>>16)&255,(c>>8)&255,c&255];}
function tint(hex,alpha){const [r,g,b]=hexRGB(hex);return 'rgba('+r+','+g+','+b+','+alpha+')';}
function polygon(points,fill,stroke,line=1){
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
  ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
}
function line(x1,y1,x2,y2,stroke,width){
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();
}
function circle(x,y,r,fill,stroke,width=1){
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function measure(){
  const bounds=canvas.getBoundingClientRect();
  if(bounds.width<10||bounds.height<10)return;
  const geometry=fitChapel(bounds.width,bounds.height,N(),currentLevel().entryCol);
  view={...geometry,dpr:Math.min(window.devicePixelRatio||1,2)};
  // Pixel sizes are rescaled, but layout and pointer hit-tests remain in CSS pixels.
  const pixelW=Math.round(bounds.width*view.dpr),pixelH=Math.round(bounds.height*view.dpr);
  if(canvas.width!==pixelW||canvas.height!==pixelH){
    canvas.width=pixelW;canvas.height=pixelH;
  }
}
function pointedArch(left,shoulder,right,bottom,tip){
  const mid=(left+right)/2,w=right-left,rise=shoulder-tip;
  ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(left,shoulder);
  ctx.bezierCurveTo(left,shoulder-rise*.61,mid-w*.23,tip+rise*.07,mid,tip);
  ctx.bezierCurveTo(mid+w*.23,tip+rise*.07,right,shoulder-rise*.61,right,shoulder);
  ctx.lineTo(right,bottom);ctx.closePath();
}
function paintBackdrop(time){
  const {width:w,height:h,boardX:x,boardY:y,tile:s,gridWidth:gw,gridBottom:gb,
    archLeft:left,archRight:right,archTipY:tip,archShoulderY:shoulder,
    frameBottom:bottom,roseX:cx,roseY:ry,roseRadius:rr,relicY,sillY}=view;
  const masonry=ctx.createLinearGradient(0,0,w,h);
  masonry.addColorStop(0,'#2b3938');masonry.addColorStop(.48,'#1c2929');masonry.addColorStop(1,'#142124');
  ctx.fillStyle=masonry;ctx.fillRect(0,0,w,h);
  // Small, unobtrusive courses of quarried limestone outside the lit recess.
  for(let yy=16;yy<h;yy+=42){
    line(0,yy,w,yy,'#c7ae7a0a',1);
    for(let xx=((Math.floor(yy/42)%2)*35)-35;xx<w;xx+=70)
      line(xx,yy-42,xx,yy,'#d2b78409',1);
  }
  const ambient=ctx.createRadialGradient(cx+Math.sin(state.sunAngle)*w*.19,ry,5,cx,y+gw*.37,w*.75);
  ambient.addColorStop(0,'#b4976c45');ambient.addColorStop(.48,'#c28f5210');ambient.addColorStop(1,'#06101200');
  ctx.fillStyle=ambient;ctx.fillRect(0,0,w,h);

  // Dark internal depth: the mosaic belongs to a single lancet opening.
  pointedArch(left,shoulder,right,bottom,tip);
  ctx.fillStyle='#091519';ctx.fill();
  ctx.save();ctx.clip();
  const innerSky=ctx.createLinearGradient(x,tip,x+gw,bottom);
  innerSky.addColorStop(0,'#4a5a59');innerSky.addColorStop(.28,'#304d55');
  innerSky.addColorStop(.62,'#18323c');innerSky.addColorStop(1,'#18252b');
  ctx.fillStyle=innerSky;ctx.fillRect(left,tip,right-left,bottom-tip);

  // Reflected colour follows the sun; only the glazing, not the stone, is saturated.
  const shift=Math.sin(state.sunAngle)*gw*.19;
  const glassWash=ctx.createRadialGradient(cx+shift,ry,rr*.3,cx+shift,y+gw*.25,gw*.66);
  glassWash.addColorStop(0,'#f1be7a48');glassWash.addColorStop(.46,'#8d735633');glassWash.addColorStop(1,'#bf885a00');
  ctx.fillStyle=glassWash;ctx.fillRect(left,tip,right-left,bottom-tip);

  // Consecutive springers join the round rose to the vertical glazing below.
  for(const sign of [-1,1]){
    const fx=cx+sign*(rr+14);
    line(fx,ry+rr*.42,cx+sign*gw*.36,y-4,'#0e2026',Math.max(3,s*.07));
    line(fx+sign*1.4,ry+rr*.42,cx+sign*gw*.36,y-4,'#ae936454',1.15);
  }
  // Rose: eight regularly shaped handmade glass petals, all within the arch.
  ctx.save();ctx.shadowColor='#050b0d';ctx.shadowBlur=9;
  circle(cx,ry,rr+6,'#15242a','#121c20',7);
  ctx.restore();
  circle(cx,ry,rr+3,null,'#ae976d',2.3);
  for(let i=0;i<8;i++){
    const ang=-Math.PI/2+i*Math.PI/4,outer=rr*.86,inner=rr*.26;
    const co=Math.cos(ang),si=Math.sin(ang);
    const petal=[[cx+co*inner-si*rr*.24,ry+si*inner+co*rr*.24],
      [cx+co*outer-si*rr*.17,ry+si*outer+co*rr*.17],
      [cx+co*outer+si*rr*.17,ry+si*outer-co*rr*.17],
      [cx+co*inner+si*rr*.24,ry+si*inner-co*rr*.24]];
    polygon(petal,colors[(i+state.level)%colors.length],'#0b1b21',Math.max(2,rr*.13));
    line(cx+co*rr*.38,ry+si*rr*.38,cx+co*rr*.75,ry+si*rr*.75,'#f9e7c34e',1);
  }
  circle(cx,ry,rr*.27,'#c8ad7a','#18252b',Math.max(2,rr*.15));
  circle(cx,ry,rr*.14,'#fff1bb','#896840',1.2);
  ctx.restore();

  // Cut-stone outer arch: dark undercut, a pale bevel, then a thin shadow.
  pointedArch(left-3,shoulder,right+3,bottom+4,tip-3);
  ctx.strokeStyle='#0a1314';ctx.lineWidth=Math.min(14,s*.19);ctx.stroke();
  pointedArch(left-4,shoulder,right+4,bottom+4,tip-5);
  ctx.strokeStyle='#837966';ctx.lineWidth=Math.min(7,s*.1);ctx.stroke();
  pointedArch(left-7,shoulder+2,right+7,bottom+5,tip-8);
  ctx.strokeStyle='#b3a185';ctx.lineWidth=1.15;ctx.stroke();

  // Columns terminate in actual capitals at the beginning and end of the mosaic.
  for(const sign of [-1,1]){
    const px=sign<0?left-5:right+5,pillar=Math.max(5,Math.min(10,s*.145));
    const stone=ctx.createLinearGradient(px-pillar,0,px+pillar,0);
    stone.addColorStop(0,'#0c191a');stone.addColorStop(.34,'#707b72');
    stone.addColorStop(.59,'#58665f');stone.addColorStop(1,'#142322');
    ctx.fillStyle=stone;
    ctx.fillRect(px-pillar/2,y-3,pillar,gb-y+14);
    line(px-pillar*.15,y+6,px-pillar*.15,gb+7,'#d8c49b43',1.1);
    const cap=Math.max(7,pillar*1.05);
    ctx.fillStyle='#7e7865';ctx.fillRect(px-cap,y-7,cap*2,5);
    ctx.fillStyle='#b1a183';ctx.fillRect(px-cap,y-7,cap*2,1.5);
    ctx.fillStyle='#77715f';ctx.fillRect(px-cap,gb+7,cap*2,6);
    ctx.fillStyle='#a99d7e';ctx.fillRect(px-cap,gb+7,cap*2,1.5);
  }
  // The stone sill unifies the beam outlets and the reliquaries.
  const ledge=ctx.createLinearGradient(0,gb,0,sillY+5);
  ledge.addColorStop(0,'#17272c');ledge.addColorStop(.37,'#576257');ledge.addColorStop(.53,'#313e39');ledge.addColorStop(1,'#121f22');
  ctx.fillStyle=ledge;
  ctx.fillRect(Math.max(2,x-13),gb+5,Math.min(w-4,gw+26),Math.max(5,sillY-gb+3));
  line(Math.max(2,x-13),gb+6,Math.min(w-2,x+gw+13),gb+6,'#c1ab8752',1.5);
  line(Math.max(2,x-13),sillY,Math.min(w-2,x+gw+13),sillY,'#d8c29872',1.3);
  for(let i=0;i<Math.min(9,N()+3);i++){
    const sx=x+gw*(i/(Math.min(9,N()+3)-1));
    circle(sx,sillY,1.3,'#c0a67870');
  }

  // Small refracted pools remain inside the recess and stone ledge.
  ctx.save();ctx.globalAlpha=.13;
  for(let i=0;i<N()+2;i++){
    const xx=x+gw*(i+.6)/(N()+2),jitter=(rand(i*71+state.level*11)-.5)*s;
    const beam=ctx.createLinearGradient(xx,gb,xx+jitter,sillY);
    beam.addColorStop(0,tint(colors[(i+state.level)%colors.length],.85));
    beam.addColorStop(1,tint(colors[(i+state.level)%colors.length],0));
    polygon([[xx-4,gb+6],[xx+4,gb+6],[xx+10+jitter,sillY],[xx-9+jitter,sillY]],beam);
  }
  ctx.restore();
  for(let i=0;i<18;i++){
    const dx=rand(i*187+3)*w,dy=(rand(i*71+5)*h+(reduced.matches?0:time*.002*(i%3+1)))%h;
    circle(dx,dy,i%5===0?.9:.5,'#f6dfa02c');
  }
}
function paintCaustics(trace,time){
  const {boardX:x,boardY:y,tile:s,width:w,height:h}=view,n=N();
  if(!trace.reached.some(Boolean))return;
  ctx.save();ctx.globalCompositeOperation='screen';
  const phase=Math.sin(state.sunAngle)*s*.66;
  for(let i=0;i<state.board.length;i++){
    if(!trace.reached[i])continue;
    const px=x+(i%n+.5)*s,py=y+(Math.floor(i/n)+.5)*s;
    const offset=phase+(px-w/2)*.14,pigment=colors[(i*3+state.level)%colors.length];
    const gradient=ctx.createLinearGradient(px,py,px+offset,Math.min(h,py+s*2.2));
    gradient.addColorStop(0,tint(pigment,.09));gradient.addColorStop(1,tint(pigment,0));
    polygon([[px-s*.24,py+s*.15],[px+s*.24,py+s*.15],
      [px+offset+s*.46,Math.min(h,py+s*1.7)],
      [px+offset-s*.4,Math.min(h,py+s*1.7)]],gradient);
  }
  ctx.restore();
}
function paintLuminousLeads(trace,time){
  if(!trace.segments.length)return;
  const {boardX:x,boardY:y,tile:s}=view,n=N();
  ctx.save();ctx.globalCompositeOperation='screen';
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const [a,b,dist] of trace.segments){
    const ax=x+(a%n+.5)*s,ay=y+(Math.floor(a/n)+.5)*s;
    const bx=x+(b%n+.5)*s,by=y+(Math.floor(b/n)+.5)*s;
    const glow=reduced.matches?.35:.30+.07*Math.cos(time*.0032-dist*.63);
    ctx.save();ctx.shadowColor='#ffd78f';ctx.shadowBlur=s*.32;
    line(ax,ay,bx,by,'rgba(255,221,149,'+glow+')',Math.max(2,s*.10));ctx.restore();
    line(ax,ay,bx,by,'rgba(255,251,218,'+(glow*.38)+')',Math.max(.6,s*.029));
  }
  ctx.restore();
}
function paintGlassTile(index,time,lit){
  const s=view.tile,col=index%N(),row=Math.floor(index/N()),x=view.boardX+col*s,y=view.boardY+row*s;
  const tile=state.board[index],cx=x+s/2,cy=y+s/2;
  // Fixed square lead frame and its deep shadow.
  ctx.fillStyle='#091418';ctx.fillRect(x,y,s,s);
  ctx.save();ctx.beginPath();ctx.rect(x+2.4,y+2.4,s-4.8,s-4.8);ctx.clip();
  ctx.translate(cx,cy);ctx.rotate(tile.angle);
  const h=s/2;
  const seed=hash(index*9127+state.level*439);
  const base=colors[(index*3+Math.floor(index/N())+state.level*2)%colors.length];
  const a=colors[(index*7+2)%colors.length];
  const b=colors[(index*5+4)%colors.length];
  const bg=ctx.createLinearGradient(-h,-h,h,h);
  bg.addColorStop(0,tint(base,1));bg.addColorStop(.55,tint(a,.95));bg.addColorStop(1,tint(base,1));
  ctx.fillStyle=bg;ctx.fillRect(-h,-h,s,s);
  // Hand-cut diamonds and triangular stained-glass tesserae, with black raised leads.
  const k=h*.98;
  polygon([[-k,-k],[0,-k],[-k,0]],tint(a,.85),'#10191c',Math.max(2.6,s*.052));
  polygon([[k,-k],[k,0],[0,-k]],tint(b,.79),'#10191c',Math.max(2.6,s*.052));
  polygon([[-k,k],[-k,0],[0,k]],tint(b,.82),'#10191c',Math.max(2.6,s*.052));
  polygon([[k,k],[0,k],[k,0]],tint(a,.80),'#10191c',Math.max(2.6,s*.052));
  polygon([[0,-k*.91],[k*.87,0],[0,k*.91],[-k*.87,0]],tint(base,.88),'#121e20',Math.max(3,s*.06));
  // Etched feather / quatrefoil marks and subtle material streaks.
  ctx.strokeStyle='#fff3d53b';ctx.lineWidth=Math.max(.7,s*.015);
  for(let n=0;n<4;n++){
    ctx.save();ctx.rotate(n*Math.PI/2);
    ctx.beginPath();ctx.moveTo(-h*.32,-h*.47);
    ctx.quadraticCurveTo(0,-h*.85,h*.32,-h*.47);
    ctx.stroke();ctx.restore();
  }
  for(let n=0;n<19;n++){
    const ox=(rand(seed+n*53)-.5)*s*.9,oy=(rand(seed+n*61+9)-.5)*s*.9;
    circle(ox,oy,.35+rand(n*93+seed)*.95,n%3?'#fcf3d12c':'#0715194a');
  }
  const soft=ctx.createLinearGradient(-h,-h*.8,h,h*.6);
  soft.addColorStop(0,'#fffbd026');soft.addColorStop(.34,'#ffffff02');soft.addColorStop(.65,'#0714141a');soft.addColorStop(1,'#ffe6b116');
  ctx.fillStyle=soft;ctx.fillRect(-h,-h,s,s);
  // Gradated glass thickness, polished fractures and trapped air.
  const inner=ctx.createRadialGradient(-h*.28,-h*.38,s*.01,h*.16,h*.20,s*.86);
  inner.addColorStop(0,'#fff9dc31');inner.addColorStop(.46,'#ffffff00');inner.addColorStop(1,'#07121e63');
  ctx.fillStyle=inner;ctx.fillRect(-h,-h,s,s);
  ctx.save();ctx.rotate((seed%13)*.075);ctx.scale(1,.38);
  ctx.beginPath();ctx.ellipse(-h*.22,-h*.36,s*.13,s*.034,.3,0,Math.PI*2);
  ctx.strokeStyle='#fff8df61';ctx.lineWidth=Math.max(.7,s*.012);ctx.stroke();ctx.restore();
  // Leaded branches are the playable channels; rotating the pane rotates the ornament.
  for(let d=0;d<4;d++){
    if(!(tile.baseMask&(1<<d)))continue;
    ctx.save();ctx.rotate(d*Math.PI/2);
    ctx.lineCap='round';
    line(0,-2,0,-h-3,'#101a1c',s*.27);
    line(0,-2,0,-h-3,'#8b7357',s*.193);
    line(-s*.025,-3,-s*.025,-h-3,'#d8bc87',Math.max(2,s*.12));
    line(s*.03,-s*.14,s*.03,-h+1,lit?'#fff6cf':'#e1cda37a',Math.max(1.5,s*.044));
    if(lit){
      ctx.save();ctx.shadowColor='#ffdd79';ctx.shadowBlur=s*.25;
      line(0,-3,0,-h+1,'#fff2b7cc',Math.max(2,s*.069));
      ctx.restore();
    }
    // A pair of gilt leaflets lives within each lead channel.
    const by=-h*.57;
    polygon([[-s*.04,by],[ -s*.15,by-s*.09],[-s*.085,by-s*.22],[0,by-s*.1]],lit?'#ffefbb':'#bba275','#413929',.6);
    polygon([[s*.04,by],[s*.15,by+s*.08],[s*.075,by+s*.19],[0,by+s*.08]],lit?'#ffe7a0':'#a68b68','#413929',.6);
    ctx.restore();
  }
  // Medallion centre, more rosette than pipe connector.
  const pulse=lit&&!reduced.matches ? .5+.5*Math.sin(time*.004+index) : .8;
  ctx.save();if(lit){ctx.shadowColor='#ffdfa4';ctx.shadowBlur=s*.29*pulse;}
  circle(0,0,s*.145,lit?'#f0d5a1':'#6e5f57','#132326',s*.06);
  circle(0,0,s*.087,lit?'#fff0bf':tint(b,1),'#6f543a',1.8);
  ctx.restore();
  for(let d=0;d<8;d++){
    const a=d*Math.PI/4;
    circle(Math.cos(a)*s*.112,Math.sin(a)*s*.112,s*.022,lit?'#fff2c4':'#b6a075');
  }
  ctx.restore();
  // Fixed came grid. Bevel and a little cast shadow sell the material.
  ctx.strokeStyle='#030c0e';ctx.lineWidth=Math.max(4,s*.09);ctx.strokeRect(x+1.4,y+1.4,s-2.8,s-2.8);
  ctx.strokeStyle='#79746a';ctx.lineWidth=Math.max(1.3,s*.026);ctx.strokeRect(x+3.2,y+3.2,s-6.4,s-6.4);
  line(x+s-3,y+4,x+s-3,y+s-3,'#020c12ae',Math.max(2,s*.052));
  line(x+3,y+s-3,x+s-3,y+s-3,'#020c12a8',Math.max(2,s*.044));
  if(lit){ctx.save();ctx.globalCompositeOperation='screen';
    const bloom=ctx.createRadialGradient(cx,cy,0,cx,cy,s*.75);
    bloom.addColorStop(0,'#ffe3a130');bloom.addColorStop(1,'#fff2b100');
    ctx.fillStyle=bloom;ctx.fillRect(x+2,y+2,s-4,s-4);ctx.restore();}
  line(x+4,y+4,x+s-4,y+4,'#e0ce9d59',1);
  line(x+4,y+4,x+4,y+s-4,'#cadad052',1);
  // At each join a small soldered joint.
  circle(x+1,y+1,Math.max(2,s*.045),'#5e615b','#192729',1);
  if(index===state.pressedIndex){ctx.save();ctx.strokeStyle='#fff2c8';ctx.lineWidth=3;ctx.strokeRect(x+3,y+3,s-6,s-6);ctx.restore();}
  if(index===state.selected && document.activeElement===canvas){
    ctx.strokeStyle='#fff2b0';ctx.lineWidth=2;ctx.strokeRect(x+4,y+4,s-8,s-8);
  }
  if(state.highlight===index&&performance.now()<state.highlightUntil){
    ctx.save();ctx.shadowColor='#ffecc0';ctx.shadowBlur=15;
    ctx.strokeStyle='#fff0a4';ctx.lineWidth=3;
    ctx.strokeRect(x+2,y+2,s-4,s-4);ctx.restore();
    // Arrow over the exact piece, visual not only textual guidance.
    ctx.fillStyle='#fff5c0';ctx.font='bold '+Math.round(s*.31)+'px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('↻',cx,cy+s*.27);
  }
}
function paintRelics(trace,time){
  const {boardX:x,boardY:y,tile:s,relicY:baseY,gridBottom}=view;
  LEVELS[state.level].exits.forEach((col,i)=>{
    const cx=x+(col+.5)*s,lit=trace.lit[i];
    line(cx,gridBottom+3,cx,baseY,'#b6a078',Math.max(2,s*.036));
    const r=Math.min(16,s*.25);
    ctx.save();if(lit){ctx.shadowColor='#ffc774';ctx.shadowBlur=reduced.matches?9:14+Math.sin(time*.006+i)*3;}
    circle(cx,baseY,r,lit?'#b47c42':'#1c3036','#d6bd84',2.6);
    ctx.restore();
    const shield=[[cx,baseY-r*.78],[cx+r*.58,baseY-r*.25],[cx+r*.38,baseY+r*.55],[cx,baseY+r*.82],[cx-r*.38,baseY+r*.55],[cx-r*.58,baseY-r*.25]];
    polygon(shield,lit?'#ffdf91':'#44606a','#1a2629',1.4);
    line(cx,baseY-r*.5,cx,baseY+r*.53,lit?'#fff9d0':'#b5b4ad',Math.max(1.2,s*.025));
    line(cx-r*.31,baseY-r*.10,cx+r*.31,baseY-r*.10,lit?'#fff9d0':'#b5b4ad',Math.max(1,s*.02));
    if(lit){
      for(let n=0;n<8;n++){const a=n*Math.PI/4;
        line(cx+Math.cos(a)*(r+4),baseY+Math.sin(a)*(r+4),cx+Math.cos(a)*(r+8),baseY+Math.sin(a)*(r+8),'#ffe4a877',1.3);}
    }
  });
}
function paintSun(trace,time){
  const {roseX:rx,roseY:ry,roseRadius:rr,entryX,boardY:y,tile:s}=view;
  const hitX=rx+Math.sin(state.sunAngle)*rr*.19;
  const hitY=ry;
  const active=trace.reached[currentLevel().entryCol];
  // The source lives *inside* the stained rose, not as a second floating icon.
  const wave=reduced.matches?0:Math.sin(time*.003)*.12;
  ctx.save();ctx.lineCap='round';ctx.shadowColor='#ffe2a1';ctx.shadowBlur=active?13:5;
  ctx.beginPath();ctx.moveTo(hitX,hitY+rr*.17);
  ctx.quadraticCurveTo(entryX,hitY+(y-hitY)*.57,entryX,y+4);
  ctx.strokeStyle=active?'#f8d993': '#a58c685b';
  ctx.lineWidth=Math.max(1.4,s*.053);
  ctx.stroke();ctx.restore();
  // Tight metal boss has a modest jewel and an honest touch target.
  ctx.save();ctx.shadowColor='#f9dd9c';ctx.shadowBlur=active?13+wave*8:4;
  circle(hitX,hitY,Math.max(5,rr*.22),'#e6c98d','#243031',Math.max(2,rr*.13));
  circle(hitX-rr*.04,hitY-rr*.06,Math.max(2.5,rr*.095),'#fff4c8');
  ctx.restore();
  for(let d=0;d<4;d++){
    const a=d*Math.PI/2;
    circle(hitX+Math.cos(a)*rr*.32,hitY+Math.sin(a)*rr*.32,1.2,'#eed2a6b1');
  }
}
function render(time){
  if(!ctx)return;
  const {width:w,height:h,dpr}=view;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  paintBackdrop(time);
  const trace=traceLight(state.board,state.level);
  paintCaustics(trace,time);
  for(let i=0;i<state.board.length;i++){
    const tile=state.board[i];
    if(reduced.matches)tile.angle=tile.targetAngle;
    else {
      const diff=tile.targetAngle-tile.angle;
      tile.angle=Math.abs(diff)<.002?tile.targetAngle:tile.angle+diff*.27;
    }
    paintGlassTile(i,time,trace.reached[i]);
  }
  paintLuminousLeads(trace,time);
  paintSun(trace,time);
  paintRelics(trace,time);
  lastFrame=time;
  if(!document.hidden)animation=requestAnimationFrame(render);
}
function wake(){
  if(animation)cancelAnimationFrame(animation);
  if(!document.hidden)animation=requestAnimationFrame(render);
}
function onTouchEnd(event){
  if(!press||press.id!==event.pointerId)return;
  const initial=press;press=null;state.pressedIndex=-1;
  try{canvas.releasePointerCapture(event.pointerId);}catch{}
  if(initial.sun){save();updateCopy();return;}
  const rect=canvas.getBoundingClientRect();
  const dx=event.clientX-initial.x,dy=event.clientY-initial.y;
  if(Math.hypot(dx,dy)>13)return;
  const x=event.clientX-rect.left,y=event.clientY-rect.top;
  const col=Math.floor((x-view.boardX)/view.tile),row=Math.floor((y-view.boardY)/view.tile);
  if(row<0||row>=N()||col<0||col>=N())return;
  turnTile(row*N()+col);
}
canvas.addEventListener('pointerdown',event=>{
  if(!$('scrim').hidden||event.button!==0)return;
  const rect=canvas.getBoundingClientRect(),lx=event.clientX-rect.left,ly=event.clientY-rect.top;
  const sunlightX=view.roseX+Math.sin(state.sunAngle)*view.roseRadius*.19;
  const sunlightY=view.roseY;
  const sun=Math.hypot(lx-sunlightX,ly-sunlightY)<Math.max(20,view.roseRadius*.7);
  const col=Math.floor((lx-view.boardX)/view.tile),row=Math.floor((ly-view.boardY)/view.tile);
  state.pressedIndex=!sun&&col>=0&&col<N()&&row>=0&&row<N()?row*N()+col:-1;
  press={id:event.pointerId,x:event.clientX,y:event.clientY,sun,sunAngleAtPress:state.sunAngle};
  try{canvas.setPointerCapture(event.pointerId);}catch{}
});
canvas.addEventListener('pointermove',event=>{
  if(!press||!press.sun||press.id!==event.pointerId)return;
  state.sunAngle=Math.max(-.8,Math.min(.8,(event.clientX-press.x)/105+press.sunAngleAtPress));
  $('status').textContent='Солнечный луч меняет угол и преломление';
});
canvas.addEventListener('pointerup',onTouchEnd);
canvas.addEventListener('pointercancel',()=>{press=null;state.pressedIndex=-1;});
canvas.addEventListener('lostpointercapture',()=>{press=null;state.pressedIndex=-1;});
canvas.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();turnTile(state.selected);return;}
  const arrows={ArrowUp:-N(),ArrowDown:N(),ArrowLeft:-1,ArrowRight:1};
  if(!(event.key in arrows))return;
  event.preventDefault();
  const row=Math.floor(state.selected/N()),col=state.selected%N();
  if(event.key==='ArrowUp'&&row>0)state.selected-=N();
  if(event.key==='ArrowDown'&&row<N()-1)state.selected+=N();
  if(event.key==='ArrowLeft'&&col>0)state.selected-=1;
  if(event.key==='ArrowRight'&&col<N()-1)state.selected+=1;
});
$('hintBtn').addEventListener('click',hint);
$('chaptersBtn').addEventListener('click',()=>showChapters());
$('restartBtn').addEventListener('click',showRestart);
$('soundBtn').addEventListener('click',()=>{state.sound=!state.sound;updateCopy();save();if(state.sound)chime(570,'turn');});
$('modalClose').addEventListener('click',closeModal);
$('scrim').addEventListener('pointerdown',event=>{if(event.target===$('scrim'))closeModal();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('scrim').hidden){event.preventDefault();closeModal();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(animation)cancelAnimationFrame(animation);animation=0;save();}else wake();});
window.addEventListener('pagehide',save);
window.addEventListener('resize',()=>{measure();wake();});
if('ResizeObserver'in window)new ResizeObserver(()=>{measure();wake();}).observe(canvas);
const manuscript=createManuscript({
  levels:LEVELS,
  getUnlocked:()=>state.unlocked,
  getBest:()=>state.best,
  getCurrent:()=>state.level,
  onSelect:index=>startLevel(index),
  onPageTurn:pageRustle,
  reduceMotion:()=>reduced.matches
});
createWorkshopMode({appName:'CANTICA — Песнь света',version:'3.1.0',cachePrefix:'cantica-glass-',storageNamespace:'pocket-works:cantica-glass',onReset:resetApp});
hydrate();
measure();wake();
if(state.solved)window.setTimeout(showVictory,120);
