/* КЛАДА 3.0 — geography and ecological inspection surfaces. */
const livingUiLegacy = {
  drawWorld,
  openGenomeSheet,
  openSpeciesSheet,
  openMenuSheet,
  updateReadouts,
  selectHistory,
  exitFossil
};

function livingSpeciesById(id) {
  return state.species.find((species) => species.id === Number(id)) || null;
}

function livingTopRelations(map, limit = 3) {
  return Object.entries(map || {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([id]) => livingSpeciesById(id))
    .filter(Boolean);
}

function livingRelationText(species, key, emptyText) {
  const relations = livingTopRelations(state.foodWeb?.[species.id]?.[key]);
  return relations.length ? relations.map((entry) => entry.common).join(', ') : emptyText;
}

function livingTrendLabel(species) {
  const trend = species.populationTrend || 0;
  if (trend > 3) return `растёт (+${trend})`;
  if (trend > 0) return `медленно растёт (+${trend})`;
  if (trend < -3) return `сокращается (${trend})`;
  if (trend < 0) return `медленно сокращается (${trend})`;
  return 'стабильна';
}

function livingSexLabel(organism) {
  if (organism.sex === 2) return organism.genome.reproMode < .18 ? 'бесполая линия' : 'гермафродит';
  return organism.sex === 0 ? 'самка' : 'самец';
}

function livingPopulationName(key) {
  if (!key) return 'неопределённая популяция';
  const [biome, side] = key.split(':');
  const biomeNames = {
    water: 'речная',
    coast: 'прибрежная',
    mountain: 'горная',
    dry: 'степная',
    wet: 'низинная',
    tundra: 'северная',
    meadow: 'равнинная'
  };
  return `${side === 'W' ? 'западная' : 'восточная'} ${biomeNames[biome] || biome}`;
}

function livingPopulationRows(species) {
  const populations = Object.values(species.populations || {}).sort((a, b) => b.count - a.count);
  if (!populations.length) return '<div class="ecology-empty">Устойчивые локальные популяции ещё не выделены.</div>';
  return populations.map((population) => {
    const isolation = population.isolation >= LIVING_POPULATION_SPLIT_AGE
      ? 'репродуктивно отделилась'
      : population.isolation > 0
        ? `изоляция ${population.isolation}/${LIVING_POPULATION_SPLIT_AGE}`
        : 'обменивается генами';
    const trend = population.trend > 0 ? `+${population.trend}` : String(population.trend || 0);
    return `<div class="population-row">
      <div><strong>${safeText(livingPopulationName(population.key))}</strong><small>${safeText(isolation)}</small></div>
      <b>${population.count}</b><em>${trend}</em>
    </div>`;
  }).join('');
}

function livingCompatibility(species) {
  return state.species
    .filter((candidate) => candidate.id !== species.id && candidate.extinct === null)
    .map((candidate) => ({
      species: candidate,
      distance: genomeDistance(species.centroid, candidate.centroid),
      chromosomeGap: Math.abs((species.centroid.chromosome || 2) - (candidate.centroid.chromosome || 2))
    }))
    .filter((entry) => entry.distance < .72 && entry.chromosomeGap <= 1)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
}

function livingDrawRangeMap(canvas, species) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.fillStyle = '#d8d2bd';
  context.fillRect(0, 0, width, height);
  const columns = 30;
  const rows = 18;
  const cellW = width / columns;
  const cellH = height / rows;
  const colors = {
    water: 'rgba(75,119,129,.62)',
    coast: 'rgba(83,132,134,.46)',
    mountain: 'rgba(93,91,77,.46)',
    dry: 'rgba(154,89,70,.3)',
    wet: 'rgba(76,121,77,.35)',
    tundra: 'rgba(128,145,144,.34)',
    meadow: 'rgba(103,132,82,.24)'
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + .5) / columns;
      const y = (row + .5) / rows;
      const biome = livingBiomeAt(x, y);
      context.fillStyle = colors[biome.id];
      context.fillRect(column * cellW, row * cellH, cellW + .5, cellH + .5);
    }
  }
  const organisms = state.organisms.filter((organism) => organism.speciesId === species.id);
  context.fillStyle = organismColor(species.centroid, 35, .95);
  context.strokeStyle = '#e7e1cf';
  context.lineWidth = 1.1;
  for (const organism of organisms) {
    context.beginPath();
    context.arc(organism.x * width, organism.y * height, 2.6, 0, TAU);
    context.fill();
    context.stroke();
  }
  context.strokeStyle = 'rgba(31,42,36,.55)';
  context.lineWidth = 1;
  context.strokeRect(.5, .5, width - 1, height - 1);
}

