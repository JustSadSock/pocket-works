import {W,H,HOME} from './apartment.mjs';
import {makeMaterialAtlas} from './textures.mjs';
import {panels} from './doors.mjs';
import {rogueStaticMesh,roguePickupsMesh} from './rogue-scene.mjs';
// Offline WebGL1 geometric interior, atlas-free procedural material maps. Vertex: position/tint/normal/material.
const VS=[
'attribute vec3 position;attribute vec3 tint;attribute vec3 normal;attribute float material;',
'uniform mat4 mvp;uniform mediump float time;varying vec3 p;varying vec3 c;varying vec3 n;varying float mat;',
'void main(){vec3 pos=position;',
'if(material>11.5){pos.x+=.05*sin(time*.9+pos.y*2.0+pos.z*3.0);}',
'p=pos;c=tint;n=normal;mat=material;gl_Position=mvp*vec4(pos,1.0);}'
].join('\n');
const FS=[
'precision mediump float;',
'varying vec3 p;varying vec3 c;varying vec3 n;varying float mat;',
'uniform vec3 eye;uniform vec3 facing;uniform vec3 lampA;uniform vec3 lampB;',
'uniform float torch;uniform mediump float time;uniform float hit;uniform float electrical;',
'uniform sampler2D paintedAtlas;',
'void main(){',
'vec3 norm=normalize(n);',
'vec2 uv=abs(norm.y)>.6?p.xz:(abs(norm.x)>.6?p.zy:p.xy);',
'float idx=clamp(floor(mat+.5)-1.0,0.0,15.0);',
'vec2 tile=vec2(mod(idx,4.0),floor(idx/4.0));',
'vec2 texel=(tile+fract(uv*.24)*.968+.016)/4.0;',
'float pigment=texture2D(paintedAtlas,texel).r;',
'vec3 delta=p-eye;float d=length(delta);',
'vec3 look=normalize(delta+vec3(.0001));',
'float cone=smoothstep(.69,.96,dot(look,normalize(facing)));',
'float beam=torch*cone*(1.0-smoothstep(6.0,23.0,d));',
'float flicker=.965+.018*sin(time*3.7)+.011*sin(time*11.1);',
'float warm=((1.0-smoothstep(1.0,11.0,length(p-lampA)))*.65+',
'(1.0-smoothstep(1.0,10.0,length(p-lampB)))*.42)*flicker;',
'float diffuse=.62+.38*max(dot(norm,normalize(vec3(-.4,.7,-.3))),0.0);',
'warm*=electrical;',
'vec3 color=c*(.57+.54*pigment)*(mix(.095,.30,electrical)+warm+beam*1.70)*diffuse;',
'color+=c*warm*vec3(.16,.10,.02);',
'float mist=smoothstep(14.0,39.0,d);color=mix(color,vec3(.057,.056,.051),mist*.82);',
'color=mix(color,vec3(.65,.15,.11),hit*.24);',
'gl_FragColor=vec4(color,1.0);',
'}'
].join('\n');
const SCALE=1.27;
function shader(gl,type,body){const s=gl.createShader(type);gl.shaderSource(s,body);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function multiply(a,b){const out=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let i=0;i<4;i++)out[col*4+row]+=a[i*4+row]*b[col*4+i];return out}
function projection(fov,asp){const f=1/Math.tan(fov/2),near=.065,far=115;return new Float32Array([f/asp,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0])}
function view(eye,dir){const norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)},z=norm(dir.map(q=>-q)),x=norm([z[2],0,-z[0]]),y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,q,i)=>s+q*eye[i],0),-y.reduce((s,q,i)=>s+q*eye[i],0),-z.reduce((s,q,i)=>s+q*eye[i],0),1])}
function quad(out,a,b,c,d,color,normal,material){for(const v of [a,b,c,a,c,d])out.push(...v,...color,...normal,material)}
function box(out,x,y,z,w,h,d,color,material=6){const a=x-w/2,b=x+w/2,l=y,t=y+h,c=z-d/2,e=z+d/2;
 quad(out,[a,l,c],[b,l,c],[b,t,c],[a,t,c],color,[0,0,-1],material);
 quad(out,[b,l,e],[a,l,e],[a,t,e],[b,t,e],color,[0,0,1],material);
 quad(out,[a,l,e],[a,l,c],[a,t,c],[a,t,e],color,[-1,0,0],material);
 quad(out,[b,l,c],[b,l,e],[b,t,e],[b,t,c],color,[1,0,0],material);
 quad(out,[a,t,c],[b,t,c],[b,t,e],[a,t,e],color,[0,1,0],material);
 quad(out,[a,l,e],[b,l,e],[b,l,c],[a,l,c],color,[0,-1,0],material)}
function round(out,x,y,z,rx,ry,rz,color,material=7){const rings=5,sides=10;for(let j=0;j<rings-1;j++){const a=-Math.PI*.5+Math.PI*j/(rings-1),b=-Math.PI*.5+Math.PI*(j+1)/(rings-1);for(let i=0;i<sides;i++){const u=i*Math.PI*2/sides,v=(i+1)*Math.PI*2/sides,pt=(t,k)=>[x+Math.cos(t)*Math.cos(k)*rx,y+Math.sin(t)*ry,z+Math.cos(t)*Math.sin(k)*rz];quad(out,pt(a,u),pt(a,v),pt(b,v),pt(b,u),color,[Math.cos(a)*Math.cos(u),Math.sin(a),Math.cos(a)*Math.sin(u)],material)}}}
const SCHEME={living:[.46,.37,.28],kitchen:[.45,.49,.42],bedroom:[.36,.34,.38],bathroom:[.59,.63,.58],hall:[.46,.43,.37]};

