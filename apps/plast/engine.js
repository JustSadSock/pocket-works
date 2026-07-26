export const SIZE = { x: 96, y: 36, z: 96, water: 10 };
export const BLOCKS = [
  ['ВОЗДУХ','#000','#000','#000','#000',0],
  ['ДЁРН','#69983f','#8bbb55','#9fc968','#4e7334',.45],
  ['ЗЕМЛЯ','#765036','#956843','#a7754e','#533723',.4],
  ['КАМЕНЬ','#787b77','#92958f','#a4a6a0','#565a57',1],
  ['ПЕСОК','#cfba75','#e6d68d','#efdf9b','#aa9559',.3],
  ['ВОДА','#3d85b4','#65acd2','#86c7e3','#28688f',0],
  ['БРЕВНО','#755033','#aa7b4d','#a27348','#50331f',.8],
  ['ЛИСТВА','#3e7738','#57954b','#70a963','#2b562a',.2],
  ['ДОСКИ','#a7784d','#c09465','#d0a676','#7b5435',.65],
  ['КИРПИЧ','#985445','#b66f5b','#c47b66','#703b32',1.05],
  ['СТЕКЛО','#9bd2d2','#c7eeee','#def7f7','#6ca9ad',.25],
  ['СВЕТОКАМЕНЬ','#d8b85a','#f0da78','#ffe998','#9e7d35',.5]
].map((b,id)=>({id,name:b[0],color:b[1],top:b[2],light:b[3],dark:b[4],hardness:b[5]}));

