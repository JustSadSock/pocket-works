import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { createVersionedStore } from '../../shared/capabilities/storage.js';
import { createWorkshopMode } from '../../shared/workshop-mode.js';
import { watchConnectivity } from '../../shared/pwa-utils.js';
import {
  BUILD_STEPS,
  ELEMENTS,
  HOUSES,
  PATRONAGE,
  SLOT_META,
  TINCTURES,
  availableSlots,
  campaignSummary,
  canPlaceElement,
  choosePatronage,
  createCampaign,
  currentTrial,
  evaluateHeraldry,
  generateOffer,
  hydrateCampaign,
  isLegalTincture,
  placeElement,
  rejectOffer,
  requirementStatus,
  resolveTrial,
  trialPreview
} from './engine.js';

installMobileRuntime();

const store = createVersionedStore({
  namespace: 'pocket-works:blazon',
  version: 2,
  defaults: {
    settings: { sound: true, seenCodex: false },
    campaign: null,
    stats: { runs: 0, trialsWon: 0, completed: 0 }
  }
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const menuScreen = $('#menuScreen');
const gameScreen = $('#gameScreen');
const houseDialog = $('#houseDialog');
const codexDialog = $('#codexDialog');
const trialDialog = $('#trialDialog');
const patronageDialog = $('#patronageDialog');
const endingDialog = $('#endingDialog');
const pauseDialog = $('#pauseDialog');
const offerGrid = $('#offerGrid');
const shieldTargets = $('#shieldTargets');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const SHIELD_PATH = 'M8 6 H92 V55 C92 81 77 99 50 110 C23 99 8 81 8 55 Z';
const INNER_PATH = 'M13 11 H87 V54 C87 76 74 92 50 103 C26 92 13 76 13 54 Z';
const CHAPTER_NAMES = ['Земля без имени', 'Марка Серебряных ворот', 'Двор двенадцати герольдов', 'Война великих знамён'];

let settings = store.get('settings');
let stats = store.get('stats');
let campaign = hydrateCampaign(store.get('campaign'));
let selectedItemId = null;
let toastTimer = 0;
let audioContext = null;
let trialBusy = false;

function persist() { store.patch({ settings, campaign, stats }); }
function showScreen(name) {
  menuScreen.classList.toggle('is-active', name === 'menu');
  gameScreen.classList.toggle('is-active', name === 'game');
}
function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog?.open) dialog.close(); }
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1900);
}
function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch {} }
function playSound(type) {
  if (!settings.sound) return;
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const map = {
      tap: [280, .045, 'sine'], select: [190, .07, 'triangle'], seal: [120, .13, 'triangle'],
      phase: [150, .14, 'sine'], locked: [75, .09, 'square'], win: [220, .32, 'triangle'], lose: [105, .3, 'sawtooth']
    };
    const [frequency, duration, wave] = map[type] || map.tap;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (type === 'win') oscillator.frequency.exponentialRampToValueAtTime(620, now + duration);
    if (type === 'lose') oscillator.frequency.exponentialRampToValueAtTime(55, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.045, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  } catch {}
}

function roman(value) { return ['I','II','III','IV'][value] || String(value + 1); }
function elementDef(item) { return ELEMENTS[item?.device]; }
function symbolUse(device, className = '') { return `<use class="${className}" href="#sigil-${device}"></use>`; }
function tinctureName(id) { return TINCTURES[id]?.name || ''; }
function itemBackground(campaignValue, item, slot) {
  if (elementDef(item)?.type === 'ordinary') return campaignValue.board.field;
  if (elementDef(item)?.type !== 'charge') return null;
  const ordinary = campaignValue.board.ordinary;
  if (ordinary && ELEMENTS[ordinary.device]?.slots?.includes(slot)) return ordinary.tincture;
  return campaignValue.board.field;
}

function ordinaryMarkup(ordinary, clipId) {
  if (!ordinary) return '';
  const fill = TINCTURES[ordinary.tincture]?.color || '#d8ad42';
  const common = `fill="${fill}" clip-path="url(#${clipId})" class="ordinary-mark"`;
  switch (ordinary.device) {
    case 'pale': return `<rect x="39" y="5" width="22" height="105" ${common}/>`;
    case 'bend': return `<path d="M-6 16 9 1 106 94 91 110Z" ${common}/>`;
    case 'chief': return `<rect x="6" y="5" width="88" height="31" ${common}/>`;
    case 'chevron': return `<path d="M17 86 50 49 83 86" fill="none" stroke="${fill}" stroke-width="17" stroke-linejoin="miter" clip-path="url(#${clipId})" class="ordinary-mark"/>`;
    case 'bordure': return `<path d="${SHIELD_PATH}" fill="none" stroke="${fill}" stroke-width="10" clip-path="url(#${clipId})" class="ordinary-mark"/>`;
    default: return '';
  }
}

