import { WORLD, LEVEL, ROBOT, progressGame } from './engine.js';
import { COURSE_THEMES,deviceRect } from './course.js';
const C = { sky:'#a5b6ab', haze:'#dce4da', ink:'#334047', wall:'#77817a', dark:'#344247',
  edge:'#f2e6c9', copper:'#d78b49', amber:'#f6ba67', red:'#ce7b65', teal:'#6a9b9e' };
const rr=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
export function createRenderer(canvas) {
  const ctx=canvas.getContext('2d');
  let w=800,h=460,scale=1,camX=0,shake=0,flash=0,previousLevel=null;
  const resize=()=>{
    const rect=canvas.getBoundingClientRect();
    w=Math.max(1,rect.width);h=Math.max(1,rect.height);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize',resize);resize();
  const impact=(power=1)=>{shake=Math.min(8,shake+power*2.2);flash=Math.min(.17,flash+power*.027);};
  function frame(state,now=0,mode='playing') {
    const level=state.level||LEVEL;
    if(previousLevel!==level){camX=0;previousLevel=level;}
    const theme=COURSE_THEMES.find(t=>t.id===level.theme)||COURSE_THEMES[0];
    const viewH=7.9, viewW=Math.min(20,Math.max(5.6,viewH*w/h));
    scale=h/viewH;
    const wanted=Math.max(0,Math.min((level.width||WORLD.width)-viewW,state.x-viewW*.38));
    camX+=(wanted-camX)*.11;
    if(wanted===0 && camX<.015)camX=0;
    const shakeX=shake>0?Math.sin(now*.071)*shake:0;
    shake=Math.max(0,shake-.35);
    const sx=x=>(x-camX)*scale+shakeX;
    const sy=y=>y*scale;
    // Background: industrial painted panels, grounded by geometry rather than global noise.
    const sky=ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,'#d9dfd2');sky.addColorStop(.62,theme.base);sky.addColorStop(1,theme.ground);
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(-camX*scale*.18,0);
    ctx.fillStyle='#a8baaf';
    for(let i=0;i<24;i++){const x=i*104-80;ctx.fillRect(x,28,1.8,h-55);
      ctx.fillStyle='rgba(255,255,255,.17)';ctx.fillRect(x+10,35,74,4);
      ctx.fillStyle='#a8baaf';}
    ctx.fillStyle='#91a69c';
    for(let i=0;i<15;i++){
      const x=i*132-45, y=62+(i%3)*13;
      rr(ctx,x,y,78,108,9);ctx.fill();
      ctx.fillStyle='#698881';rr(ctx,x+13,y+13,52,8,3);ctx.fill();ctx.fillStyle='#91a69c';
      ctx.fillStyle='rgba(45,74,76,.24)';
      ctx.fillRect(x+19,y+33,8,42);ctx.fillRect(x+33,y+46,8,29);ctx.fillRect(x+47,y+25,8,50);
      ctx.fillStyle='#91a69c';
    }
    ctx.restore();
    // Three places, three recognizable sets of machinery. The background is
    // inert; everything with collision or force is drawn in the stage layer.
    ctx.save();ctx.translate(-camX*scale*.29,0);ctx.globalAlpha=.34;
    for(let i=0;i<16;i++){
      const x=i*161-40,ground=sy(6.25);
      if(level.theme==='warehouse'){
        ctx.strokeStyle='#495c55';ctx.lineWidth=4;
        ctx.strokeRect(x,ground-126,128,122);
        for(let shelf=0;shelf<3;shelf++){
          const yy=ground-110+shelf*39;
          ctx.fillStyle='#806957';ctx.fillRect(x+9,yy,100,27);
          ctx.strokeStyle='#d4bd8f';ctx.lineWidth=1.5;ctx.strokeRect(x+9,yy,100,27);
          ctx.beginPath();ctx.moveTo(x+9,yy);ctx.lineTo(x+109,yy+27);ctx.stroke();
        }
      }else if(level.theme==='kitchen'){
        ctx.strokeStyle='#e2ebe0';ctx.lineWidth=7;
        ctx.beginPath();ctx.moveTo(x+20,ground-190);ctx.lineTo(x+20,ground-90);
        ctx.quadraticCurveTo(x+20,ground-70,x+42,ground-70);ctx.lineTo(x+91,ground-70);
        ctx.stroke();ctx.strokeStyle='#466b6c';ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(x+80,ground-103,35,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.arc(x+80,ground-103,23,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#d6c6a6';ctx.fillRect(x+35,ground-46,85,43);
      }else{
        ctx.fillStyle='#617a75';ctx.fillRect(x+18,ground-142,112,119);
        ctx.fillStyle='#adc0b4';rr(ctx,x+31,ground-122,85,80,9);ctx.fill();
        ctx.strokeStyle='#465d58';ctx.lineWidth=4;ctx.stroke();
        ctx.fillStyle='#607f79';
        for(let z=0;z<3;z++){ctx.beginPath();ctx.arc(x+51+z*25,ground-105+z*6,6,0,Math.PI*2);ctx.fill();}
      }
    }
    ctx.restore();
    ctx.fillStyle='#667b73';ctx.fillRect(0,sy(7.6),w,Math.max(0,h-sy(7.6)));
    // Gap shadow / guard channel behind platforms
    ctx.fillStyle='#394e50';ctx.fillRect(0,sy(6.45),w,h-sy(6.45));
    ctx.strokeStyle='rgba(233,221,194,.16)';ctx.lineWidth=1;
    for(let x=-10;x<30;x+=.48){const px=sx(x);ctx.beginPath();ctx.moveTo(px,sy(7.4));ctx.lineTo(px+scale*.2,sy(7.56));ctx.stroke();}
    // Finish apparatus
    const goalX=sx(level.goal);
    ctx.fillStyle='#526e66';ctx.fillRect(goalX-14,sy(4.75),28,sy(6.5)-sy(4.75));
    ctx.fillStyle=C.amber;rr(ctx,goalX-32,sy(4.5),64,26,5);ctx.fill();
    ctx.fillStyle=C.ink;ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.fillText('ФИНИШ',goalX,sy(4.5)+17);
    ctx.strokeStyle='#d6e8d5';ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(goalX,sy(4.9));ctx.lineTo(goalX,sy(6.4));ctx.stroke();ctx.setLineDash([]);
    for(const p of level.platforms) {
      const x=sx(p.x),y=sy(p.y),ww=p.w*scale,hh=p.h*scale;
      ctx.fillStyle='#455658';ctx.fillRect(x+4,y+8,ww,hh);
      ctx.fillStyle=theme.ground;ctx.fillRect(x,y,ww,hh);
      ctx.fillStyle='#f2e7cc';ctx.fillRect(x,y,ww,8);
      ctx.fillStyle='#acb5a0';ctx.fillRect(x,y+8,ww,10);
      ctx.fillStyle='rgba(40,53,56,.16)';
      for(let k=10;k<ww;k+=38){ctx.fillRect(x+k,y+23,3,Math.min(46,hh-24));}
      for(let k=30;k<ww;k+=78){
        ctx.fillStyle='#435054';ctx.beginPath();ctx.arc(x+k,y+5,2.4,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle=theme.accent;
      for(let k=13;k<ww-15;k+=55)ctx.fillRect(x+k,y+13,23,3);
    }
    // Explicit working mechanisms: painted surfaces mirror physics effects.
    for(const device of level.devices||[]){
      const x=sx(device.x),ww=device.w*scale,top=sy(6.5);
      if(x+ww<-50||x>w+50)continue;
      ctx.save();
      if(device.type==='warning'){
        ctx.fillStyle='#e4b56f';ctx.fillRect(x,top-9,ww,8);
        ctx.strokeStyle='#263e41';ctx.lineWidth=2;
        for(let stripe=0;stripe<ww;stripe+=17){ctx.beginPath();ctx.moveTo(x+stripe,top-9);ctx.lineTo(x+stripe+7,top-1);ctx.stroke();}
      }else if(device.type.startsWith('belt-')){
        ctx.fillStyle=device.type==='belt-right'?'#69929a':'#bd8467';
        ctx.fillRect(x,top-14,ww,13);
        ctx.fillStyle='#34474b';
        for(let px=x+10;px<x+ww;px+=25){
          const shift=(((state.t*75*(device.type==='belt-right'?1:-1))%25)+25)%25;
          ctx.beginPath();ctx.arc(px+shift,top-7.5,3,0,Math.PI*2);ctx.fill();
        }
        ctx.fillStyle='#f8e7cc';ctx.font='900 15px system-ui';
        ctx.textAlign='center';ctx.fillText(device.type==='belt-right'?'→ →':'← ←',x+ww/2,top-17);
      }else if(device.type==='spring'){
        ctx.fillStyle='#d5a76b';rr(ctx,x,top-17,ww,16,5);ctx.fill();
        ctx.strokeStyle='#425c57';ctx.lineWidth=2.5;
        for(let px=x+8;px<x+ww-7;px+=13){
          ctx.beginPath();ctx.moveTo(px,top-16);ctx.lineTo(px+6,top-6);ctx.lineTo(px+12,top-16);ctx.stroke();
        }
      }else if(device.type==='fan-up'||device.type==='fan-side'){
        ctx.fillStyle='#e4dfc9';ctx.strokeStyle='#51676a';ctx.lineWidth=2.5;
        const mid=x+ww/2,cy=top-35;
        ctx.beginPath();ctx.arc(mid,cy,19,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.save();ctx.translate(mid,cy);ctx.rotate(state.t*6);
        for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.fillStyle='#759e98';
          ctx.beginPath();ctx.ellipse(0,-9,5.5,11,.3,0,Math.PI*2);ctx.fill();}
        ctx.restore();ctx.fillStyle='#45565a';
        ctx.beginPath();ctx.arc(mid,cy,4.5,0,Math.PI*2);ctx.fill();
        ctx.font='bold 12px ui-monospace,monospace';ctx.textAlign='center';
        ctx.fillText(device.type==='fan-up'?'↑ ↑ ↑':'← ← ←',mid,top-64);
        ctx.globalAlpha=.22;ctx.fillStyle='#dcebd9';
        if(device.type==='fan-up'){ctx.fillRect(x,sy(4.55),ww,top-sy(4.55));}
        else ctx.fillRect(x,sy(4.75),ww,top-sy(4.75));
      }else if(device.type==='press'){
        const r=deviceRect(device,state.t),yy=sy(r.y);
        ctx.fillStyle='#4c6566';ctx.fillRect(x+ww*.34,sy(1.25),ww*.32,yy-sy(1.25));
        ctx.fillStyle='#bd806a';rr(ctx,x-4,yy,ww+8,r.h*scale,3);ctx.fill();
        ctx.fillStyle='#e9bc78';ctx.fillRect(x-4,yy,ww+8,7);
        ctx.strokeStyle='#34454a';ctx.lineWidth=4;
        for(let v=0;v<ww;v+=19){ctx.beginPath();ctx.moveTo(x+v,yy+r.h*scale-13);
          ctx.lineTo(x+v+10,yy+r.h*scale-2);ctx.stroke();}
      }else if(device.type==='gate'){
        const r=deviceRect(device,state.t),yy=sy(r.y);
        ctx.fillStyle='#d1a776';ctx.fillRect(x-8,sy(2.1),ww+16,7);
        ctx.fillStyle=r.active?'#c27e65':'#839d91';
        ctx.fillRect(x,yy,ww,r.h*scale);
        ctx.strokeStyle='#3b5456';ctx.lineWidth=3;ctx.strokeRect(x,yy,ww,r.h*scale);
        for(let py=yy+11;py<yy+r.h*scale;py+=17){
          ctx.beginPath();ctx.moveTo(x+3,py);ctx.lineTo(x+ww-3,py);ctx.stroke();
        }
      }else if(device.type==='step'){
        ctx.fillStyle='#e3b370';ctx.font='900 12px ui-monospace,monospace';
        ctx.textAlign='center';ctx.fillText('↑',x+ww/2,sy(5.4)-12);
      }
      ctx.restore();
    }
    // Physical checkpoint, not an invisible collision trigger.
    const markerX=sx(level.checkpoint);
    ctx.fillStyle='#3d6260';ctx.fillRect(markerX-3,sy(5.55),6,sy(6.25)-sy(5.55));
    ctx.fillStyle=state.checkpoint>=level.checkpoint?'#f6c57c':'#d5d2ad';
    ctx.beginPath();ctx.moveTo(markerX+4,sy(5.53));ctx.lineTo(markerX+37,sy(5.63));ctx.lineTo(markerX+4,sy(5.81));ctx.closePath();ctx.fill();
    // Each section has a numbered enamel plate, readable at wide and narrow zoom.
    for(const section of level.sections||[]){
      const xx=sx(section.x+.5);
      if(xx < -60||xx>w+60)continue;
      ctx.fillStyle='#465d5e';rr(ctx,xx,sy(2.85),40,20,3);ctx.fill();
      ctx.fillStyle='#f8edcf';ctx.textAlign='center';ctx.font='800 11px ui-monospace,monospace';
      ctx.fillText(String(section.index).padStart(2,'0'),xx+20,sy(2.85)+14);
    }
    // Boltik: composed of a chassis, integrated wheel axles, enamel front, antenna and expressive optics.
    const px=sx(state.x),py=sy(state.y);
    ctx.save();ctx.translate(px,py);ctx.rotate(state.rotation);
    const u=scale;
    const bw=ROBOT.halfWidth*u*2,bh=ROBOT.halfHeight*u*2;
    const drop=state.ground?0:2.6;
    ctx.fillStyle='rgba(30,52,50,.27)';ctx.beginPath();ctx.ellipse(1,ROBOT.halfHeight*u+8,24,5,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#5d6261';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-bh*.39);ctx.lineTo(0,-bh*.6);ctx.stroke();
    ctx.fillStyle=C.copper;ctx.beginPath();ctx.arc(0,-bh*.61,4.4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3d4d4f';rr(ctx,-bw*.54,-bh*.27,bw*1.08,bh*.62,8);ctx.fill();
    ctx.fillStyle='#e8dfc8';rr(ctx,-bw*.49,-bh*.46,bw*.98,bh*.73,8);ctx.fill();
    ctx.strokeStyle='#82918a';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#f0ae62';rr(ctx,-bw*.33,-bh*.26,bw*.66,bh*.25,4);ctx.fill();
    ctx.fillStyle='#304249';
    const eyeY=-bh*.15;
    for(let v of [-1,1]){
      rr(ctx,v*bw*.135-bw*.07,eyeY,bw*.14,bh*.12,2);ctx.fill();
    }
    ctx.fillStyle='#ca7660';ctx.fillRect(-bw*.08,bh*.09,bw*.16,3);
    for(const side of [-1,1]) {
      ctx.strokeStyle='#667273';ctx.lineWidth=3.5;
      ctx.beginPath();ctx.moveTo(side*bw*.4,0);ctx.lineTo(side*bw*.59,drop+bh*.08);ctx.stroke();
      const wheelX=side*bw*.4, wheelY=bh*.3+drop;
      ctx.fillStyle='#344347';ctx.beginPath();ctx.arc(wheelX,wheelY,u*.175,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a5b6ad';ctx.beginPath();ctx.arc(wheelX,wheelY,u*.095,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#e4dbbe';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(wheelX+Math.cos(state.t*state.vx*2)*u*.085,wheelY+Math.sin(state.t*state.vx*2)*u*.085);
      ctx.lineTo(wheelX-Math.cos(state.t*state.vx*2)*u*.085,wheelY-Math.sin(state.t*state.vx*2)*u*.085);ctx.stroke();
    }
    ctx.fillStyle='#737e74';ctx.beginPath();ctx.arc(-bw*.37,-bh*.37,2.3,0,7);ctx.arc(bw*.37,-bh*.37,2.3,0,7);ctx.fill();
    ctx.restore();
    // Clear progress indicator inside the world, showing overall track context.
    const barX=Math.max(16,w*.05),barW=Math.min(w-32,280),barY=Math.max(36,h-31);
    ctx.fillStyle='rgba(39,61,62,.77)';rr(ctx,barX-6,barY-10,barW+12,22,6);ctx.fill();
    ctx.fillStyle='#bfd0ba';rr(ctx,barX,barY-1,barW,4,2);ctx.fill();
    ctx.fillStyle=C.amber;rr(ctx,barX,barY-1,barW*progressGame(state),4,2);ctx.fill();
    ctx.fillStyle=C.edge;ctx.beginPath();ctx.arc(barX+barW*progressGame(state),barY+1,6,0,Math.PI*2);ctx.fill();
    if(flash>.001){ctx.fillStyle='rgba(255,241,208,'+flash.toFixed(3)+')';ctx.fillRect(0,0,w,h);}
    flash=Math.max(0,flash-.008);
    if(mode==='menu'){ctx.fillStyle='rgba(31,45,45,.14)';ctx.fillRect(0,0,w,h);}
  }
  return {resize,frame,impact};
}
