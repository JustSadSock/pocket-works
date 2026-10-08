// VITRUM atelier materials. All art is deterministic, drawn locally, and resolution independent.
export const GLASS=[
 {name:'КОБАЛЬТ',light:'#b9e2ee',mid:'#327cae',dark:'#163756',rim:'#a5d8ed'},
 {name:'РУБИН',light:'#f9af88',mid:'#b94145',dark:'#5a1d2e',rim:'#ffc0a1'},
 {name:'ЯНТАРЬ',light:'#fff0ad',mid:'#d89a37',dark:'#86501e',rim:'#ffe1a0'},
 {name:'ЗЕЛЕНЬ',light:'#c4dfa5',mid:'#508e61',dark:'#224a3c',rim:'#cee5ad'},
 {name:'АМЕТИСТ',light:'#e7bce8',mid:'#8963a3',dark:'#38294e',rim:'#e3c9ef'},
 {name:'МОЛОЧНОЕ',light:'#fff7d8',mid:'#c1b69d',dark:'#837a69',rim:'#fff6e4'}
];
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const rgba=(hex,a)=>{const v=parseInt(hex.slice(1),16);return `rgba(${v>>16&255},${v>>8&255},${v&255},${a})`};
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296}}
export function paneBox(w,h){const fw=Math.min(w*.82,h*.69,530),fh=Math.min(h*.78,fw*1.43);return {x:(w-fw)/2,y:h*.11,w:fw,h:fh};}
export function sheetBox(w,h){const sw=Math.min(w*.78,h*.60,465),sh=Math.min(h*.71,sw*1.35);return{x:(w-sw)/2,y:(h-sh)/2,w:sw,h:sh};}
export function panePath(box){const{x,y,w,h}=box,p=new Path2D();p.moveTo(x+w*.5,y);p.bezierCurveTo(x+w*.19,y+h*.115,x,y+h*.24,x,y+h*.36);p.lineTo(x,y+h*.965);p.quadraticCurveTo(x,y+h,x+w*.035,y+h);p.lineTo(x+w*.965,y+h);p.quadraticCurveTo(x+w,y+h,x+w,y+h*.965);p.lineTo(x+w,y+h*.36);p.bezierCurveTo(x+w,y+h*.24,x+w*.81,y+h*.115,x+w*.5,y);p.closePath();return p;}
export function polygonPath(points){const p=new Path2D();if(!points?.length)return p;p.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)p.lineTo(points[i].x,points[i].y);p.closePath();return p;}
export function polySamples(points,steps=9){const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];for(let j=0;j<steps;j++){const t=j/steps;out.push({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)})}}out.push({...out[0]});return out;}
export function piecePolygon(piece,pane){const cos=Math.cos(piece.angle),sin=Math.sin(piece.angle),k=pane.w*piece.scale;return piece.points.map(([x,y])=>({x:pane.x+piece.x*pane.w+(x*cos-y*sin)*k,y:pane.y+piece.y*pane.h+(x*sin+y*cos)*k}))}
export function cutPolygon(draft,sheet){return draft.points.map(([x,y])=>({x:sheet.x+x*sheet.w,y:sheet.y+y*sheet.w}))}
export function centroid(points){const n=points.length||1;return points.reduce((p,v)=>({x:p.x+v.x/n,y:p.y+v.y/n}),{x:0,y:0})}
function bounds(points){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}}
function strokePath(ctx,points){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();}
function drawOak(ctx,w,h,t){
 const base=ctx.createLinearGradient(0,0,w,h);base.addColorStop(0,'#59412b');base.addColorStop(.38,'#33251a');base.addColorStop(1,'#1b1410');ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.lineWidth=1;
 for(let i=0;i<8;i++){let yy=(i+.12)*h/7;ctx.strokeStyle='#0b09074a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy+5);ctx.stroke();ctx.strokeStyle='#bd86542c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,yy+3);ctx.lineTo(w,yy+8);ctx.stroke();}
 const random=rng(3918);
 for(let i=0;i<240;i++){const x=random()*w,y=random()*h,len=12+random()*85;ctx.beginPath();ctx.strokeStyle=random()>.5?'rgba(219,162,92,.085)':'rgba(9,5,3,.20)';ctx.lineWidth=.4+random()*.8;ctx.moveTo(x,y);ctx.bezierCurveTo(x+len*.25,y-3,x+len*.78,y+5,x+len,y);ctx.stroke();}
 ctx.restore();
 const lamp=ctx.createRadialGradient(w*.18,h*.12,9,w*.18,h*.12,w*.93);lamp.addColorStop(0,'#e6a55a20');lamp.addColorStop(1,'#05030250');ctx.fillStyle=lamp;ctx.fillRect(0,0,w,h);
}
function drawStoneWall(ctx,w,h,sun){
 const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#59574e');g.addColorStop(.6,'#3e3c35');g.addColorStop(1,'#171916');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
 const rand=rng(235);ctx.save();for(let i=0;i<100;i++){const x=rand()*w,y=rand()*h;ctx.fillStyle=rand()>.5?'#fff1cc0e':'#0d0d0a1f';ctx.fillRect(x,y,20+rand()*65,1+rand()*13)}
 for(let y=0;y<h+45;y+=47){ctx.strokeStyle='#100f0e48';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();const off=(Math.floor(y/47)%2)*55-25;for(let x=off;x<w;x+=110){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+47);ctx.stroke()}}
 ctx.restore();
 const halo=ctx.createRadialGradient(w*.55+sun*w*.23,h*.18,0,w*.55+sun*w*.23,h*.22,w*.75);halo.addColorStop(0,'#f5dfab24');halo.addColorStop(1,'#00000000');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
}
function drawPane(ctx,frame,reveal,sun){
 const p=panePath(frame),{x,y,w,h}=frame;
 ctx.save();ctx.shadowColor='#070608df';ctx.shadowBlur=22;ctx.shadowOffsetY=10;ctx.fillStyle='#14120e';ctx.fill(p);ctx.restore();
 ctx.save();ctx.clip(p);
 const glow=ctx.createLinearGradient(x+w*(-.2+sun*.5),y,x+w*(1.2+sun*.5),y+h);
 if(reveal){glow.addColorStop(0,'#f9f2d9');glow.addColorStop(.37,'#c2d4d4');glow.addColorStop(1,'#849ba2')}
 else{glow.addColorStop(0,'#e8ddbd');glow.addColorStop(.42,'#c2b48f');glow.addColorStop(1,'#8e8168')}
 ctx.fillStyle=glow;ctx.fillRect(x,y,w,h);
 if(!reveal){const r=rng(455);for(let i=0;i<160;i++){ctx.fillStyle=r()>.55?'#fff6d01b':'#483d2e16';ctx.fillRect(x+r()*w,y+r()*h,.7+r()*1.2,.7+r()*1.5)}}
 ctx.restore();
 // Chamfered limestone reveal: nested shadows and left-side grazing light.
 ctx.save();ctx.lineJoin='round';ctx.strokeStyle='#13110ecf';ctx.lineWidth=29;ctx.stroke(p);
 ctx.strokeStyle='#585145';ctx.lineWidth=21;ctx.stroke(p);
 ctx.strokeStyle='#a99a80';ctx.lineWidth=9;ctx.stroke(p);
 ctx.strokeStyle='#d0bca0a0';ctx.lineWidth=1.6;ctx.stroke(p);
 ctx.restore();
 // A stone-keystone, deeply engraved, breaks the otherwise uniform edge.
 ctx.save();ctx.fillStyle='#b0a086';ctx.strokeStyle='#3b332c';ctx.lineWidth=2;const apex=y+6;
 ctx.beginPath();ctx.moveTo(x+w*.5-18,apex+18);ctx.lineTo(x+w*.5-9,apex-7);ctx.lineTo(x+w*.5+9,apex-7);ctx.lineTo(x+w*.5+18,apex+18);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}
