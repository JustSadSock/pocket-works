// Only authorized, already cultivated grain cells may receive parcels.
// World-anchored strips align across adjacent cells; physical stencils
// reject steep/wet/occupied sites. No changes to economic activity.
import {sampleLine} from './atlas-human-layout.mjs';
const C=(x,a,b)=>Math.max(a,Math.min(b,x)),D=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function noise(i,j){let n=Math.imul(i+41,374761393)^Math.imul(j+71,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
export function culturalParcels(i,env,dev,resource,{adjacent=()=>false}={}){
 if(dev<=.15||resource!==0)return [];const x=i%env.width,y=Math.floor(i/env.width),fields=[],east=adjacent(x+1,y),west=adjacent(x-1,y),north=adjacent(x,y-1),south=adjacent(x,y+1),horizontal=east||west||(!north&&!south&&noise(x>>1,y>>1)>.5);
 const ok=(X,Y)=>Math.floor(X)===x&&Math.floor(Y)===y&&env.eligible(X,Y)&&env.dry(X,Y,.025)&&!env.occupied(X,Y)&&env.grade(X,Y)<.19;
 const count=dev>.65?3:2;for(let k=0;k<count;k++){const t=(k+.5)/count,axis=(horizontal?noise(x>>1,y):noise(x,y>>1))-.5;
 const cx=x+(horizontal?.5:t),cy=y+(horizontal?t:.5),long=.44*(.72+.28*dev),short=.42/count,turn=axis*.17,co=Math.cos(turn),si=Math.sin(turn),at=(a,b)=>{const X=horizontal?a:b,Y=horizontal?b:a;return [cx+X*co-Y*si,cy+X*si+Y*co];};
 // Prefer long strips; if terrain does not permit, split lengthwise into
 // smaller strips instead of forcing a large rectangle.
 for(const [lo,hi] of [[-long,long]]){let placed=false;for(const f of [1,.78,.56]){const u=lo*f,v=hi*f,b=short*f,poly=[at(u,-b*.94),at(v,-b),at(v*.97,b*.90),at(u*.95,b)];if(!poly.every((p,j)=>sampleLine(p,poly[(j+1)%4],ok,.04))||![-.8,0,.8].every(a=>[-.7,0,.7].every(q=>ok(...at((u+v)/2+a*(v-u)/2,q*b)))))continue;const rows=[];for(let q=-b*.72;q<=b*.73;q+=.036)rows.push([at(u*.88,q),at(v*.88,q+.006)]);fields.push({poly,rows,kind:(i+k)%3,center:[cx,cy],area:(v-u)*b*2,hedge:noise(i,k)>.48,axis:horizontal?'east-west':'north-south'});placed=true;break;}if(!placed){for(const sign of [-1,1]){const center=sign*long*.52,u=center-long*.38,v=center+long*.38,b=short*.72,poly=[at(u,-b),at(v,-b*.9),at(v,b),at(u,b*.9)];if(!poly.every((p,j)=>sampleLine(p,poly[(j+1)%4],ok,.035))||!ok(...at(center,0)))continue;fields.push({poly,rows:[-b*.6,0,b*.6].map(q=>[at(u*.97+center*.03,q),at(v*.97+center*.03,q)]),kind:(i+k)%3,center:at(center,0),area:(v-u)*b*2,hedge:false,axis:horizontal?'east-west':'north-south'});}}}}
 return fields;
}
// Curve a dry run while preserving endpoints and keeping the route in the
// original corridor. Reject the entire deformation if any sample is unsafe.
export function culturalRoad(points,env,seed){if(points.length<3)return points;const a=points[0],b=points.at(-1),len=D(a,b);if(len<.15)return points;const dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,offset=(noise(seed,17)-.5)*.18,curve=points.map((p,i)=>{const t=i/(points.length-1),q=Math.sin(Math.PI*t)*offset;return [p[0]-dy*q,p[1]+dx*q];});return curve.every((p,i)=>env.permitted(...p)&&env.dry(...p,.008)&&env.grade(...p)<.26&&(i===0||sampleLine(curve[i-1],p,(x,y)=>env.permitted(x,y)&&env.dry(x,y,.008),.035)))?curve:points;}
