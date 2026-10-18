import {metric,geometry,launch,advance} from './relativity.js';
import {photonTransfer,lookup,cameraBasis,pixelDirection,backgroundDirection,dot} from './optics.js';
import {createCongruence,stepCongruence,strain,diagnosticGeometry} from './tidal.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=d=>d*Math.PI/180;
const STORAGE='pocket-works:portal-lab:observatory-v1';
const $=id=>document.getElementById(id);
const raf=fn=>requestAnimationFrame(fn);
function stars(seed,blue){
 const w=1024,h=512,c=document.createElement('canvas');c.width=w;c.height=h;
 const x=c.getContext('2d',{willReadFrequently:true});
 let state=seed>>>0;
 const random=()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);
 const im=x.createImageData(w,h),p=im.data;
 const fog=blue?[[7,24,39],[17,53,72],[23,68,72]]:[[28,19,32],[69,34,37],[103,61,44]];
 for(let y=0;y<h;y++)for(let a=0;a<w;a++){
  const u=a/w,v=y/h,b=Math.sin(u*17+Math.sin(v*12)*1.6)*Math.cos(v*10-u*9),c0=Math.sin(u*8-v*7);
  const wave=clamp(.48+.27*b+.18*c0,0,1),intensity=.37+.43*wave,off=(y*w+a)*4;
  const f=fog[Math.min(2,Math.floor(wave*2.99))];
  p[off]=f[0]*intensity;p[off+1]=f[1]*intensity;p[off+2]=f[2]*intensity;p[off+3]=255;
 }
 x.putImageData(im,0,0);
 // Uniform samples on the sphere (longitude x, sine latitude y).
 for(let i=0;i<6600;i++){
  const u=random()*w,v=random()*h;
  const rare=random(),radius=rare>.995?1.8:rare>.96?1.2:.48;
  const alpha=rare>.96?.91:.28+.58*random();
  const white=blue?'204,238,245':'251,218,165';
  x.fillStyle='rgba('+white+','+alpha+')';
  x.beginPath();x.arc(u,v,radius,0,Math.PI*2);x.fill();
  if(radius>1.7){
   x.strokeStyle='rgba('+white+',.23)';x.lineWidth=.6;
   x.beginPath();x.moveTo(u-6,v);x.lineTo(u+6,v);x.moveTo(u,v-6);x.lineTo(u,v+6);x.stroke();
  }
 }
 return x.getImageData(0,0,w,h);
}
function sampleSky(im,dir){
 const az=(Math.atan2(dir[1],dir[0])/(2*Math.PI)+1)%1;
 const v=Math.asin(clamp(dir[2],-1,1))/Math.PI+.5;
 const x=Math.floor(az*(im.width-1)),y=Math.floor((1-v)*(im.height-1));
 const o=(y*im.width+x)*4;
 return [im.data[o],im.data[o+1],im.data[o+2]];
}
function fmt(n){return Number.isFinite(n)?n.toFixed(2):'—';}
export function createObservatory(canvas,options={}){
 let saved={};
 try{saved=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch{}
 const state={
  l:clamp(Number(saved.l)||2.1,-6,6),yaw:clamp(Number(saved.yaw)||0,-2.6,2.6),
  pitch:clamp(Number(saved.pitch)||0,-1.1,1.1),fov:clamp(Number(saved.fov)||80,50,110),
  facingSign:Math.sign(Number(saved.l)||2.1)||1
 };
 if(Math.abs(state.l)<.12)state.l=2.1;
 let fly=null,probe=null,probeRead=null,metricNow=null;
 let active=false,w=0,h=0,run=0,stage='ready',progress=0,warning='';
 let skyA=null,skyB=null,picture=null,basis=null,transfer=null;
 let lastRender=0,flightRender=0,needsRender=true,mouse=null,selected=null,pending=0;
 const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify({l:state.l,yaw:state.yaw,pitch:state.pitch,fov:state.fov}));}catch{}};
 const onProgress=options.onProgress||(()=>{}),onAction=options.onAction||(()=>{});
 function updateControls(){
  const d=$('lens-distance');
  if(d){d.value=clamp(Math.abs(state.l),.2,6);$('lens-distance-value').textContent=fmt(Math.abs(state.l));}
  if($('lens-fov')){$('lens-fov').value=state.fov;$('lens-fov-value').textContent=state.fov.toFixed(0);}
  if($('lens-region'))$('lens-region').textContent=state.l>=0?'A · ВНЕШНИЙ РЕГИОН':'B · ВНЕШНИЙ РЕГИОН';
  if($('lens-flight'))$('lens-flight').textContent=fly?'Остановить полёт':'Пройти горловину';
  if($('lens-probe'))$('lens-probe').textContent=probe?'Новый зонд':'Отправить зонд';
  if($('lens-probe-read')){
   const s=probeRead;
   $('lens-probe-read').textContent=s?'Δl '+fmt(s.radial.length)+'× · Δ⊥ '+fmt(s.transverse.length)+'× · τ '+fmt(s.properTime):'Зонд не запущен';
  }
  if($('lens-eta'))$('lens-eta').textContent=metricNow?.eta?('N₀ = '+fmt(Math.exp(-metricNow.eta))):'N₀ = 1';
  if($('lens-optical-read')){
   let message='Интегрирование нулевых геодезических…';
   if(stage==='ready'&&transfer&&metricNow){
    const b=cameraBasis(state.yaw,state.pitch,Math.sign(state.l)||1,state.facingSign);
    const dir=pixelDirection(0,0,b,state.fov,w/Math.max(1,h));
    const arrival=backgroundDirection(dir,b,transfer);
    if(arrival){
     message=arrival.region<0?'Центральный луч: численно не разрешён':
      'Центр → регион '+(arrival.region===0?'A':'B')+
      ' · b/a '+fmt(arrival.transfer.impact/metricNow.a)+
      ' · обороты '+fmt(arrival.transfer.winding);
    }
   }
   $('lens-optical-read').textContent=message;
  }
 }
 function cancel(){run++;progress=0;stage='calculating';needsRender=true;}
 function makeSky(){if(!skyA){skyA=stars(15540,true);skyB=stars(78036,false);}}
 function configure(m){metricNow=m;fly=null;probe=null;probeRead=null;state.facingSign=Math.sign(state.l)||1;request();updateControls();}
 function setActive(next){if(next===active)return;active=next;if(next){updateControls();request();}else{clearTimeout(pending);cancel();}}
 function setDistance(v){fly=null;state.l=(Math.sign(state.l)||1)*clamp(v,.2,6);state.facingSign=Math.sign(state.l);request();save();updateControls();}
 function rebuild(width,height,quick=false){
  if(!active||!metricNow||width<10||height<10)return;
  clearTimeout(pending);pending=0;
  makeSky();w=width;h=height;
  const token=++run,side=state.l>=0?1:-1;
  stage='geodesics';progress=0;warning='';
  const l0=state.l*metricNow.a,m={...metricNow};
  basis=cameraBasis(state.yaw,state.pitch,side,state.facingSign);
  const n=quick?150:640,table=new Array(n+1);
  let i=0;
  function chunk(){
   if(token!==run||!active)return;
   const last=Math.min(i+(quick?45:28),n+1);
   for(;i<last;i++)table[i]=photonTransfer(m,l0,Math.PI*i/n,{step:quick?.12:.075,maxTime:quick?90:165,outer:22});
   progress=i/(n+1)*.6;onProgress(progress);
   if(i<=n){raf(chunk);return;}
   transfer=table;stage='pixels';
   // Fixed-size raster; never stretch indefinitely beyond the intended fidelity.
   const target=quick?clamp(Math.floor(w*.38),130,300):clamp(Math.floor(w*.95),280,760);
   const iw=Math.round(target),ih=Math.round(target*h/w);
   const buffer=document.createElement('canvas');buffer.width=iw;buffer.height=ih;
   const bufferCtx=buffer.getContext('2d',{willReadFrequently:true});
   const image=bufferCtx.createImageData(iw,ih),pixels=image.data;
   let row=0;
   function raster(){
    if(token!==run||!active)return;
    const end=Math.min(row+(quick?24:15),ih);
    for(let y=row;y<end;y++)for(let x=0;x<iw;x++){
      const dx=2*(x+.5)/iw-1,dy=1-2*(y+.5)/ih;
      const dir=pixelDirection(dx,dy,basis,state.fov,iw/ih);
      const arrival=backgroundDirection(dir,basis,table);
      const o=(y*iw+x)*4;
      if(!arrival||arrival.region<0){
       pixels[o]=9;pixels[o+1]=13;pixels[o+2]=16;
      }else{
       const src=arrival.region===0?skyA:skyB;
       const sky=sampleSky(src,arrival.direction);
       // Preserve spectral boundary conditions: no arbitrary painted rings.
       pixels[o]=sky[0];pixels[o+1]=sky[1];pixels[o+2]=sky[2];
      }
      pixels[o+3]=255;
    }
    row=end;progress=.6+.4*row/ih;onProgress(progress);
    if(row<ih){raf(raster);return;}
    bufferCtx.putImageData(image,0,0);
    picture=buffer;stage='ready';progress=1;needsRender=false;selected=null;
    updateControls();onProgress(1);
   }
   raf(raster);
  }
  raf(chunk);
 }
 function request(){clearTimeout(pending);cancel();pending=setTimeout(()=>{if(active&&w&&h)rebuild(w,h,false);},110);}
 function triggerFlight(){
  if(fly){fly=null;onAction('mount');updateControls();return;}
  fly=launch(metricNow,{kind:'matter',l:state.l*metricNow.a,alpha:Math.PI,phi:0,speed:.73});
  state.facingSign=Math.sign(state.l)||1;
  onAction('launch');updateControls();request();
 }
 function launchProbe(){
  probe=createCongruence(metricNow,{l:state.l*metricNow.a,phi:0,speed:.72,size:.038*metricNow.a});
  probeRead=strain(probe);onAction('launch');updateControls();
 }
 function tick(dt,speed=1){
  if(!active||!metricNow)return;
  if(fly){
    advance(fly,metricNow,Math.min(.08,dt*speed*2.2),{record:false});
    state.l=clamp(fly.l/metricNow.a,-7,7);
    if(Math.abs(state.l)>6.5){fly=null;save();}
    const now=performance.now();
    if(now-flightRender>680){flightRender=now;rebuild(w,h,true);}
    updateControls();
  }
  if(probe){
    probeRead=stepCongruence(probe,Math.min(.08,dt*speed*2.2));
    if(probe.done)probe=null;
    updateControls();
  }
 }
 function draw(ctx,width,height){
  if(!active)return;
  if(w!==width||h!==height||(!picture&&run===0)){
    w=width;h=height;rebuild(width,height,false);
  }
  ctx.fillStyle='#071319';ctx.fillRect(0,0,width,height);
  if(picture)ctx.drawImage(picture,0,0,width,height);
  if(stage!=='ready'){
   ctx.fillStyle='rgba(6,16,19,.55)';ctx.fillRect(0,0,width,height);
   ctx.fillStyle='#cde8d7';ctx.font='12px ui-monospace,monospace';ctx.textAlign='center';
   ctx.fillText('ТРАССИРОВКА СВЕТА  '+Math.round(progress*100)+'%',width/2,height*.52);
  }
  const crossX=width*.5,crossY=height*.5;
  ctx.strokeStyle='#d7f1e9ad';ctx.lineWidth=1;ctx.beginPath();
  ctx.moveTo(crossX-16,crossY);ctx.lineTo(crossX-5,crossY);
  ctx.moveTo(crossX+5,crossY);ctx.lineTo(crossX+16,crossY);
  ctx.moveTo(crossX,crossY-16);ctx.lineTo(crossX,crossY-5);
  ctx.moveTo(crossX,crossY+5);ctx.lineTo(crossX,crossY+16);ctx.stroke();
  ctx.font='11px ui-monospace,monospace';ctx.textAlign='left';
  ctx.fillStyle='#c1e3d2';ctx.fillText('NULL GEODESICS / 3+1D',15,26);
  ctx.fillStyle='#8eb7a4';ctx.fillText('l/a '+fmt(state.l)+'   FOV '+fmt(state.fov)+'°',15,44);
  ctx.textAlign='right';ctx.fillStyle='#d1d8cd';
  ctx.fillText(state.l>=0?'REGION A':'REGION B',width-14,26);
  if(selected){
   ctx.textAlign='left';ctx.fillStyle='#d7ead9';
   ctx.fillText(selected.region<0?'НЕРАЗРЕШЁННАЯ ОРБИТА':
    'ЛУЧ → '+(selected.region===0?'A':'B')+'   b/a '+fmt(selected.impact/metricNow.a)+'   W '+fmt(selected.winding),14,height-20);
  }else{
   ctx.textAlign='left';ctx.fillStyle='#9bb5a6';
   ctx.fillText('Перетащи: взгляд · касание: исследовать луч',14,height-20);
  }
  if(probeRead)drawProbe(ctx,width,height,probeRead);
 }
 function drawProbe(ctx,width,height,s){
  const size=Math.min(124,width*.27),ox=width-size*.62,oy=height-size*.72;
  ctx.fillStyle='#0b2026ec';ctx.fillRect(ox-size*.56,oy-size*.56,size*1.17,size*1.13);
  ctx.strokeStyle='#7daea37a';ctx.strokeRect(ox-size*.56+.5,oy-size*.56+.5,size*1.17-1,size*1.13-1);
  ctx.save();ctx.translate(ox,oy+6);
  const g=diagnosticGeometry(s,{scale:size*.3,maxScale:1.9});
  ctx.beginPath();g.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();ctx.strokeStyle='#d9e6cc';ctx.lineWidth=1.6;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,size*.3,0,Math.PI*2);ctx.strokeStyle='#9eaead73';ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
  ctx.restore();
  ctx.textAlign='left';ctx.font='9px ui-monospace,monospace';ctx.fillStyle='#bbd9c8';
  ctx.fillText('ЗОНД / JACOBI',ox-size*.47,oy-size*.43);
  ctx.fillText('r '+fmt(s.radial.length)+'×',ox-size*.47,oy+size*.46);
  ctx.fillText('⊥ '+fmt(s.transverse.length)+'×',ox-size*.47,oy+size*.55);
 }
 function point(event){
  const rect=canvas.getBoundingClientRect();
  return {x:event.clientX-rect.left,y:event.clientY-rect.top};
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!active||e.pointerType==='mouse'&&e.button!==0)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  mouse={id:e.pointerId,...point(e),yaw:state.yaw,pitch:state.pitch,drag:false};
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||!mouse||e.pointerId!==mouse.id)return;
  const p=point(e),dx=p.x-mouse.x,dy=p.y-mouse.y;
  if(Math.hypot(dx,dy)>5)mouse.drag=true;
  if(!mouse.drag)return;
  state.yaw=clamp(mouse.yaw+dx/Math.max(300,w)*2.2,-2.6,2.6);
  state.pitch=clamp(mouse.pitch-dy/Math.max(300,h)*1.8,-1.1,1.1);
  request();save();
 });
 canvas.addEventListener('pointerup',e=>{
  if(!mouse||e.pointerId!==mouse.id)return;
  const p=point(e);
  if(!mouse.drag&&transfer&&stage==='ready'){
   const b=cameraBasis(state.yaw,state.pitch,Math.sign(state.l)||1,state.facingSign);
   const direction=pixelDirection(2*p.x/w-1,1-2*p.y/h,b,state.fov,w/h);
   const theta=Math.acos(clamp(dot(direction,b.radial),-1,1));
   selected=lookup(transfer,theta);
  }
  mouse=null;updateControls();save();
 });
 canvas.addEventListener('pointercancel',()=>{mouse=null;});
 canvas.addEventListener('lostpointercapture',()=>{mouse=null;});
 $('lens-distance')?.addEventListener('input',e=>setDistance(Number(e.target.value)));
 $('lens-fov')?.addEventListener('input',e=>{state.fov=Number(e.target.value);updateControls();request();save();});
 $('lens-flight')?.addEventListener('click',triggerFlight);
 $('lens-probe')?.addEventListener('click',launchProbe);
 $('lens-reset')?.addEventListener('click',()=>{
  fly=null;probe=null;probeRead=null;state.l=2.1;state.yaw=0;state.pitch=0;state.fov=80;state.facingSign=1;
  onAction('mount');updateControls();request();save();
 });
 return {
  state,configure,setActive,draw,tick,request,updateControls,launchProbe,triggerFlight,
  get probe(){return probeRead;},
  get status(){return {stage,progress,region:state.l>=0?'A':'B',selected,flight:!!fly,rays:transfer?.length||0};}
 };
}