function shieldMarkup(campaignValue, prefix = 'player') {
  const board = campaignValue.board;
  const field = TINCTURES[board.field] || TINCTURES.gules;
  const clipId = `${prefix}-shield-clip`;
  const chargeMarkup = board.charges.map((item, slot) => {
    if (!item) return '';
    const tincture = TINCTURES[item.tincture] || TINCTURES.or;
    const meta = SLOT_META[slot];
    const bg = itemBackground(campaignValue, item, slot);
    const legal = isLegalTincture(item.tincture, bg);
    const size = item.device === 'tower' || item.device === 'dragon' ? 25 : 22;
    return `<g class="charge-mark ${legal ? 'is-lawful' : 'is-heretical'}" data-device="${item.device}" transform="translate(${meta.x - size / 2} ${meta.y - size / 2 + 4}) scale(${size / 100})" style="color:${tincture.color};--sigil-eye:${tincture.ink}">${symbolUse(item.device)}</g>`;
  }).join('');
  return `
    <defs>
      <clipPath id="${clipId}"><path d="${SHIELD_PATH}"/></clipPath>
      <filter id="${prefix}-shadow"><feDropShadow dx="0" dy="2" stdDeviation="1.4" flood-opacity=".35"/></filter>
      <pattern id="${prefix}-grain" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 2h8M3 0v8" stroke="rgba(255,255,255,.06)" stroke-width=".35"/></pattern>
    </defs>
    <path d="${SHIELD_PATH}" fill="#201912" opacity=".85" transform="translate(0 1.6)"/>
    <path d="${SHIELD_PATH}" fill="${field.color}" filter="url(#${prefix}-shadow)"/>
    <path d="${SHIELD_PATH}" fill="url(#${prefix}-grain)"/>
    ${ordinaryMarkup(board.ordinary, clipId)}
    ${chargeMarkup}
    <path d="${INNER_PATH}" fill="none" stroke="rgba(255,244,217,.22)" stroke-width="1"/>
    <path d="${SHIELD_PATH}" fill="none" stroke="#7a5d2f" stroke-width="2.2"/>
  `;
}

function opponentShieldMarkup(trial) {
  const tincture = TINCTURES[trial.field] || TINCTURES.sable;
  return `<path d="${SHIELD_PATH}" fill="${tincture.color}"/><g transform="translate(25 29) scale(.5)" style="color:${TINCTURES.or.color};--sigil-eye:#211a13">${symbolUse(trial.sigil)}</g><path d="${SHIELD_PATH}" fill="none" stroke="#d5b866" stroke-width="2.5"/>`;
}

function renderArmorial() {
  if (!campaign) return;
  const ids = [campaign.board.ordinary?.device, ...campaign.board.charges.map((x) => x?.device), ...campaign.board.ornaments.map((x) => x.device), campaign.board.motto?.device].filter(Boolean);
  $('#playerShield').innerHTML = shieldMarkup(campaign);
  $('#helmetCrest').classList.toggle('is-visible', ids.includes('helmet') || ids.includes('crown') || ids.includes('mantle'));
  $('#crownCrest').classList.toggle('is-visible', ids.includes('crown'));
  $('#mantle').classList.toggle('is-visible', ids.includes('mantle'));
  $('#supporterLeft').classList.toggle('is-visible', ids.includes('supporters'));
  $('#supporterRight').classList.toggle('is-visible', ids.includes('supporters'));
  $('#chainRing').classList.toggle('is-visible', ids.includes('chain'));
  const house = HOUSES[campaign.houseId];
  $('#mottoText').textContent = campaign.board.motto ? ELEMENTS[campaign.board.motto.device].name.replace(/[«»]/g, '') : house.motto;
  $('#mottoRibbon').classList.toggle('is-awarded', Boolean(campaign.board.motto));
}

