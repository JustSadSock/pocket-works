// Miniature hand-painted tabletop city. No external assets or network fetches.
const TAU=Math.PI*2;
const rgba=(hex,a)=>{const v=hex.replace('#','');return 'rgba('+parseInt(v.slice(0,2),16)+','+parseInt(v.slice(2,4),16)+','+parseInt(v.slice(4,6),16)+','+a+')';};
function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function line(ctx,a,b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
const palette=['#b96d51','#c58d58','#8c9d8f','#b6a58b','#d6b774','#8f8576','#c0958c','#9bafa5'];
const ink='#30403b';
function building(ctx,x,y,w,h,n){
 const height=7+n%5*3;
 ctx.fillStyle='rgba(52,60,47,.20)';
 ctx.fillRect(x+height,y+height,w+3,h+2);
 ctx.fillStyle='#927f67';ctx.fillRect(x+height*.5,y+3,w,h);
 ctx.fillStyle='#655d52';ctx.beginPath();ctx.moveTo(x+w,y);ctx.lineTo(x+w+height,y-height);ctx.lineTo(x+w+height,y+h-height);ctx.lineTo(x+w,y+h);ctx.fill();
 const base=palette[n%palette.length];
 ctx.fillStyle=base;ctx.fillRect(x,y-height,w,h);
 ctx.fillStyle=rgba('#ffffff',.13);ctx.fillRect(x+3,y-height+3,w-6,Math.max(2,h*.22));
 ctx.strokeStyle=rgba('#563f37',.27);ctx.lineWidth=1.8;ctx.strokeRect(x,y-height,w,h);
 ctx.strokeStyle=rgba('#503e33',.20);ctx.lineWidth=2;
 if(n%3===0){ctx.beginPath();ctx.moveTo(x+w/2,y-height+2);ctx.lineTo(x+w/2,y+h-height-2);ctx.stroke();}
 if(n%4===0){ctx.fillStyle=rgba('#fff4cf',.65);ctx.fillRect(x+7,y-height+7,Math.min(w-14,9),4);}
 const windows=Math.max(1,Math.floor(w/27));ctx.fillStyle='#52615c';
 for(let k=0;k<windows;k++)ctx.fillRect(x+8+k*(w-10)/windows,y+h+2,5,4);
}
function tree(ctx,x,y,r){
 ctx.fillStyle='rgba(36,60,39,.19)';ctx.beginPath();ctx.ellipse(x+6,y+7,r*.98,r*.7,-.5,0,TAU);ctx.fill();
 ctx.fillStyle='#516e56';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
 ctx.fillStyle='#799574';ctx.beginPath();ctx.arc(x-r*.24,y-r*.23,r*.6,0,TAU);ctx.fill();
 ctx.fillStyle='#9da58a';ctx.beginPath();ctx.arc(x+r*.22,y-r*.38,r*.31,0,TAU);ctx.fill();
}
function lot(ctx,map,row,col){
 const a=map.nodes[row*5+col],b=map.nodes[row*5+col+1],c=map.nodes[(row+1)*5+col];
 const x=a.x+36,y=a.y+39,w=Math.max(56,b.x-a.x-70),h=Math.max(58,c.y-a.y-76);
 const id=row*4+col,park=(id+map.seed%11)%9===0;
 ctx.fillStyle=park?'#a3af83':'#d6c8aa';rounded(ctx,x-11,y-12,w+22,h+24,12);ctx.fill();
 ctx.strokeStyle=rgba('#726a53',.18);ctx.lineWidth=2;ctx.stroke();
 if(park){
  ctx.fillStyle='#b8c298';rounded(ctx,x,y,w,h,8);ctx.fill();
  ctx.strokeStyle='#d7cfaa';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x+5,y+h*.85);ctx.lineTo(x+w*.7,y+h*.2);ctx.stroke();
  tree(ctx,x+w*.22,y+h*.28,14);tree(ctx,x+w*.77,y+h*.72,16);tree(ctx,x+w*.63,y+h*.36,9);
  return;
 }
 const gap=10,iw=(w-gap*3)/2,ih=(h-gap*3)/2;
 let i=0;
 for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
  const bx=x+gap+(iw+gap)*xx,by=y+gap+(ih+gap)*yy;
  if((id+xx*2+yy)%7===0){tree(ctx,bx+iw/2,by+ih/2,Math.min(12,iw*.24));continue;}
  building(ctx,bx,by,iw,ih,(id*7+xx*11+yy*13+map.seed%13)|0);i++;
 }
}
function road(ctx,map){
 ctx.lineCap='round';ctx.lineJoin='round';
 const batch=(width,color,dash)=>{
  ctx.lineWidth=width;ctx.strokeStyle=color;ctx.setLineDash(dash||[]);ctx.beginPath();
  for(const [ia,ib] of map.edges)line(ctx,map.nodes[ia],map.nodes[ib]);
  ctx.stroke();
 };
 batch(55,'#b0a287');batch(48,'#ece0c7');batch(43,'#58645f');
 batch(38,'#68716a');batch(2.3,'rgba(244,221,174,.53)',[8,16]);
 ctx.setLineDash([]);
 for(const n of map.nodes){
  ctx.fillStyle='#657069';ctx.beginPath();ctx.arc(n.x,n.y,22,0,TAU);ctx.fill();
  ctx.fillStyle='#d1c0a0';ctx.beginPath();ctx.arc(n.x,n.y,3,0,TAU);ctx.fill();
 }
}
function route(ctx,map,from,steps,color,width,dash){
 if(!steps?.length)return;
 const arr=[from,...steps];
 ctx.beginPath();ctx.moveTo(map.nodes[arr[0]].x,map.nodes[arr[0]].y);
 for(const id of arr.slice(1))ctx.lineTo(map.nodes[id].x,map.nodes[id].y);
 ctx.lineCap='round';ctx.lineJoin='round';
 ctx.setLineDash([]);ctx.strokeStyle='rgba(20,35,29,.57)';ctx.lineWidth=width+4;ctx.stroke();
 ctx.setLineDash(dash||[]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([]);
 for(let k=1;k<arr.length;k++){
  const p=map.nodes[arr[k-1]],n=map.nodes[arr[k]];
  const dx=n.x-p.x,dy=n.y-p.y,angle=Math.atan2(dy,dx);
  ctx.save();ctx.translate(p.x+dx*.60,p.y+dy*.60);ctx.rotate(angle);
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-5,-5);ctx.lineTo(-3,0);ctx.lineTo(-5,5);ctx.fill();ctx.restore();
 }
}
function pin(ctx,x,y,color,label,subtle=false){
 ctx.save();ctx.translate(x,y-27);
 ctx.fillStyle='rgba(32,35,28,.22)';ctx.beginPath();ctx.ellipse(0,26,20,7,0,0,TAU);ctx.fill();
 ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(-14,2);ctx.arc(0,-4,18,Math.PI*.82,Math.PI*2.18);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#f7ebd4';ctx.lineWidth=3;ctx.stroke();
 ctx.fillStyle='#fff8e9';ctx.font='bold 18px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,0,-5);
 if(subtle)ctx.globalAlpha=.75;
 ctx.restore();
}
function vehicle(ctx,n,x,y,a,selected){
 ctx.save();ctx.translate(x,y);ctx.rotate(a);
 if(selected){ctx.fillStyle='rgba(248,239,208,.75)';ctx.beginPath();ctx.ellipse(0,0,36,31,0,0,TAU);ctx.fill();}
 ctx.fillStyle='rgba(20,25,23,.35)';rounded(ctx,-20+5,-13+7,43,27,7);ctx.fill();
 ctx.fillStyle='#27332f';ctx.fillRect(-16,-15,10,4);ctx.fillRect(5,-15,10,4);ctx.fillRect(-16,11,10,4);ctx.fillRect(5,11,10,4);
 const base=n.side===0?'#39888c':'#d7804a';
 ctx.fillStyle=base;rounded(ctx,-23,-14,46,28,7);ctx.fill();
 ctx.fillStyle=n.side===0?'#86c5c0':'#edb176';rounded(ctx,-5,-12,20,24,4);ctx.fill();
 ctx.fillStyle='#36565a';rounded(ctx,1,-10,9,20,3);ctx.fill();
 ctx.fillStyle='#f8e8c6';ctx.fillRect(19,-10,4,6);ctx.fillRect(19,5,4,6);
 ctx.fillStyle='#fff1d5';ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n.unit,-13,0);
 ctx.restore();
}
export function renderCity(canvas,g,{selected=0,preview=null,showNodes=false,interpolation=null}={}){
 if(!canvas||!g?.map)return null;
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return null;
 const ratio=Math.min(devicePixelRatio||1,2),pw=Math.round(box.width*ratio),ph=Math.round(box.height*ratio);
 if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return null;
 ctx.setTransform(ratio,0,0,ratio,0,0);
 ctx.fillStyle='#e0d2b4';ctx.fillRect(0,0,box.width,box.height);
 const scale=Math.min((box.width-12)/g.map.width,(box.height-12)/g.map.height);
 const ox=(box.width-g.map.width*scale)/2,oy=(box.height-g.map.height*scale)/2;
 ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
 ctx.fillStyle='#dfd1b3';ctx.fillRect(0,0,g.map.width,g.map.height);
 ctx.fillStyle='#d8c9ac';
 for(let k=0;k<18;k++)ctx.fillRect(18+k*53,0,1.2,g.map.height);
 for(let r=0;r<6;r++)for(let c=0;c<4;c++)lot(ctx,g.map,r,c);
 road(ctx,g.map);
 const v=g.vehicles[selected],colors=['#f7d687','#eb9c66'];
 for(const n of g.vehicles){
  if(n.side===0||n.id===selected){
   const dest=g.map.nodes[n.goal];
   if(dest)pin(ctx,dest.x,dest.y,colors[n.side],String(n.unit),n.id!==selected);
  }
 }
 if(v){
  route(ctx,g.map,v.at,preview||v.route,'#f6c56b',9,preview?[10,4]:[]);
  if(v.stop){
   const p=g.map.nodes[v.stop.node];
   ctx.fillStyle='#e2a978';ctx.beginPath();ctx.arc(p.x,p.y,21,0,TAU);ctx.fill();
   ctx.fillStyle=ink;ctx.font='bold 19px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('Ⅱ',p.x,p.y);
  }
 }
 for(const n of g.vehicles){
  const target=n.route?.length?g.map.nodes[n.route[0]]:g.map.nodes[n.goal],at=g.map.nodes[n.at];
  const last=interpolation?.[n.id];
  let x=at.x,y=at.y;
  if(last&&last.node!==n.at&&interpolation.progress<1){const p=g.map.nodes[last.node];if(p){const t=interpolation.progress;x=p.x+(at.x-p.x)*t;y=p.y+(at.y-p.y)*t;}}
  const angle=target?Math.atan2(target.y-at.y,target.x-at.x):0;
  vehicle(ctx,n,x,y,angle,n.id===selected);
 }
 if(showNodes)for(const n of g.map.nodes){ctx.fillStyle='#f4e5c8';ctx.beginPath();ctx.arc(n.x,n.y,7,0,TAU);ctx.fill();ctx.strokeStyle='#425c51';ctx.lineWidth=2;ctx.stroke();}
 ctx.restore();
 return {ox,oy,scale,width:box.width,height:box.height};
}
export function pointerNode(point,view,map,max=48){
 if(!view)return null;
 const x=(point.x-view.ox)/view.scale,y=(point.y-view.oy)/view.scale;
 let best=max*max,result=null;
 for(const n of map.nodes){const d=(n.x-x)**2+(n.y-y)**2;if(d<best){best=d;result=n.id;}}
 return result;
}
export function pointerCar(point,view,g,side){
 if(!view)return null;
 const x=(point.x-view.ox)/view.scale,y=(point.y-view.oy)/view.scale;
 let best=45*45,result=null;
 for(const v of g.vehicles.filter(v=>v.side===side)){
  const n=g.map.nodes[v.at],d=(n.x-x)**2+(n.y-y)**2;
  if(d<best){best=d;result=v.id;}
 }
 return result;
}
