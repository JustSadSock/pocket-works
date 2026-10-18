import { installMobileRuntime } from '../../shared/mobile-runtime.js';
installMobileRuntime();
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