// Planar projected cast-shadow polygons. Silhouettes are derived from actual prop
// footprints and point-lamp elevation, instead of arbitrary black circles.
function castFloorShadow(out,px,pz,w,d,h,lamp,strength=1){
 if(h<=.05)return;
 const dist=Math.hypot(px-lamp.x,pz-lamp.z);
 if(dist>11||dist<.12)return;
 const y=Math.min(h,2.1),extent=Math.min(2.45,lamp.y/Math.max(.55,lamp.y-y));
 const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
 const footprint=corners.map(([dx,dz])=>[px+dx,.019,pz+dz]);
 const projected=corners.map(([dx,dz])=>[lamp.x+(px+dx-lamp.x)*extent,.020,lamp.z+(pz+dz-lamp.z)*extent]);
 const color=[.075+.013*(1-strength),.069,.061];
 for(let i=0;i<4;i++){
  let j=(i+1)%4;
  quad(out,footprint[i],footprint[j],projected[j],projected[i],color,[0,1,0],11)
 }
}
// Project a tall object's profile onto the nearest plaster wall along a lamp ray.
// This is lightweight geometric contact projection, not a GPU shadow map.
function castWallShadow(out,room,prop,lamp){
 if(prop.h<.5)return;
 const M=SCALE,cx=prop.x*M,cz=prop.z*M,h=Math.min(2.45,prop.h),w=prop.w*M,d=prop.d*M;
 const walls=[
  {axis:'x',plane:(room.x0+1)*M+.027,min:(room.z0+1)*M+.09,max:room.z1*M-.09,n:[1,0,0]},
  {axis:'x',plane:room.x1*M-.027,min:(room.z0+1)*M+.09,max:room.z1*M-.09,n:[-1,0,0]},
  {axis:'z',plane:(room.z0+1)*M+.027,min:(room.x0+1)*M+.09,max:room.x1*M-.09,n:[0,0,1]},
  {axis:'z',plane:room.z1*M-.027,min:(room.x0+1)*M+.09,max:room.x1*M-.09,n:[0,0,-1]}
 ];
 let best=null;
 for(const wall of walls){
  const center=wall.axis==='x'?cx:cz,light=wall.axis==='x'?lamp.x:lamp.z;
  if(Math.abs(center-light)<.12)continue;
  const t=(wall.plane-light)/(center-light);if(t<=1.03||t>3.15)continue;
  const along=wall.axis==='x'?cz:cx,lightAlong=wall.axis==='x'?lamp.z:lamp.x;
  const centerWall=lightAlong+(along-lightAlong)*t;
  if(centerWall<=wall.min+.16||centerWall>=wall.max-.16)continue;
  const top=lamp.y+(h-lamp.y)*t,low=lamp.y+(.2-lamp.y)*t;
  const y0=Math.max(.13,low),y1=Math.min(2.85,top);if(y1-y0<.24)continue;
  const spread=Math.min(.92,(wall.axis==='x'?d:w)*t*.32);
  if(!best||t<best.t)best={wall,centerWall,y0,y1,spread,t}
 }
 if(!best)return;
 const {wall,centerWall,y0,y1,spread}=best;
 const a=Math.max(wall.min,centerWall-spread),b=Math.min(wall.max,centerWall+spread);
 const c=[.155,.132,.104];
 if(wall.axis==='x')quad(out,[wall.plane,y0,a],[wall.plane,y0,b],[wall.plane,y1,b],[wall.plane,y1,a],c,wall.n,11);
 else quad(out,[a,y0,wall.plane],[b,y0,wall.plane],[b,y1,wall.plane],[a,y1,wall.plane],c,wall.n,11)
}
// Familiar things become conspicuously wrong only AFTER a room rearranges unseen.
function memoryDetail(out,world){
 const timber=[.31,.21,.14],paper=[.60,.49,.36],shadow=[.19,.20,.19];
 for(const r of world.rooms){
  if(!world.memoryState(r.type)?.active)continue;
  const p=world.memorySpot(r.type),x=p.x*SCALE,z=p.z*SCALE;
  if(r.type==='bedroom'){
   const wallX=(r.x0+1)*SCALE+.062,wallZ=((r.z0+r.z1)/2)*SCALE;
   box(out,wallX,1.12,wallZ,.055,.78,.62,timber,6);
   box(out,wallX+.035,1.16,wallZ+.06,.025,.57,.45,paper,8);
   box(out,wallX+.06,1.23,wallZ+.09,.012,.12,.25,shadow,9)
  }else if(r.type==='kitchen'){
   for(let i=0;i<3;i++){
    round(out,x+(i-1)*.21,.13,z+.36,.10,.09,.10,[.70,.64,.52],8);
    box(out,x+(i-1)*.21,.24,z+.36,.11,.025,.11,shadow,9)
   }
  }else if(r.type==='bathroom'){
   const x2=(r.x1-1.5)*SCALE,z2=(r.z0+1.2)*SCALE;
   box(out,x2,1.15,z2,.34,.65,.037,shadow,10);
   round(out,x2,1.43,z2+.03,.12,.18,.03,[.31,.29,.27],7)
  }else{
   box(out,x,.58,z+.37,.63,.40,.14,timber,6);
   box(out,x,.69,z+.47,.51,.28,.02,shadow,10);
   box(out,x+.11,.84,z+.49,.14,.05,.016,paper,8)
  }
 }
}

function doorGeometry(out,world){
 const timber=[.32,.19,.105],trim=[.43,.30,.19],glass=[.16,.22,.20],brass=[.67,.49,.22],light=[.69,.64,.52];
 for(const door of world.doors()){
  const leafs=panels(door.gate,door.insideSign,door.angle);
  for(const [i,leaf] of leafs.entries()){
   const X=t=>SCALE*(leaf.a.x+(leaf.b.x-leaf.a.x)*t),Z=t=>SCALE*(leaf.a.z+(leaf.b.z-leaf.a.z)*t);
   const vx=leaf.b.x-leaf.a.x,vz=leaf.b.z-leaf.a.z,ln=Math.hypot(vx,vz)||1;
   const nx=-vz/ln,nz=vx/ln;
   // Each leaf is genuinely hinged, has an inset glass pane and a visible latch.
   const panel=(x0,x1,y0,y1,col,mat,offset=0)=>{
    const a=[X(x0)+nx*offset,y0,Z(x0)+nz*offset],b=[X(x1)+nx*offset,y0,Z(x1)+nz*offset];
    const c=[X(x1)+nx*offset,y1,Z(x1)+nz*offset],d=[X(x0)+nx*offset,y1,Z(x0)+nz*offset];
    quad(out,a,b,c,d,col,[nx,0,nz],mat);
    quad(out,b,a,d,c,col,[-nx,0,-nz],mat)
   };
   panel(0,1,.025,2.74,timber,6);
   panel(.10,.90,.14,1.08,trim,6,.015);
   panel(.15,.85,1.24,2.43,trim,6,.015);
   panel(.21,.79,1.31,2.36,glass,10,.020);
   for(const y of [1.61,1.96])panel(.2,.8,y,y+.035,trim,6,.024);
   panel(.07,.1,.04,2.70,[.22,.13,.09],6,.023);
   panel(.90,.93,.04,2.70,[.23,.14,.08],6,.023);
   round(out,X(.82),1.12,Z(.82),.065,.042,.065,brass,9);
   round(out,X(.82)+nx*.048,1.12,Z(.82)+nz*.048,.03,.03,.030,[.78,.63,.36],9);
   // Door casts a changing silhouette across the linoleum / parquet.
   const cx=(X(0)+X(1))*.5,cz=(Z(0)+Z(1))*.5;
   const lamp=world.point(door.type);
   castFloorShadow(out,cx,cz,Math.max(.11,Math.abs(X(1)-X(0))),Math.max(.11,Math.abs(Z(1)-Z(0))),2.60,
    {x:lamp.x*SCALE,y:2.65,z:lamp.z*SCALE},.85);
  }
 }
}