function livingDrawSexPortraits(canvas, species) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.fillStyle = '#dfe2cd';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const display = species.centroid.sexualDisplay || 0;
  const femaleGenome = deepClone(species.centroid);
  const maleGenome = deepClone(species.centroid);
  femaleGenome.size = clamp(femaleGenome.size * (1 + display * .045), .42, 1.72);
  maleGenome.hue = (maleGenome.hue + display * 18) % 360;
  maleGenome.pattern = clamp(maleGenome.pattern + display * .14);
  const female = { id: species.id * 7, genome: femaleGenome };
  const male = { id: species.id * 11 + 1, genome: maleGenome };
  drawOrganismShape(context, female, canvas.width * .32, canvas.height * .53, 32, 0, true);
  drawOrganismShape(context, male, canvas.width * .7, canvas.height * .53, 30, Math.PI, true);
  context.fillStyle = 'rgba(31,42,36,.68)';
  context.font = '700 8px ui-sans-serif,system-ui';
  context.textAlign = 'center';
  context.fillText(species.centroid.reproMode < .43 ? 'ЕДИНАЯ ФОРМА' : 'САМКА', canvas.width * .32, canvas.height - 10);
  context.fillText(species.centroid.reproMode < .43 ? 'ПОТОМОК' : 'САМЕЦ', canvas.width * .7, canvas.height - 10);
}

function livingTraitSummary(genome) {
  const compromises = [];
  if (genome.shell > .55 || genome.armor > .68) compromises.push('защита снижает скорость и плодовитость');
  if (genome.wing > .62) compromises.push('полёт требует высокой ежедневной энергии');
  if (genome.size > 1.22) compromises.push('крупное тело замедляет размножение');
  if (genome.vision > 1.25 || genome.social > .75) compromises.push('сложное поведение увеличивает обмен веществ');
  if (genome.fur > .58) compromises.push('покров помогает в холоде, но опасен в жаре');
  if (genome.broodSize > .72) compromises.push('многочисленный выводок получает меньше заботы');
  return compromises.length ? compromises.join('; ') : 'выраженного доминирующего компромисса нет';
}

