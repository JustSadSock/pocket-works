import {E} from '../../engine.js';
const clamp=E.clamp,PI=Math.PI,colors=["#294d82","#a04437"],cream="#fff1d0";
const noise=(x,y)=>{let n=Math.sin(x*17.19+y*91.77)*43758.5453;return n-Math.floor(n)};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function poly(g,p,fill,stroke=null,w=1){g.beginPath();p.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function oval(g,x,y,rx,ry,fill,stroke=null,w=1){g.beginPath();g.ellipse(x,y,rx,ry,0,0,PI*2);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function line(g,x,y,a,b,c,w=1){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x,y);g.lineTo(a,b);g.stroke()}
export function atlasTerrain(t){
 const c=document.createElement("canvas");c.width=E.W;c.height=E.H;const g=c.getContext("2d"),s=document.createElement("canvas");s.width=Math.ceil(E.W/2);s.height=Math.ceil(E.H/2);const sg=s.getContext("2d"),im=sg.createImageData(s.width,s.height),d=im.data;
 const sample=(x,y)=>E.sample(t,clamp(x,0,E.W),clamp(y,0,E.H));
 // Smooth light and vegetation use the actual continuous elevation and canopy fields.
 const hmap=new Float32Array(s.width*s.height),mask=new Uint8Array(hmap.length);
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){let xx=x*2,yy=y*2,q=sample(xx,yy),at=y*s.width+x;hmap[at]=q.h;mask[at]=q.water?1:0;let wet=clamp((q.wet??.25)-.3,0,.7),wood=clamp(((q.canopy??0)-.4)*1.75,0,.85),alt=clamp((q.h+10)/90,0,1);
 let col=mix([158,176,128],[219,210,168],alt),light=(noise(xx,yy)-.5)*5;col=mix(col,[107,137,112],wet*.7);col=mix(col,[72,107,76],wood);if(q.marsh)col=mix(col,[113,151,138],.36);if(q.water){col=[82,133,155];light=0}else if(q.road)col=mix(col,[210,184,134],.45);if(q.village)col=mix(col,[168,144,114],.5);
 let i=(y*s.width+x)*4;for(let k=0;k<3;k++)d[i+k]=clamp(col[k]+light,0,255);d[i+3]=255}
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){let i=y*s.width+x;if(mask[i])continue;let h=(a,b)=>hmap[clamp(b,0,s.height-1)*s.width+clamp(a,0,s.width-1)];let shade=clamp(((h(x+3,y)-h(x-3,y))+(h(x,y+3)-h(x,y-3)))/12*32,-25,25);for(let k=0;k<3;k++)d[i*4+k]=clamp(d[i*4+k]+shade,0,255)}
 sg.putImageData(im,0,0);g.drawImage(s,0,0,E.W,E.H);
 const step=12,nx=Math.ceil(E.W/step),ny=Math.ceil(E.H/step),height=Array.from({length:ny+1},(_,j)=>Array.from({length:nx+1},(_,i)=>sample(i*step,j*step).h));g.strokeStyle="#506b5442";g.lineWidth=.65;
 for(let z=0;z<=100;z+=10){g.beginPath();for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let ps=[[i*step,j*step],[(i+1)*step,j*step],[(i+1)*step,(j+1)*step],[i*step,(j+1)*step]],hs=[height[j][i],height[j][i+1],height[j+1][i+1],height[j+1][i]],hits=[];for(let k=0;k<4;k++){let a=hs[k],b=hs[(k+1)%4];if((a<z)!==(b<z)){let v=(z-a)/(b-a),p=ps[k],q=ps[(k+1)%4];hits.push([p[0]+(q[0]-p[0])*v,p[1]+(q[1]-p[1])*v])}}for(let k=1;k<hits.length;k+=2){let a=hits[k-1],b=hits[k];if(!sample((a[0]+b[0])/2,(a[1]+b[1])/2).water){g.moveTo(...a);g.lineTo(...b)}}}g.stroke()}
 for(const f of t.fields||[]){g.save();g.translate(f.x,f.y);g.fillStyle="#bba76d3b";g.fillRect(-f.w/2,-f.h/2,f.w,f.h);for(let i=-f.h/2;i<f.h/2;i+=4)line(g,-f.w/2,i,f.w/2,i,"#776b4b2b",.8);g.restore()}
 if(t.road?.length){g.beginPath();t.road.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.lineCap="round";g.lineJoin="round";g.strokeStyle="#8b795344";g.lineWidth=5;g.stroke();g.strokeStyle="#e5cda0";g.lineWidth=2.5;g.stroke()}
 for(let y=7;y<E.H;y+=9)for(let x=7;x<E.W;x+=9){let n=noise(x,y),xx=x+(n-.5)*7,yy=y+(noise(y,x)-.5)*7,q=sample(xx,yy);if(!q.wood||n>.72)continue;let r=2.2+n*2.8;oval(g,xx+r*.65,yy+r*.7,r*1.35,r*.7,"#263e3b40");oval(g,xx,yy,r,r*.85,"#476d4d");oval(g,xx-r*.23,yy-r*.3,r*.72,r*.6,noise(x+3,y)>.5?"#718e58":"#638456");oval(g,xx-r*.42,yy-r*.39,r*.32,r*.31,"#a1b47a66")}
 for(const v of t.settlements||[])for(let i=0;i<5;i++){let x=v.x+Math.cos(i*2.4)*v.r*.55,y=v.y+Math.sin(i*2.4)*v.r*.55;if(!sample(x,y).village)continue;g.fillStyle="#52463850";g.fillRect(x+1,y+2,5,4);poly(g,[[x-3,y-2],[x+3,y-2],[x+3,y+2],[x-3,y+2]],"#c8b392","#786b57",.4);poly(g,[[x-3,y-2],[x,y-3.5],[x+3,y-2],[x+3,y+1],[x,y-.5],[x-3,y+1]],"#935c45")}
 for(let y=5;y<E.H;y+=6){let x=E.riverX(t,y);if(Number.isFinite(x)&&sample(x,y).water)line(g,x-5,y,x+4,y,"#d7e9df55",.55)}
 return c
}
const sprites=new Map();
function sprite(type,side){
 const key=type+":"+side;if(sprites.has(key))return sprites.get(key);const c=document.createElement("canvas");c.width=c.height=64;const g=c.getContext("2d");g.translate(32,32);g.scale(12,12);g.lineCap="round";const cloth=colors[side],horse=["knight","lightHorse","guard"].includes(type),heavy=type!=="lightHorse";
 if(horse){oval(g,.27,.38,1.32,.54,"#24342e66");oval(g,-.32,0,.96,.39,heavy?"#57504a":"#987653","#392f2a",.055);oval(g,.75,0,.44,.26,heavy?"#77726a":"#ad8b62");oval(g,1.06,.02,.20,.20,"#5a4738");line(g,-1.2,0,-1.47,.18,"#48372c",.12);for(let x of [-.72,.53])for(let y of [-.28,.28])line(g,x,y,x-.24,y*1.95,"#493c30",.09);poly(g,[[-.65,-.36],[.32,-.32],[.4,.28],[-.7,.35]],cloth,"#493a35",.05);oval(g,.03,0,.37,.30,heavy?"#9f9f94":cloth,"#343c37",.07);oval(g,.35,-.02,.2,.2,heavy?"#d4d5ce":"#b8a07c","#55473c",.055);line(g,.1,-.23,1.87,-.4,"#5e4936",.09);line(g,1.74,-.4,2.11,-.44,"#e6e2ce",.08);if(heavy)oval(g,-.12,.36,.3,.18,cloth,"#d9c4a0",.055)}
 else{oval(g,.15,.28,.6,.35,"#26382965");line(g,-.34,-.2,-.49,-.33,"#554639",.14);line(g,-.34,.2,-.49,.33,"#554639",.14);oval(g,-.07,0,.36,.3,cloth,"#3e3933",.055);oval(g,.2,0,.21,.22,"#b7b4a6","#45483f",.05);oval(g,.26,-.07,.1,.09,"#e1d9bf");if(type==="spear"||type==="pike"){const len=type==="pike"?1.85:1.26;line(g,-.48,-.34,len,-.34,"#775c3f",.065);poly(g,[[len,-.34],[len-.24,-.47],[len-.24,-.21]],"#e4e1cf");oval(g,-.02,.32,.33,.16,cloth,"#d3bf9b",.07)}else if(type==="sword"){line(g,.08,-.28,.8,-.43,"#e1dfcc",.1);line(g,.12,-.43,.19,-.22,"#755b39",.075);oval(g,-.09,.32,.27,.18,cloth,"#d8c19b",.07)}else if(type==="archer"){g.beginPath();g.arc(.4,-.02,.48,-PI*.6,PI*.6);g.strokeStyle="#6e5133";g.lineWidth=.09;g.stroke();line(g,.25,-.47,.25,.47,"#e6ddbc",.045)}else{line(g,-.1,0,.88,0,"#654d35",.13);line(g,.55,-.38,.55,.38,"#b9b6a7",.09)}}
 sprites.set(key,c);return c
}
export function interpolateFrame(a,b,t){
 if(!b||t<=0)return a;if(t>=1)return b;
 const map=new Map(b.units.map(u=>[u.id,u]));
 return {...a,time:a.time+(b.time-a.time)*t,units:a.units.map(u=>{
  const v=map.get(u.id);if(!v)return u;const angle=Math.atan2(Math.sin(v.a-u.a),Math.cos(v.a-u.a)),lerp=k=>(u[k]??0)+((v[k]??0)-(u[k]??0))*t;
  let sectors=u.sectors?.map((q,i)=>{let p=v.sectors?.[i]||q;return {...q,bend:(q.bend||0)+((p.bend||0)-(q.bend||0))*t,cohesion:q.cohesion+(p.cohesion-q.cohesion)*t,share:q.share+(p.share-q.share)*t,pressure:(q.pressure||0)+((p.pressure||0)-(q.pressure||0))*t}});
  return {...u,x:lerp("x"),y:lerp("y"),a:u.a+angle*t,n:lerp("n"),fatigue:lerp("fatigue"),morale:lerp("morale"),cohesion:lerp("cohesion"),v:lerp("v"),sectors:sectors||u.sectors}
 })};
}
export class Battlefield{
 constructor(canvas){this.canvas=canvas;this.g=canvas.getContext("2d",{alpha:false});this.cam={z:1,x:0,y:0};this.layout={};this.terrain=null;this.terrainRef=null;this.stats={drawMs:0,sprites:0,visible:0};this.layer=false}
 resize(){const c=this.canvas,w=c.clientWidth,h=c.clientHeight,d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d)}const portrait=h>w&&w<780,top=portrait?155:62,bottom=portrait?114:30,right=!portrait&&h<550?95:0,aw=w-right-12,ah=h-top-bottom;
 const base=Math.max(.1,Math.min(aw/(portrait?E.H:E.W),ah/(portrait?E.W:E.H)));this.layout={w,h,d,portrait,k:base*this.cam.z,cx:aw/2+6+this.cam.x,cy:top+ah/2+this.cam.y,base};return this.layout}
 project(p){let {k,cx,cy,portrait}=this.layout,x=p.x-E.W/2,y=p.y-E.H/2;return portrait?{x:cx-y*k,y:cy+x*k}:{x:cx+x*k,y:cy+y*k}}
 world(p,clipped=true){let {k,cx,cy,portrait}=this.layout,x=(p.x-cx)/k,y=(p.y-cy)/k,xx=(portrait?y:x)+E.W/2,yy=(portrait?-x:y)+E.H/2;return clipped?{x:clamp(xx,0,E.W),y:clamp(yy,0,E.H)}:{x:xx,y:yy}}
 zoom(f,p){let old=this.world(p,false);this.cam.z=clamp(this.cam.z*f,.8,30);this.resize();let q=this.project(old);this.cam.x+=p.x-q.x;this.cam.y+=p.y-q.y;this.resize()}
 fit(){this.cam={z:1,x:0,y:0};this.resize()}
 focus(p,z=4){if(!p)return;this.cam={z:clamp(z,.8,30),x:0,y:0};this.resize();let q=this.project(p);this.cam.x=this.layout.w*.5-q.x;this.cam.y=this.layout.h*.46-q.y;this.resize()}
 worldTransform(){let g=this.g,{d,k,cx,cy,portrait}=this.layout;g.setTransform(d,0,0,d,0,0);g.translate(cx,cy);g.scale(k,k);if(portrait)g.rotate(PI/2);g.translate(-E.W/2,-E.H/2)}
 screenTransform(){let d=this.layout.d;this.g.setTransform(d,0,0,d,0,0)}
 visible(u,pad=50){let p=this.project(u),{w,h}=this.layout;return p.x>-pad&&p.x<w+pad&&p.y>-pad&&p.y<h+pad}
 path(points,color="#f2d18d",width=2,dash=[]){if(points.length<2)return;let g=this.g,k=this.layout.k;g.strokeStyle=color;g.lineWidth=width/k;g.lineCap="round";g.lineJoin="round";g.setLineDash(dash.map(v=>v/k));g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.stroke();g.setLineDash([])}
 arrow(points,color){this.path(points,color,2,[6,4]);if(points.length<2)return;let p=points.at(-1),a=points.at(-2),k=this.layout.k,angle=Math.atan2(p.y-a.y,p.x-a.x);this.g.save();this.g.translate(p.x,p.y);this.g.rotate(angle);poly(this.g,[[0,0],[-9/k,-4/k],[-9/k,4/k]],color);this.g.restore()}
 footprint(u,color="#efce80"){let g=this.g,k=this.layout.k,s=E.dims(u);g.save();g.translate(u.x,u.y);g.rotate(u.a);g.fillStyle="#f1d18b20";g.strokeStyle=color;g.lineWidth=1.3/k;g.setLineDash([4/k,3/k]);g.fillRect(-s.d/2,-s.w/2,s.d,s.w);g.strokeRect(-s.d/2,-s.w/2,s.d,s.w);g.setLineDash([]);line(g,s.d/2,-s.w/2,s.d/2,s.w/2,color,2/k);g.restore()}
 regiment(u,budget,time){
 const g=this.g,k=this.layout.k,t=E.spec(u),shape=E.bodies(u),sec=E.sectors(u),img=sprite(u.type,u.side);let remaining=Math.max(0,Math.round(u.n));
 for(let j=0;j<shape.length;j++){const b=shape[j],q=sec[j],n=j===shape.length-1?remaining:Math.min(remaining,Math.round(b.n));remaining-=n;if(n<1)continue;let cols=Math.max(1,Math.min(n,Math.round(b.geometry.cols))),rows=Math.ceil(n/cols),limit=Math.max(1,Math.floor(budget/shape.length)),stride=Math.max(1,Math.ceil(n/limit));
 g.save();g.translate(b.x,b.y);g.rotate(b.a);g.globalAlpha=u.rout?.60:1;
 if(k<.36){g.strokeStyle=colors[u.side];g.lineWidth=Math.max(.75/k,b.geometry.d*.13);g.beginPath();for(let i=0;i<Math.min(4,rows);i++){let x=b.geometry.d/2-(i+.5)*b.geometry.d/Math.min(4,rows);g.moveTo(x,-b.geometry.w/2);g.lineTo(x,b.geometry.w/2)}g.stroke()}
 else{let loose=clamp((100-q.cohesion)/100,0,1),gap=b.geometry.gap||1.5;for(let i=0;i<n;i+=stride){let x=b.geometry.d/2-(Math.floor(i/cols)+.5)*b.geometry.d/rows,y=(i%cols+.5-cols/2)*b.geometry.w/cols,jitter=Math.min(gap*.4,loose*gap*.45);x+=(noise(i+u.id*19,j)-.5)*jitter;y+=(noise(j,i+u.id*7)-.5)*jitter;let march=Math.min(.19,(u.v||0)*.12)*Math.sin(time*7+i*1.8);x+=march;let size=t.horse?5:3.45;if(k<1.2)size=Math.max(size,1.8/k);g.drawImage(img,x-size/2,y-size/2,size,size);this.stats.sprites++}}
 if(this.layer&&(q.contact>0||q.pressure>.1)){g.fillStyle="rgba(164,65,35,"+Math.min(.35,(q.pressure||.2)*.15)+")";g.fillRect(-b.geometry.d/2,-b.geometry.w/2,b.geometry.d,b.geometry.w)}g.restore()
 }
 }
 flag(u,selected){let g=this.g,p=this.project(u),k=this.layout.k,sz=k<.45?10:8,dy=Math.min(25,Math.max(12,E.dims(u).w*k*.3));this.screenTransform();g.save();g.translate(p.x,p.y-dy);g.globalAlpha=u.rout?.64:1;line(g,0,dy*.7,0,-sz,"#3b3e35",1.3);poly(g,[[0,-sz],[sz*2.1,-sz],[sz*1.6,-sz*.27],[sz*2.1,sz*.42],[0,sz*.42]],colors[u.side],selected?"#f9d37d":cream,selected?1.8:.7);
 let t=E.spec(u);if(t.horse){line(g,4,-4,11,-4,cream,1.1);line(g,8,-7,8,0,cream,1.1)}else if(t.range){g.strokeStyle=cream;g.lineWidth=1.1;g.beginPath();g.arc(7,-4,4,-PI/2,PI/2);g.stroke();line(g,7,-8,7,0,cream,.8)}else{line(g,4,-1,11,-8,cream,1.2);line(g,8,-8,12,-8,cream,.8)}
 if(selected||k<.45){g.fillStyle="#203747";g.font="600 10px system-ui";g.textAlign="center";g.fillText(u.rout?"Бегство":String(Math.round(u.n)),0,dy+8)}g.restore()}
 draw(state,o={}){
 let start=performance.now(),g=this.g,{w,h,k}=this.resize();this.stats={sprites:0,visible:0,drawMs:0};this.screenTransform();g.fillStyle="#1d3131";g.fillRect(0,0,w,h);if(!state)return;
 if(this.terrainRef!==state.terrain){this.terrainRef=state.terrain;this.terrain=atlasTerrain(state.terrain)}this.worldTransform();g.drawImage(this.terrain,0,0);
 if(o.deploy){g.fillStyle="#325d961a";g.fillRect(0,0,E.W*.4,E.H);this.path([{x:E.W*.4,y:0},{x:E.W*.4,y:E.H}],"#335a85",1.5,[7,5])}
 const visible=state.units.filter(u=>E.alive(u)&&this.visible(u,100));this.stats.visible=visible.length;const budget=Math.max(10,Math.min(k<.55?15:k<1.45?55:180,Math.floor(4200/Math.max(1,visible.length))));
 for(const u of visible){this.regiment(u,budget,state.time);if(o.selected?.has(u.id))this.footprint(u,"#f7d687")}
 for(const shot of state.shots||[]){let t=clamp((state.time-shot.time)/1.5,0,1),x=shot.x+(shot.tx-shot.x)*t,y=shot.y+(shot.ty-shot.y)*t;this.path([{x:x-(shot.tx-shot.x)*.035,y:y-(shot.ty-shot.y)*.035},{x,y}],"#f6e3b8aa",1)}
 if(o.orders&&o.campaign){let C=o.campaign;for(const u of C.own()){let q=C.orders[u.id];if(!q)continue;let a=u;for(let [i,s] of [q,...(q.stages||[])].entries()){let p=s.path||[];if(p.length)this.arrow([a,...p],o.selected?.has(u.id)?"#ffdc92":"#e8e7c1a0");if(s.target!==undefined){let t=state.units.find(v=>v.id===s.target);if(t)this.arrow([a,t],"#f0ad80")}let dest=C.end(u,i);this.footprint(dest,i===o.stage?"#fff1b2":"#d7c59a");a=dest}}}
 if(o.preview?.length>1)this.path(o.preview,"#fff3b3",2,[4,3]);if(o.linePreview)for(const u of Object.values(o.linePreview))this.footprint(u,"#fff5c6");
 this.screenTransform();for(const u of visible)if(k<1.65||o.selected?.has(u.id))this.flag(u,o.selected?.has(u.id));this.screenTransform();
 for(const h of o.handles||[]){let p=this.project(h);oval(g,p.x,p.y,h.kind==="point"?8:10,h.kind==="point"?8:10,h.kind==="point"?"#163947":"#fff1d1","#25475b",1.5);g.fillStyle=h.kind==="point"?cream:"#25475b";g.font="bold 11px system-ui";g.textAlign="center";g.textBaseline="middle";g.fillText(h.kind==="point"?String(h.index+1):({center:"✥",rotate:"↻",spread:"↔",depth:"↕"}[h.kind]||"·"),p.x,p.y)}
 if(o.selectionStroke?.length>1){g.strokeStyle="#fff3bf";g.fillStyle="#ffdf9130";g.lineWidth=1.4;g.beginPath();o.selectionStroke.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();g.stroke()}
 this.stats.drawMs=performance.now()-start;return this.stats
 }
}