// Bakelite tabletop radio with tuning needle, ivory dial and woven speaker cloth.
// Its dial follows the actual station in the chapter, not a decorative HUD number.
function familyRadioMesh(out,world){
 const pos=world.radioPosition(),x=pos.x*SCALE,z=pos.z*SCALE-.12;
 const veneer=[.31,.20,.12],black=[.18,.16,.13],ivory=[.69,.61,.47],brass=[.60,.45,.24];
 box(out,x,.835,z,.80,.28,.36,veneer,6);
 box(out,x,1.09,z,.83,.035,.39,[.43,.29,.17],6);
 box(out,x-.19,.894,z+.195,.35,.17,.026,[.37,.32,.23],7);
 for(let i=0;i<6;i++)box(out,x-.33+i*.055,.94,z+.213,.015,.10,.008,[.18,.17,.16],9);
 box(out,x+.18,.89,z+.195,.28,.19,.025,ivory,8);
 box(out,x+.18,.98,z+.215,.23,.025,.016,brass,9);
 const station=world.radio?.channel??0;
 box(out,x+.08+station*.10,.92,z+.224,.014,.10,.020,black,9);
 for(let i=0;i<2;i++)round(out,x+.11+i*.20,.868,z+.23,.047,.043,.040,[.38,.34,.26],9);
 // Bent antenna and two feet, no cyberpunk lighting or screens.
 box(out,x+.34,1.12,z-.08,.012,.39,.013,brass,9);
 box(out,x+.34,1.48,z-.08,.022,.035,.022,ivory,9);
 for(const side of [-1,1])box(out,x+side*.30,.79,z-.06,.07,.06,.12,black,6)
}