function glassMaterial(ctx,path,rect,index,seed,time,sun,reveal){
 const c=GLASS[index%GLASS.length];const rnd=rng(seed||1234);
 const x=rect.x,y=rect.y,w=Math.max(1,rect.w),h=Math.max(1,rect.h);
 ctx.save();ctx.clip(path);
 const g=ctx.createLinearGradient(x-w*.21+sun*w*.36,y-h*.2,x+w*(.91+sun*.24),y+h*1.3);
 g.addColorStop(0,c.light);g.addColorStop(.37,reveal?c.light:c.mid);g.addColorStop(.7,c.mid);g.addColorStop(1,c.dark);ctx.fillStyle=g;ctx.fillRect(x-10,y-10,w+20,h+20);
 // Hand-blown striae, stretched in one direction in the molten material.
 ctx.globalCompositeOperation='screen';
 for(let i=0;i<19;i++){const ty=rnd()*h+y,offset=(rnd()-.5)*h*.18;
 ctx.lineWidth=.8+rnd()*3.3;ctx.strokeStyle=rgba(c.rim,.05+rnd()*.18);
 ctx.beginPath();ctx.moveTo(x-20,ty);ctx.bezierCurveTo(x+w*.34,ty-18+offset,x+w*.63,ty+15-offset,x+w+24,ty+offset*.4);ctx.stroke();
 }
 // Occasional elongated bubbles, suspended inside the slab.
 for(let i=0;i<19;i++){const bx=x+rnd()*w,by=y+rnd()*h,rad=1+rnd()*3.2;
 ctx.strokeStyle=rgba(c.rim,.16+rnd()*.30);ctx.lineWidth=.7;
 ctx.beginPath();ctx.ellipse(bx,by,rad*.8,rad*1.25,rnd()*2,0,TAU);ctx.stroke();
 }
 const glint=ctx.createLinearGradient(x+sun*w*.15,y,x+w*.7+sun*w*.15,y+h*.47);
 glint.addColorStop(0,'#ffffff00');glint.addColorStop(.36,'#fffbe700');glint.addColorStop(.43,'#fff9ed2d');glint.addColorStop(.51,'#fffbe500');glint.addColorStop(1,'#ffffff00');
 ctx.globalCompositeOperation='screen';ctx.fillStyle=glint;ctx.fillRect(x-10,y-10,w+20,h+20);
 const gd=ctx.createRadialGradient(x+w*.22,y+h*.14,1,x+w*.5,y+h*.5,Math.max(w,h)*.8);
 gd.addColorStop(0,'#fff7e13d');gd.addColorStop(.8,'#ffffff00');gd.addColorStop(1,'#00000000');ctx.fillStyle=gd;ctx.fillRect(x-10,y-10,w+20,h+20);
 ctx.restore();
}
function traceProfile(ctx,points,progress,width){
 if(progress<=0)return;
 const samples=polySamples(points,5),len=Math.max(2,Math.floor((samples.length-1)*progress));
 ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
 ctx.moveTo(samples[0].x,samples[0].y);for(let i=1;i<=len;i++)ctx.lineTo(samples[i].x,samples[i].y);
 ctx.shadowColor='#030304bb';ctx.shadowBlur=7;ctx.shadowOffsetY=4;ctx.strokeStyle='#171b1c';ctx.lineWidth=width+5;ctx.stroke();
 ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#404c4d';ctx.lineWidth=width+1;ctx.stroke();
 ctx.strokeStyle='#8a9690';ctx.lineWidth=Math.max(1,width*.22);ctx.stroke();
 ctx.restore();
}
function solderPositions(points){const arr=polySamples(points,6);return[0,.333,.666].map(f=>arr[Math.floor((arr.length-1)*f)])}
export {solderPositions};
function drawPiece(ctx,piece,frame,options){
 const pts=piecePolygon(piece,frame),path=polygonPath(pts),rect=bounds(pts);
 const light=options.sun||0,depth=(options.reveal?3.4:5.6)+piece.scale*3;
 ctx.save();
 ctx.shadowColor=options.dragging?'rgba(0,0,0,.7)':'rgba(6,10,11,.56)';
 ctx.shadowBlur=options.dragging?25:12;ctx.shadowOffsetX=4;ctx.shadowOffsetY=8+depth;
 ctx.fillStyle=GLASS[piece.color].dark;ctx.fill(path);
 ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 // Side faces: translucent thick glass visible below the uneven cut line.
 for(let i=0;i<pts.length;i++){
   const a=pts[i],b=pts[(i+1)%pts.length];
   const slope=(b.x-a.x),facing=clamp(.33+(slope>0?.2:-.07)+light*.13,0,1);
   ctx.fillStyle=facing>.48?rgba(GLASS[piece.color].mid,.92):rgba(GLASS[piece.color].dark,.96);
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(b.x+depth*.35,b.y+depth);ctx.lineTo(a.x+depth*.35,a.y+depth);ctx.closePath();ctx.fill();
 }
 ctx.fillStyle=GLASS[piece.color].mid;ctx.fill(path);
 glassMaterial(ctx,path,rect,piece.color,piece.seed,options.time,light,options.reveal);
 ctx.lineWidth=2.6;ctx.strokeStyle='rgba(6,9,10,.63)';ctx.stroke(path);
 ctx.lineWidth=1.2;ctx.strokeStyle=rgba(GLASS[piece.color].rim,.83);ctx.stroke(path);
 ctx.save();ctx.clip(path);
 const spec=ctx.createLinearGradient(rect.x+light*rect.w*.2,rect.y,rect.x+rect.w+light*rect.w*.2,rect.y+rect.h);
 spec.addColorStop(0,'#ffffff45');spec.addColorStop(.18,'#ffffff00');spec.addColorStop(.81,'#ffffff00');spec.addColorStop(1,'#ffffff38');
 ctx.fillStyle=spec;ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.restore();
 if(piece.lead>0)traceProfile(ctx,pts,piece.lead,Math.max(5.5,frame.w*.027));
 const joins=solderPositions(pts);
 joins.forEach((j,i)=>{const t=piece.solder?.[i]||0;
 if(t<=0)return;
 const rr=3+t*4;
 ctx.save();ctx.fillStyle=t>=1?'#bec5b8':'#be7a42';ctx.strokeStyle='#252e2f';ctx.lineWidth=1.5;
 ctx.shadowColor=t>=1?'#00000090':'#ed964ac2';ctx.shadowBlur=4+t*7;
 ctx.beginPath();ctx.ellipse(j.x,j.y,rr,rr*.8,.2,0,TAU);ctx.fill();ctx.stroke();
 ctx.fillStyle=t>=1?'#eff4eb':'#ffe1ad';ctx.beginPath();ctx.ellipse(j.x-rr*.27,j.y-rr*.28,rr*.27,rr*.18,0,0,TAU);ctx.fill();ctx.restore();
 });
 if(options.selected){ctx.save();ctx.strokeStyle='#f5d8a1';ctx.lineWidth=1.65;ctx.setLineDash([5,6]);ctx.stroke(path);ctx.restore();}
 ctx.restore();
 return pts;
}
function drawGlassSheet(ctx,sheet,index){
 const{x,y,w,h}=sheet;
 ctx.save();
 // Felt pad and the translucent, slightly raised sheet.
 ctx.shadowColor='#090607ba';ctx.shadowBlur=28;ctx.shadowOffsetY=18;ctx.fillStyle='#43372c';ctx.fillRect(x-10,y-10,w+20,h+20);
 ctx.shadowBlur=8;ctx.shadowOffsetY=6;ctx.fillStyle=GLASS[index].dark;ctx.fillRect(x,y+5,w,h);
 const p=new Path2D();p.rect(x,y,w,h);glassMaterial(ctx,p,{x,y,w,h},index,1103+index*43,0,0,false);
 ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ctx.strokeStyle=GLASS[index].rim;ctx.lineWidth=2;ctx.strokeRect(x,y,w,h);
 ctx.strokeStyle='#101414a0';ctx.lineWidth=5;ctx.strokeRect(x-2.5,y-2.5,w+5,h+5);
 ctx.restore();
}
function drawPliers(ctx,x,y,angle=.25){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.shadowColor='#0008';ctx.shadowBlur=8;ctx.shadowOffsetY=5;
 ctx.lineCap='round';ctx.strokeStyle='#b6a58b';ctx.lineWidth=6;
 ctx.beginPath();ctx.moveTo(-13,42);ctx.lineTo(-2,-8);ctx.lineTo(-9,-29);ctx.moveTo(13,42);ctx.lineTo(2,-8);ctx.lineTo(9,-29);ctx.stroke();
 ctx.strokeStyle='#4a4841';ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(-13,43);ctx.lineTo(0,-5);ctx.lineTo(-10,-31);ctx.moveTo(13,43);ctx.lineTo(0,-5);ctx.lineTo(10,-31);ctx.stroke();
 ctx.fillStyle='#d1b591';ctx.beginPath();ctx.arc(0,-6,4,0,TAU);ctx.fill();ctx.restore();
}
function drawCutter(ctx,x,y,angle=-.5){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.shadowColor='#000a';ctx.shadowBlur=10;ctx.shadowOffsetY=4;
 ctx.fillStyle='#705037';ctx.fillRect(-6,-54,12,69);ctx.strokeStyle='#d2b790';ctx.lineWidth=1.3;ctx.strokeRect(-6,-54,12,69);
 const grad=ctx.createLinearGradient(-7,0,7,0);grad.addColorStop(0,'#343839');grad.addColorStop(.5,'#bbbdb4');grad.addColorStop(1,'#353839');
 ctx.fillStyle=grad;ctx.fillRect(-4,15,8,20);ctx.fillStyle='#d5dcda';ctx.beginPath();ctx.arc(0,40,7,0,TAU);ctx.fill();
 ctx.strokeStyle='#151a1e';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,40,6,-1.8,1.8);ctx.stroke();ctx.restore();
}
function drawIron(ctx,x,y){
 ctx.save();ctx.translate(x,y);ctx.rotate(-.58);
 ctx.shadowBlur=11;ctx.shadowColor='#000b';ctx.fillStyle='#4a3021';ctx.fillRect(-7,-65,14,48);
 ctx.shadowBlur=0;ctx.fillStyle='#a09b85';ctx.fillRect(-5,-17,10,43);
 ctx.fillStyle='#c2afa0';ctx.beginPath();ctx.moveTo(-5,26);ctx.lineTo(0,48);ctx.lineTo(5,26);ctx.fill();
 ctx.shadowColor='#ffab49';ctx.shadowBlur=14;ctx.fillStyle='#ffce79';ctx.beginPath();ctx.arc(0,47,4.1,0,TAU);ctx.fill();ctx.restore();
}
function drawCut(ctx,w,h,s,interaction,time){
 drawOak(ctx,w,h,time);
 const sheet=sheetBox(w,h), color=GLASS[s.pigment];drawGlassSheet(ctx,sheet,s.pigment);
 const scratch=interaction.trace||[],draft=s.draft;
 const points=draft?cutPolygon(draft,sheet):scratch;
 if(points.length){
   ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=1.8;ctx.strokeStyle='#f5ebd0e0';ctx.shadowColor='#fff4c6';ctx.shadowBlur=4;
   ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
   for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
   if(draft)ctx.closePath();ctx.stroke();ctx.restore();
 }
 if(draft){
   const path=polygonPath(points),bb=bounds(points);
   ctx.save();ctx.shadowColor='rgba(0,0,0,.4)';ctx.shadowBlur=14;ctx.shadowOffsetY=7;
   ctx.fillStyle=rgba(color.dark,.26);ctx.fill(path);ctx.restore();
   const chips=s.chips||0,center=centroid(points),indexes=[.14,.38,.61,.84];
   indexes.forEach((pct,i)=>{
     const p=points[Math.min(points.length-1,Math.floor(pct*(points.length-1)))],done=i<chips;
     ctx.save();ctx.fillStyle=done?'#2b1b17b8':'#f9de9d';ctx.strokeStyle=done?'#fff3cb':'#584025';
     ctx.lineWidth=2;ctx.shadowColor=done?'#0000':'#f8d99c';ctx.shadowBlur=done?0:11;
     ctx.beginPath();ctx.arc(p.x,p.y,done?4:7,0,TAU);ctx.fill();ctx.stroke();
     if(i===chips){const angle=Math.atan2(p.y-center.y,p.x-center.x);ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.strokeStyle='#fff2cc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(29,0);ctx.lineTo(24,-5);ctx.moveTo(29,0);ctx.lineTo(24,5);ctx.stroke();}
     ctx.restore();
   });
   // Glancing reflected light on the outline gives thickness before release.
   ctx.save();ctx.strokeStyle='#fff8dda8';ctx.lineWidth=2;ctx.stroke(path);ctx.restore();
 }
 // Table markings and real implements left outside the active sheet.
 ctx.save();ctx.globalAlpha=.72;drawPliers(ctx,sheet.x-24,sheet.y+sheet.h*.91,-.11);drawCutter(ctx,sheet.x+sheet.w+19,sheet.y+sheet.h*.63,.3);ctx.restore();
 ctx.font='11px Georgia';ctx.textAlign='center';ctx.fillStyle='#e0c5a1';ctx.fillText(draft?'СТЕКЛО · ОБЛОМАТЬ ПО КРОМКЕ':'ЦЕЛЬНЫЙ ЛИСТ · ВЕДИТЕ РЕЗЕЦ',w*.5,Math.max(25,sheet.y-26));
 if(interaction.pointer && interaction.tool==='score')drawCutter(ctx,interaction.pointer.x-19,interaction.pointer.y-27,-.25);
 if(interaction.pointer && interaction.tool==='chip')drawPliers(ctx,interaction.pointer.x-10,interaction.pointer.y-9,-.65);
}
function drawWindow(ctx,w,h,s,interaction,time){
 const sun=(s.sun||0)/70,reveal=s.mode==='reveal',frame=paneBox(w,h);
 if(reveal)drawStoneWall(ctx,w,h,sun);
 else drawOak(ctx,w,h,time);
 if(reveal){
   // Pools of refracted colour spill over the limestone below the pane.
   ctx.save();ctx.globalCompositeOperation='screen';
   for(const [i,p] of s.pieces.entries()){
     const col=GLASS[p.color],x=frame.x+frame.w*p.x+sun*w*.27,y=frame.y+frame.h*.91+22;
     const rr=ctx.createRadialGradient(x,y,0,x,y,w*.16);
     rr.addColorStop(0,rgba(col.mid,.24));rr.addColorStop(.45,rgba(col.mid,.12));rr.addColorStop(1,rgba(col.mid,0));
     ctx.fillStyle=rr;ctx.beginPath();ctx.ellipse(x,y,w*.24,26+Math.abs(sun)*13,sun*.26,0,TAU);ctx.fill();
   }ctx.restore();
 }
 drawPane(ctx,frame,reveal,sun);
 ctx.save();ctx.clip(panePath(frame));
 // Uncovered spaces remain real translucent backing instead of becoming a full painted image.
 for(const [i,piece] of s.pieces.entries()){
   drawPiece(ctx,piece,frame,{sun,time,reveal,selected:!reveal&&s.mode==='compose'&&s.selected===piece.id,dragging:interaction.drag?.id===piece.id});
 }
 if(s.mode==='lead'||s.mode==='solder'){
   const piece=s.pieces.find(p=>p.id===s.selected);
   if(piece){const pts=piecePolygon(piece,frame);
     if(s.mode==='lead'){
       const samples=polySamples(pts,5),progress=piece.lead||0;
       ctx.save();ctx.strokeStyle='rgba(255,229,163,.83)';ctx.lineWidth=1.8;ctx.setLineDash([5,4]);ctx.stroke(polygonPath(pts));ctx.restore();
       const at=samples[Math.min(samples.length-1,Math.floor(progress*(samples.length-1)))];
       ctx.save();ctx.fillStyle='#ffe9b3';ctx.strokeStyle='#413323';ctx.lineWidth=2;ctx.shadowColor='#f9d391';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(at.x,at.y,7,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
     }else {
       const pos=solderPositions(pts);pos.forEach((p,i)=>{
         if(piece.solder[i]>=1)return;
         ctx.save();ctx.fillStyle='#f0b16e';ctx.strokeStyle='#4e3024';ctx.lineWidth=2;ctx.shadowColor='#eaa064';ctx.shadowBlur=11;
         ctx.beginPath();ctx.arc(p.x,p.y,7.5,0,TAU);ctx.fill();ctx.stroke();ctx.restore();
       });
       if(interaction.hold){const posn=solderPositions(pts)[interaction.hold.index],heat=piece.solder[interaction.hold.index]||0;
         ctx.save();ctx.strokeStyle='#ffda8d';ctx.lineWidth=3.4;ctx.shadowColor='#f4a951';ctx.shadowBlur=16;
         ctx.beginPath();ctx.arc(posn.x,posn.y,14,-Math.PI/2,-Math.PI/2+TAU*heat);ctx.stroke();ctx.restore();
       }
     }
   }
 }
 ctx.restore();
 if(s.mode==='solder'&&interaction.pointer)drawIron(ctx,interaction.pointer.x-24,interaction.pointer.y-41);
 // Scored limestone at the lower edge and work notes on aged paper.
 if(reveal){
   ctx.save();const gloss=ctx.createLinearGradient(0,0,w,0);gloss.addColorStop(0,'#f7eac900');gloss.addColorStop(.55,'#fff0ca20');gloss.addColorStop(1,'#f7eac900');
   ctx.fillStyle=gloss;ctx.fillRect(0,0,w,h);ctx.restore();
 }
}
function drawParticles(ctx,list,time){
 for(const a of list){let t=(time-a.born)/a.ttl;if(t<0||t>1)continue;
 ctx.save();ctx.globalAlpha=(1-t)*.88;ctx.translate(a.x+a.dx*t,a.y+a.dy*t+20*t*t);ctx.rotate(a.angle+t*4);
 ctx.fillStyle=a.color;ctx.shadowBlur=4;ctx.shadowColor=a.color;ctx.beginPath();ctx.moveTo(0,-a.size);ctx.lineTo(a.size,a.size*.5);ctx.lineTo(-a.size*.3,a.size*.5);ctx.closePath();ctx.fill();ctx.restore();
 }
}
export function drawAtelier(ctx,w,h,s,interaction,time){
 ctx.clearRect(0,0,w,h);
 if(s.mode==='cut')drawCut(ctx,w,h,s,interaction,time);
 else drawWindow(ctx,w,h,s,interaction,time);
 if(interaction.particles?.length)drawParticles(ctx,interaction.particles,time);
 // No raster text UI: all instructional text remains accessible DOM.
}
