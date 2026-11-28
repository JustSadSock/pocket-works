import {drawMiniature} from './landscape-assets.mjs';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function rand(x,y){let n=Math.imul(x+731,374761393)^Math.imul(y+511,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
function distance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
const segments=row=>row.slice(1).map((b,i)=>[row[i],b]);
function path(c,points,close=false){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);if(close)c.closePath();}
function line(c,p,color,width){path(c,p);c.lineCap='round';c.lineJoin='round';c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function poly(c,p,color){path(c,p,true);c.fillStyle=color;c.fill();}
const pause=()=>new Promise(r=>setTimeout(r,0));
// The town's ground layer is one continuous raster, constrained by actual
// shore and river geometry. No square per-building pedestal.
export async function prepareUrbanGround(m,t,network){
 const start=performance.now(),points=[t.center,...t.buildings.map(b=>[b.x,b.y]),...t.roads.flat(),...t.walls.flat(),...t.piers.map(p=>p.land)],x0=Math.floor((Math.min(...points.map(p=>p[0]))-.55)*4)/4,y0=Math.floor((Math.min(...points.map(p=>p[1]))-.55)*4)/4,x1=Math.ceil((Math.max(...points.map(p=>p[0]))+.55)*4)/4,y1=Math.ceil((Math.max(...points.map(p=>p[1]))+.55)*4)/4,res=84,w=Math.ceil((x1-x0)*res),h=Math.ceil((y1-y0)*res),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const c=canvas.getContext('2d'),mask=document.createElement('canvas');mask.width=w;mask.height=h;const q=mask.getContext('2d');q.scale(res,res);q.translate(-x0,-y0);
 const glow=(x,y,r,a)=>{const g=q.createRadialGradient(x,y,r*.36,x,y,r);g.addColorStop(0,'rgba(255,255,255,'+a+')');g.addColorStop(1,'rgba(255,255,255,0)');q.fillStyle=g;q.fillRect(x-r,y-r,r*2,r*2);};
 for(const b of t.buildings)glow(b.x,b.y,b.r*(t.city.pop>1600?2.45:1.8),.82);
 for(const row of t.roads){line(q,row,'#ffffff48',.19);line(q,row,'#ffffffc8',.09);}
 if(t.plazaRadius)glow(...t.center,t.plazaRadius*1.75,.95);
 for(const p of t.piers)glow(...p.land,.24,.8);
 const density=q.getImageData(0,0,w,h).data,im=c.createImageData(w,h),out=im.data,near=network.filter(e=>e.points.some(p=>p[0]>=x0-1&&p[0]<=x1+1&&p[1]>=y0-1&&p[1]<=y1+1)).flatMap(e=>segments(e.points).map(([a,b])=>({a,b,width:e.width})));
 // Only a few river segments can touch each spatial bucket.
 const buckets=new Map();for(const e of near){for(let y=Math.floor(Math.min(e.a[1],e.b[1])-.2);y<=Math.floor(Math.max(e.a[1],e.b[1])+.2);y++)for(let x=Math.floor(Math.min(e.a[0],e.b[0])-.2);x<=Math.floor(Math.max(e.a[0],e.b[0])+.2);x++){const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(e);}}
 let last=performance.now(),maxSlice=0;
 for(let y=0;y<h;y++){for(let x=0;x<w;x++){const i=(y*w+x)*4,a=density[i+3]/255;if(a<.025)continue;const wx=x0+(x+.5)/res,wy=y0+(y+.5)/res,id=m.at(Math.floor(wx),Math.floor(wy));if(id<0||!m.known[id]||!m.m.land[id]||(m.land(wx,wy)??0)<.59)continue;const rivers=buckets.get(Math.floor(wx)+','+Math.floor(wy))||[];if(rivers.some(e=>distance(wx,wy,e.a,e.b)<e.width/2+.035))continue;
 const r=rand(Math.floor(wx*111),Math.floor(wy*111)),coarse=rand(Math.floor(wx*12),Math.floor(wy*12)),f=(r-.5)*20+(coarse-.5)*12;const urban=t.city.pop>1600;out[i]=(urban?158:143)+f;out[i+1]=(urban?143:128)+f;out[i+2]=(urban?112:91)+f;out[i+3]=255*S(a)*.91;}const now=performance.now();if(now-last>=6){maxSlice=Math.max(maxSlice,now-last);await pause();last=performance.now();}}
 c.putImageData(im,0,0);return {canvas,x0,y0,width:w/res,height:h/res,ms:performance.now()-start,maxSlice:Math.max(maxSlice,performance.now()-last)};
}
export function drawUrbanGround(c,t){
 const a=t.ground;if(a)c.drawImage(a.canvas,a.x0,a.y0,a.width,a.height);
 for(const row of t.roads){line(c,row,'#84755b88',.043);line(c,row,'#b9a782',.026);}
 if(t.plazaRadius){const [x,y]=t.center,r=t.plazaRadius;c.save();c.translate(x,y);c.fillStyle='#bcb096aa';c.beginPath();c.ellipse(0,0,r,r*.76,0,0,Math.PI*2);c.fill();for(let y=-r*.65;y<r*.65;y+=.022){const width=Math.sqrt(Math.max(0,1-(y/(r*.76))**2))*r*.86;line(c,[[-width,y],[width,y]],'#857b6966',.003);}c.restore();}
}
// Harvested or planted strips are drawn only on currently known agricultural
// districts with actual positive development and grain-producing resources.
export function drawAgriculture(c,m,bounds,towns,network,scale){
 if(scale<6)return 0;const [x0,y0,x1,y1]=bounds,river=network.filter(e=>e.points.some(p=>p[0]>=x0-1&&p[0]<=x1+1&&p[1]>=y0-1&&p[1]<=y1+1)).flatMap(e=>segments(e.points).map(([a,b])=>({a,b,w:e.width})));let fields=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=m.at(x,y),dev=m.s.development?.[i]||0;if(i<0||!m.fresh[i]||!m.m.land[i]||m.s.district?.[i]!==2||m.m.resource[i]!==0||dev<=.15)continue;const nearby=river.filter(e=>Math.abs(e.a[0]-x)<2&&Math.abs(e.a[1]-y)<2),angle=(rand(x,y)-.5)*.72,co=Math.cos(angle),si=Math.sin(angle);
 for(let k=0;k<3;k++){const cx=x+.21+k*.28,cy=y+.48+(rand(x+k,y+71)-.5)*.22,w=.10+dev*.025,h=.23+dev*.12,point=(u,v)=>[cx+u*co-v*si,cy+u*si+v*co],pts=[point(-w,-h),point(w,-h*.91),point(w*.88,h),point(-w*.93,h*.86)];
 if(!pts.every(p=>{const id=m.at(Math.floor(p[0]),Math.floor(p[1]));return id===i&&(m.land(...p)??0)>.67&&!nearby.some(e=>distance(...p,e.a,e.b)<e.w/2+.055)&&!towns.some(t=>t.buildings.some(b=>D(p,[b.x,b.y])<b.r+.08)||t.roads.some(row=>segments(row).some(([a,b])=>distance(...p,a,b)<.04)));}))continue;
 fields++;poly(c,pts,['#b8a164','#8b9855','#c1b778'][(i+k)%3]);c.save();path(c,pts,true);c.clip();for(let u=-w;u<w;u+=.024){line(c,[point(u,-h),point(u+.009,h)],k%2?'#697b44a0':'#7b683c90',.006);if(scale>50)line(c,[point(u+.009,-h),point(u+.018,h)],'#d6cc8990',.006);}c.restore();line(c,[...pts,pts[0]],'#777b4a66',.008);
 }}
 return fields;
}
export function drawWaterfront(c,t,m){
 let boats=0;for(const p of t.piers){const dx=p.end[0]-p.land[0],dy=p.end[1]-p.land[1],n=Math.hypot(dx,dy)||1,ux=dx/n,uy=dy/n,vx=-uy,vy=ux,half=.062,at=(a,b)=>[p.land[0]+ux*a+vx*b,p.land[1]+uy*a+vy*b],shape=[at(0,-half*1.2),at(n,-half*.9),at(n,half*.9),at(0,half*1.2)];
 poly(c,shape.map(p=>[p[0]+.017,p[1]+.024]),'#233c3b65');poly(c,shape,'#716451');poly(c,[at(.008,-half*.96),at(n-.015,-half*.72),at(n-.015,half*.72),at(.008,half*.96)],'#b49b6d');for(let d=.02;d<n-.015;d+=.024)line(c,[at(d,-half*.90),at(d,half*.90)],'#7a6243',.004);
 for(let d=.05;d<n;d+=.09)for(const side of [-1,1])line(c,[at(d,side*half),[at(d,side*half)[0],at(d,side*half)[1]-.024]],'#554b36',.013);
 // Optional cargo craft: reject every candidate whose hull would touch land
 // or an unknown cell; no gameplay ships or economic bonuses are created.
 for(const side of [-1,1]){const mid=at(n*.77,side*.13),a=[mid[0]-ux*.12,mid[1]-uy*.12],b=[mid[0]+ux*.12,mid[1]+uy*.12],hull=[a,[mid[0]+vx*.047,mid[1]+vy*.047],b,[mid[0]-vx*.047,mid[1]-vy*.047]];if(!hull.every(p=>(m.land(...p)??1)<.42))continue;poly(c,hull.map(p=>[p[0]+.008,p[1]+.017]),'#163a4c75');poly(c,hull,'#4d3e2b');poly(c,[a,[mid[0]+vx*.032,mid[1]+vy*.032],b,[mid[0]-vx*.032,mid[1]-vy*.032]],'#b18a59');line(c,[a,b],'#6b4d31',.009);const mast=[mid[0],mid[1]-.10];line(c,[mid,mast],'#554b39',.008);poly(c,[mast,[mid[0]+ux*.072,mid[1]-.025],[mid[0],mid[1]-.018]],'#e5d8b6');boats++;break;}
 }return boats;
}
