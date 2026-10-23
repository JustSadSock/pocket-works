import { WORLD, LEVEL, ROBOT, progressGame } from './engine.js';
import { COURSE_THEMES,deviceRect } from './course.js';
import { createVisualEffects } from './visual-fx.js';
const C = { sky:'#a5b6ab', haze:'#dce4da', ink:'#334047', wall:'#77817a', dark:'#344247',
  edge:'#f2e6c9', copper:'#d78b49', amber:'#f6ba67', red:'#ce7b65', teal:'#6a9b9e' };
const rr=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
export function createRenderer(canvas) {
  const ctx=canvas.getContext('2d');
  const reducedMotion=typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const effects=createVisualEffects({reducedMotion});
  let w=800,h=460,scale=1,camX=0,shake=0,flash=0,previousLevel=null;
  let prevTime=0,prevBodyX=null,wheelTurn=0,landing=0,rollDust=0,switchGlow=0;
  const resize=()=>{
    const rect=canvas.getBoundingClientRect();
    w=Math.max(1,rect.width);h=Math.max(1,rect.height);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize',resize);resize();
  const impact=(power=1)=>{
    shake=reducedMotion?0:Math.min(7,shake+power*1.65);
    flash=reducedMotion?0:Math.min(.12,flash+power*.023);
  };
  function cue(type,state){
    if(!state||!Number.isFinite(state.x)||!Number.isFinite(state.y))return;
    effects.emit(type,state.x,state.y+(type==='land'?.35:0),state.dir||1);
    if(type==='land'||type==='spring')landing=type==='land'?1.0:.58;
    if(['wall','hazard','respawn','land','finish','spring'].includes(type))
      impact(type==='finish'?1.25:type==='hazard'?1.4:type==='land'?.62:1.05);
    switchGlow=1;
  }
  function reset(){
    effects.clear();previousLevel=null;prevBodyX=null;prevTime=0;
    wheelTurn=0;landing=0;shake=0;flash=0;switchGlow=0;rollDust=0;
  }
  function frame(state,now=0,mode='playing') {
    const level=state.level||LEVEL;
    if(previousLevel!==level){
      camX=0;previousLevel=level;effects.clear();prevBodyX=null;
      wheelTurn=0;landing=0;rollDust=0;
    }
    const dt=prevTime?Math.max(0,Math.min(.06,(now-prevTime)/1000)):0;
    prevTime=now;
    effects.advance(dt);landing=Math.max(0,landing-dt*3.9);
    switchGlow=Math.max(0,switchGlow-dt*2.6);
    if(prevBodyX!==null&&Math.abs(state.x-prevBodyX)<1.2){
      wheelTurn+=(state.x-prevBodyX)/.175;
      if(state.ground && Math.abs(state.vx)>.75 && !reducedMotion){
        rollDust+=dt;
        if(rollDust>.23){rollDust=0;effects.emit('land',state.x-(state.dir||1)*.28,state.y+.33,state.dir||1);}
      }
    }else rollDust=0;
    prevBodyX=state.x;
    const theme=COURSE_THEMES.find(t=>t.id===level.theme)||COURSE_THEMES[0];
    const viewH=7.9, viewW=Math.min(20,Math.max(5.6,viewH*w/h));
    scale=h/viewH;
    const wanted=Math.max(0,Math.min((level.width||WORLD.width)-viewW,state.x-viewW*.38));
    camX+=(wanted-camX)*(reducedMotion?1:.11);
    if(wanted===0 && camX<.015)camX=0;
    const shakeX=shake>0&&!reducedMotion?Math.sin(now*.071)*shake:0;
    shake=Math.max(0,shake-dt*20);
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
    // Ability-specific stage pieces: visual affordances track real interactions.
    for(const device of level.devices||[]){
      const x=sx(device.x),ww=device.w*scale,y=sy(6.5);
      if(x>w+90||x+ww<-90)continue;
      if(device.type==='mag-rail'){
        ctx.save();ctx.strokeStyle='#896f9e';ctx.lineWidth=8;
        ctx.beginPath();ctx.moveTo(x,sy(3.65));ctx.lineTo(x+ww,sy(3.65));ctx.stroke();
        ctx.fillStyle='#bba4d4';ctx.font='bold 22px system-ui';ctx.textAlign='center';
        for(let px=x+20;px<x+ww;px+=38)ctx.fillText('⌄',px,sy(3.65)+30);
        ctx.restore();
      }else if(device.type==='balloon-sign'){
        ctx.save();ctx.globalAlpha=.7;ctx.strokeStyle='#f6e5c4';ctx.lineWidth=3;
        for(let a=0;a<3;a++){
          const xx=x+a*27+12;
          ctx.beginPath();ctx.moveTo(xx,y-60);ctx.quadraticCurveTo(xx+9,y-104,xx,y-139);ctx.stroke();
        }
        ctx.restore();
      }else if(device.type==='cargo-pad'){
        ctx.fillStyle='#a3bd83';ctx.fillRect(x,y-9,ww,8);
        ctx.fillStyle='#263c3d';ctx.fillRect(x+4,y-5,Math.max(0,ww-8),3);
      }else if(device.type==='cargo-gate'){
        const locked=!(state.cargo||[]).some(box=>box.latched&&Math.abs(box.padX-device.x)<1.3);
        ctx.fillStyle=locked?'#c08a72':'#7d9c81';
        ctx.fillRect(x,locked?sy(4.55):sy(2.6),ww,locked?1.95*scale:.6*scale);
        ctx.strokeStyle='#3b5456';ctx.lineWidth=3;ctx.strokeRect(x,locked?sy(4.55):sy(2.6),ww,locked?1.95*scale:.6*scale);
      }
    }
    for(const box of state.cargo||[]){
      const x=sx(box.x),y=sy(box.y);
      ctx.fillStyle=box.latched?'#96b894':'#c9a16e';
      rr(ctx,x-17,y-20,34,34,4);ctx.fill();
      ctx.strokeStyle='#415658';ctx.lineWidth=3;ctx.stroke();
      ctx.strokeRect(x-10,y-13,20,20);
      ctx.fillStyle='#526768';ctx.beginPath();ctx.arc(x,y-3,4.5,0,Math.PI*2);ctx.fill();
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
    effects.draw(ctx,sx,sy,scale,w);
    const px=sx(state.x),py=sy(state.y);
    const airborne=!state.ground;
    const breathing=(!reducedMotion && !airborne)?Math.sin(now*.0033)*.75:0;
    const compression=landing*.15;
    const stretch=airborne?Math.min(.075,Math.abs(state.vy)*.009):0;
    const bodyTilt=reducedMotion?0:Math.max(-.23,Math.min(.23,state.rotation+state.vx*.012));
    ctx.save();ctx.translate(px,py+breathing);
    ctx.rotate(bodyTilt);
    ctx.scale(1+compression*.6-stretch*.45,1-compression+stretch);
    const u=scale;
    const bw=ROBOT.halfWidth*u*2,bh=ROBOT.halfHeight*u*2;
    const drop=state.ground?0:2.6;
    // Shadow stays on the next piece of real ground; it never floats with the robot.
    const shadowPlatform=level.platforms
      .filter(p=>state.x>=p.x-.1&&state.x<=p.x+p.w+.1&&p.y>=state.y+ROBOT.halfHeight-.05)
      .sort((a,b)=>a.y-b.y)[0];
    if(shadowPlatform){
      const yy=(shadowPlatform.y-state.y)*u;
      const height=Math.max(0,shadowPlatform.y-state.y-ROBOT.halfHeight);
      ctx.fillStyle='rgba(30,52,50,'+(.27/(1+height*.85)).toFixed(3)+')';
      ctx.beginPath();ctx.ellipse(1,yy+3,Math.max(8,24-height*2.3),Math.max(2,5-height*.25),0,0,Math.PI*2);ctx.fill();
    }
    const flex=(!reducedMotion?Math.sin(now*.017+state.vx)*.12:0)+state.vx*.012;
    ctx.strokeStyle='#5d6261';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-bh*.39);ctx.lineTo(flex*bw,-bh*.60);ctx.stroke();
    ctx.fillStyle=C.copper;ctx.beginPath();ctx.arc(flex*bw,-bh*.61,4.4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#3d4d4f';rr(ctx,-bw*.54,-bh*.27,bw*1.08,bh*.62,8);ctx.fill();
    ctx.fillStyle='#e8dfc8';rr(ctx,-bw*.49,-bh*.46,bw*.98,bh*.73,8);ctx.fill();
    ctx.strokeStyle='#82918a';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#f0ae62';rr(ctx,-bw*.33,-bh*.26,bw*.66,bh*.25,4);ctx.fill();
    const eyeY=-bh*.15;
    const blink=(!reducedMotion && (now%4050)<96)?Math.max(.14,(now%4050)/120):1;
    const worried=airborne&&state.vy>1.6;
    for(let v of [-1,1]){
      ctx.fillStyle='#33454a';
      rr(ctx,v*bw*.135-bw*.07,eyeY,bw*.14,bh*.12*blink,2);ctx.fill();
      if(blink>.65){
        ctx.fillStyle='#f6e5cf';
        const glance=(state.dir||1)*Math.min(2,Math.abs(state.vx)*.4);
        ctx.fillRect(v*bw*.135+glance,eyeY+2,2,2);
      }
      if(worried){
        ctx.strokeStyle='#7d6761';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(v*bw*.14-3,eyeY-6);ctx.lineTo(v*bw*.14+4,eyeY-8+(v===1?2:-2));ctx.stroke();
      }
    }
    ctx.strokeStyle='#b27b69';ctx.lineWidth=2;
    if(worried){ctx.beginPath();ctx.arc(0,bh*.11,2,0,Math.PI*2);ctx.stroke();}
    else{ctx.beginPath();ctx.moveTo(-bw*.09,bh*.1);ctx.quadraticCurveTo(0,bh*.14,bw*.09,bh*.1);ctx.stroke();}
    for(const side of [-1,1]) {
      ctx.strokeStyle='#667273';ctx.lineWidth=3.5;
      const armSwing=reducedMotion?0:Math.sin(wheelTurn*.65+side)*Math.min(5,Math.abs(state.vx)*1.3);
      ctx.beginPath();ctx.moveTo(side*bw*.4,0);ctx.lineTo(side*bw*.59,drop+bh*.08+armSwing);ctx.stroke();
      const wheelX=side*bw*.4, wheelY=bh*.3+drop;
      ctx.fillStyle='#344347';ctx.beginPath();ctx.arc(wheelX,wheelY,u*.175,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#a5b6ad';ctx.beginPath();ctx.arc(wheelX,wheelY,u*.095,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#e4dbbe';ctx.lineWidth=2;ctx.beginPath();
      ctx.moveTo(wheelX+Math.cos(wheelTurn)*u*.085,wheelY+Math.sin(wheelTurn)*u*.085);
      ctx.lineTo(wheelX-Math.cos(wheelTurn)*u*.085,wheelY-Math.sin(wheelTurn)*u*.085);ctx.stroke();
    }
    ctx.fillStyle='#737e74';ctx.beginPath();ctx.arc(-bw*.37,-bh*.37,2.3,0,7);ctx.arc(bw*.37,-bh*.37,2.3,0,7);ctx.fill();
    ctx.restore();
    if(state.held?.float && state.energy?.float>.005){
      // Inflatable stabilizer connected to Boltik with a visible cable.
      const yy=py-scale*.95;
      ctx.strokeStyle='#e5e4d4';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(px,py-26);ctx.lineTo(px,yy+20);ctx.stroke();
      ctx.fillStyle='#efce82';ctx.beginPath();ctx.ellipse(px,yy,22,27,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#b18c58';ctx.lineWidth=2;ctx.stroke();
      ctx.fillStyle='#f8ecd3';ctx.beginPath();ctx.ellipse(px-7,yy-8,5,10,-.35,0,Math.PI*2);ctx.fill();
    }
    if(state.held?.magnet && state.energy?.magnet>.005){
      ctx.save();ctx.globalAlpha=.32;ctx.strokeStyle='#ab91d0';ctx.lineWidth=2;
      for(let i=0;i<3;i++){
        ctx.beginPath();ctx.ellipse(px,py,39+i*23,31+i*16,0,0,Math.PI*2);ctx.stroke();
      }
      ctx.restore();
    }
    if(state.held?.brake && state.energy?.brake>.005){
      ctx.fillStyle='#c98066';ctx.fillRect(px-scale*.35,py+scale*.33,scale*.7,4);
      ctx.fillStyle='#fff0cd';for(let i=0;i<3;i++)ctx.fillRect(px+(i-1)*13,py+scale*.43,4,8);
    }
    if(state.pushCooldown>.77){
      ctx.save();ctx.globalAlpha=Math.min(1,(state.pushCooldown-.77)*2.6);ctx.strokeStyle='#f5dca6';ctx.lineWidth=4;
      ctx.beginPath();ctx.arc(px,py,scale*(1.5-state.pushCooldown),0,Math.PI*2);ctx.stroke();ctx.restore();
    }
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
  return {resize,frame,impact,cue,reset,getEffects:()=>effects.stats()};
}
