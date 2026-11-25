import {E} from '../../engine.js';
import {initArt,warmArt,paintArt,pendingArt,setArtPolicy} from './battle-art.js';
const clamp=E.clamp,PI=Math.PI,S=Math.sin(PI/3),T=.5,colors=['#315776','#97432e'],cream='#fff1d0',stagesLength=q=>1+(q.stages?.length||0);
function oval(g,x,y,rx,ry,fill,stroke,w=1){g.beginPath();g.ellipse(x,y,rx,ry,0,0,PI*2);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function poly(g,p,fill,stroke,w=1){g.beginPath();p.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=w;g.stroke()}}
function line(g,x,y,a,b,c,w=1){g.strokeStyle=c;g.lineWidth=w;g.beginPath();g.moveTo(x,y);g.lineTo(a,b);g.stroke()}
export function interpolateFrame(a,b,t){
 if(!b||t<=0)return a;if(t>=1)return b;
 const map=new Map(b.units.map(u=>[u.id,u]));
 return {...a,time:a.time+(b.time-a.time)*t,units:a.units.map(u=>{
  const v=map.get(u.id);if(!v)return u;const angle=Math.atan2(Math.sin(v.a-u.a),Math.cos(v.a-u.a)),lerp=k=>(u[k]??0)+((v[k]??0)-(u[k]??0))*t;
  let sectors=u.sectors?.map((q,i)=>{let p=v.sectors?.[i]||q;return {...q,bend:(q.bend||0)+((p.bend||0)-(q.bend||0))*t,cohesion:q.cohesion+(p.cohesion-q.cohesion)*t,share:q.share+(p.share-q.share)*t,pressure:(q.pressure||0)+((p.pressure||0)-(q.pressure||0))*t}});
  return {...u,x:lerp("x"),y:lerp("y"),a:u.a+angle*t,n:lerp("n"),fatigue:lerp("fatigue"),morale:lerp("morale"),cohesion:lerp("cohesion"),v:lerp("v"),sectors:sectors||u.sectors}
 })};
}

