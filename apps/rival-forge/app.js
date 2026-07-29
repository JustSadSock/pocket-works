import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { SNAPSHOT, HEROES, HERO_BY_ID, TEAM_UPS, PRESETS, TIERS, ROLE_ORDER } from './data.js';
import {
  heroRating,
  analyzeTeam,
  recommendHeroes,
  autoComplete,
  optimizeTeam,
  tierGroups,
  exportPayload,
  normalizeImported
} from './core.js';

installMobileRuntime();

const STORAGE_KEY = 'pocket-works:rival-forge:v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const defaults = {
  activeView: 'builder',
  teamSize: 6,
  team: ['mister-fantastic', 'invisible-woman', null, null, null, null],
  locks: [true, true, false, false, false, false],
  prefs: { tiers: {}, scores: {}, confidence: {}, notes: {}, favorites: [] },
  savedTeams: [],
  sound: true,
  heroRole: 'All',
  heroSearch: '',
  favoriteOnly: false,
  tierRole: 'all',
  tierSort: 'rating',
  linkType: 'all',
  linkSearch: ''
};

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw) return structuredClone(defaults);
    const teamSize = Math.max(1, Math.min(6, Number(raw.teamSize) || 6));
    return {
      ...structuredClone(defaults),
      ...raw,
      teamSize,
      team: Array.from({ length: teamSize }, (_, index) => HERO_BY_ID[raw.team?.[index]] ? raw.team[index] : null),
      locks: Array.from({ length: teamSize }, (_, index) => Boolean(raw.locks?.[index])),
      prefs: {
        tiers: raw.prefs?.tiers || {},
        scores: raw.prefs?.scores || {},
        confidence: raw.prefs?.confidence || {},
        notes: raw.prefs?.notes || {},
        favorites: Array.isArray(raw.prefs?.favorites) ? raw.prefs.favorites.filter(id => HERO_BY_ID[id]) : []
      },
      savedTeams: Array.isArray(raw.savedTeams) ? raw.savedTeams.slice(0, 40) : []
    };
  } catch {
    return structuredClone(defaults);
  }
}

let state = loadState();
let activeSheet = null;
let pickerSlot = null;
let pickerRole = 'All';
let pickerSearch = '';
let currentHeroId = null;
let heroAddSlot = null;
let toastTimer = 0;
let audioContext = null;

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    toast(`Не удалось сохранить: ${error.message}`, 'bad');
  }
}

function haptic(pattern = 8) { navigator.vibrate?.(pattern); }

function clickSound(tone = 'tap') {
  if (!state.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = tone === 'good' ? 'sine' : tone === 'bad' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(tone === 'good' ? 520 : tone === 'bad' ? 110 : 250, now);
    oscillator.frequency.exponentialRampToValueAtTime(tone === 'good' ? 760 : tone === 'bad' ? 72 : 310, now + .07);
    gain.gain.setValueAtTime(.035, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .09);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + .1);
  } catch {}
}

function toast(message, tone = '') {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast show ${tone}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.className = 'toast', 2100);
}

function initials(name) { return name.split(/\s+/).map(word => word[0]).join('').slice(0, 3).toUpperCase(); }
function fallbackPortrait(hero) {
  const text = esc(initials(hero.name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#f3efe4"/><path d="M0 300 150 80l80 130L400 20v380H0Z" fill="${hero.color}" opacity=".72"/><circle cx="200" cy="170" r="92" fill="#141518" opacity=".14"/><text x="200" y="220" text-anchor="middle" font-family="system-ui,sans-serif" font-size="100" font-weight="900" fill="#141518">${text}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function portrait(hero, className = '', extra = '') { return `<img class="${className}" src="${hero.portrait}" alt="${esc(hero.name)}" data-hero-image="${hero.id}" ${extra}>`; }
function wireImageFallbacks(root = document) {
  $$('img[data-hero-image]', root).forEach(image => {
    if (image.dataset.fallbackBound) return;
    image.dataset.fallbackBound = '1';
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied) return;
      image.dataset.fallbackApplied = '1';
      image.src = fallbackPortrait(HERO_BY_ID[image.dataset.heroImage]);
    });
  });
}
function roleLabel(hero) { return hero.role === 'Flex' ? hero.roles.join(' · ') : hero.role; }
function roleTabs(active, dataset = 'role') { return ['All', ...ROLE_ORDER].map(role => `<button class="${active === role ? 'active' : ''}" data-${dataset}="${role}">${role === 'All' ? 'Все' : role}</button>`).join(''); }

