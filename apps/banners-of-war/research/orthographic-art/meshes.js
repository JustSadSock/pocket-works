// Original procedural 3D meshes. Units in metres, +X forward, +Z up.
const TAU=Math.PI*2,add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>mul(a,1/(Math.hypot(...a)||1));
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const metal=rgb('#90999a'),bronze=rgb('#b5975c'),mail=rgb('#777e78'),leather=rgb('#594334'),skin=rgb('#ba8c67'),ivory=rgb('#d9c6a0'),iron=rgb('#454a48'),wood=rgb('#8a6945');
export const models=['spear','horse','roman','elephant'];
export const states=['idle','walk','ready','attack','guard','retreat'];
export const frameCount=8;
export const angles=[45,60,75];
export const elevation=60;
class Mesh{
 constructor(){this.v=[]}
 tri(a,b,c,col,ns){const n=unit(cross(sub(b,a),sub(c,a)));for(let i=0;i<3;i++)this.v.push(...[a,b,c][i],...(ns?ns[i]:n),...col)}
 quad(a,b,c,d,col,ns){this.tri(a,b,c,col,ns&&[ns[0],ns[1],ns[2]]);this.tri(a,c,d,col,ns&&[ns[0],ns[2],ns[3]])}
 // Parametric ellipsoid with smoothly varying normals, oriented in an arbitrary 3D basis.
 egg(c,r,col,basis=[[1,0,0],[0,1,0],[0,0,1]],N=12,M=8){
  const p=(i,j)=>{let t=Math.PI*i/M,a=TAU*j/N,q=[Math.sin(t)*Math.cos(a),Math.sin(t)*Math.sin(a),Math.cos(t)];return [add(c,basis.reduce((s,b,k)=>add(s,mul(b,q[k]*r[k])),[0,0,0])),unit(basis.reduce((s,b,k)=>add(s,mul(b,q[k]/r[k])),[0,0,0]))]};
  for(let i=0;i<M;i++)for(let j=0;j<N;j++){let q=[p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1)];this.quad(...q.map(x=>x[0]),col,q.map(x=>x[1]))}
 }
 rod(a,b,r1,r2,col,N=9){let z=unit(sub(b,a)),x=unit(cross(Math.abs(z[2])>.9?[0,1,0]:[0,0,1],z)),y=cross(z,x);const ring=(c,r,i)=>add(c,add(mul(x,r*Math.cos(i*TAU/N)),mul(y,r*Math.sin(i*TAU/N))));for(let i=0;i<N;i++){let p=ring(a,r1,i),q=ring(a,r1,i+1),r=ring(b,r2,i+1),s=ring(b,r2,i);let n=unit(sub(p,a)),m=unit(sub(q,a));this.quad(p,q,r,s,col,[n,m,m,n]);this.tri(a,q,p,col);this.tri(b,s,r,col)}}
 limb(a,b,r,col,ratio=.82){let z=unit(sub(b,a)),x=unit(cross(Math.abs(z[2])>.9?[0,1,0]:[0,0,1],z)),y=cross(z,x);this.egg(mul(add(a,b),.5),[r,r*ratio,Math.hypot(...sub(b,a))*.61],col,[x,y,z],10,6)}
 box(c,r,col){const p=(a,b,d)=>add(c,[a*r[0],b*r[1],d*r[2]]);for(let f of [[[-1,-1,-1],[-1,1,-1],[-1,1,1],[-1,-1,1]],[[1,-1,-1],[1,-1,1],[1,1,1],[1,1,-1]],[[-1,-1,-1],[-1,-1,1],[1,-1,1],[1,-1,-1]],[[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]],[[-1,-1,1],[-1,1,1],[1,1,1],[1,-1,1]],[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]])this.quad(...f.slice().reverse().map(v=>p(...v)),col)}
 append(m,offset,scale=1){for(let i=0;i<m.v.length;i+=9)this.v.push(...add(mul(m.v.slice(i,i+3),scale),offset),...m.v.slice(i+3,i+9))}
}
function shield(m,c,roman,col){let yz=roman?[[-.29,.48],[.29,.48],[.32,.40],[.32,-.43],[.23,-.48],[-.23,-.48],[-.32,-.43],[-.32,.40]]:[[-.31,.30],[-.19,.42],[.19,.42],[.31,.30],[.27,-.09],[.14,-.35],[0,-.50],[-.14,-.35],[-.27,-.09]];let center=add(c,[.12,0,0]);const edge=yz.map(([y,z])=>add(c,[.025+.06*(1-Math.abs(y)/.32),y,z]));for(let i=0;i<edge.length;i++){let a=edge[i],b=edge[(i+1)%edge.length];m.tri(center,a,b,col,[[1,0,0],[1,yz[i][0],0],[1,yz[(i+1)%edge.length][0],0]]);m.rod(a,b,.016,.016,roman?bronze:metal,6);m.tri(add(c,[-.04,0,0]),b,a,leather)}
 m.egg(add(center,[.025,0,0]),[.08,.10,.10],roman?bronze:metal,undefined,10,6);
 if(roman){for(let z of [-.26,.26]){m.rod(add(c,[.103,-.18,z]),add(c,[.13,.0,z*.45]),.016,.016,bronze,5);m.rod(add(c,[.13,0,z*.45]),add(c,[.103,.18,z]),.016,.016,bronze,5)}}else m.rod(add(c,[.13,0,-.30]),add(c,[.13,0,.29]),.013,.013,bronze,5);
}
function pole(m,a,b,roman){let d=unit(sub(b,a));m.rod(a,b,.026,.019,wood,7);let end=add(b,mul(d,roman?.43:.24));m.rod(b,add(b,mul(d,.07)),.035,.041,metal,6);m.rod(add(b,mul(d,.07)),end,.041,0,metal,6)}
function human(side,state,f,roman=false,rider=false){
 let m=new Mesh(),team=rgb(roman?(side?'#c6a467':'#a33e33'):(side?'#a44e38':'#315d87')),phase=f/frameCount*TAU,s=Math.sin(phase),c=Math.cos(phase),walking=state==='walk'||state==='retreat',attack=state==='attack',ready=state==='ready',guard=state==='guard',lunge=attack?Math.pow(Math.max(0,Math.sin(phase)),1.2):0,bob=walking?.025*(1-Math.cos(phase*2)):state==='idle'?.007*Math.sin(phase):guard?-.018+.008*Math.cos(phase):ready?.012*Math.sin(phase):-.015*lunge,lean=(rider?.08:0)+(ready?.07+.025*Math.sin(phase):guard?.10+.015*Math.sin(phase):0)+lunge*.18,hip=[-lean*.30,0,(rider?.06:.90)+bob],chest=add(hip,[lean,0,.33]),neck=add(chest,[.018,0,.25]),head=add(neck,[.025,0,.13]);
 m.egg(hip,[.16,.23,.15],team);m.egg(add(hip,[0,0,-.10]),[.19,.26,.17],team);
 if(!rider)for(let j of [-1,1]){let stride=walking?s*j*.24*(state==='retreat'?-1:1):j*.045+lunge*j*.13;let upper=add(hip,[0,j*.13,-.05]),knee=[stride*.55+.045,j*.13,.47+Math.max(0,walking?c*j:0)*.09],ankle=[stride,j*.13,.105+Math.max(0,walking?c*j:0)*.12];m.limb(upper,knee,.093,roman?skin:leather);m.egg(knee,[.078,.078,.075],roman?skin:mail);m.limb(knee,ankle,.067,roman?skin:mail);m.egg(add(ankle,[.074,0,-.045]),[.145,.075,.065],leather);if(roman)m.rod(add(ankle,[0,0,.03]),add(ankle,[0,0,.09]),.076,.073,leather,8)}
 else for(let j of [-1,1]){let a=add(hip,[0,j*.17,0]),k=add(hip,[.26,j*.37,-.23]),foot=add(hip,[.06,j*.36,-.57]);m.limb(a,k,.105,mail);m.egg(k,[.10,.095,.10],metal);m.limb(k,foot,.078,leather);m.egg(add(foot,[.07,0,-.015]),[.14,.075,.06],leather)}
 m.egg(chest,[.19,.275,.29],roman?metal:mail);m.egg(add(chest,[-.085,0,-.08]),[.17,.235,.25],team);
 // Lamellar/segmented plates have their own material and geometry.
 for(let i=0;i<4;i++){let z=chest[2]-.15+i*.095;m.egg([chest[0]+.07,0,z],[.16,.251-i*.005,.061],roman?(i%2?metal:rgb('#aeb0a4')):mail,undefined,12,5)}
 m.rod(add(hip,[0,0,.08]),add(hip,[0,0,.135]),.235,.229,leather,14);m.box(add(hip,[.23,0,.115]),[.025,.055,.035],bronze);
 m.egg(neck,[.080,.087,.13],skin);m.egg(head,[.118,.106,.145],skin);m.egg(add(head,[-.025,0,.061]),[.135,.127,.14],roman?bronze:metal,undefined,16,10);
 m.egg(add(head,[.081,0,-.015]),[.055,.051,.044],skin);for(let j of [-1,1]){m.egg(add(head,[.109,j*.063,.025]),[.013,.018,.012],iron);m.egg(add(head,[-.032,j*.098,-.055]),[.11,.034,.102],roman?bronze:mail)}
 if(roman){m.egg(add(head,[-.075,0,-.064]),[.12,.15,.045],bronze);m.rod(add(head,[.04,-.12,.035]),add(head,[.04,.12,.035]),.018,.018,bronze,8)}
 else {m.rod(add(head,[.126,0,-.061]),add(head,[.14,0,.064]),.022,.024,metal,7);m.egg(add(head,[-.02,0,-.105]),[.135,.13,.058],mail)}
 let shL=add(chest,[0,-.244,.13]),shR=add(chest,[0,.244,.13]),elL=add(chest,[.12,-.35,-.075]),handL=add(chest,[.29+(guard?.06:0),-.27,-.02]),elR=add(chest,[.045,.34,-.11]),handR=add(chest,[.28+lunge*.45+(ready?.04*Math.sin(phase):guard?-.04+.012*Math.cos(phase):0),.27,.00+(ready?.11+.025*Math.sin(phase):0)]);
 if(walking){elR[0]-=s*.07;handR[0]-=s*.10}if(state==='retreat')handR[0]-=.12;
 for(let [a,b,h] of [[shL,elL,handL],[shR,elR,handR]]){m.egg(a,[.125,.123,.125],roman?metal:mail);m.limb(a,b,.082,roman?skin:mail);m.limb(b,h,.061,roman?skin:leather);m.egg(h,[.058,.052,.065],skin)}
 shield(m,add(handL,[.065,-.055,-.08]),roman,team);
 if(roman){let d=unit([.30+lunge*.75,0,.70-lunge*.58]),a=add(handR,mul(d,-.10)),b=add(handR,mul(d,.61));m.rod(a,handR,.027,.027,leather,7);m.rod(add(handR,[0,-.07,0]),add(handR,[0,.07,0]),.025,.025,bronze,6);m.rod(handR,b,.045,.01,metal,4)}
 else{let d=unit([ready||guard||attack?1:.22,0,ready||guard||attack?.10-lunge*.12:1]),a=add(handR,mul(d,rider?-1.0:-.8)),b=add(handR,mul(d,rider?1.75:1.25));if(a[2]<.08&&!rider)a[2]=.08;pole(m,a,b,false)}
 return m
}
function horse(side,state,f){let m=new Mesh(),p=f/frameCount*TAU,move=state==='walk'||state==='retreat'||state==='attack',stride=move?(state==='attack'?.55:.30):0,bob=move?.045*Math.sin(p*2):.008*Math.sin(p),hide=rgb('#795a43'),mane=rgb('#3f322a'),team=rgb(side?'#a44e38':'#315d87');m.egg([-.10,0,1.13+bob],[.85,.33,.42],hide,undefined,16,10);m.egg([-.68,0,1.11+bob],[.42,.35,.43],hide);m.egg([.53,0,1.18+bob],[.40,.31,.44],hide);
 m.limb([.46,0,1.24+bob],[.91+(move?0:.015*Math.sin(p)),0,1.91+bob],.29,hide,.82);m.egg([1.04,0,1.88+bob],[.36,.16,.23],hide);m.egg([1.29,0,1.76+bob],[.22,.14,.13],rgb('#8d6c51'));for(let j of [-1,1]){m.rod([.94,j*.10,2.00+bob],[.99,j*.115,2.26+bob],.067,.011,hide,7);m.egg([1.14,j*.14,1.95+bob],[.035,.022,.031],iron);m.rod([1.33,j*.14,1.77+bob],[.83,j*.14,1.82+bob],.016,.016,leather)}
 for(let i=0;i<8;i++){let t=i/7;m.egg([.43+t*.43,-.035,1.49+t*.55+bob],[.11,.13,.17],mane)}
 for(let j of [-1,1])for(let k of [-1,1]){let phase=p+(j===k?0:Math.PI),x=k===1?.52:-.64,a=[x,j*.23,1.13+bob],knee=[x+(k===1?.07:-.20)+Math.sin(phase)*stride*.52,j*.23,.57+Math.max(0,Math.cos(phase))*stride*.15],ankle=[x+Math.sin(phase)*stride,j*.24,.10+Math.max(0,Math.cos(phase))*stride*.50];m.limb(a,knee,k===1?.102:.16,hide);m.egg(knee,[.079,.075,.08],hide);m.limb(knee,ankle,.055,hide);m.egg(add(ankle,[.04,0,-.035]),[.10,.073,.065],iron)}
 let tail=[-.94,0,1.34+bob];for(let i=1;i<6;i++){let n=[-.94-i*.09,Math.sin(p+i*.3)*.035*stride,1.34+bob-i*.16];m.limb(tail,n,.09-i*.009,mane);tail=n}
 m.egg([-.13,0,1.49+bob],[.46,.34,.12],leather);for(let j of [-1,1]){m.egg([-.17,j*.31,1.25+bob],[.42,.065,.31],team);m.rod([-.52,j*.34,1.12+bob],[.18,j*.34,1.12+bob],.023,.023,bronze,7);m.rod([.91,j*.15,1.84+bob],[.08,j*.29,1.84+bob],.012,.012,leather,5)}
 m.append(human(side,state,f,false,true),[-.16,0,1.54+bob],.94);return m}
