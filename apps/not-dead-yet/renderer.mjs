import {W,H,HOME} from './apartment.mjs';
// Offline WebGL1 geometric interior, atlas-free procedural material maps. Vertex: position/tint/normal/material.
const VS=[
'attribute vec3 position;attribute vec3 tint;attribute vec3 normal;attribute float material;',
'uniform mat4 mvp;varying vec3 p;varying vec3 c;varying vec3 n;varying float mat;',
'void main(){p=position;c=tint;n=normal;mat=material;gl_Position=mvp*vec4(position,1.0);}'
].join('\n');
const FS=[
'precision mediump float;',
'varying vec3 p;varying vec3 c;varying vec3 n;varying float mat;',
'uniform vec3 eye;uniform vec3 facing;uniform vec3 lampA;uniform vec3 lampB;',
'uniform float torch;uniform float time;uniform float hit;',
'float hash21(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}',
'float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}',
'void main(){',
'vec3 norm=normalize(n);vec2 uv=abs(norm.y)>.6?p.xz:(abs(norm.x)>.6?p.zy:p.xy);',
'float grain=noise(uv*10.0)*.3+noise(uv*34.0)*.12;',
'float textureV=.88+grain;',
'if(mat<1.5){',
'float seam=step(.962,fract(uv.x*1.8))*.22;float scratches=noise(vec2(uv.x*4.0,uv.y*18.0));',
'textureV=.75+.25*noise(uv*3.0)+grain*.23-seam+scratches*.055;',
'}else if(mat<2.5){',
'float stripe=sin(uv.x*17.0)*.06;float flowers=noise(floor(uv*6.0))*.18;',
'textureV=.80+grain*.65+stripe-flowers*.28;',
'}else if(mat<3.5){',
'vec2 plank=vec2(uv.x*2.4,uv.y*1.3);float edges=step(.957,fract(plank.x))* .28+step(.977,fract(plank.y))* .25;',
'textureV=.82+sin(uv.x*46.0+noise(uv*2.0)*9.0)*.07+noise(uv*9.0)*.1-edges;',
'}else if(mat<4.5){',
'float grout=max(step(.956,fract(uv.x*1.35)),step(.956,fract(uv.y*1.35)));',
'textureV=.93-grout*.35+noise(uv*12.0)*.08;',
'}else if(mat<5.5){',
'textureV=.86+noise(uv*8.0)*.12+sin(uv.y*13.0)*.035;',
'}else if(mat<6.5){',
'textureV=.81+sin(uv.x*34.0+noise(uv*1.5)*10.0)*.09+noise(uv*15.0)*.1;',
'}else if(mat<7.5){',
'textureV=.82+noise(uv*28.0)*.2+noise(uv*75.0)*.11;',
'}else if(mat<8.5){textureV=.88+noise(uv*21.0)*.1;',
'}else if(mat<9.5){textureV=.68+.18*pow(max(dot(norm,normalize(vec3(-.2,.9,.5))),0.0),5.0)+noise(uv*21.0)*.06;',
'}else if(mat<10.5){textureV=.74+noise(uv*11.0)*.11;',
'}else{textureV=.86+noise(uv*9.0)*.13;}',
'vec3 delta=p-eye;float d=length(delta);vec3 direction=normalize(delta+vec3(.0001));',
'float cone=smoothstep(.65,.96,dot(direction,normalize(facing)));',
'float beam=torch*cone*(1.0-smoothstep(6.0,24.0,d));',
'float warm=(1.0-smoothstep(1.0,12.0,length(p-lampA)))*.65+',
'(1.0-smoothstep(1.0,10.0,length(p-lampB)))*.42;',
'float diffuse=.64+.36*max(dot(norm,normalize(vec3(-.4,.7,-.3))),0.0);',
'vec3 color=c*textureV*(.27+warm+beam*1.7)*diffuse;',
'color+=c*warm*vec3(.18,.10,.02);',
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
  if(f.type==='sofa'){box(out,x,.1,z,w,.48,d,fabric,7);box(out,x,.55,z-d*.31,w,.75,.30,[.29,.21,.17],7);for(const s of [-1,1])box(out,x+s*(w*.46),.40,z,w*.09,.57,d,[.38,.29,.21],7)}
  if(f.type==='rug'){box(out,x,.013,z,w,.012,d,[.46,.27,.18],7);box(out,x,.025,z,w*.84,.009,d*.78,[.25,.23,.20],7)}
  if(f.type==='books'){box(out,x,0,z,w,h,d,wood,6);for(let i=1;i<5;i++)box(out,x,.30+i*.35,z,w,.065,d,[.43,.30,.22],6);for(let i=0;i<17;i++)box(out,x-w*.42+i*w/18,.39+(i%4)*.39,z,w/28,.22+(i%2)*.08,d*.6,[.21+(i%3)*.13,.20+(i%4)*.09,.16+(i%2)*.12],7)}
  if(f.type==='cabinets'){box(out,x,0,z,w,.95,d,wood,6);box(out,x,1.36,z,w,.76,d,[.31,.26,.18],6);for(const s of [-1,0,1]){box(out,x+s*w*.31,.13,z+d*.51,.035,.55,.015,brass,9);box(out,x+s*w*.31,1.5,z+d*.51,.035,.42,.014,brass,9)}}
  if(f.type==='fridge'){box(out,x,0,z,w,h,d,[.55,.56,.53],9);box(out,x+w*.36,.76,z+d*.51,.045,.68,.03,dark,9)}
  if(f.type==='sink'){box(out,x,.72,z,w,.17,d,[.69,.67,.63],8);box(out,x,.87,z,w*.7,.02,d*.55,[.21,.25,.23],9);box(out,x+w*.2,.9,z-.15,.055,.28,.07,brass,9)}
  if(f.type==='table'||f.type==='desk'){box(out,x,.71,z,w,.11,d,wood,6);for(const xx of [-1,1])for(const zz of [-1,1])box(out,x+xx*w*.39,0,z+zz*d*.38,.09,.73,.09,wood,6)}
  if(f.type==='bed'){box(out,x,.32,z,w,.34,d,[.39,.26,.22],6);box(out,x,.65,z,w*.95,.1,d*.86,[.38,.37,.31],7);for(const s of [-1,1])round(out,x+s*w*.24,.78,z-d*.32,w*.20,.11,d*.13,[.68,.61,.51],7);box(out,x,.75,z+d*.19,w*.9,.07,d*.45,[.25,.34,.34],7)}
  if(f.type==='wardrobe'){box(out,x,0,z,w,h,d,wood,6);box(out,x-w*.01,.2,z+d*.51,.03,h*.65,.03,brass,9)}
  if(f.type==='bath'){box(out,x,.1,z,w,.69,d,[.75,.72,.64],8);box(out,x,.8,z,w*.85,.06,d*.82,[.22,.26,.26],8)}
  if(f.type==='toilet'){round(out,x,.42,z,.29,.23,.32,white,8);box(out,x,.30,z-.28,.50,.42,.23,white,8)}
  if(f.type==='mirror'){box(out,x,.96,z,w,h,d,brass,9);box(out,x,1,z,w*.88,h*.88,d*.8,[.27,.34,.36],10)}
  if(f.type==='lamp'){box(out,x,0,z,.09,1.55,.09,brass,9);round(out,x,1.53,z,.29,.22,.29,[.86,.64,.32],8)}
  if(f.type==='painting'){box(out,x,1.4,z,w,h,d,wood,6);box(out,x,1.47,z,w*.83,h*.78,d*1.1,[.31,.37,.34],7)}
  if(f.type==='door'){box(out,x,.03,z,w,h,d,[.26,.18,.11],6);box(out,x+w*.37,1.30,z+d*.6,.14,.08,.09,brass,9);box(out,x,2.72,z,w*.92,.07,.06,[.41,.32,.19],6)}
 }
 for(const r of world.rooms){const x=(r.x0+r.x1+1)*M*.5,z=(r.z0+r.z1+1)*M*.5;box(out,x,ceil-.17,z,1.25,.18,1.25,[.48,.43,.32],8);round(out,x,ceil-.32,z,.34,.15,.34,[.83,.63,.40],8)}
 for(const z of [5,12,19]){box(out,15.5*M,ceil-.11,z*M,1.1,.16,1.1,[.42,.38,.28],8);round(out,15.5*M,ceil-.29,z*M,.30,.13,.30,[.81,.66,.42],8)}
 return out
}
function relicMesh(out,item,time){const x=item.x*SCALE,z=item.z*SCALE,h=.55+.09*Math.sin(time*2);
 box(out,x,.015,z,.55,.015,.55,[.39,.30,.21],9);
 if(item.id==='album'){box(out,x,h,z,.60,.085,.46,[.43,.23,.17],7);box(out,x,h+.065,z,.50,.012,.42,[.68,.61,.48],8)}
 if(item.id==='photo'){box(out,x,h,z,.48,.075,.59,[.60,.47,.28],6);box(out,x,h+.066,z,.36,.012,.47,[.78,.71,.58],8)}
 if(item.id==='keys'){round(out,x,h+.04,z,.20,.035,.20,[.79,.57,.23],9);box(out,x+.23,h,z,.34,.09,.05,[.77,.58,.29],9)}
 if(item.id==='pills'){round(out,x,h,z,.17,.21,.17,[.70,.62,.50],8);box(out,x,h+.22,z,.33,.07,.33,[.65,.27,.15],9)}
}
function phantom(out,e,t){const x=e.x*SCALE,z=e.z*SCALE,lean=Math.sin(t*1.6+e.x)*.06,y=.1+Math.sin(t*2+e.x)*.05,coat=e.kind==='coat';
 const cloth=coat?[.24,.20,.19]:[.28,.29,.28];
 round(out,x,y+1.08,z,.40,.75,.26,cloth,7);
 round(out,x+lean,y+2.02,z,.22,.31,.23,[.49,.48,.43],8);
 for(const s of [-1,1]){round(out,x+s*.27,y+.72,z,.13,.56,.17,cloth,7);round(out,x+s*.14,y+.24,z,.13,.31,.18,[.21,.22,.23],7)}
 if(!coat){for(const s of [-1,1])box(out,x+s*.083,y+2.10,z-.208,.046,.034,.018,[.62,.15,.10],9)}
 else box(out,x,y+2.35,z,.12,.43,.08,[.19,.17,.15],6)
}
function pistolMesh(){const o=[],steel=[.21,.23,.24],wood=[.36,.22,.17],skin=[.58,.44,.33];
 round(o,.49,-.91,-1.28,.22,.26,.21,skin,8);
 box(o,.50,-.87,-1.48,.19,.49,.22,wood,6);
 box(o,.49,-.56,-1.61,.23,.19,.55,steel,9);
 box(o,.49,-.52,-1.85,.12,.10,.43,[.30,.32,.33],9);
 round(o,.49,-.64,-1.52,.17,.16,.20,[.34,.35,.36],9);
 box(o,.49,-.44,-1.47,.12,.04,.12,[.45,.43,.38],9);
 return o
}
export class Renderer{
 constructor(canvas){
  this.canvas=canvas;const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});if(!gl)throw Error('WebGL unavailable');
  this.gl=gl;const program=gl.createProgram();gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,VS));gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  this.program=program;gl.useProgram(program);this.attrs=['position','tint','normal','material'].map(name=>{const l=gl.getAttribLocation(program,name);if(l>=0)gl.enableVertexAttribArray(l);return l});
  this.u=Object.fromEntries(['mvp','eye','facing','lampA','lampB','torch','time','hit'].map(x=>[x,gl.getUniformLocation(program,x)]));
  this.staticBuffer=gl.createBuffer();this.dynamicBuffer=gl.createBuffer();this.weaponBuffer=gl.createBuffer();this.weapon=pistolMesh();this.staticRevision=-1;this.staticCount=0;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true});this.lost=false
 }
 bind(buffer){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(let i=0;i<4;i++)if(this.attrs[i]>=0)gl.vertexAttribPointer(this.attrs[i],i===3?1:3,gl.FLOAT,false,40,[0,12,24,36][i])}
 upload(buffer,values,kind){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),kind)}
 resize(){const gl=this.gl,rect=this.canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,rect.width<650?1.3:1.6),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h)}}
 draw(world,player,enemies,items,flash,t,damage=0,shot=0){
  if(this.lost)return;this.resize();const gl=this.gl;gl.clearColor(.045,.044,.040,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
  if(this.staticRevision!==world.terrainRevision){const mesh=apartmentMesh(world);this.upload(this.staticBuffer,mesh,gl.STATIC_DRAW);this.staticCount=mesh.length/10;this.staticRevision=world.terrainRevision}
  const eye=[player.x*SCALE,1.54+(player.bob||0),player.z*SCALE],dir=[Math.sin(player.yaw)*Math.cos(player.pitch),-Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)];
  const proj=projection(Math.PI*.50,this.canvas.width/this.canvas.height),mvp=multiply(proj,view(eye,dir));
  const lampA=world.point('living'),lampB=world.point('kitchen');
  gl.uniformMatrix4fv(this.u.mvp,false,mvp);gl.uniform3fv(this.u.eye,eye);gl.uniform3fv(this.u.facing,dir);
  gl.uniform3fv(this.u.lampA,[lampA.x*SCALE,2.64,lampA.z*SCALE]);gl.uniform3fv(this.u.lampB,[lampB.x*SCALE,2.64,lampB.z*SCALE]);
  gl.uniform1f(this.u.torch,flash?1:0);gl.uniform1f(this.u.time,t);gl.uniform1f(this.u.hit,damage);
  this.bind(this.staticBuffer);gl.drawArrays(gl.TRIANGLES,0,this.staticCount);
  const dyn=[];for(const item of items)relicMesh(dyn,item,t);
  for(const e of enemies)phantom(dyn,e,t);
  if(dyn.length){this.upload(this.dynamicBuffer,dyn,gl.DYNAMIC_DRAW);this.bind(this.dynamicBuffer);gl.drawArrays(gl.TRIANGLES,0,dyn.length/10)}
  // Proper viewmodel at the lower right: no world-space cyan marker below the camera.
  const gun=this.weapon;
  if(gun.length){gl.clear(gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.u.mvp,false,proj);gl.uniform3fv(this.u.eye,[0,0,0]);gl.uniform3fv(this.u.facing,[0,0,-1]);gl.uniform1f(this.u.torch,shot>0?.5:1);gl.uniform1f(this.u.hit,Math.max(damage,shot*.6));this.upload(this.weaponBuffer,gun,gl.DYNAMIC_DRAW);this.bind(this.weaponBuffer);gl.drawArrays(gl.TRIANGLES,0,gun.length/10)}
 }
}
