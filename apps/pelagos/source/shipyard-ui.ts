import {
  DIMENSION_MODULES,
  OAR_MODULES,
  PALETTE_MODULES,
  SAIL_MODULES,
  getActiveShipLoadout,
  getShipModuleSelection,
  setActiveShipLoadout,
  setShipModule,
  setShipPalette,
  type ShipModuleSlot
} from './ship-loadout';

type SourceScreen = 'menu' | 'settings' | 'pause';

const shipyard = document.querySelector<HTMLElement>('#shipyard');
const closeButton = document.querySelector<HTMLButtonElement>('#closeShipyard');
const resetButton = document.querySelector<HTMLButtonElement>('#shipyardReset');
const options = document.querySelector<HTMLElement>('#shipyardOptions');
const title = document.querySelector<HTMLElement>('#shipyardCategoryTitle');
const summary = document.querySelector<HTMLElement>('#shipyardSummary');
const hullColor = document.querySelector<HTMLInputElement>('#shipHullColor');
const deckColor = document.querySelector<HTMLInputElement>('#shipDeckColor');
const sailColor = document.querySelector<HTMLInputElement>('#shipSailColor');
const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-shipyard-slot]'));

let activeSlot: ShipModuleSlot = 'dimensions';
let sourceScreen: SourceScreen = 'menu';

const labels: Record<ShipModuleSlot, string> = {
  dimensions: 'КОРПУС',
  palette: 'ОТДЕЛКА',
  sails: 'ПАРУСА',
  oars: 'ВЁСЛА'
};

function catalog(slot: ShipModuleSlot) {
  if (slot === 'dimensions') return DIMENSION_MODULES;
  if (slot === 'palette') return PALETTE_MODULES;
  if (slot === 'sails') return SAIL_MODULES;
  return OAR_MODULES;
}

function screen(id: SourceScreen): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${id}`);
}

function updateSummary(): void {
  if (!summary) return;
  const loadout = getActiveShipLoadout();
  summary.innerHTML = `
    <span><b>${loadout.dimensions.length.toFixed(1)} м</b><small>ДЛИНА</small></span>
    <span><b>${loadout.dimensions.beam.toFixed(1)} м</b><small>ШИРИНА</small></span>
    <span><b>${loadout.dimensions.draft.toFixed(2)} м</b><small>ОСАДКА</small></span>
    <span><b>${loadout.oars.stationsPerSide} × 2</b><small>ВЁСЛА</small></span>
  `;
  if (hullColor) hullColor.value = loadout.palette.hull;
  if (deckColor) deckColor.value = loadout.palette.deck;
  if (sailColor) sailColor.value = loadout.palette.sail;
}

function renderOptions(): void {
  if (!options || !title) return;
  title.textContent = labels[activeSlot];
  const current = getShipModuleSelection()[activeSlot];
  const entries = Object.values(catalog(activeSlot));
  options.replaceChildren();

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shipyard-option';
    button.dataset.selected = current === entry.id ? 'true' : 'false';
    button.dataset.moduleId = entry.id;

    if (activeSlot === 'palette') {
      const palette = PALETTE_MODULES[entry.id].value;
      const swatches = document.createElement('span');
      swatches.className = 'shipyard-swatches';
      for (const swatchColor of [palette.hull, palette.trim, palette.deck, palette.sail]) {
        const swatch = document.createElement('i');
        swatch.style.background = swatchColor;
        swatches.appendChild(swatch);
      }
      button.appendChild(swatches);
    }

    const copy = document.createElement('span');
    copy.className = 'shipyard-option-copy';
    const name = document.createElement('b');
    name.textContent = entry.label;
    const description = document.createElement('small');
    description.textContent = entry.description;
    copy.append(name, description);
    button.appendChild(copy);

    const mark = document.createElement('span');
    mark.className = 'shipyard-option-mark';
    mark.textContent = current === entry.id ? 'УСТАНОВЛЕНО' : 'ВЫБРАТЬ';
    button.appendChild(mark);

    button.addEventListener('click', () => {
      if (!setShipModule(activeSlot, entry.id)) return;
      renderOptions();
      updateSummary();
      document.dispatchEvent(new CustomEvent('pelagos:ship-customized', { detail: { slot: activeSlot, moduleId: entry.id } }));
    });
    options.appendChild(button);
  }
}

function showShipyard(from: SourceScreen): void {
  if (!shipyard) return;
  sourceScreen = from;
  screen(from)?.classList.add('hidden');
  shipyard.classList.remove('hidden');
  renderOptions();
  updateSummary();
}

function closeShipyard(): void {
  if (!shipyard) return;
  shipyard.classList.add('hidden');
  screen(sourceScreen)?.classList.remove('hidden');
}

function bindTrigger(id: string, source: SourceScreen): void {
  document.querySelector<HTMLButtonElement>(`#${id}`)?.addEventListener('click', () => showShipyard(source));
}

bindTrigger('shipyardButton', 'menu');
bindTrigger('settingsShipyardButton', 'settings');
bindTrigger('pauseShipyardButton', 'pause');
closeButton?.addEventListener('click', closeShipyard);

resetButton?.addEventListener('click', () => {
  setActiveShipLoadout('long-cutter');
  activeSlot = 'dimensions';
  for (const button of tabButtons) button.dataset.active = button.dataset.shipyardSlot === activeSlot ? 'true' : 'false';
  renderOptions();
  updateSummary();
});

for (const button of tabButtons) {
  button.addEventListener('click', () => {
    const slot = button.dataset.shipyardSlot as ShipModuleSlot | undefined;
    if (!slot) return;
    activeSlot = slot;
    for (const peer of tabButtons) peer.dataset.active = peer === button ? 'true' : 'false';
    renderOptions();
  });
}

function bindColor(input: HTMLInputElement | null, key: 'hull' | 'deck' | 'sail'): void {
  input?.addEventListener('input', () => {
    setShipPalette({ [key]: input.value });
    renderOptions();
    updateSummary();
  });
}

bindColor(hullColor, 'hull');
bindColor(deckColor, 'deck');
bindColor(sailColor, 'sail');

if (tabButtons[0]) tabButtons[0].dataset.active = 'true';