function setTeamSize(size) {
  size = Math.max(1, Math.min(6, Number(size) || 6));
  if (size === state.teamSize) return;
  if (size < state.teamSize && state.team.slice(size).some(Boolean) && !confirm('Уменьшить команду и удалить героев из лишних слотов?')) return;
  state.teamSize = size;
  state.team = Array.from({ length: size }, (_, index) => state.team[index] || null);
  state.locks = Array.from({ length: size }, (_, index) => Boolean(state.locks[index]));
  saveState(); renderBuilder(); haptic();
}
function renderTeamSize() { $('#teamSizeButtons').innerHTML = [1,2,3,4,5,6].map(size => `<button class="${size === state.teamSize ? 'active' : ''}" data-team-size="${size}">${size}</button>`).join(''); }
function teamSlotHTML(id, index) {
  if (!id) return `<article class="team-slot empty" data-slot="${index}"><button data-pick-slot="${index}" aria-label="Добавить героя в слот ${index + 1}"><b>＋</b><span>СЛОТ ${index + 1}</span></button></article>`;
  const hero = HERO_BY_ID[id];
  const rating = Math.round(heroRating(hero, state.prefs));
  return `<article class="team-slot" style="--role:${hero.color}" data-slot="${index}">${portrait(hero, 'portrait')}<div class="slot-gradient"></div><div class="slot-top-actions"><button data-remove-slot="${index}" aria-label="Убрать ${esc(hero.name)}">×</button><button data-lock-slot="${index}" class="${state.locks[index] ? 'locked' : ''}" aria-label="${state.locks[index] ? 'Открепить' : 'Закрепить'} ${esc(hero.name)}">${state.locks[index] ? '◆' : '◇'}</button></div><button class="slot-main-hit" data-pick-slot="${index}" aria-label="Заменить ${esc(hero.name)}"></button><div class="slot-info"><strong>${esc(hero.name)}</strong><small><span><i class="role-dot"></i>${esc(hero.role)}</span><span>${esc(hero.archetype)}</span></small></div><button class="slot-rank" data-open-hero="${hero.id}" aria-label="Открыть карточку ${esc(hero.name)}">${state.prefs.tiers[hero.id] || hero.tier} · ${rating}</button></article>`;
}
function verdictFor(analysis, filled) {
  if (!filled) return ['Добавь первого героя', 'Система оценит роли, темп, синергии и слабые места.'];
  const complete = filled === state.teamSize;
  if (analysis.overall >= 88 && complete) return ['Злая, связная машина', 'Роли закрыты, пики усиливают друг друга. Можно идти портить людям вечер.'];
  if (analysis.overall >= 76) return ['Сильное ядро', analysis.warnings.length ? `Осталось поправить: ${analysis.warnings.join(' · ')}.` : 'Состав уже работает как единое целое.'];
  if (analysis.overall >= 62) return ['Рабоче, но с дырками', analysis.warnings.length ? analysis.warnings.join(' · ') : 'Неплохая база без ярко выраженной связки.'];
  return ['Пока это просто компания знакомых', analysis.warnings.length ? analysis.warnings.join(' · ') : 'Добавь роли и общую идею состава.'];
}
function renderAnalysisStrip() {
  const analysis = analyzeTeam(state.team, state.prefs), filled = state.team.filter(Boolean).length, [title, copy] = verdictFor(analysis, filled);
  $('#overallScore').textContent = Math.round(analysis.overall); $('#analysisVerdict').textContent = title; $('#analysisWarnings').textContent = copy; $('#teamTitle').textContent = `Команда ${filled}/${state.teamSize}`;
}
function renderRecommendations() {
  const results = recommendHeroes(state.team, state.prefs, { limit: 10, size: state.teamSize });
  $('#recommendations').innerHTML = results.map(({ hero, score, reasons }) => `<article class="recommend-card" style="--role-soft:${hero.color}25"><button class="recommend-main" data-open-hero="${hero.id}">${portrait(hero)}</button><span class="rec-score">${Math.round(score)}</span><div class="rec-copy"><strong>${esc(hero.name)}</strong><small>${reasons.length ? esc(reasons.join(' · ')) : `${esc(hero.role)} · ${esc(hero.archetype)}`}</small></div><button class="rec-add" data-add-hero="${hero.id}" aria-label="Добавить ${esc(hero.name)}">＋</button></article>`).join('') || '<div class="empty-inline">Все доступные герои уже выбраны.</div>';
  wireImageFallbacks($('#recommendations'));
}
function renderPresets() {
  $('#presetRail').innerHTML = PRESETS.map(preset => `<button class="preset-card" data-preset="${preset.id}"><b>${esc(preset.name)}</b><small>${esc(preset.subtitle)}</small><span class="preset-faces">${preset.heroes.slice(0, 6).map(id => portrait(HERO_BY_ID[id])).join('')}</span></button>`).join('');
  wireImageFallbacks($('#presetRail'));
}
function renderBuilder() { renderTeamSize(); $('#teamSlots').innerHTML = state.team.map(teamSlotHTML).join(''); renderAnalysisStrip(); renderRecommendations(); renderPresets(); wireImageFallbacks($('#teamSlots')); }

