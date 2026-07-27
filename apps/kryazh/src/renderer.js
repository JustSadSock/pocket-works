import { BLOCK_BY_ID, WORLD_HEIGHT } from './data.js';

const hex = (s) => { const n=parseInt(s.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class VoxelRenderer {
  constructor(canvas, world, settings){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});this.world=world;this.settings=settings;this.w=160;this.h=90;this.image=this.ctx.createImageData(this.w,this.h);this.fps=0;this.frameMs=0;this.triangles=0;this.target=null;this.lastScale=1;this.resize();
  }
  resize(){const q=this.settings.quality||.7;const aspect=Math.max(1.35,this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight));this.h=Math.max(64,Math.min(126,Math.floor(112*q)));this.w=Math.max(112,Math.min(224,Math.floor(this.h*aspect)));this.canvas.width=this.w;this.canvas.height=this.h;this.image=this.ctx.createImageData(this.w,this.h);this.ctx.imageSmoothingEnabled=false;}
  render(player, entities, time, weather, breakProgress=0, heldId=0){
    const start=performance.now(),data=this.image.data,w=this.w,h=this.h,eye=player.eye(),dir=player.dir();
    const fov=(this.settings.fov||74)*Math.PI/180,aspect=w/h,forward=dir;
    const right={x:Math.cos(player.yaw),y:0,z:-Math.sin(player.yaw)};
    const up={x:-Math.sin(player.yaw)*Math.sin(player.pitch),y:Math.cos(player.pitch),z:-Math.cos(player.yaw)*Math.sin(player.pitch)};
    const sun=Math.max(.08,Math.sin((time%1)*Math.PI*2-Math.PI/2)*.58+.48); const skyTop=this.skyColor(time,weather,true), skyBottom=this.skyColor(time,weather,false);
    const maxDist=(this.settings.renderDistance||4)*16;let p=0;
    for(let py=0;py<h;py++){
      const ny=(1-2*(py+.5)/h)*Math.tan(fov/2);
      for(let px=0;px<w;px++){
        const nx=(2*(px+.5)/w-1)*Math.tan(fov/2)*aspect;
        let rx=forward.x+right.x*nx+up.x*ny,ry=forward.y+right.y*nx+up.y*ny,rz=forward.z+right.z*nx+up.z*ny;const rl=1/Math.hypot(rx,ry,rz);rx*=rl;ry*=rl;rz*=rl;
        const hit=this.cast(eye,rx,ry,rz,maxDist);let c;
        if(hit){const b=BLOCK_BY_ID[hit.id],base=hex(b.color);let shade=(hit.face===1?.96:hit.face===2?.72:.82);shade*=clamp(sun+(WORLD_HEIGHT-hit.y)*-.006,.08,1);shade*=clamp(1-hit.dist/maxDist*.72,.25,1);if(hit.underwater) {base[0]=base[0]*.38+30;base[1]=base[1]*.55+70;base[2]=base[2]*.65+90;}if(b.light)shade=Math.max(shade,.75);const speck=((hit.x*73856093^hit.y*19349663^hit.z*83492791^px*13^py*7)&15)-7;c=[base[0]*shade+speck,base[1]*shade+speck,base[2]*shade+speck];}
        else{const t=py/h;c=[skyTop[0]*(1-t)+skyBottom[0]*t,skyTop[1]*(1-t)+skyBottom[1]*t,skyTop[2]*(1-t)+skyBottom[2]*t];if(time>.74||time<.23){const star=((px*73+py*191+(px*py)%97)&511)===3;if(star)c=[210,225,225];}}
        data[p++]=clamp(c[0],0,255);data[p++]=clamp(c[1],0,255);data[p++]=clamp(c[2],0,255);data[p++]=255;
      }
    }
    this.ctx.putImageData(this.image,0,0);this.drawWeather(weather);this.drawEntities(player,entities,maxDist);this.drawTarget(player,breakProgress);this.drawHeld(player,heldId);
    this.frameMs=performance.now()-start;this.fps=this.fps*.9+(1000/Math.max(1,this.frameMs))*.1;
    if(this.settings.dynamicResolution){if(this.frameMs>38&&this.h>64){this.settings.quality=Math.max(.45,(this.settings.quality||.7)-.05);this.resize();}else if(this.frameMs<19&&this.h<112){this.lastScale++;if(this.lastScale>90){this.settings.quality=Math.min(1,(this.settings.quality||.7)+.03);this.resize();this.lastScale=0;}}}
  }
  cast(o,dx,dy,dz,maxDist){
    let x=Math.floor(o.x),y=Math.floor(o.y),z=Math.floor(o.z),sx=dx>=0?1:-1,sy=dy>=0?1:-1,sz=dz>=0?1:-1;
    const ddx=Math.abs(1/(dx||1e-8)),ddy=Math.abs(1/(dy||1e-8)),ddz=Math.abs(1/(dz||1e-8));let tx=(dx>=0?x+1-o.x:o.x-x)*ddx,ty=(dy>=0?y+1-o.y:o.y-y)*ddy,tz=(dz>=0?z+1-o.z:o.z-z)*ddz,dist=0,face=1,underwater=false;
    for(let i=0;i<160&&dist<maxDist;i++){
      const id=this.world.get(x,y,z),b=BLOCK_BY_ID[id];
      if(id&&b){if(b.liquid){underwater=true;}else if(!b.plant&&id!==43)return{x,y,z,id,dist,face,underwater};}
      if(tx<ty&&tx<tz){x+=sx;dist=tx;tx+=ddx;face=0;}else if(ty<tz){y+=sy;dist=ty;ty+=ddy;face=1;}else{z+=sz;dist=tz;tz+=ddz;face=2;}
      if(y<0||y>=WORLD_HEIGHT)break;
    }return null;
  }
  skyColor(time,weather,top){const daylight=Math.max(.05,Math.sin(time*Math.PI*2-Math.PI/2)*.55+.5);const dusk=Math.max(0,1-Math.abs((((time+.25)%1)*2)-1)*5);let c=top?[52+daylight*76,73+daylight*104,92+daylight*120]:[66+daylight*112+dusk*60,76+daylight*112+dusk*28,84+daylight*105];if(weather!=='clear')c=c.map((v,i)=>v*(i===2?.72:.68)+28);return c;}
  project(player,pos){const e=player.eye(),dx=pos.x-e.x,dy=pos.y-e.y,dz=pos.z-e.z,sy=Math.sin(player.yaw),cy=Math.cos(player.yaw);const cx=dx*cy-dz*sy,cz=-dx*sy-dz*cy;const cp=Math.cos(player.pitch),sp=Math.sin(player.pitch),yy=dy*cp-cz*sp,zz=dy*sp+cz*cp;if(zz>=-.2)return null;const f=this.h/(2*Math.tan((this.settings.fov||74)*Math.PI/360));return{x:this.w/2+cx/(-zz)*f,y:this.h/2-yy/(-zz)*f,depth:-zz,scale:f/(-zz)};}
  drawEntities(player,entities,maxDist){const list=entities.filter(e=>!e.dead).map(e=>({e,p:this.project(player,{x:e.x,y:e.y+(e.flying?.5:.7),z:e.z})})).filter(o=>o.p&&o.p.depth<maxDist).sort((a,b)=>b.p.depth-a.p.depth);for(const {e,p} of list){const size=clamp(p.scale*(e.flying?.7:1),2,40);this.ctx.globalAlpha=clamp(1-p.depth/maxDist*.75,.2,1);this.ctx.fillStyle=e.color;this.ctx.fillRect(p.x-size*.38,p.y-size*.65,size*.76,size*.72);this.ctx.fillStyle='rgba(18,24,25,.8)';this.ctx.fillRect(p.x-size*.22,p.y-size*.48,size*.12,size*.1);this.ctx.fillRect(p.x+size*.1,p.y-size*.48,size*.12,size*.1);if(e.hurt>0){this.ctx.fillStyle=`rgba(255,255,255,${e.hurt})`;this.ctx.fillRect(p.x-size*.4,p.y-size*.68,size*.8,size*.76);}this.ctx.globalAlpha=1;}}
  drawTarget(player,progress){const t=this.target;if(!t)return;const center=this.project(player,{x:t.x+.5,y:t.y+.5,z:t.z+.5});if(!center||center.depth<.1)return;const s=clamp(center.scale*.72,8,64);this.ctx.strokeStyle='rgba(242,236,206,.92)';this.ctx.lineWidth=Math.max(1,this.h/100);this.ctx.strokeRect(center.x-s/2,center.y-s/2,s,s);if(progress>0){this.ctx.strokeStyle='rgba(255,195,88,.95)';this.ctx.lineWidth=2;const n=3+Math.floor(progress*6);for(let i=0;i<n;i++){const a=(i*2.399),r=s*.12+i*s*.035;this.ctx.beginPath();this.ctx.moveTo(center.x+Math.cos(a)*r*.25,center.y+Math.sin(a)*r*.25);this.ctx.lineTo(center.x+Math.cos(a+.4)*r,center.y+Math.sin(a+.4)*r);this.ctx.stroke();}}}
  drawWeather(weather){if(weather==='clear')return;this.ctx.strokeStyle=weather==='storm'?'rgba(185,210,220,.6)':'rgba(205,225,230,.42)';this.ctx.lineWidth=1;const count=this.settings.reducedParticles?18:44;const t=performance.now()*.06;for(let i=0;i<count;i++){const x=(i*37+t*1.7)%this.w,y=(i*67+t*3.1)%this.h;this.ctx.beginPath();this.ctx.moveTo(x,y);this.ctx.lineTo(x-2,y+5);this.ctx.stroke();}}
  drawHeld(player,heldId=0){const ctx=this.ctx,w=this.w,h=this.h,swing=Math.sin((1-player.swing)*Math.PI)*5;ctx.save();ctx.translate(w*.79+swing,h*.77+Math.abs(swing)*.25);ctx.rotate(-.38+swing*.02);const block=BLOCK_BY_ID[heldId];ctx.fillStyle=block?.color||'#c28e68';if(block){ctx.fillRect(-7,-7,20,20);ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(-7,-7,20,5);}else{ctx.fillRect(-4,-2,22,9);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(-2,-1,17,2);}ctx.restore();if(player.damageFlash>0){ctx.fillStyle=`rgba(180,32,20,${player.damageFlash*.28})`;ctx.fillRect(0,0,w,h);}}
}
