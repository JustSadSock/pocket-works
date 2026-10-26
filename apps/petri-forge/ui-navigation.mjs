// One modal surface at a time across the PetriForge workbench.
const MODAL_SELECTOR='dialog[open]';
let lastTrigger=null;
export function closeWorkbenchDialogs(except=null){
 for(const dlg of document.querySelectorAll(MODAL_SELECTOR)){
  if(dlg!==except)dlg.close();
 }
}
export function showWorkbenchDialog(dialog,trigger=document.activeElement){
 if(!dialog||dialog.tagName!=='DIALOG')throw Error('Окно не найдено');
 if(dialog.open)return false;
 // A training dialog must remain accessible until its worker is finished/stopped.
 const activeNeuro=document.getElementById('cpNeuroDialog');
 if(activeNeuro?.open&&document.getElementById('cpNeuroClose')?.disabled)return false;
 closeWorkbenchDialogs(dialog);
 lastTrigger=trigger instanceof HTMLElement?trigger:null;
 dialog.showModal();
 return true;
}
document.addEventListener('close',event=>{
 if(event.target.tagName!=='DIALOG')return;
 if(lastTrigger?.isConnected&&!lastTrigger.disabled)lastTrigger.focus({preventScroll:true});
 lastTrigger=null;
},true);
// Mode changes invalidate every previous screen's modal and settings overlay.
window.addEventListener('petri:mode',()=>closeWorkbenchDialogs());
window.addEventListener('petri:ui-reset',()=>closeWorkbenchDialogs());
