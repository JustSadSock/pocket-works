// Deterministic, contour-aware bucket rasterizer for the damaged painting.
// Existing bucket colours never become barriers, and cutout edges close basins.
// Minor pinholes in thin strokes are stitched without deleting tiny pockets.
// The translucent stroke fringe is underpainted only from its nearest basin.
export function floodFillRaster({width,height,walls,zone,output,point,color,changed=null}){
 const total=width*height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    !walls||!zone||!output||!Array.isArray(point)||!Array.isArray(color)||
    point.length!==2||!point.every(Number.isFinite)||color.length<3||
    !color.slice(0,3).every(channel=>Number.isFinite(channel)&&channel>=0&&channel<=255))return 0;
 const wall=walls.data||walls,area=zone.data||zone,ink=output.data||output;
 const touched=changed&&changed.length>=total?changed:null;
 if(wall.length<total*4||area.length<total*4||ink.length<total*4)return 0;
 const barrier=new Uint8Array(total),WALL_ALPHA=96,ZONE_ALPHA=120;
 for(let i=0;i<total;i++)barrier[i]=area[i*4+3]<ZONE_ALPHA||wall[i*4+3]>=WALL_ALPHA?1:0;
 // Join only short, line-shaped pinholes, not the interiors of small real pockets.
 // The original mask is inspected throughout to avoid self-propagating bridges.
 const bridgeDirections=[[1,0],[0,1],[1,1],[-1,1]];
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x;
  if(wall[i*4+3]<WALL_ALPHA||area[i*4+3]<ZONE_ALPHA)continue;
  for(const [dx,dy] of bridgeDirections){
   const step=dy*width+dx;
   for(let gap=1;gap<=2;gap++){
    const endX=x+dx*(gap+1),endY=y+dy*(gap+1);
    if(endX<1||endX>=width-1||endY<1||endY>=height-1)break;
    const end=i+step*(gap+1);
    if(area[end*4+3]<ZONE_ALPHA||wall[end*4+3]<WALL_ALPHA)continue;
    // Only bridge a genuine short pinhole in a continuous drawn line.
    // Without this check, nearby independent contours (e.g. concentric
    // circles or thin corridors between two strokes) get welded into an
    // invisible barrier: a visibly connected area then fills only halfway.
    // Require five pixels of collinear evidence beyond BOTH endpoints.
    // The original wall mask is used, so new bridges cannot self-propagate.
    let supported=true;
    for(let k=1;k<=5;k++){
      const bx=x-dx*k,by=y-dy*k,fx=endX+dx*k,fy=endY+dy*k;
      if(bx<0||bx>=width||by<0||by>=height||
         fx<0||fx>=width||fy<0||fy>=height||
         wall[(by*width+bx)*4+3]<WALL_ALPHA||
         wall[(fy*width+fx)*4+3]<WALL_ALPHA){supported=false;break}
    }
    if(!supported)continue;
    const sideX=-dy,sideY=dx,side=sideY*width+sideX;
    // A gap between two thick, independent objects is a real paintable
    // corridor, not a pinhole in a single thin contour. The collinear
    // evidence alone misidentified narrow alleys between painted blocks.
    // Thin hand-drawn lines have empty pixels on BOTH sides of their
    // supporting endpoints. Inspect several original (unbridged) samples.
    for(let k=0;k<3;k++){
     const a=i-step*k,b=end+step*k;
     if(wall[(a+side)*4+3]>=WALL_ALPHA||wall[(a-side)*4+3]>=WALL_ALPHA||
        wall[(b+side)*4+3]>=WALL_ALPHA||wall[(b-side)*4+3]>=WALL_ALPHA){
       supported=false;break;
     }
    }
    if(!supported)continue;
    let thin=true;
    for(let k=1;k<=gap;k++){
     const at=i+step*k;
     if(area[at*4+3]<ZONE_ALPHA||wall[at*4+3]>=WALL_ALPHA||
        wall[(at+side)*4+3]>=WALL_ALPHA||wall[(at-side)*4+3]>=WALL_ALPHA){
      thin=false;break;
     }
    }
    if(thin)for(let k=1;k<=gap;k++)barrier[i+step*k]=1;
   }
  }
 }
 const allowed=i=>!barrier[i];
 let sx=Math.max(0,Math.min(width-1,Math.floor(point[0]))),
     sy=Math.max(0,Math.min(height-1,Math.floor(point[1])));
 let start=sy*width+sx;
 if(!allowed(start)){
  let best=Infinity,choice=-1;
  const radius=10;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const x=sx+dx,y=sy+dy,d=dx*dx+dy*dy;
   if(x<0||x>=width||y<0||y>=height||d>radius*radius||d>=best)continue;
   const index=y*width+x;
   if(allowed(index)){best=d;choice=index;}
  }
  if(choice<0)return 0;
  start=choice;
 }
 const seen=new Uint8Array(total),queue=new Int32Array(total);
 let head=0,tail=1;seen[start]=1;queue[0]=start;
 while(head<tail){
  const i=queue[head++],x=i%width,y=(i/width)|0;
  if(x>0&&!seen[i-1]&&allowed(i-1)){seen[i-1]=1;queue[tail++]=i-1;}
  if(x+1<width&&!seen[i+1]&&allowed(i+1)){seen[i+1]=1;queue[tail++]=i+1;}
  if(y>0&&!seen[i-width]&&allowed(i-width)){seen[i-width]=1;queue[tail++]=i-width;}
  if(y+1<height&&!seen[i+width]&&allowed(i+width)){seen[i+width]=1;queue[tail++]=i+width;}
 }
 const [r,g,b]=color,paint=i=>{
  const k=i*4;if(!area[k+3])return;
  ink[k]=r;ink[k+1]=g;ink[k+2]=b;ink[k+3]=255;
  if(touched)touched[i]=1;
 };
 for(let n=0;n<tail;n++)paint(queue[n]);
 // Underpaint only near a filled basin's contour, never a second basin.
 // A nearer reachable pixel on the other side owns the AA fringe.
 const fringeSeen=new Uint8Array(total),MAX_FRINGE=4;
 for(let n=0;n<tail;n++){
  const i=queue[n],x=i%width,y=(i/width)|0;
  if((x===0||seen[i-1])&&(x+1===width||seen[i+1])&&
     (y===0||seen[i-width])&&(y+1===height||seen[i+width]))continue;
  for(let dy=-MAX_FRINGE;dy<=MAX_FRINGE;dy++)for(let dx=-MAX_FRINGE;dx<=MAX_FRINGE;dx++){
   const d=dx*dx+dy*dy;
   if(!d||d>MAX_FRINGE*MAX_FRINGE)continue;
   const xx=x+dx,yy=y+dy;
   if(xx<0||xx>=width||yy<0||yy>=height)continue;
   const near=yy*width+xx;
   if(seen[near]||allowed(near)||fringeSeen[near]||!area[near*4+3])continue;
   let otherCloser=false;
   const radius=Math.ceil(Math.sqrt(d));
   for(let ry=-radius;ry<=radius&&!otherCloser;ry++)for(let rx=-radius;rx<=radius;rx++){
    if(rx*rx+ry*ry>=d)continue;
    const ox=xx+rx,oy=yy+ry;
    if(ox<0||ox>=width||oy<0||oy>=height)continue;
    const oi=oy*width+ox;
    if(allowed(oi)&&!seen[oi]){otherCloser=true;break;}
   }
   if(!otherCloser){paint(near);fringeSeen[near]=1;}
  }
 }
 return tail;
}

