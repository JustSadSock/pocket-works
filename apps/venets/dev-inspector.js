// Design-time viewport inspector. All routes are rendered by the real Venets
// application in a separate iframe with self-contained synthetic campaign data.
// It never receives, reads or writes the player's ongoing saved campaign.
export const INSPECTOR_SCREENS = Object.freeze([
  {id:'menu',name:'Главное меню',group:'Основные'},
  {id:'menu-resume',name:'Меню · продолжить',group:'Основные'},
  {id:'council',name:'Совет · решения',group:'Основные'},
  {id:'lands',name:'Атлас · владения',group:'Основные'},
  {id:'genealogy',name:'Родословная',group:'Основные'},
  {id:'war',name:'Военный поход',group:'Основные'},
  {id:'history',name:'Летопись',group:'Основные'},
  {id:'ending',name:'Завершение главы',group:'Основные'},
  {id:'docs',name:'Исследования',group:'Основные'},
  {id:'confirm',name:'Подтверждение приказа',group:'Состояния'},
  {id:'decision',name:'Результат приказа',group:'Состояния'},
  {id:'notice',name:'Уведомление',group:'Состояния'},
  {id:'restart',name:'Новая кампания',group:'Состояния'},
  {id:'invalid-seed',name:'Некорректный мир',group:'Состояния'},
  {id:'loading',name:'Загрузка',group:'Состояния'}
]);
const VIEWPORTS={
  phone:{name:'Телефон',width:390,height:844},
  desktop:{name:'ПК',width:1366,height:768}
};

