function seedAt(x = randomRange(.18, .82), y = randomRange(.18, .82), amount = 12) {
  exitFossil();
  const parent = state.organisms.length ? choose(state.organisms) : null;
  const base = parent ? makeGenome(parent.genome, .36) : makeGenome();
  if (!parent) base.diet = randomRange(0, .3);
  const parentSpeciesId = parent?.speciesId ?? null;
  const speciesId = newSpecies(base, parentSpeciesId);
  for (let index = 0; index < amount && state.organisms.length < MAX_ORGANISMS; index += 1) {
    const angle = randomRange(0, TAU);
    const radius = randomRange(.002, .035);
    state.organisms.push(makeOrganism({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
      genome: makeGenome(base, .12),
      speciesId,
      generation: parent ? parent.generation + 1 : 0,
      energy: randomRange(8, 11),
      parentId: parent?.id ?? null
    }));
  }
  state.seedMode = false;
  seedButton.setAttribute('aria-pressed', 'false');
  emptyState.hidden = true;
  chord('birth');
  pulse(16);
  showToast(`Заселён новый основатель: ${state.species.find((entry) => entry.id === speciesId)?.common}`);
  updateReadouts();
  saveState();
}

function activeSnapshot() {
  if (state.fossilIndex === null) return null;
  return state.history[state.fossilIndex] || null;
}

function exitFossil() {
  if (!state || state.fossilIndex === null) return;
  state.fossilIndex = null;
  historyRange.value = historyRange.max;
  fossilBadge.hidden = true;
  nowButton.disabled = true;
  timeCaption.textContent = 'НАСТОЯЩЕЕ';
  updateReadouts();
}

function selectHistory(index) {
  if (!state.history.length) return;
  const resolvedIndex = clamp(Number(index), 0, state.history.length - 1);
  if (resolvedIndex >= state.history.length - 1) {
    exitFossil();
    return;
  }
  state.fossilIndex = resolvedIndex;
  const snapshot = activeSnapshot();
  historyRange.value = String(state.fossilIndex);
  fossilBadge.hidden = state.fossilIndex === state.history.length - 1;
  fossilGeneration.textContent = `G${String(snapshot.generation).padStart(3, '0')}`;
  nowButton.disabled = state.fossilIndex === state.history.length - 1;
  timeCaption.textContent = state.fossilIndex === state.history.length - 1 ? 'НАСТОЯЩЕЕ' : 'ИСКОПАЕМОЕ';
  clearSelection();
  updateReadouts();
}

function getVisibleOrganisms() {
  return activeSnapshot()?.organisms || state.organisms;
}

function visibleGeneration() {
  return activeSnapshot()?.generation ?? state.generation;
}

function activeSpeciesAtGeneration(generation) {
  return state.species.filter((species) => species.born <= generation && (species.extinct === null || species.extinct >= generation));
}

function updateReadouts() {
  if (!state) return;
  const snapshot = activeSnapshot();
  const population = snapshot?.population ?? state.organisms.length;
  const generation = snapshot?.generation ?? state.generation;
  const speciesCount = snapshot ? Object.values(snapshot.counts).filter((count) => count > 0).length : new Set(state.organisms.map((entry) => entry.speciesId)).size;
  generationOutput.textContent = String(generation).padStart(3, '0');
  populationOutput.textContent = String(population);
  speciesOutput.textContent = String(speciesCount);
  emptyState.hidden = !(state.view === 'world' && state.fossilIndex === null && population === 0);
}

function updateTimeline() {
  if (!state) return;
  historyRange.max = String(Math.max(0, state.history.length - 1));
  historyRange.value = String(state.fossilIndex ?? Math.max(0, state.history.length - 1));
  const first = state.history[0]?.generation ?? 0;
  pastLabel.textContent = `G${String(first).padStart(3, '0')}`;
  nowLabel.textContent = `G${String(state.generation).padStart(3, '0')}`;
}

function syncPressureUI() {
  if (!state) return;
  temperatureInput.value = String(Math.round(state.env.temperature * 100));
  foodInput.value = String(Math.round(state.env.food * 100));
  mutationInput.value = String(Math.round(state.env.mutation * 100));
  temperatureOutput.textContent = temperatureInput.value;
  foodOutput.textContent = foodInput.value;
  mutationOutput.textContent = mutationInput.value;
  const pressure = state.env.food < .28 || state.env.temperature < .22 || state.env.temperature > .8 ? 'жёсткое' : state.env.mutation > .65 ? 'нестабильное' : state.env.food > .74 && state.env.temperature > .35 && state.env.temperature < .68 ? 'мягкое' : 'умеренное';
  pressureSummary.textContent = state.shock ? shockLabel(state.shock.type) : pressure;
}

