/*
 * FOLIO contour-only flood fill.
 * Already painted bucket regions are intentionally absent from this input:
 * only actual drawn ink, paint and eraser strokes define boundaries.
 */
export function floodLinework(alphaPixels,width,height,seedX,seedY,tolerance=28){
  const w=Math.trunc(width),h=Math.trunc(height);
  if(w<=0||h<=0||alphaPixels.length!==w*h*4)return [];
  const x=Math.floor(seedX),y=Math.floor(seedY);
  if(x<0||y<0||x>=w||y>=h)return [];
  const length=w*h;
  const ink=new Uint8Array(length);
  // Tolerance means weaker, translucent strokes are easier to cross.
  const threshold=24+Math.round(Math.min(100,Math.max(0,tolerance))*1.6);
  for(let i=0;i<length;i++)if(alphaPixels[i*4+3]>threshold)ink[i]=1;

  // Close one-pixel breaks and microscopic gaps at line intersections
  // WITHOUT permanently thickening thin outlines.
  const dilated=new Uint8Array(length);
  for(let row=0;row<h;row++)for(let col=0;col<w;col++){
    const i=row*w+col;if(!ink[i])continue;
    for(let dy=-1;dy<=1;dy++){
      const yy=row+dy;if(yy<0||yy>=h)continue;
      const start=yy*w;
      for(let dx=-1;dx<=1;dx++){const xx=col+dx;if(xx>=0&&xx<w)dilated[start+xx]=1;}
    }
  }
  const barriers=new Uint8Array(length);
  for(let row=0;row<h;row++)for(let col=0;col<w;col++){
    const i=row*w+col;if(!dilated[i])continue;
    let sealed=true;
    for(let dy=-1;dy<=1&&sealed;dy++){
      const yy=row+dy;if(yy<0||yy>=h)continue;
      for(let dx=-1;dx<=1;dx++){
        const xx=col+dx;if(xx<0||xx>=w)continue;
        if(!dilated[yy*w+xx]){sealed=false;break;}
      }
    }
    if(sealed)barriers[i]=1;
  }
  const seed=y*w+x;
  if(barriers[seed])return [];

  const visited=new Uint8Array(length),stack=[seed],segments=[];
  while(stack.length){
    const at=stack.pop();
    if(visited[at]||barriers[at])continue;
    const row=Math.floor(at/w),base=row*w;
    let left=at-base,right=left;
    while(left>0&&!visited[base+left-1]&&!barriers[base+left-1])left--;
    while(right<w-1&&!visited[base+right+1]&&!barriers[base+right+1])right++;
    visited.fill(1,base+left,base+right+1);
    segments.push([row,left,right]);
    for(const dy of [-1,1]){
      const yy=row+dy;if(yy<0||yy>=h)continue;
      const offset=yy*w;let lastBlocked=true;
      for(let col=left;col<=right;col++){
        const i=offset+col,free=!visited[i]&&!barriers[i];
        if(free&&lastBlocked)stack.push(i);
        lastBlocked=!free;
      }
    }
  }
  if(segments.length===0)return [];

  // Extend color into the boundary's covered pixels, but not into a
  // neighboring empty region. The ink will be painted over this underlay,
  // eliminating ragged pale halos where multiple lines meet.
  const painted=visited.slice();
  for(const [row,left,right] of segments){
    for(let yy=Math.max(0,row-1);yy<=Math.min(h-1,row+1);yy++){
      for(let col=Math.max(0,left-1);col<=Math.min(w-1,right+1);col++){
        const i=yy*w+col;
        if(barriers[i]||ink[i])painted[i]=1;
      }
    }
  }
  const runs=[];
  for(let row=0;row<h;row++){
    const base=row*w;
    for(let col=0;col<w;){
      if(!painted[base+col]){col++;continue;}
      const from=col;
      while(col+1<w&&painted[base+col+1])col++;
      runs.push([row,from,col]);
      col++;
    }
  }
  return runs;
}