function apartmentMesh(world){
 const out=[],M=SCALE,ceil=3.35;
 const tileColor=(x,z)=>{if(world.cell(x,z)===1)return SCHEME.hall;const r=world.rooms.find(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1);return r?SCHEME[r.type]:SCHEME.hall};
 for(let z=0;z<H;z++)for(let x=0;x<W;x++){
  const type=world.cell(x,z),px=x*M,pz=z*M;
  if(type){
   const room=world.rooms.find(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1),floorMat=room?.type==='bathroom'?4:room?.type==='living'||room?.type==='bedroom'?3:5;
   const floorColor=room?.type==='bathroom'?[.51,.55,.52]:room?.type==='bedroom'?[.38,.31,.23]:room?.type==='living'?[.45,.34,.23]:[.42,.37,.29];
   quad(out,[px,0,pz+M],[px+M,0,pz+M],[px+M,0,pz],[px,0,pz],floorColor,[0,1,0],floorMat);
   quad(out,[px,ceil,pz],[px+M,ceil,pz],[px+M,ceil,pz+M],[px,ceil,pz+M],[.49,.46,.40],[0,-1,0],1);
  }else{
   const edges=[[1,0,[1,0,0]],[-1,0,[-1,0,0]],[0,1,[0,0,1]],[0,-1,[0,0,-1]]];
   for(const [dx,dz,n] of edges)if(world.pass(x+dx,z+dz)){
    const c=tileColor(x+dx,z+dz),room=world.rooms.find(r=>x+dx>r.x0&&x+dx<r.x1&&z+dz>r.z0&&z+dz<r.z1);
    let color=room?.type==='bathroom'?[.58,.61,.55]:c,mat=room?.type==='bathroom'?4:room?.type==='living'||room?.type==='bedroom'?2:1;
    if(dx===1)quad(out,[px+M,0,pz+M],[px+M,0,pz],[px+M,ceil,pz],[px+M,ceil,pz+M],color,n,mat);
    if(dx===-1)quad(out,[px,0,pz],[px,0,pz+M],[px,ceil,pz+M],[px,ceil,pz],color,n,mat);
    if(dz===1)quad(out,[px,0,pz+M],[px+M,0,pz+M],[px+M,ceil,pz+M],[px,ceil,pz+M],color,n,mat);
    if(dz===-1)quad(out,[px+M,0,pz],[px,0,pz],[px,ceil,pz],[px+M,ceil,pz],color,n,mat);
    // The skirting and picture rail are geometry, not extra HUD decoration.
    if(dx)for(const h of [.11,2.87])box(out,px+M*(dx===1?1:0),h,pz+M*.5,.065,.09,M,[.22,.19,.15],6);
    else for(const h of [.11,2.87])box(out,px+M*.5,h,pz+M*(dz===1?1:0),M,.09,.065,[.22,.19,.15],6);
   }
  }
 }
 const wood=[.27,.17,.11],brass=[.65,.46,.20],dark=[.12,.13,.12],fabric=[.35,.25,.19],white=[.69,.67,.58];
 for(const f of world.objects()){
  const x=f.x*M,z=f.z*M,w=f.w*M,d=f.d*M,h=f.h;
  if(f.type==='sofa'){box(out,x,.1,z,w,.48,d,fabric,7);
   box(out,x,.55,z-d*.31,w,.75,.30,[.29,.21,.17],7);
   for(const side of [-1,1]){box(out,x+side*(w*.46),.40,z,w*.09,.57,d,[.38,.29,.21],7);
    box(out,x+side*w*.38,.03,z+d*.30,.11,.13,.11,[.19,.15,.12],6)}
   for(let i=0;i<3;i++){const xx=x+(i-1)*w*.29;
    round(out,xx,.59,z+.13,w*.14,.10,d*.34,[.43,.31,.24],7);
    box(out,xx,.66,z+d*.32,w*.24,.02,.027,[.26,.20,.17],7)}
   // A plaid throw, asymmetrically folded on the sofa back.
   box(out,x-w*.24,1.21,z-d*.35,w*.27,.027,d*.25,[.51,.40,.28],7)
  }
  if(f.type==='rug'){box(out,x,.013,z,w,.012,d,[.46,.27,.18],7);
   box(out,x,.025,z,w*.84,.009,d*.78,[.25,.23,.20],7);
   for(let i=-5;i<=5;i++){const xx=x+i*w*.073;
    box(out,xx,.037,z,w*.022,.01,d*.70,[.49,.34,.25],7)}
   for(const side of [-1,1])for(let i=0;i<11;i++)
    box(out,x+(i-5)*w*.079,.018,z+side*d*.495,.027,.012,.20,[.56,.45,.35],7)
  }
  if(f.type==='wallunit'){
   // Polished Soviet living-room wall-unit with glass vitrine and family dishes.
   box(out,x,0,z,w,h,d,[.29,.17,.09],6);
   for(let j=1;j<=4;j++)box(out,x,j*h/5,z+d*.15,w*.94,.045,d*.82,[.44,.28,.15],6);
   for(const side of [-1,1])box(out,x+side*w*.47,.08,z+d*.20,.044,h*.94,d*.92,[.19,.13,.08],6);
   box(out,x,1.13,z+d*.52,w*.82,.66,.035,[.37,.24,.12],6);
   box(out,x,1.18,z+d*.56,w*.64,.47,.032,[.13,.16,.15],10);
   box(out,x,1.20,z+d*.58,w*.61,.42,.01,[.30,.38,.36],10);
   for(const side of [-1,1]){box(out,x+side*w*.34,.98,z+d*.56,.027,.37,.02,[.65,.47,.25],9);
    box(out,x+side*w*.30,1.83,z+d*.54,.019,.30,.025,[.54,.43,.26],9)}
   for(let j=0;j<8;j++)box(out,x-w*.40+j*w*.105,1.61,z+d*.45,w*.075,.22+(j%3)*.10,d*.20,
    [.36+(j%3)*.075,.24+(j%4)*.04,.17+(j%2)*.04],7);
   for(let j=0;j<3;j++){round(out,x+(j-1)*w*.24,2.04,z+d*.50,w*.09,.12,d*.13,[.73,.72,.61],8);
    round(out,x+(j-1)*w*.24,2.16,z+d*.50,w*.06,.035,d*.07,[.77,.75,.66],8)}
  }
  if(f.type==='books'){box(out,x,0,z,w,h,d,wood,6);for(let i=1;i<5;i++)box(out,x,.30+i*.35,z,w,.065,d,[.43,.30,.22],6);for(let i=0;i<17;i++)box(out,x-w*.42+i*w/18,.39+(i%4)*.39,z,w/28,.22+(i%2)*.08,d*.6,[.21+(i%3)*.13,.20+(i%4)*.09,.16+(i%2)*.12],7)}
  if(f.type==='cabinets'){box(out,x,0,z,w,.95,d,[.51,.44,.32],6);box(out,x,1.36,z,w,.76,d,[.31,.26,.18],6);for(const s of [-1,0,1]){box(out,x+s*w*.31,.13,z+d*.51,.035,.55,.015,brass,9);box(out,x+s*w*.31,1.5,z+d*.51,.035,.42,.014,brass,9)}}
  if(f.type==='fridge'){box(out,x,0,z,w,h,d,[.71,.70,.60],8);
   box(out,x,1.30,z+d*.51,w*.94,.035,.021,[.39,.40,.36],9);
   box(out,x+w*.36,.54,z+d*.52,.04,.56,.025,dark,9);
   box(out,x+w*.36,1.63,z+d*.52,.04,.29,.025,dark,9);
   // The fridge is old, not a blank modern monolith: yellowed corners and magnets.
   for(let i=0;i<3;i++)box(out,x-w*.23+i*w*.18,1.12+(i%2)*.22,z+d*.54,.10,.085,.014,[.48+i*.05,.42,.29],8)
  }
  if(f.type==='sink'){box(out,x,.72,z,w,.17,d,[.69,.67,.63],8);box(out,x,.87,z,w*.7,.02,d*.55,[.21,.25,.23],9);box(out,x+w*.2,.9,z-.15,.055,.28,.07,brass,9)}
  if(f.type==='table'||f.type==='desk'){box(out,x,.71,z,w,.11,d,wood,6);if(f.room==='kitchen')box(out,x,.82,z,w*1.03,.018,d*1.04,[.61,.56,.37],2);for(const xx of [-1,1])for(const zz of [-1,1])box(out,x+xx*w*.39,0,z+zz*d*.38,.09,.73,.09,wood,6)}
  if(f.type==='bed'){box(out,x,.32,z,w,.34,d,[.39,.26,.22],6);box(out,x,.65,z,w*.95,.1,d*.86,[.38,.37,.31],7);for(const s of [-1,1])round(out,x+s*w*.24,.78,z-d*.32,w*.20,.11,d*.13,[.68,.61,.51],7);box(out,x,.75,z+d*.19,w*.9,.07,d*.45,[.25,.34,.34],7)}
  if(f.type==='wardrobe'){box(out,x,0,z,w,h,d,[.37,.23,.14],6);
   for(const side of [-1,1]){
    const xx=x+side*w*.25;
    box(out,xx,.16,z+d*.51,w*.44,h*.82,.025,[.45,.27,.15],6);
    box(out,xx,.29,z+d*.532,w*.38,h*.63,.014,[.38,.21,.12],6);
    box(out,x+side*w*.055,1.02,z+d*.57,.026,.24,.038,brass,9)}
   box(out,x,h-.11,z,w*1.06,.12,d*1.07,[.25,.16,.09],6)
  }
  if(f.type==='bath'){box(out,x,.1,z,w,.69,d,[.75,.72,.64],8);box(out,x,.8,z,w*.85,.06,d*.82,[.22,.26,.26],8)}
  if(f.type==='toilet'){round(out,x,.42,z,.29,.23,.32,white,8);box(out,x,.30,z-.28,.50,.42,.23,white,8)}
  if(f.type==='mirror'){box(out,x,.96,z,w,h,d,brass,9);box(out,x,1,z,w*.88,h*.88,d*.8,[.27,.34,.36],10)}
  if(f.type==='lamp'){box(out,x,0,z,.09,1.55,.09,brass,9);round(out,x,1.53,z,.29,.22,.29,[.86,.64,.32],8)}
  if(f.type==='painting'){box(out,x,1.4,z,w,h,d,wood,6);box(out,x,1.47,z,w*.83,h*.78,d*1.1,[.31,.37,.34],7)}
  if(f.type==='doormat'){
   box(out,x,.021,z,w,.018,d,[.36,.24,.19],7);
   for(let i=-4;i<=4;i++)box(out,x+i*w*.087,.038,z,w*.027,.008,d*.82,[.58,.44,.33],7)
  }
  if(f.type==='shoerack'){
   box(out,x,0,z,w,.50,d,[.36,.24,.14],6);
   for(const side of [-1,1])for(let i=0;i<2;i++)round(out,x+side*.09,.13+i*.25,z,.12,.07,.22,[.24+i*.05,.23,.21],7)
  }
  if(f.type==='coatstand'){
   box(out,x,0,z,.11,1.91,.11,[.33,.23,.17],6);
   for(let i=0;i<4;i++){const t=i*Math.PI/2;
    const xx=x+Math.cos(t)*.20,zz=z+Math.sin(t)*.20;
    box(out,xx,1.76,zz,.26,.046,.055,[.29,.20,.15],6)}
   round(out,x,2.01,z,.14,.11,.14,[.38,.24,.15],6)
  }
  if(f.type==='radiator'){
   for(let i=0;i<7;i++)box(out,x,.24,z+(i-3)*d*.14,w*.8,h*.81,d*.080,[.62,.61,.53],9);
   box(out,x,.26,z,.04,.10,d,[.35,.34,.31],9)
  }
  if(f.type==='door'){
   box(out,x,.03,z,w,h,d,[.26,.18,.11],6);
   box(out,x+w*.37,1.30,z+d*.6,.14,.08,.09,brass,9);
   box(out,x,2.72,z,w*.92,.07,.06,[.41,.32,.19],6);
   // Actual brass peephole fitted through the Soviet front door, at eye-height.
   round(out,x,1.63,z-d*.62,.090,.085,.022,[.67,.48,.23],9);
   round(out,x,1.63,z-d*.65,.050,.049,.026,[.16,.18,.16],10);
   round(out,x,1.63,z-d*.68,.018,.018,.010,[.36,.46,.43],10);
   // Bakelite bell button and scratched enamel apartment number plate.
   box(out,x+w*.57,1.34,z-d*.47,.19,.20,.05,[.34,.30,.27],9);
   round(out,x+w*.57,1.43,z-d*.52,.041,.045,.018,[.55,.50,.35],8);
   box(out,x,2.30,z-d*.55,.33,.14,.025,[.73,.67,.48],8)
  }
 }
 apartmentDetail(out,world,M);
 familyRadioMesh(out,world);
 for(const prop of world.objects()){const room=world.room(prop.room);
  if(room&&prop.solid){const lamp=world.point(prop.room);
   castWallShadow(out,room,prop,{x:lamp.x*M,z:lamp.z*M,y:2.68})}
 }
 memoryDetail(out,world);
 // Physically projected static shadows underneath furniture, recomputed on room changes.
 const shadowLamps=world.rooms.map(r=>({room:r.type,p:world.point(r.type)}));
 for(const f of world.objects()){if(!f.solid||f.h<.3||f.type==='door')continue;
  const lamp=shadowLamps.find(p=>p.room===f.room)?.p||world.point('living');
  castFloorShadow(out,f.x*M,f.z*M,f.w*M,f.d*M,f.h,{x:lamp.x*M,z:lamp.z*M,y:2.66},.8)
 }
 for(const r of world.rooms){const x=(r.x0+r.x1+1)*M*.5,z=(r.z0+r.z1+1)*M*.5;box(out,x,ceil-.17,z,1.25,.18,1.25,[.48,.43,.32],8);round(out,x,ceil-.32,z,.34,.15,.34,[.83,.63,.40],8)}
 for(const z of [5,12,19]){box(out,15.5*M,ceil-.11,z*M,1.1,.16,1.1,[.42,.38,.28],8);round(out,15.5*M,ceil-.29,z*M,.30,.13,.30,[.81,.66,.42],8)}
 return out
}

