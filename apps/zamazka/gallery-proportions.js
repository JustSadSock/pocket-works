// The same physical scale for the original gallery and the voting wall.
// Preserve EACH painting's decoded aspect ratio; use approximately equal
// visible painted area, rather than giving wide images all the screen and
// portraits an arbitrary 4:3 picture box.
export function fitGalleryArtwork(cells,{balance=.82}={}){
 const finite=n=>Number.isFinite(n)&&n>0;
 const available=cells.map(cell=>{
  const ratio=finite(cell.ratio)?cell.ratio:4/3;
  const w=Math.max(1,cell.maxWidth||1),h=Math.max(1,cell.maxHeight||1);
  const capacity=Math.min(w*w/ratio,h*h*ratio);
  return {ratio,w,h,capacity};
 });
 const capacities=available.map(c=>c.capacity).sort((a,b)=>a-b);
 const median=capacities[Math.floor(capacities.length/2)]||1;
 // Make the visible image area as equal as possible without sacrificing
 // most of the gallery whenever one painting is very wide or very tall.
 const target=median*balance;
 return available.map(({ratio,w,h,capacity})=>{
  const area=Math.min(capacity,target);
  const width=Math.max(1,Math.min(w,Math.sqrt(area*ratio)));
  const height=Math.max(1,Math.min(h,width/ratio));
  return {width,height,ratio,area:width*height};
 });
}
