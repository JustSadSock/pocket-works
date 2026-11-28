import {E} from '../../engine.js';
import {miniatureAtlas,MiniatureBatch} from './living-miniatures.js';
const stagesLength=q=>1+(q.stages?.length||0);
const clamp=E.clamp,PI=Math.PI,colors=["#294d82","#a04437"],cream="#fff1d0";
const noise=(x,y)=>{let n=Math.sin(x*17.19+y*91.77)*43758.5453;return n-Math.floor(n)};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function poly(g,p,fill,stroke=null,w=1){g.beginPath();p.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function oval(g,x,y,rx,ry,fill,stroke=null,w=1){g.beginPath();g.ellipse(x,y,rx,ry,0,0,PI*2);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function line(g,x,y,a,b,c,w=1){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x,y);g.lineTo(a,b);g.stroke()}
export function atlasTerrain(t,F=E){
 const c=document.createElement("canvas");c.width=F.W*2;c.height=F.H*2;const g=c.getContext("2d");g.scale(2,2);const s=document.createElement("canvas");s.width=Math.ceil(F.W/2);s.height=Math.ceil(F.H/2);const sg=s.getContext("2d"),im=sg.createImageData(s.width,s.height),d=im.data;
 const sample=(x,y)=>F.sample(t,clamp(x,0,F.W),clamp(y,0,F.H));
 // Smooth light and vegetation use the actual continuous elevation and canopy fields.
 const hmap=new Float32Array(s.width*s.height),mask=new Uint8Array(hmap.length);
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){let xx=x*2,yy=y*2,q=sample(xx,yy),at=y*s.width+x;hmap[at]=q.h;mask[at]=q.water?1:0;let wet=clamp((q.wet??.25)-.3,0,.7),wood=clamp(((q.canopy??0)-.4)*1.75,0,.85),alt=clamp((q.h+10)/90,0,1);
 let col=mix([178,171,133],[215,200,165],alt),light=(noise(xx,yy)-.5)*5;col=mix(col,[128,149,116],wet*.55);col=mix(col,[111,132,93],wood*.55);if(q.marsh)col=mix(col,[113,151,138],.36);if(q.water){col=[76,124,145];light=Math.sin(yy*.19+xx*.07)*2}else if(q.road)col=mix(col,[194,165,119],.63);if(q.village)col=mix(col,[168,144,114],.5);
 let i=(y*s.width+x)*4;for(let k=0;k<3;k++)d[i+k]=clamp(col[k]+light,0,255);d[i+3]=255}
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){let i=y*s.width+x;if(mask[i]){let near=[i-1,i+1,i-s.width,i+s.width].some(j=>j>=0&&j<mask.length&&!mask[j]);if(near){d[i*4]=111;d[i*4+1]=143;d[i*4+2]=143}continue}let h=(a,b)=>hmap[clamp(b,0,s.height-1)*s.width+clamp(a,0,s.width-1)];let shade=clamp(((h(x+3,y)-h(x-3,y))+(h(x,y+3)-h(x,y-3)))/12*32,-25,25);for(let k=0;k<3;k++)d[i*4+k]=clamp(d[i*4+k]+shade,0,255)}
 sg.putImageData(im,0,0);g.drawImage(s,0,0,F.W,F.H);
 const step=12,nx=Math.ceil(F.W/step),ny=Math.ceil(F.H/step),height=Array.from({length:ny+1},(_,j)=>Array.from({length:nx+1},(_,i)=>sample(i*step,j*step).h));g.strokeStyle="#6b70532b";g.lineWidth=.5;
 for(let z=0;z<=100;z+=10){g.beginPath();for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let ps=[[i*step,j*step],[(i+1)*step,j*step],[(i+1)*step,(j+1)*step],[i*step,(j+1)*step]],hs=[height[j][i],height[j][i+1],height[j+1][i+1],height[j+1][i]],hits=[];for(let k=0;k<4;k++){let a=hs[k],b=hs[(k+1)%4];if((a<z)!==(b<z)){let v=(z-a)/(b-a),p=ps[k],q=ps[(k+1)%4];hits.push([p[0]+(q[0]-p[0])*v,p[1]+(q[1]-p[1])*v])}}for(let k=1;k<hits.length;k+=2){let a=hits[k-1],b=hits[k];if(!sample((a[0]+b[0])/2,(a[1]+b[1])/2).water){g.moveTo(...a);g.lineTo(...b)}}}g.stroke()}
 for(const f of t.fields||[]){g.save();g.translate(f.x,f.y);g.fillStyle="#bba76d3b";g.fillRect(-f.w/2,-f.h/2,f.w,f.h);for(let i=-f.h/2;i<f.h/2;i+=4)line(g,-f.w/2,i,f.w/2,i,"#776b4b2b",.8);g.restore()}
 // The road texture follows engine passability; it never bridges water visually.
 if(t.road?.length){for(let i=1;i<t.road.length;i++){let a=t.road[i-1],b=t.road[i],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2);for(let j=0;j<n;j++){let x=a.x+(b.x-a.x)*j/n,y=a.y+(b.y-a.y)*j/n,xx=a.x+(b.x-a.x)*(j+1)/n,yy=a.y+(b.y-a.y)*(j+1)/n;if(!sample(x,y).water&&!sample(xx,yy).water){line(g,x,y,xx,yy,"#b3976c",3);line(g,x,y,xx,yy,"#d8c29a",1.5)}}}}
 // Organic clustered crowns: trunks, asymmetrical lobes, directed shadows, gaps at edges.
 for(let y=6;y<F.H;y+=8)for(let x=6;x<F.W;x+=8){let n=noise(x,y),xx=x+(n-.5)*10,yy=y+(noise(y,x)-.5)*10,q=sample(xx,yy);if(!q.wood||n>.38+.48*q.canopy||q.water||q.road)continue;let r=1.4+noise(x+11,y)*2.8,leaves=noise(x,y+9),dark=leaves>.5?"#526447":"#606d42",mid=leaves>.5?"#758652":"#86905a",lit=leaves>.5?"#a6a874":"#b4aa70";oval(g,xx+r*.8,yy+r*.9,r*1.36,r*.66,"#443f302c");line(g,xx,yy,xx+.1,yy+r*.9,"#65533b",.7);for(let i=0;i<5;i++){let a=i*1.39+n*6.28,rr=r*(.55+noise(i+x,y)*.3),cx=xx+Math.cos(a)*r*.48,cy=yy+Math.sin(a)*r*.44;let ps=Array.from({length:7},(_,j)=>{let z=j*Math.PI*2/7,sz=rr*(.8+noise(x+i,j+y)*.3);return[cx+Math.cos(z)*sz,cy+Math.sin(z)*sz*.86]});poly(g,ps,i<2?dark:mid)}poly(g,[[xx-r*.52,yy-r*.25],[xx-r*.26,yy-r*.68],[xx+r*.13,yy-r*.59],[xx+r*.28,yy-r*.24],[xx-r*.05,yy-r*.07]],lit)}
 for(const v of t.settlements||[])for(let i=0;i<5;i++){let x=v.x+Math.cos(i*2.4)*v.r*.55,y=v.y+Math.sin(i*2.4)*v.r*.55;if(!sample(x,y).village)continue;g.fillStyle="#52463850";g.fillRect(x+1,y+2,5,4);poly(g,[[x-3,y-2],[x+3,y-2],[x+3,y+2],[x-3,y+2]],"#c8b392","#786b57",.4);poly(g,[[x-3,y-2],[x,y-3.5],[x+3,y-2],[x+3,y+1],[x,y-.5],[x-3,y+1]],"#935c45")}
 for(let y=5;y<F.H;y+=6){let x=F.riverX(t,y);if(Number.isFinite(x)&&sample(x,y).water)line(g,x-5,y,x+4,y,"#d7e9df55",.55)}
 return c
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
 constructor(canvas){this.canvas=canvas;this.g=canvas.getContext("2d",{alpha:false});this.cam={z:1,x:0,y:0};this.layout={};this.terrain=null;this.terrainRef=null;this.stats={drawMs:0,sprites:0,visible:0};this.layer=false;this.atlas=miniatureAtlas();this.backend="canvas";this.batch=null;this.tilt=1;this.samples=[];this.terrainCache=new WeakMap();this.formationCache=new Map();this.tileCache=new Map();this.tileBytes=0;this.canvasMode=/AppleWebKit/i.test(navigator.userAgent)&&(!/Chrome|Chromium|Edg\//i.test(navigator.userAgent)||/iPhone|iPad|iPod/i.test(navigator.userAgent))?"legacy":"tiles";this.preferredCanvasMode=this.canvasMode;this.autoCanvas=true;this.slowFrames=0;this.composition="C";this.F=E}
 resize(){const c=this.canvas,w=c.clientWidth,h=c.clientHeight,d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d)}const portrait=h>w&&w<780,top=portrait?116:62,bottom=portrait?100:30,right=!portrait&&h<550?95:0,aw=w-right-12,ah=h-top-bottom;
 const base=Math.max(.1,Math.min(aw/(portrait?this.F.H:this.F.W),ah/(portrait?this.F.W:this.F.H)));this.layout={w,h,d,portrait,k:base*this.cam.z,cx:aw/2+6+this.cam.x,cy:top+ah/2+this.cam.y,base};return this.layout}
 project(p){let {k,cx,cy,portrait}=this.layout,x=p.x-this.F.W/2,y=p.y-this.F.H/2;return portrait?{x:cx-y*k,y:cy+x*k*this.tilt}:{x:cx+x*k,y:cy+y*k*this.tilt}}
 world(p,clipped=true){let {k,cx,cy,portrait}=this.layout,x=(p.x-cx)/k,y=(p.y-cy)/(k*this.tilt),xx=(portrait?y:x)+this.F.W/2,yy=(portrait?-x:y)+this.F.H/2;return clipped?{x:clamp(xx,0,this.F.W),y:clamp(yy,0,this.F.H)}:{x:xx,y:yy}}
 zoom(f,p){let old=this.world(p,false);this.cam.z=clamp(this.cam.z*f,.8,30);this.resize();let q=this.project(old);this.cam.x+=p.x-q.x;this.cam.y+=p.y-q.y;this.resize()}
 setComposition(mode){if(!['A','B','C'].includes(mode))return false;this.composition=mode;this.tilt=mode==='B'?.83:1;this.resize();return true}
 frameUnits(units,{margin=90,min=1,max=12}={}){if(!units.length)return;this.fit();let {portrait,w,h,base}=this.layout;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let u of units){let g=this.F.dims(u),dx=Math.abs(Math.cos(u.a))*g.d/2+Math.abs(Math.sin(u.a))*g.w/2,dy=Math.abs(Math.sin(u.a))*g.d/2+Math.abs(Math.cos(u.a))*g.w/2;minX=Math.min(minX,u.x-dx);maxX=Math.max(maxX,u.x+dx);minY=Math.min(minY,u.y-dy);maxY=Math.max(maxY,u.y+dy)}let sx=maxX-minX+margin*2,sy=maxY-minY+margin*2,availableW=w*(portrait?.86:.79),availableH=h*(portrait?.66:.72),k=Math.min(availableW/(portrait?sy:sx),availableH/((portrait?sx:sy)*this.tilt));this.focus({x:(minX+maxX)/2,y:(minY+maxY)/2},clamp(k/base,min,max))}
 fit(){this.cam={z:1,x:0,y:0};this.resize()}
 focus(p,z=4){if(!p)return;this.cam={z:clamp(z,.8,30),x:0,y:0};this.resize();let q=this.project(p);this.cam.x=this.layout.w*.5-q.x;this.cam.y=this.layout.h*.46-q.y;this.resize()}
 worldTransform(){let g=this.g,{d,k,cx,cy,portrait}=this.layout;g.setTransform(d,0,0,d,0,0);g.translate(cx,cy);g.scale(k,k*this.tilt);if(portrait)g.rotate(PI/2);g.translate(-this.F.W/2,-this.F.H/2)}
 overview(canvas,state){if(!canvas||!state||!this.terrain)return;let g=canvas.getContext('2d'),w=canvas.width,h=canvas.height,F=this.F;g.clearRect(0,0,w,h);g.drawImage(this.terrain,0,0,w,h);for(let u of state.units){if(!E.alive(u))continue;g.fillStyle=colors[u.side];g.fillRect(u.x/F.W*w-1,u.y/F.H*h-1,3,3)}let ps=[[0,0],[this.layout.w,0],[this.layout.w,this.layout.h],[0,this.layout.h]].map(([x,y])=>this.world({x,y},false));g.beginPath();ps.forEach((p,i)=>{let x=p.x/F.W*w,y=p.y/F.H*h;i?g.lineTo(x,y):g.moveTo(x,y)});g.closePath();g.strokeStyle='#fff4cf';g.lineWidth=1.5;g.stroke()}
 screenTransform(){let d=this.layout.d;this.g.setTransform(d,0,0,d,0,0)}
 visible(u,pad=50){let p=this.project(u),{w,h}=this.layout;return p.x>-pad&&p.x<w+pad&&p.y>-pad&&p.y<h+pad}
 path(points,color="#f2d18d",width=2,dash=[]){if(points.length<2)return;let g=this.g,k=this.layout.k;g.strokeStyle=color;g.lineWidth=width/k;g.lineCap="round";g.lineJoin="round";g.setLineDash(dash.map(v=>v/k));g.beginPath();points.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.stroke();g.setLineDash([])}
 arrow(points,color){this.path(points,color,2,[6,4]);if(points.length<2)return;let p=points.at(-1),a=points.at(-2),k=this.layout.k,angle=Math.atan2(p.y-a.y,p.x-a.x);this.g.save();this.g.translate(p.x,p.y);this.g.rotate(angle);poly(this.g,[[0,0],[-9/k,-4/k],[-9/k,4/k]],color);this.g.restore()}
 footprint(u,color="#efce80"){let g=this.g,k=this.layout.k,s=E.dims(u);g.save();g.translate(u.x,u.y);g.rotate(u.a);g.fillStyle="#f1d18b20";g.strokeStyle=color;g.lineWidth=1.3/k;g.setLineDash([4/k,3/k]);g.fillRect(-s.d/2,-s.w/2,s.d,s.w);g.strokeRect(-s.d/2,-s.w/2,s.d,s.w);g.setLineDash([]);line(g,s.d/2,-s.w/2,s.d/2,s.w/2,color,2/k);g.restore()}
 setBackend(name){if(name==='canvas'){this.backend='canvas';return true}try{this.batch??=new MiniatureBatch(this.atlas);this.backend='webgl';return true}catch(e){this.backend='canvas';return false}}
 regiment(u,budget,time){
 const k=this.layout.k,F=this.F,t=F.spec(u),shape=F.bodies(u),sec=F.sectors(u);let remaining=Math.max(0,Math.round(u.n)),initial=Math.max(1,u.initial||u.n),sampleRate=Math.min(1,budget/initial);
 for(let j=0;j<shape.length;j++){const b=shape[j],q=sec[j],n=j===shape.length-1?remaining:Math.min(remaining,Math.round(b.n));remaining-=n;if(n<1)continue;
 const cols=Math.max(1,Math.min(n,Math.round(b.geometry.cols))),rows=Math.ceil(n/cols),ca=Math.cos(b.a),sa=Math.sin(b.a),loose=clamp((100-q.cohesion)/100,0,1),gap=b.geometry.gap||1.5,contact=q.contact>0,pressure=clamp(q.pressure||0,0,3),walking=(u.v||0)>.15,charging=t.horse&&u.order?.kind==='charge'&&u.v>.35,withdraw=u.order?.kind==='retreat',braced=u.order?.kind==='brace';
 // Stable ids and a fixed initial population sampling ratio. Motion and zoom never reseed a rank.
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){let i=row*cols+col;if(i>=n)continue;const seed=u.id*631+j*137+i;if(sampleRate<1&&noise(seed,19)>=sampleRate&&i!==0&&i!==n-1)continue;
 let x=b.geometry.d/2-(row+.5)*b.geometry.d/rows,y=(col+.5-cols/2)*b.geometry.w/cols,variation=noise(seed,3),phase=time*(charging?4.8:u.rout?3.5:walking?2.5:1.7)+variation*6.28;
 // Deliberate, bounded irregularity: well-formed ranks remain straight. Only physical disorder produces gaps and uneven files.
 let jitter=gap*(.08+loose*1.1+(u.rout?.55:0)),front=row<Math.max(1,Math.ceil(rows*.30)),rear=row>rows*.65;
 x+=(noise(seed,5)-.5)*jitter;y+=(noise(seed,7)-.5)*jitter;
 if(contact&&front)x+=Math.sin(phase)*Math.min(gap*.22,.08+pressure*.08);else if(walking)x+=Math.sin(phase*2)*Math.min(gap*.14,(u.v||0)*.09);
 if(loose>.35){x+=(noise(seed,21)-.5)*loose*gap*.55;y+=(noise(seed,22)-.5)*loose*gap*.35}
 x=clamp(x,-b.geometry.d/2,b.geometry.d/2);y=clamp(y,-b.geometry.w/2,b.geometry.w/2);
 let pose=charging?Math.sin(phase)>.3?1:2:contact&&front?Math.sin(phase)>-.15?2:0:braced&&front?2:walking||u.rout?Math.sin(phase)>0?1:0:0;
 if(t.range&&u.order?.kind==='shoot'&&!rear)pose=Math.sin(phase)>.6?2:0;
 let angle=b.a+(this.layout.portrait?PI/2:0)+(u.rout?(noise(seed,8)-.5)*1.0:loose*(noise(seed,8)-.5)*.55)+(contact&&front?Math.sin(phase)*.13:0),p=this.project({x:b.x+x*ca-y*sa,y:b.y+x*sa+y*ca}),d=this.layout.d,rawSize=Math.max(k*5.65,k<.65?10:14),size=Math.max(1,Math.round(rawSize*d))/d;
 if(p.x<-size||p.x>this.layout.w+size||p.y<-size||p.y>this.layout.h+size)continue;
 this.samples.push({id:u.id,x:Math.round((p.x-size*.5)*d)/d,y:Math.round((p.y-size*57/96)*d)/d,size,sort:p.y,rect:this.atlas.rect(u.type,u.side,variation>.5?1:0,pose,angle)});
 }
 // Dust is a visual cue for observed pressure or moving cavalry, not an inferred hit.
 if((contact&&pressure>.15||charging)&&k>1.2){let x=b.x+ca*b.geometry.d*.35,y=b.y+sa*b.geometry.d*.35,p=this.project({x,y});this.effects.push({x:p.x,y:p.y,r:Math.min(13,Math.max(3,k*(charging?3:1.5))),alpha:Math.min(.16,.05+pressure*.025),phase:time+j*.31})}
 }
 }
 // Canvas batches isolated formations into tight reusable bitmaps. Overlapping regiments
 // retain global sprite depth order; WebGL receives the identical sprite list and art.
 paintLegacy(){let list=this.samples,g=this.g,{w,h,d}=this.layout;list.sort((a,b)=>a.sort-b.sort);this.screenTransform();this.stats.cacheHits=0;this.stats.cacheMisses=0;let rendered=false;
 if(this.backend==='webgl'&&this.batch){try{g.drawImage(this.batch.draw(list,w,h,d),0,0,w,h);rendered=true}catch{this.backend='canvas'}}
 if(!rendered){let groups=new Map(),art=this.atlas.canvas;for(let q of list){let a=groups.get(q.id);if(!a){a={id:q.id,left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity,items:[]};groups.set(q.id,a)}a.items.push(q);a.left=Math.min(a.left,q.x);a.top=Math.min(a.top,q.y);a.right=Math.max(a.right,q.x+q.size);a.bottom=Math.max(a.bottom,q.y+q.size)}let all=[...groups.values()],overlap=new Set();for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){let a=all[i],b=all[j];if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom){overlap.add(a.id);overlap.add(b.id)}}
 const drawSprite=(ctx,q,dx=0,dy=0)=>ctx.drawImage(art,q.rect.x,q.rect.y,q.rect.w,q.rect.h,q.x-dx,q.y-dy,q.size,q.size);
 for(let a of all){let width=Math.ceil((a.right-a.left)*d),height=Math.ceil((a.bottom-a.top)*d);if(overlap.has(a.id)||width*height>180000||a.items.length<6){overlap.add(a.id);continue}let key=d+'|'+width+'|'+height+'|'+a.items.map(q=>[Math.round((q.x-a.left)*4),Math.round((q.y-a.top)*4),q.size.toFixed(2),q.rect.x,q.rect.y].join(',')).join(';'),c=this.formationCache.get(key);if(c){this.stats.cacheHits++;this.formationCache.delete(key);this.formationCache.set(key,c)}else{this.stats.cacheMisses++;c=document.createElement('canvas');c.width=width;c.height=height;let cg=c.getContext('2d');cg.scale(d,d);for(let q of a.items)drawSprite(cg,q,a.left,a.top);this.formationCache.set(key,c);if(this.formationCache.size>96)this.formationCache.delete(this.formationCache.keys().next().value)}g.drawImage(c,a.left,a.top,width/d,height/d)}
 for(let q of list)if(overlap.has(q.id))drawSprite(g,q)
 }this.stats.sprites=list.length;this.stats.backend=this.backend;this.worldTransform()}

 paintMiniatures(){
 if(this.backend==='webgl'||this.canvasMode==='legacy'){this.paintLegacy();return}
 const list=this.samples,g=this.g,{d}=this.layout,art=this.atlas.canvas;list.sort((a,b)=>a.sort-b.sort);this.stats.cacheHits=0;this.stats.cacheMisses=0;
 // Draw at backing-store resolution, no per-sprite source rectangle rescaling at replay time.
 g.setTransform(1,0,0,1,0,0);
 for(const q of list){let size=Math.max(1,Math.round(q.size*d)),x=Math.round(q.x*d),y=Math.round(q.y*d),key=size+':'+q.rect.x+':'+q.rect.y,entry=this.tileCache.get(key);
  if(entry){this.stats.cacheHits++;this.tileCache.delete(key);this.tileCache.set(key,entry)}else{this.stats.cacheMisses++;let tile=document.createElement('canvas');tile.width=tile.height=size;tile.getContext('2d').drawImage(art,q.rect.x,q.rect.y,q.rect.w,q.rect.h,0,0,size,size);entry={tile,bytes:size*size*4};if(entry.bytes<=262144){this.tileCache.set(key,entry);this.tileBytes+=entry.bytes;while(this.tileBytes>12582912||this.tileCache.size>4096){let first=this.tileCache.keys().next().value,old=this.tileCache.get(first);this.tileBytes-=old.bytes;this.tileCache.delete(first)}}}
  g.drawImage(entry.tile,x,y)
 }
 this.stats.cacheBytes=this.tileBytes;this.stats.sprites=list.length;this.stats.backend=this.backend;this.worldTransform()
 }
 flag(u,selected){let g=this.g,p=this.project(u),k=this.layout.k,sz=k<.45?8:6,dy=Math.min(18,Math.max(10,E.dims(u).w*k*.27));this.screenTransform();g.save();g.translate(p.x,p.y-dy);g.globalAlpha=u.rout?.64:1;line(g,0,dy*.7,0,-sz,"#3b3e35",1.3);poly(g,[[0,-sz],[sz*2.1,-sz],[sz*1.6,-sz*.27],[sz*2.1,sz*.42],[0,sz*.42]],colors[u.side],selected?"#f9d37d":cream,selected?1.8:.7);
 let t=E.spec(u);if(t.horse){line(g,4,-4,11,-4,cream,1.1);line(g,8,-7,8,0,cream,1.1)}else if(t.range){g.strokeStyle=cream;g.lineWidth=1.1;g.beginPath();g.arc(7,-4,4,-PI/2,PI/2);g.stroke();line(g,7,-8,7,0,cream,.8)}else{line(g,4,-1,11,-8,cream,1.2);line(g,8,-8,12,-8,cream,.8)}
 if(selected&&k<.9){g.fillStyle="#203747";g.font="600 10px system-ui";g.textAlign="center";g.fillText(u.rout?"Бегство":String(Math.round(u.n)),0,dy+8)}g.restore()}
 draw(state,o={}){
 if(state)this.F=E.forState(state);let start=performance.now(),g=this.g,{w,h,k}=o.layoutReady?this.layout:this.resize();this.stats={sprites:0,visible:0,drawMs:0};this.screenTransform();g.fillStyle="#1d3131";g.fillRect(0,0,w,h);if(!state)return;
 if(this.terrainRef!==state.terrain){this.terrainRef=state.terrain;this.terrain=this.terrainCache.get(state.terrain)||atlasTerrain(state.terrain,this.F);this.terrainCache.set(state.terrain,this.terrain)}this.worldTransform();g.drawImage(this.terrain,0,0,this.F.W,this.F.H);
 if(o.deploy){g.fillStyle="#325d961a";g.fillRect(0,0,this.F.W*.4,this.F.H);this.path([{x:this.F.W*.4,y:0},{x:this.F.W*.4,y:this.F.H}],"#335a85",1.5,[7,5])}
 const visible=state.units.filter(u=>E.alive(u)&&this.visible(u,100));this.stats.visible=visible.length;this.samples=[];this.effects=[];
 // A constant per-unit representative cap based on the entire army, not on changing camera visibility.
 const total=state.units.length,budget=Math.max(20,Math.min(132,Math.floor(7400/Math.max(1,total))));
 for(const u of visible){if(state.historical?.era==="antiquity"){const s=E.dims(u);g.save();g.translate(u.x,u.y);g.rotate(u.a);g.strokeStyle=colors[u.side];g.lineWidth=Math.max(1/k,s.d*.11);for(let i=0;i<4;i++)line(g,-s.d/2+(i+.5)*s.d/4,-s.w/2,-s.d/2+(i+.5)*s.d/4,s.w/2,colors[u.side],Math.max(.8/k,s.d*.08));g.restore()}else this.regiment(u,budget,state.time)}this.paintMiniatures();
 this.screenTransform();for(const e of this.effects){let drift=Math.sin(e.phase*2)*e.r*.25;oval(g,e.x+drift,e.y,e.r,e.r*.55,"rgba(195,179,145,"+e.alpha+")")}this.worldTransform();
 for(const u of visible){if(o.selected?.has(u.id))this.footprint(u,"#f7d687");if(this.layer)for(let [i,b] of E.bodies(u).entries()){let q=E.sectors(u)[i];if(q.contact>0||q.pressure>.1){g.save();g.translate(b.x,b.y);g.rotate(b.a);g.fillStyle="rgba(164,65,35,"+Math.min(.28,(q.pressure||.2)*.12)+")";g.fillRect(-b.geometry.d/2,-b.geometry.w/2,b.geometry.d,b.geometry.w);g.restore()}}}
 for(const shot of state.shots||[]){let t=clamp((state.time-shot.time)/1.5,0,1),x=shot.x+(shot.tx-shot.x)*t,y=shot.y+(shot.ty-shot.y)*t;this.path([{x:x-(shot.tx-shot.x)*.045,y:y-(shot.ty-shot.y)*.045},{x,y}],"#473c28c0",1.8);this.path([{x:x-(shot.tx-shot.x)*.035,y:y-(shot.ty-shot.y)*.035},{x,y}],"#fff5d6",1)}
 if(o.orders&&o.campaign){let C=o.campaign,groups=new Map();for(const u of C.own()){let q=C.orders[u.id];if(!q)continue;let a=u;for(let [i,s] of [q,...(q.stages||[])].entries()){let dest=C.end(u,i),active=o.selected?.has(u.id)&&i===o.stage,color=s.kind==='retreat'?'#c2d9ed':s.kind==='hold'||s.kind==='brace'?'#a6c5a7':s.kind==='charge'||s.kind==='attack'?'#e1a27a':'#f4dc98',path=[a,...(s.path||[])];if(s.target!==undefined){let target=state.units.find(v=>v.id===s.target);if(target)path.push(target)}let key=(o.individual||o.selected?.size===1&&o.selected.has(u.id)?u.id:s.group||u.id)+'|'+i+'|'+s.kind+'|'+(s.when||'');let item=groups.get(key)||{paths:[],ends:[],active:false,color,stage:i,kind:s.kind};item.paths.push(path);item.ends.push(dest);item.active||=active;groups.set(key,item);if(active||i===stagesLength(q)-1)this.footprint(dest,active?'#fff1b2':'#d7c59a65');a=dest}}
 for(const item of [...groups.values()].sort((a,b)=>Number(a.active)-Number(b.active))){let paths=item.paths.filter(p=>p.length>1),count=Math.max(0,...paths.map(p=>p.length)),route=[];for(let i=0;i<count;i++){let points=paths.map(p=>p[Math.round(i*(p.length-1)/Math.max(1,count-1))]);route.push({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length})}if(route.length>1)this.arrow(route,item.active?item.color:item.color+'60');let ends=item.ends;if(ends.length&&item.kind==='brace'){let c={x:ends.reduce((n,p)=>n+p.x,0)/ends.length,y:ends.reduce((n,p)=>n+p.y,0)/ends.length};let a=ends[0].a,w=Math.max(12,...ends.map(p=>Math.hypot(p.x-c.x,p.y-c.y)+E.dims(p).w/2));this.path([{x:c.x-Math.sin(a)*w,y:c.y+Math.cos(a)*w},{x:c.x+Math.sin(a)*w,y:c.y-Math.cos(a)*w}],item.active?item.color:item.color+'70',3,[5,3])}}
 }
 if(o.preview?.length>1)this.path(o.preview,"#fff3b3",2,[4,3]);if(o.linePreview)for(const u of Object.values(o.linePreview))this.footprint(u,"#fff5c6");
 this.screenTransform();for(const u of visible)if(k<.8||k<1.6&&o.selected?.has(u.id))this.flag(u,o.selected?.has(u.id));this.screenTransform();
 for(const h of o.handles||[]){let p=this.project(h);oval(g,p.x,p.y,h.kind==="point"?10:13,h.kind==="point"?10:13,h.kind==="point"?"#163947":"#fff1d1","#25475b",1.5);g.fillStyle=h.kind==="point"?cream:"#25475b";g.font="bold 13px system-ui";g.textAlign="center";g.textBaseline="middle";g.fillText(h.kind==="point"?String(h.index+1):({center:"✥",rotate:"↻",spread:"↔",depth:"↕"}[h.kind]||"·"),p.x,p.y)}
 if(o.selectionStroke?.length>1){g.strokeStyle="#fff3bf";g.fillStyle="#ffdf9130";g.lineWidth=1.4;g.beginPath();o.selectionStroke.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();g.stroke()}
 this.stats.drawMs=performance.now()-start;this.stats.canvasMode=this.canvasMode;if(this.autoCanvas&&this.backend==="canvas"&&this.canvasMode==="tiles"&&this.samples.length>=500){this.slowFrames=this.stats.drawMs>45?this.slowFrames+1:0;if(this.slowFrames>=4){this.preferredCanvasMode=this.canvasMode="legacy";this.tileCache.clear();this.tileBytes=0}}return this.stats
 }
}
