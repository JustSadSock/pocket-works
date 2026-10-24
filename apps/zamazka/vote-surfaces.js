// All five framed suspects use the identical canvas compositor. This is a
// visual protocol invariant, NOT a secure source for the current correct slot:
// until trusted raster assets exist, the voting client still knows the edit.
export const voteCanvasSelector=index=>'[data-vote-canvas="'+index+'"]';

export async function paintVoteSurfaces(root,selected,candidate,{render,concurrency=2}={}){
 if(!root||!Array.isArray(selected)||selected.length!==5||typeof render!=='function')
  throw Error('invalid_vote_surfacing');
 const canvases=selected.map((_,index)=>root.querySelector(voteCanvasSelector(index)));
 if(canvases.some(canvas=>!canvas))throw Error('missing_vote_canvas');
 // A fresh screen or an explicit retry must start with every card concealed.
 for(const canvas of canvases)canvas.classList.remove('is-ready');
 const finished=new Array(5).fill(false);
 let cursor=0,failed=false;
 const workers=Array.from({length:Math.min(5,Math.max(1,Math.floor(concurrency)))},async()=>{
  while(cursor<selected.length){
   const i=cursor++,id=selected[i],isRestored=candidate?.art===id;
   try{
    finished[i]=await render(canvases[i],id,
     isRestored?candidate.variation:0,
     isRestored?candidate.strokes||[]:null,
     isRestored)===true;
   }catch{finished[i]=false}
   if(!finished[i])failed=true;
  }
 });
 await Promise.all(workers);
 // Do not light up the one slower, heavily edited canvas in isolation: it
 // would reveal the true slot via load timing even with identical DOM nodes.
 // If any card fails, keep all five original fallbacks visible until retry.
 const current=canvases.every(canvas=>canvas.isConnected&&root.contains(canvas));
 if(!failed&&current)for(const canvas of canvases)canvas.classList.add('is-ready');
 return {ready:!failed&&current,painted:finished.filter(Boolean).length,total:5};
}