openGenomeSheet = function livingOpenGenomeSheet(organism) {
  if (!organism) return;
  ensureLivingGenome(organism.genome);
  const species = livingSpeciesById(organism.speciesId);
  if (!species) return;
  const biome = livingBiomeAt(organism.x, organism.y);
  const population = species.populations?.[organism.populationKey];
  openSheet('ПОЛЕВОЙ ПАСПОРТ', species.common, `
    <div class="genome-summary">
      <div class="specimen-portrait"><canvas id="portraitCanvas" width="184" height="184"></canvas></div>
      <div class="specimen-meta">
        <small>${safeText(species.name)} · ВЕТВЬ ${species.id}${organism.hybrid ? ' · ГИБРИД' : ''}</small>
        <p><b>${safeText(livingSexLabel(organism))}</b><br>Энергия: <b>${Math.max(0, organism.energy).toFixed(1)}</b><br>Возраст: <b>${Math.floor(organism.age / 22)}</b> сезонов</p>
        <p>${safeText(ph(organism.genome))}</p>
      </div>
    </div>
    <div class="ecology-facts">
      <div><small>ПОПУЛЯЦИЯ</small><strong>${safeText(livingPopulationName(organism.populationKey))}</strong><span>${population ? `${population.count} особей · изоляция ${population.isolation}` : 'новая миграционная группа'}</span></div>
      <div><small>СРЕДА</small><strong>${safeText(biome.name)}</strong><span>пригодность ${(livingHabitatSuitability(organism.genome, biome) * 100).toFixed(0)}%</span></div>
      <div><small>ПИТАНИЕ</small><strong>${safeText(livingFeedingRole(organism.genome))}</strong><span>${safeText(organism.lastFoodType || 'давно не питался')}</span></div>
      <div><small>РАЗМНОЖЕНИЕ</small><strong>${safeText(livingReproductionLabel(organism.genome))}</strong><span>забота ${(organism.genome.parentalCare * 100).toFixed(0)}%</span></div>
    </div>
    <div class="ecology-note"><b>Поведение:</b> ${safeText(livingBehaviorLabels(organism.genome).join(', '))}.</div>
    <div class="trait-list">${traitRows(organism.genome)}${extraRows(organism.genome)}</div>
    <div class="lineage-note"><b>Цена специализации:</b> ${safeText(livingTraitSummary(organism.genome))}. ${safeText(evolutionarySummary(species))}</div>
  `);
  requestAnimationFrame(() => {
    const portrait = document.querySelector('#portraitCanvas');
    if (!portrait) return;
    const portraitContext = portrait.getContext('2d');
    portraitContext.fillStyle = '#dfe2cd';
    portraitContext.fillRect(0, 0, portrait.width, portrait.height);
    drawOrganismShape(portraitContext, organism, portrait.width / 2, portrait.height / 2, 44, 0, true);
  });
};

