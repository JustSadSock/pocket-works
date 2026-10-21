// PEREKOS — The sunken dueling court. Static art, rendered once at 400×620.
import {carveStoneFloor,carveButtressFace} from './court-materials.mjs';
import {renderForgeCourt,drawForgeCourtAtmosphere} from './forge-court.mjs';
// No network, randomness from Math.random, or gameplay state is consulted.
export const ART_WIDTH=400,ART_HEIGHT=620;
const hash=n=>{let x=n>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
const px=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))};
function stroke(c,path,width,color){
 c.beginPath();c.moveTo(path[0][0],path[0][1]);
 for(let k=1;k<path.length;k++)c.lineTo(path[k][0],path[k][1]);
 c.lineWidth=width;c.strokeStyle=color;c.stroke();
}
function mosaic(c){
 px(c,0,0,400,620,'#111d1c');
 // The court is sunk one step into the surrounding ruined stone, never a
 // wallpaper sheet. The negative-space border makes the center feel deep.
 for(let tier=0;tier<4;tier++){
  const inset=tier*4;
  px(c,6+inset,6+inset,388-inset*2,608-inset*2,
    ['#10191a','#293432','#596052','#202d2b'][tier]);
 }
 px(c,23,23,354,574,'#343e36');
 px(c,29,29,342,562,'#39483c');
 // Hand-laid irregular, worn flagstones and grout; different sizes per row.
 let y=31,row=0;
 while(y<591){
  const height=19+(row%3)*5;let x=29-(row%3)*11,i=0;
  while(x<371){
   const width=28+Math.floor(hash(row*101+i*53+72)*22);
   const key=hash(row*547+i*29+5);
   const colors=['#465347','#404e42','#52604b','#475447','#3b4b40','#56624f'];
   px(c,x+1,y+1,width-2,height-2,colors[Math.floor(key*colors.length)]);
   px(c,x+2,y+2,width-4,1,'#70806745');
   px(c,x+3,y+height-5,width-6,3,'#22372e6c');
   if(key>.59){
    stroke(c,[[x+width*.25,y+height*.64],[x+width*.52,y+height*.42],[x+width*.67,y+height*.49]],1,'#273b33a4');
   }
   if(key<.3)px(c,x+4+key*9,y+6,2+key*7,1,'#8b947059');
   x+=width;i++;
  }
  y+=height;row++;
 }
 // An inlaid compass/ring was installed in the court long ago.
 for(const [radius,col,w] of [[130,'#697362',4],[126,'#232f2b',3],[103,'#596a57',2],[51,'#6e7259',3],[48,'#253a34',3]]){
  c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.ellipse(200,310,radius,radius*.78,0,0,Math.PI*2);c.stroke();
 }
 for(let n=0;n<12;n++){
  const angle=Math.PI*2*n/12;
  const x=200+Math.cos(angle)*127,y=310+Math.sin(angle)*99;
  const ux=Math.cos(angle),uy=Math.sin(angle);
  stroke(c,[[x-ux*7,y-uy*6],[x+ux*6,y+uy*5]],2,n%3?'#85907867':'#b6a77c99');
 }
 // Sunken eight-point seal, not a glowing game UI circle.
 for(let n=0;n<8;n++){
  const angle=n*Math.PI/4,outer=36,inner=14;
  stroke(c,[[200+Math.cos(angle)*outer,310+Math.sin(angle)*outer*.8],
            [200+Math.cos(angle+.39)*inner,310+Math.sin(angle+.39)*inner*.8],
            [200+Math.cos(angle+.785)*outer,310+Math.sin(angle+.785)*outer*.8]],2,'#9a957067');
 }
 px(c,196,305,8,8,'#a6997060');px(c,199,307,2,4,'#283a33');
 // Uneven court edges: three stacked masonry depths, cracks and moss.
 for(let n=0;n<2;n++){
  const side=n?378:22;
  px(c,side-8,20,9,581,'#1b2b29');
  px(c,side-5,23,5,574,'#777b60');
  px(c,side-5,23,2,574,'#9b9975');
  for(let i=0;i<21;i++){
   const yy=27+i*27,stagger=i%2?5:0;
   px(c,side-7,yy+stagger,8,3,'#25342f');
   if(hash(i+n*33)>.57)px(c,side+(n?-2:1),yy+7,3,7,'#6c8275');
  }
 }
 for(let side of [21,597]){
  px(c,23,side-8,354,8,'#1a2927');px(c,23,side-3,354,5,'#777860');
  for(let i=0;i<11;i++)px(c,27+i*34,side-7,4,7,'#2a3731');
 }
 // Four inset drain grates catch the low afternoon light.
 for(const [x,y] of [[38,49],[362,58],[37,569],[362,570]]){
  px(c,x-10,y-8,20,18,'#1d2c2a');
  px(c,x-9,y-8,18,3,'#8c886d');px(c,x-9,y-5,18,12,'#36433c');
  for(let k=0;k<4;k++)px(c,x-7+k*4,y-4,2,9,'#182b28');
  px(c,x-8,y+8,16,2,'#9c9370');
 }
 // Moss spreads from damp joints; it never covers the center attack glyph.
 for(let i=0;i<190;i++){
  const x=29+hash(i*47+301)*342,y=32+hash(i*211+94)*556;
  const edge=Math.min(x-29,371-x,y-32,589-y);
  if(hash(i*13+31)>(edge<33?.29:.92)){
   px(c,x,y,2+hash(i*71)*4,1+hash(i*15)*2,hash(i*7)>.5?'#627668b0':'#9cae968c');
  }
 }
 // A second layer of rare chips avoids the noisy tiled texture appearance.
 for(let i=0;i<74;i++){
  const x=38+hash(i*111+99)*322,y=42+hash(i*37+22)*535;
  px(c,x,y,3+hash(i*21)*5,1,hash(i*13)>.55?'#b0a87b40':'#1c382b8a');
 }
}
function buttress(c,w,index){
 const {x,y,w:width,h}=w,light=index===0;
 // Painted high face + distinct side face makes obstacle readable in 3D.
 px(c,x+9,y+17,width-4,h+3,'#162723be');
 px(c,x+3,y+7,width,h,'#263d36');
 px(c,x+3,y+9,width-9,h-5,'#46594a');
 px(c,x+width-10,y+8,9,h,'#22392f');
 px(c,x-5,y-5,width+10,18,'#8b9176');
 px(c,x-5,y-4,width+10,5,'#c2bb91');
 px(c,x-5,y+10,width+10,3,'#263831');
 for(let n=0;n<3;n++){
  px(c,x-1+n*19,y+5,2,7,'#31483c');
  px(c,x+2+n*19,y-2,10,2,n===1?'#dbd3a0':'#7e896d');
 }
 for(let n=0;n<8;n++){
  const rx=x+7+hash(index*40+n*3)*Math.max(3,width-14);
  const ry=y+18+hash(index*101+n*17)*Math.max(2,h-23);
  px(c,rx,ry,3+hash(n*13)*7,1+hash(n*73)*2,n%3===0?'#8c94705e':'#21393195');
 }
 if(light){
  // One masonry corner has a missing piece; not every obstacle is pristine.
  px(c,x+width-15,y-4,11,4,'#3b5245');
  px(c,x+width-10,y-6,7,3,'#708a67');
 }
}
function lantern(c,x,y,side){
 const r=side<0?-1:1;
 px(c,x-14*r,y+4,17,5,'#1525219c');
 px(c,x-8,y-11,16,18,'#34433a');
 px(c,x-6,y-15,11,7,'#827a62');
 px(c,x-3,y-25,6,13,'#cca671');
 px(c,x-2,y-29,4,8,'#f4ce82');
 px(c,x-1,y-26,2,5,'#fff4bd');
 px(c,x-6,y-6,12,2,'#c6af80');
 px(c,x-2,y+5,4,5,'#a09c72');
}
export function createCourtBackdrop(walls=[]){
 const forged=renderForgeCourt(walls);
 if(forged)return forged;
 const canvas=document.createElement('canvas');canvas.width=ART_WIDTH;canvas.height=ART_HEIGHT;
 const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
 mosaic(c);
 carveStoneFloor(c);
 walls.forEach((w,i)=>{buttress(c,w,i);carveButtressFace(c,w,i)});
 [[57,83,-1],[349,98,1],[53,526,-1],[351,525,1]].forEach(([x,y,s])=>lantern(c,x,y,s));
 return canvas;
}
export function drawCourtAtmosphere(ctx,time,reduced=false){
 if(drawForgeCourtAtmosphere(ctx,time,reduced))return;
 // Low-cost animated torch pools & motes; combat characters stay high contrast.
 ctx.save();
 const t=reduced?0:time;
 for(const [x,y,seed] of [[57,71,0],[349,86,2],[53,514,4],[351,513,7]]){
  const wob=Math.sin(t*6+seed)*.09+.25;
  const glow=ctx.createRadialGradient(x,y,3,x,y,39);
  glow.addColorStop(0,`rgba(255,196,102,${wob})`);glow.addColorStop(1,'rgba(224,159,80,0)');
  ctx.fillStyle=glow;ctx.fillRect(x-40,y-40,80,80);
  for(let j=0;j<3;j++){
   const rise=((t*(9+j*5)+j*15+seed*4)%45);
   ctx.fillStyle=j===1?'#f0ce83aa':'#d3ab6990';
   ctx.fillRect(Math.round(x+Math.sin(t*1.8+j+seed)*7),Math.round(y-16-rise),2,2);
  }
 }
 // Dry dust shifts under a stable, warm shaft of light from above left.
 for(let i=0;i<18;i++){
  const x=36+hash(i*37)*310+Math.sin(t*.23+i)*3;
  const y=(hash(i*197)*560+t*(1.8+i%3))%570+31;
  px(ctx,x,y,i%5===0?3:2,1,i%4===0?'#d6bf8b52':'#bbcaac4a');
 }
 ctx.restore();
}
