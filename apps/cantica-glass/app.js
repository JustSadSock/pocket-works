import {installMobileRuntime} from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
import {LEVELS,LEVEL_COUNT,DIRECTIONS,createBoard,restoreTurns,traceLight,maskOf,neededTurns,verifyLevels} from './logic.js';

installMobileRuntime();
verifyLevels();

const $=id=>document.getElementById(id);
const canvas=$('glass'),ctx=canvas.getContext('2d',{alpha:false});
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const SAVE_KEY='pocket-works:cantica-glass:save-v2';
const LEGACY_KEY='pocket-works:cantica-glass:save-v1';
const colors=['#296987','#a33c50','#c18b42','#3d7869','#784e82','#c2a56c','#385b71','#963e48'];
const glyphs=['✣','✦','✤','✧'];
const state={level:0,variant:0,board:[],moves:0,hints:0,unlocked:1,best:{},solved:false,sound:false,highlight:-1,highlightUntil:0,selected:0,pressedIndex:-1,sunAngle:0};
let animation=0,lastFrame=0,view={width:320,height:450,dpr:1,boardX:0,boardY:0,tile:56};
let audio=null,press=null;
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
function closeModal(){$('scrim').hidden=true;$('chapterList').hidden=true; $('modalPrimary').onclick=null;$('modalSecondary').onclick=null;}
function openModal({kicker='КНИГА СВЕТА',title,copy,icon='✦',primary='Продолжить',secondary='К витражу',onPrimary=closeModal,onSecondary=closeModal,showList=false}){
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
}
function showVictory(){
  const last=state.level===LEVELS.length-1;
  const best=state.best[state.level];
  openModal({kicker:'ОКНО '+toneNumber(state.level+1)+' · ЗАЖЖЕНО',title:last?'Великий рассвет':'Свет возвращён',
    copy:LEVELS[state.level].epilogue+' '+state.moves+' поворотов. Лучший результат: '+best+'.'+(state.hints?' Подсказок: '+state.hints+'.':''),
    icon:last?'✺':'✧',primary:last?'Выбрать главу':'Следующее окно',
    onPrimary:()=>last?showChapters():startLevel(state.level+1),
    secondary:'Посмотреть витраж',onSecondary:closeModal});
}
function showChapters(book=Math.floor(state.level/50)){
  if(book<0||book>9)book=Math.floor(state.level/50);
  const start=book*50,unlockedInBook=Math.max(0,Math.min(50,state.unlocked-start));
  openModal({kicker:'LIBER LUMINIS · D FENESTRAE',title:'Книга окон',
    copy:LEVELS[start].book+' · '+unlockedInBook+' из 50 окон открыто.',
    icon:'❖',primary:'К витражу',onPrimary:closeModal,secondary:'Закрыть',showList:true});
  const list=$('chapterList');list.replaceChildren();
  const navigator=document.createElement('div');navigator.className='book-navigation';
  for(let i=0;i<10;i++){
    const b=document.createElement('button');b.type='button';
    b.textContent=String(i+1);b.title='Книга '+(i+1)+': '+LEVELS[i*50].book;
    b.setAttribute('aria-label',b.title);b.className=i===book?'selected-book':'';
    if(i*50>=state.unlocked)b.disabled=true;
    b.addEventListener('click',()=>showChapters(i));navigator.append(b);
  }
  list.append(navigator);
  const label=document.createElement('p');label.className='book-page-name';
  label.textContent='КНИГА '+(book+1)+' · '+LEVELS[start].book;list.append(label);
  const page=document.createElement('div');page.className='window-grid';
  for(let i=start;i<Math.min(start+50,LEVEL_COUNT);i++){
    const b=document.createElement('button');b.type='button';
    b.textContent=String(i+1);b.disabled=i>=state.unlocked;
    b.className=(i===state.level?'is-current ':'')+(state.best[i]?'is-lit':'');
    b.setAttribute('aria-label','Окно '+(i+1)+(state.best[i]?', пройдено':'')+(i>=state.unlocked?', закрыто':''));
    b.addEventListener('click',()=>startLevel(i));page.append(b);
  }
  list.append(page);
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
  const box=canvas.getBoundingClientRect();
  if(box.width<10||box.height<10)return;
  view.width=box.width;view.height=box.height;
  view.dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(box.width*view.dpr);
  canvas.height=Math.round(box.height*view.dpr);
  const size=N();
  view.tile=Math.max(27,Math.min((box.width-29)/size,(box.height-171)/size,79));
  view.boardX=(box.width-view.tile*size)/2;
  view.boardY=Math.max(74,Math.min(Math.max(108,(box.height-view.tile*size)/2+12),box.height-view.tile*size-39));
}
function gothicArch(x1,y1,x2,y2,pointY){
  const center=(x1+x2)/2;
  ctx.beginPath();ctx.moveTo(x1,y2);ctx.lineTo(x1,y1);
  ctx.bezierCurveTo(x1,y1-23,center-47,pointY+30,center,pointY);
  ctx.bezierCurveTo(center+47,pointY+30,x2,y1-23,x2,y1);
  ctx.lineTo(x2,y2);ctx.closePath();
}
function paintBackdrop(time){
  const {width:w,height:h,boardX:x,boardY:y,tile:s}=view;
  const sky=ctx.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,'#26373f');sky.addColorStop(.48,'#17262c');sky.addColorStop(1,'#111a20');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  // Stone courses, drawn with different joint offsets.
  for(let yy=18;yy<h;yy+=39){
    line(0,yy,w,yy,'#a6a08412',1);
    for(let xx=((Math.floor(yy/39)%2)*40)-37;xx<w;xx+=80)
      line(xx,yy-39,xx,yy,'#a6a08410',1);
  }
  const beamShift=Math.sin(state.sunAngle)*w*.31;
  const spotlight=ctx.createRadialGradient(w/2+beamShift,y-65,8,w/2+beamShift*.45,y+100,w*.82);
  spotlight.addColorStop(0,'#caad7845');spotlight.addColorStop(.5,'#835e3920');spotlight.addColorStop(1,'#0b141600');
  ctx.fillStyle=spotlight;ctx.fillRect(0,0,w,h);
  const lx=x-17,rx=x+s*N()+17,top=y-50,bottom=y+s*N()+12,tip=y-122;
  gothicArch(lx,top,rx,bottom,tip);
  ctx.fillStyle='#0c171a';ctx.fill();
  ctx.save();ctx.clip();
  const light=ctx.createLinearGradient(lx,tip,rx,bottom);
  light.addColorStop(0,'#c69a6a80');light.addColorStop(.48,'#1e4759');light.addColorStop(1,'#8e555b');
  ctx.fillStyle=light;ctx.fillRect(lx,tip,rx-lx,bottom-tip);
  const crystal=ctx.createLinearGradient(lx+beamShift*.28,top,rx+beamShift*.48,bottom);
  crystal.addColorStop(0,'#fff4b117');crystal.addColorStop(.4,'#f3bf5f05');crystal.addColorStop(1,'#ffdfab1e');
  ctx.fillStyle=crystal;ctx.fillRect(lx,top,rx-lx,bottom-top);
  // Radiant rose and top tracery.
  const cx=w/2,ry=y-59,rr=Math.min(40,s*.66);
  circle(cx,ry,rr+5,'#121d22','#68553a',4);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,ux=Math.cos(a),uy=Math.sin(a);
    const p=[[cx+ux*rr*.24-uy*rr*.29,ry+uy*rr*.24+ux*rr*.29],
      [cx+ux*rr*.9,ry+uy*rr*.9],
      [cx+ux*rr*.24+uy*rr*.29,ry+uy*rr*.24-ux*rr*.29]];
    polygon(p,colors[(i+2)%colors.length],'#091419',2.8);
    line(cx+ux*rr*.33,ry+uy*rr*.33,cx+ux*rr*.72,ry+uy*rr*.72,'#fff3c54c',1);
  }
  circle(cx,ry,rr*.22,'#debd7e','#1a272c',3);
  for(let a=0;a<12;a++) {
    const ang=a*Math.PI/6;line(cx+Math.cos(ang)*rr*.1,ry+Math.sin(ang)*rr*.1,cx+Math.cos(ang)*rr*.16,ry+Math.sin(ang)*rr*.16,'#744a27',1.5);
  }
  // Tiny lancets carved into the upper glass shoulders.
  for(const side of [-1,1]){
    const px=cx+side*(rr+23);
    ctx.beginPath();ctx.moveTo(px-10,y-17);ctx.lineTo(px-10,y-53);ctx.quadraticCurveTo(px-9,y-72,px,y-80);
    ctx.quadraticCurveTo(px+9,y-72,px+10,y-53);ctx.lineTo(px+10,y-17);ctx.closePath();
    ctx.fillStyle=side<0?'#5c3b53':'#315968';ctx.fill();
    ctx.strokeStyle='#16262a';ctx.lineWidth=4;ctx.stroke();
    line(px,y-73,px,y-18,'#b995664c',1.7);
  }
  ctx.restore();
  gothicArch(lx-7,top-2,rx+7,bottom+6,tip-9);
  ctx.strokeStyle='#0a1316';ctx.lineWidth=18;ctx.stroke();
  gothicArch(lx-7,top-2,rx+7,bottom+6,tip-9);
  ctx.strokeStyle='#847357';ctx.lineWidth=5;ctx.stroke();
  gothicArch(lx-11,top-3,rx+11,bottom+8,tip-13);
  ctx.strokeStyle='#4a5758';ctx.lineWidth=2.5;ctx.stroke();
  // Chiselled ribs down each side.
  for(const sign of [-1,1]){
    const ax=sign<0?lx-16:rx+16;
    const v=ctx.createLinearGradient(ax-8,0,ax+8,0);
    v.addColorStop(0,'#0e1a1c');v.addColorStop(.45,'#71807b');v.addColorStop(.64,'#374448');v.addColorStop(1,'#101b1e');
    ctx.fillStyle=v;ctx.fillRect(ax-8,top-4,16,bottom-top+21);
    ctx.fillStyle='#a08d70';ctx.fillRect(ax-12,top+3,24,5);ctx.fillRect(ax-12,bottom-15,24,7);
    line(ax-5,top+18,ax-5,bottom-17,'#b6a68e34',1);
  }
  // Colored reflections spilling beneath the window.
  ctx.save();ctx.globalAlpha=.23;
  for(let i=0;i<11;i++){
    const xx=x+s*(i%N()+.32);
    const jitter=(rand(i*21+state.level*18)-.5)*s;
    const g=ctx.createLinearGradient(xx,y+s*N(),xx+jitter*2,h);
    g.addColorStop(0,tint(colors[(i+state.level)%colors.length],.8));g.addColorStop(1,'#10192100');
    polygon([[xx-9,y+s*N()+8],[xx+10,y+s*N()+8],[xx+22+jitter,h],[xx-31+jitter,h]],g);
  }
  ctx.restore();
  // Early dust is tiny and slow; reduced-motion uses a frozen frame.
  for(let i=0;i<20;i++){
    const dx=rand(i*187+3)*w;
    const dy=(rand(i*71+5)*h+(reduced.matches?0:time*.004*(i%3+1)))%h;
    circle(dx,dy,i%5===0?1.15:.55,'#f6dfa044');
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
  const {boardX:x,boardY:y,tile:s}=view,baseY=y+N()*s+22;
  LEVELS[state.level].exits.forEach((col,i)=>{
    const cx=x+(col+.5)*s,lit=trace.lit[i];
    line(cx,y+N()*s,cx,baseY,'#ae9162',Math.max(2.5,s*.042));
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
  const {boardX:x,boardY:y,tile:s}=view,cx=x+s*(currentLevel().entryCol+.5)+Math.sin(state.sunAngle)*s*.5,py=y-14;
  ctx.save();ctx.shadowColor='#f1c773';ctx.shadowBlur=trace.reached[currentLevel().entryCol]?20:10;
  circle(cx,py,Math.min(11,s*.2),'#d7aa5d','#f9e9b7',2);
  ctx.restore();
  for(let d=0;d<8;d++){const a=d*Math.PI/4;
    line(cx+Math.cos(a)*14,py+Math.sin(a)*14,cx+Math.cos(a)*18,py+Math.sin(a)*18,'#ceb17c',1.5);}
  if(trace.reached[currentLevel().entryCol]){
    ctx.save();ctx.shadowColor='#f7da8c';ctx.shadowBlur=17;
    line(cx,py+9,cx,y+8,'#fff1b5',Math.max(3,s*.075));ctx.restore();
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
  // A hand-etched sill beneath the reliquaries.
  const xx=view.boardX,yy=view.boardY+view.tile*N()+37;
  line(xx-13,yy,xx+view.tile*N()+13,yy,'#8c7857',1);
  for(let i=0;i<7;i++)circle(xx+i*(view.tile*N()/6),yy,1.5,'#c9ad77');
  lastFrame=time;
  if(!document.hidden)animation=requestAnimationFrame(render);
}
function wake(){
  if(animation)cancelAnimationFrame(animation);
  if(!document.hidden)animation=requestAnimationFrame(render);
}
function onTouchEnd(event){
  if(!press||press.id!==event.pointerId)return;
  const initial=press;press=null;
  try{canvas.releasePointerCapture(event.pointerId);}catch{}
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
  press={id:event.pointerId,x:event.clientX,y:event.clientY};
  try{canvas.setPointerCapture(event.pointerId);}catch{}
});
canvas.addEventListener('pointerup',onTouchEnd);
canvas.addEventListener('pointercancel',()=>{press=null;});
canvas.addEventListener('lostpointercapture',()=>{press=null;});
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
$('chaptersBtn').addEventListener('click',showChapters);
$('restartBtn').addEventListener('click',showRestart);
$('soundBtn').addEventListener('click',()=>{state.sound=!state.sound;updateCopy();save();if(state.sound)chime(570,'turn');});
$('modalClose').addEventListener('click',closeModal);
$('scrim').addEventListener('pointerdown',event=>{if(event.target===$('scrim'))closeModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('scrim').hidden)closeModal();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(animation)cancelAnimationFrame(animation);animation=0;save();}else wake();});
window.addEventListener('pagehide',save);
window.addEventListener('resize',()=>{measure();wake();});
if('ResizeObserver'in window)new ResizeObserver(()=>{measure();wake();}).observe(canvas);
createWorkshopMode({appName:'CANTICA — Песнь света',version:'2.0.0',cachePrefix:'cantica-glass-',storageNamespace:'pocket-works:cantica-glass',onReset:resetApp});
hydrate();
measure();wake();
if(state.solved)window.setTimeout(showVictory,120);
