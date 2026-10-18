// Optical chamber for physically coupled spherical bubbles.
// Color is the dimensionless, instantaneous potential-flow pressure perturbation;
// no acoustic travel time or actual microjet boundary has been computed.
import { pressureAt } from './coupling.js';

const TAU=Math.PI*2,clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export const BUBBLE_COLORS=['#c6f6df','#e7c18b','#a6d6e3','#e4aea8','#bbbee2'];

export function cloudViewport(w,h,solution) {
 const {geometry,config}=solution;
 const bottom=Math.max(132,Math.min(165,h*.28));
 const top=Math.min(123,Math.max(76,h*.21));
 const available=Math.max(112,h-top-bottom);
 const xmin=Math.min(...geometry.map(g=>g.x-g.r0-0.4))-.2;
 const xmax=config.standOff+1.9;
 const ymin=Math.min(...geometry.map(g=>g.y-g.r0))-.65;
 const ymax=Math.max(...geometry.map(g=>g.y+g.r0))+.65;
 const scale=Math.max(10,Math.min((w-42)/(xmax-xmin),available/(ymax-ymin)));
 const usedW=(xmax-xmin)*scale,usedH=(ymax-ymin)*scale;
 const originX=(w-usedW)/2-xmin*scale;
 const originY=top+(available-usedH)/2+ymax*scale;
 return {
  w,h,scale,originX,originY,wallX:originX+config.standOff*scale,baseRadius:scale,
  bubbles:geometry.map(g=>({x:originX+g.x*scale,y:originY-g.y*scale,r:g.r0*scale})),
  toWorld:(px,py)=>[(px-originX)/scale,(originY-py)/scale]
 };
}
function drawCircle(ctx,x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,TAU)}
function strokeLine(ctx,x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}

