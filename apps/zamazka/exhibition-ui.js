import {fitGalleryArtwork} from './gallery-proportions.js';
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
  const groups=new Map();
  for(const stage of stages){
   if(!stage.isConnected)continue;
   const rim=stage.querySelector('.zam-exhibit-rim');
   const art=rim?.querySelector('img,canvas');
   if(!rim||!art)continue;
   // The source image and edited canvas MUST share the same final frame
   // dimensions. A restored canvas has a fixed 600x450 bitmap, which says
   // nothing about the original painting's physical aspect ratio.
   const natural=art.tagName==='IMG'&&art.naturalWidth>0?
    art.naturalWidth/art.naturalHeight:0;
   const styled=Number.parseFloat(art.style.getPropertyValue('--art-aspect'))||
    Number.parseFloat(art.style.aspectRatio)||
    Number.parseFloat(rim.style.getPropertyValue('--art-aspect'));
   const ratio=natural||styled||4/3;
   const width=stage.clientWidth;
   const gallery=stage.closest?.('.stake-gallery,.round-review-grid,.exhibition-grid,.finale-ballot-grid');
   const bounds=gallery||stage.parentElement;
   const outerWidth=bounds?.clientWidth||width,outerHeight=bounds?.clientHeight||stage.clientHeight;
   const previous=stableRoom.get(stage);
   const sameRoom=previous&&Math.abs(outerWidth-previous.outerWidth)<2&&
    Math.abs(outerHeight-previous.outerHeight)<2&&Math.abs(width-previous.width)<2;
   const availableHeight=stage.clientHeight;
   // Ballot cards have fixed space above their coin shelves. An old larger
   // height after a resize would push the wooden rims out of bounds.
   const freeHeight=stage.closest?.('.finale-ballot-card')?availableHeight:
    (sameRoom?Math.max(availableHeight,previous.freeHeight):availableHeight);
   stableRoom.set(stage,{outerWidth,outerHeight,width,freeHeight});
   const height=freeHeight-
    (stage.querySelector('.zam-exhibit-plaque')?.offsetHeight||0)-
    (stage.querySelector('.stake-actions,.stake-locked')?.offsetHeight||0)-7;
   if(width<30||height<30)continue;
   const chrome=Math.max(4,Math.min(10,Math.round(width*.022)));
   const cell={stage,rim,ratio,chrome,
    maxWidth:Math.max(20,width-2*chrome-4),
    maxHeight:Math.max(20,height-2*chrome-4)};
   const key=gallery||stage;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(cell);
  }
  for(const cells of groups.values()){
   const fits=fitGalleryArtwork(cells);
   cells.forEach((cell,i)=>{
    const {rim,ratio,chrome}=cell;
    const {width,height}=fits[i];
    rim.style.setProperty('--art-aspect',String(ratio));
    rim.style.setProperty('--frame-width',chrome+'px');
    rim.style.width=(width+chrome*2)+'px';
    rim.style.height=(height+chrome*2)+'px';
    // Legacy mobile selectors use height:auto!important and aspect-ratio:4/3.
    // The fitted size must win so the physical rim matches the source artwork.
    rim.style.setProperty('width',(width+chrome*2)+'px','important');
    rim.style.setProperty('height',(height+chrome*2)+'px','important');
    // A replaced IMG and the 600x450 restoration CANVAS must occupy
    // precisely the same content box. Never let intrinsic bitmap dimensions
    // create a different silhouette for the forged painting.
    const image=rim.querySelector('img,canvas');
    image.style.width=width+'px';
    image.style.height=height+'px';
   });
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