// The static room identity is legible without a texture download: door casings,
// cornices, paintings, dishes, a wall clock, windows and uneven lived-in objects.
function apartmentDetail(out,world,M){
 const timber=[.41,.29,.19],ivory=[.69,.64,.52],metal=[.59,.49,.31],linen=[.46,.42,.32],glass=[.21,.31,.32];
 for(const r of world.rooms){
  const port=world.door(r),z=(port.z+.5)*M,left=(port.x-.055)*M,right=(port.x+2.055)*M;
  box(out,left,0,z,.095,2.99,.19,timber,6);
  box(out,right,0,z,.095,2.99,.19,timber,6);
  box(out,(left+right)/2,2.88,z,right-left+.18,.14,.24,[.55,.41,.27],6);
  box(out,(left+right)/2,3.03,z,right-left+.32,.05,.31,[.30,.20,.13],6);
  for(const x of [left+.12,right-.12])box(out,x,.95,z,.027,.30,.05,metal,9);
  const centralX=((r.x0+r.x1+1)/2)*M;
  const topZ=(r.z0+1)*M+.02;
  // Recessed apartment window and dense curtains are visual surfaces, not portals.
  const ww=Math.min(2.15,(r.x1-r.x0-4)*M*.5);
  box(out,centralX,1.17,topZ,ww,1.43,.055,[.39,.29,.21],6);
  box(out,centralX,1.24,topZ+.04,ww*.87,1.22,.018,glass,10);
  box(out,centralX,1.18,topZ+.055,.06,1.22,.075,ivory,8);
  box(out,centralX,1.83,topZ+.05,ww*.9,.055,.08,ivory,8);
  box(out,centralX,1.02,topZ+.12,ww+.18,.08,.31,[.35,.24,.15],6);
  box(out,centralX,1.98,topZ+.10,ww+0.35,.035,.035,metal,9);
  // Loose curtains respond to room airflow in the vertex shader.
  for(const side of [-1,1]){
   box(out,centralX+side*ww*.41,1.08,topZ+.14,ww*.20,1.6,.08,[.42,.35,.31],12);
   box(out,centralX+side*ww*.33,1.14,topZ+.17,.06,1.47,.085,[.58,.48,.40],12)
  }
  if(r.type==='living'){
   // Pile carpet on a side wall, its geometry flush with the wall and no fake collider.
   const carpetX=(r.x0+1)*M+.023,carpetZ=((r.z0+r.z1)/2)*M;
   box(out,carpetX,1.10,carpetZ,.036,1.55,2.55,[.50,.23,.15],7);
   box(out,carpetX+.018,1.13,carpetZ,.025,1.26,2.30,[.26,.17,.19],7);
   for(let k=-3;k<=3;k++)for(let j=-1;j<=1;j++){
    let zz=carpetZ+k*.28,yy=1.12+j*.34;
    box(out,carpetX+.038,yy,zz,.014,.16,.16,[.62,.37,.22],7)
   }
   // An old grandfather clock with a working, not decorative, face.
   const cx=(r.x1-1.7)*M,cz=(r.z1-1.4)*M;
   box(out,cx,0,cz,.55,1.95,.45,timber,6);box(out,cx,1.48,cz+.246,.38,.39,.016,[.70,.63,.45],8);
   round(out,cx,1.67,cz+.268,.17,.17,.016,[.75,.69,.56],8);
   // Clock hands live in the dynamic mesh, and tick while the player explores.
   round(out,cx,.69,cz+.27,.12,.19,.012,metal,9);
   const table=world.objects().find(f=>f.room==='living'&&f.type==='table');
   if(table){const x=table.x*M,z=table.z*M;box(out,x,.78,z,.25,.045,.23,[.70,.63,.50],8);round(out,x,.86,z,.075,.07,.07,[.47,.42,.33],8)}
  }else if(r.type==='kitchen'){
   const obj=world.objects().find(f=>f.room==='kitchen'&&f.type==='table');
   if(obj){const x=obj.x*M,z=obj.z*M;
    for(let k=0;k<3;k++){round(out,x+(.34*k-.34),.86,z-.09,.11,.07,.11,[.69,.66,.53],8);
     round(out,x+(.34*k-.34),.925,z-.09,.072,.03,.072,[.44,.40,.31],8)}
    box(out,x+.43,.84,z+.23,.14,.25,.14,[.45,.48,.34],8);
    // Enamel teapot and Soviet oilcloth table.
    round(out,x-.26,.91,z+.18,.17,.14,.15,[.70,.68,.58],8);
    round(out,x-.26,1.045,z+.18,.105,.035,.105,[.54,.51,.44],9);
    box(out,x-.26,1.15,z+.18,.025,.16,.022,[.26,.25,.23],9)
   }
  }else if(r.type==='bedroom'){
   const rX=(r.x1-2.0)*M,rZ=(r.z0+2.1)*M;
   box(out,rX,.57,rZ,.61,.10,.42,[.50,.32,.21],6);
   box(out,rX,.73,rZ,.55,.055,.30,[.64,.59,.47],8);
   box(out,rX,1.1,rZ,.09,.6,.1,[.30,.28,.27],9);
   round(out,rX,1.40,rZ,.25,.13,.24,[.65,.60,.46],8);
  }else if(r.type==='bathroom'){
   const x=(r.x0+3)*M,z=(r.z1-1.45)*M;
   for(let k=0;k<3;k++)round(out,x+.23*k,.65,z,.065,.15,.065,[.54+k*.06,.60,.55],8);
   box(out,x+.25,.44,z-.25,.47,.055,.25,[.47,.49,.45],9);
  }
 }
 // Never physically obstruct the exit; the frame is attached to existing wall cells.
 const x=15.5*M,z=21*M;
 box(out,x-1.33,0,z,.10,3.11,.22,timber,6);
 box(out,x+1.33,0,z,.10,3.11,.22,timber,6);
 box(out,x,3.03,z,2.76,.13,.29,timber,6);
}


