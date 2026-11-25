// Geography v3.1: opt-in hydrology aggregation. v3.0 geometry is immutable.
// Lake classification is an explicit static depth/area proxy, not seasonal climate.
export const HYDRO_REVISION='genesis-3.1.0';
const D=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]],C=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function aggregateHydrology(m,W,H,{natural=false}={}){
 const g=m.geography,r=g.detail,w=g.width,h=g.height,n=W*H,N=w*h,oldDown=m.down.slice(),oldHeight=m.height.slice(),oldRiver=m.river.slice(),oldLand=m.land.slice(),cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r));
 const lakeWater=new Uint8Array(N),seen=new Uint8Array(N),coverage=new Uint32Array(n),lakes=[];
 // Connected depressions, not each filled pixel independently. Shallow pools
 // are diagnostic only; persistent status cannot be inferred from one static DEM.
 for(let i=0;i<N;i++){if(seen[i]||!g.land[i]||g.lake[i]<=.012)continue;const q=[i];seen[i]=1;let deep=0,maxDepth=0;const cells=new Map();
 for(let k=0;k<q.length;k++){const j=q[k],x=j%w,y=Math.floor(j/w);maxDepth=Math.max(maxDepth,g.lake[j]);if(g.lake[j]>.025){deep++;const c=cell(j);cells.set(c,(cells.get(c)||0)+1);}for(const [dx,dy] of D.slice(0,4)){const X=x+dx,Y=y+dy,t=Y*w+X;if(X<0||Y<0||X>=w||Y>=h||seen[t]||!g.land[t]||g.lake[t]<=.012)continue;seen[t]=1;q.push(t);}}
 const area=q.length/(r*r),eligible=area>=2&&deep>=r*r&&maxDepth>.045,selected=eligible?[...cells].filter(([i,a])=>oldLand[i]&&a>=r*r*.6).map(([i])=>i):[];
 if(selected.length){for(const c of selected)coverage[c]=1;for(const j of q)if(g.lake[j]>.012&&coverage[cell(j)])lakeWater[j]=1;}
 if(area>=.125)lakes.push({area,deepArea:deep/(r*r),maxDepth,classification:selected.length?'large-static-water':eligible?'unresolved-large-depression':'small-or-shallow',cells:selected.length});
 }
 for(let i=0;i<n;i++)if(coverage[i]){m.land[i]=0;m.terrain[i]=0;m.resource[i]=-1;m.fert[i]=0;m.pass[i]=0;m.river[i]=0;m.coast[i]=0;m.delta[i]=0;}
 const edges=Array.from({length:n},()=>new Map()),reverse=Array.from({length:n},()=>[]),maxFlow=new Float32Array(n),channel=new Uint8Array(n),outlet=new Uint8Array(n),edgeFlow=new Float32Array(n);
 const boundary=i=>i%W===0||i%W===W-1||i<W||i>=n-W;
 const add=(a,b,flow)=>{const prior=edges[a].get(b);if(prior===undefined||prior<flow)edges[a].set(b,flow);};
 // Coarse graph is the quotient of the fine drainage DAG. It can have
 // cycles because paths can re-enter a cell; reverse outlet search resolves
 // those cycles without inventing a second independent drainage network.
 for(let j=0;j<N;j++){if(!g.land[j]||lakeWater[j])continue;const a=cell(j);if(!m.land[a])continue;const discharge=g.flow[j]/(r*r);maxFlow[a]=Math.max(maxFlow[a],discharge);if(discharge>58)channel[a]=1;const t=g.down[j];if(t<0){if(boundary(a))outlet[a]=1;continue;}const b=cell(t);if(a!==b)add(a,b,discharge);else if(!g.land[t]&&boundary(a))outlet[a]=1;}
 // A fine shoreline can end inside a coarse land cell. Link it only to an
 // adjacent represented water cell. Record any legacy fallback separately.
 for(let a=0;a<n;a++){if(!m.land[a])continue;const x=a%W,y=Math.floor(a/W);for(const [dx,dy] of D){const X=x+dx,Y=y+dy,b=Y*W+X;if(X<0||Y<0||X>=W||Y>=H||m.land[b])continue;if(!edges[a].has(b))add(a,b,0);}if(boundary(a))outlet[a]=1;for(const [b,flow] of edges[a])reverse[b].push([a,flow]);}
 const down=new Int32Array(n).fill(-1),basin=new Int32Array(n).fill(-1),settled=new Uint8Array(n),order=[],dist=new Float64Array(n).fill(Infinity),heap=[];
 const push=(i,d)=>{let k=heap.length;heap.push([i,d]);while(k){const p=(k-1)>>1;if(heap[p][1]<=d)break;heap[k]=heap[p];k=p;}heap[k]=[i,d];};
 const pop=()=>{const a=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let j=k*2+1;if(j+1<heap.length&&heap[j+1][1]<heap[j][1])j++;if(heap[j][1]>=last[1])break;heap[k]=heap[j];k=j;}heap[k]=last;}return a;};
 for(let i=0;i<n;i++)if(!m.land[i]||outlet[i]){dist[i]=0;basin[i]=i;push(i,0);}
 while(heap.length){const [i,d]=pop();if(settled[i]||d!==dist[i])continue;settled[i]=1;order.push(i);for(const [a,f] of reverse[i]){if(settled[a])continue;const penalty=1+4/(1+Math.log1p(f))+Math.max(0,oldHeight[i]-oldHeight[a])*8+(natural&&channel[a]&&f<58?25:0),next=d+penalty;if(next<dist[a]){dist[a]=next;down[a]=i;edgeFlow[a]=f;basin[a]=basin[i];push(a,next);}}}
 // An unresolved coarse cell must not silently become an invented river.
 // The fallback uses the existing downhill route only for non-major cells.
 let fallback=0,unresolved=0;for(let pass=0;pass<W+H;pass++){let added=0;for(let i=0;i<n;i++)if(m.land[i]&&!settled[i]){const j=oldDown[i];if(j>=0&&settled[j]&&!channel[i]){settled[i]=1;down[i]=j;basin[i]=basin[j];order.push(i);fallback++;added++;}}if(!added)break;}
 for(let i=0;i<n;i++)if(m.land[i]&&!settled[i])unresolved++;
 let maxLift=0,riverCount=0,matched=0,majorExitMismatch=0,up=0,changedLand=0;
 // Use the same fine channel discharge rather than summing overlapping
 // coarse catchments. Keep strictly descending coarse heights along chosen DAG.
 for(const i of order){if(!m.land[i])continue;const j=down[i];if(j>=0)m.height[i]=Math.max(m.height[i],m.height[j]+.000002);maxLift=Math.max(maxLift,m.height[i]-oldHeight[i]);}
 m.down=down;m.basin=basin;m.flow=maxFlow;
 for(let i=0;i<n;i++){changedLand+=+(m.land[i]!==oldLand[i]);if(!m.land[i])continue;const x=i%W,y=Math.floor(i/W),j=down[i];m.river[i]=channel[i];m.coast[i]=+D.slice(0,4).some(([dx,dy])=>x+dx>=0&&x+dx<W&&y+dy>=0&&y+dy<H&&!m.land[(y+dy)*W+x+dx]);m.delta[i]=+(m.coast[i]&&maxFlow[i]>85);m.fert[i]=C(m.fert[i]+.14*(m.river[i]-oldRiver[i]),.05,1);if(channel[i]){riverCount++;matched++;if(j>=0&&m.land[j]&&edgeFlow[i]<58)majorExitMismatch++;}if(j>=0&&m.height[j]>=m.height[i])up++;}
 const landmass=new Int32Array(n),visited=new Uint8Array(n);for(let i=0;i<n;i++){if(!m.land[i]||visited[i])continue;const q=[i];visited[i]=1;for(let k=0;k<q.length;k++){const j=q[k],x=j%W,y=Math.floor(j/W);for(const [dx,dy] of D.slice(0,4)){const X=x+dx,Y=y+dy,t=Y*W+X;if(X<0||Y<0||X>=W||Y>=H||!m.land[t]||visited[t])continue;visited[t]=1;q.push(t);}}for(const j of q)landmass[j]=q.length;}m.landmass=landmass;
 if(natural){let aggregation=0,contradiction=0;const cases=[];for(let i=0;i<n;i++)if(channel[i]&&m.land[i]&&down[i]>=0&&m.land[down[i]]&&edgeFlow[i]<58){const major=[...edges[i]].filter(([j,f])=>f>=58);const type=major.length===0?'no-major-crossing':'major-route-disagrees';if(major.length===0)aggregation++;else contradiction++;cases.push({cell:i,chosen:down[i],discharge:edgeFlow[i],major,type});}g.exitAudit={aggregation,contradiction,cases};}g.lakeWater=lakeWater;g.hydrologyAudit={riverCount,matched,majorExitMismatch,fallback,unresolved,up,maxLift,changedLand,lakes};return m;
}

