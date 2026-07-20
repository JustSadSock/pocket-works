import { WORLD_WIDTH, WORLD_HEIGHT } from './engine.js';
import { liveryForDoctrine, schoolForDoctrine } from './heraldry.js';

const BUILD='5.10.0';
const FLAG=Symbol.for(`blazon.banner-system.${BUILD}`);
if(!globalThis[FLAG]){
  globalThis[FLAG]=true;
  const SCHOOLS=new Set(['imperial','civic','knightly','northern']);
  const wrap=document.querySelector('.battlefield-wrap');
  const screen=document.querySelector('#battleScreen');
  const canvas=document.createElement('canvas');
  canvas.className='standard-overlay';
  canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
  wrap?.append(canvas);
  const ctx=canvas.getContext('2d');

  let metrics={dpr:1,width:1,height:1,baseScale:1};
  let camera={x:WORLD_WIDTH/2,y:WORLD_HEIGHT/2,zoom:.93,targetX:WORLD_WIDTH/2,targetY:WORLD_HEIGHT/2,targetZoom:.93};
  let lastState=null;
  let lastFrame=performance.now();
  let animation=0;
  let disposed=false;

  function schoolOf(node){
    const svg=node?.matches?.('svg[data-school]')?node:node?.querySelector?.('svg[data-school]');
    const school=svg?.dataset.school;
    return SCHOOLS.has(school)?school:null;
  }

  function decorateStandard(node){
    if(!node)return;
    const school=schoolOf(node);if(!school)return;
    node.dataset.standardSchool=school;node.classList.add('has-heraldic-standard');
  }

  function refreshStandards(root=document){
    const menu=document.querySelector('.menu-standard');
    const menuSchool=schoolOf(document.querySelector('#menuHeraldry'));
    if(menu&&menuSchool){menu.dataset.standardSchool=menuSchool;menu.querySelector('.standard-cloth')?.setAttribute('data-standard-school',menuSchool);}
    root.querySelectorAll?.('.full-achievement,.reward-card-preview,.ending-standard,.battle-hud>div').forEach(decorateStandard);
  }

  function resize(){
    if(!wrap||!ctx)return;
    const rect=wrap.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
    const width=Math.max(1,Math.floor(rect.width*dpr)),height=Math.max(1,Math.floor(rect.height*dpr));
    if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
    metrics={dpr,width:rect.width,height:rect.height,baseScale:Math.min(rect.width/WORLD_WIDTH,rect.height/WORLD_HEIGHT)};
  }

  function updateCamera(state,dt){
    camera.targetX=WORLD_WIDTH/2;camera.targetY=WORLD_HEIGHT/2;camera.targetZoom=.93;
    if(state.firstContact){
      let count=0,sumX=0,sumY=0;
      for(const army of[state.player,state.enemy])for(const squad of army.infantry)for(const member of squad.members)if(member.state==='fighting'){count++;sumX+=member.x;sumY+=member.y;}
      camera.targetY=count?sumY/count:state.frontY;camera.targetX=count?sumX/count:WORLD_WIDTH/2;camera.targetZoom=1.08;
    }
    const playerCapture=state.player.banner.capture,enemyCapture=state.enemy.banner.capture;
    if(playerCapture>.2||enemyCapture>.2||state.player.brokenCount>=2||state.enemy.brokenCount>=2){camera.targetZoom=.98;camera.targetY=playerCapture>enemyCapture?state.player.banner.y-100:enemyCapture>playerCapture?state.enemy.banner.y+100:state.frontY;}
    const ease=1-Math.exp(-dt*2.4);camera.x+=(camera.targetX-camera.x)*ease;camera.y+=(camera.targetY-camera.y)*ease;camera.zoom+=(camera.targetZoom-camera.zoom)*ease;
    const divisor=Math.max(.001,metrics.baseScale*camera.zoom),visibleH=metrics.height/divisor;
    camera.y=Math.max(visibleH/2-15,Math.min(WORLD_HEIGHT-visibleH/2+15,camera.y));
  }

  function setWorldTransform(){
    const {dpr,width,height,baseScale}=metrics,scale=baseScale*camera.zoom,ox=width/2-camera.x*scale,oy=height/2-camera.y*scale;
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*ox,dpr*oy);
  }

  function pathForStandard(school,side,wave){
    const x=value=>value*side;ctx.beginPath();ctx.moveTo(0,-69);
    if(school==='imperial'){ctx.bezierCurveTo(x(28),-73+wave*.45,x(64),-70-wave*.2,x(85),-60);ctx.lineTo(x(84),-7);ctx.lineTo(x(69),-24);ctx.lineTo(x(55),-5);ctx.lineTo(x(41),-23);ctx.lineTo(x(27),-5);ctx.lineTo(x(13),-23);ctx.lineTo(0,-17);}
    else if(school==='civic'){ctx.bezierCurveTo(x(28),-71+wave*.35,x(61),-68-wave*.18,x(84),-61);ctx.lineTo(x(84),-8);ctx.lineTo(x(68),-13);ctx.lineTo(x(51),-8);ctx.lineTo(x(34),-13);ctx.lineTo(x(17),-8);ctx.lineTo(0,-17);}
    else if(school==='knightly'){ctx.bezierCurveTo(x(30),-73+wave*.5,x(67),-68-wave*.28,x(91),-57);ctx.lineTo(x(90),-7);ctx.lineTo(x(65),-27);ctx.lineTo(x(43),-7);ctx.lineTo(0,-17);}
    else{ctx.bezierCurveTo(x(35),-73+wave*.5,x(74),-63-wave*.22,x(101),-44);ctx.lineTo(x(65),-23);ctx.lineTo(x(31),-12);ctx.lineTo(0,-17);}
    ctx.closePath();
  }

  function mix(a,b,t){
    const parse=value=>{const raw=String(value||'#000').replace('#',''),full=raw.length===3?raw.split('').map(x=>x+x).join(''):raw.padEnd(6,'0').slice(0,6);return[parseInt(full.slice(0,2),16),parseInt(full.slice(2,4),16),parseInt(full.slice(4,6),16)];};
    const A=parse(a),B=parse(b);return`rgb(${A.map((value,index)=>Math.round(value+(B[index]-value)*t)).join(',')})`;
  }

  function coverLegacyFlag(side,top){ctx.fillStyle=top?'rgba(55,71,61,.98)':'rgba(49,65,55,.98)';ctx.beginPath();ctx.moveTo(0,-73);ctx.lineTo(side*104,-73);ctx.lineTo(side*104,0);ctx.lineTo(0,-12);ctx.closePath();ctx.fill();}

  function drawPole(livery,side,school){
    ctx.strokeStyle='#27160c';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,48);ctx.lineTo(0,-79);ctx.stroke();ctx.strokeStyle='#a5793b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-1,46);ctx.lineTo(-1,-78);ctx.stroke();ctx.strokeStyle='#40240f';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-3,-69);ctx.lineTo(side*(school==='northern'?44:74),-69);ctx.stroke();
    ctx.fillStyle=livery.metal;ctx.save();ctx.translate(0,-84);
    if(school==='imperial'){ctx.beginPath();for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4,r=i%2?5:10;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();}
    else if(school==='civic'){ctx.fillRect(-8,-5,16,11);ctx.clearRect(-4,-5,3,4);ctx.clearRect(2,-5,3,4);}
    else if(school==='knightly'){ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(7,7);ctx.lineTo(2,5);ctx.lineTo(3,14);ctx.lineTo(-3,14);ctx.lineTo(-2,5);ctx.lineTo(-7,7);ctx.closePath();ctx.fill();}
    else{ctx.beginPath();ctx.moveTo(-9,-4);ctx.lineTo(1,-8);ctx.lineTo(10,-2);ctx.lineTo(2,1);ctx.lineTo(8,8);ctx.lineTo(-2,5);ctx.lineTo(-9,10);ctx.lineTo(-5,1);ctx.closePath();ctx.fill();}
    ctx.restore();
  }

  function drawTextile(livery,side,wave){
    const school=livery.school;pathForStandard(school,side,wave);const gradient=ctx.createLinearGradient(0,-69,side*96,-8);gradient.addColorStop(0,livery.primary);gradient.addColorStop(.4,livery.primary);gradient.addColorStop(.68,mix(livery.primary,'#000000',.22));gradient.addColorStop(1,mix(livery.primary,'#000000',.4));ctx.fillStyle=gradient;ctx.fill();
    ctx.save();pathForStandard(school,side,wave);ctx.clip();const bands=school==='northern'?4:5;
    for(let i=0;i<bands;i++){const center=side*(13+i*16),fold=ctx.createLinearGradient(center-side*9,0,center+side*9,0);fold.addColorStop(0,'rgba(0,0,0,.2)');fold.addColorStop(.42,'rgba(255,238,187,.08)');fold.addColorStop(.62,'rgba(255,248,212,.18)');fold.addColorStop(1,'rgba(0,0,0,.23)');ctx.fillStyle=fold;ctx.fillRect(Math.min(center-side*10,center+side*10),-75,20,74);}
    ctx.globalAlpha=.22;ctx.strokeStyle='#f4e3b4';ctx.lineWidth=1;for(let y=-61;y<-10;y+=9){ctx.beginPath();ctx.moveTo(0,y);ctx.quadraticCurveTo(side*45,y-2+wave*.08,side*88,y+2);ctx.stroke();}ctx.restore();pathForStandard(school,side,wave);ctx.strokeStyle=livery.metal;ctx.lineWidth=2.7;ctx.stroke();
  }

  function drawOrdinary(livery,side){
    ctx.fillStyle=livery.metal;ctx.strokeStyle=livery.metal;
    if(livery.ordinary==='pale')ctx.fillRect(Math.min(side*54,side*33),-65,21,55);
    else if(livery.ordinary==='fess')ctx.fillRect(Math.min(side*82,0),-45,82,14);
    else if(livery.ordinary==='bend'){ctx.save();ctx.translate(side*45,-40);ctx.rotate(-side*.55);ctx.fillRect(-6,-39,12,78);ctx.restore();}
    else{ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(side*18,-14);ctx.lineTo(side*45,-50);ctx.lineTo(side*72,-14);ctx.stroke();}
  }

  function drawGlyph(id,x,y,size,color,detail){
    ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.strokeStyle=detail;ctx.lineWidth=Math.max(1.2,size*.08);ctx.lineJoin='round';ctx.lineCap='round';
    if(id==='lion'){ctx.beginPath();ctx.moveTo(-size*.15,size*.36);ctx.lineTo(-size*.27,size*.05);ctx.lineTo(-size*.12,-size*.14);ctx.lineTo(size*.03,-size*.08);ctx.lineTo(size*.13,-size*.34);ctx.lineTo(size*.33,-size*.24);ctx.lineTo(size*.25,-size*.02);ctx.lineTo(size*.4,size*.13);ctx.lineTo(size*.18,size*.13);ctx.lineTo(size*.08,size*.4);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(-size*.08,-size*.03);ctx.bezierCurveTo(-size*.45,-size*.18,-size*.43,-size*.48,-size*.18,-size*.41);ctx.stroke();}
    else if(id==='boar'){ctx.beginPath();ctx.ellipse(0,0,size*.39,size*.25,-.12,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(size*.25,-size*.12);ctx.lineTo(size*.5,-size*.24);ctx.lineTo(size*.43,size*.08);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(size*.37,size*.02);ctx.quadraticCurveTo(size*.49,size*.18,size*.56,size*.03);ctx.stroke();}
    else if(id==='tower'){ctx.fillRect(-size*.32,-size*.26,size*.64,size*.62);for(let i=-1;i<=1;i++)ctx.fillRect(i*size*.22-size*.08,-size*.42,size*.16,size*.19);ctx.fillStyle=detail;ctx.fillRect(-size*.08,size*.06,size*.16,size*.3);}
    else if(id==='stag'){ctx.beginPath();ctx.ellipse(-size*.05,size*.06,size*.29,size*.2,-.15,0,Math.PI*2);ctx.fill();ctx.fillRect(size*.13,-size*.16,size*.12,size*.31);ctx.beginPath();ctx.arc(size*.25,-size*.22,size*.13,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(size*.19,-size*.3);ctx.lineTo(size*.02,-size*.53);ctx.moveTo(size*.25,-size*.32);ctx.lineTo(size*.32,-size*.57);ctx.moveTo(size*.04,-size*.48);ctx.lineTo(-size*.08,-size*.55);ctx.moveTo(size*.31,-size*.5);ctx.lineTo(size*.45,-size*.54);ctx.stroke();}
    else{ctx.beginPath();ctx.arc(0,0,size*.26,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  function drawStandard(army,top,state){
    const doctrine=army.doctrine,livery=liveryForDoctrine(doctrine);livery.school=schoolForDoctrine(doctrine);const side=top?-1:1,wave=Math.sin(state.time*2.15+(top?1:4))*5;
    ctx.save();ctx.translate(army.banner.x,army.banner.y);coverLegacyFlag(side,top);drawPole(livery,side,livery.school);drawTextile(livery,side,wave);drawOrdinary(livery,side);drawGlyph(livery.main,side*46,-39,27,livery.emblem,livery.ink);ctx.restore();
  }

  function isActive(){return !disposed&&!document.hidden&&Boolean(screen?.classList.contains('is-active')&&ctx&&wrap);}
  function clear(){if(!ctx)return;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);}
  function stop(){if(animation){cancelAnimationFrame(animation);animation=0;}clear();}
  function ensureLoop(){if(!isActive()){stop();return;}if(animation)return;resize();lastFrame=performance.now();animation=requestAnimationFrame(frame);}

  function frame(now){
    animation=0;if(!isActive()){clear();return;}
    const state=globalThis.__blazonBattleState;clear();
    if(state){if(state!==lastState){lastState=state;camera={x:WORLD_WIDTH/2,y:WORLD_HEIGHT/2,zoom:.93,targetX:WORLD_WIDTH/2,targetY:WORLD_HEIGHT/2,targetZoom:.93};}const dt=Math.min(.08,Math.max(0,(now-lastFrame)/1000));updateCamera(state,dt);setWorldTransform();drawStandard(state.enemy,true,state);drawStandard(state.player,false,state);}
    lastFrame=now;animation=requestAnimationFrame(frame);
  }

  const observed=[document.querySelector('.app-shell'),...document.querySelectorAll('dialog')].filter(Boolean);
  const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||record.type==='attributes')){refreshStandards();ensureLoop();}});
  for(const root of observed)observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-school','open']});
  const onResize=()=>{if(isActive())resize();};
  const onVisibility=()=>ensureLoop();
  window.addEventListener('resize',onResize,{passive:true});document.addEventListener('visibilitychange',onVisibility);
  refreshStandards();ensureLoop();
  window.addEventListener('pagehide',()=>{disposed=true;stop();observer.disconnect();window.removeEventListener('resize',onResize);document.removeEventListener('visibilitychange',onVisibility);},{once:true});
}