function renderTargets(item) {
  shieldTargets.innerHTML = '';
  const def = elementDef(item);
  if (!item || def?.type !== 'charge') return;
  const slots = availableSlots(campaign, item);
  SLOT_META.forEach((meta) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shield-slot';
    button.style.left = `${meta.x}%`;
    button.style.top = `${meta.y + 3}%`;
    button.dataset.slot = String(meta.id);
    button.disabled = !slots.includes(meta.id);
    button.setAttribute('aria-label', meta.label);
    button.innerHTML = slots.includes(meta.id) ? '<i></i>' : '';
    button.addEventListener('click', () => commitPlacement(meta.id));
    shieldTargets.append(button);
  });
}

function renderTrack() {
  const track = $('#chronicleTrack');
  track.innerHTML = '';
  for (let i = 0; i < BUILD_STEPS; i += 1) {
    const node = document.createElement('div');
    node.className = `chronicle-node ${i < campaign.step ? 'is-done' : i === campaign.step && !campaign.pendingTrial ? 'is-current' : ''}`;
    node.innerHTML = `<i>${i < campaign.step ? '✓' : i + 1}</i><span>${i < campaign.step ? 'Вписано' : `Пожалование ${roman(i)}`}</span>`;
    track.append(node);
  }
  const trial = document.createElement('div');
  trial.className = `chronicle-node is-trial ${campaign.pendingTrial ? 'is-current' : campaign.lastTrial?.chapter === campaign.chapter ? 'is-done' : ''}`;
  trial.innerHTML = `<i>⚔</i><span>Испытание</span>`;
  track.append(trial);
}

function renderStats() {
  const result = evaluateHeraldry(campaign);
  $('#integrityValue').textContent = `${'◆'.repeat(campaign.integrity)}${'◇'.repeat(Math.max(0, 3 - campaign.integrity))}`;
  $('#renownValue').textContent = campaign.renown;
  $('#patronageValue').textContent = campaign.patronage.length;
  $('#powerValue').textContent = result.power;
  $('#wardValue').textContent = result.ward;
  $('#prestigeValue').textContent = result.prestige;
  $('#scandalValue').textContent = result.scandal;
  $('#formulaTitle').textContent = result.combos.length ? result.combos[result.combos.length - 1].name : 'Незавершённая формула';
  $('#formulaList').innerHTML = result.combos.length
    ? result.combos.map((combo) => `<article><b>${combo.name}</b><span>${combo.detail}</span></article>`).join('')
    : '<span>Соедини элементы так, чтобы герб начал означать больше суммы частей.</span>';
}

function typeLabel(type) {
  return { charge: 'ФИГУРА', ordinary: 'ОРДИНАРИЙ', ornament: 'ВНЕШНЕЕ УКРАШЕНИЕ', motto: 'ДЕВИЗ' }[type] || type;
}

function elementPreview(item) {
  const def = elementDef(item);
  const tincture = item.tincture ? TINCTURES[item.tincture] : null;
  if (def.type === 'ordinary') return `<div class="ordinary-preview is-${item.device}" style="--preview:${tincture.color}"></div>`;
  if (def.type === 'charge') return `<svg viewBox="0 0 100 100" style="color:${tincture.color};--sigil-eye:${tincture.ink}">${symbolUse(item.device)}</svg>`;
  if (item.device === 'crown') return `<svg viewBox="0 0 100 100">${symbolUse('crown')}</svg>`;
  if (item.device === 'helmet') return `<svg viewBox="0 0 100 100">${symbolUse('helmet')}</svg>`;
  if (item.device === 'chain') return '<div class="chain-preview">◌</div>';
  if (item.device === 'supporters') return `<div class="supporter-preview"><svg viewBox="0 0 100 100">${symbolUse('lion')}</svg><svg viewBox="0 0 100 100">${symbolUse('stag')}</svg></div>`;
  if (item.device === 'mantle') return '<div class="mantle-preview">M</div>';
  return '<div class="ribbon-preview">VINCIT</div>';
}

