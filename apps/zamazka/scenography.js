// Stage furniture is optional. Never touches the game canvas or interactive controls.
// Refinement intentionally uses just a cornice and a low foreground shelf.
const SPACES={
 home:'rotunda',setup:'foyer',connecting:'foyer',lobby:'salon',preparing:'salon',
 preview:'gallery',drawing:'workshop',waiting:'workshop',vote:'tribunal',
 verdict:'tribunal',reveal:'tribunal','round-review':'gallery',
 collection:'archive',archive:'archive',achievements:'archive',results:'salon'
};
export function clearDressScene(root){
 if(!root)return;
 root.querySelector(':scope > .set-furniture')?.remove();
 root.querySelector('.museum-display > .museum-plinth')?.remove();
 root.classList.remove('has-scenography');
 delete root.dataset.set;
}
export function setDressScene(root,scene){
 if(!root)return;
 clearDressScene(root);
 root.dataset.set=SPACES[scene]||'gallery';
 const furniture=document.createElement('div');
 furniture.className='set-furniture';
 furniture.setAttribute('aria-hidden','true');furniture.inert=true;
 furniture.innerHTML='<span class="set-cornice"></span><span class="set-foreground"></span>';
 root.append(furniture);
 if(scene==='home'){
  const display=root.querySelector('.museum-display');
  if(display){
   const sill=document.createElement('div');
   sill.className='museum-plinth';sill.setAttribute('aria-hidden','true');sill.inert=true;
   sill.innerHTML='<span class="museum-plinth-lip"></span><span class="museum-plinth-face"></span>';
   display.append(sill);
  }
 }
 root.classList.add('has-scenography');
}
