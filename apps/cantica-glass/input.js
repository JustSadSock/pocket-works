// Shared pointer geometry: the painted glass and the hit targets use the same chapel layout.
export function hitChapel(view,x,y,pointerType='mouse'){
  if(!view||!Number.isFinite(x)||!Number.isFinite(y))return null;
  const sunX=view.roseX+Math.sin(view.sunAngle||0)*view.roseRadius*.19;
  const radius=Math.max(pointerType==='touch'?29:22,view.roseRadius*.72);
  if(Math.hypot(x-sunX,y-view.roseY)<=radius)return {kind:'sun'};
  if(!(view.tile>0)||x<view.boardX||y<view.boardY||
     x>=view.boardX+view.gridWidth||y>=view.boardY+view.gridWidth)return null;
  const col=Math.floor((x-view.boardX)/view.tile);
  const row=Math.floor((y-view.boardY)/view.tile);
  if(col<0||col>=view.size||row<0||row>=view.size)return null;
  return {kind:'tile',index:row*view.size+col};
}

export function dragSunAngle(startAngle,deltaX,gridWidth){
  const sensitivity=Math.max(110,Math.min(270,gridWidth*.45));
  return Math.max(-.8,Math.min(.8,startAngle+deltaX/sensitivity));
}
