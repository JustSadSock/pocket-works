// Client-only test inspector. Each screen is rendered by the actual app in an isolated iframe.
export const PREVIEW_PARAM='chyepukha-preview';
export const SCREENS=[
 ['home','Початок','Головний екран · гість'],
 ['home-member','Початок','Головний екран · Pocket ID'],
 ['invite','Початок','Запрошення в кімнату'],
 ['error','Початок','Помилка входу'],
 ['connecting','Початок','Підключення'],
 ['lobby-host','Кімната','Ведучий · налаштування'],
 ['lobby-guest','Кімната','Гість · очікування'],
 ['lobby-ready','Кімната','Два учасники · старт'],
 ['lobby-custom','Кімната','Власні питання і жанр'],
 ['writing-first','Написання','Перший фрагмент'],
 ['writing-tail','Написання','Продовження з підказкою'],
 ['writing-selection','Написання','Вибрані слова'],
 ['writing-zero','Написання','Без передачі слів'],
 ['waiting','Партія','Очікування інших'],
 ['offline','Партія','З’єднання втрачено'],
 ['leave','Партія','Підтвердження виходу'],
 ['results','Фінал','Всі історії'],
 ['results-second','Фінал','Друга історія'],
 ['comic','Фінал','Готовий комікс'],
 ['archive','Архів','Збережені рукописи'],
 ['archive-empty','Архів','Порожня полиця'],
 ['archive-delete','Архів','Підтвердження видалення']
].map(([id,group,name])=>({id,group,name}));
export const isPreviewId=id=>SCREENS.some(x=>x.id===id);
export function installScreenInspector(){
 if(new URLSearchParams(location.search).has(PREVIEW_PARAM))return;
 let overlay=null,frame=null,stage=null,wrap=null,observer=null,active='home';
 let device=matchMedia('(max-width:760px)').matches?'phone':'desktop';
 const sizes={phone:[390,844],desktop:[1366,768]};
 const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e};
 function fit(){
  if(!overlay||!frame||!stage)return;
  const [w,h]=sizes[device];
  const s=Math.min(1,Math.max(1,stage.clientWidth-20)/w,Math.max(1,stage.clientHeight-20)/h);
  wrap.style.width=Math.round(w*s)+'px';wrap.style.height=Math.round(h*s)+'px';
  frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform='scale('+s+')';
  overlay.querySelector('[data-size]').textContent=w+' × '+h+' · '+Math.round(s*100)+'%';
 }
 function choose(id){
  if(!isPreviewId(id))return;
  active=id;
  overlay.querySelector('[data-current]').textContent=SCREENS.find(x=>x.id===id).name;
  overlay.querySelectorAll('[data-screen]').forEach(b=>{
   const on=b.dataset.screen===id;b.classList.toggle('selected',on);b.setAttribute('aria-current',on?'page':'false');
  });
  const url=new URL('./index.html',location.href);
  url.search='';url.hash='';url.searchParams.set(PREVIEW_PARAM,id);
  overlay.classList.add('loading');
  frame.title='Ізольований перегляд: '+SCREENS.find(x=>x.id===id).name;frame.src=url.href;
 }
 function setDevice(id){
  if(!sizes[id]||!overlay)return;device=id;
  overlay.querySelectorAll('[data-device]').forEach(b=>{
   const on=b.dataset.device===id;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));
  });fit();
 }
 function close(){
  if(!overlay)return;
  observer?.disconnect();observer=null;window.removeEventListener('resize',fit);
  frame.src='about:blank';overlay.remove();overlay=null;frame=null;stage=null;wrap=null;
 }
 function open(){
  if(overlay)return;
  overlay=make('section','chy-qa');overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Інспектор ігрових екранів');
  const side=make('aside','chy-qa-side'),head=make('header','chy-qa-head');
  const title=make('div');title.append(make('small','','ЧЕПУХА · QA'),make('strong','','Тестове меню'));
  const x=make('button','chy-qa-close','×');x.type='button';x.title='Закрити · Esc';x.addEventListener('click',close);
  head.append(title,x);
  const modes=make('div','chy-qa-modes');
  for(const [id,label] of [['phone','Телефон'],['desktop','ПК']]){
   const b=make('button','',label);b.type='button';b.dataset.device=id;b.addEventListener('click',()=>setDevice(id));modes.append(b);
  }
  const shrink=make('button','','Згорнути');shrink.type='button';
  shrink.addEventListener('click',()=>{overlay.classList.add('collapsed');fit()});modes.append(shrink);
  const list=make('nav','chy-qa-list');let group='';
  for(const entry of SCREENS){
   if(entry.group!==group){group=entry.group;list.append(make('p','chy-qa-group',group))}
   const b=make('button','',entry.name);b.type='button';b.dataset.screen=entry.id;
   b.addEventListener('click',()=>{
    choose(entry.id);
    if(innerWidth<=760){overlay.classList.add('collapsed');fit()}
   });list.append(b);
  }
  side.append(head,modes,list,make('p','chy-qa-note','Вигадані автори. Реальна кімната не змінюється.'));
  const main=make('div','chy-qa-main'),bar=make('header','chy-qa-bar');
  const label=make('strong');label.dataset.current='';
  const reload=make('button','','↻');reload.type='button';reload.title='Оновити тестовий екран';reload.addEventListener('click',()=>choose(active));
  bar.append(label,reload);
  stage=make('div','chy-qa-stage');wrap=make('div','chy-qa-wrap');
  frame=make('iframe','chy-qa-frame');
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-downloads');
  frame.setAttribute('referrerpolicy','same-origin');
  frame.addEventListener('load',()=>overlay?.classList.remove('loading'));
  wrap.append(frame);stage.append(wrap);
  const footer=make('footer','chy-qa-footer'),size=make('span');size.dataset.size='';
  footer.append(size,make('span','','Esc або клавіша ліворуч від 1 — закрити'));
  main.append(bar,stage,footer);
  const expand=make('button','chy-qa-expand','Екрани ☰');expand.type='button';
  expand.addEventListener('click',()=>{overlay.classList.remove('collapsed');fit()});
  overlay.append(side,main,expand);document.body.append(overlay);
  window.addEventListener('resize',fit);
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(fit);observer.observe(stage)}
  setDevice(device);choose(active);fit();x.focus({preventScroll:true});
 }
 function toggle(){overlay?close():open()}
 window.addEventListener('keydown',e=>{
  if(e.isComposing||e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.code==='Backquote'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();toggle()}
  else if(e.key==='Escape'&&overlay){e.preventDefault();e.stopImmediatePropagation();close()}
 },true);
 window.addEventListener('message',e=>{
  if(overlay&&e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='chyepukha-qa-toggle')toggle();
 });
}
