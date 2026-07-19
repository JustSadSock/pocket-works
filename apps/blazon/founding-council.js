(()=>{
  'use strict';
  const RELEASE='5.8.1';
  const FLAG=Symbol.for('blazon.founding-council.5.8.1');
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;

  const $=(selector,scope=document)=>scope.querySelector(selector);
  const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
  const root=document.documentElement;
  const steps=[
    {id:'field',root:'fieldChoices',number:'I',label:'Поле',caption:'Темперамент'},
    {id:'ordinary',root:'ordinaryChoices',number:'II',label:'Строй',caption:'Геометрия'},
    {id:'founder',root:'mainChoices',number:'III',label:'Основатель',caption:'Инстинкт'},
    {id:'school',root:'schoolChoices',number:'IV',label:'Школа',caption:'Облик'}
  ];
  let activeStep=0;
  let built=false;
  let processing=false;
  let bypassSeal=false;
  let frame=0;
  let autoAdvanceTimer=0;

  function syncVersion(){
    document.documentElement.dataset.blazonBuild=RELEASE;
    const manager=document.querySelector('[data-update-manager]');
    if(manager)manager.dataset.appVersion=RELEASE;
    const footer=document.querySelector('.menu-screen footer');
    if(footer)footer.textContent=`v${RELEASE} · founding council`;
    const workshopTitle=document.querySelector('.workshop-mode #workshop-title');
    if(workshopTitle)workshopTitle.textContent=workshopTitle.textContent.replace(/5\.[0-9]+\.[0-9]+\b/,RELEASE);
  }

  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href=`./founding-council.css?pw_release=${RELEASE}`;
  document.head.append(style);

  function sectionFor(step){return $(`#${step.root}`)?.closest('section')||null;}
  function selectedButton(step){
    const section=sectionFor(step);
    return section?.querySelector('.doctrine-choice.is-selected')||null;
  }
  function selectedName(step){return selectedButton(step)?.querySelector('strong')?.textContent.trim()||'Не выбрано';}
  function complete(step){return Boolean(selectedButton(step));}
  function firstIncomplete(){const index=steps.findIndex(step=>!complete(step));return index<0?steps.length-1:index;}

  function setActive(index,{focus=false}={}){
    activeStep=Math.max(0,Math.min(steps.length-1,index));
    const dialog=$('#setupDialog');
    if(!dialog)return;
    dialog.dataset.activeFoundingStep=steps[activeStep].id;
    $$('.founding-step',dialog).forEach((button,buttonIndex)=>{
      const current=buttonIndex===activeStep;
      button.classList.toggle('is-active',current);
      button.setAttribute('aria-current',current?'step':'false');
      button.tabIndex=current?0:-1;
    });
    steps.forEach((step,stepIndex)=>{
      const section=sectionFor(step);
      if(!section)return;
      const current=stepIndex===activeStep;
      section.classList.toggle('is-active-founding-step',current);
      section.hidden=!current;
      section.setAttribute('aria-hidden',String(!current));
    });
    const progress=$('.founding-progress-fill',dialog);
    if(progress)progress.style.setProperty('--founding-progress',`${(activeStep+1)/steps.length*100}%`);
    const counter=$('.founding-step-counter',dialog);
    if(counter)counter.textContent=`Шаг ${activeStep+1} из ${steps.length}`;
    if(focus)requestAnimationFrame(()=>selectedButton(steps[activeStep])?.focus({preventScroll:true})||sectionFor(steps[activeStep])?.querySelector('button')?.focus({preventScroll:true}));
  }

  function updateSummary(){
    const dialog=$('#setupDialog');
    if(!dialog)return;
    steps.forEach((step,index)=>{
      const isComplete=complete(step);
      const nav=$(`.founding-step[data-step-index="${index}"]`,dialog);
      nav?.classList.toggle('is-complete',isComplete);
      const value=$(`.founding-summary-item[data-summary-step="${step.id}"] b`,dialog);
      if(value)value.textContent=selectedName(step);
    });
    const seal=$('#sealSetupButton');
    if(seal){
      const allComplete=steps.every(complete);
      seal.dataset.councilReady=String(allComplete);
      const small=seal.querySelector('small');
      if(small)small.textContent=allComplete?'Устав готов к печати':`${steps.filter(step=>!complete(step)).length} решения ещё не принято`;
    }
  }

  function build(){
    const dialog=$('#setupDialog');
    const seal=$('#sealSetupButton');
    if(!dialog||!seal||!steps.every(step=>sectionFor(step)))return false;

    dialog.dataset.foundingCouncil='true';
    const title=dialog.querySelector('header h2');
    if(title)title.textContent='Начертай первый устав';
    const eyebrow=dialog.querySelector('header p');
    if(eyebrow)eyebrow.textContent='СОВЕТ ОСНОВАТЕЛЯ';

    if(!$('.founding-intro',dialog)){
      dialog.querySelector('header')?.insertAdjacentHTML('afterend',`
        <div class="founding-intro">
          <div class="founding-intro-mark" aria-hidden="true"><i></i><b>✦</b><i></i></div>
          <div><span class="founding-step-counter">Шаг 1 из 4</span><p>Четыре решения создают не набор бонусов, а характер рода: как он входит в бой, держит строй и выглядит под знаменем.</p></div>
        </div>
        <nav class="founding-steps" aria-label="Этапы первого устава">
          ${steps.map((step,index)=>`<button type="button" class="founding-step" data-step-index="${index}"><i>${step.number}</i><span><b>${step.label}</b><small>${step.caption}</small></span></button>`).join('')}
          <div class="founding-progress" aria-hidden="true"><i class="founding-progress-fill"></i></div>
        </nav>`);
    }

    steps.forEach((step,index)=>{
      const section=sectionFor(step);
      section.dataset.foundingStep=step.id;
      section.classList.add('founding-page');
      const heading=section.querySelector('h3');
      if(heading){
        heading.dataset.stepNumber=step.number;
        const copy={
          field:'Выбери темперамент армии',
          ordinary:'Задай геометрию первого строя',
          founder:'Назови главный инстинкт ратников',
          school:'Определи художественную школу рода'
        }[step.id];
        heading.textContent=copy;
      }
      if(!section.querySelector('.founding-page-note')){
        const note={
          field:'Поле определяет, как отряды принимают решения под давлением.',
          ordinary:'Ординарий меняет исходную форму фронта и распределение глубины.',
          founder:'Основатель действует уже в первом бою и станет центральной фигурой герба.',
          school:'Школа меняет форму щита, знамени и композицию, но не силу армии.'
        }[step.id];
        heading?.insertAdjacentHTML('afterend',`<p class="founding-page-note">${note}</p>`);
      }
      section.style.setProperty('--founding-index',index);
    });

    if(!$('.founding-footer',dialog)){
      const footer=document.createElement('footer');
      footer.className='founding-footer';
      footer.innerHTML=`
        <div class="founding-summary" aria-label="Выбранные основы доктрины">
          ${steps.map(step=>`<span class="founding-summary-item" data-summary-step="${step.id}"><i>${step.number}</i><small>${step.label}</small><b>Не выбрано</b></span>`).join('')}
        </div>
        <div class="founding-footer-actions">
          <button type="button" class="founding-back">Назад</button>
          <div class="founding-seal-host"></div>
        </div>
        <div class="founding-sealing" aria-live="polite"><i></i><span>Ставим печать и открываем походную книгу…</span></div>`;
      dialog.append(footer);
      footer.querySelector('.founding-seal-host')?.append(seal);
    }

    $$('.founding-step',dialog).forEach((button,index)=>button.addEventListener('click',()=>setActive(index,{focus:true})));
    $('.founding-back',dialog)?.addEventListener('click',()=>setActive(activeStep-1,{focus:true}));
    built=true;
    setActive(firstIncomplete());
    updateSummary();
    return true;
  }

  function finishTransition(success){
    const dialog=$('#setupDialog');
    const seal=$('#sealSetupButton');
    processing=false;
    globalThis.__BLAZON_UI_SUSPENDED__=false;
    root.classList.remove('blazon-sealing');
    dialog?.classList.remove('is-sealing');
    seal?.removeAttribute('aria-busy');
    if(seal)seal.disabled=!steps.every(complete);

    const doctrine=$('#doctrineScreen');
    doctrine?.classList.add('ui-refresh-pulse');
    requestAnimationFrame(()=>doctrine?.classList.remove('ui-refresh-pulse'));
    for(const id of ['playerAchievement','enemyAchievement']){
      const host=$(`#${id}`);if(!host)continue;
      const marker=document.createComment('ui-refresh');host.append(marker);marker.remove();
    }
    window.dispatchEvent(new CustomEvent('blazon:ui-refresh',{detail:{source:'founding-council',success}}));
  }

  function waitForDoctrine(startedAt){
    const dialog=$('#setupDialog');
    const doctrine=$('#doctrineScreen');
    if(!dialog?.open&&doctrine?.classList.contains('is-active')){finishTransition(true);return;}
    if(performance.now()-startedAt>2500){
      finishTransition(false);
      const message=$('.founding-sealing span',dialog);
      if(message)message.textContent='Переход не завершился. Попробуй ещё раз — выбранные решения сохранены.';
      return;
    }
    requestAnimationFrame(()=>waitForDoctrine(startedAt));
  }

  function beginSeal(event){
    const seal=event.target.closest?.('#sealSetupButton');
    if(!seal||bypassSeal)return;
    if(processing){event.preventDefault();event.stopImmediatePropagation();return;}
    const incomplete=steps.findIndex(step=>!complete(step));
    if(incomplete>=0){
      event.preventDefault();event.stopImmediatePropagation();setActive(incomplete,{focus:true});updateSummary();return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    processing=true;
    globalThis.__BLAZON_UI_SUSPENDED__=true;
    root.classList.add('blazon-sealing');
    const dialog=$('#setupDialog');
    dialog?.classList.add('is-sealing');
    seal.disabled=true;
    seal.setAttribute('aria-busy','true');
    const message=$('.founding-sealing span',dialog);
    if(message)message.textContent='Ставим печать и открываем походную книгу…';

    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>{
      const startedAt=performance.now();
      bypassSeal=true;
      try{seal.click();}finally{bypassSeal=false;}
      requestAnimationFrame(()=>waitForDoctrine(startedAt));
    },0)));
  }

  function handleChoice(event){
    const choice=event.target.closest?.('[data-field],[data-ordinary-choice],[data-v5-founder],[data-v5-school]');
    if(!choice)return;
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer=setTimeout(()=>{
      updateSummary();
      const stepIndex=steps.findIndex(step=>sectionFor(step)?.contains(choice));
      if(stepIndex>=0&&complete(steps[stepIndex])&&stepIndex<steps.length-1)setActive(stepIndex+1);
    },90);
  }

  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      if(!built)build();
      if(built)updateSummary();
    });
  }

  document.addEventListener('click',handleChoice,true);
  document.addEventListener('click',beginSeal,true);
  document.addEventListener('keydown',event=>{
    const dialog=$('#setupDialog');
    if(!dialog?.open)return;
    if(event.key==='ArrowRight'){event.preventDefault();setActive(activeStep+1,{focus:true});}
    if(event.key==='ArrowLeft'){event.preventDefault();setActive(activeStep-1,{focus:true});}
  });

  const setup=$('#setupDialog');
  const observer=setup?new MutationObserver(schedule):null;
  observer?.observe(setup,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled','open']});
  setup?.addEventListener('close',()=>{
    if(!processing){activeStep=0;setActive(0);}
  });
  window.addEventListener('blazon:ui-refresh',schedule);
  syncVersion();
  schedule();
  window.addEventListener('blazon:ready',syncVersion);
  window.addEventListener('pagehide',()=>{
    observer?.disconnect();
    if(frame)cancelAnimationFrame(frame);
    clearTimeout(autoAdvanceTimer);
  },{once:true});
})();
