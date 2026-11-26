// Compact synchronous adaptation of Living Town / Urban Fabric frontage
// planning. All objects are presentation-only; observed data is the authority.
import {assetDimensions} from './landscape-assets.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function hash(x,y){let n=Math.imul(x+731,374761393)^Math.imul(y+511,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function sampleLine(a,b,fn,step=.045){const n=Math.max(1,Math.ceil(D(a,b)/step));for(let i=0;i<=n;i++)if(!fn(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))return false;return true;}
export function settlementClass(c){return c.fort>=1?'fortified':c.port>0?'port':c.capital?'capital':c.pop>900||c.specialization==='trade'?'trade':c.specialization==='farming'||c.developed>=3?'farm':'village';}
export function planUrbanTown(city,env,{candidate='urban'}={}){
 const {width,dry,water,road,eligible}=env,origin=[city.i%width+.5,Math.floor(city.i/width)+.5],kind=settlementClass(city),pop=city.pop||0,seed=city.i+city.id*7919,buildings=[],streets=[],walls=[],piers=[],plazas=[],missing=[];
 const historical=['historical','organic'].includes(candidate),cultural=candidate!=='urban',compact=candidate==='compact',small=pop<400&&!city.capital;
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
 if(!cultural){
 const spokes=kind==='village'?3:kind==='farm'?4:6;for(let k=0;k<spokes;k++){const a=k*Math.PI*2/spokes+(hash(seed,k)-.5)*.48,r=radius*(.62+.20*hash(seed,k+90));append(route(at(Math.cos(a)*r,Math.sin(a)*r)),k<2?'main':'lane');}
 // Side streets connect the branches into compact, nonuniform blocks.
 const ends=streets.flat().filter(p=>D(p,center)>.25);for(let k=0;k<ends.length&&streets.length<(kind==='village'?12:kind==='farm'?20:45);k++){const a=ends[k],options=ends.filter(b=>D(a,b)>.28&&D(a,b)<.64&&!segCache.some(([u,v])=>D(a,u)<.03&&D(b,v)<.03||D(a,v)<.03&&D(b,u)<.03)).sort((a,b)=>D(a,center)-D(b,center));for(const b of options.slice(0,3))if(addStreet(a,b,'lane'))break;}

 }else{
 // Trade axis, side lanes rooted in it; no all-pairs endpoint triangulation.
 // Keep graph routing as fallback whenever direct alignment crosses wet or steep terrain.
 const axial=(a,b,kind)=>{if(safe(a,b)){addStreet(a,b,kind);return true;}const p=route(b);return append(p,kind);};
 const ends=[];for(const sign of [-1,1]){const bend=historical?(.12+.12*hash(seed,sign+311))*(hash(seed,sign+93)>.5?1:-1):0,target=at(sign*radius*(compact?.78:.87),radius*bend);const p=route(target);if(p?.length>1){append(p,'main');ends.push(p.at(-1));}}
 const main=streets.filter((_,i)=>streetKinds[i]==='main').slice();
 const junctions=main.flat().filter(p=>D(p,center)>.18).sort((a,b)=>D(a,center)-D(b,center));
 const roots=[center];if(!small)for(const j of junctions)if(roots.every(p=>D(p,j)>.36)&&roots.length<(compact?4:3))roots.push(j);
 const sideLanes=[];for(const [k,p] of roots.entries()){for(const side of small?[1]:[-1,1]){const reach=small?.32:radius*(compact?.36:.32)*( .85+.26*hash(seed,k+side+90)),skew=historical?(hash(seed,k*19+side+401)-.5)*.85:0,target=[p[0]-si*side*reach+co*reach*skew,p[1]+co*side*reach+si*reach*skew];let end=null;for(let f=1;f>=.35;f-=.20){const b=[p[0]+(target[0]-p[0])*f,p[1]+(target[1]-p[1])*f];if(safe(p,b)&&D(p,b)>.14){addStreet(p,b,'lane');end=b;break;}}if(end)sideLanes.push({root:p,end,side});}}
 if(!small){for(const side of [-1,1]){const lanes=sideLanes.filter(p=>p.side===side).sort((a,b)=>((a.root[0]-b.root[0])*co+(a.root[1]-b.root[1])*si));for(let i=1;i<lanes.length;i++){const a=lanes[i-1].end,b=lanes[i].end;if(D(a,b)<radius*.90&&safe(a,b)){if(historical){const mid=[(a[0]+b[0])/2+(hash(seed,i+side+911)-.5)*.12,(a[1]+b[1])/2+(hash(seed,i+side+171)-.5)*.12];if(safe(a,mid)&&safe(mid,b)){addStreet(a,mid,'lane');addStreet(mid,b,'lane');}else addStreet(a,b,'lane');}else addStreet(a,b,'lane');}}}}
 // A small settlement needs a single route and short access, not a grid.
 if(!streets.length)for(const sign of [-1,1])axial(center,at(sign*.3,0),'main');
 }
 for(const p of approaches){const path=route(p);if(path){append(path,'main');addStreet(path.at(-1),p,'main');}}
 if(safe(center,origin))addStreet(center,origin,'main');
 if(city.capital||kind==='trade'||kind==='port'){const p=at(.05,.18);if(footprint(...p,.10))plazas.push({p,r:.12});}
 // Fortification is conditional, not inferred from the capital label.
 if(city.fort>0){for(const rad of [.55,.43,.32,.23]){const ring=Array.from({length:12},(_,i)=>at(Math.cos(i*Math.PI/6)*rad,Math.sin(i*Math.PI/6)*rad*.80));if(ring.every((p,i)=>safe(p,ring[(i+1)%ring.length]))){const seg=segments(),cross=(a,b)=>seg.some(([u,v])=>{const dx=b[0]-a[0],dy=b[1]-a[1],ex=v[0]-u[0],ey=v[1]-u[1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-8)return false;const t=((u[0]-a[0])*ey-(u[1]-a[1])*ex)/det,q=((u[0]-a[0])*dy-(u[1]-a[1])*dx)/det;return t>=0&&t<=1&&q>=0&&q<=1;}),edges=ring.map((a,i)=>[a,ring[(i+1)%ring.length]]),gates=edges.map(([a,b],i)=>cross(a,b)?i:-1).filter(i=>i>=0);if(!gates.length)continue;walls.push({ring,gates,level:city.fort});break;}}if(!walls.length)missing.push('no dry enclosure');}
 const wallSegments=()=>walls.flatMap(w=>w.ring.map((a,i)=>[a,w.ring[(i+1)%w.ring.length]]));
 const frontageAccess=p=>segments().some(([a,b])=>{if(segmentDistance(p,a,b)>.43)return false;const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return safe(p,[a[0]+dx*t,a[1]+dy*t]);});
 const place=(type,p,ang=angle)=>{if(cultural&&!frontageAccess(p))return false;const dim=assetDimensions[type],f=type==='house'||type==='timber'?factor*(.86+.15*hash(seed,Math.round(p[0]*53)+Math.round(p[1]*79))):factor,r=Math.hypot(dim[0],dim[1])*.50*f;if(!footprint(...p,r)||(env.grade?.(...p)??0)>.25||buildings.some(b=>D(p,[b.x,b.y])<r+b.r+.012)||segments().some(([a,b])=>segmentDistance(p,a,b)<r+.025)||wallSegments().some(([a,b])=>segmentDistance(p,a,b)<r+.025)||plazas.some(q=>D(p,q.p)<q.r+r))return false;buildings.push({type,x:p[0],y:p[1],r,angle:ang,variant:Math.floor(hash(seed,buildings.length)*3),factor:f,profile:cultural?((historical?'historical-':'')+(city.port?'coastal':kind==='farm'||kind==='village'?'rural':compact?'compact':'inland')):undefined});return true;};
 const frontage=[];for(const [a,b] of segments()){const n=Math.max(1,Math.floor(D(a,b)/.115)),ang=Math.atan2(b[1]-a[1],b[0]-a[0]),dx=Math.cos(ang),dy=Math.sin(ang);for(let i=0;i<n;i++)for(const side of [-1,1])for(const depth of [.115,.19,.31]){const t=(i+.5)/n,p=[a[0]+(b[0]-a[0])*t-dy*side*depth,a[1]+(b[1]-a[1])*t+dx*side*depth];if(D(p,center)<radius+.12)frontage.push({p,ang:cultural?ang+(side>0?Math.PI:0):ang+Math.PI/2});}}
 const slots=[...frontage.sort((a,b)=>D(a.p,center)-D(b.p,center)),...candidates.filter(p=>segments().some(([a,b])=>segmentDistance(p,a,b)<.40)).map(p=>{const nearest=cultural?segments().reduce((best,s)=>!best||segmentDistance(p,...s)<segmentDistance(p,...best)?s:best,null):null;if(!nearest)return {p,ang:angle};const [a,b]=nearest,ang=Math.atan2(b[1]-a[1],b[0]-a[0]),side=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);return {p,ang:ang+(side>0?Math.PI:0)};})];
 const desired=(type,p)=>{for(const q of [...slots].sort((a,b)=>D(a.p,p)-D(b.p,p)))if(D(q.p,p)<radius&&place(type,q.p,q.ang))return true;return false;};
 if(city.fort>=2)desired('keep',at(-.24,-.2));
 // Ecclesiastical architecture is a representative civic family, not an
 // invented economic building. Avoid monumental cathedrals in small towns.
 desired(city.capital&&pop>1600?'church':'chapel',at(-.18,.22));
 if(city.capital||kind==='trade'||kind==='port')desired('market',at(.20,-.20));
 if(city.port>0){const coast=[];for(let k=0;k<24;k++){const a=k*Math.PI/12,dx=Math.cos(a),dy=Math.sin(a);for(let t=.05;t<radius+1;t+=.05){const p=[center[0]+dx*t,center[1]+dy*t];if(!water(...p))continue;const land=[p[0]-dx*.12,p[1]-dy*.12],end=[p[0]+dx*.20,p[1]+dy*.20];if(dry(...land,.025)&&water(...end)&&safe(center,land)&&sampleLine(p,end,water)){coast.push({land,shore:p,end});}break;}}
 coast.sort((a,b)=>D(a.land,center)-D(b.land,center));for(const p of coast){if(piers.some(q=>D(q.land,p.land)<.32))continue;addStreet(center,p.land);piers.push(p);if(piers.length>=Math.min(3,city.port))break;}for(const p of piers)desired('warehouse',p.land);if(!piers.length)missing.push('no connected waterfront');}
 let shops=0,industry=(city.build||[]).slice(2).reduce((a,b)=>a+b,0);
 for(const q of slots){if(buildings.length>=target)break;const i=buildings.length,type=shops<industry?'shop':(kind==='farm'||kind==='village')&&i%5===0?'barn':cultural?(hash(seed,i+321)<(city.port?.24:kind==='farm'?.66:.42)?'timber':'house'):i%3===0?'timber':'house';if(place(type,q.p,q.ang)&&type==='shop')shops++;}
 if(cultural){for(let j=streets.length-1;j>=0;j--){if(streetKinds[j]==='main')continue;const [a,b]=streets[j],used=buildings.some(q=>segmentDistance([q.x,q.y],a,b)<.29)||piers.some(q=>segmentDistance(q.land,a,b)<.12),connected=streets.some((row,i)=>i!==j&&row.some(p=>D(p,a)<.035))&&streets.some((row,i)=>i!==j&&row.some(p=>D(p,b)<.035));if(!used&&!connected){streets.splice(j,1);streetKinds.splice(j,1);segCache.splice(j,1);}}}
 const courtyards=[];for(const b of buildings){if(!['house','timber','barn'].includes(b.type))continue;const off=cultural?.16:.13,X=b.x+(historical?Math.sin(b.angle):Math.cos(b.angle))*off,Y=b.y+(historical?-Math.cos(b.angle):Math.sin(b.angle))*off;if(footprint(X,Y,.045)&&!buildings.some(a=>D([X,Y],[a.x,a.y])<a.r+.04)&&!segments().some(([a,b])=>segmentDistance([X,Y],a,b)<.065))courtyards.push({x:X,y:Y,r:cultural?.055:.04,angle:b.angle,owner:b.type});}return {city:city.id,kind,origin,center,buildings,streets,streetKinds,walls,piers,plazas,courtyards,missing,target,reachable:queue.length,candidate};
}
export function planUrbanFields(i,env,dev,resource){const {width,dry,eligible,occupied,grade}=env,x=i%width,y=Math.floor(i/width),fields=[];if(dev<=.15||resource!==0)return fields;const angle=(hash(Math.floor(x/3),Math.floor(y/3))-.5)*.55,co=Math.cos(angle),si=Math.sin(angle),valid=(X,Y)=>Math.floor(X)===x&&Math.floor(Y)===y&&eligible(X,Y)&&dry(X,Y,.022)&&!occupied(X,Y)&&grade(X,Y)<.19;
 // Five irregular parcels, with a smaller terrain-constrained fallback.
 for(let k=0;k<4;k++){const cx=x+.25+(k%2)*.5+(hash(i,k)-.5)*.07,cy=y+.25+Math.floor(k/2)*.5+(hash(i,k+17)-.5)*.07;for(const f of [1,.76,.54]){const w=(.15+.047*dev)*f,h=(.17+.04*dev)*f,at=(a,b)=>[cx+a*co-b*si,cy+a*si+b*co],poly=[at(-w,-h*.93),at(w*.94,-h),at(w,h*.85),at(-w*.88,h)];if(!poly.every((p,j)=>sampleLine(p,poly[(j+1)%4],valid))||![-.65,0,.65].every(a=>[-.65,0,.65].every(b=>valid(...at(a*w,b*h)))))continue;const rows=[];for(let a=-w*.76;a<=w*.77;a+=.036)rows.push([at(a,-h*.78),at(a+.008,h*.78)]);fields.push({poly,rows,kind:(i+k)%3,center:[cx,cy]});break;}}
 return fields;}
