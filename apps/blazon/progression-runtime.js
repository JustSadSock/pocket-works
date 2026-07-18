(()=>{
  const founders=[
    {id:'lion',name:'Лев',copy:'Два ближайших отряда совместно уничтожают одну цель.'},
    {id:'boar',name:'Вепрь',copy:'Первый отряд использует физический пролом и идёт в глубину.'},
    {id:'tower',name:'Башня',copy:'Удержанная позиция становится точкой повторного сбора.'},
    {id:'stag',name:'Олень',copy:'Уступающий отряд отходит к союзнику и возвращается вместе с ним.'}
  ];
  const schools=[
    {id:'imperial',name:'Имперская',copy:'Осевая симметрия и властная центральная фигура.'},
    {id:'civic',name:'Городская',copy:'Строгая геометрия и ритм повторяющихся знаков.'},
    {id:'knightly',name:'Рыцарская',copy:'Крупная фигура и турнирный наклон.'},
    {id:'northern',name:'Северная',copy:'Узкий щит, пустоты и суровая вертикаль.'}
  ];
  const evolutionIds=new Set(['lion-bifurcated','lion-crowned','lion-regardant','boar-armed','boar-coupled','boar-blooded','tower-gate','tower-triple','tower-burning','stag-courant','stag-crowned','stag-regardant']);
  globalThis.__blazonFounder=null;globalThis.__blazonSchool=null;
  const $=selector=>document.querySelector(selector);
  function renderFounders(){const root=$('#mainChoices');if(!root)return;root.innerHTML=founders.map(item=>`<button type="button" class="doctrine-choice founder-choice${globalThis.__blazonFounder===item.id?' is-selected':''}" data-v5-founder="${item.id}"><i class="founder-mark"><svg viewBox="0 0 120 120"><use href="#charge-${item.id}"></use></svg></i><strong>${item.name}</strong><span>${item.copy}</span></button>`).join('');}
  function renderSchools(){const root=$('#schoolChoices');if(!root)return;root.innerHTML=schools.map(item=>`<button type="button" class="doctrine-choice school-choice${globalThis.__blazonSchool===item.id?' is-selected':''}" data-v5-school="${item.id}"><i class="school-shield school-shield-${item.id}"></i><strong>${item.name}</strong><span>${item.copy}</span></button>`).join('');}
  function syncSeal(){const button=$('#sealSetupButton');if(!button)return;button.disabled=!($('.field-grid .is-selected')&&$('.ordinary-grid .is-selected')&&globalThis.__blazonFounder&&globalThis.__blazonSchool);}
  function decorateAchievements(root=document){for(const svg of root.querySelectorAll?.('svg.achievement')||[]){const href=svg.querySelector('.charge-main use')?.getAttribute('href')?.replace('#charge-','')||'';const evolved=evolutionIds.has(href);svg.classList.toggle('is-evolved',evolved);for(const ornament of svg.querySelectorAll('.mantle,.mantle-lining,.civic-wreath,.mural-crown,.fur-edge'))ornament.style.display=evolved?'':'none';const motto=svg.querySelector('.motto-copy');if(motto&&motto.textContent.trim()==='—'){motto.style.display='none';const scroll=svg.querySelector('.motto-scroll');if(scroll)scroll.style.display='none';}}
    const evolvedReward=$('#rewardGrid svg.achievement.is-evolved');if(evolvedReward){const eyebrow=$('#rewardEyebrow'),title=$('#rewardTitle');if(eyebrow)eyebrow.textContent='ЭВОЛЮЦИЯ ФИГУРЫ';if(title)title.textContent='Во что превратится основатель рода?';}
  }
  document.addEventListener('click',event=>{const founder=event.target.closest('[data-v5-founder]'),school=event.target.closest('[data-v5-school]');if(founder){globalThis.__blazonFounder=founder.dataset.v5Founder;renderFounders();syncSeal();}if(school){globalThis.__blazonSchool=school.dataset.v5School;renderSchools();syncSeal();}if(event.target.closest('#newButton')){globalThis.__blazonFounder=null;globalThis.__blazonSchool=null;queueMicrotask(()=>{renderFounders();renderSchools();syncSeal();});}if(event.target.closest('[data-field],[data-ordinary-choice]'))queueMicrotask(syncSeal);});
  const observer=new MutationObserver(records=>{let setupChanged=false;for(const record of records)if(record.target.closest?.('#setupDialog')||record.target.id==='setupDialog')setupChanged=true;if(setupChanged){renderFounders();renderSchools();syncSeal();}decorateAchievements();});
  observer.observe(document.body,{childList:true,subtree:true});
  renderFounders();renderSchools();syncSeal();decorateAchievements();
  const footer=$('.menu-screen footer');if(footer)footer.textContent='v5.0 · armorial progression · растущий герб';
})();
