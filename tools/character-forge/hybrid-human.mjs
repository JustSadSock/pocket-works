// Source-driven cloth, protected-region simplification and art direction.
// Geometry is derived from one CC0 morphed body, not independent static people.
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.hypot(...a),unit=a=>mul(a,1/(norm(a)||1));
function normals(p){let n=Array(p.positions.length).fill(0);for(let i=0;i<p.indices.length;i+=3){let ids=p.indices.slice(i,i+3),[a,b,c]=ids.map(j=>p.positions.slice(j*3,j*3+3)),v=cross(sub(b,a),sub(c,a));for(let j of ids)for(let k=0;k<3;k++)n[j*3+k]+=v[k]}p.normals=[];for(let i=0;i<n.length;i+=3)p.normals.push(...unit(n.slice(i,i+3)));return p}
function part(name,color,kind='clothing'){return {name,color,component:kind,positions:[],normals:[],indices:[],joints:[],weights:[],joints8:[],weights8:[],binding:0}}
function weights(p,i){let n=p.weights8?8:4,j=p.joints8??p.joints,w=p.weights8??p.weights;return Array.from({length:n},(_,k)=>[j[i*n+k],w[i*n+k]]).filter(v=>v[1]>0)}
function push(p,v,ws){let a=new Map();for(let [j,w] of ws)a.set(j,(a.get(j)||0)+w);let list=[...a].sort((a,b)=>b[1]-a[1]);p.positions.push(...v);for(let N of [4,8]){let s=list.slice(0,N),sum=s.reduce((n,v)=>n+v[1],0);if(!sum)throw Error('Unweighted garment');let jj=N===4?p.joints:p.joints8,ww=N===4?p.weights:p.weights8;jj.push(...s.map(v=>v[0]),...Array(N-s.length).fill(0));ww.push(...s.map(v=>v[1]/sum),...Array(N-s.length).fill(0))}return p.positions.length/3-1}
function compact(p,keep){let q=part(p.name,p.color,p.component),map=new Map();for(let i=0;i<p.indices.length;i+=3){let face=p.indices.slice(i,i+3);if(!keep(face))continue;for(let j of face){if(!map.has(j))map.set(j,push(q,p.positions.slice(j*3,j*3+3),weights(p,j)));q.indices.push(map.get(j))}}return normals(q)}
function locator(body){let bins=new Map(),cell=.035,coord=p=>p.map(v=>Math.floor(v/cell));for(let i=0;i<body.positions.length;i+=3){let p=body.positions.slice(i,i+3),k=coord(p).join(',');if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i/3)}return p=>{let c=coord(p),best=-1,dist=Infinity;for(let r=1;r<=4&&best<0;r++)for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++)for(let z=-r;z<=r;z++)for(let i of bins.get([c[0]+x,c[1]+y,c[2]+z].join(','))??[]){let d=norm(sub(p,body.positions.slice(i*3,i*3+3)));if(d<dist){best=i;dist=d}}if(best<0){for(let i=0;i<body.positions.length;i+=3){let d=norm(sub(p,body.positions.slice(i,i+3)));if(d<dist){dist=d;best=i/3}}}return {index:best,distance:dist}}}
function helper(m,body,near,name,color,change,kind='clothing'){let f=m.fitting.helpers[name];if(!f)throw Error('Missing fitting guide '+name);let p=part(name,color,kind),map=new Map(),dmax=0;for(let face of f){let ids=face.map(i=>{if(!map.has(i)){let v=m.fitting.positions[i],hit=near(v);dmax=Math.max(dmax,hit.distance);map.set(i,push(p,change(v.slice()),weights(body,hit.index)))}return map.get(i)});for(let i=1;i<ids.length-1;i++)p.indices.push(ids[0],ids[i],ids[i+1])}p.fitMaxNearestDistance=dmax;return normals(p)}
// Non-uniform spatial clustering: retain exact face and fingers, coarsen
// covered trunk/limbs, never substitute simple spheres. Report actual loss.
export function simplifyProtected(p,protectedVertex,cell){let q=part(p.name,p.color,p.component),bins=new Map(),map=[],maxError=0;for(let i=0;i<p.positions.length/3;i++){let v=p.positions.slice(i*3,i*3+3),key=protectedVertex(v)?'exact:'+i:v.map(x=>Math.floor(x/cell)).join(':');let b=bins.get(key);if(!b){b={id:bins.size,points:[],ws:[]};bins.set(key,b)}b.points.push(v);b.ws.push(...weights(p,i));map.push(b.id)}
 for(let b of bins.values()){let v=mul(b.points.reduce(add,[0,0,0]),1/b.points.length);push(q,v,b.ws);for(let t of b.points)maxError=Math.max(maxError,norm(sub(t,v)))}
 let seen=new Set();for(let i=0;i<p.indices.length;i+=3){let a=p.indices.slice(i,i+3).map(v=>map[v]);if(new Set(a).size!==3)continue;let key=a.slice().sort((a,b)=>a-b).join(',');if(seen.has(key))continue;seen.add(key);q.indices.push(...a)}q.simplification={before:p.indices.length/3,after:q.indices.length/3,maxVertexDisplacement:maxError,protectedVertices:map.filter((v,i)=>protectedVertex(p.positions.slice(i*3,i*3+3))).length};return normals(q)}