// The 1970s metal breaker board is mounted on hallway plaster; an old hotplate
// on the kitchen table has a distinct red on-state and a physically visible plug.
function electricalProps(out,world,time){
 const f=world.fusePosition(),x=(f.x-.065)*SCALE,z=f.z*SCALE;
 const iron=[.44,.43,.38],ceramic=[.78,.74,.62],brass=[.57,.47,.32],dark=[.21,.20,.18];
 box(out,x,1.06,z,.095,.86,.75,iron,9);
 box(out,x+.062,1.14,z,.035,.72,.60,ceramic,8);
 for(let k=0;k<3;k++){
  const zz=z+(k-1)*.17,up=world.powerAvailable();
  box(out,x+.091,1.42,zz,.059,.22,.12,[.31,.30,.27],9);
  box(out,x+.139,up?1.56:1.33,zz,.11,.085,.062,brass,9);
  box(out,x+.103,.94,zz,.018,.035,.07,dark,9)
 }
 const plate=world.platePosition(),px=plate.x*SCALE,pz=plate.z*SCALE;
 box(out,px,.83,pz,.52,.105,.47,[.61,.57,.47],8);
 round(out,px,.95,pz,.155,.014,.145,dark,9);
 for(const q of [-1,1])box(out,px+q*.17,.96,pz+.19,.045,.06,.035,brass,9);
 // Outlet and cable to the wall; amber lamp vanishes when unplugged or blackout.
 const live=world.powerAvailable()&&!world.power.unplugged;
 box(out,px+.22,.96,pz-.15,.045,.085,.06,live?[.72,.30,.11]:dark,live?8:9);
 if(!world.power.unplugged){box(out,px-.24,.89,pz-.22,.012,.06,.24,dark,9)}
 else{box(out,px+.40,.85,pz+.19,.12,.05,.065,dark,9)}
 const kettle=world.objects().find(o=>o.type==='table'&&o.room==='kitchen');
 if(kettle){
  round(out,px,.98,pz,.12,.095,.115,[.70,.65,.55],8);
  box(out,px,1.075,pz,.025,.08,.025,brass,9)
 }
}

function clockHands(out,world,time){
 const r=world.room('living');if(!r)return;
 const x=(r.x1-1.7)*SCALE,y=1.67,z=(r.z1-1.4)*SCALE+.293;
 const hand=(angle,length,width,color)=>{
  const dx=Math.sin(angle)*length,dy=Math.cos(angle)*length,nx=-Math.cos(angle)*width,ny=Math.sin(angle)*width;
  quad(out,[x+nx,y+ny,z],[x+dx+nx,y+dy+ny,z],[x+dx-nx,y+dy-ny,z],[x-nx,y-ny,z],color,[0,0,1],9)
 };
 hand(time*.14,.14,.011,[.21,.19,.15]);
 hand(time*.008,.095,.014,[.34,.23,.14]);
 round(out,x,y,z+.009,.025,.028,.01,[.53,.40,.22],9)
}

function relicMesh(out,item,time){const x=item.x*SCALE,z=item.z*SCALE,h=.55+.09*Math.sin(time*2);
 box(out,x,.015,z,.55,.015,.55,[.39,.30,.21],9);
 if(item.id==='album'){box(out,x,h,z,.60,.085,.46,[.43,.23,.17],7);box(out,x,h+.065,z,.50,.012,.42,[.68,.61,.48],8)}
 if(item.id==='photo'){box(out,x,h,z,.48,.075,.59,[.60,.47,.28],6);box(out,x,h+.066,z,.36,.012,.47,[.78,.71,.58],8)}
 if(item.id==='keys'){round(out,x,h+.04,z,.20,.035,.20,[.79,.57,.23],9);box(out,x+.23,h,z,.34,.09,.05,[.77,.58,.29],9)}
 if(item.id==='pills'){round(out,x,h,z,.17,.21,.17,[.70,.62,.50],8);box(out,x,h+.22,z,.33,.07,.33,[.65,.27,.15],9)}
}
function phantom(out,e,t){
 const x=e.x*SCALE,z=e.z*SCALE,visible=1-Math.min(1,Math.max(0,(e.age-23)/7)),coat=e.kind==='coat';
 const breath=.035*Math.sin(t*1.2+e.x*2),limp=.17*Math.sin(t*1.4+e.z);
 const clarity=Math.min(1,Math.max(0,(e.hit||0)*1.5));
 const blend=(a,b)=>a.map((v,i)=>v+(b[i]-v)*clarity);
 const coatCloth=blend(coat?[.16,.17,.16]:[.27,.25,.23],[.46,.37,.28]),
  shadow=blend([.27,.25,.23],[.49,.42,.35]),pale=blend([.45,.43,.39],[.60,.52,.43]);
 // The familiar Soviet coat stand briefly comes into focus in the torch beam.
 if(coat&&e.hit>.38){
  box(out,x,.02,z,.11,1.98,.11,[.30,.21,.14],6);
  round(out,x,.12,z,.31,.06,.28,[.36,.25,.17],6);
  for(const side of [-1,1]){
   box(out,x+side*.23,1.60,z,.46,.07,.07,[.38,.26,.17],6);
   round(out,x+side*.30,1.08,z,.20,.62,.22,coatCloth,7);
  }
  round(out,x,1.95,z,.27,.14,.25,coatCloth,7);
  return
 }
 if(!coat&&e.hit>.70){
  // A bathrobe hanging from a chair is momentarily mistaken for a standing person.
  box(out,x,.05,z,.70,.86,.45,[.31,.23,.17],6);
  round(out,x,.95,z,.48,.65,.27,coatCloth,7);
  box(out,x,1.30,z-.15,.11,.40,.07,[.37,.26,.18],6);
  return
 }
 // Layered tailored coat and asymmetrical shoulders, rather than a group of cubes.
 round(out,x,.85+breath,z,.43,.72,.32,coatCloth,7);
 round(out,x,1.36+breath,z,.51,.31,.28,coatCloth,7);
 box(out,x,.45,z,.78,.50,.52,coatCloth,7);
 for(const side of [-1,1]){
  const sx=x+side*.44,armSwing=Math.sin(t*1.7+e.x)*.09*side;
  round(out,sx,1.00+breath+armSwing,z+.03,.16,.50,.19,coatCloth,7);
  round(out,sx+side*.018,.52+breath,z+.02,.11,.19,.12,coat?[.40,.38,.33]:pale,8);
  round(out,x+side*.18,.32,z+side*.02,.19,.35,.20,shadow,7);
  box(out,x+side*.19,0,z-.025,.26,.14,.43,[.19,.19,.17],6);
 }
 round(out,x,.18,z,.40,.15,.31,coatCloth,7);
 const headX=x+limp*.20,headZ=z-.035;
 round(out,headX,1.95+breath,headZ,.255,.315,.24,coat?[.26,.26,.24]:pale,8);
 if(coat){
  round(out,headX,2.19+breath,headZ,.31,.17,.28,coatCloth,7);
  round(out,headX,1.95+breath,headZ-.12,.20,.21,.11,[.18,.19,.18],7);
  box(out,headX,2.14+breath,headZ-.27,.62,.07,.17,coatCloth,7);
 }else{
  round(out,headX,2.12+breath,headZ+.06,.27,.15,.25,[.22,.21,.19],7);
  // Lifeless eyes are shaded recesses, not red glowing indicators.
  for(const side of [-1,1]){
   round(out,headX+side*.096,1.99+breath,headZ-.235,.040,.023,.019,[.17,.17,.17],9);
   round(out,headX+side*.095,1.965+breath,headZ-.246,.014,.012,.012,[.50,.46,.41],8);
  }
  box(out,headX,1.84+breath,headZ-.244,.12,.020,.014,[.24,.23,.22],9);
 }
}
function pistolMesh(){
 const o=[],steel=[.31,.32,.31],blue=[.18,.23,.24],wood=[.38,.23,.16],skin=[.57,.41,.31],shirt=[.33,.34,.30],brass=[.57,.48,.30];
 // Sleeve, wrist, palm and knuckles. The worn revolver stays in the lower right.
 round(o,.49,-1.14,-1.12,.29,.38,.32,shirt,7);
 round(o,.49,-.91,-1.28,.205,.22,.19,skin,8);
 round(o,.46,-.74,-1.42,.12,.18,.19,skin,8);
 for(let k=0;k<3;k++)round(o,.42+k*.065,-.71,-1.57,.045,.12,.095,skin,8);
 box(o,.51,-.88,-1.46,.215,.48,.23,wood,6);
 box(o,.51,-.91,-1.58,.22,.09,.22,[.23,.24,.24],9);
 box(o,.50,-.56,-1.61,.245,.19,.55,steel,9);
 round(o,.50,-.605,-1.53,.178,.165,.17,blue,9); // revolving drum
 for(let k=0;k<6;k++){let a=k*Math.PI/3;round(o,.50+Math.cos(a)*.109,-.605+Math.sin(a)*.102,-1.61,.020,.021,.020,brass,9)}
 box(o,.50,-.53,-1.87,.125,.115,.48,blue,9);
 box(o,.50,-.44,-1.47,.115,.038,.13,[.52,.50,.43],9);
 box(o,.50,-.705,-1.43,.14,.031,.24,[.17,.19,.18],9);
 round(o,.50,-.77,-1.42,.042,.055,.045,[.19,.20,.19],9);
 box(o,.50,-.48,-2.10,.055,.039,.042,brass,9); // front sight
 return o
}
export function animateViewmodel(original,{time=0,recoil=0,reload=0,movement=0,reduceMotion=false}={}){
 const out=original.slice(),step=10,sway=reduceMotion?0:Math.sin(time*7)*.009*Math.min(1,movement);
 const pull=Math.max(0,Math.min(1,recoil));
 const lower=reload>0? Math.sin(Math.PI*Math.max(0,Math.min(1,reload)))*.33:0;
 // Held object rotation around wrist is coherent with arm, not a screen shake.
 const angle=reload>0?-.57*Math.sin(Math.PI*Math.max(0,Math.min(1,reload))):pull*.23;
 const cos=Math.cos(angle),sin=Math.sin(angle);
 for(let i=0;i<out.length;i+=step){
  const x=original[i]-.49,y=original[i+1]+1.1;
  out[i]=.49+x*cos-y*sin+sway;
  out[i+1]=-1.1+x*sin+y*cos-lower+pull*.13;
  out[i+2]=original[i+2]+pull*.17+(reduceMotion?0:Math.cos(time*5)*.008*Math.min(1,movement));
 }
 return out
}

