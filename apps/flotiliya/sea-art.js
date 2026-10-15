// Authored procedural sea and ship illustration for Flotiliya. No external assets.
const TAU=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;
function seeded(n){const v=Math.sin(n*128.73+3.19)*43758.5453;return v-Math.floor(v);}
function polygon(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();}
const isletPoints=(isl,k)=>{
 const out=[],N=24,phase=isl.seed*.9;
 for(let i=0;i<N;i++){let a=i/N*TAU;let ridge=1+.11*Math.sin(a*5+phase)+.09*Math.sin(a*8.3-phase*1.7)+.06*Math.cos(a*13+phase);
 out.push([Math.cos(a)*isl.rx*ridge*k,Math.sin(a)*isl.ry*ridge*k]);}return out;
};
export function renderSea(ctx,now,islands,weather,W,H){
 const t=now*.001, sea=ctx.createLinearGradient(0,0,W,H);
 sea.addColorStop(0,'#21454a');sea.addColorStop(.3,'#28636b');sea.addColorStop(.65,'#1b4e56');sea.addColorStop(1,'#143641');
 ctx.fillStyle=sea;ctx.fillRect(0,0,W,H);
 // Translucent long wave patterns, interrupted by sunlight.
 for(let i=0;i<260;i++){
  let x=seeded(i*17)*W,y=seeded(i*17+200)*H;
  const off=(t*13*(.7+seeded(i+5)*.5))%W;
  x=(x+off)%W;
  ctx.beginPath();ctx.moveTo(x,y);
  ctx.bezierCurveTo(x+6,y-2.5+Math.sin(t+i)*1.3,x+18,y-2,x+34+seeded(i+9)*18,y-1);
  ctx.strokeStyle=i%4?'rgba(166,203,195,.075)':'rgba(228,214,166,.18)';
  ctx.lineWidth=.7+(i%3)*.4;ctx.stroke();
 }
 // Wide refracted undercurrents, sparse enough to keep hull silhouettes clear.
 for(let band=0;band<9;band++){
  const y=90+band*100+Math.sin(t*.3+band)*7;
  ctx.strokeStyle='rgba(9,46,51,.12)';ctx.lineWidth=14;ctx.beginPath();
  ctx.moveTo(-40,y);ctx.bezierCurveTo(W*.25,y+20,W*.65,y-16,W+40,y+17);ctx.stroke();
 }
 for(let i=0;i<56;i++){
  const cx=(seeded(50+i*11)*W+Math.sin(t*.2+i)*3),cy=seeded(i*19+90)*H;
  ctx.beginPath();ctx.ellipse(cx,cy,9+seeded(i)*26,1.3,Math.sin(i)*.1,0,TAU);
  ctx.strokeStyle='rgba(167,218,204,.07)';ctx.lineWidth=1.2;ctx.stroke();
 }
 // Bathymetric edges and warm shallow water around obstacles.
 for(const isl of islands){
  ctx.save();ctx.translate(isl.x,isl.y);ctx.rotate(isl.rotation);
  ctx.fillStyle='rgba(142,187,163,.075)';polygon(ctx,isletPoints(isl,1.55));ctx.fill();
  ctx.fillStyle='rgba(153,205,184,.10)';polygon(ctx,isletPoints(isl,1.28));ctx.fill();
  ctx.strokeStyle='rgba(164,219,199,.24)';ctx.lineWidth=1.5;polygon(ctx,isletPoints(isl,1.23));ctx.stroke();
  // Light surf and jagged stone fringe.
  ctx.fillStyle='#56867f';polygon(ctx,isletPoints(isl,1.12));ctx.fill();
  ctx.fillStyle='#c1baa0';polygon(ctx,isletPoints(isl,1.04));ctx.fill();
  ctx.fillStyle=isl.rock?'#7e8879':'#9ca180';polygon(ctx,isletPoints(isl,.88));ctx.fill();
  if(isl.rock){
   for(let i=0;i<8;i++){const a=seeded(i+isl.seed)*TAU,r=seeded(i+33)*.66;
    const xx=Math.cos(a)*isl.rx*r,yy=Math.sin(a)*isl.ry*r;
    ctx.fillStyle=i%2?'#6d7973':'#b7af92';ctx.beginPath();ctx.moveTo(xx-6,yy+4);ctx.lineTo(xx,yy-8);ctx.lineTo(xx+8,yy+3);ctx.closePath();ctx.fill();
   }
  }else{
   // Tangled Mediterranean shrubs, low pine crowns and sunlit roofs.
   for(let i=0;i<19;i++){
    let a=seeded(i*7+isl.seed)*TAU,r=Math.sqrt(seeded(i*12+isl.seed))* .72;
    let xx=Math.cos(a)*isl.rx*r,yy=Math.sin(a)*isl.ry*r;
    ctx.fillStyle='#435e4b';ctx.beginPath();ctx.ellipse(xx,yy-3,4+seeded(i+isl.seed)*6,3+seeded(i+17)*4,0,0,TAU);ctx.fill();
    ctx.fillStyle='rgba(160,169,110,.45)';ctx.beginPath();ctx.ellipse(xx-1,yy-5,3.5,2,0,0,TAU);ctx.fill();
   }
   if(isl.rx>54){
    ctx.fillStyle='#c3b18c';ctx.fillRect(-8,-9,16,12);
    ctx.fillStyle='#a36e58';ctx.beginPath();ctx.moveTo(-12,-9);ctx.lineTo(0,-19);ctx.lineTo(12,-9);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#75624f';ctx.lineWidth=1.3;ctx.strokeRect(-8,-9,16,12);
   }
  }
  ctx.strokeStyle='rgba(236,229,189,.35)';ctx.lineWidth=1.6;polygon(ctx,isletPoints(isl,1.08));ctx.stroke();
  ctx.restore();
 }
 // The compass is an instrument rather than a thick map grid.
 ctx.save();ctx.translate(W-55,69);ctx.strokeStyle='rgba(231,222,188,.58)';ctx.lineWidth=1;
 ctx.beginPath();ctx.arc(0,0,18,0,TAU);ctx.moveTo(0,-26);ctx.lineTo(0,26);ctx.moveTo(-26,0);ctx.lineTo(26,0);ctx.stroke();
 ctx.beginPath();ctx.moveTo(0,-20);ctx.lineTo(-4,3);ctx.lineTo(0,-3);ctx.closePath();ctx.fillStyle='#e1c997';ctx.fill();
 ctx.fillStyle='#f0deb2';ctx.textAlign='center';ctx.font='13px Georgia';ctx.fillText('N',0,-31);ctx.restore();
 if(weather?.kind==='fog'){
   for(let i=0;i<5;i++){let xx=175+i*155+Math.sin(t*.12+i)*21;
    let fog=ctx.createRadialGradient(xx,220+Math.cos(i)*130,12,xx,220+Math.cos(i)*130,150);
    fog.addColorStop(0,'rgba(204,218,198,.13)');fog.addColorStop(1,'rgba(204,218,198,0)');
    ctx.fillStyle=fog;ctx.fillRect(xx-160,40,320,400);
   }
 }
 if(weather?.kind==='gust'){
  ctx.strokeStyle='rgba(227,238,209,.14)';ctx.lineWidth=1.5;
  for(let j=0;j<8;j++){let y=120+j*48,x=120+Math.sin(j*7+t*.8)*30;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+70,y-14,x+128,y-5);ctx.stroke();}
 }
}
function narrow(ctx,pts){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
export function renderGalley(ctx,s,now,selected=false){
 const len=s.length*(s.type==='heavy'?1.14:1.1),half=s.beam*.7;
 const hp=Math.max(0,s.hp/s.maxHp),side=s.side==='ally';
 const bright=side?'#e8dfc5':'#dac4a9',accent=side?'#658a79':'#a55b4b';
 const wake=2+Math.min(14,Math.abs(s.velocity)*.14);
 ctx.save();ctx.translate(s.x,s.y);
 const animation=now*.001;
 ctx.rotate(s.angle);
 // The ship — not UI labels — is the focal object at phone scale.
 ctx.scale(1.43,1.43);
 // Wake ribbons respond to velocity; no movement = nearly still water.
 ctx.save();ctx.globalAlpha=Math.max(.12,Math.min(.85,Math.abs(s.velocity)/70));
 ctx.strokeStyle='rgba(204,227,211,.4)';ctx.lineWidth=2;
 for(const a of [-1,1]){
  ctx.beginPath();ctx.moveTo(-len*.3,a*half*.7);ctx.bezierCurveTo(-len*.68,a*(half+3),-len*.95-wake,a*(half+10),-len*1.4-wake,a*(half+10+Math.sin(animation*4)*3));ctx.stroke();
  ctx.beginPath();ctx.moveTo(-len*.51,a*(half*.8));ctx.lineTo(-len*.98-wake,a*(half+3));ctx.stroke();
 }ctx.restore();
 ctx.fillStyle='rgba(3,21,25,.45)';ctx.beginPath();ctx.ellipse(-4,5,len*.75,half*1.8,0,0,TAU);ctx.fill();
 // Whitewater lapping against the chine, animated independently of selection.
 const foam=Math.max(.1,Math.min(.74,Math.abs(s.velocity)/45));
 ctx.globalAlpha=foam;
 for(const dir of [-1,1]){
  ctx.strokeStyle='#d3e4d3';ctx.lineWidth=1.1;
  for(let i=0;i<4;i++){
   const xx=-len*.32+i*len*.21,yy=dir*(half+4)+Math.sin(animation*3+i)*1.2;
   ctx.beginPath();ctx.moveTo(xx-5,yy);ctx.quadraticCurveTo(xx,yy+dir*2,xx+8,yy);ctx.stroke();
  }
 }
 ctx.globalAlpha=1;
 // Oars: individually spaced and animated with slight independent offsets.
 for(const d of [-1,1])for(let i=0;i<6;i++){
   const ax=-len*.31+i*len*.105,beat=Math.sin(animation*(2.5+Math.abs(s.velocity)*.025)+i*.4)*2;
   const intact=(s.oars??100)/100,broken=(i*2+(d===1?0:1))/12>intact;
   ctx.lineWidth=2;ctx.strokeStyle=broken?'#644e42':'#94734f';ctx.beginPath();ctx.moveTo(ax,d*half*.65);
   ctx.lineTo(ax-3+beat,d*(half+(broken?5:12)));ctx.stroke();
   if(!broken){ctx.strokeStyle='#d2b58a';ctx.lineWidth=3;ctx.beginPath();
     ctx.moveTo(ax-3+beat,d*(half+12));ctx.lineTo(ax-6+beat,d*(half+17));ctx.stroke();}
 }
 // Distinct hull outline and chine.
 const hull=ctx.createLinearGradient(0,-half,0,half);hull.addColorStop(0,'#4d352b');hull.addColorStop(.28,'#906b4d');hull.addColorStop(.56,'#b08c66');hull.addColorStop(1,'#513c32');
 narrow(ctx,[[len*.68,0],[len*.46,half*.49],[len*.1,half*.88],[-len*.34,half*.8],[-len*.58,half*.47],[-len*.66,0],[-len*.58,-half*.47],[-len*.34,-half*.8],[len*.1,-half*.88],[len*.46,-half*.49]]);
 ctx.fillStyle=hull;ctx.strokeStyle='#382d28';ctx.lineWidth=2.6;ctx.fill();ctx.stroke();
 narrow(ctx,[[len*.48,0],[len*.25,half*.55],[-len*.42,half*.54],[-len*.53,0],[-len*.42,-half*.54],[len*.25,-half*.55]]);
 ctx.fillStyle='#c09b70';ctx.fill();ctx.strokeStyle='#755940';ctx.lineWidth=1;ctx.stroke();
 // Rows of timber planking and ribs.
 ctx.lineWidth=.9;ctx.strokeStyle='rgba(70,45,33,.48)';
 for(let x=-len*.39;x<len*.33;x+=6.8){ctx.beginPath();ctx.moveTo(x,-half*.49);ctx.lineTo(x,half*.49);ctx.stroke();}
 for(const y of [-half*.34,half*.34]){ctx.beginPath();ctx.moveTo(-len*.44,y);ctx.lineTo(len*.3,y);ctx.stroke();}
 // Forecastle, boarding prow, stern platform.
 ctx.fillStyle='#78513d';narrow(ctx,[[len*.35,-half*.4],[len*.61,0],[len*.35,half*.4]]);ctx.fill();
 // Reinforced ram and carved forward deck, readable at 390px wide.
 ctx.strokeStyle='#e1bc86';ctx.lineWidth=1.6;ctx.beginPath();
 ctx.moveTo(len*.36,-half*.34);ctx.lineTo(len*.62,0);ctx.lineTo(len*.36,half*.34);ctx.stroke();
 ctx.fillStyle=accent;ctx.fillRect(len*.19,-half*.23,len*.13,half*.46);
 ctx.strokeStyle='#d2b38c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(len*.58,0);ctx.lineTo(len*.76,0);ctx.stroke();
 ctx.fillStyle='#71513d';ctx.fillRect(-len*.53,-half*.42,len*.17,half*.84);
 ctx.fillStyle='#be9a6e';ctx.fillRect(-len*.49,-half*.34,len*.11,half*.68);
 // A visible piece of equipment depending on the type.
 if(s.type==='bow'){for(let k of [-1,1]){ctx.strokeStyle='#594635';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-3,k*half*.42);ctx.lineTo(8,k*(half*.42+3));ctx.lineTo(13,k*half*.37);ctx.stroke();}}
 if(s.type==='heavy'){ctx.fillStyle='#665343';ctx.fillRect(len*.16,-half*.47,10,half*.94);ctx.strokeStyle='#d7c19d';ctx.strokeRect(len*.16,-half*.47,10,half*.94);}
 // Mast, yard and semi-transparent lateen sail: distinct profile in overhead view.
 ctx.strokeStyle='#554436';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-len*.1,-half*.5);ctx.lineTo(len*.35,half*.35);ctx.stroke();
 const sail=ctx.createLinearGradient(0,-half,0,half);sail.addColorStop(0,side?'#f0e5c5':'#ead0b4');sail.addColorStop(1,side?'#c9cbb5':'#bb947e');
 narrow(ctx,[[len*.33,-half*.30],[len*.08,half*.54],[-len*.34,half*.36],[-len*.21,-half*.41]]);
 ctx.fillStyle=sail;ctx.globalAlpha=.92;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#a18e70';ctx.lineWidth=.8;ctx.stroke();
 ctx.strokeStyle='rgba(104,75,57,.32)';ctx.beginPath();ctx.moveTo(-len*.21,-half*.41);ctx.lineTo(len*.08,half*.54);ctx.stroke();
 // Artillery and rigging distinct for each class.
 if(s.type==='bow'){
  ctx.fillStyle='#594534';ctx.fillRect(len*.13,-half*.4,7,half*.8);
  ctx.strokeStyle='#e0c69b';ctx.lineWidth=1;ctx.beginPath();
  ctx.moveTo(len*.22,-half*.43);ctx.lineTo(len*.36,-half*.33);
  ctx.moveTo(len*.22,half*.43);ctx.lineTo(len*.36,half*.33);ctx.stroke();
 }
 if(s.type==='swift'){
  ctx.strokeStyle='#c9af8c';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-len*.4,-half*.56);ctx.lineTo(len*.48,-half*.52);
  ctx.moveTo(-len*.4,half*.56);ctx.lineTo(len*.48,half*.52);ctx.stroke();
 }
 // A few visible crew; size/ranks vary by vessel.
 for(let k=0;k<(s.type==='heavy'?5:3);k++){
   let x=-len*.30+k*7,y=k%2?-half*.19:half*.2;
   ctx.fillStyle=bright;ctx.beginPath();ctx.arc(x,y,2.1,0,TAU);ctx.fill();
   ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x,y+2,2.4,0,Math.PI);ctx.fill();
 }
 // Stern pennant follows faction and experience.
 ctx.strokeStyle='#372f27';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-len*.48,-2);ctx.lineTo(-len*.48,-half-8);ctx.stroke();
 ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-len*.48,-half-8);ctx.lineTo(-len*.21,-half-6+Math.sin(animation*3)*2);ctx.lineTo(-len*.48,-half+1);ctx.closePath();ctx.fill();
 if(s.level>0){ctx.fillStyle='#e6d6a7';ctx.beginPath();ctx.arc(-len*.43,-half-6,1.4+s.level*.2,0,TAU);ctx.fill();}
 // Physical damage: deck scorch marks and loose planks.
 if(hp<.73){ctx.strokeStyle='rgba(55,38,32,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-len*.10,-half*.32);ctx.lineTo(-len*.02,half*.1);ctx.lineTo(len*.09,half*.24);ctx.stroke();}
 if(hp<.35){ctx.fillStyle='rgba(38,35,33,.6)';ctx.beginPath();ctx.ellipse(-len*.2,half*.2,7,4,-.3,0,TAU);ctx.fill();}
 ctx.restore();
 // Floating readable labels and functional status indicators.
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
 if(selected){ctx.strokeStyle='#f5d69b';ctx.lineWidth=1.7;ctx.setLineDash([5,7]);ctx.beginPath();
 ctx.arc(s.x,s.y,Math.max(48,len*1.04),0,TAU);ctx.stroke();ctx.setLineDash([]);}
 ctx.shadowColor='rgba(3,20,25,.92)';ctx.shadowBlur=7;
 ctx.font='600 14px Georgia, serif';ctx.fillStyle=side?'#f7e9c9':'#f2d7c5';
 if(s.name)ctx.fillText(s.name,s.x,s.y-47);
 ctx.shadowBlur=0;ctx.fillStyle='rgba(12,31,35,.7)';ctx.fillRect(s.x-23,s.y+45,46,4);
 ctx.fillStyle=side?'#82b29a':'#c7836b';ctx.fillRect(s.x-23,s.y+45,46*hp,4);
 ctx.fillStyle='rgba(225,229,210,.55)';ctx.fillRect(s.x-23,s.y+50,46*Math.max(0,s.crew/s.maxCrew),2);
 if(s.grappleId){ctx.font='bold 15px system-ui,sans-serif';ctx.fillStyle='#f2b77b';
   ctx.fillText('⚓',s.x,s.y-63);}
 else if(s.sinkingTimer>0){ctx.font='bold 13px system-ui,sans-serif';ctx.fillStyle='#f1aaa0';
   ctx.fillText('ПРОБОИНА',s.x,s.y-63);}
 else if((s.oars??100)<42){ctx.font='bold 11px system-ui,sans-serif';ctx.fillStyle='#ecb783';
   ctx.fillText('ВЁСЛА',s.x,s.y-62);}

 ctx.restore();
}