function drape(m,body,near,style,outfit){
 let H=Math.max(...body.positions.filter((_,i)=>i%3===1)),hip=m.joints.find(j=>j.name==='root').position,top=m.joints.find(j=>j.name==='spine01').position[1],neck=m.joints.find(j=>j.name==='neck01')?.position[1]??H*.81;
 let p=part(outfit==='warrior'?'quilted surcoat':'woven tunic',outfit==='warrior'?[.26,.32,.31]:[.28,.38,.27]),N=style==='low-poly'?8:style==='historical-miniature'?20:32,levels=style==='low-poly'?[.47,.56,.70,.79]:[.45,.49,.54,.60,.67,.73,.78],j=m.joints;
 // Measure the source body at each height, excluding extended arm geometry.
 let rings=levels.map((t,i)=>{let y=H*t,pts=[];for(let k=0;k<body.positions.length;k+=3){let v=body.positions.slice(k,k+3);if(Math.abs(v[1]-y)<.035&&Math.abs(v[0])<H*.18)pts.push(v)}let rx=Math.min(H*(i===levels.length-1?.13:.145),Math.max(H*.095,...pts.map(v=>Math.abs(v[0])))),zmin=Math.min(-H*.035,...pts.map(v=>v[2])),zmax=Math.max(H*.035,...pts.map(v=>v[2])),cz=(zmax+zmin)/2,rz=(zmax-zmin)/2;return {y,rx:rx+.025+(i===0?.035:0),rz:rz+.022,cz}});
 for(let i=0;i<rings.length;i++)for(let k=0;k<N;k++){let a=k*2*Math.PI/N,r=rings[i],fold=style==='low-poly'?0:(.006+.007*(1-i/(rings.length-1)))*Math.cos(a*7),v=[(r.rx+fold)*Math.cos(a),r.y+(i===0&&style!=='low-poly'?.012*Math.cos(a*5):0),r.cz+(r.rz+fold)*Math.sin(a)];push(p,v,weights(body,near(v).index))}
 for(let i=0;i<rings.length-1;i++)for(let k=0;k<N;k++){let a=i*N+k,b=i*N+(k+1)%N;p.indices.push(a,b,b+N,a,b+N,a+N)}
 // Ring order above is clockwise as seen from +Y: correct exterior winding.
 for(let i=0;i<p.indices.length;i+=3)[p.indices[i+1],p.indices[i+2]]=[p.indices[i+2],p.indices[i+1]];
 return normals(p)
}
export {part,push,weights,normals,compact,locator,helper};
export function humanCandidate(source,{style='historical-miniature',outfit='citizen',compactMesh=false}={}){
 let m=structuredClone(source),body=m.parts[0],near=locator(body),H=Math.max(...body.positions.filter((_,i)=>i%3===1)),wrist=m.joints.find(j=>j.name==='wrist.L')?.position??[.6,1.2,0],handX=Math.abs(wrist[0])*.97;
 let protectedVertex=v=>v[1]>H*.81||Math.abs(v[0])>handX;
 // Fit guide is the source tights mesh. It is a tight underlayer, not a
 // final historically accurate garment. Tunic/surcoat is independently shaped.
 let tights=helper(m,body,near,'helper-tights',outfit==='warrior'?[.20,.22,.22]:[.22,.16,.095],v=>v);
 // The source hair helper is a long fitting envelope, not a hairstyle.
 // Derive a short scalp cap from the actual head surface, leaving the
 // eyes, nose, mouth and ears clear. A metal cap is the warrior headwear.
 let crown=m.joints.find(j=>j.name==='head').position,eye=m.joints.find(j=>j.name==='eye.L').position,headJoint=m.joints.find(j=>j.name==='head').id;
 let hair=compact(body,face=>face.every(i=>{let v=body.positions.slice(i*3,i*3+3);return v[1]>H-.062||(v[1]>eye[1]-.035&&v[2]<crown[2]-.012)}));
 hair.name=outfit==='warrior'?'fitted iron skullcap':'short scalp hair';hair.component='equipment';hair.color=outfit==='warrior'?[.38,.43,.43]:[.095,.055,.027];hair.binding=headJoint;
 for(let i=0;i<hair.positions.length;i++)hair.positions[i]+=hair.normals[i]*(outfit==='warrior'?.008:.0035);
 normals(hair);
 let eyes=['helper-l-eye','helper-r-eye'].map(n=>helper(m,body,near,n,[.62,.58,.50],v=>v,'body'));
 let pupils=eyes.map((p,i)=>{let zmax=Math.max(...p.positions.filter((_,k)=>k%3===2)),q=compact(p,f=>f.every(j=>p.positions[j*3+2]>zmax-.005));q.name='iris '+i;q.color=[.055,.037,.022];for(let k=2;k<q.positions.length;k+=3)q.positions[k]+=.0009;return q}).filter(p=>p.indices.length);
 let tunic=drape(m,body,near,style,outfit);
 let clipped=compact(body,face=>face.some(i=>{let v=body.positions.slice(i*3,i*3+3);return protectedVertex(v)||v[1]<H*.085}));
 let skin=compactMesh?simplifyProtected(clipped,protectedVertex,.018):clipped;
 if(compactMesh){tights=simplifyProtected(tights,()=>false,.026);hair=simplifyProtected(hair,()=>false,.012)}
 // Intentional different silhouette: low poly tabard with faceted hem;
 // historical draped garment and shoulder mantle; realism narrow woven tunic.
 let parts=[skin,tights,tunic,hair,...eyes,...pupils];
 if(style==='historical-miniature'||outfit==='warrior'){
   let c=part('shoulder mantle',[.28,.09,.055]),n=16,ys=[H*.77,H*.73,H*.68],rx=[H*.115,H*.16,H*.17],rz=[H*.062,H*.09,H*.095];
   for(let i=0;i<3;i++)for(let k=0;k<n;k++){let a=k*Math.PI*2/n,v=[Math.cos(a)*rx[i],ys[i]+.018*Math.cos(a*4),Math.sin(a)*rz[i]];push(c,v,weights(body,near(v).index))}
   for(let i=0;i<2;i++)for(let k=0;k<n;k++){let a=i*n+k,b=i*n+(k+1)%n;c.indices.push(a,b,a+n,b,b+n,a+n)}parts.push(normals(c))
 }
 // Independent belt following the actual tunic cross section, with a visible
 // metal clasp. For a warrior it reads as padded cloth and iron, not a
 // claimed finished armor kit or validated weapon grip.
 let belt=part('leather waist belt',[.105,.059,.033],'equipment'),y=H*.56,waist=[];
 for(let k=0;k<tunic.positions.length;k+=3)if(Math.abs(tunic.positions[k+1]-y)<H*.055)waist.push(tunic.positions.slice(k,k+3));
 let rx=Math.max(H*.095,...waist.map(v=>Math.abs(v[0])))+.009,z0=Math.min(0,...waist.map(v=>v[2]))-.007,z1=Math.max(.07,...waist.map(v=>v[2]))+.007,N=20;
 for(let l=0;l<2;l++)for(let k=0;k<N;k++){let a=k*Math.PI*2/N,v=[rx*Math.cos(a),y+(l-.5)*.033,(z0+z1)/2+(z1-z0)/2*Math.sin(a)];push(belt,v,weights(body,near(v).index))}
 for(let k=0;k<N;k++){let a=k,b=(k+1)%N;belt.indices.push(a,b+N,b,a,a+N,b+N)}parts.push(normals(belt));
 let clasp=part('metal belt clasp',[.55,.34,.13],'equipment');for(let v of [[-.022,y-.021,z1+.003],[.022,y-.021,z1+.003],[.022,y+.021,z1+.003],[-.022,y+.021,z1+.003]])push(clasp,v,weights(body,near(v).index));clasp.indices.push(0,1,2,0,2,3);parts.push(normals(clasp));
 m.parts=parts;m.spec={...m.spec,style,recipe:outfit==='warrior'?'source-warrior':'source-citizen',lod:compactMesh?'compact':'source',actions:['idle','walk'],artSource:'MakeHuman CC0 anatomy, original procedural fitted garment study'};m.statistics={triangleCount:parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:parts.reduce((n,p)=>n+p.positions.length/3,0),joints:m.joints.length};m.approval='unreviewed';delete m.fitting;return m
}
