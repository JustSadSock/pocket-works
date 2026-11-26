// Character Core garment research; native, no editor required.
// A: drafted panels. B: one reusable template bound to a fixed topology.
// C: fitted drafted panels + explicit fold profile. All lengths in metres.
import {part,push,weights,normals,compact,locator,helper} from './hybrid-human.mjs';
import {deform,pose} from './core.mjs';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1)),lerp=(a,b,t)=>add(a,mul(sub(b,a),t)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const materials={linen:[.63,.51,.34],wool:[.23,.34,.27],indigo:[.12,.24,.36],madder:[.40,.13,.075],ochre:[.55,.32,.095],charcoal:[.13,.15,.15],leather:[.14,.085,.045],iron:[.37,.42,.43],brass:[.57,.36,.12],cream:[.76,.66,.48]};
export const kits={
 shirt:['shirt','trousers','boots','belt'],
 tunic:['tunic','trousers','boots','belt','bag'],
 traveler:['shirt','trousers','boots','belt','bag','cloak'],
 warrior:['shirt','trousers','boots','quilted','belt','helmet']
};
export const garmentRules={shirt:{layer:1,clearance:.018,thickness:.002,region:'torso/arms'},tunic:{layer:1,clearance:.026,thickness:.003,region:'torso/arms/thigh'},trousers:{layer:1,clearance:.016,thickness:.003,region:'legs'},boots:{layer:2,clearance:.026,thickness:.008,region:'feet/shin'},quilted:{layer:2,clearance:.047,thickness:.008,region:'torso/arms/thigh'},cloak:{layer:3,clearance:.065,thickness:.004,region:'back/shoulder'},belt:{layer:4,clearance:.007,thickness:.006,region:'waist'},bag:{layer:4,clearance:.03,thickness:.008,region:'hip'},helmet:{layer:4,clearance:.016,thickness:.005,region:'head'}};
function bounds(vs){return [0,1,2].map(k=>[Math.min(...vs.map(v=>v[k])),Math.max(...vs.map(v=>v[k]))])}
function context(source){const body=source.parts[0],near=locator(body),vs=Array.from({length:body.positions.length/3},(_,i)=>body.positions.slice(i*3,i*3+3)),H=Math.max(...vs.map(v=>v[1])),J=n=>{let j=source.joints.find(j=>j.name===n);if(!j)throw Error('Missing garment landmark '+n);return j};return {source,body,near,vs,H,J,skin:v=>weights(body,near(v).index)}}
function ringSurface(ctx,name,color,rings,N,{thickness=.003,layer=1,region='',open=false,rigid=null}={}){
 let p=part(name,color);p.layer=layer;p.region=region;p.thickness=thickness;
 // Each ring has its own axis frame; inner and outer material surfaces share
 // semantic binding. Sew both boundary loops, not a zero-thickness color shell.
 const L=rings.length;
 for(let side=0;side<2;side++)for(let r of rings)for(let k=0;k<N;k++){let a=k*2*Math.PI/N,rad=r.rad(a),v=add(r.c,add(mul(r.u,Math.max(.001,rad[0]-side*thickness)*Math.cos(a)),mul(r.v,Math.max(.001,rad[1]-side*thickness)*Math.sin(a))));if(r.shift)v=add(v,r.shift(a));push(p,v,rigid===null?(r.weights??ctx.skin(v)):[[rigid,1]])}
 const S=L*N,tri=(a,b,c,rev=false)=>p.indices.push(a,rev?c:b,rev?b:c);
 for(let side=0;side<2;side++)for(let i=0;i<L-1;i++)for(let k=0;k<N;k++){let a=side*S+i*N+k,b=side*S+i*N+(k+1)%N;tri(a,b,b+N,!!side);tri(a,b+N,a+N,!!side)}
 for(let i of [0,L-1])for(let k=0;k<N;k++){let a=i*N+k,b=i*N+(k+1)%N;tri(a,a+S,b,i===0);tri(b,a+S,b+S,i===0)}
 return normals(p)
}
// Outward normal orientation for ring surfaces verified against center. 
// The source is a bent-arm rest pose; all sleeves use actual limb axes.
function station(c,u,v,rx,rz,fold=0,frequency=6,ws=null,shift=null){return {c,u,v,weights:ws,shift,rad:a=>{let f=fold*Math.cos(frequency*a);return [rx+f,rz+f]}}}
// Fit limb cross sections from the actual morph, not height alone. Skin
// ownership excludes unrelated torso/opposite-limb vertices. A robust radial
// envelope avoids a single outlier inflating a whole sleeve or trouser leg.
export function measuredLimbRadii(ctx,c,axis,u,v,nominal,joints,clearance,fold=0){
 const band=.040*ctx.H/1.75,owned=new Set(joints),samples=[];
 for(let i=0;i<ctx.vs.length;i++){
   const d=sub(ctx.vs[i],c);if(Math.abs(dot(d,axis))>band)continue;
   if(weights(ctx.body,i).reduce((n,[j,w])=>n+(owned.has(j)?w:0),0)<.55)continue;
   const x=dot(d,u),y=dot(d,v);
   if(Math.hypot(x,y)>.24*ctx.H/1.75)continue;
   const gap=clearance+Math.abs(fold);
   samples.push(Math.hypot((Math.abs(x)+gap)/nominal[0],(Math.abs(y)+gap)/nominal[1]));
 }
 if(samples.length<5)return nominal.slice();
 samples.sort((a,b)=>a-b);
 const scale=Math.max(1,samples[Math.floor((samples.length-1)*.98)]);
 return nominal.map(r=>r*scale)
}
function tube(ctx,name,color,points,radii,N,opt){
 let previous=null;
 let rings=points.map((c,i)=>{
   let axis=unit(sub(points[Math.min(points.length-1,i+1)],points[Math.max(0,i-1)])),
       u=previous?sub(previous,mul(axis,dot(previous,axis))):[0,0,0];
   if(Math.hypot(...u)<1e-6)u=cross(Math.abs(axis[1])>.92?[0,0,1]:[0,1,0],axis);
   u=unit(u);previous=u;let v=cross(axis,u);
   const rr=opt.fitJoints?measuredLimbRadii(ctx,c,axis,u,v,radii[i],opt.fitJoints,opt.fitClearance,opt.fold??0):radii[i];
   return station(c,u,v,rr[0],rr[1],opt.fold??0,5,opt.weights?.[i])
 });
 return ringSurface(ctx,name,color,rings,N,opt)
}
function torso(ctx,id,style,method,color){let {H,vs,J}=ctx,r=garmentRules[id],low=style==='low-poly',long=id==='tunic'||id==='quilted',N=low?10:24,neck=J('neck01').position[1],waist=J('spine03').position[1]-.04,hip=J('root').position[1],top=J('upperarm01.L').position[1]+.025,hem=long?hip-.24*H:hip-.085*H;
 let levels=[hem,hip-.04,waist,waist+.065,top,neck-.015].sort((a,b)=>a-b),rings=[];
 for(let i=0;i<levels.length;i++){let y=levels[i],pts=vs.filter(p=>Math.abs(p[1]-y)<.055&&Math.abs(p[0])<H*.125),bb=pts.length?bounds(pts):[[ -.12,.12],[0,0],[-.08,.08]],rx=Math.max(.10,(bb[0][1]-bb[0][0])/2)+r.clearance,rz=Math.max(.065,(bb[2][1]-bb[2][0])/2)+r.clearance,cz=(bb[2][0]+bb[2][1])/2;
 if(i===levels.length-1){rx=.082*H;rz=.048*H;cz=J('neck01').position[2]}else if(i===0){rx=Math.max(rx,.13*H)+(long?.045:0);rz=Math.max(rz,.085*H)}else if(i===1){rx=Math.max(rx,.112*H)}
 if(low){rx*=i===levels.length-2?1.13:1;rz*=1.03}
 let fold=method==='hybrid'&&!low?(id==='quilted'?.004:.008)*(i===2?.35:1):0,frequency=id==='quilted'?12:7;
 rings.push(station([0,y,cz],[1,0,0],[0,0,-1],rx,rz,fold,frequency,[[J(i<2?'root':i<4?'spine03':'spine01').id,1]]))}
 let main=ringSurface(ctx,id,color,rings,N,{...r});main.pattern={panels:['front','back','side gores','neck opening'],levels,ringCount:N,method};
 let parts=[main];
 // Hem and neckline bands follow the same measured panel edge, with
 // independent thickness and explicit semantic layer.
 for(let [label,ring,offset] of [['hem',rings[0],.010],['neck binding',rings.at(-1),-.014]]){let a={...ring,rad:t=>ring.rad(t).map(x=>x+.004)},z={...a,c:add(a.c,[0,offset,0])};parts.push(ringSurface(ctx,id+' '+label, id==='quilted'?materials.leather:materials.cream,[a,z].sort((a,b)=>a.c[1]-b.c[1]),N,{...r,thickness:.003}))}
 for(let s of ['L','R']){let sh=J('upperarm01.'+s),el=J('lowerarm01.'+s),wr=J('wrist.'+s),pts=[lerp(sh.position,el.position,-.12),lerp(sh.position,el.position,.18),el.position,lerp(el.position,wr.position,.62),lerp(el.position,wr.position,.97)],rr=[.068,.063,.048,.041,.035].map(x=>[x*H/1.75+r.clearance*.65,x*H/1.75+r.clearance*.65]);parts.push(tube(ctx,id+' sleeve '+s,color,pts,rr,N,{...r,fold:method==='hybrid'&&!low?.003:0,fitJoints:[sh.id,el.id],fitClearance:r.clearance,weights:[[[sh.id,.8],[J('spine01').id,.2]],[[sh.id,1]],[[sh.id,.45],[el.id,.55]],[[el.id,1]],[[el.id,.85],[wr.id,.15]]]}));
 // Cuff binding is separate, shaped seam edging.
 parts.push(tube(ctx,id+' cuff '+s,materials.cream,[lerp(el.position,wr.position,.91),lerp(el.position,wr.position,.98)],rr.slice(-2).map(v=>v.map(x=>x+.004)),N,{...r,thickness:.003,fitJoints:[sh.id,el.id],fitClearance:r.clearance+.004,weights:[[[el.id,1]],[[el.id,1]]]}))}
 return parts
}

// V5 production candidate: cut armholes in a single panel mesh, stitch sleeves
// into those actual boundary vertices, then construct the inner lining and
// sew all remaining boundaries. No coincident independent shoulder tubes.
export function sewLining(p,thickness){
 const count=p.positions.length/3,edges=new Map();
 for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){
   const a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=a<b?a+':'+b:b+':'+a;
   const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});
 }
 normals(p);const original=p.indices.slice(),positions=p.positions.slice(),ns=p.normals.slice();
 for(let i=0;i<count;i++)push(p,sub(positions.slice(i*3,i*3+3),mul(ns.slice(i*3,i*3+3),thickness)),weights(p,i));
 for(let i=0;i<original.length;i+=3)p.indices.push(count+original[i],count+original[i+2],count+original[i+1]);
 for(const {a,b,count:n} of edges.values())if(n===1)p.indices.push(b,a,a+count,b,a+count,b+count);
 p.outerVertexCount=count;p.thickness=thickness;return normals(p);
}
function productionTorso(ctx,id,style,method,color,armored){
 const {H,J,vs}=ctx,r=garmentRules[id],low=style==='low-poly',armor=id==='quilted',under=id==='shirt'&&armored,
       N=low?12:32,neck=J('neck01').position,hip=J('root').position[1],waist=J('spine03').position[1]-.04,
       shoulder=J('upperarm01.L').position[1],gap=under?.014:armor?.064:.030,
       hem=under?hip-.025:hip-(id==='shirt'?.07:armor?.22:low?.18:.255)*H,
       levels=[hem,hip-.025,waist,shoulder-.17*H/1.75,shoulder+.027*H/1.75,neck[1]-.013];
 // Avoid coincident stations on the deliberately shorter undergarment.
 levels[1]=Math.max(levels[1],levels[0]+.018);
 const p=part(id,color);Object.assign(p,{layer:r.layer,region:r.region,pattern:{method,revision:5,panels:['continuous bodice','stitched sleeves','shaped skirt'],armholes:2}});
 const armIds=new Set(ctx.source.joints.filter(j=>/arm|wrist|finger|thumb|clavicle/i.test(j.name)).map(j=>j.id));
 const trunk=vs.filter((v,i)=>weights(ctx.body,i).reduce((a,[j,w])=>a+(armIds.has(j)?w:0),0)<.35);
 const stations=[];
 for(let i=0;i<levels.length;i++){
   const y=levels[i],pts=trunk.filter(v=>Math.abs(v[1]-y)<.058*H/1.75),bb=pts.length?bounds(pts):[[-.12,.12],[0,0],[-.085,.085]];
   let rx=Math.max(.092,(bb[0][1]-bb[0][0])/2),rz=Math.max(.065,(bb[2][1]-bb[2][0])/2),cz=(bb[2][0]+bb[2][1])/2;
   if(i===5){rx=.057*H;rz=.039*H;cz=neck[2]}
   else {
     let scale=1;for(const v of pts)scale=Math.max(scale,Math.hypot(v[0]/rx,(v[2]-cz)/rz));rx*=scale;rz*=scale;
     if(i<=1&&!under){ // skirt must enclose dressed thighs, not merely bare skin
       rx=Math.max(rx,.145*H+(i===0?.018:0));rz=Math.max(rz,.095*H);
     }
     if(i===4)rx=Math.max(rx,Math.abs(J('upperarm01.L').position[0])*.94);
   }
   const extra=i===5?gap*.30:gap;
   rx+=extra;rz+=extra;
   if(low&&i===4)rx*=1.075;
   const fold=method==='hybrid'&&!low&&!under?(armor?.0035:.009)*(i===0?1.35:i===2?.18:.7):0;
   const freq=armor?16:6,ws=i<=1?[[J('root').id,1]]:i===2?[[J('root').id,.2],[J('spine03').id,.8]]:i===3?[[J('spine03').id,.45],[J('spine01').id,.55]]:[[J('spine01').id,1]];
   const ring=station([0,y,cz],[1,0,0],[0,0,-1],rx,rz,fold,freq,ws);stations.push(ring);
   for(let k=0;k<N;k++){
     const a=k*2*Math.PI/N,f=ring.rad(a),wave=i===0&&!low&&!under?.009*Math.cos(3*a):0;
     push(p,[f[0]*Math.cos(a),y+wave,cz-f[1]*Math.sin(a)],ws);
   }
 }
 const half=low?2:4,mod=k=>(k+N)%N,skip=new Set();
 for(const center of [0,N/2])for(let k=-half;k<half;k++)skip.add(mod(center+k));
 for(let i=0;i<levels.length-1;i++)for(let k=0;k<N;k++){
   if(i===3&&skip.has(k))continue;
   const a=i*N+k,b=i*N+mod(k+1);p.indices.push(a,b,b+N,a,b+N,a+N);
 }
 for(const [side,center] of [['L',0],['R',N/2]]){
   const sh=J('upperarm01.'+side),el=J('lowerarm01.'+side),wr=J('wrist.'+side);
   let prev=[];
   for(let k=-half;k<=half;k++)prev.push(3*N+mod(center+k));
   for(let k=half;k>=-half;k--)prev.push(4*N+mod(center+k));
   const origin=lerp(sh.position,el.position,.25),axis=unit(sub(el.position,sh.position));
   let u=unit(cross([0,0,1],axis)),v=cross(axis,u);
   const boundaryCenter=mul(prev.map(i=>p.positions.slice(i*3,i*3+3)).reduce(add,[0,0,0]),1/prev.length);
   const angles=prev.map(i=>{const d=sub(p.positions.slice(i*3,i*3+3),boundaryCenter);return Math.atan2(dot(d,v),dot(d,u))});
   let winding=0;for(let k=0;k<angles.length;k++){let d=angles[(k+1)%angles.length]-angles[k];winding+=Math.atan2(Math.sin(d),Math.cos(d))}
   const direction=winding<0?-1:1,phase=angles[0],count=prev.length;
   const points=[origin,lerp(sh.position,el.position,.62),el.position,lerp(el.position,wr.position,.55),lerp(el.position,wr.position,armor?.89:.985)];
   const widths=[.066,.059,.050,.043,.035].map(x=>x*H/1.75+gap*.7);
   const jointWeights=[[[sh.id,.85],[J('spine01').id,.15]],[[sh.id,1]],[[sh.id,.5],[el.id,.5]],[[el.id,1]],[[el.id,.85],[wr.id,.15]]];
   for(let row=0;row<points.length;row++){
     const a=unit(sub(points[Math.min(points.length-1,row+1)],row===0?sh.position:points[row-1]));
     u=unit(sub(u,mul(a,dot(u,a))));v=cross(a,u);
     const nominal=[widths[row],widths[row]],fold=method==='hybrid'&&!low&&!under?(armor?.002:.004):0;
     const rr=measuredLimbRadii(ctx,points[row],a,u,v,nominal,[sh.id,el.id],gap*.65,fold);
     const loop=[];
     for(let k=0;k<count;k++){
       const theta=phase+direction*2*Math.PI*k/count,rad=fold*Math.cos(5*theta+row*.7);
       loop.push(push(p,add(points[row],add(mul(u,(rr[0]+rad)*Math.cos(theta)),mul(v,(rr[1]+rad)*Math.sin(theta)))),jointWeights[row]));
     }
     for(let k=0;k<count;k++){let l=(k+1)%count;p.indices.push(prev[k],prev[l],loop[l],prev[k],loop[l],loop[k])}
     prev=loop;
   }
 }
 const parts=[sewLining(p,r.thickness)];
 // Distinct material bindings track the actual skirt/neck shape.
 if(!under)for(const [label,ring,dy] of [['hem',stations[0],.013],['neck binding',stations.at(-1),-.017]]){
   if(label==='hem'&&method==='hybrid'&&!low)continue; // avoid a rigid trim crossing a deliberately wavy hem
   const a={...ring,rad:t=>ring.rad(t).map(x=>x+.004)},b={...a,c:add(a.c,[0,dy,0])};
   parts.push(ringSurface(ctx,id+' '+label,armor?materials.leather:materials.cream,[a,b].sort((a,b)=>a.c[1]-b.c[1]),N,{...r,thickness:.003}));
 }
 return parts;
}