const VERT = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
void main(){gl_Position=vec4(P[gl_VertexID],0,1);}`;

const FRAG = `#version 300 es
precision highp float; precision highp int; precision highp usampler3D;
out vec4 O; uniform usampler3D W; uniform vec2 R; uniform vec3 C; uniform vec2 A;
uniform float T,D,B; uniform ivec3 S,Q; uniform int V,U;
float h(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
uint g(ivec3 p){if(any(lessThan(p,ivec3(0)))||any(greaterThanEqual(p,S)))return 3u;return texelFetch(W,p,0).r;}
vec3 sky(vec3 r){float l=clamp(sin(D*6.283)*.62+.58,.08,1.);vec3 a=mix(vec3(.04,.06,.11),vec3(.62,.80,.93),l);vec3 b=mix(vec3(.01,.02,.06),vec3(.22,.52,.79),l);vec3 c=mix(a,b,clamp(r.y*.5+.5,0.,1.));vec3 sd=normalize(vec3(cos(D*6.283),sin(D*6.283),.2));c+=vec3(1.,.75,.35)*pow(max(dot(r,sd),0.),180.)*l;return U==1?vec3(.04,.25,.36):c;}
vec3 mat(uint id,vec3 p,vec3 n,ivec3 q){vec3 f=fract(p);vec2 u=abs(n.y)>.5?f.xz:(abs(n.x)>.5?f.zy:f.xy);float k=h(vec3(floor(u*16.),float(id)+float(q.x+q.z)*.03));vec3 c=vec3(.7);
if(id==1u)c=n.y>.5?vec3(.35,.59,.21):(n.y<-.5?vec3(.38,.25,.15):mix(vec3(.39,.25,.15),vec3(.35,.59,.21),step(.8,f.y)))*mix(.82,1.16,k);
else if(id==2u)c=vec3(.46,.30,.19)*mix(.78,1.2,k); else if(id==3u)c=vec3(.49)*mix(.76,1.18,k); else if(id==4u)c=vec3(.79,.70,.42)*mix(.87,1.13,k);
else if(id==6u)c=abs(n.y)>.5?mix(vec3(.62,.42,.24),vec3(.34,.20,.11),step(.55,fract(length(u-.5)*8.))):mix(vec3(.43,.28,.16),vec3(.29,.17,.09),step(.68,fract(floor(u.x*16.)*.37+k)));
else if(id==7u)c=vec3(.22,.46,.20)*mix(.72,1.28,k); else if(id==8u)c=mix(vec3(.64,.44,.26),vec3(.36,.23,.13),step(.88,fract((n.y>.5?u.y:u.x)*4.)));
else if(id==9u){vec2 z=min(fract(u*4.),1.-fract(u*4.));c=min(z.x,z.y)<.08?vec3(.68):vec3(.56,.26,.21)*mix(.86,1.14,k);} else if(id==10u)c=vec3(.55,.81,.83); else if(id==11u)c=vec3(1.,.78,.32)*mix(.85,1.15,k);
if(n.y<-.5)c*=.62;else if(abs(n.x)>.5)c*=.82;else if(abs(n.z)>.5)c*=.9;return c;}
void main(){vec2 p=(gl_FragCoord.xy*2.-R)/R.y;float y=A.x,x=A.y;vec3 f=normalize(vec3(sin(y)*cos(x),sin(x),cos(y)*cos(x)));vec3 r=normalize(vec3(cos(y),0,-sin(y)));vec3 u=normalize(cross(f,r));vec3 d=normalize(f+p.x*r*.84+p.y*u*.84);ivec3 q=ivec3(floor(C)),st=ivec3(sign(d));vec3 iv=1./max(abs(d),vec3(.00001));vec3 nb=vec3(q)+step(vec3(0),d);vec3 sd=(nb-C)*iv*sign(d),dd=iv,n=vec3(0,1,0);float t=0.;vec4 tr=vec4(0);vec3 sk=sky(d);
for(int i=0;i<144;i++){if(any(lessThan(q,ivec3(0)))||any(greaterThanEqual(q,S)))break;uint id=g(q);if(id!=0u){vec3 hit=C+d*t;if(id==5u){if(tr.a<.01)tr=vec4(.05,.38,.62,.34);}else if(id==10u){tr.rgb=mix(tr.rgb,vec3(.62,.86,.88),.45);tr.a=min(.58,tr.a+.18);}else{vec3 c=mat(id,hit,n,q);float l=clamp(sin(D*6.283)*.62+.58,.09,1.);vec3 sun=normalize(vec3(cos(D*6.283),abs(sin(D*6.283))+.15,.2));c*=.34+.38*l+max(dot(n,sun),0.)*.52*l;if(id==11u)c+=vec3(.25,.16,.02);if(V==1&&all(equal(q,Q))){vec3 e=min(fract(hit),1.-fract(hit));float line=1.-smoothstep(.018,.055,min(e.x,min(e.y,e.z)));c=mix(c,vec3(1),line*.85);if(B>0.){vec2 z=floor((abs(n.y)>.5?fract(hit).xz:(abs(n.x)>.5?fract(hit).zy:fract(hit).xy))*16.);float cr=step(.78,h(vec3(z,floor(B*7.))))*step(h(vec3(z.yx,4)),B);c=mix(c,vec3(.07),cr*.72);}}c=mix(c,tr.rgb,tr.a);c=mix(c,sk,clamp(pow(t/(U==1?15.:56.),1.6),0.,1.));O=vec4(c,1);return;}}
if(sd.x<sd.y&&sd.x<sd.z){t=sd.x;sd.x+=dd.x;q.x+=st.x;n=vec3(-float(st.x),0,0);}else if(sd.y<sd.z){t=sd.y;sd.y+=dd.y;q.y+=st.y;n=vec3(0,-float(st.y),0);}else{t=sd.z;sd.z+=dd.z;q.z+=st.z;n=vec3(0,0,-float(st.z));}if(t>80.)break;}O=vec4(mix(sk,tr.rgb,tr.a),1);}`;

export class VoxelEngine {
  constructor(canvas){this.canvas=canvas;this.data=new Uint8Array(SIZE.x*SIZE.y*SIZE.z);this.mods=new Map();this.seed=1;this.gl=null;this.program=null;this.tex=null;this.u={};}
  index(x,y,z){return x+y*SIZE.x+z*SIZE.x*SIZE.y;}
  inside(x,y,z){return x>=0&&y>=0&&z>=0&&x<SIZE.x&&y<SIZE.y&&z<SIZE.z;}
  get(x,y,z){return this.inside(x,y,z)?this.data[this.index(x,y,z)]:3;}
  raw(x,y,z,id){if(this.inside(x,y,z))this.data[this.index(x,y,z)]=id;}
  set(x,y,z,id,remember=true){if(!this.inside(x,y,z)||y<1)return false;const i=this.index(x,y,z);this.data[i]=id;if(remember)this.mods.set(i,id);if(this.gl){this.gl.bindTexture(this.gl.TEXTURE_3D,this.tex);this.gl.texSubImage3D(this.gl.TEXTURE_3D,0,x,y,z,1,1,1,this.gl.RED_INTEGER,this.gl.UNSIGNED_BYTE,new Uint8Array([id]));}return true;}
  hash(x,y,z,s=this.seed){let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^Math.imul(s|0,1274126177);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
  smooth(t){return t*t*(3-2*t);}
  n2(x,z,s=this.seed){let X=Math.floor(x),Z=Math.floor(z),a=this.smooth(x-X),b=this.smooth(z-Z),r=(dx,dz)=>this.hash(X+dx,0,Z+dz,s);let p=r(0,0)+(r(1,0)-r(0,0))*a,q=r(0,1)+(r(1,1)-r(0,1))*a;return p+(q-p)*b;}
  n3(x,y,z){let X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z),a=this.smooth(x-X),b=this.smooth(y-Y),c=this.smooth(z-Z),r=(dx,dy,dz)=>this.hash(X+dx,Y+dy,Z+dz,this.seed^0x45d9f3b);let x00=r(0,0,0)+(r(1,0,0)-r(0,0,0))*a,x10=r(0,1,0)+(r(1,1,0)-r(0,1,0))*a,x01=r(0,0,1)+(r(1,0,1)-r(0,0,1))*a,x11=r(0,1,1)+(r(1,1,1)-r(0,1,1))*a;return(x00+(x10-x00)*b)+((x01+(x11-x01)*b)-(x00+(x10-x00)*b))*c;}
  height(x,z){return Math.max(4,Math.min(SIZE.y-8,Math.floor(6+this.n2(x/22,z/22)*8+this.n2(x/8+9,z/8-5,this.seed^0x9e3779b9)*3)));}
  async generate(seed,mods=[],progress=()=>{}){this.seed=seed>>>0;this.data.fill(0);this.mods=new Map();let H=new Uint8Array(SIZE.x*SIZE.z);for(let x=0;x<SIZE.x;x++){for(let z=0;z<SIZE.z;z++){let h=this.height(x,z);H[x+z*SIZE.x]=h;for(let y=0;y<=Math.max(h,SIZE.water);y++){let id=0;if(y===0)id=3;else if(y<=h){let cave=y>2&&y<h-2&&this.n3(x/6,y/4.7,z/6)>.74;id=cave?0:y<h-3?3:y<h?2:h<=SIZE.water+1?4:1;}else id=5;this.raw(x,y,z,id);}}if(x%8===0){progress(.08+x/SIZE.x*.6,'поднимаем рельеф');await new Promise(requestAnimationFrame);}}
  progress(.72,'сажаем деревья');for(let x=3;x<SIZE.x-3;x++)for(let z=3;z<SIZE.z-3;z++){let h=H[x+z*SIZE.x];if(h<=SIZE.water+1||this.get(x,h,z)!==1||this.hash(x,77,z)<.968)continue;let trunk=3+Math.floor(this.hash(x,91,z)*3);for(let y=1;y<=trunk;y++)this.raw(x,h+y,z,6);for(let dx=-2;dx<=2;dx++)for(let dy=-1;dy<=2;dy++)for(let dz=-2;dz<=2;dz++)if(Math.abs(dx)+Math.abs(dz)+Math.max(0,Math.abs(dy)-1)<=3&&this.get(x+dx,h+trunk+dy,z+dz)===0)this.raw(x+dx,h+trunk+dy,z+dz,7);}
  for(const e of mods||[]){let i=Number(e?.[0]),id=Number(e?.[1]);if(Number.isInteger(i)&&i>=0&&i<this.data.length&&BLOCKS[id]){this.data[i]=id;this.mods.set(i,id);}}
  let cx=SIZE.x>>1,cz=SIZE.z>>1,spawn=[cx,SIZE.water+3,cz];outer:for(let r=0;r<30;r++)for(let x=cx-r;x<=cx+r;x++)for(let z=cz-r;z<=cz+r;z++){if(!this.inside(x,1,z))continue;let h=H[x+z*SIZE.x];if(h>SIZE.water+1&&this.get(x,h+1,z)===0&&this.get(x,h+2,z)===0){spawn=[x,h,z];break outer;}}
  this.spawn=[spawn[0]+.5,spawn[1]+1.7,spawn[2]+.5];progress(.92,'зажигаем небо');this.upload();await new Promise(r=>setTimeout(r,120));progress(1,'готово');return this.spawn;}
  init(){let g=this.canvas.getContext('webgl2',{antialias:false,alpha:false,depth:false,powerPreference:'high-performance'});if(!g)return false;this.gl=g;let sh=(t,s)=>{let q=g.createShader(t);g.shaderSource(q,s);g.compileShader(q);if(!g.getShaderParameter(q,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(q));return q;};let p=g.createProgram();g.attachShader(p,sh(g.VERTEX_SHADER,VERT));g.attachShader(p,sh(g.FRAGMENT_SHADER,FRAG));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw Error(g.getProgramInfoLog(p));this.program=p;g.useProgram(p);g.bindVertexArray(g.createVertexArray());for(const n of['W','R','C','A','T','D','B','S','Q','V','U'])this.u[n]=g.getUniformLocation(p,n);this.tex=g.createTexture();g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_3D,this.tex);for(const n of[g.TEXTURE_MIN_FILTER,g.TEXTURE_MAG_FILTER])g.texParameteri(g.TEXTURE_3D,n,g.NEAREST);for(const n of[g.TEXTURE_WRAP_S,g.TEXTURE_WRAP_T,g.TEXTURE_WRAP_R])g.texParameteri(g.TEXTURE_3D,n,g.CLAMP_TO_EDGE);g.pixelStorei(g.UNPACK_ALIGNMENT,1);g.texStorage3D(g.TEXTURE_3D,1,g.R8UI,SIZE.x,SIZE.y,SIZE.z);g.uniform1i(this.u.W,0);g.uniform3i(this.u.S,SIZE.x,SIZE.y,SIZE.z);return true;}
  upload(){if(!this.gl)return;let g=this.gl;g.bindTexture(g.TEXTURE_3D,this.tex);g.texSubImage3D(g.TEXTURE_3D,0,0,0,0,SIZE.x,SIZE.y,SIZE.z,g.RED_INTEGER,g.UNSIGNED_BYTE,this.data);}
  resize(scale=.75){if(!this.gl)return;let d=Math.min(devicePixelRatio||1,1.5),w=Math.max(320,Math.floor(innerWidth*d*scale)),h=Math.max(180,Math.floor(innerHeight*d*scale));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}}
  render(cam,yaw,pitch,target,breaking,day,underwater,time,scale=.75){let g=this.gl;if(!g)return;this.resize(scale);g.viewport(0,0,this.canvas.width,this.canvas.height);g.useProgram(this.program);g.uniform2f(this.u.R,this.canvas.width,this.canvas.height);g.uniform3f(this.u.C,...cam);g.uniform2f(this.u.A,yaw,pitch);g.uniform1f(this.u.T,time);g.uniform1f(this.u.D,day);g.uniform1f(this.u.B,breaking);g.uniform1i(this.u.U,underwater?1:0);if(target){g.uniform1i(this.u.V,1);g.uniform3i(this.u.Q,target.x,target.y,target.z);}else g.uniform1i(this.u.V,0);g.drawArrays(g.TRIANGLES,0,3);}
  ray(origin,yaw,pitch,max=6){let d=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],q=origin.map(Math.floor),st=d.map(v=>v>=0?1:-1),dd=d.map(v=>Math.abs(1/(v||1e-6))),sd=q.map((v,i)=>((st[i]>0?v+1:v)-origin[i])/(d[i]||1e-6)),n=[0,0,0],t=0;for(let i=0;i<80&&t<=max;i++){let a=sd[0]<sd[1]&&sd[0]<sd[2]?0:sd[1]<sd[2]?1:2;q[a]+=st[a];t=sd[a];sd[a]+=dd[a];n=[0,0,0];n[a]=-st[a];if(!this.inside(...q))return null;let id=this.get(...q);if(id&&id!==5)return{x:q[0],y:q[1],z:q[2],id,normal:n,distance:t};}return null;}
}
