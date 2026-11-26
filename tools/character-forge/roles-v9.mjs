// v0.9 historical role construction. One MakeHuman anatomical source,
// one shared garment pattern and reusable fitted parts; role differences are
// generated from declared cuts, equipment and material classes.
import {produceRole,roles as roleProfiles} from './roles-v8.mjs';
import {part,push,weights,normals} from './hybrid-human.mjs';
import {sewLining} from './garment.mjs';
import {profiles} from './material-study.mjs';
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s),mix=(a,b,t)=>add(mul(a,1-t),mul(b,t)),unit=a=>mul(a,1/(Math.hypot(...a)||1)),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),tau=Math.PI*2;
const J=(m,n)=>{const j=m.joints.find(x=>x.name===n);if(!j)throw Error('Missing joint '+n);return j};
function addPart(m,name,color,kind,region=name){const p=part(name,color,kind==='metal'?'equipment':'clothing');p.layer=4;p.region=region;p.material={kind,roughness:profiles[kind]?.roughness??(kind==='wood'?.82:.72),metallic:profiles[kind]?.metallic??0};m.parts.push(p);return p}
function grid(p,rows,cols){for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){let a=r*cols+c,b=a+1;p.indices.push(a,b,b+cols,a,b+cols,a+cols)}return p}
function finish(p,thickness=.004){if(thickness)sewLining(p,thickness);p.thickness=thickness;return normals(p)}
function tube(m,name,stations,color,kind='leather',sides=12,thickness=.004){
 const p=addPart(m,name,color,kind),centers=stations.map(s=>s.p);
 for(let r=0;r<stations.length;r++){
  const s=stations[r],axis=unit(sub(centers[Math.min(r+1,centers.length-1)],centers[Math.max(0,r-1)])),helper=Math.abs(axis[1])>.88?[1,0,0]:[0,1,0],u=unit([axis[1]*helper[2]-axis[2]*helper[1],axis[2]*helper[0]-axis[0]*helper[2],axis[0]*helper[1]-axis[1]*helper[0]]),v=[axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]];
  for(let k=0;k<=sides;k++){const a=tau*k/sides,q=add(s.p,add(mul(u,Math.cos(a)*s.r),mul(v,Math.sin(a)*s.r)));push(p,q,s.ws)}
 }
 grid(p,stations.length,sides+1);return finish(p,thickness);
}
function ellipsoid(m,name,c,r,ws,color,kind='leather',rows=8,cols=16){
 const p=addPart(m,name,color,kind);
 for(let i=0;i<=rows;i++){const a=Math.PI*i/rows;for(let k=0;k<=cols;k++){const b=tau*k/cols,v=[c[0]+r[0]*Math.sin(a)*Math.cos(b),c[1]+r[1]*Math.cos(a),c[2]+r[2]*Math.sin(a)*Math.sin(b)];push(p,v,ws)}}
 grid(p,rows+1,cols+1);return finish(p,.003);
}
function appendTorus(p,c,u,v,n,R,r,ws){const M=8,S=4;for(let i=0;i<=M;i++)for(let k=0;k<=S;k++){const a=tau*i/M,b=tau*k/S,rad=add(mul(u,Math.cos(a)),mul(v,Math.sin(a))),q=add(c,add(mul(rad,R),mul(add(mul(rad,Math.cos(b)),mul(n,Math.sin(b))),r)));push(p,q,ws)}const base=p.positions.length/3-(M+1)*(S+1);for(let i=0;i<M;i++)for(let k=0;k<S;k++){const a=base+i*(S+1)+k,b=a+1,c=b+S+1,d=a+S+1;p.indices.push(a,b,c,a,c,d)}}
function torus(m,name,c,u,v,n,R,r,ws,color=[.31,.34,.35]){const p=addPart(m,name,color,'metal','mail');appendTorus(p,c,u,v,n,R,r,ws);return normals(p)}
function panelAt(tunic,row,t,k){
 const N=tunic.pattern.ringCount,a=row*N+((k%N)+N)%N,b=(row+1)*N+((k%N)+N)%N;
 const va=tunic.positions.slice(a*3,a*3+3),vb=tunic.positions.slice(b*3,b*3+3);
 return {v:mix(va,vb,t),ws:[...weights(tunic,a).map(([j,w])=>[j,w*(1-t)]),...weights(tunic,b).map(([j,w])=>[j,w*t])]};
}
function radial(v,c){return unit([v[0]-c[0],0,v[2]-c[1]])}
function curvedPatch(m,tunic,name,rows,from,to,color,kind='metal',offset=.018,thickness=.004){
 const p=addPart(m,name,color,kind),N=to-from+1;
 for(let ri=0;ri<rows.length;ri++){const [row,t]=rows[ri],center=mix(tunic.pattern.sections[row].center,tunic.pattern.sections[row+1].center,t);
  for(let k=from;k<=to;k++){const {v,ws}=panelAt(tunic,row,t,k),n=radial(v,center),bulge=.006*Math.sin(Math.PI*ri/Math.max(1,rows.length-1))*Math.sin(Math.PI*(k-from)/Math.max(1,to-from));push(p,add(v,mul(n,offset+bulge)),ws)}
 }
 grid(p,rows.length,N);return finish(p,thickness);
}
function mailCurtain(m,tunic){
 const N=tunic.pattern.ringCount,sections=[[2,.18],[2,.48],[2,.78],[3,.08],[3,.34]],centers=[],p=addPart(m,'interlinked mail aventail and collar',[.30,.34,.36],'metal','mail');
 for(const [row,t] of sections)for(let k=0;k<N;k+=2){
  const a=panelAt(tunic,row,t,k),b=panelAt(tunic,row,t,k+1),c=panelAt(tunic,row,t,k-1),center=a.v,centerLine=tunic.pattern.sections[row].center;
  const u=unit(sub(b.v,c.v)),n=radial(center,centerLine),v=unit([u[1]*n[2]-u[2]*n[1],u[2]*n[0]-u[0]*n[2],u[0]*n[1]-u[1]*n[0]]);
  centers.push({c:add(center,mul(n,.006)),u,v,n,ws:a.ws});
 }
 for(const x of centers)appendTorus(p,x.c,x.u,x.v,x.n,.009,.0022,x.ws);normals(p);
 return {rings:centers.length,parts:1};
}
function rivet(m,name,p,ws,size=.008,color=[.55,.36,.14]){return ellipsoid(m,name,p,[size,size,size*.65],ws,color,'metal',4,8)}
function curvedBand(m,tunic,name,t0,t1,color=[.40,.43,.43],offset=.032){
 const p=addPart(m,name,color,'metal','torso armour'),N=tunic.pattern.ringCount;
 for(const t of [t0,t1])for(let k=0;k<=N;k++){const a=panelAt(tunic,2,t,k),center=mix(tunic.pattern.sections[2].center,tunic.pattern.sections[3].center,t),n=radial(a.v,center),v=add(a.v,mul(n,offset+.004*Math.sin(k*tau/N)));push(p,v,a.ws)}
 grid(p,2,N+1);return finish(p,.006);
}
function shield(m,roman){
 const wrist=J(m,'wrist.L'),fore=J(m,'lowerarm01.L'),curvature=roman?.105:.045,thick=.034,center=[wrist.position[0],wrist.position[1]-(roman?.045:.035),wrist.position[2]-curvature+thick+.02],w=roman?.245:.175,h=roman?.46:.29,N=16,R=20,ws=[[fore.id,.35],[wrist.id,.65]],p=addPart(m,roman?'curved Roman scutum':'heater shield',[.34,.075,.035],'leather','shield');
 const point=(u,v,back=false)=>{const shape=roman?(.96+.04*Math.cos(v*Math.PI/2)):(1-.27*Math.max(0,-v)),x=center[0]+u*w*shape,y=center[1]+v*h,z=center[2]+curvature*(1-u*u)+.012*Math.cos(v*Math.PI/2)-(back?thick:0);return [x,y,z]};
 for(const back of [false,true])for(let r=0;r<=R;r++)for(let c=0;c<=N;c++){const u=-1+2*c/N,v=-1+2*r/R;push(p,point(u,v,back),ws)}
 const stride=(R+1)*(N+1);
 for(let r=0;r<R;r++)for(let c=0;c<N;c++){let a=r*(N+1)+c,b=a+1,d=a+N+1,e=d+1;p.indices.push(a,b,e,a,e,d);let A=stride+a,B=stride+b,D=stride+d,E=stride+e;p.indices.push(A,E,B,A,D,E)}
 for(let r=0;r<R;r++)for(let c of [0,N]){let a=r*(N+1)+c,b=a+N+1;p.indices.push(a,b,stride+b,a,stride+b,stride+a)}
 for(let c=0;c<N;c++){let a=c,b=c+1;p.indices.push(a,stride+a,stride+b,a,stride+b,b);a=R*(N+1)+c;b=a+1;p.indices.push(a,b,stride+b,a,stride+b,stride+a)}
 finish(p,.003);
 const gripZ=center[2]+curvature-thick+.006,gripY=wrist.position[1],gripX=wrist.position[0];
 tube(m,roman?'scutum hand grip':'heater shield hand grip',[{p:[gripX,gripY-.085,gripZ],r:.015,ws:[[wrist.id,1]]},{p:[gripX,gripY+.085,gripZ],r:.015,ws:[[wrist.id,1]]}],[.16,.075,.035],'leather',10,.002);
 for(const t of [.28,.72]){const c=mix(fore.position,wrist.position,t),u=unit(sub(wrist.position,fore.position));tube(m,'shield forearm retaining strap '+t,[{p:add(c,mul(u,-.012)),r:.050,ws:[[fore.id,1-t],[wrist.id,t]]},{p:add(c,mul(u,.012)),r:.050,ws:[[fore.id,1-t],[wrist.id,t]]}],[.15,.08,.035],'leather',12,.002)}
 ellipsoid(m,roman?'scutum umbo':'heater shield boss',[center[0],center[1],center[2]+(roman?.105:.045)+.012],[roman?.055:.034,roman?.055:.034,.022],ws,[.48,.43,.31],'metal',6,12);
 m.attachments??=[];m.attachments.push({name:roman?'scutum grip':'heater shield grip',joint:'wrist.L',local:sub([gripX,gripY,gripZ],wrist.position),contactError:Math.hypot(...sub([gripX,gripY,gripZ],wrist.position))});
}
function bascinet(m){
 const h=J(m,'head'),head=m.parts[0],pts=[];
 for(let i=0;i<head.positions.length;i+=3){const v=head.positions.slice(i,i+3);if(Math.abs(v[1]-h.position[1])<.15&&Math.abs(v[0]-h.position[0])<.11)pts.push(v)}
 const rx=Math.max(.055,...pts.map(v=>Math.abs(v[0]-h.position[0])))*1.22,rz=Math.max(.055,...pts.map(v=>Math.abs(v[2]-h.position[2])))*1.18,base=h.position[1]+.015,centerZ=h.position[2]-.005,N=24,p=addPart(m,'rounded bascinet skull',[.30,.34,.35],'metal','head armour');
 const rows=[[base,1.08],[base+.025,1.04],[base+.065,.91],[base+.105,.68],[base+.135,.34],[base+.145,.03]];
 for(const [y,s] of rows)for(let k=0;k<=N;k++){const a=tau*k/N;push(p,[h.position[0]+rx*s*Math.cos(a),y,centerZ+rz*s*Math.sin(a)],[[h.id,1]])}
 grid(p,rows.length,N+1);finish(p,.004);
 const z=centerZ+rz*.86,visor=addPart(m,'bascinet brow and visor',[.27,.30,.31],'metal','face protection');
 for(const [x,y] of [[-.060,base+.025],[.060,base+.025],[.055,base+.066],[-.055,base+.066]])push(visor,[h.position[0]+x,y,z],[[h.id,1]]);
 visor.indices=[0,1,2,0,2,3];normals(visor);
 const slit=addPart(m,'bascinet eye slit',[.035,.032,.028],'leather','face');for(const [x,y] of [[-.048,base+.044],[.048,base+.044],[.046,base+.050],[-.046,base+.050]])push(slit,[h.position[0]+x,y,z+.002],[[h.id,1]]);slit.indices=[0,1,2,0,2,3];normals(slit);
 for(const side of [-1,1]){
  const cheek=addPart(m,'bascinet cheek guard '+side,[.31,.34,.35],'metal','head armour'),x=h.position[0]+side*rx*.78;
  for(const [xx,y,zz] of [[x,base+.025,centerZ+rz*.2],[x+side*.012,base-.065,centerZ+rz*.54],[x-side*.015,base-.105,centerZ+rz*.26],[x-side*.012,base-.015,centerZ+rz*.12]])push(cheek,[xx,y,zz],[[h.id,1]]);
  cheek.indices=side>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];normals(cheek);
 }
 const neck=J(m,'neck01');tube(m,'mail aventail lower edge',[{p:[h.position[0]-.105,neck.position[1]+.015,neck.position[2]-.01],r:.012,ws:[[neck.id,.7],[h.id,.3]]},{p:[h.position[0],neck.position[1]-.045,neck.position[2]-.045],r:.012,ws:[[neck.id,1]]},{p:[h.position[0]+.105,neck.position[1]+.015,neck.position[2]-.01],r:.012,ws:[[neck.id,.7],[h.id,.3]]}],[.27,.29,.30],'metal',8,.002);
}
function imperialHelmet(m){
 const h=J(m,'head'),head=m.parts[0],pts=[];for(let i=0;i<head.positions.length;i+=3){const v=head.positions.slice(i,i+3);if(Math.abs(v[1]-h.position[1])<.15)pts.push(v)}
 const rx=Math.max(.055,...pts.map(v=>Math.abs(v[0]-h.position[0])))*1.18,rz=Math.max(.055,...pts.map(v=>Math.abs(v[2]-h.position[2])))*1.16,base=h.position[1]+.012,N=24,p=addPart(m,'imperial Gallic helmet bowl',[.36,.38,.38],'metal','head armour');
 const rows=[[base,1.10],[base+.025,1.08],[base+.065,.96],[base+.105,.72],[base+.135,.36],[base+.145,.025]];
 for(const [y,s] of rows)for(let k=0;k<=N;k++){const a=tau*k/N;push(p,[h.position[0]+rx*s*Math.cos(a),y,h.position[2]+rz*s*Math.sin(a)],[[h.id,1]])}
 grid(p,rows.length,N+1);finish(p,.004);
 tube(m,'imperial helmet brow',[{p:[h.position[0]-rx,base+.026,h.position[2]+rz*.52],r:.010,ws:[[h.id,1]]},{p:[h.position[0],base+.030,h.position[2]+rz*1.04],r:.010,ws:[[h.id,1]]},{p:[h.position[0]+rx,base+.026,h.position[2]+rz*.52],r:.010,ws:[[h.id,1]]}],[.55,.39,.16],'metal',8,.002);
 for(const side of [-1,1]){
  const cheek=addPart(m,'imperial cheek guard '+side,[.37,.38,.34],'metal','head armour'),x=h.position[0]+side*rx*.82;
  for(const v of [[x,base+.015,h.position[2]+rz*.25],[x+side*.012,base-.075,h.position[2]+rz*.50],[x-side*.014,base-.105,h.position[2]+rz*.24],[x-side*.012,base-.012,h.position[2]+rz*.10]])push(cheek,v,[[h.id,1]]);
  cheek.indices=side>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];normals(cheek);
 }
 const neck=J(m,'neck01');curvedPatch(m,m.parts.find(p=>p.name==='tunic'), 'imperial neck guard',[ [3,.72],[3,.86],[3,.98] ],18,30,[.34,.36,.34],'metal',.05,.004);
 // Short, restrained crest socket; no oversized brush that swallows the bowl.
 ellipsoid(m,'imperial crest socket',[h.position[0],base+.145,h.position[2]-.012],[.035,.018,.045],[[h.id,1]],[.38,.24,.10],'metal',5,10);
}
function scutumBands(m){
 const tunic=m.parts.find(p=>p.name==='tunic'),N=tunic.pattern.ringCount;
 for(let i=0;i<7;i++){const a=.04+i*.135,b=a+.105;curvedBand(m,tunic,'lorica segmentata band '+(i+1),a,b,[.34,.37,.37],.030+(6-i)*.0015);
  for(const k of [0,Math.floor(N/2)]){const x=panelAt(tunic,2,(a+b)/2,k);rivet(m,'lorica copper hinge '+i+' '+k,x.v,x.ws,.008,[.59,.39,.16])}
 }
 for(let side of [-1,1])for(let i=0;i<3;i++){const sh=J(m,'upperarm01.'+(side>0?'L':'R')),el=J(m,'lowerarm01.'+(side>0?'L':'R'));tube(m,'lorica shoulder strap '+side+' '+i,[{p:mix(sh.position,el.position,.08),r:.028,ws:[[sh.id,.8],[el.id,.2]]},{p:mix(sh.position,el.position,.36),r:.025,ws:[[sh.id,.4],[el.id,.6]]}],[.34,.37,.37],'metal',12,.003)}
}
function pteruges(m,roman){
 const tunic=m.parts.find(p=>p.name==='tunic'),N=tunic.pattern.ringCount,front=Array.from({length:N},(_,k)=>k).filter(k=>panelAt(tunic,2,0,k).v[2]>tunic.pattern.sections[2].center[1]);
 for(let i=0;i<7;i++){const k=front[Math.floor(i*(front.length-1)/6)],a=panelAt(tunic,2,.05,k),b=panelAt(tunic,2,.22,k),c=panelAt(tunic,1,.0,k),ws=a.ws;
  const p=addPart(m,(roman?'roman leather pteryx ':'infantry belt tongue ')+i,[.24,.12,.055],'leather','belt');
  const width=.028;for(const v of [a.v.map((x,j)=>x+(j===0?-width:0)),a.v.map((x,j)=>x+(j===0?width:0)),c.v.map((x,j)=>x+(j===0?width:0)),c.v.map((x,j)=>x+(j===0?-width:0))])push(p,v,ws);
  p.indices=[0,1,2,0,2,3];finish(p,.003);
  rivet(m,'pteryx stud '+i,mix(a.v,c.v,.18),ws,.004,[.55,.39,.17]);
 }
}
function romanCaligae(m){
 for(const side of ['L','R']){const foot=J(m,'foot.'+side),knee=J(m,'lowerleg01.'+side),x=foot.position[0],y=foot.position[1],z=foot.position[2];
  for(let i=0;i<3;i++){const yy=y+.035+i*.032;tube(m,'caligae leather strap '+side+' '+i,[{p:[x-.048,yy,z+.045],r:.009,ws:[[foot.id,.8],[knee.id,.2]]},{p:[x,yy+.005,z+.065],r:.009,ws:[[foot.id,1]]},{p:[x+.048,yy,z+.045],r:.009,ws:[[foot.id,.8],[knee.id,.2]]}],[.20,.11,.055],'leather',8,.002)}
  tube(m,'caligae ankle wrap '+side,[{p:[x-.044,y+.10,z],r:.012,ws:[[foot.id,.6],[knee.id,.4]]},{p:[x+.044,y+.10,z],r:.012,ws:[[foot.id,.6],[knee.id,.4]]}],[.35,.23,.12],'leather',8,.002);
 }
}
function merchantKit(m){
 const tunic=m.parts.find(p=>p.name==='tunic'),N=tunic.pattern.ringCount,hem=tunic.pattern.sections[0],root=J(m,'root'),hip=J(m,'spine03'),coat=addPart(m,'merchant long wool robe',[.20,.22,.30],'cloth','outer robe');
 for(let r=0;r<=8;r++){const t=r/8;for(let k=0;k<=N;k++){const a=panelAt(tunic,0,0,k%N),d=radial(a.v,hem.center),flare=1+.16*t+.035*Math.sin(t*Math.PI),v=[hem.center[0]+(a.v[0]-hem.center[0])*flare+d[0]*(.025+.018*t),hem.y-.39*t+.006*Math.sin(k*tau/N*3)*t,hem.center[1]+(a.v[2]-hem.center[1])*flare+d[2]*(.025+.018*t)];const side=v[0]>0?'L':'R';push(coat,v,[[root.id,.52],[hip.id,.18],[J(m,'upperleg01.'+side).id,.30]])}}
 grid(coat,9,N+1);finish(coat,.008);
 for(const side of ['L','R']){const upper=J(m,'upperarm01.'+side),lower=J(m,'lowerarm01.'+side),wrist=J(m,'wrist.'+side);tube(m,'merchant broad wool sleeve '+side,[{p:upper.position,r:.072,ws:[[upper.id,1]]},{p:mix(upper.position,lower.position,.55),r:.078,ws:[[upper.id,.45],[lower.id,.55]]},{p:mix(lower.position,wrist.position,.70),r:.088,ws:[[lower.id,.7],[wrist.id,.3]]},{p:wrist.position,r:.082,ws:[[wrist.id,1]]}],[.18,.20,.28],'cloth',16,.006)}
 const head=J(m,'head'),headPts=m.parts[0].positions.reduce((a,x,i)=>{if(i%3===0&&m.parts[0].positions[i+1]>head.position[1]-.08&&m.parts[0].positions[i+1]<head.position[1]+.12)a.push(m.parts[0].positions.slice(i,i+3));return a},[]),rx=Math.max(.055,...headPts.map(v=>Math.abs(v[0]-head.position[0]))),rz=Math.max(.055,...headPts.map(v=>Math.abs(v[2]-head.position[2]))),hatY=head.position[1]+.06;
 const brim=addPart(m,'merchant chaperon brim',[.22,.20,.27],'cloth','headwear');for(let row=0;row<2;row++)for(let k=0;k<=32;k++){const a=tau*k/32,r=1.45-row*.08;push(brim,[head.position[0]+rx*r*Math.cos(a),hatY+row*.018,head.position[2]+rz*r*Math.sin(a)],[[head.id,1]])}grid(brim,2,33);finish(brim,.004);
 ellipsoid(m,'merchant chaperon crown',[head.position[0],hatY+.055,head.position[2]],[rx*1.05,.09,rz*1.04],[[head.id,1]],[.20,.20,.28],'cloth',8,20);
 tube(m,'merchant liripipe',[{p:[head.position[0]+rx*.55,hatY+.055,head.position[2]-.01],r:.035,ws:[[head.id,.75],[hip.id,.25]]},{p:[head.position[0]+rx*.9,hatY-.08,head.position[2]-.025],r:.028,ws:[[head.id,.25],[hip.id,.75]]},{p:[head.position[0]+rx*1.2,hatY-.21,head.position[2]-.02],r:.018,ws:[[hip.id,1]]}],[.20,.20,.28],'cloth',10,.003);
 const bundle=ellipsoid(m,'merchant shoulder goods',[0,head.position[1]-.02,head.position[2]-.15],[.19,.09,.085],[[J(m,'spine01').id,.6],[hip.id,.4]],[.43,.30,.17],'leather',8,20);
 for(const side of ['L','R'])tube(m,'merchant cross-body goods strap '+side,[{p:J(m,'upperarm01.'+side).position,r:.018,ws:[[J(m,'upperarm01.'+side).id,.7],[J(m,'spine01').id,.3]]},{p:[side==='L'?.11:-.11,hip.position[1]+.01,hip.position[2]+.10],r:.018,ws:[[hip.id,.8],[root.id,.2]]}],[.13,.075,.04],'leather',8,.002);
 return {hemY:hem.y,bundle:'rolled shoulder load'};
}
function artisanKit(m){
 const tunic=m.parts.find(p=>p.name==='tunic'),hip=J(m,'spine03'),root=J(m,'root');
 for(const side of ['L','R']){const elbow=J(m,'lowerarm01.'+side),wrist=J(m,'wrist.'+side);tube(m,'rolled linen sleeve cuff '+side,[{p:mix(elbow.position,wrist.position,.72),r:.047,ws:[[elbow.id,.4],[wrist.id,.6]]},{p:mix(elbow.position,wrist.position,.84),r:.049,ws:[[elbow.id,.2],[wrist.id,.8]]},{p:wrist.position,r:.045,ws:[[wrist.id,1]]}],[.62,.52,.36],'cloth',12,.003)}
 const apron=m.parts.find(p=>p.name==='leather work apron');if(apron){for(const side of [-1,1])tube(m,'apron shoulder strap '+side,[{p:[side*.075,hip.position[1]+.27,.07],r:.013,ws:[[J(m,'spine01').id,.6],[hip.id,.4]]},{p:[side*.12,hip.position[1]+.12,.12],r:.013,ws:[[hip.id,1]]}],[.18,.10,.055],'leather',8,.002)}
 const x=hip.position[0]+.12,y=hip.position[1]-.02,z=hip.position[2]+.11;
 tube(m,'wooden mallet handle',[{p:[x,y-.12,z],r:.012,ws:[[hip.id,1]]},{p:[x,y+.025,z],r:.012,ws:[[hip.id,1]]}],[.32,.19,.10],'wood',8,.002);
 tube(m,'iron mallet head',[{p:[x-.045,y+.025,z],r:.023,ws:[[hip.id,1]]},{p:[x+.045,y+.025,z],r:.023,ws:[[hip.id,1]]}],[.29,.30,.27],'metal',8,.003);
 tube(m,'awl handle',[{p:[x-.06,y-.04,z-.025],r:.009,ws:[[hip.id,1]]},{p:[x-.06,y+.035,z-.025],r:.009,ws:[[hip.id,1]]}],[.28,.16,.07],'wood',8,.002);
 return {tools:['wooden mallet','iron mallet head','awl']};
}
function gambesonChannels(m,tunic){
 const tracks=[1,3,6,9,12,15];
 for(let i=0;i<tracks.length;i++){const k=tracks[i],rows=[[2,.12],[2,.42],[2,.74],[3,.08],[3,.36]],stations=rows.map(([r,t])=>{const a=panelAt(tunic,r,t,k),c=mix(tunic.pattern.sections[r].center,tunic.pattern.sections[r+1].center,t);return {p:add(a.v,mul(radial(a.v,c),.012)),r:.008,ws:a.ws}});tube(m,'gambeson tailored quilting channel '+i,stations,[.28,.23,.18],'cloth',8,.002)}
}
function tassets(m){
 for(const side of ['L','R']){const j=J(m,'upperleg01.'+side),root=J(m,'root'),sign=side==='L'?1:-1,c=[j.position[0],j.position[1]+.015,j.position[2]+.075],ws=[[j.id,.78],[root.id,.22]];
  ellipsoid(m,'steel articulated tasset '+side,c,[.083,.115,.027],ws,[.31,.34,.35],'metal',7,14);
  for(const y of [-.075,.075])rivet(m,'tasset brass rivet '+side+' '+y,[c[0],c[1]+y,c[2]+.026],ws,.005,[.55,.36,.14]);
 }
}
function infantryKit(m){
 const tunic=m.parts.find(p=>p.name==='tunic');tunic.color=[.23,.20,.16];tunic.material={kind:'cloth',roughness:.86,metallic:.02};
 const mail=mailCurtain(m,tunic);gambesonChannels(m,tunic);
 // Coat-of-plates: separate curved steel plates under a textile outer
 // silhouette, with actual edge relief and rivet hardware.
 const plates=[];
 for(const [row,t0,t1] of [[2,.12,.38],[2,.50,.76],[2,.84,.98]]){
  for(const [from,to] of [[18,24],[24,30],[2,8],[8,14]]){
   const p=curvedPatch(m,tunic,'brigandine plate '+plates.length,[[row,t0],[row,t1],[3,Math.min(.98,t1+.10)]],from,to,[.32,.35,.36],'metal',.044,.006);plates.push(p.name);
   for(const k of [from+1,to-1])for(const [r,t] of [[row,t0+.02],[3,Math.min(.98,t1+.08)]]){const a=panelAt(tunic,r,t,k),c=mix(tunic.pattern.sections[r].center,tunic.pattern.sections[r+1].center,t);rivet(m,'brigandine copper rivet '+plates.length+' '+k,add(a.v,mul(radial(a.v,c),.05)),a.ws,.005,[.56,.37,.15])}
  }
 }
 for(const side of ['L','R']){const upper=J(m,'upperarm01.'+side),elbow=J(m,'lowerarm01.'+side),wrist=J(m,'wrist.'+side);
  ellipsoid(m,'steel spaulder '+side,upper.position,[.083,.072,.087],[[upper.id,.82],[J(m,'spine01').id,.18]],[.31,.35,.37],'metal',7,14);
  tube(m,'steel vambrace '+side,[{p:mix(elbow.position,wrist.position,.15),r:.052,ws:[[elbow.id,.85],[wrist.id,.15]]},{p:mix(elbow.position,wrist.position,.50),r:.046,ws:[[elbow.id,.5],[wrist.id,.5]]},{p:mix(elbow.position,wrist.position,.90),r:.039,ws:[[elbow.id,.15],[wrist.id,.85]]}],[.31,.35,.37],'metal',14,.004);
  for(let t of [.24,.78])tube(m,'leather vambrace tie '+side+' '+t,[{p:mix(elbow.position,wrist.position,t),r:.049,ws:[[elbow.id,1-t],[wrist.id,t]]},{p:add(mix(elbow.position,wrist.position,t),[.002,.003,.002]),r:.049,ws:[[elbow.id,1-t],[wrist.id,t]]}],[.16,.085,.045],'leather',12,.002);
 }
 bascinet(m);tassets(m);shield(m,false);
 return {mailRings:mail.rings,brigandinePlates:plates.length,armourPeriod:'late 14th century, coat-of-plates with mail and bascinet'};
}
function legionaryKit(m){
 const tunic=m.parts.find(p=>p.name==='tunic');tunic.color=[.48,.095,.055];tunic.material={kind:'cloth',roughness:.84,metallic:0};
 scutumBands(m);imperialHelmet(m);pteruges(m,true);romanCaligae(m);shield(m,true);
 const sword=J(m,'upperleg01.R'),root=J(m,'root');tube(m,'gladius scabbard',[{p:[sword.position[0]-.06,sword.position[1]+.05,sword.position[2]+.04],r:.025,ws:[[sword.id,.8],[root.id,.2]]},{p:[sword.position[0]-.075,sword.position[1]-.30,sword.position[2]+.05],r:.018,ws:[[sword.id,.8],[root.id,.2]]}],[.20,.075,.035],'leather',10,.003);
 tube(m,'gladius hilt',[{p:[sword.position[0]-.06,sword.position[1]+.07,sword.position[2]+.04],r:.012,ws:[[sword.id,1]]},{p:[sword.position[0]-.06,sword.position[1]+.14,sword.position[2]+.04],r:.012,ws:[[sword.id,1]]}],[.28,.20,.12],'wood',8,.002);
 return {loricaBands:7,shield:'curved scutum with hand grip',helmet:'imperial Gallic with cheek guards'};
}
function contacts(m){
 const H=m.spec.morphology.height??1.7,boots=['L','R'].map(side=>{const p=m.parts.find(x=>x.name==='boot '+side),j=J(m,'foot.'+side);if(!p)throw Error('Missing boot '+side);const ys=p.positions.filter((_,i)=>i%3===1),low=Math.min(...ys),ids=Array.from({length:p.positions.length/3},(_,i)=>i).filter(i=>p.positions[i*3+1]<=low+H*.008),center=ids.reduce((a,i)=>a.map((x,k)=>x+p.positions[i*3+k]/ids.length),[0,0,0]);return {joint:j.id,local:sub(center,j.position),groundY:low,phase:side==='L'?0:.5,surfaceContact:true,vertexCount:ids.length}});
 const ground=Math.min(...boots.map(c=>c.groundY));m.contacts=boots.map(c=>({...c,groundY:ground}));m.spec.groundY=ground;m.spec.gaitDuty=.62;m.spec.gaitStride=H*.65;m.spec.swingHeight=.05;
}
function lowPolyTransform(m){
 const hip=J(m,'root').position[1],head=J(m,'head').position,neck=J(m,'neck01').position[1],transform=v=>{let q=v.slice(),top=clamp((v[1]-neck)/.10,0,1),upper=clamp((v[1]-hip)/.35,0,1)*(1-top);q[0]*=1+.14*upper+.10*top;q[1]=v[1]<hip?v[1]*.91:hip*.91+(v[1]-hip)*(1+.04*top);q[2]=head[2]+(v[2]-head[2])*(1+.09*top);return q};
 for(const p of m.parts){for(let i=0;i<p.positions.length;i+=3)p.positions.splice(i,3,...transform(p.positions.slice(i,i+3)));normals(p)}
 for(const j of m.joints){j.position=transform(j.position);j.local=j.parent<0?j.position.slice():sub(j.position,m.joints[j.parent].position)}
 m.spec.style='low-poly';
}
export function produceRoleV9(source,id,identityOverride=null,{style='historical-miniature'}={}){
 if(!roleProfiles[id])throw Error('Unknown role '+id);
 const m=produceRole(source,id,identityOverride,'historical-miniature'),start=performance.now();
 m.parts=m.parts.filter(p=>!['iron breastplate','iron conical helmet','iron nasal','heater shield','iron shield rim','iron shield boss','leather shield forearm strap'].includes(p.name)&&!p.name.startsWith('quilted padded rib'));
 m.spec.artRole=id;m.spec.artRevision='v9';m.spec.miniaturePose='v9';m.spec.motionRevision='v9';m.spec.contactCorrection='path-v9';m.spec.actions=['idle','walk'];
 let role;
 if(id==='artisan')role=artisanKit(m);
 if(id==='merchant')role=merchantKit(m);
 if(id==='infantry')role=infantryKit(m);
 if(id==='legionary')role=legionaryKit(m);
 if(style==='low-poly')lowPolyTransform(m);else m.spec.style='historical-miniature';
 contacts(m);
 m.spec.artHistoricalReference=id==='infantry'?'late-14th-century coat-of-plates, mail and bascinet':id==='legionary'?'2nd-century CE lorica segmentata and scutum':'medieval civilian craft/trade clothing';
 m.spec.provenance=[...m.spec.provenance,{author:'Pocket Works',license:'original',origin:'v0.9 role-specific cut, equipment and material construction'}];
 m.statistics={...m.statistics,triangleCount:m.parts.reduce((n,p)=>n+p.indices.length/3,0),vertices:m.parts.reduce((n,p)=>n+p.positions.length/3,0),roleV9Ms:performance.now()-start};
 m.roleDiagnostics=role;return m;
}