// Read-only diagnosis of an existing quotient graph. A different coarse
// neighbor is not excused by the existence of a river in the same cell.
export function auditMajorExits(m,W,H){
 const g=m.geography,r=g.detail,w=g.width,n=W*H,cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r)),edges=Array.from({length:n},()=>new Map());
 for(let i=0;i<g.land.length;i++){if(!g.land[i]||g.lakeWater?.[i])continue;const a=cell(i),j=g.down[i];if(!m.land[a]||j<0)continue;const b=cell(j);if(a===b)continue;const flow=g.flow[i]/(r*r),prior=edges[a].get(b);if(!prior||prior.flow<flow)edges[a].set(b,{flow,from:i,to:j});}
 const cases=[];for(let i=0;i<n;i++){const j=m.down[i];if(!m.land[i]||!m.river[i]||j<0||!m.land[j])continue;const chosen=edges[i].get(j)?.flow||0;if(chosen>=58)continue;const alternatives=[...edges[i]].filter(([b,e])=>e.flow>=58).sort((a,b)=>b[1].flow-a[1].flow);
 const coarse=new Set();let c=j;for(let k=0;k<8&&c>=0&&!coarse.has(c);k++){coarse.add(c);c=m.down[c];}
 let rejoin=false,returns=false;const fineCells=[];if(alternatives.length){let p=alternatives[0][1].to,prev=i;for(let k=0;k<r*r*32&&p>=0&&fineCells.length<8;k++){const next=cell(p);if(next!==prev){fineCells.push(next);prev=next;if(coarse.has(next))rejoin=true;if(next===i)returns=true;}p=g.down[p];}}
 cases.push({cell:i,chosen:j,chosenDischarge:chosen,alternatives:alternatives.map(([b,e])=>({cell:b,discharge:e.flow})),fineCells,classification:!alternatives.length?'no-major-crossing':returns?'cell-reentry':rejoin?'different-exit-rejoins':'different-major-route'});}
 return {total:cases.length,classes:Object.fromEntries([...new Set(cases.map(c=>c.classification))].map(k=>[k,cases.filter(c=>c.classification===k).length])),cases};
}