function trousers(ctx,style,method,color,revision=4){let {J,H}=ctx,N=style==='low-poly'?10:18,r=garmentRules.trousers,parts=[];
 for(let s of ['L','R']){let hip=J('upperleg01.'+s),knee=J('lowerleg01.'+s),foot=J('foot.'+s),pts=[lerp(hip.position,knee.position,-.045),lerp(hip.position,knee.position,.22),knee.position,lerp(knee.position,foot.position,.55),lerp(knee.position,foot.position,revision===5?.62:.87)],rr=[.087,.087,.066,.056,.043].map(x=>[x*H/1.75+r.clearance,x*H/1.75+r.clearance*.8]);parts.push(tube(ctx,'trousers '+s,color,pts,rr,N,{...r,fold:method==='hybrid'&&style!=='low-poly'?.004:0,fitJoints:[hip.id,knee.id],fitClearance:r.clearance,weights:[[[hip.id,.7],[J('root').id,.3]],[[hip.id,1]],[[hip.id,.4],[knee.id,.6]],[[knee.id,1]],[[knee.id,1]]]}))}
 return parts
}
function boots(ctx,style,revision=4){let {J,H,vs}=ctx,N=style==='low-poly'?8:16,r=garmentRules.boots,parts=[];
 for(let s of ['L','R']){let f=J('foot.'+s),k=J('lowerleg01.'+s),sign=s==='L'?1:-1,pts=vs.filter(v=>v[1]<H*.06&&v[0]*sign>0),bb=bounds(pts),cx=(bb[0][0]+bb[0][1])/2,cz=(bb[2][0]+bb[2][1])/2,rx=(bb[0][1]-bb[0][0])/2+.013,rz=(bb[2][1]-bb[2][0])/2+.014;
 // Actual independent closed shoe volume; flattened sole and broad toe box,
 // deliberately no digit anatomy or individual toe weights.
 let rings=[station([cx,.008,cz],[1,0,0],[0,0,-1],rx*.95,rz,0,1,[[f.id,1]]),station([cx,.032,cz],[1,0,0],[0,0,-1],rx,rz,0,1,[[f.id,1]]),station([cx,.075,cz-.012],[1,0,0],[0,0,-1],rx*.91,rz*.90,0,1,[[f.id,1]]),station(f.position.map((v,i)=>i===1?v+.05:v),[1,0,0],[0,0,-1],rx*.8,rz*.42,0,1,[[f.id,.7],[k.id,.3]]),station(lerp(f.position,k.position,.42),[1,0,0],[0,0,-1],revision===5?Math.max(rx*.95,.073*H/1.75):rx*.95,revision===5?Math.max(rz*.48,.073*H/1.75):rz*.48,0,1,[[k.id,1]])];
 let shoe=ringSurface(ctx,'boot '+s,materials.leather,rings,N,{...r});let center=push(shoe,[cx,.008,cz],[[f.id,1]]);for(let i=0;i<N;i++)shoe.indices.push(center,(i+1)%N,i);parts.push(normals(shoe));parts.push(ringSurface(ctx,'boot welt '+s,materials.charcoal,rings.slice(0,2).map(q=>({...q,rad:a=>q.rad(a).map(x=>x+.003)})),N,{...r,thickness:.004}))}
 return parts
}
function cape(ctx,style,color){let {H,J}=ctx,p=part('cloak',color),n=style==='low-poly'?8:20,rows=style==='low-poly'?4:10,neck=J('neck01').position; p.layer=3;p.region='back/shoulder';p.thickness=.004;
 for(let side=0;side<2;side++)for(let j=0;j<=rows;j++)for(let k=0;k<=n;k++){let t=j/rows,a=(-1.2+2.4*k/n),rx=(.12+.10*t)*H,rz=(.07+.035*t)*H,fold=style==='low-poly'?0:.011*Math.cos(a*8)*t,v=[rx*Math.sin(a),neck[1]-.045-t*.48*H,neck[2]-rz*Math.cos(a)-fold+side*.004];push(p,v,[[J('spine01').id,1-t*.4],[J('root').id,t*.4]])}
 let S=(rows+1)*(n+1);for(let side=0;side<2;side++)for(let j=0;j<rows;j++)for(let k=0;k<n;k++){let a=side*S+j*(n+1)+k,b=a+1,c=a+n+1,d=c+1;p.indices.push(...(side?[a,c,b,b,c,d]:[a,b,c,b,d,c]))}
 for(let j=0;j<=rows;j++)for(let k of [0,n])if(j<rows){let a=j*(n+1)+k,b=a+n+1;p.indices.push(a,b,a+S,b,b+S,a+S)}for(let j of [0,rows])for(let k=0;k<n;k++){let a=j*(n+1)+k;p.indices.push(a,a+S,a+1,a+1,a+S,a+1+S)}return normals(p)
}
function waist(ctx,parts,bag){let {J,H}=ctx,y=J('spine03').position[1]-.04,outer=parts.filter(p=>/^(shirt|tunic|quilted)$/.test(p.name)).at(-1),pts=[];for(let i=0;i<outer.positions.length;i+=3)if(Math.abs(outer.positions[i+1]-y)<.08)pts.push(outer.positions.slice(i,i+3));let bb=bounds(pts),rx=Math.max(Math.abs(bb[0][0]),bb[0][1])+.009,cz=(bb[2][0]+bb[2][1])/2,rz=(bb[2][1]-bb[2][0])/2+.008,root=J('spine03').id,rr=[y-.022,y+.022].map(Y=>station([0,Y,cz],[1,0,0],[0,0,-1],rx,rz,0,1,[[root,1]])),belt=ringSurface(ctx,'waist belt',materials.leather,rr,24,{...garmentRules.belt,rigid:root}),p=part('belt clasp',materials.brass,'equipment');p.layer=4;p.region='waist';for(let v of [[-.025,y-.022,cz+rz+.005],[.025,y-.022,cz+rz+.005],[.025,y+.022,cz+rz+.005],[-.025,y+.022,cz+rz+.005]])push(p,v,[[root,1]]);p.indices=[0,1,2,0,2,3];let out=[belt,normals(p)];
 if(bag){let x=rx+.048,z=cz+.02,hip=J('root').id;out.push(ringSurface(ctx,'belt pouch',materials.leather,[station([x,y-.16,z],[1,0,0],[0,0,-1],.062,.035),station([x,y-.08,z],[1,0,0],[0,0,-1],.077,.048),station([x,y-.022,z],[1,0,0],[0,0,-1],.06,.035)],14,{...garmentRules.bag,rigid:hip}))}
 return out
}
function headwear(ctx,style,identity,helmet){let {body,H,J}=ctx,eye=J('eye.L').position,head=J('head'),hair=identity.hair??'short',base=compact(body,face=>face.every(i=>{let v=body.positions.slice(i*3,i*3+3);return v[1]>H-(hair==='cropped'?.045:.075)||(v[1]>eye[1]-(hair==='long'?.10:.045)&&v[2]<head.position[2]-.015)}));base.name=helmet?'iron skullcap':'scalp '+hair;base.color=helmet?materials.iron:identity.hairColor??[.12,.075,.035];base.component='equipment';base.layer=4;base.region='head';
 for(let i=0;i<base.positions.length;i++)base.positions[i]+=base.normals[i]*(helmet?.014:hair==='long'?.014:.007);
 if(helmet){ // rim follows source head; separate nasal plate, not painted skin
 let p=part('helmet nasal',materials.iron,'equipment'),z=eye[2]+.022,y=eye[1];p.layer=4;p.region='head';for(let v of [[-.016,y-.045,z],[.016,y-.045,z],[.020,y+.068,z-.014],[-.020,y+.068,z-.014]])push(p,v,[[head.id,1]]);p.indices=[0,1,2,0,2,3];return [normals(base),normals(p)]}
 let out=[normals(base)];if(identity.beard){let p=compact(body,f=>f.every(i=>{let v=body.positions.slice(i*3,i*3+3);return v[1]<eye[1]-.035&&v[1]>head.position[1]-.065&&v[2]>head.position[2]+.028&&Math.abs(v[0])<.075}));p.name='beard';p.color=base.color;p.layer=4;p.region='face';for(let i=0;i<p.positions.length;i++)p.positions[i]+=p.normals[i]*.008;out.push(normals(p))}return out
}
function identityBody(ctx,id){let {body,H,J}=ctx,eye=J('eye.L').position,head=J('head').position;let p=structuredClone(body);for(let i=0;i<p.positions.length;i+=3){let [x,y,z]=p.positions.slice(i,i+3);if(y>head[1]-.04&&z>head[2]+.015){let w=clamp((y-head[1]+.04)/.12,0,1);p.positions[i]=x*(1+(id.faceWidth??0)*w);p.positions[i+2]=z+(id.nose??0)*Math.exp(-((x/.025)**2)-((y-eye[1]+.022)/.035)**2)}}
 p.color=id.skin??body.color;return normals(p)}