function renderOffer() {
  const panel = $('#offerPanel');
  const pending = campaign.pendingTrial || campaign.completed || campaign.failed;
  panel.hidden = pending;
  $('#trialButton').hidden = !campaign.pendingTrial;
  if (campaign.pendingTrial) $('#trialButtonTitle').textContent = currentTrial(campaign).name;
  if (pending) { offerGrid.innerHTML = ''; $('#selectionBar').hidden = true; renderTargets(null); return; }
  if (!campaign.offer.length) generateOffer(campaign);
  $('#eventEyebrow').textContent = `ПОЖАЛОВАНИЕ ${roman(campaign.step)}`;
  $('#eventTitle').textContent = ['Герольд разворачивает свитки', 'Мастер предлагает новую композицию', 'Старая грамота требует решения', 'Последний знак перед испытанием'][campaign.step] || 'Пожалование';
  offerGrid.innerHTML = '';
  campaign.offer.forEach((item) => {
    const def = elementDef(item);
    const req = requirementStatus(campaign, item.device);
    const probeSlot = def.type === 'charge' ? availableSlots(campaign, item)[0] : null;
    const placement = req.ok ? canPlaceElement(campaign, item, probeSlot) : { ok: false, reason: req.text };
    const available = req.ok && placement.ok;
    const selected = item.id === selectedItemId;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `element-card rarity-${def.rarity} ${selected ? 'is-selected' : ''} ${!available ? 'is-locked' : ''}`;
    card.dataset.itemId = item.id;
    card.innerHTML = `
      <span class="card-type">${typeLabel(def.type)}</span>
      <div class="element-figure">${elementPreview(item)}</div>
      <strong>${def.name}</strong>
      <em>${item.tincture ? `${tinctureName(item.tincture)}, ` : ''}${def.blazon}</em>
      <div class="mini-stats"><span>⚔ ${def.power || 0}</span><span>⌂ ${def.ward || 0}</span><span>✦ ${def.prestige || 0}</span></div>
      ${!available ? `<small>${placement.reason || req.text}</small>` : `<small>${def.requires ? 'Связанный элемент' : 'Можно внести сейчас'}</small>`}
    `;
    card.addEventListener('click', () => selectItem(item.id));
    offerGrid.append(card);
  });
  renderSelection();
}

function selectItem(id) {
  selectedItemId = id;
  const item = campaign.offer.find((x) => x.id === id);
  const req = item ? requirementStatus(campaign, item.device) : { ok: false };
  playSound(req.ok ? 'select' : 'locked');
  if (!req.ok) vibrate(20);
  renderOffer();
  renderTargets(item);
}

function renderSelection() {
  const bar = $('#selectionBar');
  const item = campaign.offer.find((x) => x.id === selectedItemId);
  if (!item) { bar.hidden = true; renderTargets(null); return; }
  const def = elementDef(item);
  const req = requirementStatus(campaign, item.device);
  bar.hidden = false;
  $('#selectionName').textContent = def.name;
  $('#selectionDetail').textContent = req.ok ? (def.type === 'charge' ? 'Выбери свободное место на щите.' : def.blazon) : req.text;
  $('#sealButton').hidden = def.type === 'charge';
  $('#sealButton').disabled = !req.ok;
}

function commitPlacement(slot = null) {
  const item = campaign.offer.find((x) => x.id === selectedItemId);
  if (!item) return;
  const verdict = canPlaceElement(campaign, item, slot);
  if (!verdict.ok) { showToast(verdict.reason); playSound('locked'); vibrate(25); return; }
  const result = placeElement(campaign, item.id, slot);
  if (!result.ok) { showToast(result.reason); return; }
  $('#shieldFrame').classList.remove('is-sealing');
  void $('#shieldFrame').offsetWidth;
  $('#shieldFrame').classList.add('is-sealing');
  setTimeout(() => $('#shieldFrame').classList.remove('is-sealing'), 700);
  selectedItemId = null;
  playSound('seal');
  vibrate([15, 25, 35]);
  persist();
  renderCampaign();
  showToast(result.pendingTrial ? 'Герб готов к испытанию.' : 'Знак вписан в хронику.');
}

function renderCampaign() {
  if (!campaign) return;
  $('#chapterEyebrow').textContent = `ГЛАВА ${roman(campaign.chapter)}`;
  $('#chapterTitle').textContent = CHAPTER_NAMES[campaign.chapter] || 'Последняя хроника';
  renderTrack();
  renderArmorial();
  renderStats();
  renderOffer();
}

