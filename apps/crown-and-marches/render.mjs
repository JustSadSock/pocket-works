import {W,H,N,xx,yy,idx,PALETTE,COLORS,clamp,strength,hash,cityType,neighbors} from './world.mjs';
import {BW,BH} from './battle.mjs';
const RGB=PALETTE.map(x=>[parseInt(x.slice(1,3),16),parseInt(x.slice(3,5),16),parseInt(x.slice(5,7),16)]);
const mix=(a,b,t)=>a.map((v,k)=>v*(1-t)+b[k]*t);
export class Camera{
 constructor(w,h){this.w=w;this.h=h;this.x=w/2;this.y=h/2;this.zoom=1;this.s=1;this.ox=0;this.oy=0}
 layout(w,h){this.s=Math.min(w/this.w,h/this.h)*this.zoom;this.ox=w/2-this.x*this.s;this.oy=h/2-this.y*this.s}
 screen(x,y){return [(x-this.ox)/this.s,(y-this.oy)/this.s]}
 pan(dx,dy){this.x=clamp(this.x-dx/this.s,0,this.w);this.y=clamp(this.y-dy/this.s,0,this.h)}
 zoomAt(f,x,y,w,h){let [a,b]=this.screen(x,y);this.zoom=clamp(this.zoom*f,.75,24);this.layout(w,h);let [c,d]=this.screen(x,y);this.x=clamp(this.x+a-c,0,this.w);this.y=clamp(this.y+b-d,0,this.h)}
}
export class Atlas{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.land=document.createElement('canvas');this.land.width=W;this.land.height=H;this.cache='';this.terrain=document.createElement('canvas');this.terrain.width=1000;this.terrain.height=640;this.lastBattle=null}
 resize(quality){let rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,quality==='low'?1:2);let w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}this.width=rect.width;this.height=rect.height;this.ctx.setTransform(dpr,0,0,dpr,0,0)}
 texture(s,mode){let key=s.seed+'|'+(s.mapVersion||1)+'|'+mode+'|'+Math.floor(s.day/4)+'|'+s.cities.length+'|'+s.news.length;if(key===this.cache)return;this.cache=key;let ctx=this.land.getContext('2d'),im=ctx.createImageData(W,H),data=im.data,by=new Map(s.cities.map(c=>[c.id,c]));for(let i=0;i<N;i++){let m=s.map,e=m.height[i],j=i*4,c;
if(!m.land[i]){let v=clamp(e+.12,0,.24);c=[32+v*100,67+v*100,80+v*85]}else{let p=m.terrain[i],base=p===4?[159,156,143]:p===3?[147,139,106]:p===2?[68,106,73]:p===5?[99,130,101]:p===6?[170,160,113]:[136,158,99],hill=(m.height[Math.max(0,i-1)]-e)*180+(m.height[Math.max(0,i-W)]-e)*150,grain=(hash(s.seed+i)%9)-4;c=base.map(v=>v+hill+grain);if(m.river[i])c=mix(c,[47,110,134],.82);let owner=s.owner[i],city=by.get(s.admin[i]);if(mode==='political'&&owner>=0)c=mix(c,RGB[owner],.56);if(mode==='resource')c=mix(c,COLORS[m.resource[i]]?.match(/\w\w/g)?.map(x=>parseInt(x,16))||[150,150,150],.75);if(mode==='admin'&&city)c=mix(c,[75+hash(city.id)%150,85+hash(city.id+'g')%140,85+hash(city.id+'b')%140],.75);if(mode==='economy'&&city)c=mix(c,[206,155,65],Math.min(.9,city.wealth/100)*(s.development?.[i]||0));if(mode==='population'&&city)c=mix(c,[175,66,46],clamp(city.pop/4000,.15,.95));if(mode==='supply'){let near=s.cities.filter(c=>c.f===0).some(c=>Math.hypot(xx(c.i)-xx(i),yy(c.i)-yy(i))<9);c=mix(c,near?[120,200,133]:[116,100,91],.65)}if(mode==='development')c=mix(c,[229,191,101],(s.development?.[i]||0)*.9);if(mode==='admin'&&city&&!s.adminAccess?.[i])c=mix(c,[39,39,36],.65);if(mode==='war'&&s.occ[i]>=0)c=mix(c,RGB[s.occ[i]],.8);if(mode==='war'&&s.occ[i]<0&&s.pressure?.[i]>.05)c=mix(c,[171,72,43],s.pressure[i]*.7);if(s.devastation?.[i]>.1)c=mix(c,[81,68,57],s.devastation[i]*.65);if(s.occ[i]>=0&&((xx(i)+yy(i))%4<2))c=mix(c,[45,35,31],.5);}
data[j]=c[0];data[j+1]=c[1];data[j+2]=c[2];data[j+3]=255}ctx.putImageData(im,0,0)}
 map(s,cam,mode,selection,quality){this.resize(quality);let c=this.ctx,w=this.width,h=this.height;cam.layout(w,h);this.texture(s,mode);c.fillStyle='#203b43';c.fillRect(0,0,w,h);c.save();c.translate(cam.ox,cam.oy);c.scale(cam.s,cam.s);c.imageSmoothingEnabled=mode!=='grid';c.drawImage(this.land,0,0);let scale=cam.s;
if(mode!=='geography'){c.lineWidth=.85/scale;c.strokeStyle='#e0d3acb8';c.beginPath();for(let y=0;y<H;y++)for(let x=0;x<W;x++){let i=idx(x,y),f=s.owner[i];if(f<0)continue;if(x===0||s.owner[i-1]!==f){c.moveTo(x,y);c.lineTo(x,y+1)}if(y===0||s.owner[i-W]!==f){c.moveTo(x,y);c.lineTo(x+1,y)}if(x===W-1||s.owner[i+1]<0){c.moveTo(x+1,y);c.lineTo(x+1,y+1)}if(y===H-1||s.owner[i+W]<0){c.moveTo(x,y+1);c.lineTo(x+1,y+1)}}c.stroke()}

// Cartographic paths remain continuous; only the explicit survey layer shows the cell grid.
const minX=clamp(Math.floor(-cam.ox/scale)-1,0,W-1),maxX=clamp(Math.ceil((w-cam.ox)/scale)+1,0,W-1),minY=clamp(Math.floor(-cam.oy/scale)-1,0,H-1),maxY=clamp(Math.ceil((h-cam.oy)/scale)+1,0,H-1);
const visible=[];for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)visible.push(idx(x,y));
c.lineCap='round';c.strokeStyle='#4c93a1';c.lineWidth=Math.max(.7/scale,.13);c.beginPath();
for(const i of visible){let d=s.map.down[i];if(!s.map.river[i]||d<0)continue;c.moveTo(xx(i)+.5,yy(i)+.5);c.lineTo(xx(d)+.5,yy(d)+.5);}c.stroke();
if(cam.zoom>1.7){
 c.lineWidth=.10;c.strokeStyle='#ceb584';c.beginPath();
 for(const i of visible)if(s.road[i])for(const j of neighbors(i))if(j>i&&s.road[j]){c.moveTo(xx(i)+.5,yy(i)+.5);c.lineTo(xx(j)+.5,yy(j)+.5);}c.stroke();
 for(const i of visible)if(s.bridge?.[i]){const x=xx(i)+.5,y=yy(i)+.5;c.strokeStyle='#e4c59b';c.lineWidth=.17;c.beginPath();c.moveTo(x-.24,y);c.lineTo(x+.24,y);c.stroke();}
}
if(cam.zoom>4){
 for(const i of visible){if(!s.map.land[i])continue;let x=xx(i),y=yy(i),d=s.district?.[i]||0,dev=s.development?.[i]||0;
 if(d===2&&dev>.15){c.fillStyle='#b6ad71';c.fillRect(x+.12,y+.14,.76,.72);c.strokeStyle='#716b3d';c.lineWidth=.025;for(let k=1;k<=5;k++){c.beginPath();c.moveTo(x+.12+k*.12,y+.15);c.lineTo(x+.12+k*.12,y+.85);c.stroke();}}
 else if(d===4&&dev>.15){c.fillStyle='#8b7969';c.fillRect(x+.2,y+.22,.6,.55);c.strokeStyle='#e0bca0';c.lineWidth=.055;c.beginPath();c.moveTo(x+.25,y+.65);c.lineTo(x+.7,y+.28);c.stroke();}
 else if([1,5,6,7,8,9].includes(d)){for(let k=0;k<Math.min(7,2+Math.floor(dev*6));k++){const dx=x+.12+(k%3)*.26,dy=y+.14+Math.floor(k/3)*.25;c.fillStyle='#d4c29b';c.fillRect(dx,dy+.08,.19,.17);c.fillStyle=d===5?'#8b6448':d===6?'#ae794d':d===9?'#7f7770':'#854c37';c.beginPath();c.moveTo(dx-.025,dy+.08);c.lineTo(dx+.095,dy-.025);c.lineTo(dx+.215,dy+.08);c.closePath();c.fill();}if(d===8){c.strokeStyle='#c1b59e';c.lineWidth=.09;c.strokeRect(x+.07,y+.07,.86,.86);}if(d===7){c.fillStyle='#c6a477';c.fillRect(x+.25,y+.6,.5,.13);}}
 else if(s.map.terrain[i]===2){for(let k=0;k<3;k++){const n=hash(s.seed+'tree'+i+':'+k),px=x+.14+(n%67)/100,py=y+.18+((n>>>8)%62)/100;c.fillStyle='#334f3d';c.beginPath();c.ellipse(px+.04,py+.05,.12,.1,0,0,Math.PI*2);c.fill();c.fillStyle='#456c46';c.beginPath();c.moveTo(px,py-.15);c.lineTo(px+.12,py+.1);c.lineTo(px-.12,py+.1);c.closePath();c.fill();}}
 }
}
if(mode==='grid'){c.lineWidth=.5/scale;c.strokeStyle='#ede5c955';c.beginPath();for(let x=minX;x<=maxX+1;x++){c.moveTo(x,minY);c.lineTo(x,maxY+1);}for(let y=minY;y<=maxY+1;y++){c.moveTo(minX,y);c.lineTo(maxX+1,y);}c.stroke();}
c.lineWidth=1/scale;for(const r of s.routes){c.strokeStyle=r.sea?'#b7e4edb0':'#e0b85eaa';c.setLineDash([3/scale,3/scale]);c.beginPath();c.moveTo(xx(r.a)+.5,yy(r.a)+.5);for(const i of r.path||[])c.lineTo(xx(i)+.5,yy(i)+.5);c.lineTo(xx(r.b)+.5,yy(r.b)+.5);c.stroke()}c.setLineDash([]);
for(const sh of s.shipments||[]){let x,y;if(sh.sea){let t=clamp(sh.progress/sh.duration,0,1);x=xx(sh.start)+.5+(xx(sh.end)-xx(sh.start))*t;y=yy(sh.start)+.5+(yy(sh.end)-yy(sh.start))*t;}else{let next=sh.path[sh.index]??sh.i,t=clamp(sh.progress,0,1);x=xx(sh.i)+.5+(xx(next)-xx(sh.i))*t;y=yy(sh.i)+.5+(yy(next)-yy(sh.i))*t;}if(cam.zoom>2){c.fillStyle=sh.wait?'#b55039':'#e6c68d';c.strokeStyle='#4d4635';c.lineWidth=.05;c.fillRect(x-.12,y-.08,.24,.16);c.strokeRect(x-.12,y-.08,.24,.16);if(cam.zoom>5){c.fillStyle='#403e32';for(const dx of [-.08,.08]){c.beginPath();c.arc(x+dx,y+.09,.04,0,Math.PI*2);c.fill();}}}}
for(const a of s.armies){if(!a.path.length)continue;c.strokeStyle=PALETTE[a.f];c.lineWidth=1.6/scale;c.beginPath();c.moveTo(xx(a.i)+.5,yy(a.i)+.5);for(const i of a.path)c.lineTo(xx(i)+.5,yy(i)+.5);c.stroke()}
c.restore();
for(const city of s.cities){let x=cam.ox+(xx(city.i)+.5)*scale,y=cam.oy+(yy(city.i)+.5)*scale;if(x<-80||y<-30||x>w+80||y>h+30)continue;let r=city.capital?7:5;c.save();c.translate(x,y);c.fillStyle='#231f1a99';c.fillRect(-r+1,-r+2,r*2,r*2);c.fillStyle=city.occupation>=0?PALETTE[city.occupation]:PALETTE[city.f];c.strokeStyle='#f6e2b5';c.lineWidth=1.5;c.beginPath();c.rect(-r,-r,r*2,r*2);c.fill();c.stroke();if(city.fort||city.capital){c.fillStyle='#ead6a5';c.fillRect(-r,-r-3,3,4);c.fillRect(r-3,-r-3,3,4)}if(selection?.kind==='city'&&selection.id===city.id){c.strokeStyle='#fff3b5';c.lineWidth=2;c.beginPath();c.arc(0,0,r+6,0,Math.PI*2);c.stroke()}if(city.capital||cam.zoom>1.25||selection?.id===city.id&&selection.kind==='city'){c.font=(city.capital?'bold ':'')+'12px Georgia';c.textAlign='center';c.strokeStyle='#1c2b28';c.lineWidth=3;c.strokeText(city.name,0,r+14);c.fillStyle='#fff0ce';c.fillText(city.name,0,r+14)}c.restore()}
for(const a of s.armies){let x=cam.ox+(xx(a.i)+.5)*scale,y=cam.oy+(yy(a.i)+.5)*scale-12;c.fillStyle=PALETTE[a.f];c.strokeStyle=selection?.kind==='army'&&selection.id===a.id?'#fff2a7':'#f4d3a6';c.lineWidth=1.5;c.fillRect(x-13,y-8,26,16);c.strokeRect(x-13,y-8,26,16);c.fillStyle='#fff';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(strength(a),x,y+3)}
if(selection?.kind==='cell'){let i=selection.id,x=cam.ox+(xx(i)+.5)*scale,y=cam.oy+(yy(i)+.5)*scale;c.strokeStyle='#fff0a5';c.lineWidth=2;c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.stroke()}
}
 battle(b,cam,selected,quality){this.resize(quality);let c=this.ctx,w=this.width,h=this.height;cam.layout(w,h);if(this.lastBattle!==b){this.lastBattle=b;this.figures?.clear();let t=this.terrain.getContext('2d');for(let i=0;i<b.terrain.length;i++){let a=b.terrain[i],x=i%50*20,y=Math.floor(i/50)*20,v=Math.floor(a.h*95);t.fillStyle=a.water?'#52899b':a.bridge?'#b99a6b':a.road?'#b6a47a':a.field?'#b0a46d':a.fort?'#857b6d':a.building?'#b68f6e':a.forest?'rgb('+(65+v)+','+(93+v)+','+(58+v)+')':'rgb('+(131+v)+','+(146+v)+','+(86+v)+')';t.fillRect(x,y,20,20);if(a.building){t.fillStyle=a.fort?'#625e57':'#82513d';t.fillRect(x+3,y+3,14,14);t.fillStyle='#d4c0a0';t.fillRect(x+5,y+14,10,4);}if(a.field){t.strokeStyle='#897d50';t.lineWidth=.8;for(let f=3;f<20;f+=5){t.beginPath();t.moveTo(x+f,y);t.lineTo(x+f,y+20);t.stroke();}}if(a.bridge){t.strokeStyle='#6b5336';for(let f=2;f<20;f+=4){t.beginPath();t.moveTo(x+f,y);t.lineTo(x+f,y+20);t.stroke();}}if(!a.water&&!a.building&&!a.road){t.strokeStyle='#56644025';t.lineWidth=.5;t.beginPath();for(let j=0;j<4;j++){let px=x+(i*13+j*7)%19,py=y+(i*7+j*11)%19;t.moveTo(px,py);t.lineTo(px+2,py-3);}t.stroke();}if(a.forest){t.fillStyle='#344d38';for(let j=0;j<3;j++){let px=x+4+j*6,py=y+5+(i+j*7)%13;t.beginPath();t.arc(px,py,4,0,Math.PI*2);t.fill()}}}if(b.settlement&&!b.terrain.some(t=>t.worldCell!==undefined)){for(let j=0;j<8;j++){t.fillStyle='#bba57c';t.fillRect(480+(j%4)*13,240+Math.floor(j/4)*15,10,9);t.fillStyle='#684c3c';t.fillRect(480+(j%4)*13,240+Math.floor(j/4)*15,10,4)}}}
c.fillStyle='#273b31';c.fillRect(0,0,w,h);c.save();c.translate(cam.ox,cam.oy);c.scale(cam.s,cam.s);c.drawImage(this.terrain,0,0);
for(const g of b.units){if(!g.alive)continue;if(selected.includes(g.id)){c.strokeStyle='#ffeb9b';c.lineWidth=2/cam.s;c.strokeRect(g.x-38,g.y-38,76,76);if(g.order!=='hold'&&g.order!=='defend'){c.beginPath();c.moveTo(g.x,g.y);c.lineTo(g.tx,g.ty);c.stroke()}}}

// Sprites are generated once for each silhouette, faction, orientation and animation phase.
// At overview scale draw the same physical soldiers with low-detail atlas glyphs.
this.figures??=new Map();
const detail=cam.s>=1.25&&quality!=='low', phase=Math.floor(b.time*7)%4;
const sprite=(p,g)=>{
 const face=(Math.round(p.angle/(Math.PI/8))+16)%16,pose=p.hp<=0?'down':p.state==='shoot'?'shoot':p.hit>0?'hit':p.state==='block'?'block':p.state==='fight'?'fight':p.state==='move'||p.state==='flee'?'walk':'stand';
 const moving=pose==='walk'||pose==='fight'||pose==='shoot';
 const key=[p.type,g.f,face,pose,moving?phase:0,detail].join(':');
 let a=this.figures.get(key);if(a)return a;
 a=document.createElement('canvas');a.width=a.height=64;const q=a.getContext('2d');q.translate(32,32);q.scale(2,2);q.rotate(face*Math.PI/8);
 const horse=p.type===6||p.type===7,ink=PALETTE[g.f]||'#c2b89e',step=moving?Math.sin(phase*Math.PI/2)*1.5:0;
 if(pose==='down'){q.fillStyle='#3b332c90';q.fillRect(-4,-1,8,3);q.fillStyle=ink;q.fillRect(-3,-1.8,4,2.6);this.figures.set(key,a);return a;}
 q.fillStyle='#25342955';q.beginPath();q.ellipse(-1,2,horse?6:3.5,horse?3:2.5,0,0,Math.PI*2);q.fill();
 if(horse){q.fillStyle=p.type===7?'#55453d':'#916d45';q.beginPath();q.ellipse(-.8,0,5.8,2.5,0,0,Math.PI*2);q.fill();q.fillStyle='#483b2d';q.fillRect(4,-1.2,3,2.4);q.strokeStyle='#44372c';q.lineWidth=1.1;q.beginPath();q.moveTo(-4,-2);q.lineTo(-5+step,-3.5);q.moveTo(3,2);q.lineTo(3-step,3.8);q.stroke();}
 if(detail&&!horse){q.strokeStyle='#564a39';q.lineWidth=1.1;q.beginPath();q.moveTo(-1,-1);q.lineTo(-3+step,-2);q.moveTo(-1,1);q.lineTo(-3-step,2);q.stroke();}
 q.fillStyle=pose==='hit'?'#e7bb92':ink;q.beginPath();q.ellipse(-.7,0,2.2,2.1,0,0,Math.PI*2);q.fill();
 q.fillStyle=p.type===0?'#bea67a':p.type===4?'#765b39':'#c6c5b7';q.beginPath();q.arc(1.2,0,1.65,0,Math.PI*2);q.fill();
 if(p.type===0||p.type===1||p.type===2||p.type===7){q.fillStyle='#b5a07a';q.beginPath();q.ellipse(pose==='block'?2:.6,pose==='block'?-.9:-2.4,1.8,1,0,0,Math.PI*2);q.fill();q.strokeStyle='#625b43';q.lineWidth=.35;q.stroke();}
 q.strokeStyle='#dad2b3';q.lineWidth=detail?.7:1;
 if([4,5,9].includes(p.type)){q.beginPath();q.moveTo(2,-2);q.quadraticCurveTo(6,0,2,2);q.stroke();if(p.type===5){q.beginPath();q.moveTo(4,-2.4);q.lineTo(4,2.4);q.stroke();}}
 else{let reach=[4,5,8,12,4,4,7,9,3,4][p.type];q.beginPath();q.moveTo(0,2);q.lineTo(reach+(pose==='fight'?step:0),pose==='fight'?1:2);q.stroke();}
 if(this.figures.size>=1500)this.figures.delete(this.figures.keys().next().value);this.figures.set(key,a);return a;
};
for(const p of b.soldiers){if(p.state==='escaped'||p.state==='captured')continue;let g=b.units[p.g];if(p.hp<=0&&quality==='low')continue;
 if(p.x*cam.s+cam.ox<-30||p.x*cam.s+cam.ox>w+30||p.y*cam.s+cam.oy<-30||p.y*cam.s+cam.oy>h+30)continue;
 c.drawImage(sprite(p,g),p.x-16,p.y-16,32,32);}
if(b.previewLine){const [a,z]=b.previewLine;c.strokeStyle='#ffe6aa';c.lineWidth=2/cam.s;c.setLineDash([6/cam.s,4/cam.s]);c.beginPath();c.moveTo(...a);c.lineTo(...z);c.stroke();c.setLineDash([]);}c.lineWidth=.65;c.strokeStyle='#f4e0aa';c.beginPath();for(const p of b.projectiles||[]){c.moveTo(p.x,p.y);c.lineTo(p.x-p.vx*.045,p.y-p.vy*.045);}c.stroke();
c.restore();for(const g of b.units){if(!g.alive)continue;let x=cam.ox+g.x*cam.s,y=cam.oy+g.y*cam.s-24*cam.s;c.fillStyle=PALETTE[g.f];c.fillRect(x-13,y-7,26,14);c.strokeStyle=selected.includes(g.id)?'#fff0a5':'#e6d0a3';c.strokeRect(x-13,y-7,26,14);c.fillStyle='white';c.font='bold 10px system-ui';c.textAlign='center';c.fillText(g.alive,x,y+3)}
}
}