function elephant(side){let m=new Mesh(),hide=rgb('#898c84'),dark=rgb('#686d68'),team=rgb(side?'#b49a5f':'#963e32');m.egg([-.25,0,1.79],[1.13,.65,.93],hide,undefined,20,12);m.egg([.78,0,2.05],[.58,.49,.63],hide,undefined,16,10);
 for(let j of [-1,1]){m.egg([.65,j*.48,2.05],[.41,.17,.49],rgb('#96988e'),undefined,16,10);m.egg([1.04,j*.40,2.15],[.037,.026,.035],iron);for(let k of [-1,1]){let x=k===1?.53:-.91;m.egg([x,j*.41,1.18],[.29,.26,.59],hide);m.rod([x,j*.41,1.04],[x+.015,j*.41,.22],.21,.19,hide,12);m.egg([x+.045,j*.41,.15],[.25,.23,.17],dark);for(let i=-1;i<=1;i++)m.egg([x+.25,j*.41+i*.11,.10],[.048,.049,.065],ivory,undefined,8,5)}let a=[1.06,j*.28,1.76];for(let i=1;i<=7;i++){let t=i/7,b=[1.06+.68*t,j*(.28+.13*t),1.76-.25*Math.sin(t*Math.PI*.8)+.16*t];m.rod(a,b,.085*(1-(i-1)/7),.085*(1-t),ivory,8);a=b}}
 let a=[1.19,0,1.95];for(let i=1;i<=9;i++){let t=i/9,b=[1.19+.32*Math.sin(t*Math.PI*.75),.10*Math.sin(t*Math.PI),1.95-1.42*t+.28*t*t*t];m.rod(a,b,.17-.085*(i-1)/9,.17-.085*t,hide,10);a=b}m.egg(a,[.095,.10,.11],hide);
 m.rod([-1.33,0,1.65],[-1.65,.12,.85],.055,.023,dark);m.egg([-1.65,.12,.83],[.07,.07,.13],dark);
 for(let j of [-1,1]){m.egg([-.27,j*.57,1.99],[.73,.10,.48],team);m.rod([-.88,j*.66,1.77],[.33,j*.66,1.77],.03,.03,bronze,8)}
 m.box([-.15,0,2.69],[.61,.40,.085],leather);for(let j of [-1,1]){m.box([-.15,j*.40,2.92],[.60,.04,.23],wood);m.rod([-.75,j*.40,3.16],[.45,j*.40,3.16],.04,.04,bronze)}m.box([-.72,0,2.92],[.04,.40,.23],wood);m.append(human(side,'idle',0,true,true),[.20,0,2.77],.65);return m}
