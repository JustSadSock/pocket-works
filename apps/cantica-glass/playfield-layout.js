// CANTICA chapel geometry. All painting and touch coordinates derive from one layout.
// Uses only stage bounds, so the rose, glass, pew and reliquaries never drift apart.
export function fitChapel(width,height,size,entryCol){
  if(!Number.isFinite(width)||!Number.isFinite(height)||size<4||size>7)
    throw new Error('Invalid chapel viewport');
  const w=Math.max(120,width),h=Math.max(190,height);
  const side=Math.max(21,Math.min(27,w*.056));
  const crown=Math.max(58,Math.min(97,h*.204));
  const foot=Math.max(34,Math.min(48,h*.095));
  const tile=Math.max(0,Math.min(96,(w-side*2)/size,(h-crown-foot)/size));
  const gridWidth=size*tile;
  const remaining=Math.max(0,h-crown-foot-gridWidth);
  const boardX=(w-gridWidth)/2;
  const boardY=crown+remaining*.46;
  const gridBottom=boardY+gridWidth;
  const roseRadius=Math.max(11,Math.min(27,tile*.47,crown*.285));
  const roseX=boardX+gridWidth/2;
  const roseY=boardY-crown*.54;
  const entryX=boardX+(entryCol+.5)*tile;
  const archTipY=boardY-crown+8;
  const archShoulderY=boardY-8;
  const sillY=gridBottom+Math.min(38,foot-6);
  const relicY=gridBottom+Math.min(18,foot*.39);
  return {
    width:w,height:h,size,tile,boardX,boardY,gridWidth,gridBottom,
    roseX,roseY,roseRadius,entryX,
    archTipY,archShoulderY,sillY,relicY,crown,foot,
    archLeft:boardX-10,archRight:boardX+gridWidth+10,
    frameBottom:gridBottom+Math.min(12,foot*.26)
  };
}
