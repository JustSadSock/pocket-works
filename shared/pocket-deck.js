import { createDeckStateStore, DECK_WIDGET_KINDS } from './deck-state.js';
import { installDeckBatchPicker } from './deck-batch.js';

const $ = selector => document.querySelector(selector);
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeColor = value => /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : '#70818b';
const byRelease = (a,b) => String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')) || a.name.localeCompare(b.name);
const icon = (name) => ({
  play:'▶', star:'★', spark:'✳', random:'↝', tune:'☷', arrow:'↗', back:'←'
}[name] || name);
function formatAgo(timestamp) {
  if (!timestamp) return 'New discovery';
  const days=Math.floor((Date.now()-timestamp)/86400000);
  return days<1?'Recently opened':days===1?'Yesterday':days<30?`${days} days ago`:'From your collection';
}

export function installPocketDeck({
  getApps, getFavorites, getRecents, getSelected, onViewChanged,
  onOpen, onDetails, onFavorite, onBulkFavorite, onRefresh, onTools
}) {
  const home=$('#deck-home'), widgets=$('#deck-widgets'), editor=$('#deck-editor');
  const nav=$('#deck-bottom-nav'), panel=$('#detail-panel');
  const deckSearch=$('#deck-search-action'), homeCustomize=$('#deck-customize');
  const store=createDeckStateStore({onChange:()=>{render();onViewChanged?.();}});
  let covers=new Map();
  let modelSignature='';
  let pendingSeed=0;
  let editing=false;
  let editingLayout=null;
  let previewSignature='';
  let organizing=false;
  let chosen=new Set();
  let batchPicker=null;
  const GLOBAL_CACHE_KEY='pocket-works:global-archive-cache:v1';
  const validSlug=slug=>typeof slug==='string'&&/^[a-z0-9-]{1,96}$/.test(slug);
  let globalArchived=new Set(),globalPinned=new Set(),canManageGlobal=false,globalReady=false,globalBusy=false;
  let globalRevision=0,globalRequest=0,globalMessage='',pendingGlobalAction=null;
  try{
    const saved=JSON.parse(localStorage.getItem(GLOBAL_CACHE_KEY)||'null');
    if(Array.isArray(saved?.archived))globalArchived=new Set(saved.archived.filter(validSlug));
    if(Array.isArray(saved?.pinned))globalPinned=new Set(saved.pinned.filter(validSlug));
  }catch{/* The cache provides offline presentation only, never administrator authority. */}
  const current=()=>store.get();
  const isArchived=slug=>globalArchived.has(slug)||current().archived.includes(slug);
  const favoriteSet=()=>new Set(getFavorites());
  const available=()=>getApps().filter(app=>!isArchived(app.slug));
  const sorted=()=>available().sort(byRelease);
  const globallyPromoted=apps=>apps.sort((a,b)=>Number(globalPinned.has(b.slug))-Number(globalPinned.has(a.slug))||byRelease(a,b));
  const recent=()=>Object.entries(getRecents()).sort((a,b)=>b[1]-a[1]).map(([slug])=>available().find(app=>app.slug===slug)).filter(Boolean);
  const appBySlug=slug=>getApps().find(app=>app.slug===slug);
  const visibleTitle = {home:'Home',library:'Library',archive:'Archive'};
  const artMarkup=(app,extra='')=>{
    if(!app)return '<span class="deck-art deck-art--blank">✳</span>';
    const cover=covers.get(app.slug);
    const coverMarkup=cover ? `<img class="deck-art__photo" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : '';
    const pinMarkup=globalPinned.has(app.slug)?'<span class="deck-art__pin" aria-label="Pinned for everyone">PINNED</span>':'';
    return `<span class="deck-art ${extra}" style="--deck-ink:${safeColor(app.accent)}">
      ${coverMarkup}<img class="deck-art__icon" src="${escapeHtml(app.path)}icons/icon.svg?v=${encodeURIComponent(app.version||'0')}" alt="" loading="lazy" decoding="async">
      <span class="deck-art__index" aria-hidden="true">PW / ${escapeHtml(app.slug.slice(0,11).toUpperCase())}</span>${pinMarkup}
    </span>`;
  };
  const openTile=(app,style='small',caption='')=>{
    if(!app)return '';
    return `<article class="deck-tile deck-tile--${style}" data-slug="${escapeHtml(app.slug)}">
      <a class="deck-tile__launch" data-deck-open="${escapeHtml(app.slug)}" href="${escapeHtml(app.path)}" aria-label="Open ${escapeHtml(app.name)}">
        ${artMarkup(app)}<span class="deck-tile__caption"><strong>${escapeHtml(app.name)}</strong>${caption?`<small>${escapeHtml(caption)}</small>`:''}</span>
      </a>
      <button class="deck-tile__more" type="button" data-deck-details="${escapeHtml(app.slug)}" aria-label="Details for ${escapeHtml(app.name)}">•••</button>
    </article>`;
  };
  function widgetContent(widget){
    const favorites=favoriteSet();
    const apps=sorted();
    const selected=widget.kind==='spotlight'&&widget.slug?apps.find(app=>app.slug===widget.slug):null;
    if(widget.kind==='continue'){
      const app=recent()[0]||apps.find(a=>favorites.has(a.slug))||apps[0];
      return app?`<div class="deck-widget__heading"><span>CONTINUE</span><span class="deck-widget__counter">${formatAgo(getRecents()[app.slug])}</span></div>
        <div class="deck-hero">${openTile(app,'hero')}
          <span class="deck-hero__callout" aria-hidden="true"><b>▶</b> PLAY</span></div>`
        : emptyWidget('No projects yet','New creations will appear here.');
    }
    if(widget.kind==='spotlight'){
      const app=selected||apps[0];
      return `<div class="deck-widget__heading"><span>SPOTLIGHT</span></div>`+
        (app?openTile(app,widget.size==='half'?'small':'hero'):emptyWidget('Pick a project','Choose one in Customize.'));
    }
    if(widget.kind==='saved'){
      const matching=apps.filter(a=>favorites.has(a.slug));
      return `<div class="deck-widget__heading"><span>ON MY SHELF</span><span class="deck-widget__counter">${matching.length} kept</span></div>`+
        (matching.length?`<div class="deck-mini-grid">${matching.slice(0,widget.size==='half'?2:4).map(a=>openTile(a,'small')).join('')}</div>`
         :emptyWidget('Nothing saved yet','Open a project and mark it as a favorite.', 'library'));
    }
    if(widget.kind==='new'){
      return `<div class="deck-widget__heading"><span>JUST MADE</span></div>`+
        (apps.length?`<div class="deck-mini-grid">${apps.slice(0,widget.size==='half'?2:4).map(a=>openTile(a,'small')).join('')}</div>`
         :emptyWidget('No projects yet','New experiments will appear here.'));
    }
    if(widget.kind==='projects'){
      const filtered=apps.filter(a=>current().projectStages[a.slug]==='building');
      return `<div class="deck-widget__heading"><span>IN PROGRESS</span><span class="deck-widget__counter">${filtered.length} active</span></div>`+
        (filtered.length?`<div class="deck-project-list">${filtered.slice(0,5).map(a=>`<button type="button" data-deck-details="${escapeHtml(a.slug)}"><span>${escapeHtml(a.name)}</span><small>${escapeHtml(current().projectNotes[a.slug]||'Review project')}</small><i>↗</i></button>`).join('')}</div>`
         :emptyWidget('Your next great idea','Open project details and choose “Developing”.','library'));
    }
    if(widget.kind==='random'){
      const app=apps.length?apps[pendingSeed%apps.length]:null;
      return `<div class="deck-widget__heading"><span>REDISCOVER</span><button type="button" class="deck-widget__reroll" data-deck-reroll aria-label="Choose another project">↻ Another</button></div>`+
        (app?openTile(app,widget.size==='half'?'small':'hero'):emptyWidget('Nothing to rediscover','Your library is empty.'));
    }
    if(widget.kind==='collection'){
      const matching=apps.filter(a=>!widget.tag||(a.tags||[]).includes(widget.tag));
      return `<div class="deck-widget__heading"><span>${escapeHtml(widget.tag||'COLLECTION')}</span><span class="deck-widget__counter">${matching.length} works</span></div>`+
        (matching.length?`<div class="deck-mini-grid">${matching.slice(0,widget.size==='half'?2:4).map(a=>openTile(a,'small')).join('')}</div>`
         :emptyWidget('No matching projects','Change this widget’s collection tag.'));
    }
    return '';
  }
  function emptyWidget(title,copy,view=''){
    return `<div class="deck-widget__empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span>${view?`<button type="button" data-deck-view="${view}">Browse library →</button>`:''}</div>`;
  }
  const focus=$('#deck-focus');
  const accountButton=$('#deck-account-spotlight');
  const moreWidgets=$('#deck-widgets-toggle');
  let pendingSocial=0;
  function refreshHomeIdentity(){
    const identity=window.PocketID?.getUser?.();
    const isMember=Boolean(identity?.complete);
    const label=$('#deck-account-title'),subtitle=$('#deck-account-subtitle');
    const portrait=$('#deck-account-portrait'),dot=$('#deck-account-dot');
    accountButton.classList.toggle('is-member',isMember);
    label.textContent=isMember?identity.nickname:'Create Pocket ID';
    subtitle.textContent=isMember?(pendingSocial?pendingSocial+' new invites or requests':'Customize your player card'):'Your name and avatar in every game';
    accountButton.setAttribute('aria-label',isMember?(pendingSocial?'Open '+pendingSocial+' notifications':'Customize your player card'):'Create your Pocket ID');
    if(dot)dot.hidden=!pendingSocial||!isMember;
    const avatarMarkup=$('#pocket-id-trigger')?.querySelector('.pw-social-personal-avatar, .pw-id-nav-avatar, .pw-id-avatar');
    if(avatarMarkup){portrait.innerHTML=avatarMarkup.outerHTML;}
    else if(isMember){portrait.textContent=(identity.nickname||'?').slice(0,1).toUpperCase();}
    else portrait.textContent='◎';
  }
  function focusMarkup(){
    const apps=sorted(),fav=favoriteSet(),fresh=recent();
    const featured=fresh[0]||apps.find(app=>fav.has(app.slug))||apps[0];
    if(!featured)return '<div class="deck-home-blank"><strong>No games yet</strong><button type="button" data-deck-view="library">Open Library</button></div>';
    const pinned=apps.filter(app=>globalPinned.has(app.slug));
    const quick=[...new Map([...pinned,...fresh,...apps].filter(app=>app.slug!==featured.slug).map(app=>[app.slug,app])).values()].slice(0,6);
    return `<div class="deck-focus__featured"><a class="deck-focus__play" data-deck-open="${escapeHtml(featured.slug)}" href="${escapeHtml(featured.path)}" aria-label="Play ${escapeHtml(featured.name)}">
      ${artMarkup(featured)}<span class="deck-focus__hero-label"><span>CONTINUE PLAYING</span><strong>${escapeHtml(featured.name)}</strong></span>
      <span class="deck-focus__play-mark" aria-hidden="true">▶</span></a>
      <button type="button" class="deck-focus__info" data-deck-details="${escapeHtml(featured.slug)}" aria-label="Details for ${escapeHtml(featured.name)}">···</button></div>
      <div class="deck-focus__bottom"><div class="deck-focus__recent-title"><strong>${pinned.length?'Pinned · Quick play':'Quick play'}</strong><button type="button" data-deck-view="library">All games →</button></div>
      <div class="deck-focus__recent" role="list">${quick.map(app=>`<div class="deck-focus__quick" role="listitem">
        <a data-deck-open="${escapeHtml(app.slug)}" href="${escapeHtml(app.path)}" aria-label="Play ${escapeHtml(app.name)}">${artMarkup(app)}<span>${escapeHtml(app.name)}</span></a>
        <button type="button" data-deck-details="${escapeHtml(app.slug)}" aria-label="Details for ${escapeHtml(app.name)}">···</button></div>`).join('')}</div></div>`;
  }
  function renderHome(){
    const state=current();const apps=getApps();
    const signature=JSON.stringify({widgets:state.widgets,favs:getFavorites(),recents:getRecents(),
      apps:apps.map(a=>[a.slug,a.version,a.updatedAt,a.accent]),covers:[...covers],stages:state.projectStages,notes:state.projectNotes,archived:state.archived,globalRevision,seed:pendingSeed});
    refreshHomeIdentity();
    if(signature===modelSignature)return;
    modelSignature=signature;
    focus.innerHTML=focusMarkup();
    widgets.innerHTML=state.widgets.length?state.widgets.map(w=>`<section class="deck-widget deck-widget--${escapeHtml(w.size)}" data-widget-id="${escapeHtml(w.id)}">${widgetContent(w)}</section>`).join('')
      :`<div class="deck-home-blank"><strong>No games here yet</strong><button type="button" data-deck-edit>Add a widget</button></div>`;
    // A cached cover index can outlive an individual image. Restore the genuine
    // app icon when its screenshot is unavailable, including offline visits.
    for(const photo of widgets.querySelectorAll('.deck-art__photo')){
      photo.addEventListener('error',()=>photo.remove(),{once:true});
    }
  }
  function renderNavigation(){
    const state=current();
    document.documentElement.dataset.deckView=state.view;
    document.documentElement.dataset.deckDensity=state.density;
    home.hidden=state.view!=='home';
    if(state.view!=='home'&&home.classList.contains('deck-home--expanded')){
      home.classList.remove('deck-home--expanded');
      moreWidgets.setAttribute('aria-expanded','false');
      moreWidgets.innerHTML='More from my shelf <span aria-hidden="true">⌄</span>';
    }
    $('.deck-library-head').hidden=state.view==='home';
    $('.command-deck').hidden=state.view==='home';
    $('.shelf-workspace').hidden=state.view==='home';
    $('.shelf-footer').hidden=state.view!=='library';
    for(const button of nav.querySelectorAll('[data-deck-view]')){
      const active=button.dataset.deckView===state.view;
      button.setAttribute('aria-current',active?'page':'false');
    }
    $('#deck-view-title').textContent=visibleTitle[state.view];
    $('#deck-density-controls').hidden=state.view==='home';
    $('#deck-organize-start').hidden=state.view!=='library';
    if(state.view!=='library'){organizing=false;chosen.clear();}
    for(const button of document.querySelectorAll('button[data-deck-density]')){
      button.setAttribute('aria-pressed',String(button.dataset.deckDensity===state.density));
    }
  }
  function paintCovers(){
    for(const preview of document.querySelectorAll('.app-entry[data-slug] .app-preview, #detail-preview')){
      const slug=preview.closest('[data-slug]')?.dataset.slug || ($('#detail-open')?.dataset.slug);
      const cover=covers.get(slug);
      const existing=preview.querySelector(':scope > .deck-cover-photo');
      if(!cover){existing?.remove();preview.classList.remove('has-deck-cover');continue;}
      if(existing?.getAttribute('src')===cover)continue;
      existing?.remove();
      const image=document.createElement('img');image.className='deck-cover-photo';image.src=cover;image.alt='';image.loading='lazy';image.decoding='async';
      image.addEventListener('load',()=>preview.classList.add('has-deck-cover'),{once:true});
      image.addEventListener('error',()=>{preview.classList.remove('has-deck-cover');image.remove();},{once:true});
      preview.append(image);
    }
  }
  function renderOrganize(){
    const bar=$('#deck-organize-bar');
    bar.hidden=!organizing || current().view!=='library';
    $('#deck-organize-start').setAttribute('aria-pressed',String(organizing));
    $('#deck-organize-count').textContent=`${chosen.size} selected`;
    const action=bar.querySelector('[data-deck-organize-archive]');
    action.disabled=chosen.size===0;
    const globalAction=bar.querySelector('[data-deck-organize-global]');
    if(globalAction){
      globalAction.hidden=!canManageGlobal;
      globalAction.disabled=!globalReady||globalBusy||chosen.size===0;
    }
    for(const [selector, shouldPin] of [['[data-deck-organize-pin]',true],['[data-deck-organize-unpin]',false]]){
      const button=bar.querySelector(selector);
      if(!button)continue;
      button.hidden=!canManageGlobal;
      button.disabled=!globalReady||globalBusy||![...chosen].some(slug=>globalPinned.has(slug)!==shouldPin);
    }
    for(const card of document.querySelectorAll('#app-list .app-entry[data-slug]')){
      const selected=chosen.has(card.dataset.slug);
      card.classList.toggle('deck-is-chosen',selected);
      card.setAttribute('aria-selected',String(selected));
    }
  }
  function exitOrganize(){
    organizing=false;chosen.clear();renderOrganize();
  }
  function archiveChosen(){
    const selected=[...chosen].filter(slug=>appBySlug(slug));
    if(!selected.length)return;
    const state=current();
    const archived=[...new Set([...selected,...state.archived])];
    const projectStages={...state.projectStages};
    for(const slug of selected)projectStages[slug]='archive';
    exitOrganize();
    $('#deck-archive-confirm').close();
    store.update({archived,projectStages});
  }
  function adoptGlobalArchive(data){
    if(!data||!Array.isArray(data.archived)||data.archived.some(slug=>!validSlug(slug))||
       (data.pinned!==undefined&&(!Array.isArray(data.pinned)||data.pinned.some(slug=>!validSlug(slug)))))
      throw new Error('Invalid server library response');
    globalArchived=new Set(data.archived);
    globalPinned=new Set(data.pinned||[]);
    canManageGlobal=data.canManage===true;
    globalReady=true;
    globalRevision++;
    try{localStorage.setItem(GLOBAL_CACHE_KEY,JSON.stringify({archived:[...globalArchived],pinned:[...globalPinned],savedAt:Date.now()}));}catch{}
    render();
    onViewChanged?.();
  }
  async function refreshGlobalArchive(){
    const requestId=++globalRequest;
    try{
      const res=await fetch('/pocket-id/global-archive',{credentials:'same-origin',cache:'no-store'});
      if(!res.ok)throw new Error('Archive service unavailable');
      const payload=await res.json();
      if(requestId===globalRequest)adoptGlobalArchive(payload);
    }catch{
      if(requestId===globalRequest){
        canManageGlobal=false;
        globalReady=false;
        render();
      }
    }
  }
  function askGlobalAction(slugs,mode,enabled){
    if(!canManageGlobal||!globalReady||globalBusy)return;
    if(!['archive','pin'].includes(mode))return;
    slugs=[...new Set(slugs)].filter(slug=>appBySlug(slug));
    if(!slugs.length)return;
    pendingGlobalAction={slugs,mode,enabled};
    const count=`${slugs.length} game${slugs.length===1?'':'s'}`;
    const title=mode==='pin'?'Change global pins?':'Change the global archive?';
    $('#deck-global-confirm-title').textContent=title;
    $('#deck-global-confirm-description').textContent=mode==='pin'
      ? enabled
        ? `Pin ${count} for EVERY user? They will appear first in the library and Quick play.`
        : `Unpin ${count} for EVERY user? The games and personal favorites will be preserved.`
      : enabled
        ? `Move ${count} into the archive for EVERY user? Games and saves will not be deleted.`
        : `Restore ${count} to the main library for EVERY user?`;
    $('#deck-global-confirm-accept').textContent=mode==='pin'
      ? enabled?'Pin for everyone':'Unpin for everyone'
      : enabled?'Archive for everyone':'Restore for everyone';
    $('#deck-global-confirm').showModal();
  }
  const askGlobalArchive=(slugs,archived)=>askGlobalAction(slugs,'archive',archived);
  const askGlobalPin=(slugs,pinned)=>askGlobalAction(slugs,'pin',pinned);
  async function commitGlobalAction(){
    const action=pendingGlobalAction;
    pendingGlobalAction=null;
    $('#deck-global-confirm').close();
    if(!action||!globalReady||!canManageGlobal||globalBusy)return;
    globalBusy=true;
    // Ignore snapshots started before this write.
    globalRequest++;
    const pin=action.mode==='pin';
    globalMessage=pin?'Updating global pins…':'Updating the archive for everyone…';
    $('#deck-global-status').textContent=globalMessage;
    render();
    try{
      const res=await fetch(pin?'/pocket-id/global-pins':'/pocket-id/global-archive',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({slugs:action.slugs,...(pin?{pinned:action.enabled}:{archived:action.enabled})})
      });
      const payload=await res.json().catch(()=>null);
      if(!res.ok)throw Error(res.status===403?'Administrator access denied. Sign in again.':'Server could not save the change.');
      adoptGlobalArchive(payload);
      if(!pin&&action.enabled)exitOrganize();
      if(batchPicker?.isOpen())batchPicker.complete(pin
        ? action.enabled?'Игры закреплены для всех.':'Игры откреплены для всех.'
        : action.enabled?'Игры перенесены в общий архив.':'Игры возвращены в общую библиотеку.');
      globalMessage=pin
        ? action.enabled?'Pinned for everyone.':'Unpinned for everyone.'
        : action.enabled?'Moved to the global archive.':'Restored to the global library.';
    }catch(error){
      globalMessage=error.message||'Could not update global library.';
      if(batchPicker?.isOpen())batchPicker.report(globalMessage,'error');
      void refreshGlobalArchive();
    }finally{
      globalBusy=false;
      $('#deck-global-status').textContent=globalMessage;
      render();
      onViewChanged?.();
    }
  }
  function render(){
    renderNavigation();
    renderHome();
    paintCovers();
    renderProjectDetails();
    renderOrganize();
    batchPicker?.refresh();
  }
  function setView(view,{focus=false}={}){
    if(!['home','library','archive'].includes(view))return;
    store.update({view});
    if(view==='library'&&focus)$('#app-search')?.focus();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function stageOf(slug){return current().archived.includes(slug)?'archive':(current().projectStages[slug]||'trial');}
  function setStage(slug,stage){
    if(!appBySlug(slug)||!['trial','building','kept','archive'].includes(stage))return;
    const state=current(),archived=state.archived.filter(s=>s!==slug),stages={...state.projectStages,[slug]:stage};
    if(stage==='archive')archived.unshift(slug);
    store.update({archived,projectStages:stages});
    if(stage==='kept'&&!favoriteSet().has(slug))onFavorite(slug);
  }
  function renderProjectDetails(){
    const root=$('#deck-project-detail');if(!root)return;
    const slug=$('#detail-open')?.dataset.slug||'',app=appBySlug(slug);
    root.hidden=!app;
    if(!app)return;
    const state=current(),history=state.releaseHistory[slug]||[];
    // History begins when the user first inspects this project; previous releases
    // cannot be reconstructed from the current manifest without inventing records.
    if(app.version && !history.some(item=>item.version===app.version)){
      const entry={version:app.version,seenAt:Date.now(),note:(app.changelog||[])[0]||'Release observed'};
      store.update({releaseHistory:{...state.releaseHistory,[slug]:[entry,...history].slice(0,10)}});
      return;
    }
    const signature=[slug,stageOf(slug),globalArchived.has(slug),globalPinned.has(slug),canManageGlobal,globalBusy,history.map(h=>h.version).join('|')].join(':');
    if(root.dataset.signature===signature)return;
    // Stage and release-history updates must not erase a note being edited.
    // Only carry the draft within the same project; switching projects loads
    // that project's saved note.
    const note=root.dataset.slug===slug ? ($('#deck-project-note')?.value ?? state.projectNotes[slug] ?? '') : (state.projectNotes[slug]||'');
    root.dataset.slug=slug;
    root.dataset.signature=signature;
    root.innerHTML=`<div class="deck-project-detail__label">Project status</div>
      <div class="deck-project-detail__stages">
        ${[['trial','Trial'],['building','Developing'],['kept','Keep'],['archive','Archive']].map(([stage,label])=>`<button type="button" data-deck-stage="${stage}" aria-pressed="${stageOf(slug)===stage}">${label}</button>`).join('')}
      </div>
      ${globalArchived.has(slug)?'<p class="deck-global-note">In the archive for everyone. Personal labels do not override it.</p>':''}
      ${globalPinned.has(slug)?'<p class="deck-global-note">Pinned in the library for everyone.</p>':''}
      ${canManageGlobal?`<div class="deck-global-actions">
        <button type="button" class="deck-global-action" data-deck-global-pin="${escapeHtml(slug)}" ${globalBusy?'disabled':''}>${globalPinned.has(slug)?'Unpin for everyone':'Pin for everyone'}</button>
        <button type="button" class="deck-global-action" data-deck-global-archive="${escapeHtml(slug)}" ${globalBusy?'disabled':''}>${globalArchived.has(slug)?'Restore for everyone':'Archive for everyone'}</button>
      </div>`:''}
      <label class="deck-project-detail__note">Next improvement <textarea id="deck-project-note" rows="2" maxlength="750" placeholder="The one thing that would make this project worth returning to…">${escapeHtml(note)}</textarea></label>
      <button type="button" id="deck-note-save">Save project note</button>
      <span id="deck-note-feedback" role="status" aria-live="polite"></span>
      <div class="deck-project-detail__timeline">
        <strong>Version history</strong>
        
        <ol>${history.map(item=>`<li><b>v${escapeHtml(item.version)}</b><time>${new Date(item.seenAt||Date.now()).toLocaleDateString()}</time><span>${escapeHtml(item.note)}</span></li>`).join('')}</ol>
      </div>`;
  }
  async function loadCovers(){
    try{
      const response=await fetch('./covers/index.json',{cache:'no-cache'});
      if(!response.ok)return;
      const data=await response.json();
      if(!data||typeof data!=='object')return;
      covers=new Map(Object.entries(data).filter(([slug,url])=>/^[a-z0-9-]{1,96}$/.test(slug)&&typeof url==='string'&&/^\.\/covers\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(url)));
      render();
    }catch{/* App art falls back to each app's genuine icon. */}
  }
  function changeWidget(id,change){
    const state=editingLayout||current();
    state.widgets=state.widgets.map(w=>w.id===id?{...w,...change}:w);
    editingLayout=state;
    renderEditorRows();
  }
  function renderEditorRows(){
    const data=editingLayout||current();
    const apps=getApps();
    const tags=[...new Set(apps.flatMap(app=>app.tags||[]))].sort((a,b)=>a.localeCompare(b));
    $('#deck-editor-list').innerHTML=data.widgets.map((w,index)=>{
      const name=DECK_WIDGET_KINDS.find(item=>item.kind===w.kind)?.title||w.kind;
      const details=w.kind==='collection'?`<label>Filter by tag<select data-deck-widget-tag="${escapeHtml(w.id)}"><option value="">All tags</option>${tags.map(t=>`<option value="${escapeHtml(t)}" ${w.tag===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></label>`:
        w.kind==='spotlight'?`<label>Featured project<select data-deck-widget-slug="${escapeHtml(w.id)}">${apps.map(a=>`<option value="${escapeHtml(a.slug)}" ${w.slug===a.slug?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}</select></label>`:'';
      return `<div class="deck-editor-row" data-edit-id="${escapeHtml(w.id)}">
        <span class="deck-editor-row__handle" data-deck-drag aria-label="Drag to reorder" title="Hold and drag">⠿</span>
        <div class="deck-editor-row__body"><strong>${escapeHtml(name)}</strong><div>${details}</div></div>
        <div class="deck-editor-row__actions">
          <button type="button" data-deck-move="${escapeHtml(w.id)}" data-dir="-1" ${index===0?'disabled':''} aria-label="Move ${escapeHtml(name)} up">↑</button>
          <button type="button" data-deck-move="${escapeHtml(w.id)}" data-dir="1" ${index===data.widgets.length-1?'disabled':''} aria-label="Move ${escapeHtml(name)} down">↓</button>
          <button type="button" data-deck-size="${escapeHtml(w.id)}" aria-label="Change widget size">${w.size==='large'?'L':w.size==='wide'?'W':'½'}</button>
          <button type="button" data-deck-remove="${escapeHtml(w.id)}" aria-label="Remove ${escapeHtml(name)}">×</button>
        </div>
      </div>`;
    }).join('') || '<p class="deck-editor-empty">All widgets removed. Add one below.</p>';
  }
  function openEditor(){
    editingLayout=current();editing=true;renderEditorRows();
    if(!editor.open)editor.showModal();
  }
  function closeEditor(save){
    if(save&&editingLayout)store.save(editingLayout);
    editing=false;editingLayout=null;editor.close();
  }
  function addWidget(kind){
    if(!DECK_WIDGET_KINDS.some(w=>w.kind===kind))return;
    const data=editingLayout||current();if(data.widgets.length>=20)return;
    let id;do{id=`${kind}-${(++pendingSeed).toString(36)}`;}while(data.widgets.some(w=>w.id===id));
    data.widgets.push({id,kind,size:kind==='continue'?'large':'wide',tag:'',slug:getApps()[0]?.slug||''});
    editingLayout=data;renderEditorRows();
  }
  async function exportLayout(){
    const file=new Blob([JSON.stringify(store.exportBackup(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(file);const a=document.createElement('a');
    a.href=url;a.download='pocket-works-layout.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importLayout(file){
    try{
      const data=JSON.parse(await file.text());
      await store.importBackup(data);
      $('#deck-layout-status').textContent='Layout imported.';
      if(editor.open)closeEditor(false);
    }catch(error){$('#deck-layout-status').textContent=`Import failed: ${error.message}`;}
  }
  function onClick(event){
    if(event.target.closest('[data-deck-organize]')){
      organizing=!organizing;chosen.clear();
      const options=$('#library-options');
      if(options)options.open=false;
      renderOrganize();return;
    }
    if(event.target.closest('[data-deck-organize-cancel]')){exitOrganize();return;}
    if(event.target.closest('[data-deck-select-unsaved]')){
      const kept=favoriteSet(),stages=current().projectStages;
      chosen=new Set(available().filter(app=>!kept.has(app.slug)&&stages[app.slug]!=='kept').map(app=>app.slug));
      renderOrganize();return;
    }
    if(event.target.closest('[data-deck-organize-archive]')){
      if(!chosen.size)return;
      $('#deck-archive-summary').textContent=`Move ${chosen.size} selected projects into your archive? You can restore them any time. Apps, saves and source files are not deleted.`;
      $('#deck-archive-confirm').showModal();return;
    }
    if(event.target.closest('[data-deck-organize-global]')){
      askGlobalArchive([...chosen],true);return;
    }
    if(event.target.closest('[data-deck-organize-pin]')){askGlobalPin([...chosen].filter(slug=>!globalPinned.has(slug)),true);return;}
    if(event.target.closest('[data-deck-organize-unpin]')){askGlobalPin([...chosen].filter(slug=>globalPinned.has(slug)),false);return;}
    if(event.target.closest('[data-deck-global-archive]')){
      const slug=event.target.closest('[data-deck-global-archive]').dataset.deckGlobalArchive;
      askGlobalArchive([slug],!globalArchived.has(slug));return;
    }
    if(event.target.closest('[data-deck-global-pin]')){
      const slug=event.target.closest('[data-deck-global-pin]').dataset.deckGlobalPin;
      askGlobalPin([slug],!globalPinned.has(slug));return;
    }
    if(event.target.id==='deck-global-confirm-cancel'){
      pendingGlobalAction=null;$('#deck-global-confirm').close();return;
    }
    if(event.target.id==='deck-global-confirm-accept'){void commitGlobalAction();return;}
    if(event.target.id==='deck-archive-cancel'){$('#deck-archive-confirm').close();return;}
    if(event.target.id==='deck-archive-accept'){archiveChosen();return;}
    const open=event.target.closest('[data-deck-open]');
    if(open){onOpen(event,open.dataset.deckOpen,open);return;}
    const details=event.target.closest('[data-deck-details]');
    if(details){if(current().view==='home')setView('library');onDetails(details.dataset.deckDetails);return;}
    if(event.target.closest('[data-deck-search]')){setView('library',{focus:true});return;}
    if(event.target.closest('[data-deck-account]')){
      const member=Boolean(window.PocketID?.getUser?.()?.complete);
      if(member){if(typeof window.PocketSocial?.openEditor==='function')window.PocketSocial.openEditor();else window.PocketSocial?.open?.();}
      else window.PocketID?.openAccount?.()||$('#pocket-id-trigger')?.click();
      return;
    }
    if(event.target.closest('#deck-widgets-toggle')){
      const expanded=!home.classList.contains('deck-home--expanded');
      home.classList.toggle('deck-home--expanded',expanded);
      moreWidgets.setAttribute('aria-expanded',String(expanded));
      moreWidgets.innerHTML=expanded?'Back to games <span aria-hidden="true">↑</span>':'More from my shelf <span aria-hidden="true">⌄</span>';
      if(expanded)widgets.scrollTop=0;
      return;
    }
    const view=event.target.closest('button[data-deck-view], a[data-deck-view]');
    if(view){event.preventDefault();setView(view.dataset.deckView);return;}
    if(event.target.closest('[data-deck-edit]')){openEditor();return;}
    if(event.target.closest('[data-deck-reroll]')){pendingSeed++;modelSignature='';renderHome();return;}
    if(event.target.closest('[data-deck-tools]')){onTools();return;}
    if(event.target.closest('[data-deck-refresh]')){onRefresh();return;}
    const density=event.target.closest('button[data-deck-density]');
    if(density){store.update({density:density.dataset.deckDensity});return;}
    const action=event.target.closest('[data-deck-stage]');
    if(action){setStage($('#detail-open')?.dataset.slug,action.dataset.deckStage);return;}
    if(event.target.id==='deck-note-save'){
      const slug=$('#detail-open')?.dataset.slug,notes={...current().projectNotes};
      if(slug){notes[slug]=$('#deck-project-note').value.trim();store.update({projectNotes:notes});
        $('#deck-note-feedback').textContent='Saved on this device.';}
      return;
    }
    if(event.target.id==='deck-editor-save'){closeEditor(true);return;}
    if(event.target.id==='deck-editor-cancel'){closeEditor(false);return;}
    if(event.target.id==='deck-widget-add'){addWidget($('#deck-widget-picker').value);return;}
    if(event.target.id==='deck-layout-export'){exportLayout();return;}
    if(event.target.id==='deck-layout-import'){ $('#deck-layout-import-file').click();return;}
    const move=event.target.closest('[data-deck-move]');
    if(move){
      const w=editingLayout.widgets;const i=w.findIndex(x=>x.id===move.dataset.deckMove);
      const j=i+Number(move.dataset.dir);if(i>=0&&j>=0&&j<w.length){[w[i],w[j]]=[w[j],w[i]];renderEditorRows();}
      return;
    }
    const size=event.target.closest('[data-deck-size]');
    if(size){
      const widget=editingLayout.widgets.find(w=>w.id===size.dataset.deckSize);
      if(widget)changeWidget(widget.id,{size:widget.size==='half'?'wide':widget.size==='wide'?'large':'half'});
      return;
    }
    const remove=event.target.closest('[data-deck-remove]');
    if(remove){editingLayout.widgets=editingLayout.widgets.filter(w=>w.id!==remove.dataset.deckRemove);renderEditorRows();}
  }
  // Capture library card touches only while organizing; this prevents launching a
  // game when the user intends to select it for bulk archival.
  document.addEventListener('click',event=>{
    if(!organizing || current().view!=='library')return;
    const card=event.target.closest('#app-list .app-entry[data-slug]');
    if(!card)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const slug=card.dataset.slug;
    if(chosen.has(slug))chosen.delete(slug);else chosen.add(slug);
    renderOrganize();
  },true);
  // Critical editor actions are bound directly to their controls as well as
  // delegated through the shell. This keeps modal open/close dependable on
  // WebKit during touch-to-click retargeting and DOM reconciliation.
  for(const [selector,handler] of [
    ['#deck-customize',()=>openEditor()],
    ['#deck-editor-cancel',()=>closeEditor(false)],
    ['#deck-editor-save',()=>closeEditor(true)],
    ['#deck-search-action',()=>setView('library',{focus:true})]
  ]){
    $(selector)?.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      handler();
    });
  }
  document.addEventListener('click',onClick);
  $('#deck-archive-confirm').addEventListener('cancel',()=>{ /* closing by Escape is non-destructive */ });
  $('#deck-global-confirm').addEventListener('close',()=>{pendingGlobalAction=null;});
  editor.addEventListener('cancel',e=>{e.preventDefault();closeEditor(false);});
  editor.addEventListener('click',e=>{if(e.target===editor)closeEditor(false);});
  editor.addEventListener('change',e=>{
    if(e.target.matches('[data-deck-widget-tag]'))changeWidget(e.target.dataset.deckWidgetTag,{tag:e.target.value});
    if(e.target.matches('[data-deck-widget-slug]'))changeWidget(e.target.dataset.deckWidgetSlug,{slug:e.target.value});
  });
  $('#deck-layout-import-file').addEventListener('change',e=>{const file=e.target.files?.[0];if(file)void importLayout(file);e.target.value='';});
  // Pointer-controlled reorder, with keyboard-accessible up/down alternatives.
  let drag=null;
  const cancelDrag=()=>{
    if(!drag)return;
    drag.target.style.removeProperty('transform');
    drag.target.classList.remove('is-dragging');
    drag=null;
  };
  editor.addEventListener('close',cancelDrag);
  $('#deck-editor-list').addEventListener('pointerdown',e=>{
    const handle=e.target.closest('[data-deck-drag]');if(!handle)return;
    const row=handle.closest('[data-edit-id]');if(!row)return;
    drag={id:row.dataset.editId,startY:e.clientY,target:row,initial:e.clientY};handle.setPointerCapture?.(e.pointerId);
  });
  $('#deck-editor-list').addEventListener('pointermove',e=>{
    if(!drag)return;
    const distance=e.clientY-drag.startY;
    drag.target.style.transform=`translateY(${distance}px)`;
    drag.target.classList.add('is-dragging');
  });
  const releaseDrag=e=>{
    if(!drag)return;
    const row=drag.target;row.style.removeProperty('transform');row.classList.remove('is-dragging');
    const delta=e.clientY-drag.initial;
    if(Math.abs(delta)>24){
      const siblings=[...$('#deck-editor-list').querySelectorAll('[data-edit-id]')];
      const target=siblings.filter(x=>x!==row).find(x=>{const r=x.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom;});
      if(target){
        const w=editingLayout.widgets;const i=w.findIndex(x=>x.id===drag.id),j=w.findIndex(x=>x.id===target.dataset.editId);
        if(i>=0&&j>=0){const [item]=w.splice(i,1);w.splice(j,0,item);renderEditorRows();}
      }
    }
    drag=null;
  };
  $('#deck-editor-list').addEventListener('pointerup',releaseDrag);
  $('#deck-editor-list').addEventListener('pointercancel',cancelDrag);
  $('#deck-editor-list').addEventListener('lostpointercapture',cancelDrag);

  let holdTimer=0,holdXY=null;
  home.addEventListener('pointerdown',e=>{
    if(e.target.closest('button, input, a, select, textarea'))return;
    holdXY={x:e.clientX,y:e.clientY};
    window.clearTimeout(holdTimer);
    holdTimer=window.setTimeout(()=>{holdXY=null;openEditor();},580);
  });
  home.addEventListener('pointermove',e=>{
    if(holdXY&&Math.hypot(e.clientX-holdXY.x,e.clientY-holdXY.y)>9){
      window.clearTimeout(holdTimer);holdXY=null;
    }
  });
  for(const type of ['pointerup','pointercancel','pointerleave'])home.addEventListener(type,()=>{window.clearTimeout(holdTimer);holdXY=null;});

  window.addEventListener('storage',e=>{
    if(e.key!=='pocket-works:deck:v1'||!e.newValue)return;
    try{store.onStorage(JSON.parse(e.newValue));}catch{}
  });
  let returnView=null;
  try{returnView=sessionStorage.getItem('pocket-works:return-deck-view');}catch{}
  if(returnView&&['home','library','archive'].includes(returnView)){
    store.update({view:returnView});try{sessionStorage.removeItem('pocket-works:return-deck-view');}catch{}
  }
  document.addEventListener('pocket-id:changed',()=>{
    refreshHomeIdentity();
    canManageGlobal=false;globalReady=false;globalRequest++;
    render();
    void refreshGlobalArchive();
  });
  window.addEventListener('online',()=>void refreshGlobalArchive());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshGlobalArchive();});
  window.setInterval(()=>{if(!document.hidden)void refreshGlobalArchive();},90_000);
  document.addEventListener('pocket-social:portrait',refreshHomeIdentity);
  document.addEventListener('pocket-social:notifications',event=>{
    pendingSocial=Number(event.detail?.count)||0;
    refreshHomeIdentity();
  });
  batchPicker=installDeckBatchPicker({
    getApps, isArchived,
    isPersonalArchived:slug=>current().archived.includes(slug),
    isGlobalArchived:slug=>globalArchived.has(slug),
    isGlobalPinned:slug=>globalPinned.has(slug),
    getFavorites, canManageGlobal:()=>canManageGlobal&&globalReady,
    isGlobalBusy:()=>globalBusy, artwork:app=>artMarkup(app),
    onPersonalArchive:(slugs,archived)=>{
      const state=current(),set=new Set(state.archived),stages={...state.projectStages};
      for(const slug of slugs){
        if(!appBySlug(slug))continue;
        if(archived){set.add(slug);stages[slug]='archive';}
        else {
          set.delete(slug);
          if(stages[slug]==='archive')stages[slug]='trial';
        }
      }
      store.update({archived:[...set],projectStages:stages});
    },
    onGlobalArchive:(slugs,archived)=>askGlobalArchive(slugs,archived),
    onGlobalPin:(slugs,pinned)=>askGlobalPin(slugs,pinned),
    onFavorites:(slugs,save)=>{
      if(typeof onBulkFavorite==='function')onBulkFavorite(slugs,save);
      else for(const slug of slugs){if(favoriteSet().has(slug)!==save)onFavorite(slug);}
    }
  });
  render();document.documentElement.classList.add('has-pocket-deck');void store.hydrate();void loadCovers();void refreshGlobalArchive();
  return {
    store, getView:()=>current().view, getState:current, setView, isPinned:slug=>globalPinned.has(slug),
    getVisibleList:()=>{
      const state=current();
      return state.view==='archive'?getApps().filter(app=>isArchived(app.slug)):
        state.view==='library'?getApps().filter(app=>!isArchived(app.slug)):[];
    },
    refresh:render,
    showNew:slug=>{if(globalArchived.has(slug)){setView('archive');onDetails(slug);return;}if(current().archived.includes(slug))setStage(slug,'trial');setView('library');onDetails(slug);},
    setStage
  };
}
