import {W,H,zoneFor,loadArtwork} from './artworks.js';
function clipZone(ctx,z){ctx.beginPath();ctx.rect(z.x,z.y,z.w,z.h);ctx.clip();}
function dab(ctx,x,y,r,color,alpha=1){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,Math.max(.5,r),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
function drawStroke(ctx,stroke){
 const pts=stroke.p||[];if(!pts.length)return;
 const size=Number(stroke.s)||8,color=stroke.t==='erase'?'#e8ddc6':stroke.c;
 ctx.save();ctx.strokeStyle=color;ctx.lineWidth=stroke.t==='pencil'?Math.max(1,size*.4):size;ctx.lineCap='round';ctx.lineJoin='round';
 ctx.globalAlpha=stroke.t==='pencil'?.82:stroke.t==='spray'?.44:1;
 if(stroke.t==='spray'){
  for(let i=0;i<pts.length;i++){const pt=pts[i];for(let j=0;j<6;j++){const angle=((i*13+j*83)%360)*Math.PI/180,rad=(i+j*7)%11/11*size;dab(ctx,pt[0]+Math.cos(angle)*rad,pt[1]+Math.sin(angle)*rad,size*.13,color,.34)}}
 }else{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.stroke();dab(ctx,pts[0][0],pts[0][1],ctx.lineWidth/2,color,ctx.globalAlpha)}
 ctx.restore();
}
export async function renderArtwork(canvas,id,variation=0,strokes=null,damaged=false){
 const ctx=canvas.getContext('2d');canvas.width=W;canvas.height=H;
 try{const image=await loadArtwork(id);if(!canvas.isConnected)return;ctx.clearRect(0,0,W,H);ctx.drawImage(image,0,0,W,H);
 if(damaged){const z=zoneFor(id,variation);ctx.save();clipZone(ctx,z);ctx.fillStyle='#e8ddc6';ctx.fillRect(z.x,z.y,z.w,z.h);(strokes||[]).forEach(s=>drawStroke(ctx,s));ctx.restore();
 }
 }catch{ctx.fillStyle='#ddc6aa';ctx.fillRect(0,0,W,H);ctx.fillStyle='#512d2a';ctx.fillText('Не удалось открыть картину',20,50);}
}
const key='pocket-works:zamazka:draft:';
export class Editor{
 constructor(root,{id,variation=0,round=1,onChange=()=>{}}){
   this.root=root;this.id=id;this.variation=variation;this.round=round;this.onChange=onChange;this.zone=zoneFor(id,variation);
   this.canvas=root.querySelector('#paintCanvas');this.viewport=root.querySelector('.viewport');
   this.tool='brush';this.color='#3d594d';this.size=12;this.strokes=[];this.redoStack=[];this.working=null;this.pointers=new Map();this.scale=1.9;this.tx=0;this.ty=0;this.moving=false;this.closed=false;
   this.draftKey=key+id+':'+variation+':'+round;
   try{const stored=JSON.parse(localStorage.getItem(this.draftKey)||'null');if(Array.isArray(stored)&&stored.length<=72)this.strokes=stored}catch{}
   this.attach();this.center();this.render();
 }
 center(){const w=this.viewport.clientWidth,h=this.viewport.clientHeight||w*.75,z=this.zone;this.tx=w/2-(z.x+z.w/2)*w/600*this.scale;this.ty=h/2-(z.y+z.h/2)*h/450*this.scale;this.transform();}
 transform(){this.canvas.style.transform='translate('+this.tx+'px,'+this.ty+'px) scale('+this.scale+')'}
 zoom(factor){const w=this.viewport.clientWidth,h=this.viewport.clientHeight,old=this.scale;this.scale=Math.min(4,Math.max(1,old*factor));this.tx=w/2-(w/2-this.tx)*this.scale/old;this.ty=h/2-(h/2-this.ty)*this.scale/old;this.transform()}
 point(e){const b=this.canvas.getBoundingClientRect();return [Math.max(0,Math.min(600,Math.round((e.clientX-b.left)/b.width*6000)/10)),Math.max(0,Math.min(450,Math.round((e.clientY-b.top)/b.height*4500)/10))]}
 inside(p){const z=this.zone;return p[0]>=z.x&&p[0]<=z.x+z.w&&p[1]>=z.y&&p[1]<=z.y+z.h}
 save(){try{localStorage.setItem(this.draftKey,JSON.stringify(this.strokes))}catch{}this.onChange(this.strokes.length)}
 attach(){
  this.down=e=>{
    e.preventDefault();this.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(this.pointers.size>1){this.working=null;this.moving=true;const pp=[...this.pointers.values()];this.pinch={d:Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1]),z:this.scale,x:this.tx,y:this.ty,mid:[(pp[0][0]+pp[1][0])/2,(pp[0][1]+pp[1][1])/2]};return}
    const p=this.point(e);if(this.tool==='picker'){this.pick(p);return}
    if(this.tool==='hand'){this.panStart=[e.clientX,e.clientY,this.tx,this.ty];return}
    if(!this.inside(p))return;
    if(this.strokes.length>=72){this.onChange(-1);return}
    this.working={c:this.color,s:this.size,t:this.tool,p:[p]};this.redoStack=[];
    this.render();
  };
  this.move=e=>{
    if(!this.pointers.has(e.pointerId))return;
    e.preventDefault();this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(this.pointers.size>1&&this.pinch){const pp=[...this.pointers.values()],dist=Math.hypot(pp[0][0]-pp[1][0],pp[0][1]-pp[1][1])||1;
      const old=this.scale;this.scale=Math.max(1,Math.min(4,this.pinch.z*dist/Math.max(10,this.pinch.d)));
      const mid=[(pp[0][0]+pp[1][0])/2,(pp[0][1]+pp[1][1])/2];
      this.tx=this.pinch.x+(mid[0]-this.pinch.mid[0])+(this.viewport.clientWidth/2-this.pinch.x)*(1-this.scale/this.pinch.z);
      this.ty=this.pinch.y+(mid[1]-this.pinch.mid[1])+(this.viewport.clientHeight/2-this.pinch.y)*(1-this.scale/this.pinch.z);this.transform();return;
    }
    if(this.panStart){this.tx=this.panStart[2]+e.clientX-this.panStart[0];this.ty=this.panStart[3]+e.clientY-this.panStart[1];this.transform();return}
    if(!this.working)return;const p=this.point(e),pts=this.working.p,prev=pts[pts.length-1];
    if(this.inside(p)&&pts.length<45&&Math.hypot(p[0]-prev[0],p[1]-prev[1])>1.1){pts.push(p);this.render()}
  };
  this.up=e=>{this.pointers.delete(e.pointerId);if(this.pointers.size<2)this.pinch=null;
    if(this.working){this.strokes.push(this.working);this.working=null;this.save();this.render()}this.panStart=null;
  };
  this.canvas.addEventListener('pointerdown',this.down);this.canvas.addEventListener('pointermove',this.move);this.canvas.addEventListener('pointerup',this.up);this.canvas.addEventListener('pointercancel',this.up);
  this.wheel=e=>{e.preventDefault();this.zoom(e.deltaY<0?1.12:.89)};
  this.viewport.addEventListener('wheel',this.wheel,{passive:false});
  this.actions=e=>{const b=e.target.closest('[data-tool],[data-cmd],[data-color]');if(!b)return;
   if(b.dataset.tool){this.tool=b.dataset.tool;this.root.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x.dataset.tool===this.tool))}
   if(b.dataset.color){this.color=b.dataset.color;this.root.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('active',x===b))}
   if(b.dataset.cmd==='undo'&&this.strokes.length){this.redoStack.push(this.strokes.pop());this.save();this.render()}
   if(b.dataset.cmd==='redo'&&this.redoStack.length){this.strokes.push(this.redoStack.pop());this.save();this.render()}
   if(b.dataset.cmd==='in')this.zoom(1.3);
   if(b.dataset.cmd==='out')this.zoom(.77);
   if(b.dataset.cmd==='center')this.center();
  };
  this.root.addEventListener('click',this.actions);
  this.slider=e=>{if(e.target.id==='brushSize')this.size=Number(e.target.value);if(e.target.id==='customColor')this.color=e.target.value};
  this.root.addEventListener('input',this.slider);
  this.resize=()=>this.center();window.addEventListener('resize',this.resize);
 }
 async pick(p){if(this.inside(p))return;try{const image=await loadArtwork(this.id);const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(image,0,0,W,H);const rgb=x.getImageData(p[0]|0,p[1]|0,1,1).data;this.color='#'+[rgb[0],rgb[1],rgb[2]].map(n=>n.toString(16).padStart(2,'0')).join('');this.root.querySelector('#customColor').value=this.color;this.tool='brush';this.root.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool==='brush'));this.onChange(this.strokes.length)}catch{}}
 async render(){if(this.closed)return;const c=this.canvas,version=this.renderVersion=(this.renderVersion||0)+1;const img=await loadArtwork(this.id).catch(()=>null);if(!img||this.closed||version!==this.renderVersion)return;
 c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(img,0,0,W,H);x.save();clipZone(x,this.zone);x.fillStyle='#e8ddc6';x.fillRect(this.zone.x,this.zone.y,this.zone.w,this.zone.h);[...this.strokes,...(this.working?[this.working]:[])].forEach(s=>drawStroke(x,s));x.restore();x.save();x.setLineDash([5,4]);x.strokeStyle='#806950';x.lineWidth=1.5;x.strokeRect(this.zone.x+.5,this.zone.y+.5,this.zone.w-1,this.zone.h-1);x.restore();
 }
 getData(){return this.strokes.map(s=>({c:s.c,s:s.s,t:s.t,p:s.p}))}
 clearDraft(){localStorage.removeItem(this.draftKey)}
 dispose(){this.closed=true;this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.viewport.removeEventListener('wheel',this.wheel);this.root.removeEventListener('click',this.actions);this.root.removeEventListener('input',this.slider);window.removeEventListener('resize',this.resize)}
}