// Read-only attribution of physical uphill coarse edges using their fine
// crossing evidence. A filled depression alone is not a represented lake.
export function auditPhysicalEdges(m,W,H){
 const g=m.geography,r=g.detail,w=g.width,n=W*H,cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r)),evidence=new Map(),counts={},cases=[];
 const key=(a,b)=>a*n+b;
 for(let i=0;i<g.land.length;i++){if(!g.land[i])continue;const j=g.down[i];if(j<0)continue;const a=cell(i),b=cell(j);if(a===b||!m.land[a]||m.down[a]!==b||m.height[b]<m.height[a])continue;const k=key(a,b),q=g.flow[i]/(r*r),old=evidence.get(k);if(old&&old.flow>=q)continue;evidence.set(k,{from:i,to:j,flow:q,bedDelta:g.bed[j]-g.bed[i],routingDelta:g.surface[j]-g.surface[i],depthFrom:g.lake[i],depthTo:g.lake[j],representedLake:!!(g.lakeWater?.[i]||g.lakeWater?.[j])});}
 for(let a=0;a<n;a++){const b=m.down[a];if(!m.land[a]||b<0||m.height[b]<m.height[a])continue;const e=evidence.get(key(a,b)),type=!e?'no-fine-crossing':e.representedLake?'represented-lake-crossing':e.bedDelta>0?(Math.max(e.depthFrom,e.depthTo)>.012?'filled-depression-bed-rise':'bed-rise-outside-depth-threshold'):'coarse-average-rise-fine-bed-descends';counts[type]=(counts[type]||0)+1;cases.push({from:a,to:b,coarseDelta:m.height[b]-m.height[a],representedWater:!m.land[b],type,evidence:e??null});}
 return {total:cases.length,counts,cases};
}