openSpeciesSheet = function livingOpenSpeciesSheet(species) {
  if (!species) return;
  ensureLivingGenome(species.centroid);
  const current = state.organisms.filter((organism) => organism.speciesId === species.id);
  const ancestor = findAncestorSpecies(species);
  const hybridParent = species.hybridParentId ? livingSpeciesById(species.hybridParentId) : null;
  const compatibility = livingCompatibility(species);
  const role = state.foodWeb?.[species.id]?.role || livingFeedingRole(species.centroid);
  const behaviors = livingBehaviorLabels(species.centroid);
  const populations = Object.values(species.populations || {});
  const mainPopulation = species.mainPopulationKey ? species.populations?.[species.mainPopulationKey] : null;
  openSheet('ЭКОЛОГИЧЕСКИЙ ПАСПОРТ', species.common, `
    <div class="species-hero">
      <canvas id="speciesSexPortraits" width="260" height="140"></canvas>
      <div>
        <small>${safeText(species.name)} · ВЕТВЬ ${species.id}${species.hybrid ? ' · ГИБРИДНАЯ' : ''}</small>
        <p>Возникла в поколении <b>${species.born}</b>${species.extinct !== null ? `, исчезла в поколении <b>${species.extinct}</b>` : ', существует сейчас'}.</p>
        <p>Сейчас <b>${current.length}</b> особей в <b>${populations.length}</b> устойчивых популяциях. Численность ${safeText(livingTrendLabel(species))}.</p>
      </div>
    </div>
    <div class="range-map">
      <div class="section-label"><span>АРЕАЛ</span><b>${safeText(mainPopulation ? livingPopulationName(mainPopulation.key) : species.habitatRole || livingHabitatRole(species.centroid))}</b></div>
      <canvas id="speciesRangeMap" width="420" height="190"></canvas>
    </div>
    <div class="ecology-facts">
      <div><small>РОЛЬ</small><strong>${safeText(role)}</strong><span>${safeText(livingHabitatRole(species.centroid))} форма</span></div>
      <div><small>РАЦИОН</small><strong>${safeText(livingRelationText(species, 'prey', role === 'хищник' ? 'добыча пока не установлена' : 'растения и мелкие ресурсы'))}</strong><span>основные источники энергии</span></div>
      <div><small>ХИЩНИКИ</small><strong>${safeText(livingRelationText(species, 'predators', 'нет подтверждённых'))}</strong><span>зафиксированные нападения</span></div>
      <div><small>КОНКУРЕНТЫ</small><strong>${safeText(livingRelationText(species, 'competitors', 'нет прямых'))}</strong><span>перекрытие ниши и ареала</span></div>
    </div>
    <div class="section-label"><span>ЛОКАЛЬНЫЕ ПОПУЛЯЦИИ</span><b>${populations.length}</b></div>
    <div class="population-list">${livingPopulationRows(species)}</div>
    <div class="ecology-note"><b>Поведение:</b> ${safeText(behaviors.join(', '))}. <b>Размножение:</b> ${safeText(livingReproductionLabel(species.centroid))}.</div>
    <div class="ecology-note"><b>Совместимость:</b> ${compatibility.length
      ? compatibility.map((entry) => `${safeText(entry.species.common)} (${Math.round((1 - entry.distance / .72) * 100)}%)`).join(', ')
      : 'близких совместимых видов сейчас нет'}.</div>
    <div class="trait-list">${traitRows(species.centroid)}${extraRows(species.centroid)}</div>
    <div class="lineage-note">${ancestor ? `Предковая ветвь: ${safeText(ancestor.common)}. ` : ''}${hybridParent ? `Вторая родительская ветвь: ${safeText(hybridParent.common)}. ` : ''}<b>Цена специализации:</b> ${safeText(livingTraitSummary(species.centroid))}. ${safeText(evolutionarySummary(species))}</div>
  `);
  requestAnimationFrame(() => {
    livingDrawSexPortraits(document.querySelector('#speciesSexPortraits'), species);
    livingDrawRangeMap(document.querySelector('#speciesRangeMap'), species);
  });
};

function livingFoodWebRows() {
  const current = state.species.filter((species) => species.extinct === null)
    .sort((a, b) => state.organisms.filter((organism) => organism.speciesId === b.id).length - state.organisms.filter((organism) => organism.speciesId === a.id).length);
  return current.map((species) => {
    const count = state.organisms.filter((organism) => organism.speciesId === species.id).length;
    const role = state.foodWeb?.[species.id]?.role || livingFeedingRole(species.centroid);
    const prey = livingRelationText(species, 'prey', role === 'хищник' ? 'не установлена' : 'первичные ресурсы');
    const predators = livingRelationText(species, 'predators', 'нет');
    return `<button type="button" class="foodweb-row" data-food-species="${species.id}">
      <i style="--species-hue:${species.hue || species.centroid.hue}"></i>
      <span><strong>${safeText(species.common)}</strong><small>${safeText(role)} · ${count} особей</small></span>
      <em><b>пища:</b> ${safeText(prey)}<br><b>опасность:</b> ${safeText(predators)}</em>
    </button>`;
  }).join('');
}

function openLivingFoodWeb() {
  livingComputeFoodWeb();
  openSheet('СВЯЗИ БИОСФЕРЫ', 'Пищевая сеть', `
    <div class="ecology-note">Связи основаны на реально зафиксированном питании и пересечении ареалов. Нажми на вид, чтобы открыть полный паспорт.</div>
    <div class="foodweb-list">${livingFoodWebRows()}</div>
    <div class="world-stat-strip">
      <span><small>РОЖДЕНИЯ</small><b>${state.worldStats?.births || 0}</b></span>
      <span><small>ГИБРИДЫ</small><b>${state.worldStats?.hybridBirths || 0}</b></span>
      <span><small>НАПАДЕНИЯ</small><b>${state.worldStats?.predations || 0}</b></span>
      <span><small>СМЕРТИ</small><b>${state.worldStats?.deaths || 0}</b></span>
    </div>
  `);
}