export function renderCloudScene(ctx,w,h,solution,point,mode,selected=0,showPressure=true) {
 const view=cloudViewport(w,h,solution),{wallX,scale}=view;
 ctx.clearRect(0,0,w,h);
 const water=ctx.createLinearGradient(0,0,w,h);
 water.addColorStop(0,'#234c4c');water.addColorStop(.48,'#102e38');water.addColorStop(1,'#091e27');
 ctx.fillStyle=water;ctx.fillRect(0,0,w,h);
 const spotlight=ctx.createRadialGradient(view.bubbles[0].x,view.bubbles[0].y,0,view.bubbles[0].x,view.bubbles[0].y,w*.85);
 spotlight.addColorStop(0,'#87c6a31c');spotlight.addColorStop(1,'#071b2600');
 ctx.fillStyle=spotlight;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#a5dad111';ctx.lineWidth=.8;
 for(let x=0;x<w;x+=28)strokeLine(ctx,x,0,x,h);
 for(let y=0;y<h;y+=28)strokeLine(ctx,0,y,w,y);
 // Monopole-potential pressure perturbations from the SAME integrated solution.
 // The color magnitude is log-compressed for readability and is not a shock map.
 if(showPressure&&mode!=='ready'){
   const cell=Math.max(12,Math.min(20,Math.floor(w/24)));
   for(let py=40;py<h-103;py+=cell){
     for(let px=0;px<Math.min(wallX,w);px+=cell){
       const [wx,wy]=view.toWorld(px+cell*.5,py+cell*.5);
       if(solution.geometry.some((g,i)=>Math.hypot(wx-g.x,wy-g.y)<point.bubbles[i].radius*1.08))continue;
       const pressure=pressureAt(solution,point,wx,wy);
       const strength=clamp(Math.log1p(Math.abs(pressure)*2.4)/Math.log(21),0,1);
       if(strength<.085)continue;
       ctx.fillStyle=pressure>0?'rgba(241,167,95,'+(strength*.34).toFixed(3)+')':'rgba(95,208,202,'+(strength*.31).toFixed(3)+')';
       ctx.fillRect(px,py,cell+.8,cell+.8);
     }
   }
 }
 // A rigid wall with brushed metallic stratification and image reflection origin.
 const metal=ctx.createLinearGradient(wallX,0,wallX+Math.max(44,w-wallX),0);
 metal.addColorStop(0,'#b3cdc0');metal.addColorStop(.10,'#46666a');metal.addColorStop(.52,'#223b42');metal.addColorStop(1,'#112c34');
 ctx.fillStyle=metal;ctx.fillRect(wallX,0,w-wallX,h);
 ctx.lineWidth=2;ctx.strokeStyle='#c3e0d3a0';strokeLine(ctx,wallX,0,wallX,h);
 ctx.lineWidth=1;ctx.strokeStyle='#b5e4d41d';
 for(let x=wallX+5;x<w;x+=5)strokeLine(ctx,x,0,x,h);
 for(let y=31;y<h-100;y+=38){ctx.fillStyle='#7d99905e';drawCircle(ctx,wallX+9,y,1.7);ctx.fill()}
 ctx.font='10px Arial';ctx.fillStyle='#bedbd19e';ctx.fillText('СТЕНКА',Math.min(wallX+8,w-74),Math.min(h-149,view.bubbles[0].y+76));
 // Contrast flow cones point at neighboring oscillators, marking interaction.
 for(let i=0;i<solution.geometry.length;i++){
   const item=view.bubbles[i],bubble=point.bubbles[i],r=Math.max(1.7,bubble.radius*scale);
   const isSelected=i===selected;
   const close=clamp((r/item.r-.12)/.9,0,1);
   let glow=ctx.createRadialGradient(item.x-r*.25,item.y-r*.3,0,item.x,item.y,r*2.15);
   glow.addColorStop(0, isSelected?'#ccf8c72e':'#b2ddd515');
   glow.addColorStop(1,'#7fc2bd00');
   ctx.fillStyle=glow;drawCircle(ctx,item.x,item.y,r*2.18);ctx.fill();
   // Physically radial size, optically shaded gas-liquid interface.
   const core=ctx.createRadialGradient(item.x-r*.36,item.y-r*.37,r*.05,item.x+r*.12,item.y+r*.12,r*1.2);
   core.addColorStop(0,'#1f686b');core.addColorStop(.43,'#103640');core.addColorStop(.77,'#1b5d68');
   core.addColorStop(.93,'#77b9b2');core.addColorStop(1,BUBBLE_COLORS[i]);
   ctx.fillStyle=core;drawCircle(ctx,item.x,item.y,r);ctx.fill();
   ctx.strokeStyle=isSelected?'#e5ffe3':'#b6e8da91';ctx.lineWidth=isSelected?2.1:1.25;
   drawCircle(ctx,item.x,item.y,r);ctx.stroke();
   ctx.beginPath();ctx.arc(item.x,item.y,r*.84,3.40,4.72);
   ctx.strokeStyle=isSelected?'#eeffe0b9':'#dafff08c';ctx.lineWidth=Math.max(1.2,r*.07);ctx.stroke();
   if(isSelected){
     ctx.strokeStyle='#d4f9dd8c';ctx.lineWidth=1;
     const extent=r+8;
     for(let angle=0;angle<4;angle++){
       const a=angle*Math.PI*.5+Math.PI*.25;
       const x1=item.x+Math.cos(a)*extent,y1=item.y+Math.sin(a)*extent;
       const x2=item.x+Math.cos(a)*(extent+7),y2=item.y+Math.sin(a)*(extent+7);
       strokeLine(ctx,x1,y1,x2,y2);
     }
   }
   // Collapses create localized brief flashes; the optical timing follows minima.
   const impactTau=solution.individualCollapseUs[i]/solution.scaleUs;
   const phase=point.t-impactTau;
   if(mode!=='ready'&&phase>=0&&phase<.2){
     const strength=Math.max(0,1-phase/.2);
     ctx.strokeStyle='rgba(243,196,128,'+(strength*.65).toFixed(3)+')';
     ctx.lineWidth=Math.max(1,4*strength);
     drawCircle(ctx,item.x,item.y,r+12+(1-strength)*scale*.85);ctx.stroke();
   }
   if(i!==selected){
     ctx.fillStyle='#b4cfc5a8';ctx.font='11px Georgia';ctx.textAlign='center';
     ctx.fillText(String(i+1),item.x,item.y+r+17);
   }
 }
 // Selected measurement uses a real radius and distinguishes bubbles graphically.
 const focus=view.bubbles[selected],q=point.bubbles[selected];
 ctx.strokeStyle='#e7f3d475';ctx.lineWidth=1;ctx.setLineDash([4,5]);
 strokeLine(ctx,focus.x,focus.y,focus.x+Math.max(1.7,q.radius*scale),focus.y);
 ctx.setLineDash([]);
 ctx.fillStyle='#e3f8d5';ctx.font='11px Georgia';ctx.textAlign='center';
 ctx.fillText('R'+(selected+1),focus.x,focus.y+q.radius*scale+23);
 ctx.textAlign='left';
 return view;
}

export function renderCloudGraph(ctx,w,h,solution,tau,activated,selected=0){
 const pad={l:11,r:9,t:7,b:16},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
 ctx.clearRect(0,0,w,h);
 ctx.strokeStyle='#6fafa83c';ctx.lineWidth=1;
 for(let j=0;j<=4;j++)strokeLine(ctx,pad.l,pad.t+j*ph/4,w-pad.r,pad.t+j*ph/4);
 const samples=solution.samples,maxT=Math.max(.01,solution.durationTau);
 for(let k=solution.geometry.length-1;k>=0;k--){
   ctx.beginPath();let started=false;
   for(const s of samples){
     if(activated&&s.t>tau)break;
     const xx=pad.l+pw*s.t/maxT;
     const yy=pad.t+ph*(1-clamp(s.bubbles[k].radius/solution.geometry[k].r0,0,1.16)/1.16);
     if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy);
   }
   ctx.lineWidth=k===selected?2.8:1.4;
   ctx.strokeStyle=activated?BUBBLE_COLORS[k]:(k===selected?'#acc7b09a':'#9cae9b5f');
   ctx.stroke();
 }
 if(activated){
   const x=pad.l+pw*clamp(tau/maxT,0,1);
   ctx.strokeStyle='#edc08c';ctx.lineWidth=1;strokeLine(ctx,x,pad.t,x,h-12);
 }
 ctx.fillStyle='#b9d1c6';ctx.font='9px Arial';
 ctx.fillText('0',pad.l,h-2);ctx.textAlign='right';
 ctx.fillText(Math.round(solution.scaleUs*maxT)+' мкс',w-pad.r,h-2);ctx.textAlign='left';
}
