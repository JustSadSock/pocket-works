/* FOG tactical atlas: zoomable canvas, honest miniature fog and hand-off privacy.
   Uses the original game canvas; never forks movement/combat rules. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const viewport=$('battleViewport'), canvas=$('canvas'), panel=$('infoPanel');
  if(!viewport||!canvas||!panel)return;
  const nav=document.createElement('aside');
  nav.id='fogAtlas';nav.setAttribute('aria-label','Навигация по карте');
  nav.innerHTML=`<div class="fog-atlas-actions">
    <button id="fogZoomOut" type="button" aria-label="Уменьшить карту" title="Уменьшить">−</button>
    <button id="fogZoomIn" type="button" aria-label="Увеличить карту" title="Увеличить">+</button>
    <button id="fogFindArmy" type="button" aria-label="К моей армии" title="К своей армии">⌖</button>
    <button id="fogToggleMini" type="button" aria-label="Показать или скрыть миникарту" aria-expanded="true" title="Миникарта">▦</button>
  </div><canvas id="fogMini" role="button" tabindex="0" aria-label="Миникарта: нажми, чтобы переместить камеру"></canvas>`;
  document.body.append(nav);
  const mini=$('fogMini'), ctx=mini.getContext('2d',{alpha:false});
  const zoomMin=.65,zoomMax=2.75;
  let zoom=1,frame=0,pinching=false,pinchDistance=0,pointers=new Map(),gestureMoved=false,miniVisible=true;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const inGame=()=>{
    const start=$('startPanel'),w=window;
    return start?.style.display==='none'&&Number.isInteger(w.ROWS)&&w.ROWS>0&&
      Number.isInteger(w.COLS)&&w.COLS>0&&canvas.width>0&&w.state?.fog;
  };
  const position=(row,col)=>{
    const w=window,rv=viewport.getBoundingClientRect(),rc=canvas.getBoundingClientRect();
    return {
      x:viewport.scrollLeft+rc.left-rv.left+((col+.5)/w.COLS)*rc.width,
      y:viewport.scrollTop+rc.top-rv.top+((row+.5)/w.ROWS)*rc.height
    };
  };
  function goTo(row,col){
    if(!inGame())return;
    const pos=position(clamp(row,0,window.ROWS-1),clamp(col,0,window.COLS-1));
    viewport.scrollTo({left:clamp(pos.x-viewport.clientWidth/2,0,viewport.scrollWidth-viewport.clientWidth),
      top:clamp(pos.y-viewport.clientHeight/2,0,viewport.scrollHeight-viewport.clientHeight),
      behavior:'auto'});
    scheduleMap();
  }
  window.FogCenterCamera=function(side){
    const own=window.units?.find(u=>u.owner===side&&u.mp>0)||
      window.units?.find(u=>u.owner===side)||
      window.buildings?.find(b=>b.owner===side&&b.type==='base')||
      {r:side===1?1:window.ROWS-2,c:side===1?1:window.COLS-2};
    goTo(own.r,own.c);
  };
  function setZoom(value,focusX=viewport.getBoundingClientRect().left+viewport.clientWidth/2,
                      focusY=viewport.getBoundingClientRect().top+viewport.clientHeight/2){
    const next=clamp(Math.round(value*100)/100,zoomMin,zoomMax);
    if(next===zoom||!canvas.width)return;
    const before=canvas.getBoundingClientRect();
    const x=clamp((focusX-before.left)/Math.max(1,before.width),0,1);
    const y=clamp((focusY-before.top)/Math.max(1,before.height),0,1);
    zoom=next;canvas.style.width=Math.round(canvas.width*zoom)+'px';
    canvas.style.height=Math.round(canvas.height*zoom)+'px';
    const after=canvas.getBoundingClientRect();
    viewport.scrollLeft+=after.left+x*after.width-focusX;
    viewport.scrollTop+=after.top+y*after.height-focusY;
    nav.dataset.zoom=zoom.toFixed(2);
    scheduleMap();
  }
  window.FogMapZoomTo=setZoom;
  function applyCanvasSize(){
    canvas.style.width=Math.round(canvas.width*zoom)+'px';
    canvas.style.height=Math.round(canvas.height*zoom)+'px';
    scheduleMap();
  }
  const resize=()=>{
    applyCanvasSize();
    document.documentElement.style.setProperty('--fog-hud-height',
      Math.round(panel.getBoundingClientRect().height)+'px');
  };
  window.addEventListener('resize',()=>requestAnimationFrame(resize));
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(panel);
  const ownSide=()=>window.FogCurrentMode?.().onlineGame?
    (window.FogPocketNet?.side||window.state?.currentPlayer):window.state?.currentPlayer;
  const tiles=['#45573f','#477083','#426849','#827452','#6a6a63'];
  function drawMap(){
    if(!inGame()){nav.hidden=true;return;}
    nav.hidden=false;if(!miniVisible)return;
    const w=window,rows=w.ROWS,cols=w.COLS,side=ownSide();
    const fog=w.state?.fog?.[side],seen=w.state?.seen?.[side];
    if(!fog||!seen)return;
    const cell=Math.min(144/cols,100/rows);
    const width=Math.max(1,Math.round(cols*cell)),height=Math.max(1,Math.round(rows*cell));
    if(mini.width!==cols*4||mini.height!==rows*4){mini.width=cols*4;mini.height=rows*4;}
    mini.style.width=width+'px';mini.style.height=height+'px';
    ctx.fillStyle='#111916';ctx.fillRect(0,0,mini.width,mini.height);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const known=seen?.[r]?.[c],hidden=fog?.[r]?.[c];
      ctx.fillStyle=!known?'#19231e':hidden?'#304036':tiles[w.map[r][c]]||tiles[0];
      ctx.fillRect(c*4,r*4,4,4);
    }
    const markers=new Map();
    for(const b of w.buildings||[]){
      if((b.owner===side||!fog?.[b.r]?.[b.c])&&!b.lastSeen)
        markers.set(b.r+','+b.c,b);
    }
    for(const b of Object.values(w.state.lastSeen?.[side]||{})){
      if(seen?.[b.r]?.[b.c]&&fog?.[b.r]?.[b.c]&&!markers.has(b.r+','+b.c))
        markers.set(b.r+','+b.c,b);
    }
    for(const b of markers.values()){
      ctx.fillStyle=b.owner===side?'#e0bd77':b.owner?'#9e5a55':'#d8d2b1';
      ctx.fillRect(b.c*4,b.r*4,4,4);
    }
    for(const u of w.units||[]){
      if(u.owner!==side&&fog?.[u.r]?.[u.c])continue;
      ctx.fillStyle=u.owner===side?'#ffecb7':'#e17d68';
      ctx.fillRect(u.c*4,u.r*4,3,3);
    }
    const vp=viewport.getBoundingClientRect(),r=canvas.getBoundingClientRect();
    const x=clamp((vp.left-r.left)/Math.max(1,r.width)*mini.width,0,mini.width);
    const y=clamp((vp.top-r.top)/Math.max(1,r.height)*mini.height,0,mini.height);
    const right=clamp((vp.right-r.left)/Math.max(1,r.width)*mini.width,0,mini.width);
    const bottom=clamp((vp.bottom-r.top)/Math.max(1,r.height)*mini.height,0,mini.height);
    ctx.strokeStyle='#fff5d7';ctx.lineWidth=1.5;
    ctx.strokeRect(x+.5,y+.5,Math.max(1,right-x-1),Math.max(1,bottom-y-1));
  }
  function scheduleMap(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{frame=0;drawMap();});
  }
  window.FogRefreshMap=scheduleMap;
  viewport.addEventListener('scroll',scheduleMap,{passive:true});
  const miniSeek=(clientX,clientY)=>{
    const r=mini.getBoundingClientRect();
    goTo(Math.floor(clamp((clientY-r.top)/r.height,0,.9999)*window.ROWS),
      Math.floor(clamp((clientX-r.left)/r.width,0,.9999)*window.COLS));
  };
  mini.addEventListener('click',e=>miniSeek(e.clientX,e.clientY));
  mini.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){
    e.preventDefault();const r=mini.getBoundingClientRect();miniSeek(r.left+r.width/2,r.top+r.height/2);
  }});
  $('fogZoomOut').addEventListener('click',()=>setZoom(zoom/1.25));
  $('fogZoomIn').addEventListener('click',()=>setZoom(zoom*1.25));
  $('fogFindArmy').addEventListener('click',()=>window.FogCenterCamera(ownSide()));
  $('fogToggleMini').addEventListener('click',()=>{
    miniVisible=!miniVisible;mini.hidden=!miniVisible;
    $('fogToggleMini').setAttribute('aria-expanded',String(miniVisible));
    if(miniVisible)scheduleMap();
  });
  // Pointer gestures keep the page stationary; the tactical map scrolls instead.
  viewport.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){
      const [a,b]=[...pointers.values()];pinching=true;
      pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);gestureMoved=true;
    }
  },{passive:true});
  window.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    const old=pointers.get(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
      const dx=e.clientX-old.x,dy=e.clientY-old.y;
      if(Math.abs(dx)+Math.abs(dy)>2){
        viewport.scrollLeft-=dx;viewport.scrollTop-=dy;gestureMoved=true;
      }
    }else if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      const distance=Math.hypot(a.x-b.x,a.y-b.y);
      const focusX=(a.x+b.x)/2,focusY=(a.y+b.y)/2;
      if(pinchDistance>1)setZoom(zoom*distance/pinchDistance,focusX,focusY);
      pinchDistance=distance;gestureMoved=true;
    }
  },{passive:true});
  const release=e=>{if(pointers.delete(e.pointerId)&&pointers.size===0){
    pinching=false;pinchDistance=0;
  }};
  window.addEventListener('pointerup',release,{passive:true});
  window.addEventListener('pointercancel',release,{passive:true});
  viewport.addEventListener('click',e=>{if(gestureMoved){
    e.stopImmediatePropagation();e.preventDefault();gestureMoved=false;
  }},true);
  viewport.addEventListener('dblclick',e=>{
    e.preventDefault();setZoom(zoom*1.4,e.clientX,e.clientY);
  });
  viewport.addEventListener('wheel',e=>{if(!e.ctrlKey)return;
    e.preventDefault();setZoom(zoom*(e.deltaY>0?.9:1.1),e.clientX,e.clientY);
  },{passive:false});
  // Opaque transfer screen BEFORE changing sides: no momentary opponent intel.
  const curtain=document.createElement('div');curtain.id='fogHandOff';
  curtain.setAttribute('role','dialog');curtain.setAttribute('aria-modal','true');
  curtain.setAttribute('aria-label','Передача хода');curtain.hidden=true;
  curtain.innerHTML=`<div class="fog-handoff-shield">
    <p class="fog-handoff-mark">FOG OF CONQUEST</p>
    <h2 id="fogNextSide">Игрок 2</h2>
    <p id="fogHandoffHint">Передай устройство следующему игроку</p>
    <button id="fogAcceptSide" type="button">Открыть карту</button>
  </div>`;
  document.body.append(curtain);
  const accept=$('fogAcceptSide');
  window.FogShowHandoff=side=>{
    if(window.FogCurrentMode?.().aiMode||window.FogCurrentMode?.().onlineGame)return;
    const lang=document.documentElement.lang;
    const t=lang==='en'?
      ['Player','Pass the device to the next player','Reveal map']:
      lang==='uk'?['Гравець','Передайте пристрій наступному гравцеві','Відкрити карту']:
        ['Игрок','Передай устройство следующему игроку','Открыть карту'];
    $('fogNextSide').textContent=t[0]+' '+side;
    $('fogHandoffHint').textContent=t[1];accept.textContent=t[2];
    curtain.hidden=false;accept.focus();
  };
  accept.addEventListener('click',()=>{
    curtain.hidden=true;window.FogCenterCamera(ownSide());
    $('endTurnBtn')?.focus();
  });
  // No Escape-to-reveal shortcut: accept explicitly before seeing private map.
  curtain.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();accept.focus();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!curtain.hidden){e.stopImmediatePropagation();accept.focus();}},true);
  // Focus-first main menu: rules remain accessible but are not the first screen.
  const rulesToggle=$('fogRulesToggle'),summary=$('summary');
  rulesToggle?.addEventListener('click',()=>{
    const open=summary.hidden;summary.hidden=!open;
    rulesToggle.setAttribute('aria-expanded',String(open));
    const lang=document.documentElement.lang;
    rulesToggle.textContent=lang==='en'?(open?'Hide rules':'Rules'):
      lang==='uk'?(open?'Сховати правила':'Правила'):(open?'Скрыть правила':'Правила');
  });
  if(window.matchMedia('(max-width:720px)').matches&&!panel.classList.contains('collapsed'))
    $('panelToggleBtn')?.click();
  resize();scheduleMap();
})();