function renderMenu() {
  $('#soundButton').textContent = `Звук: ${settings.sound ? 'вкл' : 'выкл'}`;
  const button = $('#continueButton');
  const valid = campaign && !campaign.completed && !campaign.failed;
  button.hidden = !valid;
  if (valid) {
    const summary = campaignSummary(campaign);
    $('#continueCaption').textContent = `Глава ${roman(campaign.chapter)} · ${summary.combinations} формул · ${summary.integrity}/3 целостности`;
  }
}

function renderHouseGrid() {
  const grid = $('#houseGrid');
  grid.innerHTML = '';
  Object.values(HOUSES).forEach((house) => {
    const tincture = TINCTURES[house.field];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'house-card';
    card.innerHTML = `<div class="house-shield"><svg viewBox="0 0 100 112"><path d="${SHIELD_PATH}" fill="${tincture.color}"/><g transform="translate(26 31) scale(.48)" style="color:${house.field === 'gules' ? TINCTURES.or.color : TINCTURES.argent.color};--sigil-eye:#211a13">${symbolUse(house.founder)}</g><path d="${SHIELD_PATH}" fill="none" stroke="#c7a75d" stroke-width="2.4"/></svg></div><div><p>${house.motto}</p><strong>${house.name}</strong><span>${house.detail}</span></div>`;
    card.addEventListener('click', () => startCampaign(house.id));
    grid.append(card);
  });
}

function startCampaign(houseId) {
  campaign = createCampaign(houseId, Date.now());
  stats.runs += 1;
  selectedItemId = null;
  persist();
  closeDialog(houseDialog);
  showScreen('game');
  renderCampaign();
  playSound('seal');
  if (!settings.seenCodex) { settings.seenCodex = true; persist(); setTimeout(() => openDialog(codexDialog), 250); }
}

function continueCampaign() {
  if (!campaign) return;
  closeDialog(pauseDialog);
  showScreen('game');
  renderCampaign();
}

function openTrial() {
  if (!campaign?.pendingTrial || trialBusy) return;
  const preview = trialPreview(campaign);
  $('#trialEyebrow').textContent = `ИСПЫТАНИЕ ГЛАВЫ ${roman(campaign.chapter)}`;
  $('#trialTitle').textContent = preview.trial.name;
  $('#trialOpponent').textContent = preview.trial.opponent;
  $('#trialCopy').textContent = preview.trial.copy;
  $('#trialThreshold').textContent = preview.threshold;
  $('#trialScore').textContent = preview.base;
  $('#trialNeed').textContent = preview.threshold;
  $('#opponentShield').innerHTML = opponentShieldMarkup(preview.trial);
  $('#commandGrid').hidden = false;
  $('#trialPhases').hidden = true;
  $('#trialPhases').innerHTML = '';
  $('#trialContinue').hidden = true;
  openDialog(trialDialog);
}

async function runTrial(command) {
  if (trialBusy) return;
  trialBusy = true;
  $('#commandGrid').hidden = true;
  const result = resolveTrial(campaign, command);
  if (!result.ok) { trialBusy = false; showToast(result.reason || 'Испытание недоступно.'); return; }
  persist();
  const phases = $('#trialPhases');
  phases.hidden = false;
  phases.innerHTML = '';
  for (const phase of result.phases) {
    const article = document.createElement('article');
    article.innerHTML = `<i></i><div><span>${phase.title}</span><strong>${phase.text}</strong></div><b>${phase.value}</b>`;
    phases.append(article);
    requestAnimationFrame(() => article.classList.add('is-visible'));
    playSound('phase');
    vibrate(12);
    if (!reduceMotion) await new Promise((resolve) => setTimeout(resolve, 540));
  }
  stats.trialsWon += result.won ? 1 : 0;
  if (result.completed) stats.completed += 1;
  persist();
  playSound(result.won ? 'win' : 'lose');
  vibrate(result.won ? [20,40,20,40,60] : [60,40,60]);
  $('#trialResultCopy').textContent = result.won ? `Победа · ${result.score} против ${result.trial.threshold}` : `Поражение · потеряна целостность рода`;
  $('#trialContinue').hidden = false;
  trialBusy = false;
}

function afterTrial() {
  closeDialog(trialDialog);
  if (campaign.completed || campaign.failed) { renderEnding(); openDialog(endingDialog); return; }
  if (campaign.pendingPatronage) { renderPatronage(); openDialog(patronageDialog); return; }
  renderCampaign();
}

