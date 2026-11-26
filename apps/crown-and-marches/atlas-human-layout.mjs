// Compact synchronous adaptation of Living Town / Urban Fabric frontage
// planning. All objects are presentation-only; observed data is the authority.
import {assetDimensions} from './landscape-assets.mjs';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function hash(x,y){let n=Math.imul(x+731,374761393)^Math.imul(y+511,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=C(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function sampleLine(a,b,fn,step=.045){const n=Math.max(1,Math.ceil(D(a,b)/step));for(let i=0;i<=n;i++)if(!fn(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))return false;return true;}
export function settlementClass(c){return c.capital?'capital':c.fort>=1?'fortified':c.port>0?'port':c.pop>900||c.specialization==='trade'?'trade':c.developed>=3?'farm':'village';}
export function planHumanTown(city,env){
 const {width,dry,water,road,eligible}=env,origin=[city.i%width+.5,Math.floor(city.i/width)+.5],kind=settlementClass(city),pop=city.pop||0,seed=city.i+city.id*7919,buildings=[],streets=[],walls=[],piers=[],plazas=[],missing=[];
 const radius=C(.52+Math.sqrt(pop)/48+(city.capital?.28:0),.56,1.8),target=C(Math.round(pop/37)+(city.capital?9:0),5,64),factor=.76;
 const footprint=(x,y,r)=>[-1,0,1].every(a=>[-1,0,1].every(b=>dry(x+a*r,y+b*r,.016)&&eligible(x+a*r,y+b*r)));
 const safe=(a,b)=>sampleLine(a,b,(x,y)=>dry(x,y,.018)&&eligible(x,y));
 const candidates=[];for(let y=-12;y<=12;y++)for(let x=-12;x<=12;x++){const p=[origin[0]+x*.12,origin[1]+y*.12];if(D(p,origin)<=radius+.3&&footprint(...p,.09))candidates.push(p);}candidates.sort((a,b)=>D(a,origin)-D(b,origin));
 const center=candidates.find(p=>footprint(...p,.17))||candidates[0];if(!center)return {city:city.id,kind,origin,center:origin,buildings,streets,walls,piers,plazas,missing:['no dry center']};
 const approaches=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=Math.floor(origin[0])+dx,y=Math.floor(origin[1])+dy;if(road(x,y))approaches.push([x+.5,y+.5]);}
 const angle=approaches.length?Math.atan2(approaches[0][1]-center[1],approaches[0][0]-center[0]):Math.floor(hash(seed,7)*4)*Math.PI/4,co=Math.cos(angle),si=Math.sin(angle),at=(u,v)=>[center[0]+u*co-v*si,center[1]+u*si+v*co];
 // A contiguous axis, then shorter parallel lanes. No arbitrary radial
 // building scatter; lots have a street frontage and shared orientation.
 const segments=()=>streets.flatMap(row=>row.slice(1).map((p,i)=>[row[i],p]));
 const addStreet=(a,b)=>{if(D(a,b)>.12&&safe(a,b)){streets.push([a,b]);return true;}return false;};
 for(const sign of [-1,1]){for(let t=radius;t>.1;t-=.10)if(addStreet(center,at(sign*t,0)))break;}
 for(const v of [-.36,.36]){for(let u=radius*.7;u>.16;u-=.12){if(safe(at(-u,v),at(u,v))&&safe(at(0,0),at(0,v))){addStreet(at(-u,v),at(u,v));addStreet(center,at(0,v));break;}}}
 for(const p of approaches)if(!addStreet(center,p)){const near=segments().flat().sort((a,b)=>D(a,p)-D(b,p));for(const a of near)if(addStreet(a,p))break;}
 if(city.capital||kind==='trade'||kind==='port'){const p=at(.05,.18);if(footprint(...p,.10))plazas.push({p,r:.12});}
 // Fortification is conditional, not inferred from the capital label.
 if(city.fort>0){for(const rad of [.55,.43,.32,.23]){const ring=Array.from({length:12},(_,i)=>at(Math.cos(i*Math.PI/6)*rad,Math.sin(i*Math.PI/6)*rad*.80));if(ring.every((p,i)=>safe(p,ring[(i+1)%ring.length]))){const seg=segments(),cross=(a,b)=>seg.some(([u,v])=>{const dx=b[0]-a[0],dy=b[1]-a[1],ex=v[0]-u[0],ey=v[1]-u[1],det=dx*ey-dy*ex;if(Math.abs(det)<1e-8)return false;const t=((u[0]-a[0])*ey-(u[1]-a[1])*ex)/det,q=((u[0]-a[0])*dy-(u[1]-a[1])*dx)/det;return t>=0&&t<=1&&q>=0&&q<=1;}),edges=ring.map((a,i)=>[a,ring[(i+1)%ring.length]]),gates=edges.map(([a,b],i)=>cross(a,b)?i:-1).filter(i=>i>=0);if(!gates.length)continue;walls.push({ring,gates,level:city.fort});break;}}if(!walls.length)missing.push('no dry enclosure');}
 const wallSegments=()=>walls.flatMap(w=>w.ring.map((a,i)=>[a,w.ring[(i+1)%w.ring.length]]));
 const place=(type,p,ang=angle)=>{const dim=assetDimensions[type],r=Math.max(dim[0],dim[1])*.72*factor;if(!footprint(...p,r)||buildings.some(b=>D(p,[b.x,b.y])<r+b.r+.016)||segments().some(([a,b])=>segmentDistance(p,a,b)<r+.038)||wallSegments().some(([a,b])=>segmentDistance(p,a,b)<r+.025)||plazas.some(q=>D(p,q.p)<q.r+r))return false;buildings.push({type,x:p[0],y:p[1],r,angle:ang,variant:Math.floor(hash(seed,buildings.length)*3),factor});return true;};
 const frontage=[];for(const [a,b] of segments()){const n=Math.max(1,Math.floor(D(a,b)/.17)),ang=Math.atan2(b[1]-a[1],b[0]-a[0]),dx=Math.cos(ang),dy=Math.sin(ang);for(let i=0;i<n;i++)for(const side of [-1,1])for(const depth of [.13,.29]){const t=(i+.5)/n,p=[a[0]+(b[0]-a[0])*t-dy*side*depth,a[1]+(b[1]-a[1])*t+dx*side*depth];if(D(p,center)<radius)frontage.push({p,ang:ang+Math.PI/2});}}
 const slots=[...frontage.sort((a,b)=>D(a.p,center)-D(b.p,center)),...candidates.filter(p=>segments().some(([a,b])=>segmentDistance(p,a,b)<.43)).map(p=>({p,ang:angle}))];
 const desired=(type,p)=>{for(const q of [...slots].sort((a,b)=>D(a.p,p)-D(b.p,p)))if(D(q.p,p)<radius&&place(type,q.p,q.ang))return true;return false;};
 if(city.fort>=2)desired('keep',at(-.24,-.2));
 // Ecclesiastical architecture is a representative civic family, not an
 // invented economic building. Avoid monumental cathedrals in small towns.
 desired(city.capital&&pop>1600?'church':'chapel',at(-.18,.22));
 if(city.capital||kind==='trade'||kind==='port')desired('market',at(.20,-.20));
 if(city.port>0){const coast=[];for(let k=0;k<24;k++){const a=k*Math.PI/12,dx=Math.cos(a),dy=Math.sin(a);for(let t=.05;t<radius+1;t+=.05){const p=[center[0]+dx*t,center[1]+dy*t];if(!water(...p))continue;const land=[p[0]-dx*.12,p[1]-dy*.12],end=[p[0]+dx*.20,p[1]+dy*.20];if(dry(...land,.025)&&water(...end)&&safe(center,land)&&sampleLine(p,end,water)){coast.push({land,shore:p,end});}break;}}
 coast.sort((a,b)=>D(a.land,center)-D(b.land,center));for(const p of coast){if(piers.some(q=>D(q.land,p.land)<.32))continue;addStreet(center,p.land);piers.push(p);if(piers.length>=Math.min(3,city.port))break;}for(const p of piers)desired('warehouse',p.land);if(!piers.length)missing.push('no connected waterfront');}
 let shops=0,industry=(city.build||[]).slice(2).reduce((a,b)=>a+b,0);
 for(const q of slots){if(buildings.length>=target)break;const i=buildings.length,type=shops<industry?'shop':kind==='farm'&&i%4===0?'barn':i%3===0?'timber':'house';if(place(type,q.p,q.ang)&&type==='shop')shops++;}
 return {city:city.id,kind,origin,center,buildings,streets,walls,piers,plazas,missing,target};
}
export function planFields(i,env,dev,resource){const {width,dry,eligible,occupied,grade}=env,x=i%width,y=Math.floor(i/width),fields=[];if(dev<=.15||resource!==0)return fields;const a=(hash(i,83)-.5)*1.1,co=Math.cos(a),si=Math.sin(a);for(let k=0;k<3;k++){const cx=x+.2+k*.29,cy=y+.49+(hash(i,k)-.5)*.23,u=.095+dev*.022,v=.19+dev*.08,at=(a,b)=>[cx+a*co-b*si,cy+a*si+b*co],poly=[at(-u,-v),at(u,-v*.85),at(u*.89,v),at(-u*.84,v*.88)],ok=(X,Y)=>Math.floor(X)===x&&Math.floor(Y)===y&&eligible(X,Y)&&dry(X,Y,.025)&&!occupied(X,Y)&&grade(X,Y)<.19;if(!poly.every((p,j)=>sampleLine(p,poly[(j+1)%4],ok))||![-.6,0,.6].every(a=>[-.6,0,.6].every(b=>ok(...at(a*u,b*v)))))continue;const rows=[];for(let a=-u*.7;a<=u*.71;a+=.035)rows.push([at(a,-v*.8),at(a+.008,v*.8)]);fields.push({poly,rows,kind:(i+k)%3,center:[cx,cy]});}return fields;}