export function draftGarments(source,{style='historical-miniature',kit='tunic',method='hybrid',identity={},surfaceRevision=4}={}){
 if(!kits[kit]||!['pattern','template','hybrid'].includes(method))throw Error('Unknown garment specification');let ctx=context(source),colors=identity.colors??{},parts=[],ids=kits[kit];
 for(let id of ids){let color=materials[colors[id]??(id==='quilted'?'charcoal':id==='cloak'?'madder':id==='trousers'?'charcoal':id==='shirt'?'linen':'wool')];if(!color)throw Error('Unknown garment material');
 if(['shirt','tunic','quilted'].includes(id))parts.push(...(surfaceRevision===5?productionTorso(ctx,id,style,method,color,ids.includes('quilted')):torso(ctx,id,style,method,color)));else if(id==='trousers')parts.push(...trousers(ctx,style,method,color,surfaceRevision));else if(id==='boots')parts.push(...boots(ctx,style,surfaceRevision));else if(id==='cloak')parts.push(cape(ctx,style,color))}
 if(ids.includes('belt'))parts.push(...waist(ctx,parts,ids.includes('bag')));parts.push(...headwear(ctx,style,identity,ids.includes('helmet')));return parts
}
// Bind one authored source template to stable anatomical indices, then
// transfer its offsets across morphs. No independent clothing meshes per person.
export function bindTemplate(source,parts){let ctx=context(source);return parts.map(p=>({...p,templateBinding:Array.from({length:p.positions.length/3},(_,i)=>{let v=p.positions.slice(i*3,i*3+3),j=ctx.near(v).index;return {j,offset:sub(v,ctx.vs[j]),skin:weights(p,i).map(([id,w])=>[source.joints[id].name,w])}})}))}
export function fitTemplate(source,template){let ctx=context(source);return template.map(p=>{let q=part(p.name,p.color,p.component);Object.assign(q,{indices:p.indices.slice(),layer:p.layer,region:p.region,thickness:p.thickness,pattern:p.pattern});for(let b of p.templateBinding){
   if(!ctx.vs[b.j]||!Array.isArray(b.skin))throw Error('Invalid garment template binding; regenerate template from source');
   // Preserve the authored garment's semantic skinning, including rigid
   // shoe/helmet/buckle attachments, independently of anatomical fitting.
   const ws=b.skin.map(([name,w])=>[ctx.J(name).id,w]);
   push(q,add(ctx.vs[b.j],b.offset),ws)
 }return normals(q)})}
