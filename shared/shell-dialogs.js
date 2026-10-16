// Shared confirmations for shell and embedded social surfaces. Escape always cancels.
export function askShell({title, message='', actions=[{value:'accept',label:'Подтвердить'}]}) {
  return new Promise(resolve=>{
    if(!document.querySelector('link[data-shell-dialogs],link[href*="shell-dialogs.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./shell-dialogs.css',import.meta.url).href;css.dataset.shellDialogs='';document.head.append(css);}
    const previous=document.activeElement;
    const dialog=document.createElement('dialog');
    dialog.className='pw-confirm';
    const heading=document.createElement('h2');heading.id='pw-confirm-heading';heading.textContent=title;
    const copy=document.createElement('p');copy.textContent=message;
    const controls=document.createElement('div');controls.className='pw-confirm__actions';
    dialog.setAttribute('aria-labelledby',heading.id);
    function finish(value){dialog.close();dialog.remove();previous?.isConnected&&previous.focus();resolve(value);}
    for(const action of [...actions,{value:'cancel',label:'Отмена'}]){
      const button=document.createElement('button');button.type='button';button.textContent=action.label;
      button.dataset.choice=action.value;
      if(action.danger)button.className='is-danger';
      button.addEventListener('click',()=>finish(action.value));controls.append(button);
    }
    dialog.append(heading,copy,controls);document.body.append(dialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});
    dialog.addEventListener('click',event=>{if(event.target===dialog)finish('cancel');});
    dialog.showModal();controls.lastElementChild.focus();
  });
}

export async function confirmShell(title,message,label='Подтвердить',danger=false){
  return await askShell({title,message,actions:[{value:'accept',label,danger}]})==='accept';
}

export function askUnsaved(){
  return askShell({title:'Сохранить изменения?',message:'Есть несохранённые изменения.',actions:[
    {value:'save',label:'Сохранить'},{value:'discard',label:'Не сохранять'}
  ]});
}