// Recolour connected visible pigment, rather than treating its opaque alpha as
// an obstacle. This works for painted backgrounds, several separate strokes,
// bucket colours and contours assembled from multiple gestures.
// The seed colour is sampled BEFORE any writes; neighbours are compared to that
// fixed colour, so a replacement colour cannot grow into an adjacent basin.
export function fillMatchingColorRaster({width,height,zone,output,point,color,changed=null,tolerance=24}){
 const total=width*height;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    !zone||!output||!Array.isArray(point)||point.length!==2||
    !point.every(Number.isFinite)||!Array.isArray(color)||color.length<3||
    !color.slice(0,3).every(channel=>Number.isFinite(channel)&&channel>=0&&channel<=255))return 0;
 const area=zone.data||zone,ink=output.data||output;
 if(area.length<total*4||ink.length<total*4)return 0;
 const x=Math.floor(point[0]),y=Math.floor(point[1]);
 if(x<0||x>=width||y<0||y>=height)return 0;
 const start=y*width+x,base=start*4;
 if(area[base+3]<120||ink[base+3]<120)return 0;
 const r=ink[base],g=ink[base+1],b=ink[base+2];
 const channelTolerance=Math.max(0,Math.min(80,Number.isFinite(tolerance)?tolerance:24));
 const sumTolerance=channelTolerance*2.5;
 const matches=i=>{
  const k=i*4;
  if(area[k+3]<120||ink[k+3]<120)return false;
  const dr=Math.abs(ink[k]-r),dg=Math.abs(ink[k+1]-g),db=Math.abs(ink[k+2]-b);
  return dr<=channelTolerance&&dg<=channelTolerance&&db<=channelTolerance&&
    dr+dg+db<=sumTolerance;
 };
 const visited=new Uint8Array(total),queue=new Int32Array(total);
 let head=0,tail=1;queue[0]=start;visited[start]=1;
 // Only topology of the original same-colour region matters. The visited mask
 // prevents freshly recoloured pixels being reconsidered as part of that region.
 while(head<tail){
  const i=queue[head++],ix=i%width,iy=(i/width)|0;
  if(ix>0&&!visited[i-1]&&matches(i-1)){visited[i-1]=1;queue[tail++]=i-1}
  if(ix<width-1&&!visited[i+1]&&matches(i+1)){visited[i+1]=1;queue[tail++]=i+1}
  if(iy>0&&!visited[i-width]&&matches(i-width)){visited[i-width]=1;queue[tail++]=i-width}
  if(iy<height-1&&!visited[i+width]&&matches(i+width)){visited[i+width]=1;queue[tail++]=i+width}
 }
 const touched=changed&&changed.length>=total?changed:null;
 for(let n=0;n<tail;n++){
  const i=queue[n],k=i*4;
  ink[k]=color[0];ink[k+1]=color[1];ink[k+2]=color[2];ink[k+3]=255;
  if(touched)touched[i]=1;
 }
 return tail;
}