function syncTransportUI() {
  if (!state) return;
  playGlyph.classList.toggle('playing', state.paused);
  playButton.setAttribute('aria-label', state.paused ? 'Продолжить' : 'Пауза');
  speedButton.textContent = ['×1', '×4', '×16'][state.speedIndex] || '×1';
}

function syncViewUI() {
  if (!state) return;
  viewTabs.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  document.querySelector('#liveReadout').hidden = state.view !== 'world';
  specimenLabel.hidden = state.view !== 'world' || !state.selectedId;
  emptyState.hidden = !(state.view === 'world' && state.fossilIndex === null && state.organisms.length === 0);
}

function syncAllUI() {
  syncSoundButton();
  syncPressureUI();
  syncTransportUI();
  syncViewUI();
  updateTimeline();
  updateReadouts();
  lensButton.setAttribute('aria-pressed', String(Boolean(state?.lens)));
  seedButton.setAttribute('aria-pressed', String(Boolean(state?.seedMode)));
}

function clearSelection() {
  if (!state) return;
  state.selectedId = null;
  state.selectedSpeciesId = null;
  specimenLabel.hidden = true;
}

function selectOrganism(organism, openImmediately = false) {
  if (!organism) return;
  const repeated = state.selectedId === organism.id;
  state.selectedId = organism.id;
  state.selectedSpeciesId = organism.speciesId;
  const species = state.species.find((entry) => entry.id === organism.speciesId);
  specimenSpecies.textContent = `${species?.name || 'НЕОПРЕДЕЛЁННЫЙ ВИД'} / G${organism.generation}`;
  specimenName.textContent = species?.common || 'неизвестная форма';
  specimenHint.textContent = state.lens ? 'геном открыт линзой отбора' : 'коснись ещё раз для генома';
  specimenLabel.hidden = false;
  pulse(7);
  if (repeated || openImmediately || state.lens) openGenomeSheet(organism);
}

function selectedOrganism() {
  if (!state?.selectedId) return null;
  return getVisibleOrganisms().find((entry) => entry.id === state.selectedId) || null;
}

function traitRows(genome) {
  const traits = [
    ['РАЗМЕР', genome.size, .42, 1.72],
    ['СКОРОСТЬ', genome.speed, .28, 1.8],
    ['ЗРЕНИЕ', genome.vision, .25, 1.75],
    ['ЭКОНОМИЯ', 1.7 - genome.metabolism, .05, 1.32],
    ['ТЕПЛОЛЮБИЕ', genome.thermal, 0, 1],
    ['ХИЩНОСТЬ', genome.diet, 0, 1],
    ['БРОНЯ', genome.armor, 0, 1],
    ['ПЛОДОВИТОСТЬ', genome.fertility, .35, 1.7]
  ];
  return traits.map(([label, value, min, max]) => {
    const percent = clamp((value - min) / (max - min)) * 100;
    return `<div class="trait"><span>${label}</span><div class="trait-track"><i style="width:${percent.toFixed(1)}%"></i></div><output>${Math.round(percent)}</output></div>`;
  }).join('');
}

function findAncestorSpecies(species) {
  if (!species?.parentId) return null;
  return state.species.find((entry) => entry.id === species.parentId) || null;
}

function evolutionarySummary(species) {
  const ancestor = findAncestorSpecies(species);
  if (!ancestor) return 'Основатель этой линии. Все дальнейшие различия считаются относительно него.';
  const a = ancestor.centroid;
  const b = species.centroid;
  const deltas = [
    ['крупнее', b.size - a.size], ['быстрее', b.speed - a.speed], ['зорче', b.vision - a.vision],
    ['хищнее', b.diet - a.diet], ['лучше защищён', b.armor - a.armor], ['теплолюбивее', b.thermal - a.thermal]
  ].sort((left, right) => Math.abs(right[1]) - Math.abs(left[1])).slice(0, 2);
  const phrases = deltas.map(([label, delta]) => delta >= 0 ? label : ({ крупнее: 'мельче', быстрее: 'медленнее', зорче: 'близорукее', хищнее: 'травояднее', 'лучше защищён': 'менее защищён', теплолюбивее: 'холодоустойчивее' })[label]);
  return `По сравнению с предком ${ancestor.common} эта ветвь стала ${phrases.join(' и ')}. Геномная дистанция: ${genomeDistance(a, b).toFixed(2)}.`;
}

