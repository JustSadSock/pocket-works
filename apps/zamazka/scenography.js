// Physical stage dressing: semantic controls keep their exact positions.
// All scenery is aria-hidden, inert, and cannot intercept painting gestures.
const SPACES={
 home:'rotunda',setup:'foyer',connecting:'foyer',lobby:'salon',preparing:'salon',
 preview:'gallery',drawing:'workshop',waiting:'workshop',vote:'tribunal',
 verdict:'tribunal',reveal:'tribunal','round-review':'gallery',
 collection:'archive',archive:'archive',achievements:'archive',results:'salon'
};
const ORNAMENT='./scenography/ornament.svg';
const ornament=side=>'<img class="set-carving set-carving-'+side+'" src="'+ORNAMENT+'" alt="" draggable="false">';
export function setDressScene(root,scene){
 if(!root)return;
 const room=SPACES[scene]||'gallery';
 root.dataset.set=room;
 const furniture=document.createElement('div');
 furniture.className='set-furniture';
 furniture.setAttribute('aria-hidden','true');
 furniture.inert=true;
 furniture.innerHTML='<div class="set-foreground" aria-hidden="true"></div>';
 root.append(furniture);
 if(scene==='home'){
  const display=root.querySelector('.museum-display');
  if(display){
   const plinth=document.createElement('div');
   plinth.className='museum-plinth';plinth.setAttribute('aria-hidden','true');
   plinth.innerHTML='<div class="museum-plinth-lip"></div><div class="museum-plinth-panel"></div><div class="museum-plinth-foot"></div>';
   display.append(plinth);
  }
 }
 // Room category also styles forms, pictures, controls, and material treatments.
 root.classList.add('has-scenography');
}
