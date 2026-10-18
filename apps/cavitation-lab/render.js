const TAU = Math.PI * 2;
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const rand = i => { const t = Math.sin(i*127.1+51.8)*43758.5453; return t-Math.floor(t); };

export function resizeCanvas(canvas, limit=2) {
 const box=canvas.getBoundingClientRect();
 const dpr=Math.min(limit,Math.max(1,window.devicePixelRatio||1));
 const w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
 const ctx=canvas.getContext('2d');
 ctx.setTransform(dpr,0,0,dpr,0,0);
 return {ctx,w:box.width,h:box.height,dpr};
}

export function sceneMetrics(w,h,standOff) {
 const margin= Math.max(20,w*0.045);
 const r=Math.min(w*0.162,(h-110)*0.235,(w-2*margin)/(standOff+2.35));
 const cx=(w-standOff*r)/2;
 return {w,h,baseRadius:r,cx,cy:Math.max(115,(h-100)*0.515),wallX:cx+standOff*r};
}
function line(ctx,x1,y1,x2,y2) {ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function ellipse(ctx,x,y,rx,ry) {ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU)}
function rgba(r,g,b,a){return 'rgba('+r+','+g+','+b+','+a+')'}

export function renderScene(ctx,w,h,solution,point,phase,elapsed) {
 const {standOff}=solution.config;
 const geo=sceneMetrics(w,h,standOff), {cx,cy,wallX,baseRadius}=geo;
 const radius=Math.max(2.4,baseRadius*point.radius);
 const minT=solution.firstMinimumTau;
 const approach=clamp((point.t/minT-0.55)/0.48,0,1);
 const impact=phase!=='ready'&&point.t>=minT;
 const post=Math.max(0,(point.t-minT));
 ctx.clearRect(0,0,w,h);
 let g=ctx.createLinearGradient(0,0,w,h);
 g.addColorStop(0,'#1a454a');g.addColorStop(.43,'#10353e');g.addColorStop(1,'#09252c');
 ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 g=ctx.createRadialGradient(cx-40,cy-85,0,cx,cy,Math.max(w,h)*.7);
 g.addColorStop(0,'rgba(105,183,173,.18)');g.addColorStop(.65,'rgba(16,47,56,.05)');g.addColorStop(1,'rgba(2,21,28,.55)');
 ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 // Water-window depth, faint graticule, suspended particles, caustic rays.
 ctx.lineWidth=1;ctx.strokeStyle='#a9e2d50d';
 for(let y=22;y<h;y+=36) line(ctx,0,y,w,y);
 for(let x=18;x<w;x+=36) line(ctx,x,0,x,h);
 for(let i=0;i<80;i++){
  const px=rand(i)*w,py=rand(i+233)*h;
  const alpha=.05+rand(i+12)*.14;
  const size=.3+rand(i+17)*1.4;
  ctx.fillStyle=rgba(192,230,218,alpha);
  ctx.fillRect(px,py,size,size);
 }
 ctx.save();ctx.globalCompositeOperation='screen';
 for(let i=0;i<4;i++){
  const ox=cx-baseRadius*1.1+(i-1)*baseRadius*.65;
  g=ctx.createLinearGradient(ox-20,0,ox+110,h);
  g.addColorStop(0,'rgba(180,233,213,.04)');
  g.addColorStop(.45,'rgba(120,210,189,.014)');
  g.addColorStop(1,'rgba(120,210,189,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(ox,0);ctx.lineTo(ox+90,h);ctx.lineTo(ox+146,h);ctx.lineTo(ox+16,0);ctx.closePath();ctx.fill();
 }
 ctx.restore();
 // Measuring rails show scale rather than implying a real-time pressure field.
 ctx.strokeStyle='#a3c9bd4a';ctx.lineWidth=1;
 let railX=Math.max(22,Math.min(cx-baseRadius-30, w*.14));
 for(let i=-5;i<=5;i++){
  const tickY=cy+i*baseRadius*.3;
  const major=i%2===0;
  line(ctx,railX,tickY,railX+(major?11:6),tickY);
 }
 ctx.fillStyle='#a7c9b6aa';ctx.font='10px Arial';ctx.fillText('ШКАЛА',railX,cy-baseRadius*1.85);
 // Fixed rigid wall. Recessed seam, hand-drag grip and contact stain.
 const metal=ctx.createLinearGradient(wallX,0,Math.min(w,wallX+55),0);
 metal.addColorStop(0,'#9cb2ad');metal.addColorStop(.09,'#3d5a60');metal.addColorStop(.28,'#213a40');metal.addColorStop(1,'#0e282e');
 ctx.fillStyle=metal;ctx.fillRect(wallX,0,w-wallX,h);
 ctx.strokeStyle='#d0e0d195';ctx.lineWidth=2;line(ctx,wallX,0,wallX,h);
 ctx.strokeStyle='#73918a27';ctx.lineWidth=1;
 for(let x=wallX+7;x<w;x+=5)line(ctx,x,0,x,h);
 for(let y=27;y<h;y+=53){
   ctx.fillStyle='#546e72';ellipse(ctx,wallX+13,y,2,2.3);ctx.fill();
   ctx.fillStyle='#a6beb7';ellipse(ctx,wallX+12.4,y-.7,.75,.75);ctx.fill();
 }
 ctx.fillStyle='#cfdfd1aa';ctx.font='10px Arial';ctx.textAlign='right';
 ctx.fillText('СТЕНКА',Math.min(w-14,wallX+80),Math.max(130,cy-baseRadius-45));
 ctx.textAlign='left';
 // Stand-off indicator on top of bubble.
 ctx.save();ctx.strokeStyle='#b6e0cb79';ctx.lineWidth=1;ctx.setLineDash([3,5]);
 let guideY=cy-baseRadius*1.7;
 line(ctx,cx,guideY,wallX,guideY);ctx.setLineDash([]);
 line(ctx,cx,guideY-4,cx,guideY+4);line(ctx,wallX,guideY-4,wallX,guideY+4);
 ctx.font='11px Georgia';ctx.textAlign='center';ctx.fillStyle='#c9dcd4b0';
 ctx.fillText('γ = '+standOff.toFixed(2), (cx+wallX)/2,guideY-8);ctx.restore();
 // Volume lighting around collapsing bubble.
 let halo=ctx.createRadialGradient(cx,cy,radius*.32,cx,cy,baseRadius*2.2);
 halo.addColorStop(0,rgba(135,244,217,.1+approach*.12));
 halo.addColorStop(.45,'rgba(67,191,180,.06)');halo.addColorStop(1,'rgba(67,191,180,0)');
 ctx.fillStyle=halo;ellipse(ctx,cx,cy,baseRadius*2.35,baseRadius*2.35);ctx.fill();
 // Shock wave is a didactic ring, not an acoustic solver.
 if(impact){
   const expansion=clamp(post*.93,0,1.4),outer=baseRadius*.5+expansion*Math.max(w,h)*.86;
   ctx.strokeStyle=rgba(240,230,180,.75*(1-clamp(post/1.2,0,.98)));ctx.lineWidth=2.5*(1-clamp(post/1.4,0,.9));
   ellipse(ctx,cx,cy,outer,outer);ctx.stroke();
   ctx.strokeStyle=rgba(124,237,223,.34*(1-clamp(post/1.2,0,.98)));ctx.lineWidth=10;
   ellipse(ctx,cx,cy,Math.max(5,outer-5),Math.max(5,outer-5));ctx.stroke();
   const flash=Math.max(0,1-post*13);
   if(flash){ctx.fillStyle=rgba(248,228,184,flash*.65);ctx.fillRect(0,0,w,h);}
 }
 // Shadows at rigid boundary and schematic toward-wall microjet.
 const jet=solution.jetFactor;
 if(jet>.03&&approach>.1){
   const wallGlow=ctx.createRadialGradient(wallX,cy,0,wallX,cy,baseRadius*.95);
   wallGlow.addColorStop(0,rgba(246,174,106,jet*approach*.29));
   wallGlow.addColorStop(1,'rgba(246,174,106,0)');
   ctx.fillStyle=wallGlow;ellipse(ctx,wallX,cy,baseRadius*.85,baseRadius);ctx.fill();
 }
 // Bubble body uses multiple refraction and rim layers; 2D meridional depiction.
 let deform=jet*approach*.2;
 const shape=(ang,extra=0)=>{
  const side=Math.cos(ang);
  const squash=1-deform*Math.max(0,-side);
  return [cx+(radius+extra)*Math.cos(ang)*squash, cy+(radius+extra)*Math.sin(ang)*(1+.04*Math.sin(ang*3)*approach)];
 };
 const path=(extra=0)=>{
   ctx.beginPath();
   for(let i=0;i<=96;i++){
     const [x,y]=shape(i/96*TAU,extra);
     if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.closePath();
 };
 ctx.save();
 path(6);ctx.strokeStyle=rgba(143,244,222,.18);ctx.lineWidth=11;ctx.stroke();
 path();
 const inner=ctx.createRadialGradient(cx-radius*.33,cy-radius*.35,radius*.08,cx+radius*.16,cy+radius*.12,radius*1.2);
 inner.addColorStop(0,'rgba(18,77,79,.84)');inner.addColorStop(.42,'rgba(6,36,45,.99)');inner.addColorStop(.75,'rgba(11,55,63,.98)');inner.addColorStop(.93,'rgba(90,186,175,.89)');inner.addColorStop(1,'rgba(207,251,222,.96)');
 ctx.fillStyle=inner;ctx.fill();
 ctx.clip();
 const band=ctx.createLinearGradient(cx-radius,cy-radius,cx+radius,cy+radius);
 band.addColorStop(0,'rgba(250,255,226,.63)');band.addColorStop(.2,'rgba(192,249,228,.02)');band.addColorStop(.75,'rgba(4,49,60,0)');band.addColorStop(1,'rgba(161,247,235,.31)');
 ctx.lineWidth=Math.max(1,radius*.13);ctx.strokeStyle=band;
 ellipse(ctx,cx-radius*.07,cy-radius*.06,radius*.82,radius*.91);ctx.stroke();
 let glint=ctx.createRadialGradient(cx-radius*.32,cy-radius*.48,0,cx-radius*.32,cy-radius*.48,radius*.56);
 glint.addColorStop(0,'rgba(235,255,228,.28)');glint.addColorStop(1,'rgba(235,255,228,0)');
 ctx.fillStyle=glint;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
 ctx.restore();
 path();ctx.strokeStyle='#bcfff0b8';ctx.lineWidth=Math.max(1.3,radius*.026);ctx.stroke();
 // Refraction arc and bubble specular.
 ctx.beginPath();ctx.arc(cx,cy,radius*.86,Math.PI*.95,Math.PI*1.47);ctx.strokeStyle='rgba(241,255,223,.83)';ctx.lineWidth=Math.max(1.2,radius*.037);ctx.stroke();
 ctx.beginPath();ctx.arc(cx,cy,radius*.9,-.18,.38);ctx.strokeStyle='rgba(176,244,230,.28)';ctx.lineWidth=2;ctx.stroke();
 if(jet>.05 && approach>.55){
   // The drawn jet deliberately does not alter the spherical ODE.
   const progress=clamp((approach-.55)/.45,0,1);
   const start=cx-radius*.78;
   const finish=cx+radius*(.2+1.0*progress);
   ctx.save();path();ctx.clip();
   ctx.beginPath();ctx.moveTo(start,cy-6*progress);
   ctx.quadraticCurveTo(cx,cy-radius*.22,finish,cy);
   ctx.quadraticCurveTo(cx,cy+radius*.22,start,cy+6*progress);
   ctx.closePath();
   ctx.fillStyle=rgba(135,243,219,progress*.8);
   ctx.fill();ctx.restore();
   ctx.strokeStyle=rgba(226,255,232,progress*.7);ctx.lineWidth=1.2;line(ctx,start,cy,Math.min(finish,wallX),cy);
 }
 if(impact){
   const f=Math.max(0,1-post*8);
   if(f>0){
    const flare=ctx.createRadialGradient(cx,cy,0,cx,cy,baseRadius*.8);
    flare.addColorStop(0,rgba(255,247,207,f*.98));flare.addColorStop(.2,rgba(250,190,112,f*.72));flare.addColorStop(1,'rgba(255,195,125,0)');
    ctx.fillStyle=flare;ellipse(ctx,cx,cy,baseRadius,baseRadius);ctx.fill();
   }
 }
 // Scale bar, tied to actual starting radius (one initial R0).
 const barW=baseRadius,barY=Math.min(h-(w<=830?131:170),cy+baseRadius*1.72);
 ctx.strokeStyle='#d1ecdc99';ctx.lineWidth=2;
 line(ctx,cx-barW/2,barY,cx+barW/2,barY);line(ctx,cx-barW/2,barY-4,cx-barW/2,barY+4);line(ctx,cx+barW/2,barY-4,cx+barW/2,barY+4);
 ctx.fillStyle='#d1ecdcaa';ctx.font='10px Georgia';ctx.textAlign='center';
 ctx.fillText(solution.config.radiusMm.toFixed(2)+' мм',cx,barY+16);ctx.textAlign='left';
 return geo;
}

export function renderGraph(ctx,w,h,solution,tau,activated){
 const pad={l:17,r:9,t:5,b:15},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
 ctx.clearRect(0,0,w,h);
 ctx.strokeStyle='#7eafa94a';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){
   const y=pad.t+ph*i/4;
   line(ctx,pad.l,y,pad.l+pw,y);
 }
 for(let i=0;i<=4;i++){
  const x=pad.l+pw*i/4;line(ctx,x,pad.t,x,pad.t+ph);
 }
 const samples=solution.samples,d=solution.durationTau;
 ctx.beginPath();let first=true;
 for(let i=0;i<samples.length;i++){
  const s=samples[i];if(activated&&s.t>tau)break;
  const x=pad.l+pw*s.t/d,y=pad.t+ph*(1-clamp(s.radius,0,1.15)/1.15);
  if(first){ctx.moveTo(x,y);first=false}else ctx.lineTo(x,y);
 }
 ctx.strokeStyle=activated?'#b8f9db':'#79a29a66';ctx.lineWidth=2;ctx.stroke();
 if(activated){
   const cursorX=pad.l+pw*clamp(tau/d,0,1);
   ctx.strokeStyle='#ebb56a';line(ctx,cursorX,pad.t,cursorX,pad.t+ph);
   const s=solution.samples.find(e=>e.t>=tau)||samples[samples.length-1];
   const y=pad.t+ph*(1-clamp(s.radius,0,1.15)/1.15);
   ctx.fillStyle='#f6c57e';ellipse(ctx,cursorX,y,3.5,3.5);ctx.fill();
 }
 ctx.fillStyle='#9fc2b7';ctx.font='9px Arial';ctx.textBaseline='bottom';
 ctx.fillText('0',pad.l,h);ctx.textAlign='right';ctx.fillText(Math.round(d*solution.scaleUs)+' мкс',w-4,h);ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