openMenuSheet = function livingOpenMenuSheet() {
  openSheet('КЛАДА / УПРАВЛЕНИЕ', 'Архив мира', `
    <div class="menu-list">
      <button type="button" data-menu="foodweb"><strong>Пищевая сеть</strong><span>виды и связи</span></button>
      <button type="button" data-menu="sound"><strong>Звук наблюдений</strong><span>${settings.sound ? 'включён' : 'выключен'}</span></button>
      <button type="button" data-menu="export"><strong>Экспортировать мир</strong><span>JSON</span></button>
      <button type="button" data-menu="import"><strong>Импортировать мир</strong><span>JSON</span></button>
      <button type="button" data-menu="workshop"><strong>Открыть сервис</strong><span>Workshop Mode</span></button>
      <button type="button" data-menu="about"><strong>Как это работает</strong><span>модель 3.0</span></button>
      <button type="button" class="danger" data-menu="reset"><strong>Создать новый мир</strong><span>сброс</span></button>
    </div>
  `);
};

sheetBody.addEventListener('click', (event) => {
  const foodMenu = event.target.closest('[data-menu="foodweb"]');
  if (foodMenu) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openLivingFoodWeb();
    return;
  }
  const workshopMenu = event.target.closest('[data-menu="workshop"]');
  if (workshopMenu) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSheet();
    document.querySelector('.action-rail [data-workshop-trigger]')?.click();
    return;
  }
  const speciesButton = event.target.closest('[data-food-species]');
  if (speciesButton) {
    event.preventDefault();
    openSpeciesSheet(livingSpeciesById(speciesButton.dataset.foodSpecies));
  }
}, { capture: true });

function livingOverlayColor(biomeId) {
  return {
    water: 'rgba(53,104,121,.08)',
    coast: 'rgba(53,104,121,.055)',
    mountain: 'rgba(56,54,45,.065)',
    dry: 'rgba(150,86,62,.055)',
    wet: 'rgba(57,112,64,.06)',
    tundra: 'rgba(106,129,132,.055)',
    meadow: 'rgba(86,116,69,.025)'
  }[biomeId] || 'transparent';
}

