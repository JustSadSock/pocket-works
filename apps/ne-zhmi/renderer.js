import { WORLD, LEVEL, ROBOT, progressGame } from './engine.js';
const C = { sky:'#a5b6ab', haze:'#dce4da', ink:'#334047', wall:'#77817a', dark:'#344247',
  edge:'#f2e6c9', copper:'#d78b49', amber:'#f6ba67', red:'#ce7b65', teal:'#6a9b9e' };
const rr=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
export function createRenderer(canvas) {
  const ctx=canvas.getContext('2d');
  let w=800,h=460,scale=1,camX=0,shake=0,flash=0;
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
    const viewH=7.9, viewW=Math.min(20,Math.max(5.6,viewH*w/h));
    scale=h/viewH;
    const wanted=Math.max(0,Math.min(WORLD.width-viewW,state.x-viewW*.38));
    camX+=(wanted-camX)*.11;
    if(wanted===0 && camX<.015)camX=0;
    const shakeX=shake>0?Math.sin(now*.071)*shake:0;
    shake=Math.max(0,shake-.35);
    const sx=x=>(x-camX)*scale+shakeX;
    const sy=y=>y*scale;
    // Background: industrial painted panels, grounded by geometry rather than global noise.
    const sky=ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,'#c9d6c8');sky.addColorStop(.62,C.sky);sky.addColorStop(1,'#80968e');
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
    ctx.fillStyle='#667b73';ctx.fillRect(0,sy(7.6),w,Math.max(0,h-sy(7.6)));
    // Gap shadow / guard channel behind platforms
    ctx.fillStyle='#394e50';ctx.fillRect(0,sy(6.45),w,h-sy(6.45));
    ctx.strokeStyle='rgba(233,221,194,.16)';ctx.lineWidth=1;
    for(let x=-10;x<30;x+=.48){const px=sx(x);ctx.beginPath();ctx.moveTo(px,sy(7.4));ctx.lineTo(px+scale*.2,sy(7.56));ctx.stroke();}
    // Finish apparatus
    const goalX=sx(LEVEL.goal);
    ctx.fillStyle='#526e66';ctx.fillRect(goalX-14,sy(4.75),28,sy(6.5)-sy(4.75));
    ctx.fillStyle=C.amber;rr(ctx,goalX-32,sy(4.5),64,26,5);ctx.fill();
    ctx.fillStyle=C.ink;ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.fillText('ФИНИШ',goalX,sy(4.5)+17);
    ctx.strokeStyle='#d6e8d5';ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(goalX,sy(4.9));ctx.lineTo(goalX,sy(6.4));ctx.stroke();ctx.setLineDash([]);
    for(const p of LEVEL.platforms) {
      const x=sx(p.x),y=sy(p.y),ww=p.w*scale,hh=p.h*scale;
      ctx.fillStyle='#455658';ctx.fillRect(x+4,y+8,ww,hh);
      ctx.fillStyle=C.wall;ctx.fillRect(x,y,ww,hh);
      ctx.fillStyle='#f2e7cc';ctx.fillRect(x,y,ww,8);
      ctx.fillStyle='#acb5a0';ctx.fillRect(x,y+8,ww,10);
      ctx.fillStyle='rgba(40,53,56,.16)';
      for(let k=10;k<ww;k+=38){ctx.fillRect(x+k,y+23,3,Math.min(46,hh-24));}
      for(let k=30;k<ww;k+=78){
        ctx.fillStyle='#435054';ctx.beginPath();ctx.arc(x+k,y+5,2.4,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle='#d79e62';
      for(let k=13;k<ww-15;k+=55)ctx.fillRect(x+k,y+13,23,3);
    }
    // Physical checkpoint, not an invisible collision trigger.
    const markerX=sx(LEVEL.checkpoint);
    ctx.fillStyle='#3d6260';ctx.fillRect(markerX-3,sy(5.55),6,sy(6.25)-sy(5.55));
    ctx.fillStyle=state.checkpoint>9?'#f6c57c':'#d5d2ad';
    ctx.beginPath();ctx.moveTo(markerX+4,sy(5.53));ctx.lineTo(markerX+37,sy(5.63));ctx.lineTo(markerX+4,sy(5.81));ctx.closePath();ctx.fill();
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