export function makeModel(type,side=0,state='idle',f=0){if(!models.includes(type))throw Error('Unapproved model '+type);if(type==='horse')return horse(side,state,f);if(type==='elephant')return elephant(side);return human(side,state,f,type==='roman')}
export function treeModel(){let m=new Mesh();m.rod([0,0,0],[.1,-.05,3.7],.23,.095,wood,12);for(let i=0;i<7;i++){let a=i*2.39996,x=Math.cos(a)*(i===0?0:1.12),y=Math.sin(a)*(i===0?0:1.12),z=3.25+(i%3)*.58; m.rod([.03,0,2.2],[x,y,z],.12,.04,wood,8);for(let j=0;j<4;j++){let b=j*1.57+a,off=.47;m.egg([x+Math.cos(b)*off,y+Math.sin(b)*off,z+.22*Math.sin(b)],[.86,.73,.72],rgb(['#657745','#75834e','#53683e','#88915a'][(i+j)%4]),undefined,10,7)}}return m}
export class Prerender{
 constructor(){this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=256;const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,premultipliedAlpha:false});if(!gl)throw Error('WebGL required for offline mesh rasterization, not battle rendering');
  const sh=(kind,src)=>{const x=gl.createShader(kind);gl.shaderSource(x,src);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(x));return x};
  const prog=this.prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,'attribute vec3 p,n,c;uniform float yaw,el,scale;uniform vec2 anchor;varying vec3 color;void main(){float a=cos(yaw),b=sin(yaw),s=sin(el),t=cos(el);vec3 q=vec3(a*p.x-b*p.y,b*p.x+a*p.y,p.z);vec3 norm=normalize(vec3(a*n.x-b*n.y,b*n.x+a*n.y,n.z));float lit=max(0.,dot(norm,normalize(vec3(-.48,-.55,.82))));float rim=max(0.,dot(norm,normalize(vec3(.45,.3,.65))));color=c*(.44+.60*lit+.13*rim);gl_Position=vec4(anchor+vec2(q.x,-q.y*s+q.z*t)*scale,-(q.y*t+q.z*s)*.11,1.);}'));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 color;void main(){gl_FragColor=vec4(color,1.);}'));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);this.buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buf);for(let [i,n] of ['p','n','c'].entries()){let a=gl.getAttribLocation(prog,n);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,i*12)}this.u=Object.fromEntries(['yaw','el','scale','anchor'].map(n=>[n,gl.getUniformLocation(prog,n)]));gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0)
 }
 paint(m,yaw,el=60,ppm=38){const gl=this.gl;gl.viewport(0,0,256,256);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(m.v),gl.STREAM_DRAW);gl.uniform1f(this.u.yaw,yaw);gl.uniform1f(this.u.el,el*Math.PI/180);gl.uniform1f(this.u.scale,ppm/128);gl.uniform2f(this.u.anchor,0,-.30);gl.drawArrays(gl.TRIANGLES,0,m.v.length/9);return this.canvas}
}
export const CELL=128,ANCHOR={x:64,y:83.2},PPM=19;
export function createAtlas(renderer,el=elevation){let pages=new Map(),prepared=0;const start=performance.now();for(let type of models)for(let side of [0,1])for(let state of (type==='spear'||type==='horse'?states:['idle'])){let count=type==='spear'||type==='horse'?frameCount:1,c=document.createElement('canvas');c.width=CELL*8;c.height=CELL*count;let g=c.getContext('2d');for(let f=0;f<count;f++){let m=makeModel(type,side,state,f);for(let a=0;a<8;a++){g.drawImage(renderer.paint(m,a*TAU/8,el,PPM*2),a*CELL,f*CELL,CELL,CELL);prepared++}}pages.set([type,side,state].join(':'),{canvas:c,count})}
 let tree=document.createElement('canvas');tree.width=tree.height=CELL;tree.getContext('2d').drawImage(renderer.paint(treeModel(),0,el,PPM*2),0,0,CELL,CELL);
 return {pages,tree,prepared,ms:performance.now()-start,bytes:[...pages.values()].reduce((n,p)=>n+p.canvas.width*p.canvas.height*4,0)+CELL*CELL*4}
}
export function spriteFor(atlas,type,side,state,f,yaw){let p=atlas.pages.get([type,side,state].join(':'))||atlas.pages.get([type,side,'idle'].join(':')),a=((Math.round(yaw/TAU*8)%8)+8)%8;return {canvas:p.canvas,sx:a*CELL,sy:((f%p.count+p.count)%p.count)*CELL}}