// A small actual 3D Soviet stairwell. Rendered only from the physical door's
// peephole, never pretending a static picture is navigable gameplay.
function stairwellMesh(recognized=false){
 const o=[],plaster=[.40,.43,.35],peeling=[.52,.52,.39],floor=[.27,.29,.26],steel=[.31,.34,.33],wood=[.30,.33,.23],ivory=[.58,.54,.42];
 // narrow landing and cracked pale-green oil paint up to waist height
 box(o,0,-.08,-2.0,4.8,.12,9.8,floor,4);
 box(o,-2.27,0,-2.0,.15,3.45,9.8,plaster,1);
 box(o,2.27,0,-2.0,.15,3.45,9.8,plaster,1);
 box(o,0,0,-6.8,4.7,3.45,.17,plaster,1);
 for(const side of [-1,1]){
  box(o,side*2.17,0,-2.0,.025,1.36,9.7,[.36,.43,.34],2);
  box(o,side*2.15,1.34,-2,.06,.055,9.7,[.42,.43,.35],6)
 }
 for(let j=0;j<8;j++){
  const z=-6.1+j*1.0;
  box(o,0,.015,z,4.45,.012,.038,[.20,.23,.22],4);
  if(j%3===0)box(o,(j%2?1:-1)*1.85,.013,z+.27,.28,.010,.30,[.45,.42,.32],4)
 }
 // worn timber door opposite with mail slots and worn brass, NOT a traversable portal
 box(o,1.01,0,-6.66,1.67,2.75,.095,wood,6);
 box(o,1.02,.18,-6.59,1.47,2.25,.031,[.32,.38,.29],6);
 box(o,1.02,.34,-6.55,1.31,.85,.018,[.28,.32,.25],6);
 box(o,1.02,1.34,-6.55,1.31,.94,.019,[.28,.33,.26],6);
 box(o,1.65,1.12,-6.48,.06,.13,.07,[.67,.55,.29],9);
 box(o,.92,2.33,-6.50,.35,.20,.017,ivory,8);
 // metal lift shaft with analog call button and weathered plate
 box(o,-1.05,0,-6.69,1.72,2.79,.081,[.37,.40,.37],9);
 box(o,-1.05,.07,-6.61,1.55,2.61,.020,[.34,.38,.37],9);
 box(o,-1.05,0,-6.58,.045,2.7,.025,[.17,.20,.20],9);
 box(o,-.18,1.38,-6.55,.14,.31,.085,[.52,.49,.35],9);
 round(o,-.18,1.55,-6.49,.045,.045,.035,recognized?[.76,.65,.38]:[.46,.45,.39],8);
 // separate chipped paint panels and abandoned notice board
 box(o,-2.18,1.25,-2.50,.036,.89,1.1,[.42,.28,.18],6);
 box(o,-2.145,1.32,-2.50,.038,.69,.93,[.67,.61,.48],8);
 for(let i=0;i<4;i++)box(o,-2.11,1.46,-2.72+i*.13,.018,.026,.1,[.36,.32,.25],9);
 // open staircase: each riser has actual depth/height
 for(let j=0;j<5;j++){
  const z=-4.65+j*.39,x=-1.95+j*.075;
  box(o,x,.04+j*.17,z,.47,.17,.41,[.38,.39,.35],4);
 }
 // rusted metal handrail
 for(let k=0;k<4;k++){const z=-3.3+k*.42;box(o,-1.62,.04,z,.055,.88,.06,steel,9)}
 box(o,-1.62,.95,-2.65,.045,.05,2.18,[.43,.39,.30],9);
 // Grocery net (авоська) left by a neighbor: player recognizes its context.
 box(o,.48,.70,-5.67,.39,.43,.10,[.44,.37,.28],7);
 for(let i=-2;i<=2;i++){box(o,.48+i*.071,.71,-5.59,.010,.42,.010,[.69,.61,.43],7)}
 for(let j=0;j<4;j++){box(o,.48,.74+j*.105,-5.58,.40,.009,.018,[.69,.61,.43],7)}
 round(o,.48,1.22,-5.64,.13,.20,.024,[.62,.54,.39],7);
 if(recognized){round(o,.39,.79,-5.55,.10,.10,.075,[.40,.48,.28],7)}
 // landings are not lit by the apartment's fuse: separate dim shared lamp
 box(o,0,3.16,-3.15,.62,.10,.40,[.49,.49,.38],8);
 round(o,0,3.08,-3.15,.19,.10,.19,[.61,.54,.34],8);
 return o
}