function renderPatronage() {
  const grid = $('#patronageGrid');
  grid.innerHTML = '';
  campaign.patronageOffer.forEach((id) => {
    const reward = PATRONAGE[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'patronage-card';
    button.innerHTML = `<i>${id === 'blackbook' ? '☠' : id === 'compass' ? '✥' : id === 'relic' ? '✝' : '✦'}</i><strong>${reward.name}</strong><span>${reward.detail}</span>`;
    button.addEventListener('click', () => {
      if (!choosePatronage(campaign, id)) return;
      persist();
      closeDialog(patronageDialog);
      renderCampaign();
      playSound('win');
      showToast(`${reward.name} теперь служит роду.`);
    });
    grid.append(button);
  });
}

function renderEnding() {
  const summary = campaignSummary(campaign);
  const victory = campaign.completed;
  $('#endingSeal').textContent = victory ? '♛' : '✢';
  $('#endingEyebrow').textContent = victory ? 'ХРОНИКА ЗАВЕРШЕНА' : 'РОД ПАЛ';
  $('#endingTitle').textContent = victory ? 'Герб стал законом новой эпохи' : 'Знамя осталось в архиве поражённых';
  $('#endingCopy').textContent = victory
    ? `Дом прошёл все четыре испытания. Его композицию теперь копируют те, кто ещё вчера называл её дерзостью.`
    : `Целостность рода исчерпана. Но открытые связи и знание геральдики останутся у следующей династии.`;
  $('#endingStats').innerHTML = `<span>Слава <b>${summary.renown}</b></span><span>Формулы <b>${summary.combinations}</b></span><span>Скандал <b>${summary.scandal}</b></span><span>Покровители <b>${campaign.patronage.length}</b></span>`;
}

function showFormulaCodex() {
  const result = evaluateHeraldry(campaign);
  const active = result.combos.map((x) => x.name).join(', ') || 'пока нет';
  showToast(`Активные формулы: ${active}.`);
}

$('#soundButton').addEventListener('click', () => { settings.sound = !settings.sound; persist(); renderMenu(); playSound('tap'); });
$('#newCampaignButton').addEventListener('click', () => openDialog(houseDialog));
$('#continueButton').addEventListener('click', continueCampaign);
$('#rulesButton').addEventListener('click', () => openDialog(codexDialog));
$('#codexButton').addEventListener('click', () => openDialog(codexDialog));
$('#pauseButton').addEventListener('click', () => openDialog(pauseDialog));
$('#resumeButton').addEventListener('click', () => closeDialog(pauseDialog));
$('#menuButton').addEventListener('click', () => { closeDialog(pauseDialog); showScreen('menu'); renderMenu(); });
$('#sealButton').addEventListener('click', () => commitPlacement(null));
$('#rejectButton').addEventListener('click', () => { if (rejectOffer(campaign)) { selectedItemId = null; persist(); renderCampaign(); playSound('tap'); } });
$('#trialButton').addEventListener('click', openTrial);
$('#trialContinue').addEventListener('click', afterTrial);
$('#formulaButton').addEventListener('click', showFormulaCodex);
$('#endingMenuButton').addEventListener('click', () => { closeDialog(endingDialog); showScreen('menu'); renderMenu(); });
$('#endingRestartButton').addEventListener('click', () => { closeDialog(endingDialog); openDialog(houseDialog); });
$$('[data-command]').forEach((button) => button.addEventListener('click', () => runTrial(button.dataset.command)));
$$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const open = $('dialog[open]');
    if (open && !trialBusy) closeDialog(open);
    else if (gameScreen.classList.contains('is-active')) openDialog(pauseDialog);
  }
});
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('appdatareset', () => {
  campaign = null;
  settings = store.get('settings');
  stats = store.get('stats');
  selectedItemId = null;
  showScreen('menu');
  renderMenu();
});

createWorkshopMode({
  appName: 'БЛАЗОН', version: '2.0.0', cachePrefix: 'blazon-', storageNamespace: 'pocket-works:blazon',
  onReset() { store.reset(); settings = store.get('settings'); stats = store.get('stats'); campaign = null; selectedItemId = null; $$('dialog[open]').forEach(closeDialog); showScreen('menu'); renderMenu(); }
});
watchConnectivity((online) => { document.documentElement.dataset.network = online ? 'online' : 'offline'; });

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
renderHouseGrid();
renderMenu();
showScreen('menu');
