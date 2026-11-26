// Four roles share the same MakeHuman source, tailored v6 panels and v7
// sculpt. Role-specific pieces are reusable parametrized patterns.
import {dress,sewLining} from './garment.mjs';
import {sculptCitizen} from './sculpt-v7.mjs';
import {part,push,weights,normals} from './hybrid-human.mjs';
import {profiles,materialKind} from './material-study.mjs';
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t),pos=(p,i)=>p.positions.slice(i*3,i*3+3),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),tau=2*Math.PI;
export const roles={
 artisan:{morph:'base',identity:{hair:'cropped',beard:true,hairColor:[.14,.08,.035],colors:{tunic:'linen',trousers:'charcoal'}},clothing:'work apron',tunic:[.30,.22,.12]},
 merchant:{morph:'older-man',identity:{hair:'long',beard:true,hairColor:[.36,.31,.23],colors:{tunic:'indigo',trousers:'charcoal'}},clothing:'wool mantle',tunic:[.105,.20,.25]},
 infantry:{morph:'tall-heavy',identity:{hair:'cropped',beard:true,hairColor:[.10,.07,.04],colors:{tunic:'madder',trousers:'charcoal'}},clothing:'padded coat and steel breast protection',tunic:[.29,.19,.115]},
 legionary:{morph:'short-light',identity:{hair:'cropped',beard:false,hairColor:[.11,.07,.04],colors:{tunic:'madder',trousers:'charcoal'}},clothing:'segmented iron cuirass',tunic:[.39,.085,.045]}
};
function surface(m,name,color,kind='cloth'){let p=part(name,color,'equipment');p.layer=4;p.region=name;p.material={kind,roughness:profiles[kind].roughness,metallic:profiles[kind].metallic};return p}
function grid(p,rows,cols){for(let i=0;i<rows-1;i++)for(let k=0;k<cols-1;k++){let a=i*cols+k,b=a+1;p.indices.push(a,b,b+cols,a,b+cols,a+cols)}return p}
function panelAt(p,row,t,k){let N=p.pattern.ringCount,a=row*N+(k+N)%N,b=(row+1)*N+(k+N)%N;return {v:mix(pos(p,a),pos(p,b),t),ws:[...weights(p,a).map(([j,w])=>[j,w*(1-t)]),...weights(p,b).map(([j,w])=>[j,w*t])]}}
function drapedPanel(m,tunic,name,color,kind,rows,from,to,offset,fold){
 const p=surface(m,name,color,kind),N=tunic.pattern.ringCount,cols=to-from+1;
 for(let r=0;r<rows.length;r++){const [row,t]=rows[r],center=mix(tunic.pattern.sections[row].center,tunic.pattern.sections[row+1].center,t);
   for(let k=from;k<=to;k++){const {v,ws}=panelAt(tunic,row,t,k),d=[v[0]-center[0],v[2]-center[1]],n=Math.hypot(...d)||1;
     const f=offset+fold*Math.sin(Math.PI*r/(rows.length-1))*Math.cos((k-from)/Math.max(1,cols-1)*Math.PI*3+.3);
     push(p,[v[0]+d[0]/n*f,v[1],v[2]+d[1]/n*f],ws);
   }
 }
 grid(p,rows.length,cols);return sewLining(p,kind==='metal'?.004:.005);
}
function helmet(m,roman){
 const j=m.joints.find(x=>x.name==='head'),skin=m.parts[0],head=skin.positions.reduce((a,x,i)=>{if(i%3===0&&skin.positions[i+1]>j.position[1]-.03)a.push(skin.positions.slice(i,i+3));return a},[]);
 const bb=[0,1,2].map(k=>[Math.min(...head.map(v=>v[k])),Math.max(...head.map(v=>v[k]))]),cx=(bb[0][0]+bb[0][1])/2,cz=(bb[2][0]+bb[2][1])/2,H=bb[1][1],rx=(bb[0][1]-bb[0][0])/2+.017,rz=(bb[2][1]-bb[2][0])/2+.018,base=H-.106,ws=[[j.id,1]],p=surface(m,roman?'iron imperial helmet':'iron conical helmet',[.29,.33,.34],'metal'),N=32;
 const rows=roman?[[base-.018,1.13],[base,1.08],[base+.042,.98],[H+.015,.58],[H+.03,.06]]:[[base-.018,1.09],[base,1.04],[H-.035,.73],[H+.075,.22],[H+.10,.025]];
 for(const [y,s] of rows)for(let k=0;k<=N;k++){let a=k*tau/N;push(p,[cx+rx*s*Math.cos(a),y,cz-rz*s*Math.sin(a)],ws)}
 grid(p,rows.length,N+1);let cap=push(p,[cx,rows.at(-1)[0]+.001,cz],ws);for(let k=0;k<N;k++)p.indices.push((rows.length-1)*(N+1)+k,(rows.length-1)*(N+1)+k+1,cap);
 const parts=[sewLining(p,.004)];
 if(roman){for(let side of [-1,1]){let q=surface(m,'iron cheek guard '+side,[.34,.33,.28],'metal');for(const [x,y,z] of [[.94,base,cz+.015],[.83,base-.083,cz+.05],[.64,base-.075,cz+.093],[.75,base,cz+.09]])push(q,[cx+x*rx*side,y,z],ws);q.indices=side===1?[0,1,2,0,2,3]:[0,2,1,0,3,2];parts.push(sewLining(q,.004))}}
 else {let q=surface(m,'iron nasal',[.32,.35,.34],'metal');for(const [x,y] of [[-.018,base+.016],[.018,base+.016],[.012,base-.079],[-.012,base-.079]])push(q,[cx+x,y,cz+rz+.014],ws);q.indices=[0,2,1,0,3,2];parts.push(sewLining(q,.005))}
 return parts;
}
function shield(m,roman){
 const wrist=m.joints.find(j=>j.name==='wrist.L'),elbow=m.joints.find(j=>j.name==='lowerarm01.L'),center=mix(elbow.position,wrist.position,.56),ws=[[elbow.id,1]],w=roman?.30:.24,h=roman?.46:.39;
 const p=surface(m,roman?'red curved scutum':'heater shield',[.38,.075,.035],'leather'),N=32;
 // Borne outside left forearm, not suspended at the model origin. Slight
 // convexity, rim, boss and visibly distinct outline.
 const rings=[.035,.92,1],z=center[2]+.15,x=center[0]+.065,y=center[1]-.10;
 for(const s of rings)for(let k=0;k<=N;k++){const a=k*tau/N,xx=Math.cos(a),yy=Math.sin(a),sx=roman?Math.sign(xx)*Math.abs(xx)**.45:xx*(yy<0?1+.60*yy:1),sy=roman?Math.sign(yy)*Math.abs(yy)**.45:yy;push(p,[x+w*s*sx,y+h*s*sy,z+.045*(1-s*s)],ws)}
 grid(p,rings.length,N+1);const c=push(p,[x,y,z+.05],ws);for(let k=0;k<N;k++)p.indices.push(c,k,k+1);
 const rim=surface(m,'iron shield rim',[.31,.30,.25],'metal');for(let row of [1,2])for(let k=0;k<=N;k++)push(rim,[...pos(p,row*(N+1)+k).slice(0,2),pos(p,row*(N+1)+k)[2]+.006],ws);grid(rim,2,N+1);
 return [sewLining(p,.016),sewLining(rim,.004)];
}
function movePouch(m,tunic){
 const pouch=m.parts.find(p=>p.name==='belt pouch'),loop=m.parts.find(p=>p.name==='pouch belt loop');if(!pouch||!loop)return;
 // Rear-quarter belt socket moves pouch clear of the forward hand arc.
 const c=tunic.pattern.sections[2].center,angle=-.78,co=Math.cos(angle),si=Math.sin(angle);
 for(const p of [pouch,loop]){for(let i=0;i<p.positions.length;i+=3){let x=p.positions[i]-c[0],z=p.positions[i+2]-c[1];p.positions[i]=c[0]+x*co-z*si;p.positions[i+2]=c[1]+x*si+z*co}p.attachment={garment:'tunic',station:2,azimuth:angle};normals(p)}
}
export function produceRole(source,id,identityOverride=null){
 const role=roles[id],start=performance.now(),identity={...role.identity,...identityOverride},base=dress(source,{style:'historical-miniature',kit:'tunic',method:'hybrid',surfaceRevision:6,identity}),m=sculptCitizen(base,source).model,tunic=m.parts.find(p=>p.name==='tunic'),N=tunic.pattern.ringCount;
 tunic.color=role.tunic.slice();m.spec.artRole=id;m.spec.miniaturePose='v8';m.spec.motionRevision='v4';m.spec.provenance=[...m.spec.provenance,{author:'Pocket Works',license:'original',origin:'Shared v8 historical role patterns'}];
 // Tailoring uses actual seam stations. Unequal hem lengths, a small bias
 // across panels and folds taper at the belt, without shrinking clearance.
 const hem=tunic.pattern.sections[0].y,waist=tunic.pattern.sections[2].y;
 for(let i=0;i<tunic.positions.length;i+=3){let y=tunic.positions[i+1],t=clamp((waist-.065-y)/(waist-.065-hem));if(t>0){let a=Math.atan2(tunic.positions[i+2]-tunic.pattern.sections[0].center[1],tunic.positions[i]);tunic.positions[i+1]+=(id==='legionary'?.055:id==='artisan'?.020:id==='merchant'?-.025:0)*t*t+.012*t*t*Math.sin(a*2+.4)}}normals(tunic);
 movePouch(m,tunic);
 if(id==='artisan')m.parts.push(drapedPanel(m,tunic,'leather work apron',[.25,.14,.07],'leather',[[0,.1],[0,.4],[1,0],[1,.5],[2,0]],18,30,.022,.008));
 if(id==='merchant'){
   m.parts.push(drapedPanel(m,tunic,'wool shoulder mantle',[.27,.12,.055],'cloth',[[2,.35],[3,0],[3,.45],[4,0],[4,.60]],-3,19,.045,.012));
   m.parts.push(drapedPanel(m,tunic,'woven mantle border',[.53,.31,.11],'cloth',[[2,.35],[2,.47]],-3,19,.052,0));
 }
 if(id==='infantry'||id==='legionary'){
   m.parts=m.parts.filter(p=>!['belt pouch','pouch belt loop'].includes(p.name)&&!p.name.startsWith('scalp'));
   m.parts.push(...helmet(m,id==='legionary'),...shield(m,id==='legionary'));
   if(id==='infantry'){
     // Raised padded longitudinal seams with a separate metal breastplate.
     for(let k=0;k<N;k+=4)m.parts.push(drapedPanel(m,tunic,'quilted padded rib '+k,[.25,.17,.10],'cloth',[[1,.15],[1,.6],[2,0],[2,.6],[3,.25]],k,k+2,.021,.003));
     m.parts.push(drapedPanel(m,tunic,'iron breastplate',[.27,.30,.31],'metal',[[2,.20],[2,.65],[3,0],[3,.45]],18,30,.047,.004));
   }else{
     for(let i=0;i<6;i++){const a=.05+i*.145,b=a+.16;const row=x=>x<.6?[2,x/.6]:[3,(x-.6)/.4];m.parts.push(drapedPanel(m,tunic,'iron segmented cuirass '+i,[.34,.36,.35],'metal',[row(a),row(Math.min(.96,b))],0,N,.032+(5-i)*.002,0))}
   }
 }
 for(const p of m.parts)if(!p.material){const k=materialKind(p.name);p.material={kind:k,roughness:profiles[k].roughness,metallic:profiles[k].metallic}}
 m.statistics={...m.statistics,triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0),roleMs:performance.now()-start};
 return m;
}
