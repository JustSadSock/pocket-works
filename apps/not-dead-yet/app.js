import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import {createWorkshopMode} from '../../shared/workshop-mode.js';
installMobileRuntime();
// Secondary diagnostics are opened only from menu or pause screens.
createWorkshopMode({
 appName:'NOT DEAD YET',version:'2.2.3',
 cachePrefix: 'not-dead-yet-',storageNamespace: 'pocket-works:not-dead-yet'
});
const chapter=new URLSearchParams(location.search).has('chapter');
if(chapter){
 document.title='NOT DEAD YET — Квартира №17';
 const progress=document.querySelector('.top-progress span:last-child');
 if(progress)progress.textContent='ВОСПОМИНАНИЯ';
 const inventory=document.getElementById('pack');
 if(inventory)inventory.firstChild.textContent='Вещи ';
 const title=document.querySelector('#menu .eyebrow');
 if(title)title.textContent='ГЛАВА I / КВАРТИРА №17';
 const intro=document.querySelector('#menu .intro');
 if(intro)intro.textContent='Найди четыре знакомые вещи и открой входную дверь.';
 const play=document.getElementById('start');
 if(play)play.firstChild.textContent='Начать сюжетную главу ';
 const old=document.querySelector('.chapter-link');
 if(old){old.textContent='Вернуться к бесконечному режиму';old.href='./'}
}
import(chapter?'./app.mjs':'./rogue-app.mjs').catch(error => {
  console.error('NOT DEAD YET failed to initialize', error);
  const fatal = document.getElementById('fatal');
  if (fatal) fatal.hidden = false;
});
