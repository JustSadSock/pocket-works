// Continuous slot motion: pictures move one position, never swap content mid-transition.
const wrap=(i,n)=>(i%n+n)%n;
export function galleryWindow(order,center){
 return [-2,-1,0,1,2].map(slot=>({slot,id:order[wrap(center+slot,order.length)]}));
}
export function createMuseumMotion(stage,{order,url,arts,onCenter}){
 let center=0,busy=false,queued=0,done=null,removed=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const nodes=new Map();
 const applyArt=(node,index)=>{
   const artId=order[wrap(index,order.length)];
   const img=node.querySelector('img');
   img.dataset.artId=String(artId);img.src=url(artId);img.alt=arts[artId]?.title||'Картина';
 };
 for(const {slot} of galleryWindow(order,0)){
   const element=document.createElement('figure');
   element.className='museum-slide';
   element.dataset.slot=String(slot);
   element.innerHTML='<div class="museum-slide-rim"><img loading="eager" decoding="async" alt=""></div>';
   applyArt(element,slot);
   nodes.set(slot,element);stage.append(element);
 }
 onCenter(order[0],0);
 function shift(direction){
   if(removed)return;
   const step=Math.sign(direction);
   if(!step)return;
   if(busy){queued=Math.max(-5,Math.min(5,queued+step));return}
   busy=true;center=wrap(center+step,order.length);
   const gone=step>0?-2:2;
   const fresh=step>0?2:-2;
   const exiting=nodes.get(gone);
   const next=new Map();
   for(const [slot,element] of nodes){const target=slot-step;element.dataset.slot=String(target);next.set(target,element)}
   nodes.clear();for(const [slot,element] of next)nodes.set(slot,element);
   const finish=()=>{
     if(removed)return;
     busy=false;exiting.classList.add('instant');
     exiting.dataset.slot=String(fresh);
     applyArt(exiting,center+fresh);
     nodes.delete(gone-step);nodes.set(fresh,exiting);
     void exiting.offsetWidth;
     requestAnimationFrame(()=>exiting.classList.remove('instant'));
     onCenter(order[center],center);
     if(queued){const direction=Math.sign(queued);queued-=direction;requestAnimationFrame(()=>shift(direction))}
   };
   done=setTimeout(finish,reduced?20:590);
 }
 return {shift,dispose(){removed=true;clearTimeout(done);nodes.clear()},getCenter(){return order[center]}};
}
