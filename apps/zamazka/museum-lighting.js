// One delegated spotlight across genuine paintings. The painting itself never
// transforms or loses pointer coordinates; only a non-interactive light layer moves.
export function installGalleryLighting(screen){
 if(typeof window==='undefined'||!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return ()=>{};
 let frame=0,next=null;
 const repaint=()=>{
  frame=0;if(!next)return;
  const {node,x,y}=next;next=null;
  if(!node.isConnected)return;
  const r=node.getBoundingClientRect();if(!r.width||!r.height)return;
  node.style.setProperty('--museum-light-x',Math.min(100,Math.max(0,((x-r.left)/r.width)*100)).toFixed(1)+'%');
  node.style.setProperty('--museum-light-y',Math.min(100,Math.max(0,((y-r.top)/r.height)*100)).toFixed(1)+'%');
 };
 const move=e=>{
  if(e.pointerType==='touch')return;
  const node=e.target.closest?.('.picture-image,.stake-frame,.verdict-image,.round-art-image,.museum-slide-rim,.unveil-frame');
  if(!node||!screen.contains(node))return;
  next={node,x:e.clientX,y:e.clientY};
  if(!frame)frame=requestAnimationFrame(repaint);
 };
 screen.addEventListener('pointermove',move,{passive:true});
 return ()=>{screen.removeEventListener('pointermove',move);if(frame)cancelAnimationFrame(frame)};
}
