// Raster flood-fill needs pixels only inside the restored cutout, not the
// entire 1200x900 artwork. Keep twelve raster pixels around the polygon for
// anti-aliased contours, the 10px nearest-valid seed search and 4px fringes.
export function fillRasterBounds(zone,scale,fullWidth,fullHeight,pad=12){
 if(!zone||!Number.isFinite(zone.x)||!Number.isFinite(zone.y)||
    !Number.isFinite(zone.w)||!Number.isFinite(zone.h)||
    zone.w<=0||zone.h<=0)return {left:0,top:0,width:fullWidth,height:fullHeight};
 const left=Math.max(0,Math.floor(zone.x*scale)-pad);
 const top=Math.max(0,Math.floor(zone.y*scale)-pad);
 const right=Math.min(fullWidth,Math.ceil((zone.x+zone.w)*scale)+pad);
 const bottom=Math.min(fullHeight,Math.ceil((zone.y+zone.h)*scale)+pad);
 if(right<=left||bottom<=top)return {left:0,top:0,width:fullWidth,height:fullHeight};
 return {left,top,width:right-left,height:bottom-top};
}
export function extractRasterRegion(source,fullWidth,region){
 const pixels=source?.data||source;
 const {left,top,width,height}=region;
 const cropped=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++){
  const from=((top+y)*fullWidth+left)*4;
  cropped.set(pixels.subarray(from,from+width*4),y*width*4);
 }
 return {width,height,data:cropped};
}
export function localContourBounds(bounds,region,scale){
 if(!bounds)return null;
 const offsetX=region.left/scale,offsetY=region.top/scale;
 return {minX:bounds.minX-offsetX,minY:bounds.minY-offsetY,
  maxX:bounds.maxX-offsetX,maxY:bounds.maxY-offsetY};
}
