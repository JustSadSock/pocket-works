import {metric,geometry,stressEnergy,throatDiagnostics,sampleEinstein} from './spacetime.js';
const $=id=>document.getElementById(id);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const F=n=>Number.isFinite(n)?n.toFixed(3):'—';
const F6=n=>Number.isFinite(n)?n.toFixed(5):'—';
const PALETTES={rho:'#f0c09a',radial:'#c590aa',tangent:'#7cc5b0'};
const presets={
 ellis:{shape:0,shapeWidth:1.45,eta:0,lapseBump:0,lapseWidth:1.3},
 wide:{shape:.48,shapeWidth:2.2,eta:0,lapseBump:0,lapseWidth:1.3},
 sharp:{shape:-.32,shapeWidth:.9,eta:.2,lapseBump:.1,lapseWidth:1},
 well:{shape:.17,shapeWidth:1.6,eta:.7,lapseBump:-.24,lapseWidth:1.5}
};
function label(ctx,str,x,y,size=11,col='#afcfbe',align='left',weight=500){
 ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';ctx.fillStyle=col;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(str,x,y);
}
function line(ctx,x1,y1,x2,y2,col='#608b7e',width=1){
 ctx.strokeStyle=col;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
function trace(ctx,points,getXY,color,width=2){
 ctx.beginPath();
 points.forEach((p,i)=>{const {x,y}=getXY(p);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
export function createDesigner(canvas,{getMetric,onEdit,onAction}={}){
 let active=false;
 let focus=0,drag=null,plotR=null,plotN=null;
 const m=()=>getMetric();
 const edit=(patch)=>{
  if(!getMetric||!onEdit)return;
  const validated=metric({...m(),...patch});
  onEdit(validated);
 };
 function setActive(v){active=v;if(v)refresh();}
 function refresh(){
  if(!getMetric)return;
  const q=m(),diag=throatDiagnostics(q),t=diag.throat;
  for(const [id,key,digits] of [['design-shape','shape',2],['design-shape-width','shapeWidth',2],
   ['design-lapse','lapseBump',2],['design-lapse-width','lapseWidth',2]]){
   $(id).value=q[key];$(id+'-value').textContent=q[key].toFixed(digits);
  }
  $('design-eta').value=q.eta;$('design-eta-value').textContent=q.eta.toFixed(2);
  $('design-a').value=q.a;$('design-a-value').textContent=q.a.toFixed(2);
  $('design-rho').textContent=F6(t.rho*q.a*q.a);
  $('design-pr').textContent=F6(t.pr*q.a*q.a);
  $('design-pt').textContent=F6(t.pt*q.a*q.a);
  $('design-nec-r').textContent=F6(diag.radialNEC);
  $('design-nec-t').textContent=F6(diag.tangentialNEC);
  $('design-flare').textContent=F(diag.flaring);
  $('design-lapse0').textContent=F(diag.redshiftAtThroat);
  $('design-embedding').textContent=diag.embeddingPossible?'Возможно':'Невозможно на всём графике';
  for(const id of ['design-nec','design-wec','design-sec','design-dec']){
   const value=t[id.slice(7)];
   $(id).textContent=value?'Выполняется':'Нарушено';
   $(id).dataset.valid=String(value);
  }
  $('design-rule').textContent=diag.flaring>0?
   'Топология сохранена: гладкая горловина с R′(0)=0 и R″(0)>0. Радикальная NEC обязательно нарушается прямо в горловине.':
   'Горловина не является локальным минимумом. Измените геометрию.';
  $('design-preset-value').textContent=Object.entries(presets).find(([_,x])=>
   Object.entries(x).every(([k,v])=>Math.abs(q[k]-v)<.00001))?.[0]||'Пользовательская';
  document.querySelectorAll('[data-design-preset]').forEach(btn=>{
   const p=presets[btn.dataset.designPreset],selected=p&&Object.entries(p).every(([k,v])=>Math.abs(q[k]-v)<.00001);
   btn.classList.toggle('selected',!!selected);btn.setAttribute('aria-pressed',String(!!selected));
  });
 }
 function coordinates(evt){
  const b=canvas.getBoundingClientRect();return {x:evt.clientX-b.left,y:evt.clientY-b.top};
 }
 const sliderSettings=[['design-a','a'],['design-shape','shape'],['design-shape-width','shapeWidth'],
  ['design-eta','eta'],['design-lapse','lapseBump'],['design-lapse-width','lapseWidth']];
 for(const [id,key]of sliderSettings){
  $(id).addEventListener('input',e=>edit({[key]:Number(e.target.value)}));
 }
 for(const b of document.querySelectorAll('[data-design-preset]')){
  b.addEventListener('click',()=>{edit(presets[b.dataset.designPreset]);onAction?.('mount');});
 }
 function draw(ctx,w,h){
  if(!active)return;
  const q=m(),samples=sampleEinstein(q,-4,4,241);
  const wide=w>540,pad=wide?34:15;
  ctx.fillStyle='#0d2025';ctx.fillRect(0,0,w,h);
  const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#18332f');bg.addColorStop(1,'#0c1a22');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  const pH=Math.max(84,(h-85)*.265),gap=wide?28:24,areaWidth=w-pad*2;
  plotR={x:pad,y:62,w:areaWidth,h:pH};
  plotN={x:pad,y:plotR.y+pH+gap,w:areaWidth,h:pH};
  const plotT={x:pad,y:plotN.y+pH+gap,w:areaWidth,h:Math.max(65,h-(plotN.y+pH+gap)-27)};
  const makeX=(z,p)=>p.x+(z+4)/8*p.w;
  function prep(p,zero,negative){
   ctx.fillStyle='#0b1e21';ctx.fillRect(p.x,p.y,p.w,p.h);
   for(let i=0;i<=8;i++)line(ctx,p.x+p.w*i/8,p.y,p.x+p.w*i/8,p.y+p.h,i===4?'#d4b78b88':'#9ab2a21f',i===4?1.7:.8);
   for(let j=0;j<=4;j++)line(ctx,p.x,p.y+p.h*j/4,p.x+p.w,p.y+p.h*j/4,'#9ab2a21a',.8);
   if(zero!==undefined){const yy=negative?zero:p.y+p.h/2;line(ctx,p.x,yy,p.x+p.w,yy,'#f1e0c174',1);}
  }
  prep(plotR);prep(plotN);prep(plotT);
  const maxR=Math.max(...samples.map(s=>s.R));
  const rY=v=>plotR.y+plotR.h-(v-.75)/(Math.max(4.3,maxR)-.75)*plotR.h;
  const minN=Math.min(...samples.map(s=>s.N)),maxN=Math.max(...samples.map(s=>s.N));
  const nBottom=Math.min(.4,minN-.08),nTop=Math.max(1.13,maxN+.08);
  const nY=v=>plotN.y+plotN.h-(v-nBottom)/(nTop-nBottom)*plotN.h;
  trace(ctx,samples,s=>({x:makeX(s.z,plotR),y:rY(s.R)}),'#99d6bb',2.3);
  trace(ctx,samples,s=>({x:makeX(s.z,plotN),y:nY(s.N)}),'#e8b38b',2.3);
  const probe=1,handR=geometry(probe*q.a,q).R/q.a,handN=geometry(0,q).N;
  const hxR=makeX(probe,plotR),hyR=rY(handR),hxN=makeX(0,plotN),hyN=nY(handN);
  function handle(x,y,color){
   ctx.beginPath();ctx.arc(x,y,10,0,2*Math.PI);ctx.fillStyle='#10272a';ctx.fill();
   ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();
   ctx.beginPath();ctx.arc(x,y,10,0,2*Math.PI);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();
  }
  handle(hxR,hyR,'#d4efd5');handle(hxN,hyN,'#f2b89a');
  label(ctx,'R(l)/a · РАДИУС СЕЧЕНИЯ',pad,22,wide?13:11,'#b5dfc6','left',740);
  label(ctx,'Перетащите контрольные точки',w-pad,42,9,'#8ab19f','right');
  label(ctx,'N(l) · ХОД ЧАСОВ',pad,plotN.y-13,wide?13:11,'#e9c1a3','left',740);
  label(ctx,'Gμν / 8π · ЭНЕРГИЯ И ДАВЛЕНИЕ',pad,plotT.y-12,wide?12:10,'#bec9b4','left',740);
  // Show signed matter source profiles in 8π normalized orthonormal units.
  let maximum=Math.max(...samples.map(s=>Math.max(Math.abs(s.rho),Math.abs(s.pr),Math.abs(s.pt))),.005);
  const yMatter=v=>plotT.y+plotT.h/2-v/(1.16*maximum)*plotT.h/2;
  line(ctx,plotT.x,plotT.y+plotT.h/2,plotT.x+plotT.w,plotT.y+plotT.h/2,'#ded4b367',1);
  trace(ctx,samples,s=>({x:makeX(s.z,plotT),y:yMatter(s.rho)}),PALETTES.rho,1.8);
  trace(ctx,samples,s=>({x:makeX(s.z,plotT),y:yMatter(s.pr)}),PALETTES.radial,1.8);
  trace(ctx,samples,s=>({x:makeX(s.z,plotT),y:yMatter(s.pt)}),PALETTES.tangent,1.8);
  label(ctx,'ρ',pad+4,plotT.y+12,12,PALETTES.rho);
  label(ctx,'pᵣ',pad+26,plotT.y+12,12,PALETTES.radial);
  label(ctx,'pₜ',pad+57,plotT.y+12,12,PALETTES.tangent);
  label(ctx,'l/a : −4 … +4',w-pad,h-11,10,'#88ac9f','right');
  label(ctx,'R′(0) = 0',pad,h-11,10,'#88ac9f');
  plotR={...plotR,handle:{x:hxR,y:hyR},rY:rY,maxR};
  plotN={...plotN,handle:{x:hxN,y:hyN},nY:nY,nBottom,nTop};
 }
 canvas.addEventListener('pointerdown',e=>{
  if(!active||!plotR||e.pointerType==='mouse'&&e.button!==0)return;
  const p=coordinates(e);
  const dr=Math.hypot(p.x-plotR.handle.x,p.y-plotR.handle.y);
  const dn=Math.hypot(p.x-plotN.handle.x,p.y-plotN.handle.y);
  if(Math.min(dr,dn)>27)return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,mode:dr<dn?'radius':'clock'};
 });
 canvas.addEventListener('pointermove',e=>{
  if(!active||!drag||e.pointerId!==drag.id)return;
  const p=coordinates(e),q=m();
  if(drag.mode==='radius'){
   const z=1,B=Math.sqrt(2),ex=Math.exp(-1/(q.shapeWidth*q.shapeWidth));
   const target=.75+(1-p.y/1); // overridden directly by plot calibration below
   const desired=.75+(plotR.y+plotR.h-p.y)/plotR.h*(Math.max(4.3,plotR.maxR)-.75);
   edit({shape:Math.round(clamp((desired-B)/ex,-.35,.55)*100)/100});
  }else{
   const desired=plotN.nBottom+(plotN.y+plotN.h-p.y)/plotN.h*(plotN.nTop-plotN.nBottom);
   const bump=Math.log(Math.max(.25,desired))+q.eta;
   edit({lapseBump:Math.round(clamp(bump,-.45,.45)*100)/100});
  }
 });
 canvas.addEventListener('pointerup',e=>{if(drag?.id===e.pointerId){drag=null;onAction?.('mount');}});
 canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('lostpointercapture',()=>drag=null);
 return {setActive,refresh,draw,
  get snapshot(){return {metric:m(),throat:throatDiagnostics(m()),profiles:sampleEinstein(m())};}};
}
