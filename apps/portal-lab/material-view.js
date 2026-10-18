import {createSpecimen,stepSpecimen,specimenStats,specimenSegments,tidalFrame,MATERIALS} from './material.js';
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const STORE='pocket-works:portal-lab:material-v04';
function txt(ctx,value,x,y,{size=11,color='#b6d1c3',align='left',weight=500}={}){
 ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.font=weight+' '+size+'px ui-monospace,Consolas,monospace';
 ctx.fillText(value,x,y);
}
function line(ctx,x1,y1,x2,y2,color='#5c8278',width=1){
 ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function fillRound(ctx,x,y,w,h,r,color){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=color;ctx.fill();
}
function format(n,d=2){if(!Number.isFinite(n))return '—';if(n>99999)return n.toExponential(1);return n.toFixed(d);}
function chartPath(ctx,history,key,bounds,max,yMin,yMax,color){
 const {x,y,w,h}=bounds;ctx.beginPath();
 history.forEach((s,i)=>{
  const t=s.t/max, v=clamp((s[key]-yMin)/Math.max(1e-12,yMax-yMin),0,1);
  const X=x+t*w,Y=y+(1-v)*h;
  if(i===0)ctx.moveTo(X,Y);else ctx.lineTo(X,Y);
 });
 ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
}
export function createMaterialLab(options={}){
 let saved={};try{saved=JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{}
 const state={material:MATERIALS[saved.material]?saved.material:'ceramic',
  axis:['radial','transverse'].includes(saved.axis)?saved.axis:'transverse',
  logRadius:clamp(Number.isFinite(Number(saved.logRadius))?Number(saved.logRadius):3,2,8),
  length:clamp(Number(saved.length)||2,.25,4),speed:clamp(Number(saved.speed)||.72,.1,.95)};
 let active=false,m=null,body=null,phase='ready',dirty=true,reportedBreaks=0;
 const onAction=options.onAction||(()=>{});
 const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(state));}catch{}};
 const radiusMeters=()=>10**state.logRadius;
 function build(){
  if(!m)return;
  body=createSpecimen(m,{material:state.material,axis:state.axis,aMeters:radiusMeters(),lengthMeters:state.length,speed:state.speed});
  phase='ready';reportedBreaks=0;dirty=true;update();
 }
 function configure(metric){m={...metric};build();}
 function setActive(next){active=next;if(next){if(!body)build();update();dirty=true;}}
 function update(){
  $('matter-material').value=state.material;
  $('matter-size').value=state.length;$('matter-size-value').textContent=format(state.length);
  $('matter-throat').value=state.logRadius;$('matter-throat-value').textContent=radiusMeters().toLocaleString('ru-RU',{maximumFractionDigits:0});
  $('matter-speed').value=state.speed;$('matter-speed-value').textContent=format(state.speed);
  document.querySelectorAll('[data-axis]').forEach(button=>{
   const yes=button.dataset.axis===state.axis;
   button.classList.toggle('selected',yes);button.setAttribute('aria-pressed',String(yes));
  });
  $('matter-material-note').textContent=MATERIALS[state.material].note;
  $('matter-sound').textContent=format(Math.sqrt(MATERIALS[state.material].E/MATERIALS[state.material].density),0);
  $('matter-phase').textContent=phase==='running'?'СИМУЛЯЦИЯ':phase==='completed'?
   (body.stopReason==='fractured'?'ОБРАЗЕЦ РАЗРУШЕН':'ПРОХОД ЗАВЕРШЁН'):'ГОТОВ К ИСПЫТАНИЮ';
  $('matter-launch').textContent=phase==='running'?'Эксперимент идёт':phase==='completed'?'Повторить испытание':'Запустить образец';
  $('matter-launch').disabled=phase==='running';
  if(!body)return;
  const s=specimenStats(body);
  $('matter-peak').textContent=format(s.stressPeakMPa,2);
  $('matter-fractures').textContent=s.broken+'/'+s.total;
  $('matter-proper').textContent=format(s.proper,3);
  $('matter-accel').textContent=format(s.tidalEndAcceleration,1);
  $('matter-accel-unit').textContent='м/с² · на '+format(state.length)+' м';
  $('matter-lapse').textContent='l/a = '+format(s.l)+'  ·  '+(s.l>=0?'РЕГИОН A':'РЕГИОН B');
  $('matter-limit').textContent='Предел растяжения '+format(s.limitTension*100,2)+'% · сжатия '+format(s.limitCompression*100,2)+'%';
 }
 function trigger(){
  if(!m)return;
  if(phase!=='ready')build();
  body.phase='running';phase='running';dirty=true;onAction('launch');update();
 }
 function reset(){build();onAction('mount');}
 function tick(dt,timeScale){
  if(!active||!body||phase!=='running')return;
  const n=Math.min(dt,.05)*Math.min(timeScale,5)*2.5;
  const stats=stepSpecimen(body,n);
  if(body.breakCount>reportedBreaks){
   reportedBreaks=body.breakCount;onAction('mount');
  }
  if(body.phase==='completed'){phase='completed';onAction('mount');save();}
  dirty=true;update();
 }
 function draw(ctx,w,h){
  if(!active||!body)return;
  ctx.fillStyle='#0c1c21';ctx.fillRect(0,0,w,h);
  const specimen=body,stat=specimenStats(specimen),region=stat.l>=0?'A':'B';
  const wide=w>540,pad=wide?34:17;
  const top=34,stripY=Math.round(h*.23),bandY=Math.round(h*.51),chartY=Math.round(h*.69),chartH=h-chartY-42;
  const mapX=pad+6,mapW=w-pad*2-12;
  const xFor=val=>mapX+(4-clamp(val,-4,4))/8*mapW;
  // Measured spacetime atlas: same l coordinate as relativity.js.
  ctx.fillStyle='#183d3b';ctx.fillRect(mapX,stripY-21,mapW/2,48);
  ctx.fillStyle='#4b3530';ctx.fillRect(mapX+mapW/2,stripY-21,mapW/2,48);
  ctx.fillStyle='#f6e2c0a6';ctx.fillRect(xFor(0)-2,stripY-27,4,60);
  for(let a=-4;a<=4;a++){
   const x=xFor(a);line(ctx,x,stripY-25,x,stripY+31,'#a7c5b439',1);
   if(a%2===0)txt(ctx,String(a),x,stripY+42,{size:10,color:'#a3b9a9',align:'center'});
  }
  const rodX=xFor(stat.l);
  line(ctx,rodX,stripY-34,rodX,stripY+35,'#f5e8c3',2);
  fillRound(ctx,rodX-6,stripY-6,12,12,4,'#f5e8c3');
  txt(ctx,'ТРАЕКТОРИЯ ЦЕНТРА / СОБСТВЕННОЕ ВРЕМЯ',pad,top,{size:wide?12:10,color:'#9dc2b5'});
  txt(ctx,region==='A'?'ОБЛАСТЬ A':'ОБЛАСТЬ B',pad,top+19,{size:wide?20:16,color:region==='A'?'#96c9b7':'#e0ad86',weight:750});
  txt(ctx,'τ '+format(stat.proper,3)+' · β '+format(stat.beta,3),w-pad,top+19,{size:wide?12:10,color:'#d1d7c7',align:'right'});
  txt(ctx,'l/a',pad,stripY+42,{size:10});
  txt(ctx,'0',xFor(0),stripY-42,{size:10,color:'#ffdfb6',align:'center'});
  // Rod schematic in its comoving Fermi frame — not an optical view.
  txt(ctx,'ЛОКАЛЬНАЯ СИСТЕМА ФЕРМИ',pad,bandY-88,{size:wide?13:11,color:'#a2c7b7',weight:720});
  txt(ctx,state.axis==='radial'?'ОСЬ / РАДИАЛЬНО':'ОСЬ / ПОПЕРЕЧНО',w-pad,bandY-88,{size:10,color:'#96a8a0',align:'right'});
  const scope=Math.min(w*.68,540),unit=scope/(specimen.h*(specimen.nodes.length-1));
  const nodes=specimen.nodes,xpos=n=>clamp(w/2+n.x*unit,w*.04,w*.96);
  const col=MATERIALS[state.material].color;
  const baseline=bandY-8;
  line(ctx,w/2-scope/2,baseline,w/2+scope/2,baseline,'#6c928653',1);
  for(let i=0;i<nodes.length-1;i++){
   const x=xpos(nodes[i]),x2=xpos(nodes[i+1]),link=specimen.links[i];
   if(link.alive)line(ctx,x,baseline,x2,baseline,col,wide?10:7);
   else{
    ctx.beginPath();ctx.arc((x+x2)/2,baseline,Math.min(4,Math.abs(x2-x)/4+1),0,Math.PI*2);
    ctx.strokeStyle='#e69b79';ctx.lineWidth=2;ctx.stroke();
    line(ctx,x,baseline-7,x+2,baseline+7,'#e69b79',1);
   }
  }
  for(let i=0;i<nodes.length;i++){
   const x=xpos(nodes[i]);
   ctx.beginPath();ctx.arc(x,baseline,2.5,0,2*Math.PI);
   ctx.fillStyle=i===8?'#f7e8ba':col;ctx.fill();
  }
  txt(ctx,'ИСХОДНАЯ ДЛИНА '+format(state.length,2)+' м',w/2,baseline+32,{size:wide?11:10,color:'#adc2af',align:'center'});
  const frame=tidalFrame(specimen.ray,specimen.m);
  const eigen=state.axis==='radial'?frame.radial:frame.transverse;
  const A=eigen*specimen.m.a**2;
  txt(ctx,'ПРИЛИВНОЕ СОБСТВЕННОЕ ЧИСЛО',pad,bandY+57,{size:10,color:'#92b5a7'});
  txt(ctx,(A>=0?'+':'')+format(A,4)+' / a²',pad,bandY+74,{size:wide?19:16,color:A>=0?'#dbbaa0':'#a3d3bc',weight:750});
  txt(ctx,'РАЗРЫВЫ '+stat.broken+'/'+stat.total,w-pad,bandY+74,{size:wide?18:14,color:stat.broken?'#efab88':'#9ed2bf',align:'right',weight:750});
  // Stress history: real Hookean stresses in Pa, not arbitrary normalized art.
  const plot={x:pad,y:chartY+30,w:w-pad*2,h:Math.max(20,chartH-14)};
  txt(ctx,'НАПРЯЖЕНИЕ / МПа',pad,chartY,{size:12,color:'#b3ccbc',weight:720});
  const mat=MATERIALS[state.material],limit=mat.E*mat.tension/1e6;
  const maxStress=Math.max(limit*1.18,stat.stressPeakMPa*1.22,.05);
  for(let i=0;i<=4;i++){
   const y=plot.y+i*plot.h/4;
   line(ctx,plot.x,y,plot.x+plot.w,y,'#7a958c2b',1);
  }
  const maxT=Math.max(1,Math.ceil(specimen.history.at(-1)?.t||1));
  chartPath(ctx,specimen.history,'stressPeakMPa',plot,maxT,0,maxStress,'#bce6c9');
  const targetY=plot.y+(1-limit/maxStress)*plot.h;
  if(targetY>=plot.y){
   ctx.setLineDash([4,4]);line(ctx,plot.x,targetY,plot.x+plot.w,targetY,'#e8ae8e97',1);ctx.setLineDash([]);
  }
  txt(ctx,'0',plot.x,plot.y+plot.h+14,{size:10,color:'#8da898'});
  txt(ctx,format(maxT,0)+' a/c',plot.x+plot.w,plot.y+plot.h+14,{size:10,color:'#8da898',align:'right'});
  if(phase==='completed'){
   const msg=stat.broken?'РАЗРУШЕН · '+stat.broken+' СВЯЗЕЙ':'ПРОХОД ЗАВЕРШЁН · СВЯЗИ ЦЕЛЫ';
   const ww=Math.min(w-22,360),xx=(w-ww)/2,yy=bandY-48;
   fillRound(ctx,xx,yy,ww,26,3,'#1a3131e8');
   txt(ctx,msg,w/2,yy+14,{size:wide?12:10,color:stat.broken?'#f0b297':'#b6e2c4',align:'center',weight:720});
  }
  dirty=false;
 }
 $('matter-material').addEventListener('change',e=>{state.material=e.target.value;save();build();});
 for(const btn of document.querySelectorAll('[data-axis]'))btn.addEventListener('click',()=>{
  state.axis=btn.dataset.axis;save();build();
 });
 for(const [id,key] of [['matter-throat','logRadius'],['matter-size','length'],['matter-speed','speed']]){
  $(id).addEventListener('input',e=>{state[key]=Number(e.target.value);save();build();});
 }
 $('matter-launch').addEventListener('click',trigger);
 $('matter-reset').addEventListener('click',reset);
 return {state,configure,setActive,tick,draw,trigger,reset,get phase(){return phase;},
  get snapshot(){return body?{
   config:{...state,aMeters:radiusMeters()},stats:specimenStats(body),
   history:body.history.slice(),nodes:body.nodes.map(n=>({...n})),
   links:body.links.map(l=>({...l}))}:null;}};
}