function filteredHeroes({ picker = false } = {}) {
  const role = picker ? pickerRole : state.heroRole, query = (picker ? pickerSearch : state.heroSearch).trim().toLowerCase();
  return HEROES.filter(hero => (role === 'All' || hero.role === role || (hero.role === 'Flex' && hero.roles.includes(role))) && (!query || [hero.name, hero.role, hero.archetype, ...hero.tags].join(' ').toLowerCase().includes(query)) && (picker || !state.favoriteOnly || state.prefs.favorites.includes(hero.id)));
}
function heroCardHTML(hero) {
  const rating = Math.round(heroRating(hero, state.prefs)), tier = state.prefs.tiers[hero.id] || hero.tier, favorite = state.prefs.favorites.includes(hero.id);
  return `<button class="hero-card" data-open-hero="${hero.id}" style="--role:${hero.color};--role-soft:${hero.color}28">${portrait(hero)}<span class="tier-pin">${tier}</span><span class="rating-pin">${rating}</span>${favorite ? '<span class="favorite-pin">★</span>' : ''}<span class="hero-copy"><strong>${esc(hero.name)}</strong><small>${esc(roleLabel(hero))}</small></span></button>`;
}
function renderHeroes() {
  $('#heroRoleTabs').innerHTML = roleTabs(state.heroRole); $('#heroSearch').value = state.heroSearch; $('#heroFilterButton').textContent = state.favoriteOnly ? '★ Избранные' : 'Фильтры'; $('#heroFilterButton').classList.toggle('active', state.favoriteOnly);
  const heroes = filteredHeroes(); $('#heroCountBadge').textContent = heroes.length; $('#heroGrid').innerHTML = heroes.map(heroCardHTML).join('') || '<div class="empty-inline wide">Никого не найдено. Фильтр устроил геноцид.</div>'; wireImageFallbacks($('#heroGrid'));
}
function renderTiers() {
  $('#tierRoleFilter').value = state.tierRole; $('#tierSort').value = state.tierSort;
  const groups = tierGroups(state.prefs), tierColor = { 'S+':'#d7ff45', S:'#ffda45', A:'#ff9c65', B:'#77d7c4', C:'#a99ae8', D:'#c9c5ba' };
  $('#tierBoard').innerHTML = TIERS.map(tier => {
    let heroes = groups[tier].filter(hero => state.tierRole === 'all' || hero.role === state.tierRole || (hero.role === 'Flex' && hero.roles.includes(state.tierRole)));
    if (state.tierSort === 'name') heroes.sort((a,b) => a.name.localeCompare(b.name));
    if (state.tierSort === 'difficulty') heroes.sort((a,b) => b.difficulty - a.difficulty || a.name.localeCompare(b.name));
    return `<section class="tier-row"><div class="tier-label" style="--tier-color:${tierColor[tier]}">${tier}</div><div class="tier-heroes">${heroes.map(hero => `<button class="tier-mini" data-open-hero="${hero.id}">${portrait(hero)}<span>${esc(hero.name)}</span></button>`).join('') || '<span class="tier-empty">—</span>'}</div></section>`;
  }).join(''); wireImageFallbacks($('#tierBoard'));
}
function filteredLinks() {
  const query = state.linkSearch.trim().toLowerCase();
  return TEAM_UPS.filter(link => (state.linkType === 'all' || link.type === state.linkType) && (!query || `${link.name} ${link.effect} ${link.members.map(id => HERO_BY_ID[id]?.name || id).join(' ')} ${link.tags.join(' ')}`.toLowerCase().includes(query)));
}
function renderLinks() {
  const tabs = [['all','Все'],['official','Team-Up'],['tactical','Тактика']];
  $('#linkTypeTabs').innerHTML = tabs.map(([id,label]) => `<button class="${state.linkType === id ? 'active' : ''}" data-link-type="${id}">${label}</button>`).join(''); $('#linkSearch').value = state.linkSearch;
  const links = filteredLinks(); $('#linkCountBadge').textContent = links.length;
  $('#linkList').innerHTML = links.map(link => `<article class="link-card ${link.type}"><span class="link-meta">${link.type === 'official' ? 'OFFICIAL TEAM-UP' : 'TACTICAL SYNERGY'} · ${esc(link.beneficiary)}</span><h3>${esc(link.name)}</h3><div class="link-members">${link.members.map(id => { const hero = HERO_BY_ID[id]; return `<button class="link-member" data-open-hero="${hero.id}">${portrait(hero)}<span>${esc(hero.name)}</span></button>`; }).join('')}</div><p>${esc(link.effect)}</p><div class="link-tags">${link.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div></article>`).join('') || '<div class="empty-inline wide">Связок по этому запросу нет.</div>'; wireImageFallbacks($('#linkList'));
}
function renderAll() { renderBuilder(); renderHeroes(); renderTiers(); renderLinks(); renderSavedTeams(); setView(state.activeView, false); $('#snapshotLabel').textContent = SNAPSHOT.label; $('#aboutSnapshot').textContent = `${SNAPSHOT.season} · ${SNAPSHOT.patch}`; $('#sourceNote').textContent = SNAPSHOT.sourceNote; $('#soundToggleValue').textContent = state.sound ? 'Включены' : 'Выключены'; }
function setView(view, persist = true) {
  if (!['builder','heroes','tiers','links'].includes(view)) view = 'builder'; state.activeView = view; $$('.view').forEach(node => node.classList.toggle('active', node.dataset.view === view)); $$('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.nav === view)); if (persist) saveState(); window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function openSheet(id) { closeSheet(false); const sheet = $(`#${id}`); if (!sheet) return; activeSheet = id; sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('open'); document.body.classList.add('sheet-open'); }
function closeSheet(sound = true) { if (!activeSheet) return; const sheet = $(`#${activeSheet}`); sheet?.classList.remove('open'); sheet?.setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('open'); document.body.classList.remove('sheet-open'); activeSheet = null; if (sound) clickSound(); }
function openPicker(slot) { pickerSlot = Math.max(0, Math.min(state.teamSize - 1, Number(slot) || 0)); pickerRole = 'All'; pickerSearch = ''; $('#pickerTitle').textContent = state.team[pickerSlot] ? `Заменить слот ${pickerSlot + 1}` : `Заполнить слот ${pickerSlot + 1}`; renderPicker(); openSheet('pickerSheet'); }
function renderPicker() {
  $('#pickerSearch').value = pickerSearch; $('#pickerRoleTabs').innerHTML = roleTabs(pickerRole, 'picker-role'); const heroes = filteredHeroes({ picker: true }), selected = new Set(state.team.filter(Boolean));
  $('#pickerGrid').innerHTML = `<button class="picker-card clear-pick" data-clear-picker="1"><span class="clear-symbol">×</span><span>Оставить пустым</span></button>${heroes.map(hero => `<button class="picker-card ${selected.has(hero.id) ? 'already-picked' : ''}" data-picker-hero="${hero.id}" style="--role-soft:${hero.color}28">${portrait(hero)}<span>${esc(hero.name)}</span><i class="picker-score">${Math.round(heroRating(hero,state.prefs))}</i></button>`).join('')}`; wireImageFallbacks($('#pickerGrid'));
}
function placeHero(heroId, preferredSlot = null) {
  if (!HERO_BY_ID[heroId]) return false; let slot = preferredSlot;
  if (slot === null || slot < 0 || slot >= state.teamSize) slot = state.team.findIndex(id => !id);
  if (slot < 0) { for (let i = state.locks.length - 1; i >= 0; i--) if (!state.locks[i]) { slot = i; break; } }
  if (slot < 0) slot = state.teamSize - 1;
  const existing = state.team.indexOf(heroId); if (existing === slot) return true;
  if (existing >= 0) { const displaced = state.team[slot]; state.team[slot] = heroId; state.team[existing] = displaced || null; const lock = state.locks[slot]; state.locks[slot] = state.locks[existing]; state.locks[existing] = lock; } else state.team[slot] = heroId;
  saveState(); renderBuilder(); clickSound('good'); haptic(10); return true;
}
function openHero(heroId) { heroAddSlot = activeSheet === 'pickerSheet' ? pickerSlot : null; const hero = HERO_BY_ID[heroId]; if (!hero) return; currentHeroId = hero.id; renderHeroSheet(); openSheet('heroSheet'); }
function renderHeroSheet() {
  const hero = HERO_BY_ID[currentHeroId]; if (!hero) return;
  const score = state.prefs.scores[hero.id] ?? hero.power, confidence = state.prefs.confidence[hero.id] ?? 50, tier = state.prefs.tiers[hero.id] || hero.tier, rating = Math.round(heroRating(hero, state.prefs)), favorite = state.prefs.favorites.includes(hero.id), links = TEAM_UPS.filter(link => link.members.includes(hero.id));
  $('#heroSheetContent').innerHTML = `<div class="hero-hero" style="--role-soft:${hero.color}32">${portrait(hero)}<button class="favorite-button ${favorite ? 'active' : ''}" data-favorite-hero="${hero.id}" aria-label="Избранное">★</button><div class="hero-hero-copy"><h2>${esc(hero.name)}</h2><p>${esc(roleLabel(hero))} · ${esc(hero.archetype)}</p></div></div><div class="hero-metrics"><div class="hero-metric"><span>ИТОГ</span><b id="sheetRating">${rating}</b></div><div class="hero-metric"><span>ТИР</span><b id="sheetTier">${tier}</b></div><div class="hero-metric"><span>СЛОЖНОСТЬ</span><b>${'◆'.repeat(hero.difficulty)}${'◇'.repeat(5-hero.difficulty)}</b></div></div><button class="hero-add-command" data-add-hero="${hero.id}">ДОБАВИТЬ В КОМАНДУ <span>＋</span></button><section class="editor-block"><label><span>СИЛА ПЕРСОНАЖА <b id="powerOutput">${score}</b></span><input id="heroPowerRange" type="range" min="0" max="100" value="${score}"></label></section><section class="editor-block"><label><span>МОЯ УВЕРЕННОСТЬ <b id="confidenceOutput">${confidence}</b></span><input id="heroConfidenceRange" type="range" min="0" max="100" value="${confidence}"></label></section><section class="editor-block"><span>ПОЗИЦИЯ В ТИРЛИСТЕ</span><div class="tier-buttons">${TIERS.map(value => `<button class="${tier === value ? 'active' : ''}" data-set-tier="${value}">${value}</button>`).join('')}</div></section><section class="editor-block"><span>ИНСТРУМЕНТЫ</span><div class="tag-cloud">${hero.tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div></section><section class="editor-block"><label><span>ЛИЧНЫЕ ЗАМЕТКИ</span><textarea id="heroNotes" class="hero-notes" placeholder="Карты, матчапы, кто хорошо играет этим героем…">${esc(state.prefs.notes[hero.id] || '')}</textarea></label></section><section class="editor-block"><span>СВЯЗКИ · ${links.length}</span><div class="mini-link-list">${links.slice(0,8).map(link => `<button data-jump-link="${link.id}"><b>${esc(link.name)}</b><small>${link.type === 'official' ? 'Team-Up' : 'Тактика'} · ${esc(link.members.filter(id => id !== hero.id).map(id => HERO_BY_ID[id].name).join(', '))}</small></button>`).join('')}</div></section>`; wireImageFallbacks($('#heroSheetContent'));
}
function updateHeroPreference(kind, value) {
  const hero = HERO_BY_ID[currentHeroId]; if (!hero) return; if (kind === 'score') state.prefs.scores[hero.id] = clamp(value); if (kind === 'confidence') state.prefs.confidence[hero.id] = clamp(value); if (kind === 'tier' && TIERS.includes(value)) state.prefs.tiers[hero.id] = value; if (kind === 'notes') state.prefs.notes[hero.id] = String(value).slice(0, 1200); saveState(); if (kind !== 'notes') { if ($('#sheetRating')) $('#sheetRating').textContent = Math.round(heroRating(hero, state.prefs)); if ($('#sheetTier')) $('#sheetTier').textContent = state.prefs.tiers[hero.id] || hero.tier; } renderBuilder(); renderHeroes(); renderTiers();
}
function renderAnalysisSheet() {
  const analysis = analyzeTeam(state.team, state.prefs), roleNames = ['Vanguard','Duelist','Strategist'], metrics = [['Баланс ролей', analysis.balance, '#d7ff45'],['Синергия', analysis.synergy, '#9d65ff'],['Фронтлайн', analysis.frontline, '#ff6b4a'],['Выживаемость', analysis.sustain, '#2dbf9f'],['Давление', analysis.pressure, '#ff4f8b'],['Контроль', analysis.control, '#f2bd31'],['Мобильность', analysis.mobility, '#77a9ff']];
  $('#analysisSheetContent').innerHTML = `<div class="analysis-hero-score"><b>${Math.round(analysis.overall)}</b><span>ИТОГОВАЯ ОЦЕНКА</span><p>${verdictFor(analysis,state.team.filter(Boolean).length)[0]}</p></div><div class="role-diagram">${roleNames.map((role,index) => `<div><b>${analysis.counts[role]}<small>/${analysis.target[index]}</small></b><span>${role}</span></div>`).join('')}</div><div class="metric-grid">${metrics.map(([name,value,color]) => `<div class="metric-bar"><header><span>${name}</span><b>${Math.round(value)}</b></header><div class="track"><i style="--value:${clamp(value)}%;--bar:${color}"></i></div></div>`).join('')}</div><section class="diagnostic-section"><h3>ПРОБЛЕМЫ</h3><div class="warning-list">${analysis.warnings.length ? analysis.warnings.map(item => `<div class="warning-item">${esc(item)}</div>`).join('') : '<div class="warning-item clean">Критичных дыр не обнаружено.</div>'}</div></section><section class="diagnostic-section"><h3>АКТИВНЫЕ СВЯЗКИ · ${analysis.links.length}</h3>${analysis.links.length ? analysis.links.map(link => `<button class="active-link-card" data-jump-link="${link.id}"><b>${esc(link.name)}</b><p>${esc(link.effect)}</p></button>`).join('') : '<div class="saved-empty">Пока ни одной полной связки. Рекомендации сверху знают, как это исправить.</div>'}</section>`;
}
function saveCurrentTeam() {
  const ids = state.team.filter(Boolean); if (!ids.length) return toast('Сначала добавь хотя бы одного героя.', 'bad'); const keyNames = ids.slice(0,2).map(id => HERO_BY_ID[id].name), suggested = keyNames.join(' + ') + (ids.length > 2 ? ` · ${ids.length}` : ''), name = (prompt('Название команды', suggested) || suggested).trim().slice(0, 60);
  state.savedTeams.unshift({ id: crypto.randomUUID?.() || `team-${Date.now().toString(36)}`, name, teamSize: state.teamSize, team: [...state.team], locks: [...state.locks], score: Math.round(analyzeTeam(state.team, state.prefs).overall), updated: Date.now() }); state.savedTeams = state.savedTeams.slice(0, 40); saveState(); renderSavedTeams(); clickSound('good'); toast('Команда сохранена.', 'good');
}
function renderSavedTeams() {
  const root = $('#savedTeamsList'); if (!state.savedTeams.length) { root.innerHTML = '<div class="saved-empty">Здесь будут команды, которые реально стоит помнить.</div>'; return; }
  root.innerHTML = state.savedTeams.map(team => `<article class="saved-team" data-saved-id="${team.id}"><header><div><h3>${esc(team.name)}</h3><small>${new Date(team.updated).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></div><b>${team.score || Math.round(analyzeTeam(team.team || [],state.prefs).overall)}</b></header><div class="saved-faces">${(team.team || []).filter(Boolean).map(id => HERO_BY_ID[id] ? portrait(HERO_BY_ID[id]) : '').join('')}</div><div class="saved-actions"><button class="primary" data-load-team="${team.id}">Загрузить</button><button data-duplicate-team="${team.id}">Копия</button><button data-delete-team="${team.id}">Удалить</button></div></article>`).join(''); wireImageFallbacks(root);
}
function loadSavedTeam(id) { const record = state.savedTeams.find(team => team.id === id); if (!record) return; state.teamSize = Math.max(1, Math.min(6, Number(record.teamSize) || 6)); state.team = Array.from({ length: state.teamSize }, (_,i) => HERO_BY_ID[record.team?.[i]] ? record.team[i] : null); state.locks = Array.from({ length: state.teamSize }, (_,i) => Boolean(record.locks?.[i])); saveState(); renderBuilder(); closeSheet(false); setView('builder'); clickSound('good'); toast(`Загружено: ${record.name}`, 'good'); }
function applyPreset(id) { const preset = PRESETS.find(item => item.id === id); if (!preset) return; state.teamSize = Math.max(1, Math.min(6, preset.heroes.length || 6)); state.team = Array.from({ length: state.teamSize }, (_, index) => preset.heroes[index] || null); state.locks = Array.from({ length: state.teamSize }, (_, index) => index < Math.min(2, preset.heroes.length)); saveState(); renderBuilder(); clickSound('good'); toast(`Основа загружена: ${preset.name}`, 'good'); }
function exportData() { const payload = JSON.stringify(exportPayload(state), null, 2), blob = new Blob([payload], { type: 'application/json' }), url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `rival-forge-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Данные экспортированы.', 'good'); }
async function importData(file) { try { const normalized = normalizeImported(JSON.parse(await file.text())); state = { ...state, ...normalized }; saveState(); renderAll(); closeSheet(false); clickSound('good'); toast('Данные восстановлены.', 'good'); } catch (error) { toast(`Импорт не удался: ${error.message}`, 'bad'); } finally { $('#importInput').value = ''; } }
function resetAll() { if (!confirm('Удалить все команды, личные оценки, заметки и тирлист?')) return; state = structuredClone(defaults); saveState(); renderAll(); closeSheet(false); toast('Rival Forge сброшен.', 'good'); }

function bindEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.matches('[data-nav]')) return setView(button.dataset.nav);
    if (button.matches('[data-team-size]')) return setTeamSize(button.dataset.teamSize);
    if (button.matches('[data-pick-slot]')) return openPicker(button.dataset.pickSlot);
    if (button.matches('[data-open-hero]')) return openHero(button.dataset.openHero);
    if (button.matches('[data-add-hero]')) { placeHero(button.dataset.addHero, activeSheet === 'heroSheet' ? heroAddSlot : null); if (activeSheet === 'heroSheet') closeSheet(false); return; }
    if (button.matches('[data-remove-slot]')) { const index = Number(button.dataset.removeSlot); state.team[index] = null; state.locks[index] = false; saveState(); renderBuilder(); clickSound(); haptic(); return; }
    if (button.matches('[data-lock-slot]')) { const index = Number(button.dataset.lockSlot); state.locks[index] = !state.locks[index]; saveState(); renderBuilder(); clickSound(); haptic(); return; }
    if (button.matches('[data-role]')) { state.heroRole = button.dataset.role; saveState(); renderHeroes(); clickSound(); return; }
    if (button.matches('[data-picker-role]')) { pickerRole = button.dataset.pickerRole; renderPicker(); clickSound(); return; }
    if (button.matches('[data-picker-hero]')) { placeHero(button.dataset.pickerHero, pickerSlot); closeSheet(false); return; }
    if (button.matches('[data-clear-picker]')) { state.team[pickerSlot] = null; state.locks[pickerSlot] = false; saveState(); renderBuilder(); closeSheet(false); return; }
    if (button.matches('[data-set-tier]')) { updateHeroPreference('tier', button.dataset.setTier); renderHeroSheet(); clickSound(); return; }
    if (button.matches('[data-favorite-hero]')) { const id = button.dataset.favoriteHero, set = new Set(state.prefs.favorites); set.has(id) ? set.delete(id) : set.add(id); state.prefs.favorites = [...set]; saveState(); renderHeroSheet(); renderHeroes(); clickSound('good'); return; }
    if (button.matches('[data-preset]')) return applyPreset(button.dataset.preset);
    if (button.matches('[data-link-type]')) { state.linkType = button.dataset.linkType; saveState(); renderLinks(); clickSound(); return; }
    if (button.matches('[data-jump-link]')) { state.linkSearch = TEAM_UPS.find(link => link.id === button.dataset.jumpLink)?.name || ''; state.linkType = 'all'; closeSheet(false); setView('links'); renderLinks(); return; }
    if (button.matches('[data-load-team]')) return loadSavedTeam(button.dataset.loadTeam);
    if (button.matches('[data-duplicate-team]')) { const original = state.savedTeams.find(team => team.id === button.dataset.duplicateTeam); if (!original) return; state.savedTeams.unshift({ ...structuredClone(original), id: crypto.randomUUID?.() || `team-${Date.now()}`, name: `${original.name} · копия`, updated: Date.now() }); saveState(); renderSavedTeams(); toast('Копия создана.', 'good'); return; }
    if (button.matches('[data-delete-team]')) { const record = state.savedTeams.find(team => team.id === button.dataset.deleteTeam); if (!record || !confirm(`Удалить «${record.name}»?`)) return; state.savedTeams = state.savedTeams.filter(team => team.id !== record.id); saveState(); renderSavedTeams(); return; }
    if (button.matches('[data-close-sheet]')) return closeSheet();
  });
  $('#scrim').addEventListener('click', () => closeSheet());
  $('#backButton').addEventListener('click', () => { if (activeSheet) return closeSheet(); if (history.length > 1) history.back(); else location.href = '../../'; });
  $('#openSavedButton').addEventListener('click', () => { renderSavedTeams(); openSheet('savedSheet'); clickSound(); });
  $('#openMenuButton').addEventListener('click', () => openSheet('menuSheet'));
  $('#analysisDetailsButton').addEventListener('click', () => { renderAnalysisSheet(); openSheet('analysisSheet'); });
  $('#clearTeamButton').addEventListener('click', () => { if (!state.team.some(Boolean) || confirm('Очистить всю текущую команду?')) { state.team.fill(null); state.locks.fill(false); saveState(); renderBuilder(); clickSound(); } });
  $('#saveTeamButton').addEventListener('click', saveCurrentTeam);
  $('#autoCompleteButton').addEventListener('click', () => { state.team = autoComplete(state.team, state.locks, state.prefs); saveState(); renderBuilder(); clickSound('good'); haptic([10,30,10]); toast('Пустые слоты заполнены.', 'good'); });
  $('#optimizeButton').addEventListener('click', () => { state.team = optimizeTeam(state.team, state.locks, state.prefs); saveState(); renderBuilder(); clickSound('good'); haptic([12,25,12]); toast('Состав пересобран вокруг закреплённых героев.', 'good'); });
  $('#refreshRecommendationsButton').addEventListener('click', () => { renderRecommendations(); clickSound(); });
  $('#heroFilterButton').addEventListener('click', () => { state.favoriteOnly = !state.favoriteOnly; saveState(); renderHeroes(); clickSound(); });
  $('#resetTiersButton').addEventListener('click', () => { if (!confirm('Вернуть исходные тиры всем героям? Личные оценки силы останутся.')) return; state.prefs.tiers = {}; saveState(); renderTiers(); renderHeroes(); renderBuilder(); });
  $('#exportButton').addEventListener('click', exportData); $('#importButton').addEventListener('click', () => $('#importInput').click());
  $('#soundToggle').addEventListener('click', () => { state.sound = !state.sound; saveState(); $('#soundToggleValue').textContent = state.sound ? 'Включены' : 'Выключены'; if (state.sound) clickSound('good'); });
  $('#resetAllButton').addEventListener('click', resetAll); $('#importInput').addEventListener('change', event => event.target.files?.[0] && importData(event.target.files[0]));
  $('#heroSearch').addEventListener('input', event => { state.heroSearch = event.target.value; saveState(); renderHeroes(); }); $('#pickerSearch').addEventListener('input', event => { pickerSearch = event.target.value; renderPicker(); }); $('#linkSearch').addEventListener('input', event => { state.linkSearch = event.target.value; saveState(); renderLinks(); }); $('#tierRoleFilter').addEventListener('change', event => { state.tierRole = event.target.value; saveState(); renderTiers(); }); $('#tierSort').addEventListener('change', event => { state.tierSort = event.target.value; saveState(); renderTiers(); });
  $('#heroSheet').addEventListener('input', event => { if (event.target.id === 'heroPowerRange') { $('#powerOutput').textContent = event.target.value; updateHeroPreference('score', event.target.value); } if (event.target.id === 'heroConfidenceRange') { $('#confidenceOutput').textContent = event.target.value; updateHeroPreference('confidence', event.target.value); } if (event.target.id === 'heroNotes') updateHeroPreference('notes', event.target.value); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && activeSheet) closeSheet(); });
}

bindEvents(); renderAll();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
