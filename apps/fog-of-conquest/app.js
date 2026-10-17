import {TERRAIN,UNITS,BUILDINGS,SIZES,createGame,transition,reach,project,aiTurn,isValidSave} from './engine.js';
import {PocketNet} from '../../shared/capabilities/net.js';
const $=id=>document.getElementById(id), canvas=$('map'),field=$('field'),ctx=canvas.getContext('2d',{alpha:false});
const KEY='pocket-works:fog-of-conquest:save-v1',PREF='pocket-works:fog-of-conquest:preferences';
let state=null,online=false,net=null,side=1,room=null,chosen=null,pendingRecruit=null,locked=false,toastId=0,frame=0;
let soundOn=true,difficulty=3,zoom=1,offX=0,offY=0,dirty=true,mini=false;
const tile=40,pointers=new Map(),gesture={moved:false,start:null,dist:0,oldZoom:1},toasts=['Туман отступает перед разведчиками.'];
const PAL=['#b1bb93','#6b9596','#638374','#b6ad82','#7b847b'];
const team=['','#48726b','#a34d3e'];
try{soundOn=JSON.parse(localStorage.getItem(PREF)||'{}').sound!==false;}catch{}
$('sound').textContent='Звук: '+(soundOn?'включён':'выключен');
const saved=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return isValidSave(x)?x:null;}catch{return null;}};
$('continueGame').disabled=!saved();
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastId);toastId=setTimeout(()=>t.classList.remove('show'),2100);}
function show(id){$(id).hidden=false;}function hide(id){$(id).hidden=true;}
let audio=null,voices=0;
function noiseHit(type='select'){
 if(!soundOn||voices>3||document.hidden)return;
 try{
   const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
   audio ||=new C();if(audio.state==='suspended')audio.resume().catch(()=>{});
   const n=type==='attack'?.14:type==='move'?.09:type==='capture'?.24:.055;
   const count=type==='attack'?2:1;voices++;
   for(let i=0;i<count;i++){
     const duration=n*(1+i*.2),size=Math.max(1,Math.floor(audio.sampleRate*duration));
     const buffer=audio.createBuffer(1,size,audio.sampleRate),out=buffer.getChannelData(0);
     for(let k=0;k<size;k++){const t=k/size;out[k]=(Math.random()*2-1)*Math.pow(1-t,2)*(type==='move'?.2:.5);}
     const source=audio.createBufferSource();source.buffer=buffer;
     const filter=audio.createBiquadFilter();filter.type=type==='move'?'lowpass':'bandpass';filter.frequency.value=type==='attack'?1800:type==='capture'?780:490;
     const gain=audio.createGain();gain.gain.setValueAtTime(.001,audio.currentTime);gain.gain.linearRampToValueAtTime(type==='attack'?.095:.065,audio.currentTime+.008);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
     source.connect(filter).connect(gain).connect(audio.destination);source.start(audio.currentTime+i*.04);source.stop(audio.currentTime+duration+i*.04);
   }
   setTimeout(()=>voices=Math.max(0,voices-1),350);
 }catch{}
}
function store(){if(online||!state)return;try{localStorage.setItem(KEY,JSON.stringify(state));$('continueGame').disabled=false;}catch{toast('Хранилище недоступно — сохранение не удалось.');}}
function newSolo(){if(net){net.close();net=null;room=null;}difficulty=+$('difficulty').value||3;state=createGame((Date.now()^Math.floor(Math.random()*0xffffffff))>>>0,$('size').value);online=false;side=1;chosen=null;pendingRecruit=null;hide('start');hide('menu');hide('confirm');hide('finish');hide('online');locked=false;centerOnBase();store();update();}
function continueSolo(){const x=saved();if(!x){toast('Сохранение повреждено.');return;}state=x;online=false;side=1;chosen=null;pendingRecruit=null;hide('start');hide('menu');hide('confirm');hide('finish');centerOnBase();update();}
function gameView(){return state?online?state:project(state,side):null;}
function myTurn(){return !!(state&&state.phase==='battle'&&state.current===side&&!locked);}
function applyAction(action){
 if(!myTurn()){toast(online?'Ожидание хода противника.':'Подожди завершения хода.');return;}
 if(online){try{net.sendGame({type:'act',action,revision:state.revision});locked=true;update();setTimeout(()=>{if(locked){locked=false;update();}},6500);}catch(e){locked=false;toast('Связь потеряна. Ход не отправлен.');}return;}
 const result=transition(state,side,action);
 if(result.error){toast(result.error);noiseHit('invalid');return;}
 state=result.state;chosen=action.type==='end'?null:chosen;pendingRecruit=null;noiseHit(action.type==='attack'?'attack':action.type==='move'?'move':'capture');
 if(action.type==='end'&&state.phase==='battle'){locked=true;update();setTimeout(()=>{try{state=aiTurn(state,difficulty);store();}catch(e){console.error(e);toast('Ошибка ИИ. Попробуй завершить ход ещё раз.');}finally{locked=false;centerOnBase(false);update();}},220);}
 else{store();update();}
}
function finishCheck(){if(!state||state.phase!=='finished')return;hide('menu');hide('online');$('finishTitle').textContent=state.winner===3?'Перемирие':state.winner===side?'Победа за вами':'Цитадель потеряна';$('finishText').textContent='Кампания завершилась на '+state.round+' ходу. '+(state.winner===side?'Ваши знамёна остались над крепостью.':'История этой войны закончилась.');show('finish');}
function update(){
 const s=gameView();if(!s)return;
 const localSide=side,playing=s.phase==='battle';const my=playing&&s.current===localSide&&!locked;
 const ownGold=s.gold?.[localSide]??0;
 const income=s.buildings.filter(b=>b.owner===localSide).reduce((n,b)=>n+(b.type==='mill'?b.level*BUILDINGS.mill.gen:BUILDINGS[b.type].gen),0);
 $('season').textContent='ХОД '+s.round+' · '+(s.current===1?'СЕВЕР':'ЮГ');
 $('status').textContent='Золото '+ownGold+' · Доход +'+income;
 $('sideBadge').textContent=online?'СЕТЕВАЯ · '+(side===1?'СЕВЕР':'ЮГ'):'СЕВЕР · ПРОТИВ ИИ';
 $('endTurn').disabled=!my;$('endTurn').textContent=my?'ЗАВЕРШИТЬ ХОД →':playing?'ОЖИДАНИЕ ХОДА':'ВОЙНА ОКОНЧЕНА';
 $('log').textContent=s.history?.[0]||'Выберите отряд.';
 const entity=chosen?.unit?s.units.find(u=>u.id===chosen.unit):chosen?.building?s.buildings.find(b=>b.id===chosen.building):null;
 if(!entity){chosen=null;pendingRecruit=null;}
 const isUnit=!!chosen?.unit&&entity;
 $('unitIcon').textContent=entity?(isUnit?UNITS[entity.type].glyph:BUILDINGS[entity.type].glyph):'✣';
 $('unitTitle').textContent=entity?(isUnit?UNITS[entity.type].name:BUILDINGS[entity.type].name):'Выберите отряд';
 $('unitHint').textContent=entity?(isUnit?'Здоровье '+entity.hp+'/'+UNITS[entity.type].hp+' · Шаги '+entity.mp+' · Дальность '+UNITS[entity.type].range:
 'Прочность '+entity.hp+'/'+BUILDINGS[entity.type].hp+' · '+(entity.owner===0?'Нейтральная':entity.owner===side?'Под вашим контролем':'Вражеская')):'Нажмите на свой отряд или здание';
 $('clear').style.visibility=entity?'visible':'hidden';
 const actions=$('actions');actions.textContent='';
 const make=(label,on,disabled=false)=>{const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.addEventListener('click',on);actions.append(b);return b;};
 if(isUnit){
   const u=entity;
   make('↗ Перемещение',()=>{pendingRecruit=null;toast('Коснитесь доступной клетки.');},!my||u.moved);
   if(UNITS[u.type].heal)make('✧ Лечение',()=>toast('Выберите раненого союзника рядом.'),!my||u.acted);
   else make('⚔ Атака',()=>toast('Коснитесь противника в радиусе атаки.'),!my||u.acted);
   make('↺ К другим войскам',()=>selectNext(),false);
 }else if(entity?.owner===side){
   const b=entity;
   for(const t of BUILDINGS[b.type].spawn)make(UNITS[t].glyph+' '+UNITS[t].name+' · '+UNITS[t].cost+'◈',()=>{
     pendingRecruit={building:b.id,unitType:t};toast('Выберите соседнюю свободную клетку.');update();
   },!my||ownGold<UNITS[t].cost||b.trainedTurn===s.round*2+side);
   if(b.type==='mill')make('↑ Улучшить · 6◈',()=>applyAction({type:'upgrade',building:b.id}),!my||b.level>=2||ownGold<6);
   if(!BUILDINGS[b.type].spawn.length&&b.type!=='mill')actions.textContent='Форт укрепляет оборону гарнизона.';
 }else actions.textContent=entity?'Захватите постройку, войдя на её клетку.':'Разведайте местность и найдите чужие укрепления.';
 if(pendingRecruit)for(const btn of actions.querySelectorAll('button'))if(btn.textContent.includes(UNITS[pendingRecruit.unitType].name))btn.classList.add('active');
 dirty=true;draw();finishCheck();
}
function selectNext(){const s=gameView();if(!s)return;const mine=s.units.filter(u=>u.owner===side);const i=mine.findIndex(u=>u.id===chosen?.unit);if(mine.length){chosen={unit:mine[(i+1)%mine.length].id};pendingRecruit=null;centerAt(mine[(i+1)%mine.length].r,mine[(i+1)%mine.length].c);update();}}
function centerAt(r,c){const w=field.clientWidth,h=field.clientHeight;offX=w/2-(c+.5)*tile*zoom;offY=h/2-(r+.5)*tile*zoom;clampPan();draw();}
function centerOnBase(animate=true){const s=gameView()||state;if(!s)return;const base=s.buildings.find(b=>b.type==='base'&&b.owner===side)||s.units.find(u=>u.owner===side);zoom=window.innerWidth<750?.85:Math.min(1.25,Math.min(field.clientWidth/(s.w*tile),field.clientHeight/(s.h*tile)));zoom=Math.max(.67,zoom);if(base)centerAt(base.r+1,base.c+1);}
function clampPan(){const s=gameView();if(!s)return;const w=field.clientWidth,h=field.clientHeight,sw=s.w*tile*zoom,sh=s.h*tile*zoom;offX=Math.min(w-45,Math.max(45-sw,offX));offY=Math.min(h-45,Math.max(45-sh,offY));}
function fitCanvas(){const r=field.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);if(r.width<1||r.height<1)return;const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}draw();}
function stamp(seed,r,c,k=0){let n=(seed^Math.imul(r+59,4027)^Math.imul(c+31,7919)^Math.imul(k+1,104729))>>>0;n^=n>>>16;n=Math.imul(n,2246822519);return (n>>>0)/4294967296;}
function draw(){
 if(!state)return;const s=gameView();if(!s)return;
 const dpr=Math.min(2,window.devicePixelRatio||1),w=field.clientWidth,h=field.clientHeight;
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#4a5b4f';ctx.fillRect(0,0,w,h);
 ctx.save();ctx.translate(offX,offY);ctx.scale(zoom,zoom);
 const x0=Math.max(0,Math.floor(-offX/(tile*zoom))-1),x1=Math.min(s.w,Math.ceil((w-offX)/(tile*zoom))+1);
 const y0=Math.max(0,Math.floor(-offY/(tile*zoom))-1),y1=Math.min(s.h,Math.ceil((h-offY)/(tile*zoom))+1);
 const fog=s.visible||[];
 const ranges=chosen?.unit&&myTurn()?reach({...s,map:s.map.map(row=>row.map(x=>x==null?0:x))},s.units.find(u=>u.id===chosen.unit)):null;
 for(let r=y0;r<y1;r++)for(let c=x0;c<x1;c++){
   const t=s.map[r][c],x=c*tile,y=r*tile,n=stamp(s.seed,r,c);
   if(t===null){ctx.fillStyle='#29382f';ctx.fillRect(x,y,tile,tile);ctx.fillStyle='#3b4a3e';if(n>.43){ctx.beginPath();ctx.ellipse(x+20,y+20,19,8,n*3,0,Math.PI*2);ctx.fill();}continue;}
   ctx.fillStyle=PAL[t];ctx.fillRect(x,y,tile,tile);
   ctx.fillStyle='#f8ecd1';ctx.globalAlpha=.07+stamp(s.seed,r,c,2)*.09;ctx.fillRect(x+1,y+1,tile-2,tile-2);ctx.globalAlpha=1;
   ctx.strokeStyle='#263b30';ctx.globalAlpha=.18;ctx.strokeRect(x+.6,y+.6,tile-.8,tile-.8);ctx.globalAlpha=1;
   if(t===0){ctx.strokeStyle='#f6ebcf';ctx.lineWidth=.85;ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(x+6+n*8,y+15);ctx.lineTo(x+14+n*8,y+12);ctx.moveTo(x+21,y+30);ctx.lineTo(x+30,y+29);ctx.stroke();ctx.globalAlpha=1;}
   if(t===1){ctx.strokeStyle='#d8e4d4';ctx.lineWidth=1;ctx.globalAlpha=.5;for(let i=0;i<2;i++){ctx.beginPath();ctx.moveTo(x+4+i*7,y+12+i*12);ctx.quadraticCurveTo(x+20,y+5+i*12,x+34,y+13+i*12);ctx.stroke();}ctx.globalAlpha=1;}
   if(t===2){for(let i=0;i<3;i++){const a=x+8+i*11+(stamp(s.seed,r,c,i+3)-.5)*6,b=y+15+(i%2)*12;ctx.fillStyle=i%2?'#395e50':'#456952';ctx.beginPath();ctx.moveTo(a,b-12);ctx.lineTo(a-8,b+4);ctx.lineTo(a+8,b+4);ctx.closePath();ctx.fill();ctx.strokeStyle='#d6cba4';ctx.lineWidth=.65;ctx.stroke();}}
   if(t===3){ctx.strokeStyle='#756f59';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+3,y+30);ctx.lineTo(x+14,y+11);ctx.lineTo(x+23,y+23);ctx.lineTo(x+29,y+16);ctx.lineTo(x+38,y+31);ctx.stroke();ctx.strokeStyle='#f5e8c9';ctx.lineWidth=.8;ctx.stroke();}
   if(t===4){ctx.fillStyle='#56685f';ctx.beginPath();ctx.moveTo(x+2,y+35);ctx.lineTo(x+15,y+3);ctx.lineTo(x+24,y+19);ctx.lineTo(x+31,y+8);ctx.lineTo(x+39,y+36);ctx.closePath();ctx.fill();ctx.strokeStyle='#d5d5bd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+10,y+17);ctx.lineTo(x+15,y+3);ctx.lineTo(x+20,y+14);ctx.stroke();}
   if(fog[r]&&!fog[r][c]){ctx.fillStyle='rgba(28,38,32,.54)';ctx.fillRect(x,y,tile,tile);}
   if(ranges&&ranges[r+','+c]!=null&&!s.units.some(u=>u.r===r&&u.c===c)){
     ctx.fillStyle='#f6d89338';ctx.fillRect(x+2,y+2,tile-4,tile-4);ctx.strokeStyle='#d6c17b';ctx.strokeRect(x+3,y+3,tile-6,tile-6);
   }
 }
 for(const b of s.buildings){if(b.r<y0||b.r>=y1||b.c<x0||b.c>=x1)continue;
   const x=b.c*tile+20,y=b.r*tile+20,col=team[b.owner]||'#bcaa83';
   ctx.save();ctx.translate(x,y);ctx.fillStyle='#1f302a69';ctx.beginPath();ctx.ellipse(1,13,15,5,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#d7c4a1';ctx.strokeStyle='#38443a';ctx.lineWidth=1.6;
   if(b.type==='base'||b.type==='fort'){ctx.fillRect(-11,-8,22,18);ctx.strokeRect(-11,-8,22,18);for(let z=-11;z<=5;z+=8){ctx.fillRect(z,-14,7,6);ctx.strokeRect(z,-14,7,6);}ctx.fillStyle='#36443b';ctx.fillRect(-3,2,6,8);}
   else if(b.type==='mill'){ctx.fillRect(-7,-7,14,18);ctx.strokeRect(-7,-7,14,18);ctx.fillStyle='#786b51';ctx.beginPath();ctx.moveTo(-10,-8);ctx.lineTo(0,-17);ctx.lineTo(10,-8);ctx.fill();ctx.stroke();ctx.strokeStyle='#f3e1b4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-13,-8);ctx.lineTo(13,9);ctx.moveTo(13,-8);ctx.lineTo(-13,9);ctx.stroke();}
   else{ctx.fillRect(-12,-4,24,16);ctx.strokeRect(-12,-4,24,16);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(-14,-6);ctx.lineTo(0,-20);ctx.lineTo(14,-6);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#f5e3b9';ctx.font='15px Georgia';ctx.textAlign='center';ctx.fillText(BUILDINGS[b.type].glyph,0,7);}
   ctx.fillStyle=col;ctx.fillRect(10,-15,3,15);ctx.beginPath();ctx.moveTo(13,-15);ctx.lineTo(23,-11);ctx.lineTo(13,-5);ctx.fill();
   if(chosen?.building===b.id){ctx.strokeStyle='#f6dd8a';ctx.lineWidth=2.5;ctx.strokeRect(-18,-23,36,43);}
   ctx.restore();
 }
 for(const u of s.units){if(u.r<y0||u.r>=y1||u.c<x0||u.c>=x1)continue;
   const x=u.c*tile+20,y=u.r*tile+19,color=team[u.owner];ctx.save();ctx.translate(x,y);
   ctx.fillStyle='#1c2c2570';ctx.beginPath();ctx.ellipse(0,14,13,5,0,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#d9c59a';ctx.strokeStyle='#283b34';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,1,13,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(-11,-10);ctx.lineTo(11,-10);ctx.lineTo(9,5);ctx.lineTo(0,12);ctx.lineTo(-9,5);ctx.closePath();ctx.fill();ctx.stroke();
   ctx.fillStyle='#f7e4bb';ctx.font='bold 19px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(UNITS[u.type].glyph,0,-1);
   if(u.owner===side){ctx.fillStyle='#f9e7a7';ctx.beginPath();ctx.arc(12,-11,3,0,Math.PI*2);ctx.fill();}
   if(chosen?.unit===u.id){ctx.strokeStyle='#f5e3a3';ctx.lineWidth=2.6;ctx.setLineDash([3,3]);ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
   ctx.fillStyle='#253e31';ctx.fillRect(-12,15,24,4);ctx.fillStyle=u.owner===1?'#6ba19a':'#c97060';ctx.fillRect(-12,15,24*Math.max(0,u.hp)/UNITS[u.type].hp,4);ctx.restore();
 }
 ctx.restore();
 // Lower-right war-room survey map uses only information this commander has explored.
 if(w>490&&h>280){const mw=116,mh=mw*s.h/s.w,mx=w-mw-12,my=h-mh-14;
   ctx.fillStyle='#213a32e5';ctx.fillRect(mx-4,my-4,mw+8,mh+8);
   for(let r=0;r<s.h;r++)for(let c=0;c<s.w;c++){ctx.fillStyle=s.map[r][c]===null?'#27382e':PAL[s.map[r][c]];ctx.fillRect(mx+c*mw/s.w,my+r*mh/s.h,mw/s.w+.4,mh/s.h+.4);}
   for(const b of s.buildings){ctx.fillStyle=team[b.owner]||'#ebe0b8';ctx.fillRect(mx+b.c*mw/s.w,my+b.r*mh/s.h,3,3);}
   ctx.strokeStyle='#f3d99c';ctx.lineWidth=1;ctx.strokeRect(mx-offX/zoom/tile*mw/s.w,my-offY/zoom/tile*mh/s.h,w/zoom/tile*mw/s.w,h/zoom/tile*mh/s.h);
 }
}
function tapMap(clientX,clientY){
 const rect=canvas.getBoundingClientRect(),c=Math.floor((clientX-rect.left-offX)/(tile*zoom)),r=Math.floor((clientY-rect.top-offY)/(tile*zoom)),s=gameView();
 if(!s||r<0||c<0||r>=s.h||c>=s.w)return;
 const unit=s.units.find(u=>u.r===r&&u.c===c),building=s.buildings.find(b=>b.r===r&&b.c===c);
 if(pendingRecruit){const a={type:'recruit',...pendingRecruit,r,c};applyAction(a);return;}
 if(unit?.owner===side){chosen={unit:unit.id};pendingRecruit=null;noiseHit();update();return;}
 if(chosen?.unit&&myTurn()){const origin=s.units.find(u=>u.id===chosen.unit);
   if(origin&&origin.owner===side){
     if(unit?.owner!==side&&unit || (building?.owner!==side&&building?.owner!==0&&building&&origin.r!==r)){
       applyAction({type:'attack',unit:origin.id,r,c});return;
     }
     if(!unit&&(origin.r!==r||origin.c!==c)){applyAction({type:'move',unit:origin.id,r,c});return;}
   }
 }
 if(building){chosen={building:building.id};pendingRecruit=null;noiseHit();update();return;}
 if(!unit){chosen=null;update();}else toast('Разведайте позицию или выберите свой отряд.');
}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture.start={x:e.clientX,y:e.clientY,ox:offX,oy:offY};gesture.moved=false;if(pointers.size===2){const a=[...pointers.values()];gesture.dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);gesture.oldZoom=zoom;}});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;const p=pointers.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;
 if(pointers.size===2){const a=[...pointers.values()],dist=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoom=Math.max(.45,Math.min(2.4,gesture.oldZoom*dist/Math.max(1,gesture.dist)));gesture.moved=true;clampPan();draw();}
 else if(gesture.start){const dx=e.clientX-gesture.start.x,dy=e.clientY-gesture.start.y;if(Math.hypot(dx,dy)>8)gesture.moved=true;if(gesture.moved){offX=gesture.start.ox+dx;offY=gesture.start.oy+dy;clampPan();draw();}}
});
canvas.addEventListener('pointerup',e=>{if(!pointers.has(e.pointerId))return;const isTap=!gesture.moved&&pointers.size===1;const point={x:e.clientX,y:e.clientY};pointers.delete(e.pointerId);gesture.start=null;if(isTap)tapMap(point.x,point.y);});
canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);gesture.start=null;});
function changeZoom(k){const cx=field.clientWidth/2,cy=field.clientHeight/2,old=zoom;zoom=Math.max(.45,Math.min(2.4,zoom*k));offX=cx-(cx-offX)*zoom/old;offY=cy-(cy-offY)*zoom/old;clampPan();draw();}
canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?1.1:.9);},{passive:false});
canvas.addEventListener('keydown',e=>{if(e.key==='ArrowUp')offY+=25;if(e.key==='ArrowDown')offY-=25;if(e.key==='ArrowLeft')offX+=25;if(e.key==='ArrowRight')offX-=25;if(e.key==='+'||e.key==='=')changeZoom(1.15);if(e.key==='-')changeZoom(.85);clampPan();draw();});
$('zoomIn').onclick=()=>changeZoom(1.22);$('zoomOut').onclick=()=>changeZoom(.82);$('focus').onclick=()=>centerOnBase();
$('clear').onclick=()=>{chosen=null;pendingRecruit=null;update();};
$('endTurn').onclick=()=>applyAction({type:'end'});
$('newGame').onclick=newSolo;$('continueGame').onclick=continueSolo;
$('menuBtn').onclick=()=>show('menu');$('resume').onclick=()=>hide('menu');
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent='Звук: '+(soundOn?'включён':'выключен');try{localStorage.setItem(PREF,JSON.stringify({sound:soundOn}));}catch{}};
$('save').onclick=()=>{if(online){toast('Сетевая партия хранится в PocketNet.');}else{store();toast('Поход сохранён.');}};
$('newConfirm').onclick=()=>{hide('menu');show('confirm');};
$('confirmNo').onclick=()=>hide('confirm');$('confirmYes').onclick=()=>{if(online){net?.close();net=null;}newSolo();};
$('finishNew').onclick=()=>{if(online){net?.close();net=null;online=false;}newSolo();};
$('onlineBtn').onclick=()=>{hide('start');show('online');};
$('onlineClose').onclick=()=>{hide('online');if(!state){net?.close();net=null;room=null;online=false;show('start');}else update();};
async function connectOnline(){
 try{if(!net||net.closed){net=new PocketNet({serverUrl:location.origin+'/pocketnet',name:$('nickname').value.trim().slice(0,24)||'Полководец',storage:localStorage});
  net.on('connected',()=>{networkStatus('Связь установлена.');});
  net.on('disconnected',()=>{locked=true;networkStatus('Соединение потеряно. PocketNet переподключается…');if(state)update();});
  net.on('error',e=>networkStatus('Ошибка сети: '+String(e?.message||e)));
  net.on('room_joined',message=>{room=message;online=true;syncOnline(message.state);});
  net.on('presence',message=>{if(room){room.players=message.players;updateLobby();}});
  net.on('game_event',message=>{if(message.event?.type==='state')syncOnline(message.event.payload);
    else if(message.event?.type==='notice'){locked=false;toast(typeof message.event.payload==='string'?message.event.payload:'Приказ не принят.');update();}});
  net.on('room_closed',()=>{room=null;state=null;online=false;locked=false;networkStatus('Комната закрыта.');});
  net.on('room_kicked',()=>{room=null;state=null;online=false;locked=false;networkStatus('Вы исключены из комнаты.');});
  net.on('error',m=>{if(m?.code)networkStatus('Сетевая ошибка: '+m.code);});}
 if(net.socket?.readyState!==1)await net.connect();return true;
 }catch(e){networkStatus('Не удалось подключиться к PocketNet: '+(e?.message||e));return false;}
}
function networkStatus(t){$('netStatus').textContent=t;}
function syncOnline(view){
 if(!view||typeof view!=='object')return;
 if(view.game){const wasLobby=!state;state=view.game;side=view.side||1;online=true;locked=false;hide('start');hide('online');hide('finish');hide('menu');if(wasLobby)centerOnBase();update();}
 else if(view.phase==='lobby'){state=null;locked=false;room={...(room||{}),state:view};show('online');updateLobby();}
}
function updateLobby(){
 if(!room)return;const code=(room.roomId||'').slice(0,8).toUpperCase();
 $('roomDetails').hidden=false;$('roomText').textContent=code||'—';
 const players=room.players||[];
 const host=room.state?.host===room.state?.viewerId;
 $('startRoom').hidden=!(host&&players.length===2);
 networkStatus(players.length===1?'Ожидание второго игрока · 1/2':'Оба игрока готовы · 2/2');
}
$('createRoom').onclick=async()=>{
 networkStatus('Подключение…');$('createRoom').disabled=true;try{
 if(!await connectOnline())return;
 if(net.roomId){net.roomId=null;net.persist();}
 net.createRoom('fog-of-conquest',{});
 }catch(e){networkStatus('Не удалось создать комнату: '+String(e.message||e));}finally{$('createRoom').disabled=false;}
};
$('joinRoom').onclick=async()=>{
 let code=$('roomCode').value.trim();if(!code){networkStatus('Введите код комнаты.');return;}
 networkStatus('Подключение…');$('joinRoom').disabled=true;try{
 if(!await connectOnline())return;
 net.joinRoom(code);
 }catch(e){networkStatus('Не удалось войти: '+String(e.message||e));}finally{$('joinRoom').disabled=false;}
};
$('startRoom').onclick=()=>{try{net.sendGame({type:'start',size:$('size').value});networkStatus('Формируем карту…');}catch{networkStatus('Нет связи. Повторите попытку.');}};
$('copyRoom').onclick=async()=>{if(!room?.roomId)return;const url=new URL(location.href);url.searchParams.set('room',room.roomId.slice(0,8).toUpperCase());try{await navigator.clipboard.writeText(url.toString());toast('Ссылка приглашения скопирована.');}catch{toast('Скопируйте код комнаты: '+room.roomId.slice(0,8).toUpperCase());}};
window.addEventListener('resize',()=>{fitCanvas();clampPan();draw();});if('ResizeObserver'in window)new ResizeObserver(()=>{fitCanvas();clampPan();draw();}).observe(field);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state&&!online)store();else draw();});
window.addEventListener('pagehide',()=>{if(!online)store();});
const invite=new URLSearchParams(location.search).get('room');if(invite){$('roomCode').value=invite.slice(0,40);hide('start');show('online');networkStatus('Введите имя и присоединитесь к партии.');}
fitCanvas();
