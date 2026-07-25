function openGenomeSheet(organism) {
  const species = state.species.find((entry) => entry.id === organism.speciesId);
  if (!species) return;
  openSheet('ГЕНОМНАЯ ЛИНЗА', species.common, `
    <div class="genome-summary">
      <div class="specimen-portrait"><canvas id="portraitCanvas" width="184" height="184"></canvas></div>
      <div class="specimen-meta">
        <small>${safeText(species.name)} · ВЕТВЬ ${species.id}</small>
        <p>Энергия: <b>${Math.max(0, organism.energy).toFixed(1)}</b><br>Возраст: <b>${Math.floor(organism.age / 22)}</b> условных сезонов<br>Поколение особи: <b>${organism.generation}</b></p>
        <p>${organism.genome.diet > .67 ? 'Активный хищник' : organism.genome.diet > .35 ? 'Всеядная форма' : 'Преимущественно растительноядная форма'}.</p>
      </div>
    </div>
    <div class="trait-list">${traitRows(organism.genome)}</div>
    <div class="lineage-note">${safeText(evolutionarySummary(species))}</div>
  `);
  requestAnimationFrame(() => {
    const portrait = document.querySelector('#portraitCanvas');
    if (!portrait) return;
    const portraitContext = portrait.getContext('2d');
    portraitContext.fillStyle = '#dfe2cd';
    portraitContext.fillRect(0, 0, portrait.width, portrait.height);
    drawOrganismShape(portraitContext, organism, portrait.width / 2, portrait.height / 2, 44, 0, true);
  });
}

function openSpeciesSheet(species) {
  if (!species) return;
  const currentCount = state.organisms.filter((entry) => entry.speciesId === species.id).length;
  const ancestor = findAncestorSpecies(species);
  openSheet('ФИЛОГЕНЕТИЧЕСКАЯ ВЕТВЬ', species.common, `
    <div class="specimen-meta">
      <small>${safeText(species.name)} · ВЕТВЬ ${species.id}</small>
      <p>Возникла в поколении <b>${species.born}</b>${species.extinct !== null ? `, исчезла в поколении <b>${species.extinct}</b>` : ', существует сейчас'}.</p>
      <p>Пик популяции: <b>${species.peak}</b>. Сейчас: <b>${currentCount}</b>. ${species.cause ? `Последний фактор гибели: <b>${safeText(species.cause)}</b>.` : ''}</p>
    </div>
    <div class="trait-list">${traitRows(species.centroid)}</div>
    <div class="lineage-note">${ancestor ? `Предковая ветвь: ${safeText(ancestor.common)}. ` : ''}${safeText(evolutionarySummary(species))}</div>
  `);
}

function openSheet(kicker, title, html) {
  sheetKicker.textContent = kicker;
  sheetTitle.textContent = title;
  sheetBody.innerHTML = html;
  backdrop.hidden = false;
  sheet.hidden = false;
}

function closeSheet() {
  backdrop.hidden = true;
  sheet.hidden = true;
  sheetBody.innerHTML = '';
}

function openCataclysmSheet() {
  openSheet('ДАВЛЕНИЕ ОТБОРА', 'Катаклизм', `
    <div class="sheet-grid">
      <button class="choice-row" data-shock="meteor"><b>I</b><span><strong>МЕТЕОРИТНЫЙ УДАР</strong><small>Локальная гибель, пепельная зима и резкое сжатие популяции.</small></span><em>3 поколения</em></button>
      <button class="choice-row" data-shock="ice"><b>II</b><span><strong>ЛЕДНИКОВЫЙ РЫВОК</strong><small>Температура падает. Выигрывают экономные и защищённые формы.</small></span><em>5 поколений</em></button>
      <button class="choice-row" data-shock="drought"><b>III</b><span><strong>ВЕЛИКАЯ ЗАСУХА</strong><small>Ресурсы исчезают. Метаболическая расточительность становится смертной.</small></span><em>5 поколений</em></button>
      <button class="choice-row" data-shock="red"><b>IV</b><span><strong>КРАСНЫЙ ПРИЛИВ</strong><small>Токсичный всплеск бьёт по травоядным и ускоряет мутации.</small></span><em>5 поколений</em></button>
    </div>
  `);
}

function openMenuSheet() {
  openSheet('КЛАДА / УПРАВЛЕНИЕ', 'Архив мира', `
    <div class="menu-list">
      <button type="button" data-menu="sound"><strong>Звук наблюдений</strong><span>${settings.sound ? 'включён' : 'выключен'}</span></button>
      <button type="button" data-menu="export"><strong>Экспортировать мир</strong><span>JSON</span></button>
      <button type="button" data-menu="import"><strong>Импортировать мир</strong><span>JSON</span></button>
      <button type="button" data-workshop-trigger><strong>Открыть сервис</strong><span>Workshop Mode</span></button>
      <button type="button" data-menu="about"><strong>Как это работает</strong><span>модель</span></button>
      <button type="button" class="danger" data-menu="reset"><strong>Создать новый мир</strong><span>сброс</span></button>
    </div>
  `);
}

function openAboutSheet() {
  openSheet('О МОДЕЛИ', 'Не бог, а среда', `
    <div class="lineage-note">Здесь нельзя вручную улучшить конкретное существо. Ты меняешь только условия, а наследование, мутации, конкуренция и случайность сами строят филогенетическое древо.</div>
    <div class="trait-list">
      <div class="trait"><span>НАСЛЕДОВАНИЕ</span><div>Потомок копирует геном с небольшими ошибками.</div><output>DNA</output></div>
      <div class="trait"><span>ОТБОР</span><div>Энергия зависит от пищи, климата, движения и защиты.</div><output>ENV</output></div>
      <div class="trait"><span>ВИД</span><div>Новая ветвь появляется при достаточном геномном расхождении.</div><output>ΔG</output></div>
      <div class="trait"><span>ДРЕЙФ</span><div>Малые популяции могут исчезнуть даже без явной ошибки.</div><output>RNG</output></div>
    </div>
  `);
}

