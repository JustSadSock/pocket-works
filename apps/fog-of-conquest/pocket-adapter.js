/* Preserve the original gameplay click logic; only cancel input and map panning are adapted. */
(function(){
const canvas=document.getElementById('canvas');
const viewport=document.getElementById('battleViewport');
document.getElementById('cancelSelectBtn')?.addEventListener('click',()=>canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
document.addEventListener('keydown',e=>{
if(e.key==='Escape'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName||'')){
canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));}});
for(const id of ['twoBtn','aiStartBtn','betaBtn'])document.getElementById(id)?.addEventListener('click',()=>requestAnimationFrame(()=>{viewport.scrollLeft=0;viewport.scrollTop=0;}));
let origin=null,dragged=false;
viewport.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;origin=[e.clientX,e.clientY];dragged=false;},{passive:true});
viewport.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin[0],e.clientY-origin[1])>9)dragged=true;},{passive:true});
viewport.addEventListener('pointercancel',()=>{origin=null;dragged=false;});
viewport.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopImmediatePropagation()}origin=null;dragged=false;},true);
})();