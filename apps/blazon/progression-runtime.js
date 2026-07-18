(()=>{
  'use strict';
  const FLAG=Symbol.for('blazon.progression-runtime.v5.4.1');
  if(globalThis[FLAG]||typeof document==='undefined')return;
  globalThis[FLAG]=true;

  const $=selector=>document.querySelector(selector);
  const founders={
    lion:['Лев','Два ближайших отряда совместно уничтожают одну цель.'],
    boar:['Вепрь','Первый отряд использует пролом и идёт в глубину.'],
    tower:['Башня','Удержанная позиция становится точкой повторного сбора.'],
    stag:['Олень','Уступающий отряд отходит к союзнику и возвращается вместе с ним.']
  };
  const schools={
    imperial:['Имперская','Осевая симметрия и властная центральная фигура.'],
    civic:['Городская','Строгая геометрия и повторяющийся ритм.'],
    knightly:['Рыцарская','Крупная фигура и турнирный наклон.'],
    northern:['Северная','Узкий щит, пустоты и суровая вертикаль.']
  };
  const evolved=new Set([
    'lion-bifurcated','lion-crowned','lion-regardant',
    'boar-armed','boar-coupled','boar-blooded',
    'tower-gate','tower-triple','tower-burning',
    'stag-courant','stag-crowned','stag-regardant'
  ]);

  globalThis.__blazonFounder=null;
  globalThis.__blazonSchool=null;

  const style=document.createElement('link');
  style.rel='stylesheet';
  style.href='./armorial-progression.css?pw_release=5.4.1';
  document.head.append(style);

  function setText(node,value){
    if(node&&node.textContent!==value)node.textContent=value;
  }

  function ensureSetup(){
    const dialog=$('#setupDialog');
    const seal=$('#sealSetupButton');
    if(!dialog||!seal)return;

    setText(dialog.querySelector('h2'),'Задай поле, строй, основателя и школу');
    if(!$('#mainChoices')){
      const section=document.createElement('section');
      section.innerHTML='<h3>Основатель · инстинкт ратников с первого боя</h3><div class="choice-grid founder-grid" id="mainChoices"></div>';
      seal.before(section);
    }
    if(!$('#schoolChoices')){
      const section=document.createElement('section');
      section.innerHTML='<h3>Школа · только облик, не механика</h3><div class="choice-grid school-grid" id="schoolChoices"></div>';
      seal.before(section);
    }
    setText($('#ordinaryChoices')?.previousElementSibling,'Ординарий · геометрия строя');
    setText(seal.querySelector('span'),'Скрепить первый устав');
    setText(seal.querySelector('small'),'Все четыре решения обязательны');
  }

  function founderMarkup(id,name,copy,selected){
    return `<button type="button" class="doctrine-choice founder-choice${selected?' is-selected':''}" data-v5-founder="${id}"><i class="founder-mark"><svg viewBox="0 0 120 120"><use href="#charge-${id}"></use></svg></i><strong>${name}</strong><span>${copy}</span></button>`;
  }

  function schoolMarkup(id,name,copy,selected){
    return `<button type="button" class="doctrine-choice school-choice${selected?' is-selected':''}" data-v5-school="${id}"><i class="school-shield school-shield-${id}"></i><strong>${name}</strong><span>${copy}</span></button>`;
  }

  function renderFounderCards(){
    const root=$('#mainChoices');
    if(!root)return;
    const key=globalThis.__blazonFounder||'-';
    if(root.dataset.key===key&&root.children.length===4)return;
    root.dataset.key=key;
    root.innerHTML=Object.entries(founders).map(([id,[name,copy]])=>founderMarkup(id,name,copy,key===id)).join('');
  }

  function renderSchoolCards(){
    const root=$('#schoolChoices');
    if(!root)return;
    const key=globalThis.__blazonSchool||'-';
    if(root.dataset.key===key&&root.children.length===4)return;
    root.dataset.key=key;
    root.innerHTML=Object.entries(schools).map(([id,[name,copy]])=>schoolMarkup(id,name,copy,key===id)).join('');
  }

  function updateSeal(){
    const button=$('#sealSetupButton');
    if(button)button.disabled=!(
      $('.field-grid .is-selected')&&
      $('.ordinary-grid .is-selected')&&
      globalThis.__blazonFounder&&
      globalThis.__blazonSchool
    );
  }

  function installSymbols(){
    const defs=$('.symbol-library defs');
    if(!defs||$('#charge-lion-crowned'))return;
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');
    group.innerHTML=`<symbol id="charge-lion-bifurcated" viewBox="0 0 120 120"><use href="#charge-lion"/><path d="M43 48C20 42 8 29 12 10c12 5 23 13 28 26" fill="none" stroke="currentColor" stroke-width="7"/></symbol><symbol id="charge-lion-crowned" viewBox="0 0 120 120"><use href="#charge-lion"/><path d="m70 16 7-12 8 9 9-9 5 14-6 8H76Z" fill="currentColor"/></symbol><symbol id="charge-lion-regardant" viewBox="0 0 120 120"><g transform="translate(120) scale(-1 1)"><use href="#charge-lion"/></g></symbol><symbol id="charge-boar-armed" viewBox="0 0 120 120"><use href="#charge-boar"/><path d="M95 64c10 8 18 6 23-3-2 15-13 23-27 17" fill="none" stroke="currentColor" stroke-width="6"/></symbol><symbol id="charge-boar-coupled" viewBox="0 0 120 120"><g transform="translate(-9 8) scale(.82)"><use href="#charge-boar"/></g><g transform="translate(53 40) scale(.48)"><use href="#charge-boar"/></g></symbol><symbol id="charge-boar-blooded" viewBox="0 0 120 120"><use href="#charge-boar"/><path d="M42 29 69 96M57 22l25 62" stroke="var(--detail,#1c1814)" stroke-width="6"/></symbol><symbol id="charge-tower-gate" viewBox="0 0 120 120"><use href="#charge-tower"/><path d="M47 107V76c0-17 26-17 26 0v31" fill="none" stroke="var(--detail,#1c1814)" stroke-width="8"/></symbol><symbol id="charge-tower-triple" viewBox="0 0 120 120"><g transform="translate(2 42) scale(.48)"><use href="#charge-tower"/></g><g transform="translate(34 5) scale(.48)"><use href="#charge-tower"/></g><g transform="translate(66 42) scale(.48)"><use href="#charge-tower"/></g></symbol><symbol id="charge-tower-burning" viewBox="0 0 120 120"><use href="#charge-tower"/><path d="M30 36c-11-17 5-24 1-35 16 10 18 21 11 35m21-3C53 16 69 10 67 0c16 12 16 23 8 36m18 0C82 20 98 14 95 3c17 12 16 24 8 35" fill="currentColor"/></symbol><symbol id="charge-stag-courant" viewBox="0 0 120 120"><g transform="translate(0 8) rotate(-7 60 60)"><use href="#charge-stag"/></g><path d="M18 104h34m9 7h42" stroke="currentColor" stroke-width="5"/></symbol><symbol id="charge-stag-crowned" viewBox="0 0 120 120"><use href="#charge-stag"/><path d="m76 37 6-12 8 8 8-9 5 14-6 7H82Z" fill="currentColor"/></symbol><symbol id="charge-stag-regardant" viewBox="0 0 120 120"><g transform="translate(120) scale(-1 1)"><use href="#charge-stag"/></g></symbol>`;
    while(group.firstChild)defs.append(group.firstChild);
  }

  function setDisplay(node,visible){
    if(!node)return;
    const value=visible?'':'none';
    if(node.style.display!==value)node.style.display=value;
  }

  function decorateAchievements(){
    for(const svg of document.querySelectorAll('svg.achievement')){
      const id=svg.querySelector('.charge-main use')?.getAttribute('href')?.replace('#charge-','');
      const complete=evolved.has(id);
      svg.classList.toggle('is-evolved',complete);
      for(const node of svg.querySelectorAll('.mantle,.mantle-lining,.civic-wreath,.mural-crown,.fur-edge'))setDisplay(node,complete);
      const motto=svg.querySelector('.motto-copy');
      const hasMotto=Boolean(motto&&motto.textContent.trim()!=='—');
      setDisplay(motto,hasMotto);
      setDisplay(svg.querySelector('.motto-scroll'),hasMotto);
    }
    if($('#rewardGrid svg.is-evolved')){
      setText($('#rewardEyebrow'),'ЭВОЛЮЦИЯ ФИГУРЫ');
      setText($('#rewardTitle'),'Во что превратится основатель рода?');
    }
  }

  let frame=0;
  function scheduleSync(){
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      ensureSetup();
      renderFounderCards();
      renderSchoolCards();
      updateSeal();
      decorateAchievements();
    });
  }

  installSymbols();
  scheduleSync();

  const observer=new MutationObserver(scheduleSync);
  for(const id of ['setupDialog','menuHeraldry','playerAchievement','enemyAchievement','rewardGrid','endingAchievement']){
    const root=document.getElementById(id);
    if(root)observer.observe(root,{childList:true,subtree:true});
  }

  document.addEventListener('click',event=>{
    const founder=event.target.closest('[data-v5-founder]');
    const school=event.target.closest('[data-v5-school]');
    if(founder){
      globalThis.__blazonFounder=founder.dataset.v5Founder;
      renderFounderCards();
      updateSeal();
    }
    if(school){
      globalThis.__blazonSchool=school.dataset.v5School;
      renderSchoolCards();
      updateSeal();
    }
    if(event.target.closest('#newButton')){
      globalThis.__blazonFounder=null;
      globalThis.__blazonSchool=null;
      scheduleSync();
    }
    if(event.target.closest('#sealSetupButton')&&(!globalThis.__blazonFounder||!globalThis.__blazonSchool)){
      event.preventDefault();
      event.stopImmediatePropagation();
      updateSeal();
    }
    if(event.target.closest('[data-field],[data-ordinary-choice]'))requestAnimationFrame(updateSeal);
  },true);

  window.addEventListener('pagehide',()=>{
    observer.disconnect();
    if(frame)cancelAnimationFrame(frame);
  },{once:true});
})();
