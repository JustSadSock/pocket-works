// Illuminated manuscript navigator for CANTICA. No external images, fonts or libraries.
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const SIGILS=['✠','❦','✥','✧','✣','✦','✤','❖','✳','✺'];
const INITIALS=['П','К','П','Т','П','Р','С','К','З','П'];

export function createManuscript({
  levels,getUnlocked,getBest,getCurrent,onSelect,onDismiss,onPageTurn,reduceMotion=()=>false
}){
  const $=id=>document.getElementById(id);
  const host=$('manuscript');
  const sheet=$('codexPage');
  const content=$('codexContent');
  const heading=$('codexTitle');
  const subtitle=$('codexSubtitle');
  const eyebrow=$('codexEyebrow');
  const folioNumber=$('codexPageCount');
  const art=$('codexArt');
  const back=$('codexBack');
  const prev=$('codexPrev');
  const next=$('codexNext');
  const close=$('codexClose');
  const status=$('codexStatus');
  const announcer=$('codexAnnouncement');
  let mode='library',book=0,page=0,open=false,busy=false,revision=0,originalFocus=null;
  let down=null,previousHash='';

  const el=(name,cls,text)=>{
    const n=document.createElement(name);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=String(text);
    return n;
  };
  const safeFocus=target=>{try{target?.focus({preventScroll:true});}catch{}};
  const isUnlocked=i=>i<getUnlocked();
  const completed=i=>Boolean(getBest()[i])||i<getUnlocked()-1;
  const bookComplete=b=>{
    let count=0;
    for(let i=b*50;i<(b+1)*50;i++)if(completed(i))count++;
    return count;
  };
  function updateHeader(){
    const isLibrary=mode==='library';
    host.dataset.mode=mode;
    back.hidden=isLibrary;
    eyebrow.textContent=isLibrary?'CODEX LUMINIS · QUINGENTAE FENESTRAE':'LIBER '+ROMAN[book]+' · FOLIUM '+(page+1);
    heading.textContent=isLibrary?'Книга света':levels[book*50].book;
    subtitle.textContent=isLibrary?'Десять книг. Пятьсот окон. Один свет.':
      page===0?'Первая половина · окна '+(book*50+1)+'–'+(book*50+25):
        'Вторая половина · окна '+(book*50+26)+'–'+(book*50+50);
    art.textContent=isLibrary?'✣':SIGILS[book];
    art.dataset.sigil=String(book);
    status.textContent=isLibrary?Math.max(0,getUnlocked()-1)+' / 500 окон освещено':
      bookComplete(book)+' / 50 окон освещено';
    folioNumber.textContent=isLibrary?'CATALOGUS':ROMAN[book]+' · '+String(page+1)+' / II';
    prev.hidden=isLibrary;next.hidden=isLibrary;
    prev.disabled=page===0;
    next.disabled=page===1;
    prev.setAttribute('aria-label','Предыдущая страница');
    next.setAttribute('aria-label','Следующая страница');
  }
  function bookEntry(b){
    const unlocked=isUnlocked(b*50),count=bookComplete(b);
    const button=el('button','volume-entry'+(unlocked?'':' is-locked')+(getCurrent()>=b*50&&getCurrent()<b*50+50?' is-active':''));
    button.type='button';
    button.disabled=!unlocked;
    button.setAttribute('aria-label','Книга '+ROMAN[b]+': '+levels[b*50].book+(unlocked?', открыто '+count+' из 50':', запечатана'));
    const panel=el('span','volume-ornament');
    const illuminated=el('span','volume-initial',INITIALS[b]);
    const flourish=el('span','volume-sigil',SIGILS[b]);
    panel.append(illuminated,flourish);
    const text=el('span','volume-titles');
    text.append(el('span','volume-roman','LIBER '+ROMAN[b]),el('span','volume-name',levels[b*50].book));
    const progress=el('span','volume-progress',unlocked?count+' / 50':'ЗАПЕЧАТАНО');
    text.append(progress);
    button.append(panel,text);
    if(unlocked)button.addEventListener('click',()=>{onPageTurn?.();navigate('book',b,getCurrent()>=b*50&&getCurrent()<b*50+50&&getCurrent()%50>=25?1:0);});
    return button;
  }
  function windowEntry(i){
    const unlocked=isUnlocked(i);
    const lit=completed(i);
    const selected=i===getCurrent();
    const button=el('button','fenestra'+(!unlocked?' is-sealed':'')+(lit?' is-illuminated':'')+(selected?' is-current':''));
    button.type='button';
    button.disabled=!unlocked;
    const medallion=el('span','fenestra-glass');
    medallion.append(el('span','fenestra-number',String(i+1)));
    if(lit)medallion.append(el('span','fenestra-rayed','✦'));
    button.append(medallion);
    button.setAttribute('aria-label','Окно '+(i+1)+': '+levels[i].name+(selected?', текущее':lit?', завершено':unlocked?', доступно':', закрыто'));
    if(unlocked)button.addEventListener('click',()=>{
      if(busy)return;
      busy=true;
      const ticket=++revision;
      onPageTurn?.();
      host.classList.add('manuscript-depart');
      window.setTimeout(()=>{
        // A closed or superseded book can never launch a stale level.
        if(!open||ticket!==revision)return;
        onSelect(i);
        hide(true);
      },reduceMotion()?0:200);
    });
    return button;
  }
  function render(){
    updateHeader();
    content.replaceChildren();
    if(mode==='library'){
      const intro=el('div','catalogue-preface');
      intro.append(el('span','catalogue-crest','❦'),el('p','catalogue-verse','Всякий свет имеет начало. Каждое окно хранит свой путь.'));
      content.append(intro);
      const listing=el('div','volumes');
      for(let b=0;b<10;b++)listing.append(bookEntry(b));
      content.append(listing);
    }else{
      const annotation=el('div','folio-intro');
      annotation.append(el('span','folio-initial',INITIALS[book]),el('p','folio-annotation',
        'Лист '+(page===0?'первый':'второй')+'. Выбери медальон, чтобы вернуться к витражу.'));
      content.append(annotation);
      const grid=el('div','fenestra-grid');
      const start=book*50+page*25;
      for(let i=start;i<start+25;i++)grid.append(windowEntry(i));
      content.append(grid);
      const footer=el('p','folio-legend','✦ — окно озарено     ✧ — ждёт солнечного луча');
      content.append(footer);
    }
    announcer.textContent=(mode==='library'?'Каталог десяти книг':'Книга '+ROMAN[book]+', страница '+(page+1));
  }
  function navigate(nextMode=mode,nextBook=book,nextPage=page){
    if(busy)return;
    if(nextMode===mode&&nextBook===book&&nextPage===page)return;
    busy=true;const ticket=++revision;
    const forwards=nextMode==='book'&&mode==='book'?nextPage>page:true;
    sheet.dataset.turn=forwards?'forward':'back';
    sheet.classList.add('leaf-turning');
    window.setTimeout(()=>{
      if(ticket!==revision||!open)return;
      mode=nextMode;book=nextBook;page=nextPage;
      render();
      sheet.classList.remove('leaf-turning');
      sheet.classList.add('leaf-settling');
      window.setTimeout(()=>{if(ticket===revision){sheet.classList.remove('leaf-settling');busy=false;}},reduceMotion()?0:250);
    },reduceMotion()?0:170);
  }
  function show(options={}){
    const current=options.level??getCurrent();
    const b=Math.max(0,Math.min(9,Math.floor(current/50)));
    originalFocus=document.activeElement;
    ++revision;busy=false;mode=options.book===true?'book':'library';
    book=b;page=Math.floor((current%50)/25);
    host.hidden=false;host.setAttribute('aria-hidden','false');
    host.classList.remove('manuscript-depart');
    render();
    open=true;
    // Style begins closed, then unfolds like the covers of a prayer book.
    requestAnimationFrame(()=>{if(open)host.classList.add('is-open');});
    safeFocus(close);
  }
  function hide(immediate=false){
    if(!open)return;
    open=false;busy=false;++revision;
    host.classList.remove('is-open');
    const token=revision;
    window.setTimeout(()=>{
      if(open||token!==revision)return;
      host.hidden=true;host.setAttribute('aria-hidden','true');
      host.classList.remove('manuscript-depart');
      sheet.classList.remove('leaf-turning','leaf-settling');
      onDismiss?.();
      safeFocus(originalFocus);
    },immediate||reduceMotion()?0:270);
  }
  function isVisible(){return open;}
  function onEscape(event){
    if(!open)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();
      if(mode==='book')navigate('library',book,0);
      else hide();
      return;
    }
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      if(mode!=='book'||busy)return;
      if(event.target?.closest?.('.fenestra-grid'))return;
      const dest=event.key==='ArrowRight'?page+1:page-1;
      if(dest>=0&&dest<2){event.preventDefault();onPageTurn?.();navigate('book',book,dest);}
    }
    // The manuscript is modal: keyboard focus must not leak into the game.
    if(event.key==='Tab'){
      const controls=[...host.querySelectorAll('button:not(:disabled):not([hidden]), a[href]')].filter(n=>n.getClientRects().length);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();safeFocus(last);}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();safeFocus(first);}
    }
  }
  close.addEventListener('click',()=>hide());
  back.addEventListener('click',()=>{onPageTurn?.();navigate('library',book,0);});
  prev.addEventListener('click',()=>{if(page>0){onPageTurn?.();navigate('book',book,page-1);}});
  next.addEventListener('click',()=>{if(page<1){onPageTurn?.();navigate('book',book,page+1);}});
  host.addEventListener('keydown',onEscape);
  sheet.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;down={x:event.clientX,y:event.clientY};},{passive:true});
  sheet.addEventListener('pointerup',event=>{
    if(!down||mode!=='book'){down=null;return;}
    const dx=event.clientX-down.x,dy=event.clientY-down.y;down=null;
    if(Math.abs(dx)<65||Math.abs(dy)>Math.abs(dx)*.6)return;
    const nextPage=page+(dx<0?1:-1);
    if(nextPage>=0&&nextPage<=1){onPageTurn?.();navigate('book',book,nextPage);}
  },{passive:true});
  return {show,hide,isVisible,showBook:b=>show({book:true,level:b*50}),render};
}
