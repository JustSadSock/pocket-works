import {xx,yy,neighbors,hash} from './world.mjs';
import {assetDimensions as dimensions} from './landscape-assets.mjs';
const mix=(a,b,t)=>a+(b-a)*t,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const segment=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
const samples=(a,b,step=.045)=>{const n=Math.max(1,Math.ceil(dist(a,b)/step));return Array.from({length:n+1},(_,k)=>[mix(a[0],b[0],k/n),mix(a[1],b[1],k/n)]);};
const segments=row=>row.slice(1).map((b,k)=>[row[k],b]);
export async function planLivingTown(m,city,network,{fabric=false,unified=false}={}){
 const begin=performance.now();let slice=begin,maxSlice=0;const yieldIf=async()=>{const now=performance.now();if(now-slice>7){maxSlice=Math.max(maxSlice,now-slice);await new Promise(r=>setTimeout(r,0));slice=performance.now();}};const X=i=>i%m.width,Y=i=>Math.floor(i/m.width),adj=i=>[[X(i)-1,Y(i)],[X(i)+1,Y(i)],[X(i),Y(i)-1],[X(i),Y(i)+1]].map(p=>m.at(...p)).filter(i=>i>=0);
 const x=X(city.i)+.5,y=Y(city.i)+.5,origin=[x,y],pop=city.pop||0,port=city.port||0,fort=city.fort||0,level=pop>4200?4:pop>1600?3:pop>900?2:1,industry=(city.build||[]).slice(2).reduce((a,b)=>a+b,0),radius=[0,.82,1.2,1.65,2.25][level],seed=hash(city.name),buildings=[],roads=[],walls=[],piers=[],fields=[],missing=[];
 const nearby=network.filter(l=>l.points.some(p=>dist(p,origin)<radius+2.5)).flatMap(l=>segments(l.points).map(([a,b])=>({a,b,w:l.width})));const buckets=new Map();for(const e of nearby){for(let yy=Math.floor(Math.min(e.a[1],e.b[1])-.5);yy<=Math.floor(Math.max(e.a[1],e.b[1])+.5);yy++)for(let xx=Math.floor(Math.min(e.a[0],e.b[0])-.5);xx<=Math.floor(Math.max(e.a[0],e.b[0])+.5);xx++){const k=xx+','+yy;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(e);}}
 const rawDry=(a,b,r=0)=>{const i=m.at(Math.floor(a),Math.floor(b));if(i<0||!m.known[i]||!m.m.land[i]||(m.land(a,b)??0)<.60)return false;return !(unified?(buckets.get(Math.floor(a)+','+Math.floor(b))||[]):nearby).some(l=>segment(a,b,l.a,l.b)<l.w/2+r+.017);};
 const dryCache=new Map(),dry=(a,b,r=0)=>{const key=[Math.round(a*512),Math.round(b*512),Math.round(r*1000)].join(',');if(!dryCache.has(key))dryCache.set(key,rawDry(a,b,r));return dryCache.get(key);};
 const footprint=(a,b,r)=>[[-1,-1],[-1,0],[-1,1],[0,-1],[0,0],[0,1],[1,-1],[1,0],[1,1]].every(([u,v])=>dry(a+u*r,b+v*r,.012));
 const safeLine=(a,b,r=.018)=>samples(a,b).every(p=>dry(...p,r));
 const candidates=[];for(let j=-18;j<=18;j++){for(let i=-18;i<=18;i++){const p=[x+i*.13,y+j*.13];if(dist(p,origin)<=radius+1.15&&dry(...p,.02))candidates.push(p);}await yieldIf();}candidates.sort((a,b)=>dist(a,origin)-dist(b,origin));
 let center=candidates.find(p=>footprint(...p,.24))||candidates[0]||origin;
 // Search a dry enclosure first. On narrow river peninsulas, a citadel is
 // smaller than the entire urban area, leaving historically plausible suburbs.
 let gate=null;
 if(fort>=2){outer:for(const r of [1.18,.96,.76,.58,.43,.30])for(const p of candidates){await yieldIf();if(dist(p,origin)>1.4||!footprint(...p,Math.min(.20,r*.4)))continue;
 let ring=Array.from({length:36},(_,k)=>{const a=k*Math.PI*2/36;return [p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r*.82];});
 if(fabric){const radial=[];for(let k=0;k<12;k++){const a=k*Math.PI*2/12;let d=r*(unified?1/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)))*.94:(.92+.11*Math.sin(a*3+seed%7)));for(let f=1.28;f>=.72;f-=.08){const R=d*f,q=[p[0]+Math.cos(a)*R,p[1]+Math.sin(a)*R*.86];if(safeLine(p,q,.055)){d=R;break;}}radial.push(d);}const proposed=Array.from({length:36},(_,k)=>{const a=k*Math.PI*2/36,i=Math.floor(k/3),d=mix(radial[i],radial[(i+1)%12],(k%3)/3);return [p[0]+Math.cos(a)*d,p[1]+Math.sin(a)*d*.86];});if(proposed.every((a,k)=>safeLine(a,proposed[(k+1)%36],.055)))ring=proposed;}
 if(!ring.every((a,k)=>safeLine(a,ring[(k+1)%ring.length],.043)))continue;
 center=p;let gi=0;for(let k=1;k<ring.length;k++)if(dist(ring[k],origin)<dist(ring[gi],origin))gi=k;gate=ring[gi];ring.gate=gi;walls.push(ring);break outer;}
 if(!walls.length)missing.push('fortification: no dry enclosure within settlement region');}
 // Routing is a constrained BFS over a local grid, with endpoints on exact
 // shore/road coordinates. All segments are checked, not merely the nodes.
 const wallSegments=walls.flatMap(row=>row.map((a,k)=>[a,row[(k+1)%row.length]]));
 const streetSafe=(a,b)=>safeLine(a,b)&&samples(a,b).every(p=>!wallSegments.some(([u,v])=>segment(...p,u,v)<.036&&(!gate||dist(p,gate)>.17)));
 const route=async(start,end)=>{if(streetSafe(start,end))return [start,end];const span=radius+1.9,step=.12,n=Math.ceil(span*2/step),coord=(u,v)=>[x-span+u*step,y-span+v*step],node=p=>[Math.round((p[0]-x+span)/step),Math.round((p[1]-y+span)/step)],key=(u,v)=>v*(n+1)+u,A=node(start),B=node(end);
 if([...A,...B].some(v=>v<0||v>n)||!streetSafe(start,coord(...A))||!streetSafe(end,coord(...B)))return null;const first=key(...A),last=key(...B),queue=[first],prev=new Map([[first,-1]]);
 for(let k=0;k<queue.length;k++){if(k%24===0)await yieldIf();const cur=queue[k];if(cur===last)break;const u=cur%(n+1),v=Math.floor(cur/(n+1));for(const [du,dv] of [[1,0],[-1,0],[0,1],[0,-1]]){const U=u+du,V=v+dv,next=key(U,V);if(U<0||V<0||U>n||V>n||prev.has(next)||!streetSafe(coord(u,v),coord(U,V)))continue;prev.set(next,cur);queue.push(next);}}
 if(!prev.has(last))return null;const p=[end];for(let k=last;k!==-1;k=prev.get(k))p.push(coord(k%(n+1),Math.floor(k/(n+1))));p.push(start);p.reverse();const result=[p[0]];for(let k=1;k<p.length-1;k++)if(!streetSafe(result.at(-1),p[k+1]))result.push(p[k]);result.push(end);return result;};
 const append=p=>{if(p&&p.length>1){roads.push(p);return true;}return false;};
 if(gate)append(await route(center,gate));
 const connected=async(target,prefer=gate||center)=>{const starts=[prefer,center,...roads.flatMap(row=>segments(row).flatMap(([a,b])=>samples(a,b,.20)))];starts.sort((a,b)=>dist(a,target)-dist(b,target));for(const start of starts.slice(0,7)){if(dist(start,target)<.035)return [start,target];const path=await route(start,target);if(path)return path;}return null;};
 // Waterfront before plots. Scan real shoreline cells near the city,
 // including alternate banks, and require a reachable dry landing.
 if(port){const shore=[];for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){await yieldIf();const id=m.at(Math.floor(x)+i,Math.floor(y)+j);if(id<0||!m.known[id]||!m.m.land[id])continue;for(const q of adj(id)){if(!m.known[q]||m.m.land[q])continue;const a=[X(id)+.5,Y(id)+.5],dx=X(q)-X(id),dy=Y(q)-Y(id);for(const side of [0,-.23,.23]){const start=[a[0]-dy*side,a[1]+dx*side];let cross=null;for(let t=0;t<=1;t+=.025){const p=[start[0]+dx*t,start[1]+dy*t],l=m.land(...p);if(l!==null&&l<.51){cross=p;break;}}if(!cross)continue;const end=[cross[0]+dx*.28,cross[1]+dy*.28];if((m.land(...end)??1)>.43)continue;for(let back=.12;back<=.52;back+=.04){const land=[cross[0]-dx*back,cross[1]-dy*back];if(dry(...land,.026)){shore.push({land,shore:cross,end});break;}}}}}
 shore.sort((a,b)=>dist(a.land,origin)-dist(b.land,origin));for(const p of shore.slice(0,45)){if(piers.some(q=>dist(q.shore,p.shore)<.27))continue;const path=await connected(p.land);if(!path)continue;append(path);piers.push(p);if(piers.length>=port)break;}if(piers.length<port)missing.push('port: '+piers.length+'/'+port+' reachable waterfront sites');}
 const strategic=adj(city.i).filter(i=>m.known[i]&&m.fresh[i]&&m.m.land[i]&&m.s.road[i]);for(const i of strategic){const p=[X(i)+.5,Y(i)+.5];append(await connected(p));}
 // Market street and secondary lanes first; buildings occupy blocks between them.
 const angle=strategic.length?Math.atan2(Y(strategic[0])+.5-y,X(strategic[0])+.5-x):seed%8*Math.PI/4,co=Math.cos(angle),si=Math.sin(angle),world=(u,v)=>[center[0]+co*u-si*v,center[1]+si*u+co*v];
 for(const [u,v] of [[radius*.68,0],[-radius*.68,0],[0,radius*.68],[0,-radius*.68]]){let target=world(u,v);if(!dry(...target,.02))target=candidates.find(p=>dist(p,target)<.35);if(target)append(await connected(target));}
 if(level>=3)for(const v of [-.55,.55]){const a=world(-radius*.38,v),b=world(radius*.38,v);if(dry(...a,.02))append(await connected(a));if(dry(...b,.02))append(await connected(b));}
 const streetSeg=roads.flatMap(segments),wallSeg=walls.flatMap(r=>r.map((a,k)=>[a,r[(k+1)%r.length]]));
 const plazaRadius=fabric&&level>=2?(unified?.10+level*.016:.16+level*.025):0;
 const allowed=(p,r)=>footprint(...p,r)&&(!plazaRadius||dist(p,center)>=plazaRadius+r)&&!buildings.some(b=>dist(p,[b.x,b.y])<b.r+r+.012)&&!streetSeg.some(([a,b])=>segment(...p,a,b)<r+.025)&&!wallSeg.some(([a,b])=>segment(...p,a,b)<r+.055);
 const add=(type,p,variant=0)=>{const d=dimensions[type],r=Math.hypot(d[0],d[1])*(fabric&&type==='cathedral'?.61:.51);if(!allowed(p,r))return false;let localAngle=angle,best=Infinity;for(const [a,b] of streetSeg){const d=segment(...p,a,b);if(d<best){best=d;localAngle=Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI/2;}}buildings.push({type,x:p[0],y:p[1],r,angle:localAngle,variant});return true;};
 const inside=p=>{const ring=walls[0];if(!ring)return false;let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};const place=(type,desired)=>{const civic=['keep','cathedral','market'].includes(type),score=p=>dist(p,desired)+(unified&&civic&&walls.length&&!inside(p)?1.1:0);for(const p of [...candidates].sort((a,b)=>score(a)-score(b)))if(dist(p,desired)<1.4&&add(type,p,(seed+buildings.length)%3))return true;return false;};
 if(city.capital||fort>=3){if(!place('keep',world(-.38,-.30)))missing.push('keep: no dry footprint');if(!place('cathedral',world(.45,-.3)))missing.push('cathedral: no dry footprint');}
 else if(level>=3)place('church',world(-.35,-.25));else if(level===1)place('chapel',world(-.35,-.25));
 if(level>=2&&!place('market',world(.35,.35)))missing.push('market: no dry footprint');
 for(const p of piers)place('warehouse',p.land);
 let shops=0;const target=[0,6,18,34,65][level];
 // Burgage frontages: reserve a line of buildable plots along existing streets,
 // with a second (courtyard) rank where the actual dry terrain permits it.
 const frontage=[];if(fabric){for(const [a,b] of streetSeg){const len=dist(a,b);if(len<.08)continue;const dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len,n=Math.max(1,Math.floor(len/.24));for(let k=0;k<n;k++){const u=(k+.5)/n,x=mix(a[0],b[0],u),y=mix(a[1],b[1],u);for(const sign of [-1,1])for(const depth of [.17,.39]){if(depth>.2&&level<3)continue;const p=[x-dy*depth*sign,y+dx*depth*sign];if(dist(p,center)<radius&&dry(...p,.02))frontage.push(p);}}await yieldIf();}}
 const plotScore=p=>dist(p,center)+(unified&&walls.length&&!inside(p)?.55:0);const slots=[...frontage.sort((a,b)=>plotScore(a)-plotScore(b)),...candidates.filter(p=>dist(p,center)<radius).sort((a,b)=>plotScore(a)-plotScore(b))];
 for(const p of slots){await yieldIf();if(buildings.length>=target)break;const i=buildings.length,type=industry>shops&&dist(p,center)>.45?'shop':level>=3&&i%9===0?'warehouse':level===1&&i%3===0?'barn':i%3===0?'timber':'house';if(add(type,p,(seed+i)%3)&&type==='shop')shops++;}
 if(!fabric&&level<=2)for(const p of candidates.filter(p=>dist(p,center)>.6)){if(fields.length>=5)break;if(allowed(p,.18)&&fields.every(f=>dist(p,[f.x,f.y])>.44))fields.push({x:p[0],y:p[1],angle});}
 const valid=buildings.every(b=>footprint(b.x,b.y,b.r)&&!streetSeg.some(([a,c])=>segment(b.x,b.y,a,c)<b.r+.024)&&!wallSeg.some(([a,c])=>segment(b.x,b.y,a,c)<b.r+.054))&&buildings.every((a,i)=>buildings.slice(i+1).every(b=>Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r))&&roads.every(r=>segments(r).every(([a,b])=>streetSafe(a,b)))&&wallSeg.every(([a,b])=>safeLine(a,b,.043))&&piers.every(p=>(m.land(...p.end)??1)<.43&&roads.some(r=>dist(r.at(-1),p.land)<.001));
 return {x,y,radius,city,center,buildings,roads,walls,piers,fields,plazaRadius,valid,complete:valid&&!missing.length,missing,layoutMs:performance.now()-begin,maxSlice:Math.max(maxSlice,performance.now()-slice)};
}
