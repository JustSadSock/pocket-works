import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();

const W=760,H=470, STORAGE='pocket-works:shevel:project:v1', PX=12;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#stage'), ctx=canvas.getContext('2d',{alpha:false});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(n,fall=0)=>Number.isFinite(+n)?+n:fall;
let idCounter=1, frame=0, tool='select', selected=null, selectedNode=null, playing=false, loop=true, onion=true, pointer=null;
let undo=[],redo=[],saveTimer=null,toastTimer=null,raf=0,playStarted=0,exportCancelled=false, modalOpen=false;
let brush={color:'#303c3d',width:8};
const view={zoom:1,panX:0,panY:0}, touches=new Map();let pinch=null;
const nextId=()=> 'obj'+Date.now().toString(36)+(idCounter++).toString(36);
const point=(x,y)=>[Math.round(x*10)/10,Math.round(y*10)/10];
function stroke(points,c='#364647',w=5,fill=null,closed=false){return {p:points.map(p=>point(...p)),c,w,fill,closed}}
function oval(x,y,rx,ry,n=42){return Array.from({length:n},(_,i)=>point(x+rx*Math.cos(i/n*Math.PI*2),y+ry*Math.sin(i/n*Math.PI*2)))}
function newObj(name='Рисунок',x=380,y=235,strokes=[],f=frame){return {id:nextId(),name,start:f,cels:[{f,strokes}],keys:[{f,x,y,r:0,scale:1,ease:'smooth'}],nodes:[],squash:0}}
function seed(){
 const ground=newObj('Сцена',380,380,[
   stroke([[-370,16],[-280,11],[-190,15],[-60,10],[55,14],[175,12],[350,15]],'#c4c5b5',3),
   stroke([[-300,30],[-287,27],[-270,30]],'#9eae92',2),
   stroke([[155,27],[166,24],[178,29]],'#9eae92',2)
 ],0);
 const goose=newObj('Гусь',180,287,[
   stroke(oval(0,20,64,43),'#405254',5,'#faf6e9',true),
   stroke([[-37,5],[-56,-9],[-50,-17],[-25,-9],[-14,1]],'#506366',4,'#e3e4d7',true),
   stroke([[-7,-5],[-10,-58],[-3,-92],[11,-105],[25,-103],[32,-94],[31,-76],[20,-63],[14,-11]],'#405254',5,'#faf6e9',true),
   stroke(oval(19,-99,18,18),'#405254',4,'#faf6e9',true),
   stroke([[33,-102],[60,-91],[33,-84]],'#c78050',4,'#e7ae6e',true),
   stroke(oval(23,-105,2.8,2.8),'#394648',2,'#394648',true),
   stroke([[-20,56],[-22,81],[-31,81],[-16,82],[-10,81]],'#c58250',4),
   stroke([[27,55],[25,82],[18,84],[34,82],[40,86]],'#c58250',4),
   stroke([[47,9],[57,0],[63,-8]],'#405254',4)
 ],0);
 goose.keys=[{f:0,x:180,y:287,r:0,scale:1,ease:'smooth'},{f:25,x:370,y:278,r:-5,scale:1,ease:'smooth'},{f:48,x:505,y:285,r:7,scale:1,ease:'smooth'},{f:71,x:555,y:285,r:0,scale:1,ease:'smooth'}];
 const ball=newObj('Мяч',525,350,[
   stroke(oval(0,0,24,24),'#5e514e',4,'#d98559',true),
   stroke([[-13,-16],[2,-22],[13,-14]],'#f8d6a2',3),
   stroke([[-12,16],[5,20],[15,10]],'#a95444',2)
 ],0);
 ball.keys=[{f:0,x:525,y:350,r:0,scale:1,ease:'smooth'},{f:18,x:475,y:148,r:220,scale:1,ease:'smooth'},{f:37,x:440,y:351,r:420,scale:1,ease:'smooth'},{f:57,x:330,y:351,r:650,scale:1,ease:'smooth'},{f:71,x:300,y:351,r:710,scale:1,ease:'smooth'}];
 ball.squash=55;
 return {name:'Гусь и мяч',fps:12,frames:72,objects:[ground,goose,ball]};
}
function validate(data){
 if(!data||typeof data!=='object'||!Array.isArray(data.objects)||data.objects.length>80)throw Error('Неверный формат проекта');
 const fps=clamp(Math.round(num(data.fps,12)),6,24), frames=clamp(Math.round(num(data.frames,72)),12,240);
 let total=0;
 const objects=data.objects.map((o,i)=>{
   if(!o||!Array.isArray(o.keys)||!o.keys.length||!Array.isArray(o.cels)||!o.cels.length)throw Error('Повреждён объект');
   const keys=o.keys.slice(0,250).map(k=>({f:clamp(Math.round(num(k.f)),0,frames-1),x:clamp(num(k.x),-5000,5000),y:clamp(num(k.y),-5000,5000),r:clamp(num(k.r),-10000,10000),scale:clamp(num(k.scale,1),.1,4),ease:['linear','smooth','snap','hold'].includes(k.ease)?k.ease:'smooth'})).sort((a,b)=>a.f-b.f);
   const cels=o.cels.slice(0,240).map(c=>({f:clamp(Math.round(num(c.f)),0,frames-1),strokes:(Array.isArray(c.strokes)?c.strokes:[]).slice(0,300).map(s=>{const p=(Array.isArray(s.p)?s.p:[]).slice(0,3000).filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(p=>[clamp(+p[0],-2000,2000),clamp(+p[1],-2000,2000)]);total+=p.length;return {p,c:/^#[a-f0-9]{6}$/i.test(s.c)?s.c:'#364647',w:clamp(num(s.w,5),1,50),fill:/^#[a-f0-9]{6}$/i.test(s.fill)?s.fill:null,closed:!!s.closed}})})).sort((a,b)=>a.f-b.f);
   const nodes=(Array.isArray(o.nodes)?o.nodes:[]).slice(0,24).map((n,j)=>({id:String(n.id||j),x:clamp(num(n.x),-2000,2000),y:clamp(num(n.y),-2000,2000),poses:(Array.isArray(n.poses)?n.poses:[]).slice(0,250).map(p=>({f:clamp(Math.round(num(p.f)),0,frames-1),dx:clamp(num(p.dx),-1500,1500),dy:clamp(num(p.dy),-1500,1500)})).sort((a,b)=>a.f-b.f)}));
   return {id:String(o.id||nextId()),name:String(o.name||'Рисунок').slice(0,48),start:clamp(Math.round(num(o.start)),0,frames-1),keys,cels,nodes,squash:clamp(num(o.squash),0,100)}
 });
 if(total>150000)throw Error('Слишком большой проект');
 return {name:String(data.name||'Без названия').slice(0,46),fps,frames,objects};
}
let project;
try{const raw=localStorage.getItem(STORAGE);project=raw?validate(JSON.parse(raw)):seed()}catch{project=seed()}
selected=project.objects.find(o=>o.name==='Гусь')?.id||project.objects.at(-1)?.id||null;
function active(){return project.objects.find(o=>o.id===selected)||null}
function snapshot(){undo.push(JSON.stringify(project));if(undo.length>40)undo.shift();redo=[]}
function save(){clearTimeout(saveTimer);$('#saveState').textContent='Сохранение…';saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE,JSON.stringify(project));$('#saveState').textContent='Сохранено'}catch{toast('Память заполнена — сохрани проект через экспорт')}},350)}
function changed({structure=false}={}){save();render();if(structure)refreshTimeline();refreshInspector();refreshHeader()}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function stop(){playing=false;cancelAnimationFrame(raf);$('#playBtn').textContent='▶';$('#playBtn').setAttribute('aria-label','Воспроизвести')}
function play(){if(playing){stop();return}if(modalOpen)return;playing=true;$('#playBtn').textContent='Ⅱ';$('#playBtn').setAttribute('aria-label','Пауза');playStarted=performance.now()-frame*1000/project.fps;function tick(t){if(!playing)return;let f=Math.floor((t-playStarted)*project.fps/1000);if(f>=project.frames){if(loop){playStarted=t;f=0}else{frame=project.frames-1;stop();syncFrame();return}}frame=f;syncFrame(false);ensureFrameVisible();raf=requestAnimationFrame(tick)}raf=requestAnimationFrame(tick)}
function setFrame(n){frame=clamp(Math.round(n),0,project.frames-1);if(playing)playStarted=performance.now()-frame*1000/project.fps;syncFrame();ensureFrameVisible()}
function ensureFrameVisible(){const el=$('#trackRight'),x=frame*PX+6;if(x<el.scrollLeft+12)el.scrollLeft=Math.max(0,x-25);else if(x>el.scrollLeft+el.clientWidth-24)el.scrollLeft=Math.max(0,x-el.clientWidth+45)}
function syncFrame(inspect=true){render();refreshHeader();updatePlayhead();if(inspect)refreshInspector()}
function ease(t,mode){t=clamp(t,0,1);return mode==='hold'?0:mode==='linear'?t:mode==='snap'?1-Math.pow(1-t,4):t*t*(3-2*t)}
function interpolate(keys,f,fields,defaults){if(!keys.length)return {...defaults};if(f<=keys[0].f)return {...keys[0]};if(f>=keys.at(-1).f)return {...keys.at(-1)};let i=1;while(i<keys.length&&keys[i].f<f)i++;const a=keys[i-1],b=keys[i],t=ease((f-a.f)/(b.f-a.f),b.ease||'smooth'),out={...b};for(const name of fields)out[name]=num(a[name],defaults[name])+(num(b[name],defaults[name])-num(a[name],defaults[name]))*t;return out}
function transform(o,f){return interpolate(o.keys,f,['x','y','r','scale'],{x:0,y:0,r:0,scale:1})}
function celAt(o,f){return o.cels.filter(c=>c.f<=f).at(-1)||o.cels[0]}
function poseAt(node,f){return interpolate(node.poses,f,['dx','dy'],{dx:0,dy:0})}
function poseKey(node,f){let k=node.poses.find(k=>k.f===f);if(!k){const p=poseAt(node,f);k={f,dx:p.dx,dy:p.dy};node.poses.push(k);node.poses.sort((a,b)=>a.f-b.f)}return k}
function keyAt(o,f){let k=o.keys.find(k=>k.f===f);if(!k){const p=transform(o,f);k={f,x:p.x,y:p.y,r:p.r,scale:p.scale,ease:'smooth'};o.keys.push(k);o.keys.sort((a,b)=>a.f-b.f)}return k}
function deform(p,o,f){
 if(!o.nodes.length)return p;
 let x=p[0],y=p[1],sum=0,dx=0,dy=0;
 for(const n of o.nodes){const d2=(x-n.x)**2+(y-n.y)**2;const wt=1/(1+d2/3500)**2;const q=poseAt(n,f);dx+=q.dx*wt;dy+=q.dy*wt;sum+=wt}
 const influence=clamp(sum,0,1);return [x+dx/(sum||1)*influence,y+dy/(sum||1)*influence]
}
function factors(o,f){const t=transform(o,f);let sx=1,sy=1;if(o.squash){const b=transform(o,Math.max(0,f-1)),d=Math.hypot(t.x-b.x,t.y-b.y),a=clamp(d/38,0,.24)*o.squash/100;if(Math.abs(t.x-b.x)>Math.abs(t.y-b.y)){sx+=a;sy-=a*.8}else{sy+=a;sx-=a*.8}}return {...t,sx,sy}}
function worldToLocal(x,y,o,f){const t=factors(o,f),a=-t.r*Math.PI/180,dx=x-t.x,dy=y-t.y;return [(dx*Math.cos(a)-dy*Math.sin(a))/(t.scale*t.sx),(dx*Math.sin(a)+dy*Math.cos(a))/(t.scale*t.sy)]}
function localToWorld(x,y,o,f){const t=factors(o,f),a=t.r*Math.PI/180,u=x*t.scale*t.sx,v=y*t.scale*t.sy;return [t.x+u*Math.cos(a)-v*Math.sin(a),t.y+u*Math.sin(a)+v*Math.cos(a)]}
function trace(g,s,o,f){
 const pts=s.p;if(pts.length===0)return;
 const first=deform(pts[0],o,f);g.beginPath();if(pts.length===1){g.arc(first[0],first[1],Math.max(.5,s.w/2),0,Math.PI*2);g.fillStyle=s.c;g.fill();return}g.moveTo(...first);
 for(let i=1;i<pts.length;i++){const q=deform(pts[i],o,f);g.lineTo(...q)}
 if(s.closed){g.closePath();if(s.fill){g.fillStyle=s.fill;g.fill()}}
 g.strokeStyle=s.c;g.lineWidth=s.w;g.lineJoin='round';g.lineCap='round';g.stroke();
}
function drawObject(g,o,f,opacity=1,override=null){
 if(f<o.start)return;
 const t=factors(o,f);g.save();g.translate(t.x,t.y);g.rotate(t.r*Math.PI/180);g.scale(t.scale*t.sx,t.scale*t.sy);g.globalAlpha*=opacity;
 const c=celAt(o,f);if(c)for(const s of c.strokes){if(override){const s2={...s,c:override,fill:null};trace(g,s2,o,f)}else trace(g,s,o,f)}
 g.restore();
}
function renderScene(g,f,{guides=true}={}){
 g.save();const factorX=g.canvas.width/W,factorY=g.canvas.height/H;const v=guides?view:{zoom:1,panX:0,panY:0};g.setTransform(1,0,0,1,0,0);g.fillStyle='#f4eddf';g.fillRect(0,0,g.canvas.width,g.canvas.height);g.setTransform(factorX*v.zoom,0,0,factorY*v.zoom,factorX*v.panX,factorY*v.panY);
 // stage tint and framing - stable photographic animation desk
 g.fillStyle='#f2e8d6';g.fillRect(16,16,W-32,H-32);
 g.strokeStyle='#dcd2bc';g.lineWidth=1;g.strokeRect(16.5,16.5,W-33,H-33);
 if(guides){g.setLineDash([3,7]);g.strokeStyle='#d9d2c2';g.beginPath();g.moveTo(W/2,25);g.lineTo(W/2,H-25);g.moveTo(25,H/2);g.lineTo(W-25,H/2);g.stroke();g.setLineDash([]);}
 if(guides&&tool==='draw'&&onion&&!playing){for(const o of project.objects){if(f>0)drawObject(g,o,f-1,.16,'#4497a7');if(f+1<project.frames)drawObject(g,o,f+1,.16,'#da794d')}}
 for(const o of project.objects)drawObject(g,o,f);
 if(guides&&!playing){const o=active();if(o&&f>=o.start){if(tool==='select'||tool==='draw')drawSelection(g,o,f);if(tool==='rig')drawRig(g,o,f)}}
 g.restore();
}
function bounds(o,f){const c=celAt(o,f);if(!c)return null;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const s of c.strokes){for(const p of s.p){const q=deform(p,o,f);x0=Math.min(x0,q[0]-s.w/2);y0=Math.min(y0,q[1]-s.w/2);x1=Math.max(x1,q[0]+s.w/2);y1=Math.max(y1,q[1]+s.w/2)}}if(x0===Infinity)return {x0:-16,y0:-16,x1:16,y1:16};return {x0,y0,x1,y1}}
function drawSelection(g,o,f){const b=bounds(o,f);if(!b)return;const pad=13,pts=[[b.x0-pad,b.y0-pad],[b.x1+pad,b.y0-pad],[b.x1+pad,b.y1+pad],[b.x0-pad,b.y1+pad]].map(p=>localToWorld(...p,o,f));g.save();g.setLineDash([7,5]);g.strokeStyle='#d4764c';g.lineWidth=1.5;g.beginPath();g.moveTo(...pts[0]);pts.slice(1).forEach(p=>g.lineTo(...p));g.closePath();g.stroke();g.setLineDash([]);for(const p of pts){g.fillStyle='#f8ead5';g.strokeStyle='#c96f49';g.fillRect(p[0]-4,p[1]-4,8,8);g.strokeRect(p[0]-4,p[1]-4,8,8)}g.restore()}
function drawRig(g,o,f){g.save();g.setLineDash([5,5]);g.strokeStyle='#6e9992';g.lineWidth=2;for(let i=1;i<o.nodes.length;i++){const a=o.nodes[i-1],b=o.nodes[i],p=poseAt(a,f),q=poseAt(b,f);const aw=localToWorld(a.x+p.dx,a.y+p.dy,o,f),bw=localToWorld(b.x+q.dx,b.y+q.dy,o,f);g.beginPath();g.moveTo(...aw);g.lineTo(...bw);g.stroke()}g.setLineDash([]);for(const n of o.nodes){const p=poseAt(n,f),w=localToWorld(n.x+p.dx,n.y+p.dy,o,f),sel=n.id===selectedNode;g.beginPath();g.arc(...w,sel?9:7,0,Math.PI*2);g.fillStyle=sel?'#d9794b':'#f8ede0';g.strokeStyle='#4e766f';g.lineWidth=3;g.fill();g.stroke();g.beginPath();g.moveTo(w[0]-3,w[1]);g.lineTo(w[0]+3,w[1]);g.moveTo(w[0],w[1]-3);g.lineTo(w[0],w[1]+3);g.strokeStyle=sel?'#fff6e6':'#4e766f';g.lineWidth=1;g.stroke()}g.restore()}
function render(){if(!ctx)return;renderScene(ctx,frame)}
const resizeObserver=new ResizeObserver(()=>{const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;const ratio=Math.min(window.devicePixelRatio||1,2.5);const w=Math.round(box.width*ratio),h=Math.round(box.height*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}render()});resizeObserver.observe(canvas);
function canvasPoint(e){const rect=canvas.getBoundingClientRect();return [clamp(((e.clientX-rect.left)*W/rect.width-view.panX)/view.zoom,0,W),clamp(((e.clientY-rect.top)*H/rect.height-view.panY)/view.zoom,0,H)]}
function clampView(){view.panX=clamp(view.panX,W*(1-view.zoom),0);view.panY=clamp(view.panY,H*(1-view.zoom),0);$('#zoomText').textContent=Math.round(view.zoom*100)+'%';render()}
function setZoom(zoom){const z=clamp(zoom,1,4),midX=(W/2-view.panX)/view.zoom,midY=(H/2-view.panY)/view.zoom;view.zoom=z;view.panX=W/2-midX*z;view.panY=H/2-midY*z;clampView()}
function zoomBegin(){const pts=[...touches.values()];if(pts.length<2)return;const rect=canvas.getBoundingClientRect(),p0=pts[0],p1=pts[1],mx=((p0[0]+p1[0])/2-rect.left)*W/rect.width,my=((p0[1]+p1[1])/2-rect.top)*H/rect.height;pinch={distance:Math.max(10,Math.hypot(p1[0]-p0[0],p1[1]-p0[1])),zoom:view.zoom,worldX:(mx-view.panX)/view.zoom,worldY:(my-view.panY)/view.zoom};}
function zoomMove(){if(!pinch||touches.size<2)return;const pts=[...touches.values()],rect=canvas.getBoundingClientRect(),p0=pts[0],p1=pts[1];const d=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),mx=((p0[0]+p1[0])/2-rect.left)*W/rect.width,my=((p0[1]+p1[1])/2-rect.top)*H/rect.height;view.zoom=clamp(pinch.zoom*d/pinch.distance,1,4);view.panX=mx-pinch.worldX*view.zoom;view.panY=my-pinch.worldY*view.zoom;clampView()}
function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t)}
function insidePolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside}return inside}
function hitObject(x,y){for(let i=project.objects.length-1;i>=0;i--){const o=project.objects[i];if(frame<o.start)continue;const c=celAt(o,frame);if(!c)continue;const p=worldToLocal(x,y,o,frame);for(let j=c.strokes.length-1;j>=0;j--){const s=c.strokes[j],pts=s.p.map(q=>deform(q,o,frame));if(s.fill&&insidePolygon(p,pts))return {o,index:j};for(let n=1;n<pts.length;n++)if(segmentDistance(p,pts[n-1],pts[n])<Math.max(10,s.w/2+7))return {o,index:j};if(pts.length===1&&Math.hypot(p[0]-pts[0][0],p[1]-pts[0][1])<12)return {o,index:j}}}return null}
function nearestNode(o,x,y){let best=null,d=Infinity;for(const n of o.nodes){const p=poseAt(n,frame),a=localToWorld(n.x+p.dx,n.y+p.dy,o,frame),dist=Math.hypot(x-a[0],y-a[1]);if(dist<d){d=dist;best=n}}return d<22?best:null}
function ensureCel(o,f){let cel=o.cels.find(c=>c.f===f);if(!cel){const inherited=celAt(o,f);cel={f,strokes:inherited?structuredClone(inherited.strokes):[]};o.cels.push(cel);o.cels.sort((a,b)=>a.f-b.f)}return cel}
function onPointerDown(e){if(playing||modalOpen||e.button>0)return;e.preventDefault();const [x,y]=canvasPoint(e);canvas.setPointerCapture(e.pointerId);const hit=hitObject(x,y);pointer={id:e.pointerId,x,y,last:[x,y],changed:false,hit,kind:null};
 if(tool==='select'){if(hit){selected=hit.o.id;selectedNode=null;pointer.kind='move';const t=transform(hit.o,frame);pointer.base=t}else{selected=null;pointer.kind='none'}refreshInspector();refreshTimeline();render()}
 else if(tool==='draw'){let o=active();if(!o){snapshot();o=newObj('Рисунок '+(project.objects.length+1),x,y,[],frame);project.objects.push(o);selected=o.id;pointer.changed=true}if(frame<o.start)o.start=frame;if(!pointer.changed)snapshot();const cel=ensureCel(o,frame);const local=worldToLocal(x,y,o,frame);const s=stroke([local],brush.color,brush.width);cel.strokes.push(s);pointer.kind='draw';pointer.stroke=s;pointer.object=o;pointer.changed=true;render();refreshTimeline();refreshInspector()}
 else if(tool==='rig'){let o=active();if(!o&&hit){o=hit.o;selected=o.id}if(!o){toast('Сначала выбери объект');pointer.kind='none';return}if(frame<o.start){toast('Объект ещё не появился');pointer.kind='none';return}let n=nearestNode(o,x,y);if(!n){snapshot();const p=worldToLocal(x,y,o,frame);n={id:nextId(),x:p[0],y:p[1],poses:[]};o.nodes.push(n);pointer.changed=true;toast('Сустав добавлен · перетащи его')}selectedNode=n.id;pointer.kind='joint';pointer.object=o;pointer.node=n;const pose=poseAt(n,frame);pointer.basePose={...pose};render();refreshInspector();refreshTimeline()}
 else if(tool==='erase'){if(hit){snapshot();const cel=ensureCel(hit.o,frame);const p=worldToLocal(x,y,hit.o,frame);let candidate=-1,best=Infinity;for(let j=0;j<cel.strokes.length;j++){const s=cel.strokes[j];for(let k=0;k<s.p.length;k++){const d=Math.hypot(p[0]-s.p[k][0],p[1]-s.p[k][1]);if(d<best){best=d;candidate=j}}}if(candidate>=0&&best<24){cel.strokes.splice(candidate,1);selected=hit.o.id;pointer.changed=true;changed({structure:true})}}pointer.kind='erase'}
}
function onPointerMove(e){if(!pointer||pointer.id!==e.pointerId)return;e.preventDefault();const [x,y]=canvasPoint(e),p=pointer;p.last=[x,y];if(p.kind==='draw'){const local=worldToLocal(x,y,p.object,frame),arr=p.stroke.p,last=arr.at(-1);if(Math.hypot(local[0]-last[0],local[1]-last[1])>1.4){arr.push(point(...local));render()}}
 else if(p.kind==='move'){const dx=x-p.x,dy=y-p.y;if(!p.changed&&Math.hypot(dx,dy)>3){snapshot();p.changed=true}if(p.changed){const o=active(),k=keyAt(o,frame);k.x=p.base.x+dx;k.y=p.base.y+dy;render();refreshInspector()}}
 else if(p.kind==='joint'){const d=Math.hypot(x-p.x,y-p.y);if(!p.changed&&d>3){snapshot();p.changed=true}if(p.changed){const o=p.object,n=p.node,loc=worldToLocal(x,y,o,frame);const key=poseKey(n,frame);key.dx=clamp(loc[0]-n.x,-1000,1000);key.dy=clamp(loc[1]-n.y,-1000,1000);render()}}
}
function onPointerUp(e){if(!pointer||pointer.id!==e.pointerId)return;try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)}catch{}const changedGesture=pointer.changed;pointer=null;if(changedGesture)changed({structure:true})}
canvas.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'){touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size>=2){if(pointer?.kind==='draw'&&pointer.stroke?.p.length===1){const cel=pointer.object?.cels.find(c=>c.f===frame);if(cel)cel.strokes=cel.strokes.filter(s=>s!==pointer.stroke)}if(pointer?.changed)changed({structure:true});pointer=null;zoomBegin();try{canvas.setPointerCapture(e.pointerId)}catch{}return}if(pinch)return}
 onPointerDown(e)
});
canvas.addEventListener('pointermove',e=>{if(touches.has(e.pointerId))touches.set(e.pointerId,[e.clientX,e.clientY]);if(pinch){zoomMove();return}onPointerMove(e)});
const release=e=>{if(pinch){touches.delete(e.pointerId);if(touches.size<2){pinch=null;pointer=null}return}onPointerUp(e);touches.delete(e.pointerId)};
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('lostpointercapture',()=>{if(pointer){const ch=pointer.changed;pointer=null;if(ch)changed({structure:true})}});
$('#focusBtn').addEventListener('click',()=>{const focus=$('.shell').classList.toggle('canvas-focus');$('#focusBtn').setAttribute('aria-pressed',String(focus));$('#focusBtn').setAttribute('aria-label',focus?'Закрыть увеличенный холст':'Развернуть холст');$('#focusBtn').textContent=focus?'⤡':'⤢';requestAnimationFrame(()=>{resizeObserver.observe(canvas);render()})});
$('#zoomExpand').addEventListener('click',()=>{const opened=$('.zoom-deck').classList.toggle('expanded');$('#zoomExpand').setAttribute('aria-expanded',String(opened))});
$('#zoomIn').addEventListener('click',()=>setZoom(view.zoom*1.25));
$('#zoomOut').addEventListener('click',()=>setZoom(view.zoom/1.25));
$('#zoomReset').addEventListener('click',()=>{view.zoom=1;view.panX=0;view.panY=0;clampView()});
canvas.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(view.zoom*(e.deltaY<0?1.13:1/1.13))},{passive:false});
function setTool(next){if(playing)stop();tool=next;$$('[data-tool]').forEach(b=>{const active=b.dataset.tool===tool;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});['select','draw','rig','erase'].forEach(n=>$('#'+n+'Controls').hidden=n!==tool);const data={select:['ПЕРЕМЕЩЕНИЕ','Перетащи, чтобы создать ключ','Перетащи рисунок, чтобы создать ключ'],draw:['РИСОВАНИЕ','Каждый кадр можно перерисовать','Рисуй на выбранном объекте'],rig:['СУСТАВЫ','Расставь точки и согни форму','Коснись, чтобы добавить сустав · тяни, чтобы согнуть'],erase:['ЛАСТИК','Удаляет отдельные линии','Коснись линии для удаления']}[tool];$('#modeTitle').textContent=data[0];$('#modeSubtitle').textContent=data[1];$('#modeHint').textContent=data[2];$('#modeHint').classList.remove('faded');setTimeout(()=>$('#modeHint').classList.add('faded'),4000);render()}
$$('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
function refreshHeader(){$('#projectName').value=project.name;$('#stageInfo').textContent=project.fps+' FPS';$('#objectLabel').textContent=active()?.name||'Ничего не выбрано';$('#timeValue').textContent='00:'+String(Math.floor(frame/project.fps)).padStart(2,'0')+'.'+String(Math.floor((frame%project.fps)/project.fps*100)).padStart(2,'0');$('#frameValue').textContent=String(frame+1).padStart(3,'0')+' / '+String(project.frames).padStart(3,'0');$('#undoBtn').disabled=!undo.length;$('#redoBtn').disabled=!redo.length}
function refreshInspector(){const o=active();$$('#properties input[data-prop]').forEach(i=>i.disabled=!o);$('#selectedName').textContent=o?.name||'Объект не выбран';$('#keyState').textContent=o?(o.keys.some(k=>k.f===frame)?'Ключ · '+(frame+1):'Между ключами'):'—';$('#actionBtn').disabled=!o;$('#rotationBtn').disabled=!o;$('#duplicateBtn').disabled=!o;$('#deleteObjectBtn').disabled=!o;$('#deleteRigBtn').disabled=!o||!selectedNode;$('#resetRigBtn').disabled=!o||!o.nodes.length;$('#copyCelBtn').disabled=!o;$('#blankCelBtn').disabled=!o;const t=o?transform(o,frame):{x:0,y:0,r:0,scale:1};for(const input of $$('[data-prop]')){if(document.activeElement===input)continue;const k=input.dataset.prop;input.value=k==='r'?Math.round(t.r):k==='scale'?Math.round(t.scale*100):Math.round(t[k])}if(document.activeElement!==$('#easeSelect'))$('#easeSelect').value=(o?.keys.find(k=>k.f===frame)||o?.keys.find(k=>k.f>frame)||o?.keys.at(-1))?.ease||'smooth';$('#squashInput').value=o?.squash||0;$('#squashValue').textContent=(o?.squash||0)+'%'}
function refreshTimeline(){const wide=Math.max(PX*project.frames,Math.ceil($('#trackRight').clientWidth||300));$('#ruler').style.width=wide+'px';$('#rulerTicks').replaceChildren();for(let f=0;f<project.frames;f+=3){const e=document.createElement('div');e.className='tick'+(f%12===0?' major':'');e.style.left=(f*PX+6)+'px';if(f%12===0){const t=document.createElement('label');t.textContent=(f/project.fps).toFixed(f%project.fps?1:0)+'s';e.append(t)}$('#rulerTicks').append(e)}$('#trackNames').replaceChildren();$('#tracks').replaceChildren();$('#tracks').style.width=wide+'px';$('#tracks').style.position='relative';for(const o of project.objects){const b=document.createElement('button');b.type='button';b.textContent=o.name;b.className=o.id===selected?'active':'';b.title=o.name;b.addEventListener('click',()=>{selected=o.id;refreshTimeline();refreshInspector();render();refreshHeader()});$('#trackNames').append(b);
 const row=document.createElement('div');row.className='track-row'+(o.id===selected?' selected':'');row.style.width=wide+'px';const range=document.createElement('div');range.className='rangebar';range.style.left=(o.start*PX+5)+'px';range.style.right='4px';row.append(range);
 function mark(f,type,label){const k=document.createElement('div');k.className='key '+type;k.style.left=(f*PX+6)+'px';k.title=label+' · кадр '+(f+1);k.addEventListener('click',e=>{e.stopPropagation();selected=o.id;setFrame(f);refreshTimeline()});row.append(k)}
 for(const k of o.keys)mark(k.f,'transform','Движение');for(const c of o.cels)mark(c.f,'cel','Рисунок');for(const n of o.nodes)for(const k of n.poses)mark(k.f,'joint','Сустав');row.addEventListener('click',e=>{selected=o.id;const r=row.getBoundingClientRect();setFrame((e.clientX-r.left)/PX);refreshTimeline()});$('#tracks').append(row)}
 $('#trackRight').querySelector('#timelineHead')?.remove();const playhead=document.createElement('div');playhead.className='timeline-playhead';playhead.id='timelineHead';$('#trackRight').append(playhead);refreshFilmstrip();updatePlayhead()}
function refreshFilmstrip(){
 const strip=$('#filmstrip');if(!strip||getComputedStyle(strip).display==='none')return;
 const scroll=strip.scrollLeft;strip.replaceChildren();
 const step=Math.max(1,Math.ceil(project.frames/12));
 for(let f=0;f<project.frames;f+=step){
  const b=document.createElement('button');b.type='button';b.className='film-frame';b.dataset.frame=String(f);b.title='Перейти к кадру '+(f+1);b.setAttribute('aria-label','Кадр '+(f+1));
  const thumb=document.createElement('canvas');thumb.width=144;thumb.height=89;renderScene(thumb.getContext('2d'),f,{guides:false});
  const label=document.createElement('span');label.textContent=String(f+1).padStart(3,'0');
  b.append(thumb,label);b.addEventListener('click',()=>{stop();setFrame(f)});
  strip.append(b)
 }
 strip.scrollLeft=scroll
}
function updatePlayhead(){const left=(frame*PX+6)+'px';$('#rulerHead').style.left=left;const e=$('#timelineHead');if(e)e.style.left=left;const step=Math.max(1,Math.ceil(project.frames/12));const bucket=Math.floor(frame/step)*step;for(const b of document.querySelectorAll('#filmstrip .film-frame'))b.classList.toggle('active',+b.dataset.frame===bucket)}
$('#ruler').addEventListener('pointerdown',e=>{if(playing)stop();const r=$('#ruler').getBoundingClientRect();setFrame((e.clientX-r.left)/PX);$('#ruler').setPointerCapture(e.pointerId)});$('#ruler').addEventListener('pointermove',e=>{if(e.buttons&&$('#ruler').hasPointerCapture(e.pointerId)){const r=$('#ruler').getBoundingClientRect();setFrame((e.clientX-r.left)/PX)}});
$('#playBtn').addEventListener('click',play);$('#prevBtn').addEventListener('click',()=>{stop();setFrame(frame-1)});$('#nextBtn').addEventListener('click',()=>{stop();setFrame(frame+1)});$('#loopBtn').addEventListener('click',()=>{loop=!loop;$('#loopBtn').classList.toggle('active',loop);$('#loopBtn').setAttribute('aria-pressed',String(loop))});
$('#undoBtn').addEventListener('click',()=>{if(!undo.length)return;stop();redo.push(JSON.stringify(project));project=validate(JSON.parse(undo.pop()));selected=project.objects.some(o=>o.id===selected)?selected:project.objects.at(-1)?.id||null;frame=clamp(frame,0,project.frames-1);changed({structure:true})});
$('#redoBtn').addEventListener('click',()=>{if(!redo.length)return;stop();undo.push(JSON.stringify(project));project=validate(JSON.parse(redo.pop()));selected=project.objects.some(o=>o.id===selected)?selected:project.objects.at(-1)?.id||null;frame=clamp(frame,0,project.frames-1);changed({structure:true})});
$('#newObjectBtn').addEventListener('click',()=>{stop();snapshot();const o=newObj('Рисунок '+(project.objects.length+1));project.objects.push(o);selected=o.id;setTool('draw');changed({structure:true});toast('Новый объект · нарисуй его на холсте')});
$('#duplicateBtn').addEventListener('click',()=>{const o=active();if(!o)return;snapshot();const c=structuredClone(o);c.id=nextId();c.name=(c.name+' копия').slice(0,48);c.keys.forEach(k=>{k.x+=28;k.y+=20});c.nodes.forEach(n=>n.id=nextId());project.objects.push(c);selected=c.id;changed({structure:true});toast('Объект скопирован')});
$('#rotationBtn').addEventListener('click',()=>{const o=active();if(!o)return;snapshot();keyAt(o,frame).r+=15;changed({structure:true})});
$('#drawColor').addEventListener('input',e=>brush.color=e.target.value);$('#drawSize').addEventListener('input',e=>brush.width=+e.target.value);$('#onionBtn').addEventListener('click',()=>{onion=!onion;$('#onionBtn').textContent='Контуры: '+(onion?'вкл':'выкл');$('#onionBtn').setAttribute('aria-pressed',String(onion));render()});
for(const input of $$('[data-prop]'))input.addEventListener('change',()=>{const o=active();if(!o)return;snapshot();const k=keyAt(o,frame),prop=input.dataset.prop;if(prop==='scale')k.scale=clamp(num(input.value,100)/100,.1,4);else if(prop==='r')k.r=clamp(num(input.value),-10000,10000);else k[prop]=clamp(num(input.value),-5000,5000);input.blur();changed({structure:true})});
$('#easeSelect').addEventListener('change',()=>{const o=active();if(!o)return;snapshot();keyAt(o,frame).ease=$('#easeSelect').value;changed({structure:true})});
$('#squashInput').addEventListener('change',()=>{const o=active();if(!o)return;snapshot();o.squash=+$('#squashInput').value;changed()});$('#squashInput').addEventListener('input',()=>{$('#squashValue').textContent=$('#squashInput').value+'%'});
function makeCel(blank){const o=active();if(!o)return;stop();snapshot();let at=frame;if(o.cels.some(c=>c.f===at)){if(at>=project.frames-1){toast('Последний кадр — увеличь длительность');undo.pop();return}at++}const inherited=celAt(o,at);const c={f:at,strokes:blank?[]:structuredClone(inherited?.strokes||[])};o.cels=o.cels.filter(c=>c.f!==at);o.cels.push(c);o.cels.sort((a,b)=>a.f-b.f);frame=at;setTool('draw');changed({structure:true});toast(blank?'Чистый кадр создан':'Рисунок скопирован в новый кадр')}
$('#copyCelBtn').addEventListener('click',()=>makeCel(false));$('#blankCelBtn').addEventListener('click',()=>makeCel(true));
$('#resetRigBtn').addEventListener('click',()=>{const o=active();if(!o||!o.nodes.length)return;snapshot();for(const n of o.nodes){n.poses=n.poses.filter(k=>k.f!==frame);n.poses.push({f:frame,dx:0,dy:0});n.poses.sort((a,b)=>a.f-b.f)}changed({structure:true});toast('Поза сброшена')});
$('#deleteRigBtn').addEventListener('click',()=>{const o=active();if(!o||!selectedNode)return;snapshot();o.nodes=o.nodes.filter(n=>n.id!==selectedNode);selectedNode=null;changed({structure:true});toast('Сустав удалён')});
function showModal(title,body){stop();modalOpen=true;$('#dialogTitle').textContent=title;$('#modalBody').innerHTML=body;$('#veil').hidden=false;$('#veil').querySelector('.dialog').scrollTop=0}
function closeModal(){modalOpen=false;exportCancelled=true;$('#veil').hidden=true}
$('#modalClose').addEventListener('click',closeModal);$('#veil').addEventListener('pointerdown',e=>{if(e.target===$('#veil'))closeModal()});
$('#actionBtn').addEventListener('click',()=>{const o=active();if(!o)return;showModal('Новое действие','<p>Создадим финальный ключ. Затем перетащи рисунок на холсте в нужное положение — все промежуточные кадры появятся автоматически.</p><div class="settings-grid"><label>Длительность, кадры<input id="actionDuration" type="number" min="1" max="240" value="12"></label><label>Переход<select id="actionEase"><option value="smooth">Плавный</option><option value="linear">Ровный</option><option value="snap">Рывок</option><option value="hold">Резкий срез</option></select></label></div><div class="dialog-actions"><button id="actionCancel">Отмена</button><button class="primary" id="actionConfirm">Задать финал →</button></div>');$('#actionCancel').onclick=closeModal;$('#actionConfirm').onclick=()=>{const span=clamp(Math.round(num($('#actionDuration').value,12)),1,240),end=frame+span;if(end>=project.frames){toast('Увеличь длину проекта в настройках времени');return}snapshot();const o=active();const k=keyAt(o,end);k.ease=$('#actionEase').value;selected=o.id;frame=end;closeModal();setTool('select');changed({structure:true});toast('Финальный кадр готов · перетащи объект')}})
$('#deleteObjectBtn').addEventListener('click',()=>{const o=active();if(!o)return;showModal('Удалить «'+o.name+'»?','<p>Объект и все его анимации будут удалены. Действие можно отменить кнопкой ↶.</p><div class="dialog-actions"><button id="cancelDelete">Оставить</button><button class="primary" id="confirmDelete">Удалить</button></div>');$('#cancelDelete').onclick=closeModal;$('#confirmDelete').onclick=()=>{snapshot();project.objects=project.objects.filter(v=>v.id!==o.id);selected=project.objects.at(-1)?.id||null;closeModal();changed({structure:true});toast('Объект удалён')};});
$('#framesBtn').addEventListener('click',()=>{showModal('Время проекта','<div class="settings-grid"><label>Кадров в секунду<input id="fpsInput" type="number" min="6" max="24" value="'+project.fps+'"></label><label>Всего кадров<input id="totalInput" type="number" min="12" max="240" value="'+project.frames+'"></label></div><p>12 FPS хорошо подходит для коротких рисованных мультфильмов. Максимум 240 кадров.</p><div class="dialog-actions"><button id="cancelSettings">Отмена</button><button class="primary" id="applySettings">Применить</button></div>');$('#cancelSettings').onclick=closeModal;$('#applySettings').onclick=()=>{const frames=clamp(Math.round(num($('#totalInput').value,72)),12,240),fps=clamp(Math.round(num($('#fpsInput').value,12)),6,24);const last=Math.max(0,...project.objects.flatMap(o=>[o.start,...o.keys.map(k=>k.f),...o.cels.map(c=>c.f),...o.nodes.flatMap(n=>n.poses.map(k=>k.f))]));if(frames<=last){toast('Последний ключ находится на кадре '+(last+1));return}snapshot();project.frames=frames;project.fps=fps;frame=clamp(frame,0,frames-1);closeModal();changed({structure:true})}});
$('#projectName').addEventListener('change',()=>{const name=$('#projectName').value.trim().slice(0,46)||'Без названия';if(name===project.name)return;snapshot();project.name=name;changed()});
$('#mobileProperties').addEventListener('click',()=>{if(!active()){toast('Сначала выбери рисунок или дорожку');return}$('.inspector').classList.toggle('open');refreshInspector()});$('#closeInspector').addEventListener('click',()=>$('.inspector').classList.remove('open'));
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function safeName(){return(project.name||'shevel').replace(/[<>:"/\\|?*]/g,'').replace(/\s+/g,'-').slice(0,48)||'shevel'}
function savePNG(){const c=document.createElement('canvas');c.width=760;c.height=470;renderScene(c.getContext('2d'),frame,{guides:false});c.toBlob(b=>{if(b){download(b,safeName()+'-frame-'+(frame+1)+'.png');toast('PNG сохранён')}else toast('Не удалось создать PNG')},'image/png')}
function byteWriter(){const out=[];return {out,put:(...xs)=>out.push(...xs),word(n){out.push(n&255,(n>>8)&255)},text(s){for(let i=0;i<s.length;i++)out.push(s.charCodeAt(i))}}}
function lzw(pixels){
 const clear=256,end=257,bytes=[];let bits=0,bitCount=0,codeSize=9,next=258,dict=new Map();
 const write=n=>{bits|=n<<bitCount;bitCount+=codeSize;while(bitCount>=8){bytes.push(bits&255);bits>>>=8;bitCount-=8}};
 const reset=()=>{dict=new Map();codeSize=9;next=258};
 write(clear);let prefix=pixels[0];
 for(let i=1;i<pixels.length;i++){const ch=pixels[i],name=prefix+','+ch,entry=dict.get(name);if(entry!==undefined){prefix=entry;continue}write(prefix);if(next<4096){dict.set(name,next++);if(next>(1<<codeSize)&&codeSize<12)codeSize++}else{write(clear);reset()}prefix=ch}
 write(prefix);write(end);if(bitCount)bytes.push(bits&255);return bytes;
}
async function saveGIF(){
 const width=380,height=235,n=project.frames,fps=project.fps;const w=byteWriter();w.text('GIF89a');w.word(width);w.word(height);w.put(0xF7,0,0);
 for(let i=0;i<256;i++)w.put(Math.round(((i>>5)&7)*255/7),Math.round(((i>>2)&7)*255/7),Math.round((i&3)*255/3));
 w.put(0x21,0xff,0x0b);w.text('NETSCAPE2.0');w.put(3,1,0,0,0);
 const off=document.createElement('canvas');off.width=width;off.height=height;const g=off.getContext('2d',{willReadFrequently:true});exportCancelled=false;
 const progress=document.createElement('div');progress.className='dialog-progress';progress.innerHTML='<i></i>';$('#modalBody').append(progress);
 const status=document.createElement('p');status.textContent='Создание GIF… 0%';$('#modalBody').append(status);
 try{for(let f=0;f<n;f++){
   if(exportCancelled)return;renderScene(g,f,{guides:false});const rgba=g.getImageData(0,0,width,height).data,idx=new Uint8Array(width*height);
   for(let i=0,j=0;i<rgba.length;i+=4,j++)idx[j]=((rgba[i]>>5)<<5)|((rgba[i+1]>>5)<<2)|(rgba[i+2]>>6);
   const delay=Math.max(2,Math.round(100/fps));w.put(0x21,0xf9,4,4,delay&255,(delay>>8)&255,0,0);w.put(0x2c,0,0,0,0);w.word(width);w.word(height);w.put(0,8);
   const data=lzw(idx);for(let k=0;k<data.length;k+=255){const piece=data.slice(k,k+255);w.put(piece.length,...piece)}w.put(0);
   if(f%3===0||f===n-1){const pct=Math.round((f+1)/n*100);progress.firstElementChild.style.width=pct+'%';status.textContent='Создание GIF… '+pct+'%';await new Promise(requestAnimationFrame)}
 }w.put(0x3b);download(new Blob([new Uint8Array(w.out)],{type:'image/gif'}),safeName()+'.gif');closeModal();toast('Анимация GIF экспортирована')}catch(err){status.textContent='Не удалось создать GIF: '+err.message}
}
$('#exportBtn').addEventListener('click',()=>{showModal('Твоя мастерская','<div class="export-options"><button id="exportGif" class="primary">Анимация GIF <small>Полный мультфильм</small></button><button id="exportPng">Текущий кадр PNG <small>Изображение</small></button><button id="exportJson">Сохранить проект <small>Файл .json</small></button><button id="importJson">Открыть проект <small>Загрузить .json</small></button></div><hr><div class="export-options"><button id="newProject">Новый пустой проект <small>Начать сначала</small></button></div>');
 $('#exportPng').onclick=()=>{savePNG();closeModal()};$('#exportJson').onclick=()=>{download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),safeName()+'.json');closeModal();toast('Файл проекта сохранён')};
 $('#exportGif').onclick=()=>{const btn=$('#exportGif');btn.disabled=true;btn.textContent='Создаётся GIF…';saveGIF()};$('#importJson').onclick=()=>$('#importFile').click();$('#newProject').onclick=()=>{showModal('Новый проект?','<p>Текущая анимация будет заменена пустой сценой. Проект можно предварительно сохранить в JSON.</p><div class="dialog-actions"><button id="keepProject">Отмена</button><button class="primary" id="confirmNew">Новый проект</button></div>');$('#keepProject').onclick=closeModal;$('#confirmNew').onclick=()=>{snapshot();project={name:'Мой мультфильм',fps:12,frames:72,objects:[newObj('Рисунок',380,235,[],0)]};selected=project.objects[0].id;frame=0;closeModal();setTool('draw');changed({structure:true});toast('Пустой холст готов · начинай рисовать')}}});
$('#importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>6500000)throw Error('Файл слишком большой');const d=validate(JSON.parse(await file.text()));snapshot();project=d;selected=d.objects.at(-1)?.id||null;frame=0;closeModal();changed({structure:true});toast('Проект открыт')}catch(err){toast('Не удалось открыть проект: '+err.message)}finally{e.target.value=''}});
window.addEventListener('keydown',e=>{const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(e.key==='Escape'&&modalOpen){closeModal();return}if(typing||modalOpen)return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'&&!e.shiftKey){e.preventDefault();$('#undoBtn').click()}else if((e.ctrlKey||e.metaKey)&&(key==='y'||key==='z'&&e.shiftKey)){e.preventDefault();$('#redoBtn').click()}else if(key===' '){e.preventDefault();play()}else if(key==='arrowleft'){e.preventDefault();stop();setFrame(frame-1)}else if(key==='arrowright'){e.preventDefault();stop();setFrame(frame+1)}else if(key==='v')setTool('select');else if(key==='d')setTool('draw');else if(key==='j')setTool('rig');else if(key==='e')setTool('erase');else if((e.ctrlKey||e.metaKey)&&(key==='+'||key==='=')){e.preventDefault();setZoom(view.zoom*1.25)}else if((e.ctrlKey||e.metaKey)&&key==='-'){e.preventDefault();setZoom(view.zoom/1.25)}else if((key==='delete'||key==='backspace')&&active())$('#deleteObjectBtn').click()});
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);try{localStorage.setItem(STORAGE,JSON.stringify(project))}catch{}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();try{localStorage.setItem(STORAGE,JSON.stringify(project))}catch{}}});
$('#trackNames').addEventListener('scroll',()=>{$('#tracks').scrollTop=$('#trackNames').scrollTop});
$('#tracks').addEventListener('scroll',()=>{$('#trackNames').scrollTop=$('#tracks').scrollTop});
window.addEventListener('resize',()=>{refreshTimeline();render()});
refreshHeader();refreshTimeline();refreshInspector();setTool('select');render();save();
