import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d', { alpha: false });
const $ = id => document.getElementById(id);
const screen = $('modal'), title = $('modalTitle'), body = $('modalBody');
const eyebrow = $('modalEyebrow'), primary = $('primary'), secondary = $('secondary');
const storageKey = 'pocket-works:palomnik:expedition:v1';
const soundKey = 'pocket-works:palomnik:sound:v1';
const TOTAL = 21, MAX_HEAT = 12, MAX_HULL = 3;
const W = 360;
let H = 660, back = document.createElement('canvas'), sky = null;
let mode = 'intro', state, loaded = false, audio = null;
let motion = 0, stride = null, tick = 0, lastTime = 0;
let confirmReturn = 'intro';
let particles = [], targets = [], down = null, toastTimer = 0;
let reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const regions = ['ПЕПЕЛЬНЫЙ ПЕРЕВАЛ', 'ФИОЛЕТОВЫЙ ШТОРМ', 'МЁРЗЛЫЙ РАЗЛОМ'];
const schemes = [
 {sky:['#0c101b','#19202a','#35333d','#67535a','#b26f58','#f4a06c','#ffd0a0'],mount:'#14171f',rock:'#28252b',rim:'#927d7b',glow:'#ffa268',mist:'#c87c78'},
 {sky:['#100f1c','#27223c','#46365e','#755079','#af6a8f','#ed9bb1','#f5c7bb'],mount:'#1a1628',rock:'#30293e',rim:'#9f8aa6',glow:'#e5a3e0',mist:'#ae7dd6'},
 {sky:['#0b1521','#183244','#2b536c','#4783a2','#7ba7be','#c6d4cc','#f6debd'],mount:'#10232c',rock:'#233941',rim:'#8198a3',glow:'#ffb578',mist:'#78b6c7'}
];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const smooth = t => t*t*(3-2*t);
function hash(a,b,c=0) {
 let x = (Math.imul(a|0, 374761393) + Math.imul(b|0, 668265263) + Math.imul(c|0, 1442695041))|0;
 x = Math.imul(x^(x>>>13),1274126177);
 return ((x^(x>>>16))>>>0)/4294967296;
}
function noise(x,y,seed=0) {
 const a=Math.floor(x), b=Math.floor(y), dx=smooth(x-a),dy=smooth(y-b);
 const k=(i,j)=>hash(i,j,seed);
 return lerp(lerp(k(a,b),k(a+1,b),dx),lerp(k(a,b+1),k(a+1,b+1),dx),dy);
}
function rgba(hex,alpha) {
 const v=parseInt(hex.slice(1),16);
 return 'rgba('+((v>>16)&255)+','+((v>>8)&255)+','+(v&255)+','+alpha+')';
}
function rect(x,y,w,h,color) {
 if(w<=0||h<=0) return;
 ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));
}
function poly(points,color) {
 ctx.beginPath();ctx.moveTo(Math.round(points[0][0]),Math.round(points[0][1]));
 for(let i=1;i<points.length;i++)ctx.lineTo(Math.round(points[i][0]),Math.round(points[i][1]));
 ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function stroke(points,color,width=2) {
 ctx.beginPath();ctx.moveTo(Math.round(points[0][0]),Math.round(points[0][1]));
 for(let i=1;i<points.length;i++)ctx.lineTo(Math.round(points[i][0]),Math.round(points[i][1]));
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function circle(x,y,r,c){ctx.beginPath();ctx.arc(Math.round(x),Math.round(y),r,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();}
function text(t,x,y,size=9,color='#f7e3cd',align='center'){ctx.textAlign=align;ctx.font='bold '+size+'px system-ui';ctx.fillStyle=color;ctx.fillText(t,Math.round(x),Math.round(y));}
function hexRgb(hex) {let n=parseInt(hex.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];}
function zone(){return Math.min(2,Math.floor(state.step/7));}
function buildSky() {
 const z=zone(), p=schemes[z], arr=p.sky.map(hexRgb), seed=state.seed;
 const BW=Math.ceil(W/2),BH=Math.ceil(H/2);
 back.width=BW;back.height=BH;
 const c=back.getContext('2d',{alpha:false});
 const im=c.createImageData(BW,BH), px=im.data, bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
 const cx=z===2?240:278, cy=H*.32, scale=H/680;
 for(let y=0;y<BH;y++) for(let x=0;x<BW;x++) {
   const sx=x*2,sy=y*2;
   const i=(y*BW+x)*4, ang=Math.atan2((sy-cy)/scale,(sx-cx)), dist=Math.hypot((sx-cx)*.95,(sy-cy)/scale);
   const broad=noise(sx/83,sy/99,seed)*.47+noise(sx/34,sy/39,seed+4)*.29+noise(sx/12,sy/16,seed+9)*.17+noise(sx/4,sy/5,seed+3)*.07;
   const spiral=Math.sin(dist*.074-ang*4.3+noise(sx/72,sy/71,seed+1)*4.0);
   const swirl=(1-clamp(dist/290,0,1))*(spiral*.34+.03);
   const light=(1-clamp(Math.hypot((sx-(z===0?66:300))/275,(sy-H*.49)/(H*.51)),0,1));
   const h=sy/H;
   let value=clamp(.10+(h*.26)+broad*.72+swirl+light*.12,0,.999);
   if(z===0){value+=.035*Math.sin(sx*.013+sy*.024);}
   if(z===2){value+=.08*(h>.35?1:0);}
   value=clamp(value,0,.999);
   const t=value*(arr.length-1);
   const q=clamp(Math.floor(t+(bayer[(x&3)+((y&3)<<2)]/16-.46)),0,arr.length-1);
   const rgb=arr[q];px[i]=rgb[0];px[i+1]=rgb[1];px[i+2]=rgb[2];px[i+3]=255;
 }
 c.putImageData(im,0,0);
 sky=back;
}
function groundY(row,far=false){return H*.742+(row-1)*(far?72:20);}
function renderMountains(t) {
 const z=zone(),s=schemes[z],h=H*.62;
 for(let layer=0;layer<3;layer++) {
   const points=[[0,H]];
   for(let i=-1;i<=21;i++) {
     const x=i*20, y=h+layer*55+Math.sin(i*.88+layer*2.7+state.seed+state.step*.53)*21+Math.sin(i*.33+layer)*30+hash(i,layer,state.seed+Math.floor(state.step/2))*16;
     points.push([x,y]);
   }
   points.push([W,H]);
   poly(points,layer===0?rgba(s.mount,.95):layer===1?s.rock:'#11151c');
   const off=layer*6;
   for(let i=0;i<80;i++){
     const x=hash(i,layer,state.seed)*W,y=h+layer*55+hash(i,layer+9,state.seed)*105;
     if(y<H-8)rect(x+off,y,hash(i,6)*8+2,hash(i,8)*2+1,rgba(layer===0?s.mist:s.rim,layer===0?.10:.08));
   }
 }
}
function oldRuins(t){
 const z=zone(), s=schemes[z], base=H*.67;
 ctx.save();ctx.globalAlpha=.84;
 // Collapsed palace on the horizon, shifted against the storm.
 const drift=Math.sin(t*.08)*2-(state.step%7)*3;
 const towers=[[-22,base-110,32,80],[20,base-66,18,41],[278,base-123,33,93],[322,base-82,24,59]];
 for(let i=0;i<towers.length;i++){
  const [xx,yy,w,h]=towers[i],x=xx+drift;
  rect(x,yy,w,h,'#1b1c27');
  rect(x,yy,w,3,s.rim);
  for(let a=0;a<3;a++)rect(x+a*(w/3),yy-8,5,12,'#1a1b25');
  for(let r=0;r<4;r++)rect(x+6+(r%2)*12,yy+14+r*16,3,7,rgba(s.glow,.55));
  stroke([[x+w,yy+8],[x+w+8,yy-15]],rgba(s.rim,.65),1);
 }
 poly([[275,base-45],[295,base-90],[314,base-45]],'#121622');
 stroke([[291,base-85],[321,base-103],[360,base-80]],'#676171',2);
 for(let i=0;i<17;i++){
  let x=hash(i,77,state.seed)*W,y=H*.45+hash(i,86,state.seed)*H*.22;
  stroke([[x,y],[x+hash(i,88)*3,y+hash(i,78)*14]],rgba(s.rim,.25),1);
 }
 ctx.restore();
}
function drawFloor(t) {
 const z=zone(),s=schemes[z],y=H*.83;
 poly([[0,y+16],[24,y-8],[80,y+9],[130,y-32],[178,y+12],[230,y-20],[290,y+6],[360,y-17],[360,H],[0,H]],'#10151c');
 for(let i=0;i<55;i++){
   const x=hash(i,15,state.seed+state.step*5)*W, yy=y+hash(i,16,state.seed+state.step*5)*(H-y);
   poly([[x-5,yy+3],[x-1,yy-3],[x+hash(i,17)*15+4,yy+1],[x+13,yy+6]],i%4?'#28303a':s.rim);
 }
 for(let i=0;i<85;i++){
   const x=hash(i,62,state.seed+state.step*5)*W, yy=y+hash(i,63,state.seed+state.step*5)*(H-y);
   rect(x,yy,hash(i,64)*5+1,1,i%5===0?rgba(s.glow,.75):rgba(s.rim,.35));
 }
}
function stoneShape(x,y,k,active,t) {
 const s=schemes[zone()];
 const w=43+(k.row===1?5:0),h=14;
 const px=x, py=y + (reduceMotion?0:Math.sin(t*1.1+k.row*2)*1.1);
 // dangling island of split rock, not UI chips
 poly([[px-w/2,py-3],[px-12,py-11],[px+13,py-8],[px+w/2,py+1],[px+11,py+9],[px-14,py+8]],'#111823');
 poly([[px-w/2,py-4],[px-14,py-16],[px+12,py-15],[px+w/2,py-4],[px+10,py+3],[px-18,py+1]],active?'#737079':'#393844');
 poly([[px-w/2,py-4],[px-14,py-16],[px+12,py-15],[px+19,py-10],[px-14,py-1]],active?'#a19aa1':'#5f5867');
 poly([[px-18,py+1],[px+9,py+3],[px+1,py+26],[px-10,py+19]],'#232634');
 poly([[px+9,py+4],[px+22,py-3],[px+5,py+19]],'#171c27');
 for(let i=0;i<16;i++) {
   const dx=(hash(i,k.col*2+k.row,state.seed)-.5)*w*.85,dy=hash(i,k.row*12+k.col,state.seed)*9-8;
   rect(px+dx,py+dy,2,1,i%4===0?'#d3b4a3':'#585462');
 }
 const color=k.kind==='ember'?'#f7a367':k.kind==='crack'?'#ec6b7b':k.kind==='void'?'#a997d3':'#d2d0b8';
 if(active){
  ctx.globalAlpha=.28+.12*Math.sin(t*3);
  circle(px,py-18,24,color);ctx.globalAlpha=1;
  stroke([[px-18,py-26],[px-9,py-32],[px+9,py-32],[px+18,py-26]],rgba(color,.7),2);
  stroke([[px-18,py-10],[px-9,py-4],[px+9,py-4],[px+18,py-10]],rgba(color,.7),2);
  text((k.row===state.row?'−1':'−2')+' ◆',px,py-42,9,'#fff0d6');
 }
 if(k.kind==='ember'){
  rect(px-4,py-20,9,8,'#aa462e');rect(px-2,py-25,6,9,'#ffaf63');
  rect(px,py-29,3,7,'#fff0bb');rect(px+7,py-16,3,3,'#ffb666');
 } else if(k.kind==='crack'){
  stroke([[px-14,py-10],[px-1,py-9],[px+3,py-1],[px+12,py+2]],'#3a182a',2);
  stroke([[px+1,py-9],[px-1,py-3],[px-5,py]],'#e57972',2);
 } else if(k.kind==='void'){
  rect(px-10,py-12,3,5,'#a398bb');rect(px+12,py-8,4,6,'#7674a2');
  stroke([[px-11,py-20],[px+3,py-24],[px+10,py-29]],rgba(color,.75),1);
 } else {
  rect(px-5,py-20,12,4,'#d7d7cb');rect(px-2,py-26,6,8,'#54596d');
  rect(px-1,py-25,2,4,'#f9cd9a');
 }
 if(!active) {rect(px-14,py-32,28,2,'#4a4049');text('×',px,py-31,17,'#92888e');}
}
function tile(col,row){
 const r=hash(col*13+state.seed,row*17,10);
 let kind=r<.20?'ember':r<.56?'safe':r<.84?'crack':'void';
 // Each step offers at least one stable way across.
 if(row===(col%3)&&r>.63) kind='safe';
 if(col===7||col===14)kind=row===1?'ember':kind;
 return {col,row,kind};
}
function placeTargets() {
 targets=[];
 const x=270, c=state.step+1;
 for(let row=0;row<3;row++){
  const k=tile(c,row);
  k.x=x+(row===1?9:-4);
  k.y=groundY(row,true)+(row===0?-10:row===2?13:0)-14;
  k.active=Math.abs(row-state.row)<=1;
  targets.push(k);
 }
}
function drawPath(t) {
 const s=schemes[zone()];
 const startY=groundY(state.row);
 // Broken giant suspended conduit.
 stroke([[0,startY+19],[55,startY+12],[110,startY+19],[170,startY+36],[200,startY+53]],'#31323b',12);
 stroke([[0,startY+12],[50,startY+5],[105,startY+14],[169,startY+30]],'#686171',4);
 for(let i=0;i<14;i++){
  let x=i*18-9,y=startY+28+Math.sin(i*.44)*11;
  rect(x,y,6,2,rgba(s.rim,.24));
 }
 placeTargets();
 for(const k of targets) {
  stroke([[180,startY+16],[k.x-28,k.y+18]],rgba('#8a7487',k.active?.32:.10),1);
  stoneShape(k.x,k.y,k,k.active,t);
  if(k.active)text(k.row===state.row?'−1':'−2',k.x,k.y+43,11,'#e1d3c7');
 }
 // Looming exit spire in far distance.
 if(state.step>=18) {
  const x=332,y=H*.42;
  poly([[x-12,y+95],[x-9,y+19],[x,y-28],[x+12,y+19],[x+16,y+95]],'#171a25');
  rect(x-3,y-43,6,45,'#ffe1a4');rect(x-1,y-59,2,15,'#f6e2cc');
  ctx.globalAlpha=.24;circle(x,y-28,45,s.glow);ctx.globalAlpha=1;
 }
}
function gear(x,y,r,rotation=0){
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.rotate(rotation);
 circle(0,0,r,'#0e121a');
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4;rect(Math.cos(a)*(r-1)-2,Math.sin(a)*(r-1)-2,4,4,'#b0a5ae');
 }
 circle(0,0,r-4,'#62606e');circle(0,0,r-6,'#252837');circle(0,0,3,'#ddb79a');
 ctx.restore();
}
function building(cx,ground,t) {
 const s=schemes[zone()], sway=reduceMotion?0:Math.sin(t*.74)*1.1;
 const swing=stride?Math.sin(clamp(stride.p,0,1)*Math.PI):0;
 const x=cx+sway+(stride?swing*22:0), y=ground-68-(stride?swing*12:0);
 // Dense atmospheric shadow under machine
 ctx.globalAlpha=.27;ctx.beginPath();ctx.ellipse(x,ground+15,72,13,0,0,7);ctx.fillStyle='#060910';ctx.fill();ctx.globalAlpha=1;
 // Four jointed plated legs, rear pair receding.
 for(let i=0;i<4;i++){
  const ex=x+[-36,-15,22,44][i], hip=x+[-35,-19,26,41][i], back=i===0||i===3;
  const shift=stride?Math.sin(clamp(stride.p,0,1)*Math.PI)*(i%2?16:-20):Math.sin(t*1.5+i)*1.6;
  const knee=[hip+shift*.6,y+26+(back?-4:0)];
  const foot=[ex+shift,ground+3+((stride&&i%2===0)?-swing*10:0)];
  stroke([[hip,y-18],knee,foot],back?'#191b25':'#171a24',back?12:14);
  stroke([[hip-3,y-17],[knee[0]-4,knee[1]],[foot[0]-3,foot[1]]],back?'#5a5568':'#7b7785',back?4:5);
  rect(knee[0]-7,knee[1]-6,13,11,'#222736');circle(knee[0],knee[1],4,'#aaa0a5');
  poly([[foot[0]-13,foot[1]+1],[foot[0]+7,foot[1]-2],[foot[0]+16,foot[1]+5],[foot[0]-13,foot[1]+6]],'#a199a5');
  rect(foot[0]-13,foot[1]+4,28,4,'#242530');
 }
 // Massive mechanical belly, rear hull
 poly([[x-54,y-41],[x-45,y-58],[x+42,y-59],[x+54,y-41],[x+43,y+3],[x-49,y+3]],'#161923');
 poly([[x-55,y-42],[x-52,y-58],[x+48,y-57],[x+55,y-43],[x+43,y-28],[x-46,y-28]],'#565260');
 rect(x-57,y-47,112,6,'#9b91a0');
 rect(x-48,y-28,95,32,'#252936');
 for(let i=0;i<7;i++)rect(x-45+i*15,y-17,9,3,i%2?'#4a4553':'#645969');
 // Dark tiered walking cathedral core
 poly([[x-50,y-55],[x-38,y-92],[x-22,y-106],[x+22,y-106],[x+44,y-87],[x+51,y-55]],'#252630');
 poly([[x-47,y-56],[x-35,y-90],[x-19,y-100],[x-8,y-96],[x-20,y-53]],'#5b5869');
 poly([[x-10,y-94],[x+22,y-105],[x+44,y-87],[x+45,y-53],[x-8,y-53]],'#383843');
 // Brick bands.
 for(let i=0;i<7;i++){
  const yy=y-89+i*7;
  for(let j=0;j<7;j++){
   const xx=x-30+j*11+(i%2)*5;
   if(xx < x+37)rect(xx,yy,6,1,i%3?'#6d6573':'#a79ba3');
  }
 }
 // Side buttresses and balconies
 for(let i of [-1,1]){
  const bx=x+i*36;
  rect(bx-9,y-106,17,58,'#2b2b36');
  rect(bx-11,y-99,21,4,'#867985');
  poly([[bx-12,y-106],[bx-3,y-125],[bx+10,y-106]],'#171923');
  rect(bx-3,y-121,3,13,'#c39ca3');
  rect(bx-3,y-93,6,13,'#f4ad6d');
  rect(bx-1,y-92,2,10,'#fff0ac');
  rect(bx-13,y-65,26,4,'#8a7b8c');
  for(let j=0;j<3;j++)rect(bx-12+j*9,y-74,4,8,'#1b1c29');
 }
 // Roof plates and central bell spire
 poly([[x-29,y-107],[x-22,y-122],[x+19,y-129],[x+33,y-110],[x+21,y-103]],'#151a23');
 poly([[x-26,y-112],[x-18,y-121],[x+18,y-124],[x+29,y-111]],'#767082');
 for(let i=0;i<15;i++)rect(x-21+i*3,y-118-i*.17,2,2,i%4===0?'#c7abb0':'#514d62');
 rect(x-13,y-162,26,47,'#2e2d38');
 rect(x-17,y-143,34,4,'#9b8a97');
 poly([[x-19,y-162],[x,y-188],[x+19,y-162]],'#1b202b');
 poly([[x-16,y-162],[x,y-184],[x,y-162]],'#777182');
 rect(x-1,y-209,3,25,'#d9c2b9');rect(x-10,y-201,21,3,'#c3b9c6');
 // Lantern protected inside belfry
 rect(x-6,y-149,12,17,'#763e37');rect(x-4,y-147,8,13,'#ffab67');
 rect(x-2,y-147,4,8,'#fff2b1');
 rect(x-8,y-128,16,4,'#c5b3b0');
 // Floating smoke and mechanical exhaust
 for(let i=0;i<6;i++){
  const px=x-32+Math.sin(t*.33+i*1.7)*6-i*1.5,py=y-138-i*14-t%20;
  circle(px,py,7+i*1.65,rgba(i%2?'#4b4855':'#797185',.20-i*.012));
 }
 // Front balconies and glowing portholes
 rect(x-56,y-48,114,5,'#aba4ad');rect(x-53,y-44,108,5,'#393541');
 for(let i=0;i<5;i++){
  const bx=x-37+i*18;
  rect(bx-5,y-65,12,16,'#101822');
  rect(bx-3,y-63,8,11,i%2?'#e58f63':'#fbb776');
  rect(bx-1,y-62,4,8,'#ffe0a3');
  rect(bx-6,y-49,14,3,'#756c7a');
 }
 for(let i=0;i<7;i++)rect(x-48+i*16,y-52,3,8,'#aaa0ad');
 gear(x+24,y-27,13,t*.15);
 gear(x-31,y-32,8,-t*.22);
 // Ancient railings
 stroke([[x-51,y-72],[x-66,y-83],[x-68,y-100]],'#9c8e9c',2);
 stroke([[x+50,y-72],[x+66,y-85],[x+68,y-96]],'#a69fa7',2);
 for(let i=0;i<10;i++)rect(x-50+i*11,y-58,3,4,'#b5a4a2');
 // Studs, dithered stone marks
 for(let i=0;i<160;i++){
  const xx=x-48+hash(i,1,13)*96, yy=y-100+hash(i,2,13)*83;
  if((yy>y-83&&yy<y-58)||(yy>y-42&&yy<y-11))
    rect(xx,yy,hash(i,3,13)*3+1,1,i%4?'#776e78':'#b9a4a9');
 }
}
function drawRain(t){
 const s=schemes[zone()];
 ctx.save();
 for(let i=0;i<63;i++){
  const phase=hash(i,41,state.seed);
  const xx=(phase*W+t*(8+hash(i,42)*14)+state.step*8)% (W+40)-20;
  const yy=(hash(i,44,state.seed)*H+t*(42+hash(i,43)*53))%(H+50)-25;
  const c=i%5===0?s.glow:s.rim;
  stroke([[xx,yy],[xx-3,yy+6+(i%3)*3]],rgba(c,i%4===0?.35:.17),1);
 }
 for(const p of particles) {
  rect(p.x,p.y,p.r,p.r,p.c);
 }
 ctx.restore();
}
function draw(){
 if(!sky)buildSky();
 ctx.imageSmoothingEnabled=false;ctx.drawImage(sky,0,0,W,H);
 const p=schemes[zone()];
 ctx.globalAlpha=.13;circle(288,H*.26,50,p.glow);ctx.globalAlpha=1;
 renderMountains(tick);oldRuins(tick);drawFloor(tick);drawPath(tick);
 const ground=groundY(state.row)+4;
 building(103,ground,tick);
 drawRain(tick);
 if(stride){
  ctx.globalAlpha=1-stride.p;
  for(let i=0;i<12;i++){
   const dx=hash(i,2)*65-20;
   rect(103+dx,ground+hash(i,3)*8,2+i%3,1,'#f0b583');
  }
  ctx.globalAlpha=1;
 }
}
function animate(now){
 const delta=Math.min(.05,(now-lastTime)/1000||.016);lastTime=now;
 if(!document.hidden) {
  tick+=Math.min(delta,.05);
  if(stride) {
   stride.p=clamp((now-stride.time)/(reduceMotion?100:650),0,1);
   if(stride.p>=1){const k=stride.target;stride=null;applyStep(k);}
  }
  for(const p of particles){p.x+=p.vx*delta;p.y+=p.vy*delta;p.life-=delta;}
  particles=particles.filter(p=>p.life>0);
  draw();
 }
 requestAnimationFrame(animate);
}
function burst(x,y,c){
 for(let i=0;i<28;i++){
  const a=hash(i,81)*Math.PI*2,v=22+hash(i,82)*80;
  particles.push({x,y,r:1+hash(i,83)*3,c,vx:Math.cos(a)*v,vy:Math.sin(a)*v-28,life:.55+hash(i,84)*.6});
 }
}
function beep(kind){
 if(!state.sound)return;
 try{
  audio ||= new (window.AudioContext||window.webkitAudioContext)();
  if(audio.state==='suspended')audio.resume();
  const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
  oscillator.type=kind==='hit'?'sawtooth':'triangle';
  oscillator.frequency.setValueAtTime(kind==='hit'?122:kind==='win'?392:230,now);
  oscillator.frequency.exponentialRampToValueAtTime(kind==='hit'?65:kind==='win'?880:120,now+.18);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.055,now+.015);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.29);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now);oscillator.stop(now+.32);
 }catch{}
}
function effect(x,y,c,kind){burst(x,y,c);beep(kind)}
function inform(message){
 clearTimeout(toastTimer);const el=$('toast');el.textContent=message;el.classList.add('show');
 toastTimer=setTimeout(()=>el.classList.remove('show'),1450);
}
function save(){
 try{localStorage.setItem(storageKey,JSON.stringify({step:state.step,row:state.row,heat:state.heat,hull:state.hull,seed:state.seed,finished:state.finished||false}));}catch{}
}
function read(){
 try{
  const s=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(s&&Number.isInteger(s.step)&&s.step>=0&&s.step<TOTAL&&Number.isInteger(s.row)&&s.row>=0&&s.row<=2&&Number.isInteger(s.heat)&&s.heat>0&&s.heat<=MAX_HEAT&&Number.isInteger(s.hull)&&s.hull>0&&s.hull<=MAX_HULL&&Number.isInteger(s.seed))return s;
 }catch{}
 return null;
}
function newState(){
 return {step:0,row:1,heat:MAX_HEAT,hull:MAX_HULL,seed:Math.floor(Math.random()*999999)+1,finished:false,sound:state?.sound??false};
}
function updateHud(){
 $('heatText').textContent=state.heat;
 $('heatFill').style.width=(state.heat/MAX_HEAT*100)+'%';
 $('hullText').textContent=state.hull;
 $('hullFill').style.width=(state.hull/MAX_HULL*100)+'%';
 $('region').textContent=regions[zone()];
 $('progress').textContent=state.step+' / '+TOTAL;
 $('hint').hidden=mode!=='playing'||state.step>1;
 $('hud').hidden=mode==='intro';
 $('waypoint').hidden=mode==='intro';
 $('pause').hidden=mode==='intro'||mode==='win'||mode==='dead';
 $('sound').setAttribute('aria-label',state.sound?'Отключить звук':'Включить звук');
 $('sound').textContent=state.sound?'♫':'♪';
 $('sound').style.color=state.sound?'#ffc68c':'#bbb0b0';
}
function showModal(kind){
 mode=kind;screen.hidden=false;secondary.hidden=true;
 if(kind==='intro') {
  eyebrow.textContent='ЭКСПЕДИЦИЯ · I';title.textContent='ПАЛОМНИК';
  body.textContent='Проведи шагающую крепость через три мёртвых неба. Коснись опоры. Прямой шаг стоит 1 жар, боковой — 2. Береги корпус.';
  primary.firstChild.textContent=loaded?'ПРОДОЛЖИТЬ ПУТЬ ':'НАЧАТЬ ПУТЬ ';
  if(loaded){secondary.hidden=false;secondary.textContent='НАЧАТЬ ЗАНОВО';}
 }else if(kind==='paused'){
  eyebrow.textContent=regions[zone()];title.textContent='ПРИВАЛ';
  body.textContent='Шаг '+state.step+' из '+TOTAL+'. Экспедиция сохранена.';
  primary.firstChild.textContent='ПРОДОЛЖИТЬ ';
  secondary.hidden=false;secondary.textContent='НАЧАТЬ ЗАНОВО';
 }else if(kind==='confirm'){
  eyebrow.textContent='ПРОЩАНИЕ С ПУТЁМ';title.textContent='ЗАНОВО?';
  body.textContent='Текущая экспедиция будет потеряна. Это действие нельзя отменить.';
  primary.firstChild.textContent='СОХРАНИТЬ ПУТЬ ';
  secondary.hidden=false;secondary.textContent='СБРОСИТЬ И НАЧАТЬ';
 }else if(kind==='win'){
  eyebrow.textContent='ПОСЛЕДНИЙ МАЯК';title.textContent='ТЫ ДОШЁЛ';
  body.textContent='Крепость прошла все три небосвода. Осталось жара: '+state.heat+'. Корпус: '+state.hull+'. Следующая история ждёт за горизонтом.';
  primary.firstChild.textContent='НОВАЯ ЭКСПЕДИЦИЯ ';
 }else if(kind==='dead'){
  eyebrow.textContent='ЭКСПЕДИЦИЯ ЗАКОНЧЕНА';title.textContent='ХОДОК ПАЛ';
  body.textContent=(state.heat<=0?'Жар угас.':'Корпус не выдержал.')+' Ты прошёл '+state.step+' из '+TOTAL+' переходов.';
  primary.firstChild.textContent='ПОПРОБОВАТЬ ЕЩЁ ';
 }
 updateHud();
}
function begin(fresh=false){
 if(fresh)state=newState();
 loaded=false;mode='playing';screen.hidden=true;
 save();sky=null;buildSky();updateHud();
}
function applyStep(k){
 if(mode!=='playing')return;
 const movingSideways=k.row!==state.row;
 state.step++;state.row=k.row;state.heat=clamp(state.heat-(movingSideways?2:1),0,MAX_HEAT);
 let message='Опора выдержала';
 if(k.kind==='ember'){state.heat=clamp(state.heat+3,0,MAX_HEAT);message='+3 жара';}
 if(k.kind==='crack'){state.hull=clamp(state.hull-1,0,MAX_HULL);message='−1 корпус';}
 if(k.kind==='void'){state.heat=clamp(state.heat-3,0,MAX_HEAT);message='−3 жара';}
 if(state.step===7||state.step===14){
  state.heat=clamp(state.heat+2,0,MAX_HEAT);
  state.hull=clamp(state.hull+1,0,MAX_HULL);
  message='ПРИВАЛ · +2 ЖАРА · +1 КОРПУС';
 }
 effect(103,groundY(state.row)-30,k.kind==='ember'?'#ffbc74':k.kind==='crack'?'#e07a8b':'#c1abcf',k.kind==='crack'?'hit':'step');
 if(state.hull<=0||state.heat<=0){
  mode='dead';save();showModal('dead');beep('hit');
 }else if(state.step>=TOTAL){
  mode='win';try{localStorage.removeItem(storageKey)}catch{};showModal('win');beep('win');
 }else{
  if(state.step===7||state.step===14){sky=null;buildSky();}
  save();updateHud();inform(message);
 }
}
function choose(x,y){
 if(mode!=='playing'||stride)return;
 let best=null,d=Infinity;
 for(const k of targets){
   const dx=(x-k.x),dy=(y-(k.y-15));
   const dd=Math.hypot(dx*.84,dy);
   if(dd<d){d=dd;best=k;}
 }
 if(!best||d>39)return;
 if(!best.active){inform('Слишком далеко для шага');beep('hit');return;}
 stride={time:performance.now(),p:0,target:{...best}};
 effect(best.x,best.y-18,best.kind==='ember'?'#ffc28a':'#d1bdaf','step');
}
canvas.addEventListener('pointerdown',event=>{
 if(mode!=='playing')return;
 event.preventDefault();down={id:event.pointerId,x:event.clientX,y:event.clientY};
 try{canvas.setPointerCapture(event.pointerId)}catch{}
});
canvas.addEventListener('pointerup',event=>{
 if(!down||down.id!==event.pointerId)return;
 const distance=Math.hypot(event.clientX-down.x,event.clientY-down.y);
 down=null;
 if(distance>15)return;
 const r=canvas.getBoundingClientRect();
 choose((event.clientX-r.left)*W/r.width,(event.clientY-r.top)*H/r.height);
});
canvas.addEventListener('pointercancel',()=>down=null);
canvas.addEventListener('lostpointercapture',()=>down=null);
$('pause').addEventListener('click',()=>{if(mode==='playing'&&!stride)showModal('paused')});
$('sound').addEventListener('click',()=>{
 state.sound=!state.sound;try{localStorage.setItem(soundKey,state.sound?'1':'0')}catch{}
 updateHud();if(state.sound)beep('step');
});
primary.addEventListener('click',()=>{
 if(mode==='intro')begin(false);
 else if(mode==='paused')begin(false);
 else if(mode==='confirm')showModal(confirmReturn);
 else if(mode==='win'||mode==='dead')begin(true);
});
secondary.addEventListener('click',()=>{
 if(mode==='confirm')begin(true);
 else if(mode==='intro'||mode==='paused'){confirmReturn=mode;showModal('confirm');}
});
document.addEventListener('keydown',event=>{
 if(['1','2','3'].includes(event.key)&&mode==='playing'){
  const k=targets[Number(event.key)-1];if(k)choose(k.x,k.y-15);
 }
 if(event.key==='Escape'){
  if(mode==='playing'&&!stride)showModal('paused');
  else if(mode==='paused')begin(false);
  else if(mode==='confirm')showModal('paused');
 }
});
function resize(){
 const r=canvas.getBoundingClientRect();
 if(!r.width||!r.height)return;
 H=clamp(Math.round(W*r.height/r.width),470,900);
 canvas.width=W;canvas.height=H;
 sky=null;buildSky();
}
window.addEventListener('resize',resize,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(resize,250));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing'){
 if(stride){const target=stride.target;stride=null;applyStep(target);}
 if(mode==='playing')showModal('paused');
}});
try{reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches}catch{}
const previous=read(), soundSetting=(()=>{try{return localStorage.getItem(soundKey)==='1'}catch{return false}})();
state=previous?{...previous,sound:soundSetting}:newState();
state.sound=soundSetting;
loaded=!!previous;
resize();
showModal('intro');
requestAnimationFrame(animate);
