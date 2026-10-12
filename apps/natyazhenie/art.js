const colors=['#ff7282','#70c7f5','#8fdb8d','#ffc968','#b7a1f4'],ink='#25304b';
const themes=['#bceffa','#fbd8e6','#e4def9','#ffe8b3','#ccecdf','#ffdcc7'];
const box=(c,x,y,w,h,r,color,stroke=ink)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(stroke){c.lineWidth=3;c.strokeStyle=stroke;c.stroke();}};
const dot=(c,x,y,r,color)=>{c.beginPath();c.arc(x,y,r,0,7);c.fillStyle=color;c.fill();};
let cameraX=590;
export function paint(canvas,world,{self='',time=0,cover=false,reduced=false}={}){
 const c=canvas.getContext('2d',{alpha:false});if(!c||!world?.stage)return;
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,2);
 const cw=Math.round(w*dpr),ch=Math.round(h*dpr);if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
 c.setTransform(dpr,0,0,dpr,0,0);
 const s=world.stage,scale=cover?Math.max(w/900,h/620):w/h<1.46?Math.max(h/620,w/840):Math.min(w/1180,h/620);
 const visible=w/scale,me=world.players?.find(p=>p.id===self);
 let target=590;if(w/h<1.46&&!cover)target=Math.max(visible/2,Math.min(1180-visible/2,(me?.x||world.players[0]?.x||590)+visible*.13));
 if(cover)target=550;cameraX+=(target-cameraX)*.18;if(w/h>=1.46&&!cover)cameraX=590;
 c.fillStyle=themes[s.theme||0];c.fillRect(0,0,w,h);
 c.save();c.translate(w/2-cameraX*scale,(h-620*scale)/2);c.scale(scale,scale);
 for(let i=0;i<7;i++){let x=80+i*210,y=100+i%3*58;dot(c,x,y,24,'#ffffff95');dot(c,x+24,y-9,30,'#ffffff95');dot(c,x+53,y,20,'#ffffff95');}
 c.beginPath();c.moveTo(-200,620);for(let x=-200;x<=1380;x+=18)c.lineTo(x,478+Math.sin(x/125+s.theme)*24);c.lineTo(1380,620);c.closePath();c.fillStyle='#91dfc4';c.fill();
 c.beginPath();c.moveTo(-200,620);for(let x=-200;x<=1380;x+=18)c.lineTo(x,525+Math.sin(x/93)*15);c.lineTo(1380,620);c.closePath();c.fillStyle='#6fcbbd';c.fill();
 for(const p of [...s.floors,...s.platforms]){
  box(c,p.x,p.y,p.w,p.h,8,'#ffe3a7');
  box(c,p.x+2,p.y+2,p.w-4,13,5,'#9ee6b2',null);
  c.save();c.beginPath();c.rect(p.x+4,p.y+21,p.w-8,p.h-24);c.clip();
  for(let x=p.x-50;x<p.x+p.w+50;x+=36){c.beginPath();c.moveTo(x,p.y+p.h);c.lineTo(x+40,p.y+15);c.strokeStyle='#dfbd85';c.lineWidth=2;c.stroke();}c.restore();
 }
 for(const spring of s.springs){box(c,spring.x-30,526,60,13,5,'#e2a7f7');box(c,spring.x-32,509,64,11,5,'#f9cdf9');}
 s.pads.forEach((p,i)=>{box(c,p.x-31,p.y-10,62,13,6,world.pads?.[i]?colors[i%5]:'#fdf9e9');box(c,p.x-18,p.y-17,36,9,4,world.pads?.[i]?'#faffc0':'#aeb9bf');});
 if(!world.gateOpen)box(c,s.gate.x,328,s.gate.w,212,4,'#f7a4c7');
 box(c,1080,444,83,96,18,world.gateOpen?'#83dfa9':'#fff2bf');box(c,1090,452,62,86,12,world.gateOpen?'#f3ffdd':'#dfdadd');
 c.font='1000 33px system-ui';c.fillStyle=ink;c.textAlign='center';c.fillText('→',1121,506);
 s.stars.forEach((p,i)=>{if(world.stars?.[i])return;const y=p.y+(reduced?0:Math.sin(time*3+i)*4);dot(c,p.x,y,27,'#ffffff99');c.save();c.translate(p.x,y);c.rotate(reduced?0:time);c.beginPath();for(let n=0;n<10;n++){const a=n*Math.PI/5-Math.PI/2,r=n%2?9:21;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fillStyle='#ffe06d';c.fill();c.lineWidth=3;c.strokeStyle=ink;c.stroke();c.restore();});
 const players=world.players||[];
 for(let i=0;i<players.length-1;i++){
  const a=players[i],b=players[i+1],d=Math.hypot(b.x-a.x,b.y-a.y),sag=Math.min(35,d*.1)*(d>180?.35:1);
  c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2+sag,b.x,b.y);c.lineCap='round';c.strokeStyle=ink;c.lineWidth=12;c.stroke();c.strokeStyle='#ffc0c1';c.lineWidth=7;c.stroke();
 }
 players.forEach((p,i)=>{
  const step=reduced?0:Math.sin(time*12+i)*Math.min(2,Math.abs(p.vx||0)/80);
  c.save();c.translate(p.x,p.y);c.rotate(Math.max(-.18,Math.min(.18,(p.vx||0)/1100)));
  box(c,-14,12+step,11,9,4,ink,null);box(c,3,12-step,11,9,4,ink,null);
  box(c,-19,-21,38,40,11,colors[i%5]);box(c,-13,-16,26,8,4,'#ffffff78',null);
  dot(c,-7,-1,3.6,ink);dot(c,7,-1,3.6,ink);box(c,-3,8,6,2,1,ink,null);c.restore();
  if(self===p.id&&!cover){c.beginPath();c.arc(p.x,p.y,29,Math.PI*1.05,Math.PI*1.95);c.strokeStyle='#ffffff';c.lineWidth=4;c.stroke();}
  if(!cover){const name=String(p.name||'').slice(0,13);c.font='900 12px system-ui';let ww=Math.max(44,c.measureText(name).width+14);box(c,p.x-ww/2,p.y-48,ww,20,7,'#fffdf3');c.textAlign='center';c.fillStyle=ink;c.fillText(name,p.x,p.y-34);}
 });
 if(s.stretch){box(c,390,48,400,38,17,'#fffdf2');if(world.stretch)box(c,398,56,384*world.stretch,22,10,'#ffb7ca',null);c.font='900 17px system-ui';c.fillStyle=ink;c.textAlign='center';c.fillText(world.stretched?'НАТЯНУТО!':'ТЯНИТЕ РЕЗИНКУ',590,74);}
 if(cover){c.font='1000 27px system-ui';c.textAlign='center';c.fillStyle=ink;c.fillText('НЕ ОТПУСКАЙ!',560,215);}
 c.restore();
}
export function coverWorld(){
 return {stage:{theme:0,floors:[{x:0,y:540,w:480,h:80},{x:600,y:540,w:580,h:80}],platforms:[],springs:[],stars:[{x:585,y:310}],pads:[{x:455,y:540},{x:724,y:540}],gate:{x:1036,y:0,w:31,h:540},stretch:0},
 players:[{id:'a',name:'',x:355,y:455,vx:-20},{id:'b',name:'',x:747,y:390,vx:50}],pads:[false,true],stars:[false],gateOpen:false,stretch:0};
}
