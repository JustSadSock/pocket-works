// Shared physical museum objects used by preview, voting, ballots and review.
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const exhibitFacets = () => ['top','left','right','bottom'].map(side =>
 '<span class="museum-frame-facet museum-frame-facet-'+side+'" aria-hidden="true"></span>').join('');
export const exhibitPlaque = (title,detail='') =>
 '<div class="museum-slide-label zam-exhibit-plaque"><strong>'+esc(title)+'</strong>'+
 (detail?'<span>'+esc(detail)+'</span>':'')+'</div>';

/** Never stretch the bitmap into a pre-sized rectangle. Fit the wooden rim
 * around the decoded image's natural ratio, inside the real stage bounds.
 * The canvas is still painted in the game's stable 600 x 450 protocol. */
export function mountExhibitFrames(root){
 const stages=[...root.querySelectorAll('[data-exhibit-stage]')];
 if(!stages.length)return {dispose(){}};
 let disposed=false,queued=0;
 const stableRoom=new WeakMap();
 function fit(){
  queued=0;if(disposed)return;
  for(const stage of stages){
   if(!stage.isConnected)continue;
   const rim=stage.querySelector('.zam-exhibit-rim');
   const art=rim?.querySelector('img,canvas');
   if(!rim||!art)continue;
   const natural=art.tagName==='IMG'&&art.naturalWidth>0?art.naturalWidth/art.naturalHeight:0;
   const rendered=Number.parseFloat(art.style.getPropertyValue('--art-aspect'))||
     Number.parseFloat(art.style.aspectRatio)||
     Number.parseFloat(rim.style.getPropertyValue('--art-aspect'));
   const ratio=natural||rendered||4/3;
   const width=stage.clientWidth;
   const gallery=stage.closest?.('.stake-gallery,.round-review-grid,.exhibition-grid');
   const bounds=gallery||stage.parentElement;
   const outerWidth=bounds?.clientWidth||width,outerHeight=bounds?.clientHeight||stage.clientHeight;
   const previous=stableRoom.get(stage);
   // A non-voting author has no coin tray, so the picture's own height can
   // feed back into its flex stage. A ResizeObserver then shrinks it repeatedly.
   // Invalidate only when the *outer gallery* really changes dimensions.
   const sameRoom=previous&&Math.abs(outerWidth-previous.outerWidth)<2&&
     Math.abs(outerHeight-previous.outerHeight)<2&&Math.abs(width-previous.width)<2;
   const freeHeight=sameRoom?Math.max(stage.clientHeight,previous.freeHeight):stage.clientHeight;
   stableRoom.set(stage,{outerWidth,outerHeight,width,freeHeight});
   const height=freeHeight-(stage.querySelector('.zam-exhibit-plaque')?.offsetHeight||0)-
     (stage.querySelector('.stake-actions,.stake-locked')?.offsetHeight||0)-7;
   if(width<30||height<30)continue;
   const chrome=Math.max(4,Math.min(10,Math.round(width*.022)));
   const maxW=Math.max(20,width-2*chrome-4);
   const maxH=Math.max(20,height-2*chrome-4);
   const canvasW=Math.max(12,Math.min(maxW,maxH*ratio));
   const canvasH=canvasW/ratio;
   rim.style.setProperty('--art-aspect',String(ratio));
   rim.style.setProperty('--frame-width',chrome+'px');
   const frameW=(canvasW+chrome*2)+'px',frameH=(canvasH+chrome*2)+'px';
   rim.style.width=frameW;
   rim.style.height=frameH;
   // The protocol screen still has an older !important width/height rule.
   // Override it using actual decoded geometry, or a 4:3 rule can collapse
   // a natural portrait into a horizontal line.
   rim.style.setProperty('width',frameW,'important');
   rim.style.setProperty('height',frameH,'important');
  }
 }
 const schedule=()=>{if(!queued&&!disposed)queued=requestAnimationFrame(fit)};
 const sizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
 const mutationObserver=typeof MutationObserver!=='undefined'?new MutationObserver(schedule):null;
 const imgs=[];
 for(const stage of stages){
  sizeObserver?.observe(stage);
  const art=stage.querySelector('img,canvas');
  if(art?.tagName==='IMG'){art.addEventListener('load',schedule);imgs.push(art)}
  else if(art)mutationObserver?.observe(art,{attributes:true,attributeFilter:['style']});
 }
 schedule();
 return {refresh:schedule,dispose(){
  disposed=true;cancelAnimationFrame(queued);sizeObserver?.disconnect();mutationObserver?.disconnect();
  for(const img of imgs)img.removeEventListener('load',schedule);
 }};
}