function livingDrawWorldOverlay() {
  const columns = 24;
  const rows = 16;
  const cellW = cssWidth / columns;
  const cellH = cssHeight / rows;
  ctx.save();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + .5) / columns;
      const y = (row + .5) / rows;
      const biome = livingBiomeAt(x, y);
      ctx.fillStyle = livingOverlayColor(biome.id);
      ctx.fillRect(column * cellW, row * cellH, cellW + .8, cellH + .8);
    }
  }

  for (const patch of state.resources?.plankton || []) {
    if (patch.energy < .12) continue;
    const x = patch.x * cssWidth;
    const y = patch.y * cssHeight;
    ctx.fillStyle = `rgba(222,232,194,${.16 + patch.energy * .045})`;
    ctx.beginPath();
    ctx.arc(x, y, 2 + Math.sqrt(patch.energy), 0, TAU);
    ctx.fill();
  }
  for (const carrion of state.resources?.carrion || []) {
    const x = carrion.x * cssWidth;
    const y = carrion.y * cssHeight;
    ctx.strokeStyle = `rgba(91,55,43,${.24 + carrion.energy * .06})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y - 2.5);
    ctx.lineTo(x + 2.5, y + 2.5);
    ctx.moveTo(x + 2.5, y - 2.5);
    ctx.lineTo(x - 2.5, y + 2.5);
    ctx.stroke();
  }

  if (state.lens && state.selectedSpeciesId) {
    const species = livingSpeciesById(state.selectedSpeciesId);
    if (species) {
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = organismColor(species.centroid, 34, .62);
      for (const population of Object.values(species.populations || {})) {
        const radius = 18 + Math.sqrt(population.count) * 3.5;
        ctx.beginPath();
        ctx.arc(population.x * cssWidth, population.y * cssHeight, radius, 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

drawWorld = function livingDrawWorld() {
  livingUiLegacy.drawWorld();
  if (!state || state.view !== 'world') return;
  const camera = typeof CAM !== 'undefined' ? CAM.world : { zoom: 1, x: 0, y: 0 };
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  livingDrawWorldOverlay();
  ctx.restore();

  ctx.fillStyle = 'rgba(231,225,207,.84)';
  ctx.strokeStyle = 'rgba(31,42,36,.2)';
  ctx.lineWidth = 1;
  ctx.fillRect(cssWidth - 116, 12, 104, 24);
  ctx.strokeRect(cssWidth - 116, 12, 104, 24);
  ctx.fillStyle = '#1f2a24';
  ctx.font = '700 8px ui-sans-serif,system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(`СЕЗОН ${Math.floor(livingSeason() * 4) + 1} · ${livingDaylight() > .5 ? 'ДЕНЬ' : 'НОЧЬ'}`, cssWidth - 64, 27);
};

updateReadouts = function livingUpdateReadouts() {
  livingUiLegacy.updateReadouts();
  if (!state) return;
  let populations = document.querySelector('#populationGroups');
  if (!populations) {
    const liveReadout = document.querySelector('#liveReadout');
    const container = document.createElement('span');
    container.innerHTML = '<i class="dot population-group-dot"></i><b id="populationGroups">0</b> популяций';
    liveReadout?.append(container);
    populations = container.querySelector('#populationGroups');
  }
  const count = state.species
    .filter((species) => species.extinct === null)
    .reduce((sum, species) => sum + Object.keys(species.populations || {}).length, 0);
  populations.textContent = String(count);
};

selectHistory = function livingSelectHistory(index) {
  livingUiLegacy.selectHistory(index);
  const snapshot = activeSnapshot();
  if (snapshot?.generation < 0) timeCaption.textContent = 'ПРЕДЫСТОРИЯ';
};

exitFossil = function livingExitFossil() {
  livingUiLegacy.exitFossil();
  if (state?.fossilIndex === null) timeCaption.textContent = 'НАСТОЯЩЕЕ';
};

const livingSeedContainer = document.querySelector('.world-seeds');
if (livingSeedContainer && !livingSeedContainer.querySelector('[data-seed="origin"]')) {
  const originButton = document.createElement('button');
  originButton.type = 'button';
  originButton.dataset.seed = 'origin';
  originButton.innerHTML = '<b>04</b><span><strong>ПЕРВИЧНАЯ КОЛОНИЯ</strong><small>три молодые линии, почти без предыстории</small></span>';
  livingSeedContainer.append(originButton);
}

const seedLabels = {
  garden: ['ЗРЕЛАЯ БИОСФЕРА', '8 видов, мягкий климат и древняя история'],
  rift: ['ЛЕДЯНАЯ БИОСФЕРА', '8 видов, холодные барьеры и миграции'],
  red: ['ХИЩНАЯ БИОСФЕРА', '8 видов, сильная конкуренция и падальщики']
};
for (const [seed, [title, subtitle]] of Object.entries(seedLabels)) {
  const button = document.querySelector(`[data-seed="${seed}"]`);
  if (!button) continue;
  const strong = button.querySelector('strong');
  const small = button.querySelector('small');
  if (strong) strong.textContent = title;
  if (small) small.textContent = subtitle;
}
const introParagraph = document.querySelector('.intro-copy p');
if (introParagraph) introParagraph.textContent = 'Открой уже сложившийся живой мир или начни с молодой колонии. Меняй среду и наблюдай, как география, пищевые связи и изоляция перестраивают эволюционное древо.';

updateReadouts();
