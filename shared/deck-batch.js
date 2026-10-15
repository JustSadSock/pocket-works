// Pocket Deck multi-select catalogue. Independent from the launcher Home scroll.
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const MAX_SELECTION = 100;

export function installDeckBatchPicker({
  getApps, isArchived, isPersonalArchived, isGlobalArchived, isGlobalPinned, getFavorites,
  canManageGlobal, isGlobalBusy, artwork, onPersonalArchive, onGlobalArchive, onGlobalPin, onFavorites
}) {
  const dialog = $('#deck-batch-picker');
  const grid = $('#deck-batch-grid');
  const search = $('#deck-batch-search');
  const count = $('#deck-batch-count');
  const status = $('#deck-batch-status');
  const confirm = $('#deck-batch-personal-confirm');
  const controls = {
    personal: $('#deck-batch-personal'),
    global: $('#deck-batch-global'),
    pin: $('#deck-batch-pin'),
    unpin: $('#deck-batch-unpin'),
    save: $('#deck-batch-save'),
    unsave: $('#deck-batch-unsave')
  };
  let selected = new Set(), view = 'active', pending = null, lastSignature = '';

  function visible() {
    const query = search.value.trim().toLocaleLowerCase();
    return getApps()
      .filter(app => isArchived(app.slug) === (view === 'archive'))
      .filter(app => !query || (app.name + ' ' + app.slug + ' ' + (app.tags || []).join(' ')).toLocaleLowerCase().includes(query))
      .sort((a,b) => Number(isGlobalPinned(b.slug))-Number(isGlobalPinned(a.slug))||
        String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')) || a.name.localeCompare(b.name));
  }
  const chosen = () => [...selected].filter(slug => Boolean(getApps().find(app => app.slug === slug)));
  function report(text, kind='info') {
    status.textContent = text;
    status.dataset.kind = kind;
  }
  function renderControls() {
    const slugs = chosen();
    const favorites = new Set(getFavorites());
    count.textContent = slugs.length + ' выбрано';
    for(const tab of dialog.querySelectorAll('[data-batch-tab]'))
      tab.setAttribute('aria-pressed', String(tab.dataset.batchTab === view));
    const active = slugs.length > 0;
    controls.personal.textContent = view === 'archive' ? 'Вернуть себе' : 'В личный архив';
    controls.personal.disabled = !active || (view === 'archive' && !slugs.some(isPersonalArchived));
    controls.global.textContent = view === 'archive' ? 'Вернуть всем' : 'В общий архив';
    controls.global.hidden = !canManageGlobal();
    controls.global.disabled = !active || isGlobalBusy() || (view === 'archive' && !slugs.some(isGlobalArchived));
    controls.pin.hidden = controls.unpin.hidden = !canManageGlobal();
    controls.pin.disabled = !active || isGlobalBusy() || !slugs.some(slug=>!isGlobalPinned(slug));
    controls.unpin.disabled = !active || isGlobalBusy() || !slugs.some(isGlobalPinned);
    controls.save.disabled = !active || slugs.every(slug => favorites.has(slug));
    controls.unsave.disabled = !active || slugs.every(slug => !favorites.has(slug));
    $('#deck-batch-all').disabled = visible().length === 0 || visible().every(app => selected.has(app.slug));
    $('#deck-batch-clear').disabled = !active;
    for(const tile of grid.querySelectorAll('[data-batch-slug]')) {
      const checked = selected.has(tile.dataset.batchSlug);
      tile.setAttribute('aria-pressed', String(checked));
      tile.classList.toggle('is-selected', checked);
      const mark = tile.querySelector('.deck-batch__mark');
      if(mark)mark.textContent = checked ? '✓' : '+';
    }
  }
  function renderGrid(force=false) {
    if(!dialog.open) return;
    const apps = visible();
    const signature = JSON.stringify({
      view, query:search.value, apps:apps.map(a=>[a.slug,a.version,a.updatedAt]),
      archived:apps.map(a=>[a.slug,isGlobalArchived(a.slug),isPersonalArchived(a.slug),isGlobalPinned(a.slug)]),
      artwork:apps.map(a=>artwork(a).length)
    });
    if(force || signature !== lastSignature) {
      lastSignature = signature;
      grid.innerHTML = apps.length ? apps.map(app => `<button type="button" class="deck-batch__tile" data-batch-slug="${escapeHtml(app.slug)}"
        aria-pressed="${selected.has(app.slug)}" aria-label="${escapeHtml(app.name)}">
        <span class="deck-batch__art">${artwork(app)}</span>
        <span class="deck-batch__name">${escapeHtml(app.name)}</span>
        ${isGlobalArchived(app.slug)?'<span class="deck-batch__scope" aria-label="Общий архив">Общий архив</span>':''}
        ${isGlobalPinned(app.slug)?'<span class="deck-batch__scope deck-batch__scope--pin">Закреплена для всех</span>':''}
        <span class="deck-batch__mark" aria-hidden="true">${selected.has(app.slug)?'✓':'+'}</span></button>`).join('')
        : '<p class="deck-batch__empty">Нет игр по этим условиям.</p>';
    }
    renderControls();
  }
  function open() {
    selected.clear();view='active';search.value='';lastSignature='';
    report('');
    dialog.showModal();
    renderGrid(true);
  }
  function close() {
    selected.clear();pending=null;
    if(confirm.open)confirm.close();
    if(dialog.open)dialog.close();
  }
  function complete(message) {
    selected.clear();
    report(message,'success');
    renderGrid(true);
  }
  function refresh() {
    if(!dialog.open)return;
    const available = new Set(getApps().filter(a=>isArchived(a.slug)===(view==='archive')).map(a=>a.slug));
    selected = new Set([...selected].filter(slug=>available.has(slug)));
    renderGrid(true);
  }
  function toggle(slug) {
    if(selected.has(slug))selected.delete(slug);
    else if(selected.size >= MAX_SELECTION) {
      report('За одно действие можно выбрать до 100 игр.','error');return;
    } else selected.add(slug);
    report('');
    renderControls();
  }
  function selectAllVisible() {
    const before = selected.size;
    for(const app of visible()) {
      if(selected.size >= MAX_SELECTION)break;
      selected.add(app.slug);
    }
    report(selected.size === MAX_SELECTION && visible().length > MAX_SELECTION - before
      ? 'Выбраны первые 100 игр. Остальные можно обработать отдельно.' : '');
    renderControls();
  }
  dialog.addEventListener('click', event => {
    if(event.target === dialog){close();return;}
    if(event.target.closest('#deck-batch-close')){close();return;}
    const tab = event.target.closest('[data-batch-tab]');
    if(tab){
      if(view !== tab.dataset.batchTab){view=tab.dataset.batchTab;selected.clear();report('');renderGrid(true);}
      return;
    }
    const tile = event.target.closest('[data-batch-slug]');
    if(tile){toggle(tile.dataset.batchSlug);return;}
    if(event.target.closest('#deck-batch-all')){selectAllVisible();return;}
    if(event.target.closest('#deck-batch-clear')){selected.clear();report('');renderControls();return;}
    if(event.target.closest('#deck-batch-save')||event.target.closest('#deck-batch-unsave')){
      const save = Boolean(event.target.closest('#deck-batch-save'));
      const slugs = chosen();
      if(slugs.length){onFavorites(slugs,save);complete(save?'Игры сохранены.':'Игры удалены из сохранённого.');}
      return;
    }
    if(event.target.closest('#deck-batch-personal')){
      const slugs = chosen().filter(slug => view !== 'archive' || isPersonalArchived(slug));
      if(!slugs.length)return;
      pending={slugs,archived:view!=='archive'};
      $('#deck-batch-confirm-copy').textContent = pending.archived
        ? `Перенести ${slugs.length} игр в твой личный архив? Сохранения останутся на месте.`
        : `Вернуть ${slugs.length} игр из твоего личного архива? Игры в общем архиве останутся в нём.`;
      confirm.showModal();
      return;
    }
    if(event.target.closest('#deck-batch-global')){
      if(!canManageGlobal()||isGlobalBusy())return;
      const slugs = chosen().filter(slug=>view!=='archive'||isGlobalArchived(slug));
      if(slugs.length)onGlobalArchive(slugs,view!=='archive');
      return;
    }
    if(event.target.closest('#deck-batch-pin')){
      if(!canManageGlobal()||isGlobalBusy())return;
      const slugs=chosen().filter(slug=>!isGlobalPinned(slug));
      if(slugs.length)onGlobalPin(slugs,true);
      return;
    }
    if(event.target.closest('#deck-batch-unpin')){
      if(!canManageGlobal()||isGlobalBusy())return;
      const slugs=chosen().filter(isGlobalPinned);
      if(slugs.length)onGlobalPin(slugs,false);
    }
  });
  confirm.addEventListener('click',event=>{
    if(event.target.closest('#deck-batch-confirm-cancel')){pending=null;confirm.close();return;}
    if(event.target.closest('#deck-batch-confirm-accept')){
      const action=pending;pending=null;confirm.close();
      if(action?.slugs.length){
        onPersonalArchive(action.slugs,action.archived);
        complete(action.archived?'Игры перенесены в личный архив.':'Игры возвращены из личного архива.');
      }
    }
  });
  confirm.addEventListener('close',()=>{pending=null;});
  dialog.addEventListener('close',()=>{selected.clear();lastSignature='';});
  search.addEventListener('input',()=>{renderGrid(true);});
  $('#deck-batch-trigger')?.addEventListener('click',open);
  return {open,close,refresh,complete,report,isOpen:()=>dialog.open};
}
