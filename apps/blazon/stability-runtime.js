(()=>{
  'use strict';
  const BUILD='5.10.0';
  const FLAG=Symbol.for(`blazon.stability-runtime.${BUILD}`);
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;

  const $=(selector,scope=document)=>scope.querySelector(selector);
  const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
  const mandatoryDialogs=new Set(['resultDialog','rewardDialog','endingDialog']);
  const actionSelectors=['#startBattleButton','#replayButton','#continueResultButton','#endingMenuButton','#endingRestartButton','.reward-card'];
  const locked=new WeakMap();
  let lastBattleState=null;
  let stateTimer=0;
  let observer=null;
  let finishedSince=0;

  function normalizeRelease(){
    if(document.documentElement.dataset.blazonBuild!==BUILD)document.documentElement.dataset.blazonBuild=BUILD;
    const footer=$('.menu-screen footer');
    const footerText=`v${BUILD} · меню готово`;
    if(footer&&document.documentElement.dataset.blazonReady&&footer.textContent!==footerText)footer.textContent=footerText;
    const manager=$('[data-update-manager]');
    if(manager){if(manager.dataset.appVersion!==BUILD)manager.dataset.appVersion=BUILD;if(!manager.textContent.trim())manager.textContent='{}';}
    for(const link of $$('link[rel="stylesheet"]')){
      const url=new URL(link.href,location.href);
      if(!/\/(?:living-battle|armorial-progression|armorial-composition)\.css$/.test(url.pathname))continue;
      if(url.searchParams.get('pw_release')===BUILD)continue;
      url.searchParams.delete('v');url.searchParams.set('pw_release',BUILD);link.href=url.href;
    }
  }

  function protectMandatoryDialogs(){
    for(const id of mandatoryDialogs){
      const dialog=document.getElementById(id);if(!dialog||dialog.dataset.stabilityProtected)continue;
      dialog.dataset.stabilityProtected='true';
      dialog.addEventListener('cancel',event=>event.preventDefault());
      if(id==='resultDialog'){
        const close=dialog.querySelector('[data-close-dialog]');
        if(close){close.hidden=true;close.disabled=true;close.setAttribute('aria-hidden','true');close.removeAttribute('data-close-dialog');}
      }
    }
  }

  function resetPauseLabel(){const button=$('#pauseSimulationButton');if(button)button.textContent='Пауза';}
  function resetCommandSurface(){
    const rail=$('.battle-event-rail');if(rail)rail.replaceChildren();
    const pings=$('.battle-pings');if(pings)pings.replaceChildren();
    const event=$('#battleFooterEvent');if(event)event.textContent='Приказы ещё не вступили в силу';
    const phase=$('#battleFooterPhase');if(phase)phase.textContent='СБЛИЖЕНИЕ';
    const front=$('#frontPhase');if(front)front.textContent='СБЛИЖЕНИЕ';
    const caption=$('#frontCaption');if(caption)caption.textContent='Равные силы';
  }

  function watchBattleState(){
    const state=globalThis.__blazonBattleState||null;
    if(state===lastBattleState)return;
    lastBattleState=state;
    resetPauseLabel();
    resetCommandSurface();
  }

  function lockAction(event){
    const control=event.target.closest(actionSelectors.join(','));if(!control)return;
    const now=performance.now(),until=locked.get(control)||0;
    if(now<until){event.preventDefault();event.stopImmediatePropagation();return;}
    const token=now+900;locked.set(control,token);control.setAttribute('aria-busy','true');control.dataset.actionLocked='true';
    setTimeout(()=>{if(locked.get(control)!==token)return;locked.delete(control);control.removeAttribute('aria-busy');delete control.dataset.actionLocked;},950);
    if(control.matches('#startBattleButton,#replayButton')){resetPauseLabel();resetCommandSurface();}
  }

  function guardFinishedBattle(){
    const battle=$('#battleScreen');
    if(!battle?.classList.contains('is-active')){finishedSince=0;return;}
    const state=globalThis.__blazonBattleState;
    if(state?.status!=='finished'){finishedSince=0;return;}
    if(!finishedSince){finishedSince=performance.now();return;}
    if(performance.now()-finishedSince<900)return;
    const mandatory=[...mandatoryDialogs].map(id=>document.getElementById(id)).find(dialog=>dialog?.open);
    if(!mandatory){
      const result=$('#resultDialog');
      if(result&&!result.open){try{result.showModal();}catch{}}
    }
  }

  async function refreshWorker(){
    if(!('serviceWorker'in navigator))return;
    try{
      const registration=await navigator.serviceWorker.register(`./sw.js?pw_release=${BUILD}`,{updateViaCache:'none'});
      await registration.update();
    }catch(error){console.warn('[БЛАЗОН] stability worker refresh failed',error);}
  }

  normalizeRelease();protectMandatoryDialogs();resetPauseLabel();
  document.addEventListener('click',lockAction,true);
  observer=new MutationObserver(()=>{normalizeRelease();protectMandatoryDialogs();});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','open','href']});
  stateTimer=setInterval(()=>{watchBattleState();guardFinishedBattle();},180);
  refreshWorker();

  window.addEventListener('pagehide',()=>{
    document.removeEventListener('click',lockAction,true);
    observer?.disconnect();clearInterval(stateTimer);
  },{once:true});
})();
