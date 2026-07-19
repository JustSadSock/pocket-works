(()=>{
  'use strict';
  const FLAG=Symbol.for('blazon.progression-runtime.v5.9.0');
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;

  const $=selector=>document.querySelector(selector);
  const founders={
    lion:['Лев','Два ближайших отряда совместно ломают одну цель.'],
    boar:['Вепрь','Первый отряд использует пролом и идёт в глубину.'],
    tower:['Башня','Удержанная позиция становится точкой повторного сбора.'],
    stag:['Олень','Уступающий отряд отходит к союзнику и возвращается вместе с ним.']
  };
  const schools={
    imperial:['Имперская','Осевая симметрия, тяжёлый гонфалон и властный центр.'],
    civic:['Городская','Строгий штандарт, геометрия и повторяющийся ритм.'],
    knightly:['Рыцарская','Крупная фигура, раздвоенное полотнище и турнирный наклон.'],
    northern:['Северная','Узкий вымпел, суровая вертикаль и много воздуха.']
  };
  const evolved=new Set([
    'lion-bifurcated','lion-crowned','lion-regardant',
    'boar-armed','boar-coupled','boar-blooded',
    'tower-gate','tower-triple','tower-burning',
    'stag-courant','stag-crowned','stag-regardant'
  ]);
  const steps=[
    {id:'field',label:'Поле',short:'Цвет',root:'#fieldChoices'},
    {id:'ordinary',label:'Строй',short:'Строй',root:'#ordinaryChoices'},
    {id:'founder',label:'Основатель',short:'Фигура',root:'#mainChoices'},
    {id:'school',label:'Школа',short:'Школа',root:'#schoolChoices'}
  ];

  globalThis.__blazonFounder=null;
  globalThis.__blazonSchool=null;

  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='./armorial-progression.css?pw_release=5.9.0';
  document.head.append(style);

  let activeStep=0;
  let frame=0;
  let sealing=false;
  let observer=null;
  let sealWatchdog=0;

  function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  function selectionText(selector,fallback='Не выбрано'){return $(selector)?.querySelector('.is-selected strong')?.textContent?.trim()||fallback;}
  function selectionId(selector,datasetKey){const node=$(selector)?.querySelector('.is-selected');return node?.dataset?.[datasetKey]||null;}
  function isComplete(index){
    if(index===0)return Boolean($('.field-grid .is-selected'));
    if(index===1)return Boolean($('.ordinary-grid .is-selected'));
    if(index===2)return Boolean(globalThis.__blazonFounder);
    return Boolean(globalThis.__blazonSchool);
  }
  function firstIncomplete(){const index=steps.findIndex((_,i)=>!isComplete(i));return index<0?3:index;}

  function makeHeading(number,title,copy){
    const wrapper=document.createElement('div');
    wrapper.className='setup-section-heading';
    wrapper.innerHTML=`<span>${number}</span><div><h3>${title}</h3><p>${copy}</p></div>`;
    return wrapper;
  }

  function ensureSetup(){
    const dialog=$('#setupDialog');
    const seal=$('#sealSetupButton');
    if(!dialog||!seal)return;
    dialog.classList.add('setup-reworked');
    setText(dialog.querySelector('header p'),'ПЕРВЫЙ УСТАВ');
    setText(dialog.querySelector('header h2'),'Собери знамя и характер армии');

    if(!$('#mainChoices')){
      const section=document.createElement('section');
      section.className='setup-choice-section';
      section.innerHTML='<div class="setup-section-heading"><span>III</span><div><h3>Основатель рода</h3><p>Главная фигура сразу задаёт инстинкт ратников.</p></div></div><div class="choice-grid founder-grid" id="mainChoices"></div>';
      seal.before(section);
    }
    if(!$('#schoolChoices')){
      const section=document.createElement('section');
      section.className='setup-choice-section';
      section.innerHTML='<div class="setup-section-heading"><span>IV</span><div><h3>Геральдическая школа</h3><p>Она меняет конструкцию знамени и композицию герба, но не силу армии.</p></div></div><div class="choice-grid school-grid" id="schoolChoices"></div>';
      seal.before(section);
    }

    const fieldSection=$('#fieldChoices')?.closest('section');
    const ordinarySection=$('#ordinaryChoices')?.closest('section');
    if(fieldSection&&!fieldSection.classList.contains('setup-choice-section')){
      fieldSection.classList.add('setup-choice-section');
      fieldSection.querySelector('h3')?.replaceWith(makeHeading('I','Поле знамени','Цвет определяет первое решение отрядов в бою.'));
    }
    if(ordinarySection&&!ordinarySection.classList.contains('setup-choice-section')){
      ordinarySection.classList.add('setup-choice-section');
      ordinarySection.querySelector('h3')?.replaceWith(makeHeading('II','Геометрия строя','Ординарий задаёт форму построения и ритм фронта.'));
    }

    for(const [index,step] of steps.entries()){
      const section=$(step.root)?.closest('section');
      if(section){section.dataset.setupStep=step.id;section.dataset.stepIndex=String(index);}
    }

    if(!$('#setupCouncil')){
      const council=document.createElement('section');
      council.id='setupCouncil';
      council.className='setup-council';
      council.innerHTML=`<nav class="setup-steps" aria-label="Этапы первого устава">${steps.map((step,index)=>`<button type="button" data-setup-go="${index}"><b>${index+1}</b><span>${step.short}</span></button>`).join('')}</nav><div class="setup-draft" aria-live="polite"><div class="setup-draft-shield" id="setupDraftShield"><i></i><b>?</b></div><div class="setup-draft-copy"><small>ЧЕРНОВИК УСТАВА</small><strong id="setupDraftTitle">Знамя ещё не начертано</strong><span id="setupDraftMeta">Выбери четыре обязательных решения</span></div><em id="setupProgressMark">0 / 4</em></div>`;
      dialog.querySelector('header').after(council);
    }

    if(!$('#setupSealing')){
      const overlay=document.createElement('div');
      overlay.id='setupSealing';
      overlay.className='setup-sealing';
      overlay.setAttribute('aria-live','assertive');
      overlay.innerHTML='<i class="wax-loader"></i><strong>Ставим печать</strong><span>Собираем первое знамя и открываем совет перед полем…</span>';
      dialog.append(overlay);
    }

    setText(seal.querySelector('span'),'Скрепить первый устав');
    setText(seal.querySelector('small'),'Четыре решения · одна доктрина');
  }

  function founderMarkup(id,name,copy,selected){return `<button type="button" class="doctrine-choice founder-choice${selected?' is-selected':''}" data-v5-founder="${id}"><i class="founder-mark"><svg viewBox="0 0 120 120" aria-hidden="true"><use href="#charge-${id}"></use></svg></i><div><strong>${name}</strong><span>${copy}</span></div><em>Основатель</em></button>`;}
  function schoolMarkup(id,name,copy,selected){return `<button type="button" class="doctrine-choice school-choice${selected?' is-selected':''}" data-v5-school="${id}"><i class="school-shield school-shield-${id}"></i><div><strong>${name}</strong><span>${copy}</span></div><em>Школа</em></button>`;}
  function renderFounderCards(){const root=$('#mainChoices');if(!root)return;const key=globalThis.__blazonFounder||'-';if(root.dataset.key===key&&root.children.length===4)return;root.dataset.key=key;root.innerHTML=Object.entries(founders).map(([id,[name,copy]])=>founderMarkup(id,name,copy,key===id)).join('');}
  function renderSchoolCards(){const root=$('#schoolChoices');if(!root)return;const key=globalThis.__blazonSchool||'-';if(root.dataset.key===key&&root.children.length===4)return;root.dataset.key=key;root.innerHTML=Object.entries(schools).map(([id,[name,copy]])=>schoolMarkup(id,name,copy,key===id)).join('');}

  function renderStep(){
    const dialog=$('#setupDialog');if(!dialog)return;
    activeStep=Math.max(0,Math.min(3,activeStep));
    for(const section of dialog.querySelectorAll('[data-setup-step]'))section.classList.toggle('is-current',Number(section.dataset.stepIndex)===activeStep);
    for(const button of dialog.querySelectorAll('[data-setup-go]')){
      const index=Number(button.dataset.setupGo);
      button.classList.toggle('is-current',index===activeStep);
      button.classList.toggle('is-complete',isComplete(index));
      button.setAttribute('aria-current',index===activeStep?'step':'false');
    }
    dialog.dataset.activeStep=steps[activeStep].id;
  }

  function updateDraft(){
    const values=[selectionText('#fieldChoices'),selectionText('#ordinaryChoices'),globalThis.__blazonFounder?founders[globalThis.__blazonFounder]?.[0]:'Не выбрано',globalThis.__blazonSchool?schools[globalThis.__blazonSchool]?.[0]:'Не выбрано'];
    const count=steps.reduce((sum,_,index)=>sum+(isComplete(index)?1:0),0);
    setText($('#setupProgressMark'),`${count} / 4`);
    setText($('#setupDraftTitle'),count?values.filter(value=>value!=='Не выбрано').join(' · '):'Знамя ещё не начертано');
    setText($('#setupDraftMeta'),count===4?'Устав готов к печати':`Осталось решений: ${4-count}`);
    const shield=$('#setupDraftShield');
    if(shield){
      shield.dataset.field=selectionId('#fieldChoices','field')||'';
      shield.dataset.ordinary=selectionId('#ordinaryChoices','ordinaryChoice')||'';
      shield.dataset.founder=globalThis.__blazonFounder||'';
      shield.dataset.school=globalThis.__blazonSchool||'';
      setText(shield.querySelector('b'),globalThis.__blazonFounder?(founders[globalThis.__blazonFounder]?.[0]?.[0]||'◆'):'?');
    }
  }

  function updateSeal(){
    const button=$('#sealSetupButton');if(!button)return;
    const complete=steps.every((_,index)=>isComplete(index));
    if(!sealing)button.disabled=!complete;
    button.classList.toggle('is-ready',complete);
    updateDraft();renderStep();
  }

  function advanceAfter(index){
    if(activeStep!==index)return;
    const next=steps.findIndex((_,candidate)=>candidate>index&&!isComplete(candidate));
    if(next>=0){activeStep=next;setTimeout(renderStep,150);}
  }

  function installSymbols(){
    const defs=$('.symbol-library defs');
    if(!defs||$('#charge-lion-crowned'))return;
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');
    group.innerHTML=`<symbol id="charge-lion-bifurcated" viewBox="0 0 120 120"><use href="#charge-lion"/><path d="M43 48C20 42 8 29 12 10c12 5 23 13 28 26" fill="none" stroke="currentColor" stroke-width="7"/></symbol><symbol id="charge-lion-crowned" viewBox="0 0 120 120"><use href="#charge-lion"/><path d="m70 16 7-12 8 9 9-9 5 14-6 8H76Z" fill="currentColor"/></symbol><symbol id="charge-lion-regardant" viewBox="0 0 120 120"><g transform="translate(120) scale(-1 1)"><use href="#charge-lion"/></g></symbol><symbol id="charge-boar-armed" viewBox="0 0 120 120"><use href="#charge-boar"/><path d="M95 64c10 8 18 6 23-3-2 15-13 23-27 17" fill="none" stroke="currentColor" stroke-width="6"/></symbol><symbol id="charge-boar-coupled" viewBox="0 0 120 120"><g transform="translate(-9 8) scale(.82)"><use href="#charge-boar"/></g><g transform="translate(53 40) scale(.48)"><use href="#charge-boar"/></g></symbol><symbol id="charge-boar-blooded" viewBox="0 0 120 120"><use href="#charge-boar"/><path d="M42 29 69 96M57 22l25 62" stroke="var(--detail,#1c1814)" stroke-width="6"/></symbol><symbol id="charge-tower-gate" viewBox="0 0 120 120"><use href="#charge-tower"/><path d="M47 107V76c0-17 26-17 26 0v31" fill="none" stroke="var(--detail,#1c1814)" stroke-width="8"/></symbol><symbol id="charge-tower-triple" viewBox="0 0 120 120"><g transform="translate(2 42) scale(.48)"><use href="#charge-tower"/></g><g transform="translate(34 5) scale(.48)"><use href="#charge-tower"/></g><g transform="translate(66 42) scale(.48)"><use href="#charge-tower"/></g></symbol><symbol id="charge-tower-burning" viewBox="0 0 120 120"><use href="#charge-tower"/><path d="M30 36c-11-17 5-24 1-35 16 10 18 21 11 35m21-3C53 16 69 10 67 0c16 12 16 23 8 36m18 0C82 20 98 14 95 3c17 12 16 24 8 35" fill="currentColor"/></symbol><symbol id="charge-stag-courant" viewBox="0 0 120 120"><g transform="translate(0 8) rotate(-7 60 60)"><use href="#charge-stag"/></g><path d="M18 104h34m9 7h42" stroke="currentColor" stroke-width="5"/></symbol><symbol id="charge-stag-crowned" viewBox="0 0 120 120"><use href="#charge-stag"/><path d="m76 37 6-12 8 8 8-9 5 14-6 7H82Z" fill="currentColor"/></symbol><symbol id="charge-stag-regardant" viewBox="0 0 120 120"><g transform="translate(120) scale(-1 1)"><use href="#charge-stag"/></g></symbol>`;
    while(group.firstChild)defs.append(group.firstChild);
  }

  function setDisplay(node,visible){if(!node)return;const value=visible?'':'none';if(node.style.display!==value)node.style.display=value;}
  function decorateAchievements(){
    for(const svg of document.querySelectorAll('svg.achievement')){
      const id=svg.querySelector('.charge-main use')?.getAttribute('href')?.replace('#charge-','');
      const complete=evolved.has(id);svg.classList.toggle('is-evolved',complete);
      for(const node of svg.querySelectorAll('.mantle,.mantle-lining,.civic-wreath,.mural-crown,.fur-edge'))setDisplay(node,complete);
      const motto=svg.querySelector('.motto-copy');const hasMotto=Boolean(motto&&motto.textContent.trim()!=='—');
      setDisplay(motto,hasMotto);setDisplay(svg.querySelector('.motto-scroll'),hasMotto);
    }
    if($('#rewardGrid svg.is-evolved')){setText($('#rewardEyebrow'),'ЭВОЛЮЦИЯ ФИГУРЫ');setText($('#rewardTitle'),'Во что превратится основатель рода?');}
  }

  function sync(){ensureSetup();renderFounderCards();renderSchoolCards();updateSeal();decorateAchievements();}
  function scheduleSync(){if(frame||sealing)return;frame=requestAnimationFrame(()=>{frame=0;sync();});}
  function observeRoots(){
    observer?.disconnect();observer=new MutationObserver(scheduleSync);
    for(const id of ['setupDialog','menuHeraldry','playerAchievement','enemyAchievement','rewardGrid','endingAchievement']){const root=document.getElementById(id);if(root)observer.observe(root,{childList:true,subtree:true});}
  }

  function failSeal(message='Не удалось открыть совет перед полем'){
    clearTimeout(sealWatchdog);sealing=false;observeRoots();
    const dialog=$('#setupDialog'),button=$('#sealSetupButton');dialog?.classList.remove('is-sealing');
    if(button){button.disabled=false;setText(button.querySelector('span'),'Скрепить первый устав');setText(button.querySelector('small'),message);}
    updateSeal();
  }

  function stageSeal(event){
    const button=event.target.closest('#sealSetupButton');if(!button)return false;
    if(sealing)return false;
    if(!steps.every((_,index)=>isComplete(index))){event.preventDefault();event.stopImmediatePropagation();activeStep=firstIncomplete();updateSeal();return true;}
    event.preventDefault();event.stopImmediatePropagation();sealing=true;observer?.disconnect();
    const dialog=$('#setupDialog');dialog?.classList.add('is-sealing');button.disabled=true;
    setText(button.querySelector('span'),'Ставим печать…');setText(button.querySelector('small'),'Подготавливаем совет перед полем');
    sealWatchdog=setTimeout(()=>failSeal(),5000);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{
        button.disabled=false;button.click();
        setTimeout(()=>{clearTimeout(sealWatchdog);sealing=false;dialog?.classList.remove('is-sealing');observeRoots();},350);
      }catch(error){console.error('[БЛАЗОН] seal setup failed',error);failSeal();}
    }));
    return true;
  }

  installSymbols();sync();observeRoots();
  document.addEventListener('click',event=>{
    if(event.target.closest('#sealSetupButton')&&stageSeal(event))return;
    const go=event.target.closest('[data-setup-go]');if(go){activeStep=Number(go.dataset.setupGo);renderStep();return;}
    const founder=event.target.closest('[data-v5-founder]');const school=event.target.closest('[data-v5-school]');
    if(founder){globalThis.__blazonFounder=founder.dataset.v5Founder;renderFounderCards();updateSeal();advanceAfter(2);}
    if(school){globalThis.__blazonSchool=school.dataset.v5School;renderSchoolCards();updateSeal();}
    if(event.target.closest('#newButton')){globalThis.__blazonFounder=null;globalThis.__blazonSchool=null;activeStep=0;scheduleSync();}
    if(event.target.closest('[data-field]'))requestAnimationFrame(()=>{updateSeal();advanceAfter(0);});
    if(event.target.closest('[data-ordinary-choice]'))requestAnimationFrame(()=>{updateSeal();advanceAfter(1);});
  },true);
  window.addEventListener('pagehide',()=>{observer?.disconnect();if(frame)cancelAnimationFrame(frame);clearTimeout(sealWatchdog);},{once:true});
})();
