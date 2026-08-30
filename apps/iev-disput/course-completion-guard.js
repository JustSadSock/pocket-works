(() => {
  const STORAGE_KEY='pocket-works:iev-disput:guided:v3';
  const REVIEW_CYCLE_KEY='pocket-works:iev-disput:guided:review-cycle';
  const TOTAL_UNITS=14;

  function readState(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      return value&&typeof value==='object'?value:null;
    }catch{return null}
  }
  function writeState(state){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
  }
  function attemptedCount(state){
    return Object.values(state?.unitStats||{}).filter(stat=>stat&&Number(stat.attempts)>0).length;
  }
  function courseComplete(state){return attemptedCount(state)>=TOTAL_UNITS}
  function isExplicitReview(cycle){
    try{return Boolean(cycle?.id)&&localStorage.getItem(REVIEW_CYCLE_KEY)===cycle.id}catch{return false}
  }
  function freshAccidentalRepeat(state){
    const cycle=state?.cycle;
    if(!courseComplete(state)||!cycle||cycle.finalFinished||isExplicitReview(cycle))return false;
    return cycle.phase==='read'&&cycle.unitIndex===0&&cycle.practiceIndex===0&&cycle.unitCorrect===0&&cycle.unitTotal===0&&Object.keys(cycle.unitResults||{}).length===0;
  }
  function migrateAccidentalRepeat(){
    const state=readState();
    if(!freshAccidentalRepeat(state))return;
    state.cycle=null;
    state.tab='progress';
    writeState(state);
  }
  function decorateCompletionUi(){
    const state=readState();
    if(!courseComplete(state))return;

    const newCycle=document.querySelector('[data-action="new-cycle"]');
    if(newCycle){
      newCycle.dataset.action='course-complete';
      newCycle.textContent='Завершити курс';
    }

    const progressContinue=document.querySelector('.progress-page [data-action="back-cycle"]');
    if(progressContinue&&state?.cycle?.phase==='final-result'){
      progressContinue.textContent='Переглянути останній фінал';
    }

    const progressStart=document.querySelector('.progress-page [data-action="start-cycle"]');
    if(progressStart){
      progressStart.dataset.action='review-cycle';
      progressStart.textContent='Повторити 5 слабких тем';
    }

    const ledger=document.querySelector('.progress-page .learning-ledger');
    if(ledger&&!document.querySelector('#courseCompleteNotice')){
      const notice=document.createElement('div');
      notice.id='courseCompleteNotice';
      notice.className='reading-rule';
      notice.innerHTML='<span>Основний матеріал завершено</span><p>14 із 14 блоків пройдено. Нові теми більше не запускаються автоматично. Якщо хочеш повторення — нижче є окрема кнопка для 5 найслабших блоків.</p>';
      ledger.insertAdjacentElement('afterend',notice);
    }
  }

  migrateAccidentalRepeat();

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');
    if(!button)return;
    const state=readState();
    if(!courseComplete(state))return;

    if(button.dataset.action==='new-cycle'||button.dataset.action==='course-complete'){
      event.preventDefault();
      event.stopImmediatePropagation();
      state.cycle=null;
      state.tab='progress';
      writeState(state);
      location.reload();
      return;
    }

    if(button.dataset.action==='review-cycle'){
      button.dataset.action='start-cycle';
      setTimeout(()=>{
        const next=readState();
        if(next?.cycle?.id){try{localStorage.setItem(REVIEW_CYCLE_KEY,next.cycle.id)}catch{}}
      },0);
    }
  },true);

  const observer=new MutationObserver(decorateCompletionUi);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  queueMicrotask(decorateCompletionUi);
})();
