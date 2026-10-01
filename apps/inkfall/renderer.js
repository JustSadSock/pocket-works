const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};

export function createRenderer(canvas,state){
  const ctx=canvas.getContext('2d',{alpha:false});
  let W=390,H=844,dpr=1;

  function resize(){
    const r=canvas.getBoundingClientRect();
    W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    state.player.y=H*.74;
    state.player.x=clamp(state.player.x||W*.5,28,W-28);
    state.player.targetX=clamp(state.player.targetX||W*.5,28,W-28);
    return {W,H};
  }

  function palette(){
    const z=Math.floor(state.depth/320)%3;
    if(z===1)return {bg:'#161128',deep:'#241737',mid:'#4a2340',cool:'#7ea7a1',hot:'#f08b63',bone:'#f5efdf'};
    if(z===2)return {bg:'#0e1721',deep:'#142b32',mid:'#244e55',cool:'#9cc9b9',hot:'#e3a35f',bone:'#f1eddb'};
    return {bg:'#0c1430',deep:'#14234a',mid:'#243b69',cool:'#82aaa7',hot:'#df7c55',bone:'#f2ecdf'};
  }

  function wash(t,p){
    ctx.fillStyle=p.bg;ctx.fillRect(0,0,W,H);
    const cx=W*.5+(state.player.x-W*.5)*.16;
    const radial=ctx.createRadialGradient(cx,H*.2,10,cx,H*.35,Math.max(W,H)*.8);
    radial.addColorStop(0,p.mid);radial.addColorStop(.34,p.deep);radial.addColorStop(1,p.bg);
    ctx.fillStyle=radial;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(let i=0;i<5;i++){
      const x=W*(.05+hash(i+20)*.9),y=((hash(i+40)*H+state.depth*(2.2+i*.5))%(H+220))-110,rr=70+hash(i+60)*130;
      const g=ctx.createRadialGradient(x,y,0,x,y,rr);
      g.addColorStop(0,i%2?'rgba(126,167,161,.10)':'rgba(223,124,85,.08)');g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.fillRect(x-rr,y-rr,rr*2,rr*2);
    }
    ctx.restore();
  }

  function tunnel(t,p){
    const scroll=(state.depth*.0065+t*.000055)%1,cx=W*.5+(state.player.x-W*.5)*.22;
    for(let i=0;i<18;i++){
      let z=(i/18+scroll)%1;z=z*z;
      const y=H*(.04+z*1.03),rx=W*(.08+z*.68),ry=10+z*78,wob=Math.sin(t*.0012+i*1.37+state.depth*.01)*(6+z*24),a=.08+z*.34;
      ctx.save();ctx.translate(cx+wob,y);ctx.rotate(Math.sin(i*1.13+t*.0005)*.06);ctx.lineWidth=.55+z*2.2;
      for(let k=0;k<4;k++){
        const s=k*TAU/4+.12*Math.sin(i+k+t*.001);
        ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,s,s+TAU*.19);
        ctx.strokeStyle=k===1||k===3?'rgba(130,170,167,'+(a*.8)+')':'rgba(242,236,223,'+a+')';ctx.stroke();
      }
      if(i%2===0){
        ctx.lineWidth=.5+z;
        for(let k=0;k<8;k++){
          const ang=k*TAU/8+i*.09,x1=Math.cos(ang)*rx*.86,y1=Math.sin(ang)*ry*.86,x2=Math.cos(ang)*rx,y2=Math.sin(ang)*ry;
          ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle='rgba(223,124,85,'+(a*.45)+')';ctx.stroke();
        }
      }
      ctx.restore();
    }
    if(state.player.burst>0||state.speed>430){
      const power=state.player.burst>0?1:clamp((state.speed-430)/90,0,1);
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let i=0;i<34;i++){
        const x=hash(i+700)*W,len=30+hash(i+900)*H*.2,y=(hash(i+1200)*H+t*(.16+hash(i)*.11))%(H+len)-len;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(hash(i+40)-.5)*8,y+len);
        ctx.strokeStyle=i%7===0?'rgba(223,124,85,'+(.15+.35*power)+')':'rgba(242,236,223,'+(.06+.16*power)+')';
        ctx.lineWidth=.5+hash(i+80)*1.8;ctx.stroke();
      }
      ctx.restore();
    }
  }

  function grain(){
    ctx.save();ctx.globalAlpha=.18;const shift=Math.floor(state.depth*.6);
    for(let i=0;i<86;i++){
      const x=hash(i+shift)*W,y=hash(i*7+shift+200)*H,s=.4+hash(i+510)*1.6;
      ctx.fillStyle=i%11===0?'#df7c55':'#f2ecdf';ctx.fillRect(x,y,s,s*(1+hash(i+90)*2.5));
    }
    ctx.restore();
  }

  function tear(o,p){
    ctx.save();ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.rotate(o.lean);
    const w=o.w,h=o.h;
    function draw(dx,dy,stroke,alpha){
      ctx.save();ctx.translate(dx,dy);ctx.globalAlpha=alpha;
      ctx.beginPath();ctx.moveTo(-w/2,-h*.12);ctx.lineTo(-w*.28,-h/2);ctx.lineTo(w*.08,-h*.24);ctx.lineTo(w/2,-h*.44);
      ctx.lineTo(w*.31,h*.08);ctx.lineTo(w*.08,h/2);ctx.lineTo(-w*.17,h*.2);ctx.lineTo(-w/2,h*.34);ctx.closePath();
      ctx.fillStyle='#02040d';ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.25;ctx.stroke();ctx.restore();
    }
    draw(-3,1,p.cool,.34);draw(3,-1,p.hot,.42);draw(0,0,p.bone,.72);
    ctx.beginPath();ctx.moveTo(-w*.33,-h*.03);ctx.lineTo(w*.32,h*.05);ctx.strokeStyle=p.hot;ctx.globalAlpha=.65;ctx.lineWidth=1.8;ctx.stroke();ctx.restore();
  }

  function spark(o,t,p){
    const pulse=1+Math.sin(t*.009+o.phase)*.18;
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(t*.0016+o.phase);ctx.scale(pulse,pulse);ctx.globalCompositeOperation='screen';
    ctx.beginPath();ctx.arc(0,0,o.r*2.7,0,TAU);ctx.strokeStyle='rgba(223,124,85,.22)';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-o.r*1.9);ctx.lineTo(o.r*.85,0);ctx.lineTo(0,o.r*1.9);ctx.lineTo(-o.r*.85,0);ctx.closePath();ctx.fillStyle=p.hot;ctx.fill();
    ctx.beginPath();ctx.moveTo(-o.r*1.8,0);ctx.lineTo(o.r*1.8,0);ctx.moveTo(0,-o.r*1.8);ctx.lineTo(0,o.r*1.8);ctx.strokeStyle=p.bone;ctx.globalAlpha=.55;ctx.stroke();ctx.restore();
  }

  function ribbon(p,t){
    if(state.trails.length<2)return;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(let layer=0;layer<3;layer++){
      ctx.beginPath();
      state.trails.forEach((q,i)=>{const x=q.x+(layer-1)*4*Math.sin(i*.5+t*.004),y=q.y+i*.8;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});
      ctx.strokeStyle=layer===1?'rgba(242,236,223,'+(p.burst>0?.36:.17)+')':'rgba(130,170,167,'+(p.burst>0?.28:.11)+')';
      ctx.lineWidth=layer===1?(p.burst>0?6:2.2):1.1;ctx.stroke();
    }
    ctx.restore();
  }

  function player(t,pal){
    const p=state.player,tilt=clamp(p.vx*.0024,-.42,.42);
    if(p.invuln>0&&p.burst<=0&&Math.floor(p.invuln*18)%2===0)return;
    ribbon(p,t);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(tilt);
    if(p.burst>0){ctx.shadowColor=pal.hot;ctx.shadowBlur=24}
    for(const side of [-1,1]){
      ctx.beginPath();ctx.moveTo(side*6,-6);ctx.quadraticCurveTo(side*30,-16,side*22,-40);ctx.quadraticCurveTo(side*8,-20,0,-12);
      ctx.strokeStyle=side<0?pal.cool:pal.hot;ctx.globalAlpha=.72;ctx.lineWidth=2.4;ctx.stroke();
      ctx.beginPath();ctx.moveTo(side*8,7);ctx.quadraticCurveTo(side*32,12,side*26,34);ctx.strokeStyle=pal.bone;ctx.globalAlpha=.28;ctx.lineWidth=1.2;ctx.stroke();
    }
    ctx.globalAlpha=1;
    ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(14,-10);ctx.lineTo(9,12);ctx.lineTo(0,22);ctx.lineTo(-9,12);ctx.lineTo(-14,-10);ctx.closePath();ctx.fillStyle=pal.bone;ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(6,-4);ctx.lineTo(0,8);ctx.lineTo(-6,-4);ctx.closePath();ctx.fillStyle=p.burst>0?pal.hot:pal.bg;ctx.fill();
    ctx.beginPath();ctx.moveTo(-7,14);ctx.quadraticCurveTo(-3,30+Math.sin(t*.012)*6,0,44);ctx.quadraticCurveTo(5,29,7,14);
    ctx.strokeStyle=p.burst>0?pal.hot:pal.cool;ctx.lineWidth=3.4;ctx.stroke();ctx.restore();
    if(p.burst>0||state.burstFx>0){
      const f=Math.max(p.burst,state.burstFx||0);
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.25+.45*f;
      ctx.beginPath();ctx.arc(p.x,p.y,34+(1-f)*150,0,TAU);ctx.strokeStyle=pal.hot;ctx.lineWidth=2+f*5;ctx.stroke();
      ctx.beginPath();ctx.arc(p.x,p.y,18+(1-f)*220,0,TAU);ctx.strokeStyle=pal.bone;ctx.lineWidth=1;ctx.stroke();ctx.restore();
    }
  }

  function render(t){
    const pal=palette();wash(t,pal);tunnel(t,pal);grain();
    for(const o of state.sparks)spark(o,t,pal);
    for(const o of state.tears)tear(o,pal);
    for(const q of state.particles){ctx.globalAlpha=clamp(q.life/.8,0,1);ctx.fillStyle=q.color;ctx.beginPath();ctx.arc(q.x,q.y,q.size,0,TAU);ctx.fill()}
    ctx.globalAlpha=1;if(state.screen!=='menu')player(t,pal);
    if((state.nearMiss||0)>0){
      const a=clamp(state.nearMiss,0,1),g=ctx.createLinearGradient(0,0,W,0);
      g.addColorStop(0,'rgba(223,124,85,'+(a*.32)+')');g.addColorStop(.18,'rgba(0,0,0,0)');g.addColorStop(.82,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(130,170,167,'+(a*.32)+')');
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }
    if(state.screen==='playing'){
      for(let i=0;i<3;i++){ctx.globalAlpha=i<state.lives?.95:.15;ctx.fillStyle=pal.bone;ctx.beginPath();ctx.moveTo(18+i*15,H-29);ctx.lineTo(25+i*15,H-24);ctx.lineTo(18+i*15,H-19);ctx.closePath();ctx.fill()}
      ctx.globalAlpha=1;
    }
    if(state.flash>0){ctx.fillStyle='rgba(242,236,223,'+(state.flash*.62)+')';ctx.fillRect(0,0,W,H)}
    if(state.burstFx>0){ctx.save();ctx.globalCompositeOperation='difference';ctx.globalAlpha=state.burstFx*.12;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.restore()}
  }

  return {resize,render,size:()=>({W,H})};
}
