// Resolve a bucket click against the most recently drawn enclosing outline.
// Older opaque brushwork is pigment, not a wall inside a newer closed contour.
export function enclosingContourAt(strokes,end,point,aspect=4/3){
 if(!Array.isArray(strokes)||!Array.isArray(point)||point.length<2)return null;
 for(let i=Math.min(end,strokes.length)-1;i>=0;i--){
  const stroke=strokes[i],pts=stroke?.p;
  if((stroke?.t!=='brush'&&stroke?.t!=='pencil')||!Array.isArray(pts)||pts.length<4)continue;
  const width=(Number(stroke.s)||8)*(stroke.t==='pencil'?.4:1);
  const first=pts[0],last=pts[pts.length-1];
  if(!first||!last||Math.hypot(first[0]-last[0],first[1]-last[1])>Math.max(4,width*1.25))continue;
  let perimeter=0,area2=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let j=0;j<pts.length;j++){
   const a=pts[j],b=pts[(j+1)%pts.length];
   if(!a||!b||!a.every(Number.isFinite)||!b.every(Number.isFinite)){perimeter=0;break}
   perimeter+=Math.hypot(a[0]-b[0],a[1]-b[1]);
   area2+=a[0]*b[1]-b[0]*a[1];
   minX=Math.min(minX,a[0]);minY=Math.min(minY,a[1]);
   maxX=Math.max(maxX,a[0]);maxY=Math.max(maxY,a[1]);
  }
  if(perimeter<Math.max(18,width*5)||Math.abs(area2)<Math.max(36,width*width*.9))continue;
  // Polygon containment is only a candidate test. The raster must also be
  // sealed; fillRegion rejects any candidate that escapes its bounding box.
  let inside=false;
  for(let j=0,k=pts.length-1;j<pts.length;k=j++){
   const a=pts[j],b=pts[k];
   if((a[1]>point[1])!==(b[1]>point[1])&&
      point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  if(!inside)continue;
  const correction=(4/3)/Math.max(.1,aspect);
  const padX=width*correction/2+3,padY=width/2+3;
  return {start:i,bounds:{minX:minX-padX,minY:minY-padY,maxX:maxX+padX,maxY:maxY+padY}};
 }
 return null;
}

// A geometrically closed gesture can still have a raster pinhole. Never let
// its priority mask repaint pixels outside the enclosing gesture.
export function fillEscapedContour(changed,width,height,bounds,scale=1){
 if(!bounds||!changed||changed.length<width*height)return true;
 const left=Math.max(0,Math.floor(bounds.minX*scale)-4);
 const top=Math.max(0,Math.floor(bounds.minY*scale)-4);
 const right=Math.min(width-1,Math.ceil(bounds.maxX*scale)+4);
 const bottom=Math.min(height-1,Math.ceil(bounds.maxY*scale)+4);
 for(let i=0;i<width*height;i++)if(changed[i]){
  const x=i%width,y=(i/width)|0;
  if(x<left||x>right||y<top||y>bottom)return true;
 }
 return false;
}
