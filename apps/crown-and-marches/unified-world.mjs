// Shared review-only spatial scene, not the campaign renderer.
// Both projections consume identical simulation-derived geometry and accepted
// architectural meshes. All depth and material calculations use world units.
import {mesh,palettes,assetDimensions} from './landscape-assets.mjs';
import {model} from './geography-review.mjs';
import {livingLand,livingRivers} from './landscape-surface.mjs';
import {planLivingTown} from './living-town.mjs';
const C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),L=(a,b,t)=>a+(b-a)*t,S=t=>{t=C(t);return t*t*(3-2*t)},mix=(a,b,t)=>a.map((v,i)=>L(v,b[i],t));
const H=(x,y,z=0)=>{let n=Math.imul(x+731,374761393)^Math.imul(y+541,668265263)^Math.imul(z+87,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296};
function noise(x,y){const i=Math.floor(x),j=Math.floor(y),a=S(x-i),b=S(y-j);return L(L(H(i,j),H(i+1,j),a),L(H(i,j+1),H(i+1,j+1),a),b);}
const dist=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
const segments=row=>row.slice(1).map((b,i)=>[row[i],b]);
export const proportions=Object.freeze({house:1,monument:1,tree:.52,wallHeight:.105,wallWidth:.055,tower:1,mainStreet:.065,lane:.038,riverMin:.022,riverMax:.145,pierWidth:.15,cargoBoatLength:.26});
const sleep=()=>new Promise(r=>setTimeout(r,0));
function budget(){let start=performance.now(),max=0;return {async yield(){const n=performance.now();if(n-start>=6){max=Math.max(max,n-start);await sleep();start=performance.now();}},get max(){return Math.max(max,performance.now()-start);}};}
function spatial(edges,margin=.65){const buckets=new Map();for(const e of edges){for(let y=Math.floor(Math.min(e.a[1],e.b[1])-margin);y<=Math.floor(Math.max(e.a[1],e.b[1])+margin);y++)for(let x=Math.floor(Math.min(e.a[0],e.b[0])-margin);x<=Math.floor(Math.max(e.a[0],e.b[0])+margin);x++){const k=x+','+y;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(e);}}return (x,y)=>buckets.get(Math.floor(x)+','+Math.floor(y))||[];}
const riverWidth=(m,e)=>C(.022+.026*Math.log2(Math.max(1,m.m.flow[e.i]/58)),.022,.145);
function height(m,x,y){
 // Continuous piecewise triangular surface with diagonals chosen to follow
 // local ridges; exact original height samples, no smoothed radial blobs.
 const u=x-.5,v=y-.5,i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,f=m.sample(x,y,'height')??0;
 const get=(x,y)=>{const k=m.at(x,y);return k>=0&&m.known[k]?m.m.height[k]:f;},h00=get(i,j),h10=get(i+1,j),h01=get(i,j+1),h11=get(i+1,j+1);
 if(Math.abs(h00-h11)<Math.abs(h10-h01))return a>=b?h00+(h10-h00)*a+(h11-h10)*b:h00+(h01-h00)*b+(h11-h01)*a;
 return a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
}
function graphCheck(t){
 const rows=t.roads,edges=rows.flatMap(segments),near=p=>edges.some(([a,b])=>dist(...p,a,b)<.035),reached=new Set(),points=[t.center];
 let changed=true;while(changed){changed=false;for(let i=0;i<rows.length;i++){if(reached.has(i))continue;const row=rows[i];if(!points.some(p=>segments(row).some(([a,b])=>dist(...p,a,b)<.036)))continue;reached.add(i);points.push(...row,...segments(row).flatMap(([a,b])=>Array.from({length:Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.10))},(_,i,arr)=>[L(a[0],b[0],i/arr.length),L(a[1],b[1],i/arr.length)])));changed=true;}}
 const mandatory=[...t.walls.map(r=>({type:'gate',p:r[r.gate??0]})),...t.piers.map(p=>({type:'port',p:p.land}))];
 return {roads:rows.length,connected:reached.size,mandatory:mandatory.map(o=>({type:o.type,connected:near(o.p)&&[...reached].some(i=>segments(rows[i]).some(([a,b])=>dist(...o.p,a,b)<.035))}))};
}
export async function buildUnifiedScene(s,cam,physical){
 const m=model(s);m.land=(x,y)=>livingLand(m,x,y);const network=livingRivers(m),timer=budget(),towns=[],spanX=640/cam.s+3,spanY=400/cam.s/.75+4,bounds=[Math.max(0,cam.x-spanX),Math.max(0,cam.y-spanY),Math.min(m.width,cam.x+spanX),Math.min(m.height,cam.y+spanY)];
 const [x0,y0,x1,y1]=bounds,visible=(x,y,pad=0)=>x>=x0-pad&&x<=x1+pad&&y>=y0-pad&&y<=y1+pad;
 if(!physical)for(const city of m.cities){const x=city.i%m.width+.5,y=Math.floor(city.i/m.width)+.5;if(!visible(x,y,3))continue;const town=await planLivingTown(m,city,network,{fabric:true,unified:true});town.graph=graphCheck(town);towns.push(town);await timer.yield();}
 const riverEdges=network.filter(e=>e.points.some(p=>visible(...p,1))).flatMap(e=>segments(e.points).map(([a,b])=>({a,b,w:riverWidth(m,e),i:e.i}))),riverAt=spatial(riverEdges,.55);
 const roadEdges=towns.flatMap(t=>t.roads.flatMap(row=>segments(row).map(([a,b])=>({a,b,w:proportions.mainStreet}))));
 if(!physical)for(let y=Math.max(0,Math.floor(y0));y<Math.min(m.height,Math.ceil(y1));y++)for(let x=Math.max(0,Math.floor(x0));x<Math.min(m.width,Math.ceil(x1));x++){const i=m.at(x,y);if(!m.fresh[i]||!s.road[i]||!m.m.land[i])continue;for(const [dx,dy] of [[1,0],[0,1]]){const j=m.at(x+dx,y+dy);if(j<0||!m.fresh[j]||!s.road[j]||!m.m.land[j])continue;roadEdges.push({a:[x+.5,y+.5],b:[x+dx+.5,y+dy+.5],w:.035});}}
 const roadAt=spatial(roadEdges,.18),plots=towns.flatMap(t=>t.buildings.map(b=>({a:[b.x,b.y],b:[b.x,b.y],r:b.r}))),plotAt=spatial(plots,.65);
 const nearestRiver=(x,y)=>{let n=Infinity,w=0;for(const e of riverAt(x,y)){const d=dist(x,y,e.a,e.b)-e.w/2;if(d<n){n=d;w=e.w;}}return [n,w];};
 const ground=(x,y)=>{const i=m.at(Math.floor(x),Math.floor(y)),l=m.land(x,y);if(i<0||l===null)return {z:0,c:[214,202,173],water:false,known:false};
 const h=height(m,x,y),dry=S((l-.46)/.26),base=Math.max(.012,(h-.12)*3.1)*dry,river=nearestRiver(x,y),bank=S(1-C((river[0]+.03)/.19)),channel=river[0]<=0;
 const z=l<.50?-.025:Math.max(-.018,base-bank*(.026+river[1]*.42));
 return {z,c:null,water:l<.50,channel,river,known:true,h,l,i,base};};
 const shade=(x,y,g)=>{if(!g.known)return [214,202,173];if(g.water){const shallow=S(g.l/.49),wave=(noise(x*.9,y*2.4)-.5)*9;return mix([34,77,97],[101,151,148],shallow).map(v=>v+wave);}
 const wet=m.sample(x,y,'moisture')??.5,fert=m.sample(x,y,'fert')??.5,forest=m.sample(x,y,'forest')??0,n=noise(x*.64,y*.64),stone=S((g.h-.39)/.19),grass=mix([164,153,99],[103,137,82],C(wet*.60+fert*.23+n*.17));
 let color=mix(grass,[66,100,63],S(forest)*.70);color=mix(color,[139,125,101],stone);color=mix(color,[200,190,167],S((g.h-.49)/.15));color=mix(color,[227,221,205],S((g.h-.64)/.14));
 if(g.l<.59)color=mix(color,[197,179,130],S((.59-g.l)/.09)*.60);
 const bank=S(1-C(g.river[0]/.17));color=mix(color,[109,131,83],bank*.48);
 if(g.channel)return mix([50,91,103],[105,146,132],S(1+C(g.river[0]/Math.max(.01,g.river[1]*.5),-1,0)));
 let urban=0;for(const p of plotAt(x,y))urban=Math.max(urban,S(1-dist(x,y,p.a,p.b)/(p.r*2.55)));
 if(urban>0)color=mix(color,[158,141,112],urban*.93);
 for(const town of towns)if(town.plazaRadius&&Math.hypot(x-town.center[0],y-town.center[1])<town.plazaRadius)color=mix(color,[180,166,138],.75);
 let road=0;for(const e of roadAt(x,y))road=Math.max(road,S(1-dist(x,y,e.a,e.b)/(e.w*.88)));color=mix(color,[192,174,136],road*.92);
 if(!physical&&m.fresh[g.i]&&s.district?.[g.i]===2&&s.development?.[g.i]>.15&&m.m.resource[g.i]===0&&urban<.15&&road<.20&&bank<.2){
 const u=x-Math.floor(x),v=y-Math.floor(y),dev=s.development[g.i],border=.035+(1-dev)*.11,warp=(noise(x*3,y*3)-.5)*.065;
 if(u>border&&u<1-border&&v>border&&v<1-border){const part=Math.floor((u+v*.21+warp)*3),stripe=(Math.sin((u+v*.21+warp)*Math.PI*74)+1)*.5;const crop=[[171,151,82],[129,149,75],[181,166,104]][((part+g.i)%3+3)%3];color=mix(color,crop,.82);color=color.map(c=>c+(stripe-.5)*15);}
 }
 const grain=(noise(x*3,y*3)-.5)*13;return color.map(v=>v+grain);};
 const objects=[],faces=[];const add=(type,x,y,angle=0,variant=0,size=1)=>objects.push({type,x,y,angle,variant,size});
 // Geometry primitives are constructed in world-space and share depth with all
 // accepted models. Wall height is 60% of an ordinary house, not a flat line.
 const box=(cx,cy,z,w,d,h,angle,mat)=>{const co=Math.cos(angle),si=Math.sin(angle),p=(x,y,z0)=>[cx+x*co-y*si,cy+x*si+y*co,z+z0],a=p(-w/2,-d/2,0),b=p(w/2,-d/2,0),c=p(w/2,d/2,0),e=p(-w/2,d/2,0),A=p(-w/2,-d/2,h),B=p(w/2,-d/2,h),D=p(w/2,d/2,h),E=p(-w/2,d/2,h);for(const p of [[a,b,B,A],[b,c,D,B],[c,e,E,D],[e,a,A,E],[A,B,D,E]])faces.push({p,mat});};
 for(const t of towns){for(const b of t.buildings)add(b.type,b.x,b.y,b.angle,b.variant);
 for(const ring of t.walls){const k=ring.gate??0;for(let i=0;i<ring.length;i++){if(i===k||i===(k+ring.length-1)%ring.length)continue;const a=ring[i],b=ring[(i+1)%ring.length],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,z=ground(x,y).z,len=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);box(x,y,z,len+.014,proportions.wallWidth,proportions.wallHeight,angle,'stone');for(let n=0;n<Math.max(1,Math.floor(len/.041));n++){const f=(n+.5)/Math.max(1,Math.floor(len/.041));box(L(a[0],b[0],f),L(a[1],b[1],f),z+proportions.wallHeight,.020,.049,.019,angle,'stone');}}
 const p=ring[k],prev=ring[(k+ring.length-1)%ring.length],next=ring[(k+1)%ring.length];add('gate',...p,Math.atan2(next[1]-prev[1],next[0]-prev[0]));for(const i of [k+9,k+18,k+27])add('tower',...ring[i%ring.length]);}
 for(const p of t.piers){const dx=p.end[0]-p.land[0],dy=p.end[1]-p.land[1],n=Math.hypot(dx,dy),angle=Math.atan2(dy,dx),x=(p.land[0]+p.end[0])/2,y=(p.land[1]+p.end[1])/2,z=Math.max(.015,ground(...p.land).z*.55);box(x,y,z,n,proportions.pierWidth,.026,angle,'wood');for(let f=.1;f<.99;f+=.16)for(const side of [-1,1])box(p.land[0]+dx*f-dy/n*side*.066,p.land[1]+dy*f+dx/n*side*.066,-.03,.024,.024,z+.10,0,'wood');
 const bx=p.end[0]+dy/n*.14,by=p.end[1]-dx/n*.14;if([[0,0],[-.12,0],[.12,0]].every(([u,v])=>(m.land(bx+u*dx/n,by+u*dy/n)??1)<.43)){const co=dx/n,si=dy/n,P=(u,v,z)=>[bx+u*co-v*si,by+u*si+v*co,z],hull=[P(-.13,0,.028),P(-.075,-.045,.028),P(.075,-.045,.028),P(.13,0,.028),P(.075,.045,.028),P(-.075,.045,.028)];faces.push({p:hull,mat:'wood'},{p:[P(-.07,-.03,.030),P(.07,-.03,.030),P(.07,.03,.030),P(-.07,.03,.030)],mat:'cloth'},{p:[P(0,0,.035),P(0,0,.19),P(.078,0,.065)],mat:'cloth'});box(bx,by,.025,.009,.009,.17,0,'wood');}}
 }
 // Bridges only where the actual simulation flags a crossing.
 if(!physical)for(let y=Math.floor(y0);y<y1;y++)for(let x=Math.floor(x0);x<x1;x++){const i=m.at(x,y);if(i<0||!m.fresh[i]||!s.bridge?.[i])continue;const e=network.find(r=>r.i===i||r.j===i);if(!e)continue;const a=e.points[0],b=e.points.at(-1),angle=Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI/2,z=ground(x+.5,y+.5).base;box(x+.5,y+.5,z,.25,.075,.024,angle,'wood');}
 if(cam.s>=23){const step=cam.s>90?.31:.51;for(let y=Math.floor(y0/step);y<y1/step;y++){for(let x=Math.floor(x0/step);x<x1/step;x++){const r=H(x,y),wx=(x+.5+(r-.5)*.9)*step,wy=(y+.5+(H(y,x+41)-.5)*.9)*step,i=m.at(Math.floor(wx),Math.floor(wy));if(i<0||!m.known[i]||!m.m.land[i]||m.m.terrain[i]!==2||(m.land(wx,wy)??0)<.68||nearestRiver(wx,wy)[0]<.06||plotAt(wx,wy).some(p=>dist(wx,wy,p.a,p.b)<p.r+.18)||roadAt(wx,wy).some(p=>dist(wx,wy,p.a,p.b)<.10))continue;if(r>.32+.36*noise(wx*.8,wy*.8))continue;add(['pine','fir','oak','birch'][Math.floor(H(x,y,4)*4)],wx,wy,H(x,y,8)*6.28,Math.floor(r*3),proportions.tree*(.72+H(x,y,9)*.54));}await timer.yield();}}
 return {m,network,bounds,ground,shade,objects,faces,towns,buildMaxSlice:timer.max};
}
function texture(mat,x,y,z){
 const r=H(Math.floor(x*290),Math.floor(y*290),Math.floor(z*290))-.5,frac=x=>x-Math.floor(x);let f=1+r*.13;
 if(mat==='stone'){const row=Math.floor(z/.017);if(frac(z/.017)<.09||frac((x+y)/.026+row*.5)<.06)f*=.76;}
 else if(mat==='roof'||mat==='slate'){if(frac((x+y)*76)<.07||frac(z*115+y*12)<.08)f*=.78;}
 else if(mat==='wood')f*=.90+.18*H(Math.floor((x+y)*160),Math.floor(z*8));
 else if(mat==='leaf')f*=.82+.34*H(Math.floor(x*170),Math.floor(y*170),Math.floor(z*170));
 return f;
}
export async function renderUnified(scene,cam,style,width=1280,height=800){
 const started=performance.now(),timer=budget(),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),im=ctx.createImageData(width,height),data=im.data,depth=new Float32Array(width*height).fill(-Infinity),diorama=style==='diorama',sin=diorama?.64:.21,cos=Math.sqrt(1-sin*sin),datum=scene.ground(cam.x,cam.y).z,scale=cam.s;
 const project=p=>[width/2+(p[0]-cam.x)*scale,height/2+((p[1]-cam.y)*cos-(p[2]-datum)*sin)*scale,(p[1]-cam.y)*sin+(p[2]-datum)*cos];
 for(let k=0;k<data.length;k+=4){data[k]=214;data[k+1]=204;data[k+2]=177;data[k+3]=255;}
 let triangles=0,drawn=0;
 const triangle=(a,b,c,colors,mat=null,local=null)=>{const A=project(a),B=project(b),D=project(c),area=(B[0]-A[0])*(D[1]-A[1])-(B[1]-A[1])*(D[0]-A[0]);if(Math.abs(area)<.00001)return;triangles++;
 const loX=Math.max(0,Math.floor(Math.min(A[0],B[0],D[0]))),hiX=Math.min(width-1,Math.ceil(Math.max(A[0],B[0],D[0]))),loY=Math.max(0,Math.floor(Math.min(A[1],B[1],D[1]))),hiY=Math.min(height-1,Math.ceil(Math.max(A[1],B[1],D[1])));if(loX>hiX||loY>hiY)return;
 for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){const X=x+.5-A[0],Y=y+.5-A[1],u=(X*(D[1]-A[1])-Y*(D[0]-A[0]))/area,v=((B[0]-A[0])*Y-(B[1]-A[1])*X)/area,w=1-u-v;if(u<-.00001||v<-.00001||w<-.00001)continue;const z=A[2]*w+B[2]*u+D[2]*v,i=y*width+x;if(z<=depth[i])continue;depth[i]=z;const k=i*4,wx=a[0]*w+b[0]*u+c[0]*v,wy=a[1]*w+b[1]*u+c[1]*v,wz=a[2]*w+b[2]*u+c[2]*v,tex=mat?texture(mat,wx,wy,wz):1,grain=(H(x,y)-.5)*(diorama?3:7);let ink=1;if(!diorama&&mat&&Math.min(u,v,w)<.018&&mat!=='leaf')ink=.91;for(let j=0;j<3;j++)data[k+j]=C((colors[0][j]*w+colors[1][j]*u+colors[2][j]*v)*tex*ink+grain,0,255);drawn++;}
 };
 const normal=(a,b,c)=>{const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;return n.map(x=>x/len);};
 const light=[-.55,-.48,.68],illum=n=>C(.62+.57*(n[0]*light[0]+n[1]*light[1]+Math.abs(n[2])*light[2]),.39,1.20);
 const [x0,y0,x1,y1]=scene.bounds,step=Math.max(.045,Math.min(.16,3.4/scale)),cols=Math.ceil((x1-x0)/step)+1,rows=Math.ceil((y1-y0)/step)+1,grid=[];
 for(let j=0;j<rows;j++){const row=[];for(let i=0;i<cols;i++){const x=L(x0,x1,i/(cols-1)),y=L(y0,y1,j/(rows-1)),g=scene.ground(x,y),color=scene.shade(x,y,g);row.push({p:[x,y,g.z],color,g});}grid.push(row);await timer.yield();}
 // Terrain triangles are continuous across the entire scene. Local shadow
 // factor is evaluated from actual surrounding terrain, not image noise.
 for(let j=0;j<rows-1;j++){for(let i=0;i<cols-1;i++){const a=grid[j][i],b=grid[j][i+1],c=grid[j+1][i+1],d=grid[j+1][i];for(const f of [[a,b,c],[a,c,d]]){const n=normal(...f.map(v=>v.p)),lit=f.every(v=>v.g.water||!v.g.known)?1:illum(n);const colors=f.map(v=>{let col=v.color.map(q=>q*lit);if(!diorama&&!v.g.water&&v.g.h>.43){const hatch=Math.sin((v.p[0]+v.p[1]*.45)*56);col=mix(col,[92,85,72],Math.max(0,hatch)*Math.max(0,.92-lit)*.24);}return col;});triangle(...f.map(v=>v.p),colors);}}await timer.yield();}
 // River surface ribbons are placed within the depressed bed, with actual
 // bank slopes beneath. At mouths the water surface joins the sea.
 for(const e of scene.network){const w=riverWidth(scene.m,e);for(let k=1;k<e.points.length;k++){const a=e.points[k-1],b=e.points[k];if(a[0]<x0-1||a[0]>x1+1||a[1]<y0-1||a[1]>y1+1)continue;const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1,off=[-dy/n*w*.44,dx/n*w*.44],P=(p,sign)=>{const x=p[0]+off[0]*sign,y=p[1]+off[1]*sign;return [x,y,scene.ground(x,y).z+.009];},p=[P(a,-1),P(b,-1),P(b,1),P(a,1)],col=mix([61,101,111],[107,143,129],C(1-w/.13));triangle(p[0],p[1],p[2],[col,col,col]);triangle(p[0],p[2],p[3],[col,col,col]);}await timer.yield();}
 // Shadows projected on the same terrain, before true 3D architecture.
 for(const o of scene.objects){const size=o.size||1,h=(assetDimensions[o.type]?.[2]||.32)*size,r=(assetDimensions[o.type]?.[0]||.17)*size*.57,x=o.x+h*.40,y=o.y+h*.33,g=scene.ground(x,y);if(g.water||!g.known)continue;const col=scene.shade(x,y,g).map(v=>v*.72),p=[x,y,g.z+.006];for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6,P=t=>{const X=x+Math.cos(t)*r,Y=y+Math.sin(t)*r*.7;return [X,Y,scene.ground(X,Y).z+.006]};triangle(p,P(a),P(b),[col,col,col]);}await timer.yield();}
 const face=(p,mat,variation=0)=>{const n=normal(p[0],p[1],p[2]),lit=illum(n)+variation,base=palettes[mat]||palettes.stone;let col=base.map(v=>v*lit);if(!diorama)col=mix(col,[180,163,125],.10);for(let k=1;k<p.length-1;k++)triangle(p[0],p[k],p[k+1],[col,col,col],mat);};
 for(const f of scene.faces){face(f.p,f.mat);await timer.yield();}
 for(const o of scene.objects){const co=Math.cos(o.angle),si=Math.sin(o.angle),z=scene.ground(o.x,o.y).z;for(const f of mesh(o.type,o.variant)){const p=f.p.map(v=>[o.x+(v[0]*co-v[1]*si)*o.size,o.y+(v[0]*si+v[1]*co)*o.size,z+v[2]*o.size]);face(p,f.mat,f.variation||0);}await timer.yield();}
 ctx.putImageData(im,0,0);return {canvas,ms:performance.now()-started,maxSlice:timer.max,triangles,drawn,projection:{sin,cos,scale,datum}};
}
