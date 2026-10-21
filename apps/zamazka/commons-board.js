// Optimistic strokes render immediately; only tiny vector deltas cross PocketNet.
export const COMMONS_SIZE={width:960,height:600};
export const COMMONS_COLORS=['#3d3028','#97594b','#c09048','#4b7466','#5579a5','#9b6196','#e9dec6','#d88449'];
export function boardPacket({k,q,c,s,p,revision}){
 if(!/^[a-zA-Z0-9_-]{1,20}$/.test(k)||!Number.isInteger(q)||q<0||q>9999)return false;
 if(!/^#[0-9a-f]{6}$/i.test(c)||!Number.isInteger(s)||s<2||s>36||!Number.isInteger(revision)||revision<0)return false;
 return Array.isArray(p)&&p.length>0&&p.length<=20&&p.every(point=>Array.isArray(point)&&point.length===2&&Number.isInteger(point[0])&&Number.isInteger(point[1])&&point[0]>=0&&point[0]<=960&&point[1]>=0&&point[1]<=600);
}
export function paintBoardDelta(canvas,packet){
 if(!canvas||!boardPacket({...packet,revision:packet.revision??0}))return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const p=packet.p;
 ctx.strokeStyle=packet.c;ctx.fillStyle=packet.c;ctx.lineWidth=packet.s;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.beginPath();ctx.moveTo(...p[0]);
 if(p.length===1){ctx.arc(p[0][0],p[0][1],packet.s/2,0,Math.PI*2);ctx.fill();return}
 for(let i=1;i<p.length;i++)ctx.lineTo(...p[i]);ctx.stroke();
}
export function createCommonsBoard(host,{send,onError,canClear,snapshot}){
 const canvas=host.querySelector('canvas'),palette=host.querySelector('.commons-palette'),size=host.querySelector('#commonsSize');
 let revision=0,pointer=null,active=null,last=null,pending=[],color=COMMONS_COLORS[0],weight=9,timer=null;
 let strokeNumber=0,seq=0,disposed=false,full=false;
 const point=event=>{
   const rect=canvas.getBoundingClientRect();
   // Map the actual canvas bitmap, not a letterboxed object-fit frame.
   // Account for CSS borders if a future theme adds them.
   const style=getComputedStyle(canvas);
   const left=Number.parseFloat(style.borderLeftWidth)||0,top=Number.parseFloat(style.borderTopWidth)||0;
   const right=Number.parseFloat(style.borderRightWidth)||0,bottom=Number.parseFloat(style.borderBottomWidth)||0;
   const width=Math.max(1,rect.width-left-right),height=Math.max(1,rect.height-top-bottom);
   return [Math.max(0,Math.min(COMMONS_SIZE.width,Math.round((event.clientX-rect.left-left)*COMMONS_SIZE.width/width))),
     Math.max(0,Math.min(COMMONS_SIZE.height,Math.round((event.clientY-rect.top-top)*COMMONS_SIZE.height/height)))];
 };
 const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null}};
 function flush(){
   clearTimer();
   if(!active||!pending.length||full)return;
   const chunk=pending.splice(0,18);
   const p=last?[last,...chunk]:chunk;
   const packet={type:'board_delta',k:active,q:seq++,c:color,s:weight,p,revision};
   last=chunk.at(-1);
   if(boardPacket(packet)){try{send(packet)}catch{onError('Нет связи. Проверь подключение к комнате.')}}
   if(pending.length)timer=setTimeout(flush,42);
 }
 const schedule=()=>{if(timer===null)timer=setTimeout(flush,42)};
 function reset(board){
   if(!board||!Number.isInteger(board.revision)||!Array.isArray(board.segments))return;
   revision=board.revision;pointer=null;active=null;last=null;pending=[];full=board.segments.length>=1200;clearTimer();
   canvas.getContext('2d')?.clearRect(0,0,960,600);
   for(const packet of board.segments)paintBoardDelta(canvas,{...packet,revision});
 }
 function accept(packet){
   if(!packet||packet.revision!==revision||!boardPacket(packet))return;
   paintBoardDelta(canvas,packet);
 }
 function down(event){
   if(disposed||pointer!==null||event.button>0)return;
   if(full){onError('Общий холст заполнен. Старые мазки сохранены; ведущий может очистить холст.');return;}
   event.preventDefault();pointer=event.pointerId;try{canvas.setPointerCapture(pointer)}catch{}
   active='s'+Date.now().toString(36).slice(-7)+(strokeNumber++).toString(36);
   seq=0;last=null;pending=[];const pt=point(event);pending.push(pt);
   paintBoardDelta(canvas,{k:active,q:seq,c:color,s:weight,p:[pt],revision});
   schedule();
 }
 function move(event){
   if(disposed||pointer!==event.pointerId||!active)return;
   event.preventDefault();const pt=point(event),prev=pending.at(-1)||last;
   if(prev&&Math.hypot(pt[0]-prev[0],pt[1]-prev[1])<1.25)return;
   paintBoardDelta(canvas,{k:active,q:seq,c:color,s:weight,p:prev?[prev,pt]:[pt],revision});
   pending.push(pt);
   if(pending.length>=18)flush();else schedule();
 }
 function up(event){
   if(pointer!==event.pointerId)return;
   if(event.type==='pointerup')move(event);
   flush();pointer=null;active=null;last=null;pending=[];
 }
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);
 canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
 const lost=e=>{if(pointer===e.pointerId)up(e)};
 canvas.addEventListener('lostpointercapture',lost);
 const release=e=>{if(pointer===e.pointerId)up(e)};
 window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
 palette.addEventListener('click',event=>{
   const b=event.target.closest('[data-commons-color]');if(!b)return;
   color=b.dataset.commonsColor;
   palette.querySelectorAll('button').forEach(btn=>btn.classList.toggle('selected',btn===b));
 });
 size.addEventListener('input',()=>{weight=Number(size.value)});
 if(!canClear)host.querySelector('[data-action="board-clear"]')?.remove();
 reset(snapshot);
 return {accept,reset,setFull(value=true){full=Boolean(value);if(full){pending=[];clearTimer();}},get revision(){return revision},dispose(){disposed=true;clearTimer();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',lost);window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release)}};
}