export function installUIInspector(){
  if(typeof window==='undefined' || new URLSearchParams(location.search).has('venets-preview'))return;
  let opened=false,selected='council',device='phone',overlay=null,frame=null,stage=null,wrap=null,resize=null;
  let status=null,selectedLabel=null;

  function fit(){
    if(!opened||!stage||!wrap||!frame)return;
    const {width,height}=VIEWPORTS[device];
    const w=Math.max(1,stage.clientWidth-30);
    const h=Math.max(1,stage.clientHeight-30);
    const scale=Math.min(1,w/width,h/height);
    wrap.style.width=Math.round(width*scale)+'px';
    wrap.style.height=Math.round(height*scale)+'px';
    frame.style.width=width+'px';
    frame.style.height=height+'px';
    frame.style.transform='scale('+scale+')';
    frame.style.transformOrigin='top left';
    const label=overlay.querySelector('[data-inspector-size]');
    if(label)label.textContent=width+' × '+height+' · '+Math.round(scale*100)+'%';
  }
  function preview(){
    if(!opened||!frame)return;
    const item=INSPECTOR_SCREENS.find(x=>x.id===selected);
    selectedLabel.textContent=item.name;
    status.textContent='Открываем предпросмотр…';
    frame.title='Изолированный предпросмотр: '+item.name;
    const url=new URL('./index.html',location.href);
    url.search='';
    url.hash='';
    url.searchParams.set('venets-preview',selected);
    frame.src=url.href;
    for(const button of overlay.querySelectorAll('[data-inspector-screen]')){
      const on=button.dataset.inspectorScreen===selected;
      button.classList.toggle('selected',on);
      button.setAttribute('aria-current',on?'true':'false');
    }
  }
  function setDevice(next){
    device=next;
    for(const button of overlay.querySelectorAll('[data-inspector-device]')){
      const active=button.dataset.inspectorDevice===device;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    }
    fit();
  }
  function close(){
    if(!opened)return;
    opened=false;
    resize?.disconnect();resize=null;
    // Destroy iframe: simulation timers and test-world state cannot linger.
    overlay?.remove();overlay=null;frame=null;stage=null;wrap=null;
    status=null;selectedLabel=null;
  }
  function open(){
    if(opened)return;
    opened=true;
    overlay=document.createElement('div');
    overlay.className='venets-dev-inspector';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Инспектор интерфейсов');
    const nav=document.createElement('aside');
    nav.className='venets-dev-nav';
    const top=document.createElement('div');top.className='venets-dev-heading';
    const head=document.createElement('div');
    const title=document.createElement('strong');title.textContent='Инспектор';
    const hint=document.createElement('small');hint.textContent='Экраны Венца · Backquote';
    head.append(title,hint);
    const x=document.createElement('button');x.type='button';x.textContent='×';
    x.className='venets-dev-dismiss';x.setAttribute('aria-label','Закрыть инспектор');
    x.addEventListener('click',close);top.append(head,x);nav.append(top);
    const list=document.createElement('div');list.className='venets-dev-list';
    let last=null;
    for(const item of INSPECTOR_SCREENS){
      if(item.group!==last){
        const group=document.createElement('p');group.className='venets-dev-group';
        group.textContent=item.group;list.append(group);last=item.group;
      }
      const button=document.createElement('button');button.type='button';
      button.textContent=item.name;button.dataset.inspectorScreen=item.id;
      button.addEventListener('click',()=>{selected=item.id;preview()});
      list.append(button);
    }
    const note=document.createElement('p');note.className='venets-dev-note';
    note.textContent='Тестовый мир 413. Ваша партия не изменяется.';
    nav.append(list,note);

    const previewPanel=document.createElement('section');
    previewPanel.className='venets-dev-preview';
    const bar=document.createElement('header');bar.className='venets-dev-bar';
    const left=document.createElement('div');left.className='venets-dev-current';
    selectedLabel=document.createElement('strong');selectedLabel.textContent='Совет';
    status=document.createElement('small');status.setAttribute('role','status');
    left.append(selectedLabel,status);
    const controls=document.createElement('div');controls.className='venets-dev-controls';
    for(const [name,label] of [['phone','Телефон'],['desktop','ПК']]){
      const button=document.createElement('button');button.type='button';
      button.textContent=label;button.dataset.inspectorDevice=name;
      button.addEventListener('click',()=>setDevice(name));controls.append(button);
    }
    const refresh=document.createElement('button');refresh.type='button';
    refresh.textContent='↻';refresh.title='Перезапустить тестовый экран';
    refresh.setAttribute('aria-label','Обновить предпросмотр');
    refresh.addEventListener('click',preview);controls.append(refresh);
    bar.append(left,controls);
    stage=document.createElement('div');stage.className='venets-dev-stage';
    wrap=document.createElement('div');wrap.className='venets-dev-frame-wrap';
    frame=document.createElement('iframe');
    frame.className='venets-dev-frame';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');
    frame.setAttribute('referrerpolicy','same-origin');
    frame.setAttribute('loading','eager');
    frame.addEventListener('load',()=>{if(opened&&status)status.textContent='Изолированная копия';});
    wrap.append(frame);stage.append(wrap);
    const foot=document.createElement('footer');foot.className='venets-dev-footer';
    const info=document.createElement('span');info.dataset.inspectorSize='';
    const closeText=document.createElement('span');closeText.textContent='Esc или клавиша слева от 1 — закрыть';
    foot.append(info,closeText);
    previewPanel.append(bar,stage,foot);
    overlay.append(nav,previewPanel);
    document.body.append(overlay);
    resize=new ResizeObserver(fit);
    resize.observe(stage);
    setDevice(device);preview();
    x.focus({preventScroll:true});
  }
  function toggle(){opened?close():open();}
  window.addEventListener('keydown',event=>{
    if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.code==='Backquote'&&!event.repeat){
      event.preventDefault();event.stopPropagation();toggle();
    }else if(event.key==='Escape'&&opened){
      // Let an actual native dialog in the preview window consume its own Esc.
      event.preventDefault();event.stopPropagation();close();
    }
  },true);
  window.addEventListener('message',event=>{
    if(!opened||event.origin!==location.origin||event.source!==frame?.contentWindow)return;
    if(event.data?.type==='venets-inspector-toggle')toggle();
  });
}
