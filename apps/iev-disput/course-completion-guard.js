(() => {
  const STORAGE_KEY='pocket-works:iev-disput:guided:v3';
  const REVIEW_CYCLE_KEY='pocket-works:iev-disput:guided:review-cycle';
  const LEGACY_BASE_UNITS=14;
  const TOTAL_UNITS=57;

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
  function cycleIsFresh(cycle){
    return Boolean(cycle)&&!cycle.finalFinished&&cycle.phase==='read'&&cycle.unitIndex===0&&cycle.practiceIndex===0&&cycle.unitCorrect===0&&cycle.unitTotal===0&&Object.keys(cycle.unitResults||{}).length===0;
  }
  function isLegacyAccidentalRepeat(state){
    const count=attemptedCount(state);const cycle=state?.cycle;
    if(count<LEGACY_BASE_UNITS||count>=TOTAL_UNITS||!cycleIsFresh(cycle)||isExplicitReview(cycle))return false;
    return Array.isArray(cycle.unitIds)&&cycle.unitIds.length>0&&cycle.unitIds.every(id=>!String(id).startsWith('detail-'));
  }
  function migrateLegacyRepeat(){
    const state=readState();
    if(!isLegacyAccidentalRepeat(state))return;
    state.cycle=null;
    state.tab='progress';
    writeState(state);
  }
  function decorateCompletionUi(){
    const state=readState();
    if(!courseComplete(state))return;

    const newCycle=document.querySelector('[data-action="new-cycle"]');
    if(newCycle){newCycle.dataset.action='course-complete';newCycle.textContent='Завершити курс'}

    const progressContinue=document.querySelector('.progress-page [data-action="back-cycle"]');
    if(progressContinue&&state?.cycle?.phase==='final-result')progressContinue.textContent='Переглянути останній фінал';

    const progressStart=document.querySelector('.progress-page [data-action="start-cycle"]');
    if(progressStart){progressStart.dataset.action='review-cycle';progressStart.textContent='Повторити 5 слабких тем'}

    const ledger=document.querySelector('.progress-page .learning-ledger');
    if(ledger&&!document.querySelector('#courseCompleteNotice')){
      const notice=document.createElement('div');
      notice.id='courseCompleteNotice';notice.className='reading-rule';
      notice.innerHTML='<span>Повний конспект завершено</span><p>57 із 57 блоків пройдено. Усі 15 розділів і 737 абзаців конспекту включені в детальний маршрут. Повторення запускається тільки окремою кнопкою.</p>';
      ledger.insertAdjacentElement('afterend',notice);
    }
  }

  migrateLegacyRepeat();

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const state=readState();if(!courseComplete(state))return;

    if(button.dataset.action==='new-cycle'||button.dataset.action==='course-complete'){
      event.preventDefault();event.stopImmediatePropagation();
      state.cycle=null;state.tab='progress';writeState(state);location.reload();return;
    }
    if(button.dataset.action==='review-cycle'){
      button.dataset.action='start-cycle';
      setTimeout(()=>{const next=readState();if(next?.cycle?.id){try{localStorage.setItem(REVIEW_CYCLE_KEY,next.cycle.id)}catch{}}},0);
    }
  },true);

  const observer=new MutationObserver(decorateCompletionUi);
  observer.observe(document.documentElement,{subtree:true,childList:true});
  queueMicrotask(decorateCompletionUi);
})();
