// Genesis 3.4 only: local shoreline evolution, physical lake classification.
export const HYDROGRAPHY_REVISION='genesis-3.4.0';
const C=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),S=t=>{t=C(t);return t*t*(3-2*t)};
const D=[[-1,0],[1,0],[0,-1],[0,1]];
// Digital simple point: both land and water must retain their local
// four-connected neighborhood. Reject ambiguous flips, preserving islands
// and narrow passages rather than forcing a smoother silhouette.
function simple(mask,w,h,x,y){
 if(x<=0||x>=w-1||y<=0||y>=h-1)return false;
 for(const type of [0,1]){let bits=0,near=0;for(let a=0;a<9;a++){if(a===4)continue;const dx=a%3-1,dy=Math.floor(a/3)-1;if(mask[(y+dy)*w+x+dx]===type){bits|=1<<a;if(Math.abs(dx)+Math.abs(dy)===1)near|=1<<a;}}
 if(!near)return false;let seen=0,groups=0;for(let a=0;a<9;a++)if((bits&(1<<a))&&!(seen&(1<<a))){let q=1<<a,component=0;while(q){const bit=q&-q;q^=bit;if(seen&bit)continue;seen|=bit;component|=bit;const k=31-Math.clz32(bit),u=k%3,v=Math.floor(k/3);for(const [dx,dy] of D){const X=u+dx,Y=v+dy;if(X>=0&&X<3&&Y>=0&&Y<3){const b=1<<(Y*3+X);if((bits&b)&&!(seen&b))q|=b;}}}if(component&near)groups++;}if(groups!==1)return false;}
 return true;
}
export function refineCoast(bed,mask,w,h,r,signed,variation){
 let changed=0,rejected=0,modified=0;const half=r/2;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,X=x/r,Y=y/r,d=signed(X,Y);if(Math.abs(d)>=1.35)continue;
 // Continuous low-frequency alongshore offsets, tapering away from coast.
 const offset=C(variation(X,Y),-.34,.34)*(1-S(Math.abs(d)/1.35)),v=d+offset,desired=+(v>0),anchor=x%r===half&&y%r===half;
 if(desired!==mask[i]){if(anchor||!simple(mask,w,h,x,y)){rejected++;continue;}mask[i]=desired;changed++;}
 const target=.12+Math.sign(v)*Math.max(.0001,Math.abs(v)*.035),blend=1-S(Math.abs(d)/1.35),z=bed[i]*(1-blend)+target*blend;
 bed[i]=mask[i]?Math.max(.120001,z):Math.min(.119999,z);modified++;
 }
 return {changed,rejected,modified,band:1.35};
}
// Filled routing surface has an artificial epsilon gradient. Identify
// hydraulic-level components independently of the coarse gameplay grid,
// then grow the actual depth contour to its spill plane.
export function classifyLakes(g,W,H){
 const r=g.detail,w=g.width,h=g.height,n=w*h,seen=new Uint8Array(n),lakeWater=new Uint8Array(n),lakeId=new Int32Array(n),coverage=new Uint8Array(W*H),wetCount=new Uint32Array(W*H),records=[],levels=[0];
 const cell=i=>Math.min(H-1,Math.floor(Math.floor(i/w)/r))*W+Math.min(W-1,Math.floor((i%w)/r)),adj=(i,fn)=>{const x=i%w,y=Math.floor(i/w);if(x)fn(i-1);if(x+1<w)fn(i+1);if(y)fn(i-w);if(y+1<h)fn(i+w);};
 const tol=.003;let rejected=0,accepted=0;
 for(let i=0;i<n;i++){if(seen[i]||!g.land[i]||g.lake[i]<=.012)continue;const q=[i],datum=g.surface[i];seen[i]=1;let deep=0,maxDepth=0,level=Infinity;
 for(let k=0;k<q.length;k++){const j=q[k];level=Math.min(level,g.surface[j]);maxDepth=Math.max(maxDepth,g.lake[j]);deep+=+(g.lake[j]>.025);adj(j,t=>{if(!seen[t]&&g.land[t]&&g.lake[t]>.012&&Math.abs(g.surface[t]-datum)<=tol){seen[t]=1;q.push(t);}});}
 if(q.length<2*r*r||deep<r*r||maxDepth<=.045){rejected++;continue;}
 const id=levels.length,wet=[];for(const j of q)if(!lakeId[j]&&g.bed[j]<level){lakeId[j]=id;wet.push(j);}
 for(let k=0;k<wet.length;k++)adj(wet[k],t=>{if(!lakeId[t]&&g.land[t]&&g.bed[t]<level&&Math.abs(g.surface[t]-level)<=tol){lakeId[t]=id;wet.push(t);}});
 if(!wet.length){rejected++;continue;}
 levels.push(level);accepted++;const counts=new Map();for(const j of wet){lakeWater[j]=1;const x=j%w,y=Math.floor(j/w);if(x>=W*r||y>=H*r)continue;const c=cell(j);wetCount[c]++;counts.set(c,(counts.get(c)||0)+1);}
 records.push({id,area:wet.length/(r*r),coreArea:q.length/(r*r),deepArea:deep/(r*r),maxDepth,level,classification:'physical-static-water',cells:counts.size});
 }
 // A gameplay cell is water when its center is physically wet. Coverage is
 // recorded separately; narrow water bodies remain real fine features.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,j=(y*r+Math.floor(r/2))*w+x*r+Math.floor(r/2);coverage[i]=lakeWater[j];}
 return {lakeWater,lakeId,lakeLevels:Float32Array.from(levels),coverage,wetCount,records,accepted,rejected};
}
// Follow the real fine drainage DAG from lake outlets to downstream lakes,
// memoizing the first wet component encountered. No distance cap.
export function lakeNetwork(g){
 const n=g.land.length,id=g.lakeId,links=new Map(),outlets=new Map(),memo=new Int32Array(n).fill(-2);
 if(!id)return {links:[],outlets:[],terminalCount:0};
 function next(start){let i=start,path=[];while(i>=0&&g.land[i]&&!id[i]&&memo[i]===-2){path.push(i);i=g.down[i];}const result=i<0||!g.land[i]?-1:id[i]?i:memo[i];for(const p of path)memo[p]=result;return result;}
 for(let i=0;i<n;i++){const a=id[i],j=g.down[i];if(!a||j<0||id[j]===a)continue;const target=next(j),b=target<0?0:id[target],key=a+':'+b,flow=g.flow[i]/(g.detail*g.detail);if(!outlets.has(a)||outlets.get(a).flow<flow)outlets.set(a,{from:a,to:b,fromNode:i,toNode:target,flow});if(b&&a!==b&&(!links.has(key)||links.get(key).flow<flow))links.set(key,{from:a,to:b,fromNode:i,toNode:target,flow});}
 return {links:[...links.values()],outlets:[...outlets.values()],terminalCount:[...outlets.values()].filter(o=>!o.to).length};
}