export class Battlefield{
 constructor(canvas){this.canvas=canvas;this.g=canvas.getContext('2d',{alpha:false});this.cam={z:1,x:0,y:0};this.layout={};this.stats={};this.layer=false;this.tilt=1;this.composition='C';this.F=E;this.state=null;this.backend='canvas';this.ready=initArt(canvas).then(a=>this.atlas=a)}
 resize(){let c=this.canvas,w=c.clientWidth,h=c.clientHeight,d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(w*d)||c.height!==Math.round(h*d)){c.width=Math.round(w*d);c.height=Math.round(h*d)}let portrait=h>w,base=Math.max(.1,Math.min((w-16)/this.F.H,(h-120)/(this.F.W*S)));this.layout={w,h,d,portrait,k:base*this.cam.z,cx:w/2+this.cam.x,cy:h/2+this.cam.y,base};return this.layout}
 height(x,y){return this.state?this.F.sample(this.state.terrain,clamp(x,0,this.F.W),clamp(y,0,this.F.H)).h:0}
 project(p){let {k,cx,cy}=this.layout;return {x:cx-(p.y-this.F.H/2)*k,y:cy+((p.x-this.F.W/2)*S-(this.height(p.x,p.y)-this.height(this.F.W/2,this.F.H/2))*T)*k}}
 world(p,clip=true){let {k,cx,cy}=this.layout,y=this.F.H/2-(p.x-cx)/k,x=this.F.W/2+(p.y-cy)/(k*S),h0=this.height(this.F.W/2,this.F.H/2);for(let i=0;i<5;i++)x=this.F.W/2+((p.y-cy)/k+(this.height(x,y)-h0)*T)/S;return clip?{x:clamp(x,0,this.F.W),y:clamp(y,0,this.F.H)}:{x,y}}
 camera(){let p=this.world({x:this.layout.w/2,y:this.layout.h/2},false);return {...p,k:this.layout.k,mode:this.composition}}
 zoom(f,p){let old=this.world(p,false);this.cam.z=clamp(this.cam.z*f,.8,45);this.resize();let q=this.project(old);this.cam.x+=p.x-q.x;this.cam.y+=p.y-q.y;this.resize()}
 setComposition(mode){if(!['A','C'].includes(mode))return false;this.composition=mode;if(mode==='A')this.fit();return true}
 fit(){this.cam={z:1,x:0,y:0};this.resize()}
 focus(p,z=4){if(!p)return;this.cam={z:clamp(z,.8,45),x:0,y:0};this.resize();let q=this.project(p);this.cam.x=this.layout.w*.5-q.x;this.cam.y=this.layout.h*.47-q.y;this.resize()}
 frameUnits(units,{margin=40,min=1,max=45}={}){if(!units.length)return;this.fit();let pts=[];for(let u of units)for(let b of this.F.bodies(u))for(let dx of [-b.geometry.d/2,b.geometry.d/2])for(let dy of [-b.geometry.w/2,b.geometry.w/2]){let x=b.x+dx*Math.cos(b.a)-dy*Math.sin(b.a),y=b.y+dx*Math.sin(b.a)+dy*Math.cos(b.a);pts.push({x,y,p:this.project({x,y})})}let a=Math.min(...pts.map(p=>p.p.x)),b=Math.max(...pts.map(p=>p.p.x)),c=Math.min(...pts.map(p=>p.p.y)),d=Math.max(...pts.map(p=>p.p.y)),l=this.layout;let p=this.world({x:(a+b)/2,y:(c+d)/2},false);this.focus(p,clamp(Math.min(l.w*.82/(b-a+2*margin*l.base),l.h*.68/(d-c+2*margin*l.base)),min,max))}
 screenTransform(){let d=this.layout.d;this.g.setTransform(d,0,0,d,0,0)}
 worldTransform(){this.screenTransform()}
 visible(u,pad=50){let p=this.project(u),{w,h}=this.layout;return p.x>-pad&&p.x<w+pad&&p.y>-pad&&p.y<h+pad}
 path(points,color='#f2d18d',width=2,dash=[]){if(points.length<2)return;this.screenTransform();let g=this.g;g.strokeStyle=color;g.lineWidth=width;g.lineCap='round';g.lineJoin='round';g.setLineDash(dash);g.beginPath();points.forEach((p,i)=>{let q=this.project(p);i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)});g.stroke();g.setLineDash([])}
 arrow(points,color){this.path(points,color,2,[6,4]);if(points.length<2)return;let p=this.project(points.at(-1)),a=this.project(points.at(-2)),angle=Math.atan2(p.y-a.y,p.x-a.x);this.g.save();this.g.translate(p.x,p.y);this.g.rotate(angle);poly(this.g,[[0,0],[-9,-4],[-9,4]],color);this.g.restore()}
 footprint(u,color='#efce80'){let g=this.g,s=this.F.dims(u),ca=Math.cos(u.a),sa=Math.sin(u.a),pts=[[-s.d/2,-s.w/2],[s.d/2,-s.w/2],[s.d/2,s.w/2],[-s.d/2,s.w/2]].map(([x,y])=>({x:u.x+x*ca-y*sa,y:u.y+x*sa+y*ca}));this.path([...pts,pts[0]],color,1.2,[4,3]);this.path([pts[1],pts[2]],color,2)}
 overview(canvas,state){if(!state||!canvas)return;let g=canvas.getContext('2d'),w=canvas.width,h=canvas.height,F=this.F,key=state.seed;if(this.mapKey!==key){this.mapKey=key;this.map=document.createElement('canvas');this.map.width=w;this.map.height=h;let c=this.map.getContext('2d');for(let y=0;y<h;y++)for(let x=0;x<w;x++){let q=F.sample(state.terrain,x/w*F.W,y/h*F.H);c.fillStyle=q.water?'#557d89':q.wood?'#40553d':q.road?'#ae9b72':'#89936b';c.fillRect(x,y,1,1)}}g.drawImage(this.map,0,0);for(let u of state.units){if(!F.alive(u))continue;g.fillStyle=colors[u.side];g.fillRect(u.x/F.W*w-1,u.y/F.H*h-1,3,3)}let ps=[[0,0],[this.layout.w,0],[this.layout.w,this.layout.h],[0,this.layout.h]].map(([x,y])=>this.world({x,y},false));poly(g,ps.map(p=>[p.x/F.W*w,p.y/F.H*h]),null,'#fff4cf',1)}
 setBackend(name){return name==='canvas'}
 setPolicy(p){setArtPolicy(p)}
 async prepare(state){this.state=state;this.F=E.forState(state);this.resize();return warmArt(state,this.layout,this.camera())}
 pending(){return pendingArt()}
 flag(u,selected){let g=this.g,p=this.project(u);g.save();g.translate(p.x,p.y-7);poly(g,[[0,-8],[12,-7],[9,-1],[0,-2]],colors[u.side],selected?'#f8d783':cream,.8);line(g,0,-8,0,7,'#514a38');g.restore()}
 draw(state,o={}){let start=performance.now();this.state=state;this.F=E.forState(state);let g=this.g,{w,h,k}=o.layoutReady?this.layout:this.resize();if(!this.atlas)return this.stats;this.stats=paintArt(state,this.layout,this.camera());let visible=state.units.filter(u=>this.F.alive(u)&&this.visible(u,100));if(o.deploy)this.path([{x:this.F.W*.4,y:0},{x:this.F.W*.4,y:this.F.H}],'#b2c6e0',1.5,[7,5]);
 this.screenTransform();
 for(const u of visible){if(o.selected?.has(u.id))this.footprint(u,"#f7d687");if(this.layer)for(let [i,b] of E.bodies(u).entries()){let q=E.sectors(u)[i];if(q.contact>0||q.pressure>.1){this.footprint({...u,x:b.x,y:b.y,a:b.a,geometry:b.geometry},'#d98c65')}}}
 for(const shot of state.shots||[]){let t=clamp((state.time-shot.time)/1.5,0,1),x=shot.x+(shot.tx-shot.x)*t,y=shot.y+(shot.ty-shot.y)*t;this.path([{x:x-(shot.tx-shot.x)*.045,y:y-(shot.ty-shot.y)*.045},{x,y}],"#473c28c0",1.8);this.path([{x:x-(shot.tx-shot.x)*.035,y:y-(shot.ty-shot.y)*.035},{x,y}],"#fff5d6",1)}
 if(o.orders&&o.campaign){let C=o.campaign,groups=new Map();for(const u of C.own()){let q=C.orders[u.id];if(!q)continue;let a=u;for(let [i,s] of [q,...(q.stages||[])].entries()){let dest=C.end(u,i),active=o.selected?.has(u.id)&&i===o.stage,color=s.kind==='retreat'?'#c2d9ed':s.kind==='hold'||s.kind==='brace'?'#a6c5a7':s.kind==='charge'||s.kind==='attack'?'#e1a27a':'#f4dc98',path=[a,...(s.path||[])];if(s.target!==undefined){let target=state.units.find(v=>v.id===s.target);if(target)path.push(target)}let key=(o.individual||o.selected?.size===1&&o.selected.has(u.id)?u.id:s.group||u.id)+'|'+i+'|'+s.kind+'|'+(s.when||'');let item=groups.get(key)||{paths:[],ends:[],active:false,color,stage:i,kind:s.kind};item.paths.push(path);item.ends.push(dest);item.active||=active;groups.set(key,item);if(active||i===stagesLength(q)-1)this.footprint(dest,active?'#fff1b2':'#d7c59a65');a=dest}}
 for(const item of [...groups.values()].sort((a,b)=>Number(a.active)-Number(b.active))){let paths=item.paths.filter(p=>p.length>1),count=Math.max(0,...paths.map(p=>p.length)),route=[];for(let i=0;i<count;i++){let points=paths.map(p=>p[Math.round(i*(p.length-1)/Math.max(1,count-1))]);route.push({x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length})}if(route.length>1)this.arrow(route,item.active?item.color:item.color+'60');let ends=item.ends;if(ends.length&&item.kind==='brace'){let c={x:ends.reduce((n,p)=>n+p.x,0)/ends.length,y:ends.reduce((n,p)=>n+p.y,0)/ends.length};let a=ends[0].a,w=Math.max(12,...ends.map(p=>Math.hypot(p.x-c.x,p.y-c.y)+E.dims(p).w/2));this.path([{x:c.x-Math.sin(a)*w,y:c.y+Math.cos(a)*w},{x:c.x+Math.sin(a)*w,y:c.y-Math.cos(a)*w}],item.active?item.color:item.color+'70',3,[5,3])}}
 }
 if(o.preview?.length>1)this.path(o.preview,"#fff3b3",2,[4,3]);if(o.linePreview)for(const u of Object.values(o.linePreview))this.footprint(u,"#fff5c6");
 this.screenTransform();for(const u of visible)if(k<.8||k<1.6&&o.selected?.has(u.id))this.flag(u,o.selected?.has(u.id));this.screenTransform();
 for(const h of o.handles||[]){let p=this.project(h);oval(g,p.x,p.y,h.kind==="point"?10:13,h.kind==="point"?10:13,h.kind==="point"?"#163947":"#fff1d1","#25475b",1.5);g.fillStyle=h.kind==="point"?cream:"#25475b";g.font="bold 13px system-ui";g.textAlign="center";g.textBaseline="middle";g.fillText(h.kind==="point"?String(h.index+1):({center:"✥",rotate:"↻",spread:"↔",depth:"↕"}[h.kind]||"·"),p.x,p.y)}
 if(o.selectionStroke?.length>1){g.strokeStyle="#fff3bf";g.fillStyle="#ffdf9130";g.lineWidth=1.4;g.beginPath();o.selectionStroke.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fill();g.stroke()}
 this.stats.drawMs=performance.now()-start;return this.stats
 }
}
