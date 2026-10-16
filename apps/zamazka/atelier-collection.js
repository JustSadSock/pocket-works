// Atelier collection: immutable achievement catalogue, not local award minting.
// Unlock state always comes from Pocket ID; brushes only affect local cursor art.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const medalMarks={
 'zamazka.first-stroke':'<path d="M31 61 57 35l7 7-26 26-13 4 6-11Zm25-27 7-7 9 9-7 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="m26 73 15-6" stroke="currentColor" stroke-width="2"/>',
 'zamazka.sharp-eye':'<path d="M15 50Q48 18 81 50 48 82 15 50Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="48" cy="50" r="13" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="48" cy="50" r="5" fill="currentColor"/><path d="M48 18v9M20 29l6 7M76 29l-6 7" stroke="currentColor" stroke-width="2"/>',
 'zamazka.shared-canvas':'<path d="M21 29 72 73M72 29 21 73" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="m18 25 12 3-7 10-7-5Zm56 0-12 3 7 10 7-5Z" fill="currentColor"/><circle cx="47" cy="51" r="8" fill="#dec9a0" stroke="currentColor" stroke-width="2"/>',
 'zamazka.three-rounds':'<path d="M23 66V37l12 7 13-21 13 21 12-7v29l-25 9-25-9Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M35 59 48 48 61 59M48 48v20" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="48" cy="33" r="4" fill="currentColor"/>',
 'zamazka.five-works':'<path d="M17 29h29v28H17zM50 29h29v28H50zM34 51h29v28H34z" fill="none" stroke="currentColor" stroke-width="3"/><path d="m23 48 7-10 10 10m17-4 6-8 9 13" fill="none" stroke="currentColor" stroke-width="2"/>',
 'zamazka.perfect-forgery':'<path d="M20 27h56v48H20z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 34h42v34H27z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M33 58 44 44l8 8 12-13M55 61l9 2" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m70 20 7-7m-7 0 7 7" stroke="currentColor" stroke-width="2"/>',
 'zamazka.maestro':'<path d="m16 39 13 10 18-22 18 22 15-10-7 31H23L16 39Z" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M27 70v7h44v-7M32 56l16-12 16 12" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="48" cy="28" r="4" fill="currentColor"/>'
};
export function medalSVG(id,earned=false){
 const symbol=medalMarks[id]||medalMarks['zamazka.first-stroke'];
 return '<svg viewBox="0 0 96 100" aria-hidden="true" class="cabinet-medal-svg"><path d="M33 3 43 23 53 23 63 3 74 10 60 33H36L22 10Z" fill="'+(earned?'#95794f':'#887a66')+'" stroke="#625540" stroke-width="1"/>'+
 '<circle cx="48" cy="56" r="39" fill="'+(earned?'#caaf74':'#898378')+'" stroke="'+(earned?'#e9d49e':'#afa89a')+'" stroke-width="2"/>'+
 '<circle cx="48" cy="56" r="33" fill="'+(earned?'#c09c5d':'#7a766e')+'" stroke="#554838" stroke-width="1.6"/>'+
 '<circle cx="48" cy="56" r="28" fill="none" stroke="'+(earned?'#edd3a1':'#afa698')+'" stroke-width="1" stroke-dasharray="2 3"/>'+
 '<g transform="translate(0 6)" color="'+(earned?'#4d4e3d':'#c0b9ab')+'">'+symbol+'</g></svg>';
}
export function cabinetMarkup(catalogue,earned=[],{status='ready',error='',guest=false,selectedId=''}={}){
 const owned=new Set(earned),known=status==='ready'&&!guest;
 const selected=catalogue.find(a=>a.id===selectedId)||catalogue.find(a=>owned.has(a.id))||catalogue[0];
 const sum=catalogue.filter(a=>owned.has(a.id)).length;
 const tiles=catalogue.map((a,i)=>{
  const active=selected?.id===a.id,unlocked=known&&owned.has(a.id);
  return '<button type="button" class="cabinet-medal'+(active?' is-selected':'')+(unlocked?' is-owned':'')+
   '" data-achievement-select="'+esc(a.id)+'" aria-pressed="'+active+'" style="--medal-order:'+i+'">'+
   '<span class="cabinet-medal-figure">'+medalSVG(a.id,unlocked)+'</span>'+
   '<span class="cabinet-medal-name">'+esc(a.name)+'</span>'+
   '<span class="cabinet-medal-state">'+(known?(unlocked?'Получено':'Не открыто'):guest?'Pocket ID':'Не проверено')+'</span></button>';
 }).join('');
 let notice='';
 if(status==='loading')notice='<div class="cabinet-notice" role="status">Проверяем награды Pocket ID…</div>';
 else if(status==='error')notice='<div class="cabinet-notice is-error" role="alert">'+esc(error||'Не удалось загрузить награды.')+
  ' <button type="button" data-action="retry-achievements">Повторить</button></div>';
 else if(guest)notice='<div class="cabinet-notice">Награды открываются в сетевых матчах с Pocket ID. '+
  '<button type="button" data-action="pocket-profile">Открыть Pocket ID</button></div>';
 const detail=catalogue.length?achievementDetailMarkup(selected,known&&owned.has(selected?.id),known):'<div class="cabinet-empty">Награды не найдены.</div>';
 return '<section class="page zamazka-achievements cabinet-scene" data-collection-scene="achievements">'+
  '<header class="cabinet-header"><div><span class="cabinet-kicker">ЛИЧНАЯ КОЛЛЕКЦИЯ · ЗАМАЗКА</span>'+
  '<h2>Кабинет наград</h2></div>'+
  '<div class="cabinet-count"><strong>'+ (known?sum:'—') +'</strong><span>из '+catalogue.length+'</span></div>'+
  '<button class="cabinet-back" data-action="achievements-back">← Назад</button></header>'+
  (notice?'<div class="cabinet-notice-line">'+notice+'</div>':'')+
  '<div class="cabinet-composition"><div class="cabinet-tray" id="zamAchievements" aria-label="Награды Замазки">'+tiles+'</div>'+
  '<aside class="cabinet-detail" id="cabinetDetail" aria-live="polite">'+detail+'</aside></div></section>';
}
export function achievementDetailMarkup(a,earned=false,verified=false){
 if(!a)return '';
 return '<div class="cabinet-detail-inner"><div class="cabinet-detail-hero">'+medalSVG(a.id,earned)+'</div>'+
 '<div class="cabinet-detail-content"><span class="cabinet-kicker">'+esc(a.tier)+' · '+(verified?(earned?'ПОЛУЧЕНО':'НЕ ОТКРЫТО'):'СТАТУС НЕ ПРОВЕРЕН')+'</span>'+
 '<h3>'+esc(a.name)+'</h3><p>'+esc(a.detail)+'</p>'+
 '<div class="cabinet-prize"><span>НАГРАДА ДЛЯ POCKET ID</span><strong>'+esc(a.reward)+'</strong></div></div></div>';
}
export function settingsMarkup({name,member,sound,volume,confirmVote,brushStyle,brushNames}){
 const chosen=Math.max(0,Math.min(brushNames.length-1,Number(brushStyle)||0));
 return '<div class="atelier-settings" data-settings-view>'+
 '<nav class="atelier-settings-tabs" aria-label="Разделы настроек">'+
 '<button type="button" class="is-active" aria-selected="true" data-settings-tab="brushes">Кисти</button>'+
 '<button type="button" aria-selected="false" data-settings-tab="preferences">Параметры</button></nav>'+
 '<section class="atelier-settings-panel is-active" data-settings-panel="brushes">'+
  '<div class="atelier-brush-head"><div><span>ИНСТРУМЕНТ РЕСТАВРАТОРА</span><h3>Моя кисть</h3></div>'+
  '<select id="settingBrushStyle" class="input" aria-label="Стиль курсора">'+brushNames.map((n,i)=>'<option value="'+i+'"'+(i===chosen?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></div>'+
  '<div class="atelier-brush-desk"><div class="atelier-brush-preview" id="settingBrushPreview" aria-hidden="true"></div>'+
    '<canvas id="settingStrokeCanvas" width="640" height="280" aria-label="Проведи кистью по бумаге для предпросмотра"></canvas>'+
    '<span class="atelier-paper-prompt" id="settingStrokePrompt">Проведи кистью по бумаге</span>'+
    '<button type="button" class="atelier-stroke-reset" data-setting-clear-preview aria-label="Очистить пробные мазки">Очистить</button>'+
    '<div class="atelier-tool-pointer" id="settingBrushPointer" aria-hidden="true"></div></div>'+
  '<div class="atelier-brush-options" role="group" aria-label="Выбор кисти">'+
    brushNames.map((n,i)=>'<button type="button" data-brush-choice="'+i+'" aria-pressed="'+(i===chosen)+'" class="'+(i===chosen?'is-selected':'')+'">'+
    '<span class="atelier-brush-mini" data-brush-mini="'+i+'" aria-hidden="true"></span><strong>'+esc(n)+'</strong></button>').join('')+'</div>'+
  '<p class="atelier-settings-note">Выбор меняет внешний вид курсора, а не форму мазка.</p></section>'+
 '<section class="atelier-settings-panel" data-settings-panel="preferences" hidden>'+
 '<div class="atelier-preferences"><div class="atelier-preferences-group"><span class="atelier-group-title">ЛИЧНОЕ</span>'+
  '<label class="field" for="settingName">Имя игрока</label>'+
  '<input class="input" id="settingName" maxlength="22" value="'+esc(name)+'"'+(member?' readonly aria-readonly="true"':'')+'>'+
  '<p class="atelier-settings-note">'+(member?'Имя берётся из Pocket ID.':'Новое имя применится при следующем подключении.')+'</p></div>'+
 '<div class="atelier-preferences-group"><span class="atelier-group-title">ЗВУК</span>'+
  '<label class="field atelier-switch-line" for="settingSound">Звуки мастерской <input type="checkbox" id="settingSound"'+(sound?' checked':'')+'></label>'+
  '<label class="field sound-volume-label" for="settingVolume"><span>Громкость эффектов</span><output id="settingVolumeValue">'+volume+'%</output></label>'+
  '<input id="settingVolume" type="range" min="0" max="100" step="5" value="'+volume+'" aria-label="Громкость эффектов"></div>'+
 '<div class="atelier-preferences-group"><span class="atelier-group-title">ИГРА</span>'+
  '<label class="field atelier-switch-line" for="settingConfirmVote">Подтверждать распределение монет <input type="checkbox" id="settingConfirmVote"'+(confirmVote?' checked':'')+'></label>'+
  '</div></div></section></div>';
}
export function setSettingsTab(root,name){
 const target=name==='preferences'?'preferences':'brushes';
 root.querySelectorAll('[data-settings-tab]').forEach(el=>{
  const selected=el.dataset.settingsTab===target;
  el.classList.toggle('is-active',selected);el.setAttribute('aria-selected',String(selected));
 });
 root.querySelectorAll('[data-settings-panel]').forEach(el=>{
  const selected=el.dataset.settingsPanel===target;
  el.classList.toggle('is-active',selected);el.hidden=!selected;
 });
 return target;
}
