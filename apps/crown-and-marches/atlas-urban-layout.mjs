// Compact synchronous adaptation of Living Town / Urban Fabric frontage
// planning. All objects are presentation-only; observed data is the authority.
import {assetDimensions} from './landscape-assets.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function hash(x,y){let n=Math.imul(x+731,374761393)^Math.imul(y+511,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function sampleLine(a,b,fn,step=.045){const n=Math.max(1,Math.ceil(D(a,b)/step));for(let i=0;i<=n;i++)if(!fn(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))return false;return true;}
export function settlementClass(c){return c.capital?'capital':c.fort>=1?'fortified':c.port>0?'port':c.pop>900||c.specialization==='trade'?'trade':c.developed>=3?'farm':'village';}
export function planUrbanTown(city,env){
 const {width,dry,water,road,eligible}=env,origin=[city.i%width+.5,Math.floor(city.i/width)+.5],kind=settlementClass(city),pop=city.pop||0,seed=city.i+city.id*7919,buildings=[],streets=[],walls=[],piers=[],plazas=[],missing=[];
 const radius=C(.58+Math.sqrt(pop)/46+(city.capital?.30:0),.62,1.95),target=C(Math.round(pop/37)+(city.capital?9:0),5,64),factor=.76;
 const footprint=(x,y,r)=>[-1,0,1].every(a=>[-1,0,1].every(b=>dry(x+a*r,y+b*r,.016)&&eligible(x+a*r,y+b*r)));
 const safe=(a,b)=>sampleLine(a,b,(x,y)=>dry(x,y,.018)&&eligible(x,y));
 const candidates=[];for(let y=-16;y<=16;y++)for(let x=-16;x<=16;x++){const p=[origin[0]+x*.12,origin[1]+y*.12];if(D(p,origin)<=radius+.35&&footprint(...p,.07)&&(env.grade?.(...p)??0)<.27)candidates.push(p);}candidates.sort((a,b)=>D(a,origin)-D(b,origin));
 const center=candidates.find(p=>footprint(...p,.17))||candidates[0];if(!center)return {city:city.id,kind,origin,center:origin,buildings,streets,walls,piers,plazas,missing:['no dry center']};
 const approaches=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=Math.floor(origin[0])+dx,y=Math.floor(origin[1])+dy;if(road(x,y))approaches.push([x+.5,y+.5]);}
 const angle=approaches.length?Math.atan2(approaches[0][1]-center[1],approaches[0][0]-center[0]):Math.floor(hash(seed,7)*4)*Math.PI/4,co=Math.cos(angle),si=Math.sin(angle),at=(u,v)=>[center[0]+u*co-v*si,center[1]+u*si+v*co];
 // A contiguous axis, then shorter parallel lanes. No arbitrary radial
 // building scatter; lots have a street frontage and shared orientation.
 const streetKinds=[],segCache=[],segments=()=>segCache;
 const addStreet=(a,b,kind='lane')=>{if(D(a,b)>.075&&safe(a,b)){if(segCache.some(([u,v])=>D(a,u)<.035&&D(b,v)<.035||D(a,v)<.035&&D(b,u)<.035))return true;streets.push([a,b]);segCache.push([a,b]);streetKinds.push(kind);return true;}return false;};
 // Build one terrain-constrained local graph, root it at the actual dry
 // historic center, and route main street axes and curved cross-lanes.
 const step=.16,span=Math.ceil((radius+.35)/step),size=2*span+1,points=[],valid=new Uint8Array(size*size),prev=new Int32Array(size*size).fill(-2),depth=new Uint16Array(size*size),root=span*size+span,queue=[root];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,p=at((x-span)*step,(y-span)*step);points.push(p);valid[i]=+(D(p,center)<=radius+.25&&dry(...p,.024)&&eligible(...p)&&(env.grade?.(...p)??0)<.24);}
 valid[root]=1;prev[root]=-1;const dirs=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
 for(let k=0;k<queue.length;k++){const i=queue[k],x=i%size,y=Math.floor(i/size);for(const [dx,dy] of dirs){const X=x+dx,Y=y+dy,j=Y*size+X;if(X<0||Y<0||X>=size||Y>=size||!valid[j]||prev[j]!==-2||!safe(points[i],points[j]))continue;prev[j]=i;depth[j]=depth[i]+1;queue.push(j);}}
 const route=target=>{let best=-1,score=Infinity;for(const i of queue){const p=points[i],v=D(p,target)+depth[i]*.006;if(v<score){best=i;score=v;}}if(best<0||score>.55)return null;const path=[];for(let i=best;i>=0;i=prev[i])path.push(points[i]);path.reverse();return path;};
 const append=(p,kind)=>{if(!p||p.length<2)return false;let a=0;for(let i=1;i<p.length;i++){if(i===p.length-1||!safe(p[a],p[i+1])||D(p[a],p[i+1])>.42){addStreet(p[a],p[i],kind);a=i;}}return true;};
 const spokes=kind==='village'?3:kind==='farm'?4:6;for(let k=0;k<spokes;k++){const a=k*Math.PI*2/spokes+(hash(seed,k)-.5)*.48,r=radius*(.62+.20*hash(seed,k+90));append(route(at(Math.cos(a)*r,Math.sin(a)*r)),k<2?'main':'lane');}
 // Side streets connect the branches into compact, nonuniform blocks.
 const ends=streets.flat().filter(p=>D(p,center)>.25);for(let k=0;k<ends.length&&streets.length<45;k++){const a=ends[k],options=ends.filter(b=>D(a,b)>.28&&D(a,b)<.64&&!segCache.some(([u,v])=>D(a,u)<.03&&D(b,v)<.03||D(a,v)<.03&&D(b,u)<.03)).sort((a,b)=>D(a,center)-D(b,center));for(const b of options.slice(0,3))if(addStreet(a,b,'lane'))break;}
 for(const p of approaches){const path=route(p);if(path){append(path,'main');addStreet(path.at(-1),p,'main');}}
 if(safe(center,origin))addStreet(center,origin,'main');
 if(city.capital||kind==='trade'||kind==='port'){const p=at(.05,.18);if(footprint(...p,.10))plazas.push({p,r:.12});}
 // Fortification is conditional, not inferred from the capital label.
 if(city.fort>0){for(const rad of [.55,.43,.32,.23]){const ring=Array.from({length:12},(_,i)=>at(Math.cos(i*Math.PI/6)*rad,Math.sin(i*Math.PI/6)*rad*.80));if(ring.every((p,i)=>safe(p,ring[(i+1)%ring.length]))){const seg=segments(),cross=(a,b)=>seg.some(([u,v])=>{const dx=b[0]-a[0],dy=b[1]-a[1],ex=v[0]-u[0],ey=v[1]-u[1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-8)return false;const t=((u[0]-a[0])*ey-(u[1]-a[1])*ex)/det,q=((u[0]-a[0])*dy-(u[1]-a[1])*dx)/det;return t>=0&&t<=1&&q>=0&&q<=1;}),edges=ring.map((a,i)=>[a,ring[(i+1)%ring.length]]),gates=edges.map(([a,b],i)=>cross(a,b)?i:-1).filter(i=>i>=0);if(!gates.length)continue;walls.push({ring,gates,level:city.fort});break;}}if(!walls.length)missing.push('no dry enclosure');}
 const wallSegments=()=>walls.flatMap(w=>w.ring.map((a,i)=>[a,w.ring[(i+1)%w.ring.length]]));
 const place=(type,p,ang=angle)=>{const dim=assetDimensions[type],f=type==='house'||type==='timber'?factor*(.86+.15*hash(seed,Math.round(p[0]*53)+Math.round(p[1]*79))):factor,r=Math.hypot(dim[0],dim[1])*.50*f;if(!footprint(...p,r)||(env.grade?.(...p)??0)>.25||buildings.some(b=>D(p,[b.x,b.y])<r+b.r+.012)||segments().some(([a,b])=>segmentDistance(p,a,b)<r+.025)||wallSegments().some(([a,b])=>segmentDistance(p,a,b)<r+.025)||plazas.some(q=>D(p,q.p)<q.r+r))return false;buildings.push({type,x:p[0],y:p[1],r,angle:ang,variant:Math.floor(hash(seed,buildings.length)*3),factor:f});return true;};
 const frontage=[];for(const [a,b] of segments()){const n=Math.max(1,Math.floor(D(a,b)/.115)),ang=Math.atan2(b[1]-a[1],b[0]-a[0]),dx=Math.cos(ang),dy=Math.sin(ang);for(let i=0;i<n;i++)for(const side of [-1,1])for(const depth of [.115,.19,.31]){const t=(i+.5)/n,p=[a[0]+(b[0]-a[0])*t-dy*side*depth,a[1]+(b[1]-a[1])*t+dx*side*depth];if(D(p,center)<radius+.12)frontage.push({p,ang:ang+Math.PI/2});}}
 const slots=[...frontage.sort((a,b)=>D(a.p,center)-D(b.p,center)),...candidates.filter(p=>segments().some(([a,b])=>segmentDistance(p,a,b)<.40)).map(p=>({p,ang:angle}))];
 const desired=(type,p)=>{for(const q of [...slots].sort((a,b)=>D(a.p,p)-D(b.p,p)))if(D(q.p,p)<radius&&place(type,q.p,q.ang))return true;return false;};
 if(city.fort>=2)desired('keep',at(-.24,-.2));
 // Ecclesiastical architecture is a representative civic family, not an
 // invented economic building. Avoid monumental cathedrals in small towns.
 desired(city.capital&&pop>1600?'church':'chapel',at(-.18,.22));
 if(city.capital||kind==='trade'||kind==='port')desired('market',at(.20,-.20));
 if(city.port>0){const coast=[];for(let k=0;k<24;k++){const a=k*Math.PI/12,dx=Math.cos(a),dy=Math.sin(a);for(let t=.05;t<radius+1;t+=.05){const p=[center[0]+dx*t,center[1]+dy*t];if(!water(...p))continue;const land=[p[0]-dx*.12,p[1]-dy*.12],end=[p[0]+dx*.20,p[1]+dy*.20];if(dry(...land,.025)&&water(...end)&&safe(center,land)&&sampleLine(p,end,water)){coast.push({land,shore:p,end});}break;}}
 coast.sort((a,b)=>D(a.land,center)-D(b.land,center));for(const p of coast){if(piers.some(q=>D(q.land,p.land)<.32))continue;addStreet(center,p.land);piers.push(p);if(piers.length>=Math.min(3,city.port))break;}for(const p of piers)desired('warehouse',p.land);if(!piers.length)missing.push('no connected waterfront');}
 let shops=0,industry=(city.build||[]).slice(2).reduce((a,b)=>a+b,0);
 for(const q of slots){if(buildings.length>=target)break;const i=buildings.length,type=shops<industry?'shop':(kind==='farm'||kind==='village')&&i%5===0?'barn':i%3===0?'timber':'house';if(place(type,q.p,q.ang)&&type==='shop')shops++;}
 const courtyards=[];for(const b of buildings){if(!['house','timber','barn'].includes(b.type))continue;const X=b.x+Math.cos(b.angle)*.13,Y=b.y+Math.sin(b.angle)*.13;if(footprint(X,Y,.045)&&!buildings.some(a=>D([X,Y],[a.x,a.y])<a.r+.04)&&!segments().some(([a,b])=>segmentDistance([X,Y],a,b)<.065))courtyards.push({x:X,y:Y,r:.04});}return {city:city.id,kind,origin,center,buildings,streets,streetKinds,walls,piers,plazas,courtyards,missing,target,reachable:queue.length};
}
export function planUrbanFields(i,env,dev,resource){const {width,dry,eligible,occupied,grade}=env,x=i%width,y=Math.floor(i/width),fields=[];if(dev<=.15||resource!==0)return fields;const angle=(hash(Math.floor(x/3),Math.floor(y/3))-.5)*.55,co=Math.cos(angle),si=Math.sin(angle),valid=(X,Y)=>Math.floor(X)===x&&Math.floor(Y)===y&&eligible(X,Y)&&dry(X,Y,.022)&&!occupied(X,Y)&&grade(X,Y)<.19;
 // Five irregular parcels, with a smaller terrain-constrained fallback.
 for(let k=0;k<4;k++){const cx=x+.25+(k%2)*.5+(hash(i,k)-.5)*.07,cy=y+.25+Math.floor(k/2)*.5+(hash(i,k+17)-.5)*.07;for(const f of [1,.76,.54]){const w=(.15+.047*dev)*f,h=(.17+.04*dev)*f,at=(a,b)=>[cx+a*co-b*si,cy+a*si+b*co],poly=[at(-w,-h*.93),at(w*.94,-h),at(w,h*.85),at(-w*.88,h)];if(!poly.every((p,j)=>sampleLine(p,poly[(j+1)%4],valid))||![-.65,0,.65].every(a=>[-.65,0,.65].every(b=>valid(...at(a*w,b*h)))))continue;const rows=[];for(let a=-w*.76;a<=w*.77;a+=.036)rows.push([at(a,-h*.78),at(a+.008,h*.78)]);fields.push({poly,rows,kind:(i+k)%3,center:[cx,cy]});break;}}
 return fields;}