export class Renderer{
 constructor(canvas){
  this.canvas=canvas;const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});if(!gl)throw Error('WebGL unavailable');
  this.gl=gl;const program=gl.createProgram();gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  this.program=program;gl.useProgram(program);this.attrs=['position','tint','normal','material'].map(name=>{const l=gl.getAttribLocation(program,name);if(l>=0)gl.enableVertexAttribArray(l);return l});
  this.u=Object.fromEntries(['mvp','eye','facing','lampA','lampB','torch','time','hit','paintedAtlas','electrical'].map(x=>[x,gl.getUniformLocation(program,x)]));
  const atlas=makeMaterialAtlas(1701);this.texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,atlas.width,atlas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,atlas.pixels);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.uniform1i(this.u.paintedAtlas,0);this.textureBytes=atlas.pixels.byteLength;
  this.staticBuffer=gl.createBuffer();this.dynamicBuffer=gl.createBuffer();this.weaponBuffer=gl.createBuffer();this.landingBuffer=gl.createBuffer();this.landingVersion=-1;this.landingCount=0;this.weapon=pistolMesh();this.staticRevision=-1;this.staticCount=0;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true});this.lost=false
 }

 drawPeephole(landing,t,powered=true){
  if(this.lost)return;
  this.resize();const gl=this.gl;
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
  gl.clearColor(.025,.028,.026,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const recognized=Boolean(landing?.recognized);
  if(this.landingVersion!==Number(recognized)){
   const mesh=stairwellMesh(recognized);
   this.upload(this.landingBuffer,mesh,gl.STATIC_DRAW);
   this.landingCount=mesh.length/10;this.landingVersion=Number(recognized)
  }
  const eye=[0,1.60,1.25],dir=[0,-.04,-1];
  const proj=projection(Math.PI*.43,this.canvas.width/this.canvas.height);
  gl.uniformMatrix4fv(this.u.mvp,false,multiply(proj,view(eye,dir)));
  gl.uniform3fv(this.u.eye,eye);gl.uniform3fv(this.u.facing,dir);
  gl.uniform3fv(this.u.lampA,[-1.55,2.4,-2.9]);gl.uniform3fv(this.u.lampB,[0,3.05,-4.1]);
  gl.uniform1f(this.u.torch,0);gl.uniform1f(this.u.time,t);gl.uniform1f(this.u.hit,0);
  // Communal landing has its own light, even if the flat's electricity is out.
  gl.uniform1f(this.u.electrical,.36);
  this.bind(this.landingBuffer);gl.drawArrays(gl.TRIANGLES,0,this.landingCount)
 }

 bind(buffer){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(let i=0;i<4;i++)if(this.attrs[i]>=0)gl.vertexAttribPointer(this.attrs[i],i===3?1:3,gl.FLOAT,false,40,[0,12,24,36][i])}
 upload(buffer,values,kind){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),kind)}
 resize(){const gl=this.gl,rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,rect.width<650?1.3:1.6),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h)}}
 draw(world,player,enemies,items,flash,t,damage=0,shot=0,reload=0){
  if(this.lost)return;this.resize();const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.clearColor(.045,.044,.040,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
  const rogue=world.endless===true;
  const meshKey=rogue?'rogue:'+world.terrainRevision+':'+Math.floor(player.x/5)+':'+Math.floor(player.z/5):world.terrainRevision;
  if(this.staticRevision!==meshKey){const mesh=rogue?rogueStaticMesh(world,player):apartmentMesh(world);
   this.upload(this.staticBuffer,mesh,gl.STATIC_DRAW);this.staticCount=mesh.length/10;this.staticRevision=meshKey}
  const eye=[player.x*SCALE,1.54+(player.bob||0),player.z*SCALE],dir=[Math.sin(player.yaw)*Math.cos(player.pitch),-Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)];
  const proj=projection(Math.PI*.50,this.canvas.width/this.canvas.height),mvp=multiply(proj,view(eye,dir));
  const lampA=rogue?{x:Math.floor(player.x/18)*18+4.5,z:Math.floor(player.z/18)*18+4.5}:world.point('living'),
   lampB=rogue?{x:Math.floor(player.x/18)*18+13.5,z:Math.floor(player.z/18)*18+13.5}:world.point('kitchen');
  gl.uniformMatrix4fv(this.u.mvp,false,mvp);gl.uniform3fv(this.u.eye,eye);gl.uniform3fv(this.u.facing,dir);
  gl.uniform3fv(this.u.lampA,[lampA.x*SCALE,2.64,lampA.z*SCALE]);gl.uniform3fv(this.u.lampB,[lampB.x*SCALE,2.64,lampB.z*SCALE]);
  gl.uniform1f(this.u.torch,flash?1:0);gl.uniform1f(this.u.time,t);gl.uniform1f(this.u.hit,damage);gl.uniform1f(this.u.electrical,rogue?1:world.powerAvailable()?1:0);
  this.bind(this.staticBuffer);gl.drawArrays(gl.TRIANGLES,0,this.staticCount);
  const dyn=[];
  if(rogue)roguePickupsMesh(dyn,items,t);
  else {doorGeometry(dyn,world);electricalProps(dyn,world,t);clockHands(dyn,world,t);for(const item of items)relicMesh(dyn,item,t);}
  for(const e of enemies){
   const d=Math.hypot(e.x-player.x,e.z-player.z);
   if(d<14&&flash)castFloorShadow(dyn,e.x*SCALE,e.z*SCALE,.58,.35,1.50,
    {x:player.x*SCALE,y:1.65,z:player.z*SCALE},.85);
   phantom(dyn,e,t)
  }
  if(dyn.length){this.upload(this.dynamicBuffer,dyn,gl.DYNAMIC_DRAW);this.bind(this.dynamicBuffer);gl.drawArrays(gl.TRIANGLES,0,dyn.length/10)}
  // Proper viewmodel at the lower right: no world-space cyan marker below the camera.
  const gun=animateViewmodel(this.weapon,{time:t,recoil:shot,reload,movement:player.movement||0,reduceMotion:player.reduceMotion||false});
  if(gun.length){gl.clear(gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.u.mvp,false,proj);gl.uniform3fv(this.u.eye,[0,0,0]);gl.uniform3fv(this.u.facing,[0,0,-1]);gl.uniform3fv(this.u.lampA,[0,0,-.6]);gl.uniform3fv(this.u.lampB,[1,-.1,-1]);gl.uniform1f(this.u.torch,shot>0?.5:1);gl.uniform1f(this.u.hit,Math.max(damage,shot*.6));gl.uniform1f(this.u.electrical,1);this.upload(this.weaponBuffer,gun,gl.DYNAMIC_DRAW);this.bind(this.weaponBuffer);gl.drawArrays(gl.TRIANGLES,0,gun.length/10)}
 }
}