export function dress(source,options={},template=null){let t=performance.now(),ctx=context(source),identity=options.identity??{},body=identityBody(ctx,identity),H=ctx.H,neck=ctx.J('neck01').position[1],wrists=['L','R'].map(s=>ctx.J('wrist.'+s).position);
 // Retain head/neck and complete exposed hands only. Feet are entirely
 // concealed by independent boot geometry. Preserve hidden source separately.
 let visible=compact(body,f=>f.every(i=>{let v=body.positions.slice(i*3,i*3+3);return v[1]>neck-.018||wrists.some(w=>Math.abs(v[0])>=Math.abs(w[0])-.016&&Math.hypot(...sub(v,w))<.24)}));
 let garments=options.method==='template'?fitTemplate(source,template):draftGarments(source,options),eyes=['helper-l-eye','helper-r-eye'].map(n=>helper(source,ctx.body,ctx.near,n,[.65,.61,.51],v=>v,'body'));
 let iris=eyes.map((p,i)=>{let z=Math.max(...p.positions.filter((_,k)=>k%3===2)),q=compact(p,f=>f.every(j=>p.positions[j*3+2]>z-.004));q.name='iris '+i;q.color=identity.eyeColor??[.08,.06,.04];for(let j=2;j<q.positions.length;j+=3)q.positions[j]+=.001;return q}).filter(p=>p.indices.length);
 let m={...structuredClone(source),parts:[visible,...eyes,...iris,...garments],spec:{...source.spec,recipe:'source-'+(options.kit==='warrior'?'warrior':'citizen'),style:options.style??'historical-miniature',lod:'source',garment:options,actions:['idle','walk']},approval:'unreviewed'};delete m.fitting;
 // Low-poly art direction changes the silhouette consistently across body,
 // clothes, and skeleton; not merely a triangle-count change. The same
 // global rest-space transform is applied to every component.
 if(m.spec.style==='low-poly'){
   const hip=ctx.J('root').position[1],head=ctx.J('head').position,transform=v=>{let q=v.slice(),top=clamp((v[1]-neck)/.10,0,1),upper=clamp((v[1]-hip)/.35,0,1)*(1-top);let art=options.surfaceRevision===5;q[0]*=1+(art?.25:.14)*upper+(art?.25:.10)*top;q[1]=v[1]<hip?v[1]*(art?.84:.91):hip*(art?.84:.91)+(v[1]-hip)*(1+(art?.16:.04)*top);q[2]=head[2]+(v[2]-head[2])*(1+.09*top);return q};
   for(let p of m.parts){for(let i=0;i<p.positions.length;i+=3)p.positions.splice(i,3,...transform(p.positions.slice(i,i+3)));normals(p)}
   for(let j of m.joints){j.position=transform(j.position);j.local=j.parent<0?j.position.slice():sub(j.position,m.joints[j.parent].position)}
 }
 m.statistics={triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0),joints:m.joints.length,garmentMs:performance.now()-t};return m
}
// Diagnostic, not exact mesh intersection: nearest source normal signed
// distance for outer garment vertices at rest and four animated phases.
// Retains negative samples and names rather than hiding lower-layer defects.
export function garmentAudit(source,m,phases=[0,.25,.5,.75]){if(m.spec.style==='low-poly')return {skipped:'Low-poly rest-space transform differs; compare neutral untransformed methods separately'};let results=[];for(let phase of phases){let w=pose(m,'walk',phase),skin=deform(source,source.parts[0],w),p={...source.parts[0],positions:skin.flat()},near=locator(normals(p)),rows=[];
 for(let q of m.parts.filter(p=>p.layer&&p.region!=='head'&&p.region!=='face')){let vs=deform(m,q,w),negative=0,min=Infinity,samples=0;for(let i=0;i<Math.floor(vs.length/2);i+=Math.max(1,Math.floor(vs.length/800))){let v=vs[i],hit=near(v),n=p.normals.slice(hit.index*3,hit.index*3+3),d=dot(sub(v,skin[hit.index]),n);negative+=d<-.008;min=Math.min(min,d);samples++}rows.push({part:q.name,negative,samples,minApproxSignedDistance:min})}results.push({phase,rows})}return results}