function confirmReset() {
  openSheet('НЕОБРАТИМОЕ ДЕЙСТВИЕ', 'Стереть летопись?', `
    <p>Текущий мир, его виды и ископаемые снимки будут удалены. Экспортируй его заранее, если он нужен.</p>
    <div class="confirm-actions"><button type="button" data-confirm="cancel">ОТМЕНА</button><button type="button" class="primary" data-confirm="reset">СТЕРЕТЬ</button></div>
  `);
}

function exportWorld() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `clada-world-g${state.generation}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  tone(420, .07, .02, 'triangle');
  showToast('Архив мира экспортирован');
}

function importWorld(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      if (!validateImported(payload)) throw new Error('Неверный формат архива');
      state = payload;
      state.paused = false;
      state.view = 'world';
      state.fossilIndex = null;
      state.selectedId = null;
      state.selectedSpeciesId = null;
      state.seedMode = false;
      state.lens = Boolean(state.lens);
      closeSheet();
      syncAllUI();
      saveState();
      pulse([12, 25, 12]);
      showToast(`Мир восстановлен: поколение ${state.generation}`);
    } catch (error) {
      showToast(error.message || 'Не удалось прочитать архив', 3000);
    }
  };
  reader.onerror = () => showToast('Ошибка чтения файла', 3000);
  reader.readAsText(file);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  cssWidth = Math.max(1, rect.width);
  cssHeight = Math.max(1, rect.height);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function organismColor(genome, lightness = 43, alpha = 1) {
  const saturation = 30 + genome.pattern * 34;
  return `hsla(${genome.hue.toFixed(0)} ${saturation.toFixed(0)}% ${lightness}% / ${alpha})`;
}

function drawOrganismShape(targetContext, organism, x, y, scale, angle, portrait = false) {
  const genome = organism.genome;
  const bodyLength = scale * (1.1 + genome.size * .42);
  const bodyWidth = scale * (.56 + genome.size * .2);
  targetContext.save();
  targetContext.translate(x, y);
  targetContext.rotate(angle);

  targetContext.strokeStyle = '#1f2a24';
  targetContext.lineWidth = portrait ? 3 : Math.max(.7, scale * .055);
  targetContext.fillStyle = organismColor(genome, portrait ? 49 : 44, .95);

  const tail = bodyLength * (.42 + genome.speed * .2);
  targetContext.beginPath();
  targetContext.moveTo(-bodyLength * .38, 0);
  targetContext.quadraticCurveTo(-bodyLength * .55, -bodyWidth * .2, -tail, Math.sin(organism.id * 1.7 + state.step * .09) * bodyWidth * .35);
  targetContext.quadraticCurveTo(-bodyLength * .55, bodyWidth * .18, -bodyLength * .34, bodyWidth * .09);
  targetContext.closePath();
  targetContext.fill();
  targetContext.stroke();

  targetContext.beginPath();
  targetContext.ellipse(0, 0, bodyLength * .47, bodyWidth * .48, 0, 0, TAU);
  targetContext.fill();
  targetContext.stroke();

  const finCount = genome.armor > .58 ? 5 : genome.pattern > .55 ? 3 : 2;
  for (let index = 0; index < finCount; index += 1) {
    const px = lerp(-bodyLength * .28, bodyLength * .23, finCount === 1 ? .5 : index / (finCount - 1));
    const spike = bodyWidth * (.2 + genome.armor * .34);
    targetContext.beginPath();
    targetContext.moveTo(px - bodyLength * .07, -bodyWidth * .42);
    targetContext.lineTo(px, -bodyWidth * .42 - spike);
    targetContext.lineTo(px + bodyLength * .07, -bodyWidth * .41);
    targetContext.fillStyle = organismColor(genome, 37, .92);
    targetContext.fill();
    targetContext.stroke();
  }

  if (genome.diet > .45) {
    targetContext.beginPath();
    targetContext.moveTo(bodyLength * .41, -bodyWidth * .12);
    targetContext.lineTo(bodyLength * (.58 + genome.diet * .12), 0);
    targetContext.lineTo(bodyLength * .41, bodyWidth * .12);
    targetContext.fillStyle = '#e7e1cf';
    targetContext.fill();
    targetContext.stroke();
  }

  targetContext.fillStyle = '#e7e1cf';
  targetContext.beginPath();
  targetContext.arc(bodyLength * .22, -bodyWidth * .13, Math.max(1.3, scale * .08), 0, TAU);
  targetContext.fill();
  targetContext.stroke();
  targetContext.fillStyle = '#1f2a24';
  targetContext.beginPath();
  targetContext.arc(bodyLength * .235, -bodyWidth * .13, Math.max(.75, scale * .035), 0, TAU);
  targetContext.fill();

  if (genome.pattern > .35) {
    targetContext.globalAlpha = .38;
    targetContext.strokeStyle = '#e7e1cf';
    targetContext.lineWidth = portrait ? 4 : Math.max(.6, scale * .045);
    const stripes = 1 + Math.floor(genome.pattern * 3);
    for (let index = 0; index < stripes; index += 1) {
      const px = lerp(-bodyLength * .18, bodyLength * .16, stripes === 1 ? .5 : index / (stripes - 1));
      targetContext.beginPath();
      targetContext.moveTo(px, -bodyWidth * .34);
      targetContext.lineTo(px + bodyLength * .05, bodyWidth * .34);
      targetContext.stroke();
    }
  }
  targetContext.restore();
}

