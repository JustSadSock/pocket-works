// Stable triangle bindings for authored trim, independent of recipe and skeleton.
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,t)=>a.map(x=>x*t),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),clamp=t=>Math.max(0,Math.min(1,t));
const point=(p,i)=>p.positions.slice(3*i,3*i+3);
const blend=(v,w)=>v.reduce((s,p,i)=>add(s,mul(p,w[i])),[0,0,0]);
function closest(q,v){
 const [a,b,c]=v,u=sub(b,a),w=sub(c,a),d=sub(q,a),uu=dot(u,u),uw=dot(u,w),ww=dot(w,w),den=uu*ww-uw*uw;
 let best=null;const test=bary=>{const p=blend(v,bary),delta=sub(p,q),distance2=dot(delta,delta);if(!best||distance2<best.distance2)best={bary,point:p,distance2};};
 if(den>1e-20){const x=(dot(d,u)*ww-dot(d,w)*uw)/den,y=(dot(d,w)*uu-dot(d,u)*uw)/den;if(x>=0&&y>=0&&x+y<=1)test([1-x-y,x,y]);}
 for(const [i,j] of [[0,1],[1,2],[2,0]]){const e=sub(v[j],v[i]),l=dot(e,e),t=l>1e-20?clamp(dot(sub(q,v[i]),e)/l):0,bary=[0,0,0];bary[i]=1-t;bary[j]=t;test(bary);}
 return best;
}
export function surfaceBinder(host){
 const n=host.outerVertexCount??host.positions.length/3,faces=[];
 for(let i=0;i<host.indices.length;i+=3){const ids=host.indices.slice(i,i+3);if(ids.every(j=>j<n))faces.push({face:i/3,ids,v:ids.map(j=>point(host,j))});}
 if(!faces.length)throw Error('No outer host faces '+host.name);
 return q=>{if(q.length!==3||!q.every(Number.isFinite))throw Error('Invalid binding point');let best=null;for(const f of faces){const h=closest(q,f.v);if(!best||h.distance2<best.distance2)best={...h,face:f.face,ids:f.ids};}return {face:best.face,vertices:best.ids,bary:best.bary,restDistance:Math.sqrt(best.distance2)};};
}
export function bindingWeights(host,binding){
 const n=host.weights8?8:4,js=host.joints8??host.joints,ws=host.weights8??host.weights,acc=new Map();
 for(let i=0;i<3;i++)for(let k=0;k<n;k++){const j=js[binding.vertices[i]*n+k],w=ws[binding.vertices[i]*n+k]*binding.bary[i];if(w>0)acc.set(j,(acc.get(j)??0)+w);}
 const rows=[...acc].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,8),sum=rows.reduce((s,x)=>s+x[1],0);if(!Number.isFinite(sum)||sum<=0)throw Error('Invalid binding weights');return rows.map(([j,w])=>[j,w/sum]);
}
export function bindTrim(part,host){
 const n=part.outerVertexCount;if(!Number.isInteger(n)||n<=0||part.positions.length!==6*n)throw Error('Expected lined trim '+part.name);
 const bind=surfaceBinder(host),outer=Array.from({length:n},(_,i)=>bind(point(part,i))),rows=outer.map(b=>bindingWeights(host,b));
 for(const N of [4,8]){const joints=[],weights=[];for(let i=0;i<2*n;i++){const r=rows[i%n].slice(0,N),s=r.reduce((a,x)=>a+x[1],0);for(let k=0;k<N;k++){joints.push(r[k]?.[0]??0);weights.push((r[k]?.[1]??0)/s);}}part[N===4?'joints':'joints8']=joints;part[N===4?'weights':'weights8']=weights;}
 // Both shells share one triangle correspondence but have independently measured rest offsets.
 part.attachmentBindings=Array.from({length:2*n},(_,i)=>{const b=outer[i%n],a=blend(b.vertices.map(j=>point(host,j)),b.bary);return {...b,vertex:i,restDistance:Math.hypot(...sub(point(part,i),a))};});
 part.attachmentSpec={type:'skinned-trim',host:host.name};return part;
}
