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
  function background(t){
    ctx.fillStyle='#101936';ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=.36;
    for(let i=0;i<6;i++){
      const base=(i+.5)*(W/6),amp=20+hash(i+5)*40,bw=38+hash(i+19)*62,spd=.45+hash(i+31)*.55;
      ctx.beginPath();
      for(let y=-60;y<=H+60;y+=34){
        const ph=y*.009+t*.0015*spd+state.depth*.0015+i*1.7;
        const x=base+Math.sin(ph)*amp+Math.sin(ph*.43+i)*14;
        y===-60?ctx.moveTo(x-bw,y):ctx.lineTo(x-bw,y);
      }
      for(let y=H+60;y>=-60;y-=34){
        const ph=y*.009+t*.0015*spd+state.depth*.0015+i*1.7;
        const x=base+Math.sin(ph)*amp+Math.sin(ph*.43+i)*14;
        ctx.lineTo(x+bw,y);
      }
      ctx.closePath();ctx.fillStyle=i%2?'#17244a':'#20305a';ctx.fill();
    }
    ctx.restore();
    for(let i=0;i<11;i++){
      const ox=hash(i+200)*W,amp=9+hash(i+240)*26;
      ctx.beginPath();
      for(let y=-20;y<H+40;y+=18){
        const x=ox+Math.sin(y*.017+t*.00035+i)*amp;
        y<0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.strokeStyle=i%3===0?'rgba(130,170,167,.18)':'rgba(242,236,223,.08)';
      ctx.lineWidth=1;ctx.stroke();
    }
    ctx.globalAlpha=.28;
    for(let i=0;i<64;i++){
      const x=hash(i+700)*W;
      const y=((hash(i+900)*H+state.depth*(4+hash(i)*5))%(H+30))-15;
      ctx.fillStyle=i%7===0?'#82aaa7':'#f2ecdf';
      ctx.fillRect(x,y,1+hash(i+1100)*1.6,2+hash(i+1200)*2.4);
    }
    ctx.globalAlpha=1;
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'rgba(5,10,30,.28)');g.addColorStop(.55,'rgba(5,10,30,0)');g.addColorStop(1,'rgba(5,10,30,.44)');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }
  function tear(o){
    ctx.save();ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.rotate(o.lean);
    const w=o.w,h=o.h;
    ctx.beginPath();ctx.moveTo(-w/2,-h*.18);ctx.lineTo(-w*.2,-h/2);ctx.lineTo(w*.1,-h*.25);ctx.lineTo(w/2,-h*.42);
    ctx.lineTo(w*.3,h*.12);ctx.lineTo(w*.06,h/2);ctx.lineTo(-w*.18,h*.16);ctx.lineTo(-w/2,h*.34);ctx.closePath();
    ctx.fillStyle='#070c1f';ctx.fill();ctx.strokeStyle='rgba(242,236,223,.42)';ctx.lineWidth=1.1;ctx.stroke();
    ctx.beginPath();ctx.moveTo(-w*.31,-h*.05);ctx.lineTo(w*.29,h*.02);ctx.strokeStyle='rgba(223,124,85,.44)';ctx.lineWidth=1.6;ctx.stroke();ctx.restore();
  }
  function spark(o,t){
    const p=1+Math.sin(t*.006+o.phase)*.15;
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(t*.001+o.phase);ctx.scale(p,p);
    ctx.beginPath();ctx.moveTo(0,-o.r*1.8);ctx.lineTo(o.r*.75,-o.r*.2);ctx.lineTo(o.r*.3,o.r*1.45);ctx.lineTo(-o.r*.75,o.r*.35);ctx.closePath();
    ctx.fillStyle='#df7c55';ctx.fill();ctx.beginPath();ctx.arc(0,0,o.r*2.4,0,TAU);ctx.strokeStyle='rgba(223,124,85,.25)';ctx.stroke();ctx.restore();
  }
  function player(t){
    const p=state.player,tilt=clamp(p.vx*.0023,-.38,.38);
    if(p.invuln>0&&p.burst<=0&&Math.floor(p.invuln*18)%2===0)return;
    for(const q of state.trails){
      const a=clamp(q.life/.42,0,1);
      ctx.fillStyle=p.burst>0?'rgba(223,124,85,'+(a*.6)+')':'rgba(130,170,167,'+(a*.34)+')';
      ctx.beginPath();ctx.ellipse(q.x,q.y,3+a*5,10+a*18,0,0,TAU);ctx.fill();
    }
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(tilt);ctx.scale(1,p.burst>0?1.38:1);
    ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(16,-4);ctx.lineTo(11,17);ctx.lineTo(0,10);ctx.lineTo(-11,17);ctx.lineTo(-16,-4);ctx.closePath();
    ctx.fillStyle='#f2ecdf';ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-16);ctx.lineTo(7,-2);ctx.lineTo(0,7);ctx.lineTo(-7,-2);ctx.closePath();
    ctx.fillStyle=p.burst>0?'#df7c55':'#101936';ctx.fill();
    ctx.beginPath();ctx.moveTo(-8,14);ctx.quadraticCurveTo(-4,30+Math.sin(t*.01)*4,0,38);ctx.quadraticCurveTo(5,28,8,14);
    ctx.strokeStyle=p.burst>0?'#df7c55':'#82aaa7';ctx.lineWidth=3;ctx.stroke();ctx.restore();
    if(p.burst>0){ctx.beginPath();ctx.arc(p.x,p.y,30+Math.sin(t*.02)*3,0,TAU);ctx.strokeStyle='rgba(223,124,85,.62)';ctx.lineWidth=2;ctx.stroke()}
  }
  function render(t){
    background(t);
    for(const o of state.sparks)spark(o,t);
    for(const o of state.tears)tear(o);
    for(const p of state.particles){
      ctx.globalAlpha=clamp(p.life/.8,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,TAU);ctx.fill();
    }
    ctx.globalAlpha=1;
    if(state.screen!=='menu')player(t);
    if(state.screen==='playing'){
      for(let i=0;i<3;i++){
        ctx.globalAlpha=i<state.lives?.92:.18;ctx.fillStyle='#f2ecdf';ctx.beginPath();ctx.moveTo(18+i*15,H-29);ctx.lineTo(25+i*15,H-24);ctx.lineTo(18+i*15,H-19);ctx.closePath();ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    if(state.flash>0){ctx.fillStyle='rgba(242,236,223,'+(state.flash*.55)+')';ctx.fillRect(0,0,W,H)}
  }
  return {resize,render,size:()=>({W,H})};
}
