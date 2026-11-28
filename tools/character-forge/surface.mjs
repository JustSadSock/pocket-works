// Experimental local union of chest, neck and sleeves. Indexed marching
// tetrahedra, bounded samples, no external editor, no automatic art approval.
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),norm=a=>Math.hypot(...a),unit=a=>mul(a,1/(norm(a)||1)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function smoothMin(a,b,k){let h=clamp(.5+.5*(b-a)/k,0,1);return b*(1-h)+a*h-k*h*(1-h)}
function ellipsoid(p,c,r){let q=sub(p,c),k0=norm(q.map((x,i)=>x/r[i])),k1=norm(q.map((x,i)=>x/(r[i]*r[i])));return k1<1e-9?-Math.min(...r):k0*(k0-1)/k1}
export function unionUpperBody(builder){
 const selected=builder.parts.filter(p=>/^(torso|neck|[LR]-arm)$/.test(p.name));
 if(selected.length!==4)throw Error('Missing upper body component');
 const joints=builder.joints,by=n=>joints.find(j=>j.name===n),H=builder.spec.morphology.height,W=builder.spec.morphology.build*builder.profile.width;
 const hip=by('pelvis'),ch=by('chest'),neck=by('neck'),head=by('head'),blend=.032*H;
 let fields=[{center:add(hip.position,[0,.045*H,0]),r:[.112*H*W,.14*H,.084*H*W],j:hip.id},{center:add(ch.position,[0,.015*H,0]),r:[.158*H*W,.145*H,.096*H*W],j:ch.id}];
 function capsule(a,b,r0,r1){fields.push({a:a.position,b:b.position,r0:r0*H,r1:r1*H,j:a.id,k:b.id})}
 capsule(neck,head,.04,.038);
 for(let tag of ['L','R']){let a=by(tag+'-shoulder'),e=by(tag+'-elbow'),h=by(tag+'-hand');capsule(a,e,.051*W,.034*W);capsule(e,h,.035*W,.023)}
 function distance(p,f){if(f.r)return ellipsoid(p,f.center,f.r);let v=sub(f.b,f.a),t=clamp(dot(sub(p,f.a),v)/Math.max(1e-9,dot(v,v)),0,1);return norm(sub(p,add(f.a,mul(v,t))))-(f.r0+(f.r1-f.r0)*t)}
 function field(p){let d=Infinity;for(let f of fields){let v=distance(p,f);d=Number.isFinite(d)?smoothMin(d,v,blend):v}return d}
 let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let f of fields){let pts=f.r?[f.center]:[f.a,f.b],r=f.r??[Math.max(f.r0,f.r1),Math.max(f.r0,f.r1),Math.max(f.r0,f.r1)];for(let p of pts)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]-r[i]-2*blend);hi[i]=Math.max(hi[i],p[i]+r[i]+2*blend)}}
 const target=selected.reduce((n,p)=>n+p.indices.length/3,0);
 function tessellate(N){
  let extent=sub(hi,lo),step=Math.max(...extent)/N,dim=extent.map(x=>Math.ceil(x/step)+1),[nx,ny,nz]=dim,values=new Float32Array(nx*ny*nz),id=(x,y,z)=>(z*ny+y)*nx+x,point=i=>[lo[0]+(i%nx)*step,lo[1]+(Math.floor(i/nx)%ny)*step,lo[2]+Math.floor(i/(nx*ny))*step];
  for(let i=0;i<values.length;i++)values[i]=field(point(i));
  const pos=[],idx=[],cache=new Map(),tet=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  function edge(a,b){let key=a<b?a+':'+b:b+':'+a;if(cache.has(key))return cache.get(key);let t=values[a]/(values[a]-values[b]),p=add(point(a),mul(sub(point(b),point(a)),t)),i=pos.length;pos.push(p);cache.set(key,i);return i}
  function tri(a,b,c,inside){let n=cross(sub(pos[b],pos[a]),sub(pos[c],pos[a]));if(dot(n,sub(inside,pos[a]))>0)idx.push(a,c,b);else idx.push(a,b,c)}
  for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){let cube=[id(x,y,z),id(x+1,y,z),id(x+1,y+1,z),id(x,y+1,z),id(x,y,z+1),id(x+1,y,z+1),id(x+1,y+1,z+1),id(x,y+1,z+1)];if(cube.every(i=>values[i]>=0)||cube.every(i=>values[i]<0))continue;
   for(let t of tet){let q=t.map(i=>cube[i]),a=q.filter(i=>values[i]<0),b=q.filter(i=>values[i]>=0);if(!a.length||!b.length)continue;
    if(a.length===1)tri(...b.map(i=>edge(a[0],i)),point(a[0]));
    else if(b.length===1)tri(...a.map(i=>edge(i,b[0])),point(a[0]));
    else{let p=edge(a[0],b[0]),q=edge(a[0],b[1]),r=edge(a[1],b[0]),s=edge(a[1],b[1]);tri(p,q,r,point(a[0]));tri(q,s,r,point(a[1]))}
   }
  }
  return {pos,idx,grid:dim,resolution:N}
 }
 // Binary search for maximum tested resolution under the same triangle budget.
 let best=null,low=7,high=38,attempts=[];
 while(low<=high){let n=(low+high)>>1,r=tessellate(n),count=r.idx.length/3;attempts.push({n,count});if(count<=target&&count>0){if(!best||r.idx.length>best.idx.length)best=r;low=n+1}else high=n-1}
 if(!best)throw Error('Cannot satisfy surface triangle budget '+target);
 let p={name:'continuous upper garment',component:'clothing',color:selected[0].color,positions:[],normals:[],indices:best.idx,joints:[],weights:[],binding:hip.id};
 for(let v of best.pos){let eps=.0005*H,n=unit([0,1,2].map(i=>{let a=v.slice(),b=v.slice();a[i]+=eps;b[i]-=eps;return field(a)-field(b)})),scores=new Map();for(let f of fields){let score=Math.exp(-Math.abs(distance(v,f))/(blend*1.5));if(f.k===undefined)scores.set(f.j,(scores.get(f.j)||0)+score);else{let d=sub(f.b,f.a),t=clamp(dot(sub(v,f.a),d)/Math.max(1e-9,dot(d,d)),0,1);scores.set(f.j,(scores.get(f.j)||0)+score*(1-t));scores.set(f.k,(scores.get(f.k)||0)+score*t)}}let top=[...scores].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,v)=>s+v[1],0);p.positions.push(...v);p.normals.push(...n);p.joints.push(...top.map(v=>v[0]),...Array(4-top.length).fill(0));p.weights.push(...top.map(v=>v[1]/sum),...Array(4-top.length).fill(0))}
 builder.parts=builder.parts.filter(p=>!selected.includes(p));builder.parts.push(p);
 return {method:'smooth implicit union',targetTriangles:target,actualTriangles:best.idx.length/3,grid:best.grid,attempts,scope:'upper garment only; no whole-body topology claim'}
}
