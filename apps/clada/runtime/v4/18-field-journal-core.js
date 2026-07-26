/* КЛАДА 4.1 — чистые функции полевого журнала. */
globalThis.CladaFieldJournalCore = (() => {
  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const round = (value, digits = 3) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  };

  function weightedMean(demes, selector, fallback = 0) {
    const total = demes.reduce((sum, deme) => sum + Math.max(0, Number(deme.abundance) || 0), 0);
    if (!total) return fallback;
    return demes.reduce((sum, deme) => sum + (Number(selector(deme)) || 0) * Math.max(0, Number(deme.abundance) || 0), 0) / total;
  }

  function speciesSnapshot(community, speciesId) {
    const species = community?.species?.find((entry) => Number(entry.id) === Number(speciesId)) || null;
    const demes = (community?.demes || []).filter((deme) => Number(deme.speciesId) === Number(speciesId) && (deme.abundance || 0) > .02);
    const abundance = demes.reduce((sum, deme) => sum + (Number(deme.abundance) || 0), 0);
    const trend = demes.reduce((sum, deme) => sum + (Number(deme.trend) || 0), 0);
    const patches = new Set(demes.map((deme) => String(deme.patchId))).size;
    return {
      species,
      demes,
      abundance,
      trend,
      patches,
      meanFood: weightedMean(demes, (deme) => deme.foodRatio, 1),
      meanCompatibility: weightedMean(demes, (deme) => deme.compatibility, 1),
      meanPredation: weightedMean(demes, (deme) => deme.predationLoss, 0),
      meanGeneFlow: weightedMean(demes, (deme) => deme.geneFlow, 0),
      meanIsolation: weightedMean(demes, (deme) => deme.isolation, 0),
      meanCapacity: weightedMean(demes, (deme) => deme.carryingCapacity, 0),
      weakestDeme: [...demes].sort((a, b) => (a.abundance || 0) - (b.abundance || 0))[0] || null
    };
  }

  function pressureBreakdown(community, speciesId) {
    const snapshot = speciesSnapshot(community, speciesId);
    const { demes, abundance, trend } = snapshot;
    if (!demes.length) {
      return {
        direction: 'extinct',
        headline: 'Все локальные популяции исчезли',
        factors: [{ key: 'extinction', label: 'Потеря всех демов', score: 1, percent: 100, detail: 'У вида не осталось устойчивой локальной популяции.' }]
      };
    }

    const food = weightedMean(demes, (deme) => clamp01(1 - (deme.foodRatio ?? 1)));
    const predation = weightedMean(demes, (deme) => clamp01((deme.predationLoss || 0) / Math.max(1, (deme.abundance || 1) * .14)));
    const competition = weightedMean(demes, (deme) => {
      const capacity = Math.max(1, Number(deme.carryingCapacity) || 1);
      return clamp01(((deme.abundance || 0) / capacity - .68) / .62);
    });
    const mismatch = weightedMean(demes, (deme) => clamp01(1 - (deme.compatibility ?? 1)));
    const fragmentation = demes.length <= 1
      ? clamp01(.35 - snapshot.meanGeneFlow)
      : clamp01((1 - snapshot.meanGeneFlow) * .55 + snapshot.meanIsolation * .45);
    const bottleneck = weightedMean(demes, (deme) => clamp01((4.5 - (deme.abundance || 0)) / 4.5));

    const raw = [
      ['food', 'Недостаток пищи', food, `Средняя обеспеченность ресурсом — ${Math.round(snapshot.meanFood * 100)}%.`],
      ['predation', 'Хищническое давление', predation, `Потери от хищников заметны в ${demes.filter((deme) => (deme.predationLoss || 0) > .08).length} популяциях.`],
      ['competition', 'Переполнение ниши', competition, `Численность сравнивается с общей ёмкостью занятых участков.`],
      ['mismatch', 'Несоответствие среде', mismatch, `Средняя совместимость со средой — ${Math.round(snapshot.meanCompatibility * 100)}%.`],
      ['fragmentation', 'Фрагментация ареала', fragmentation, `Поток генов между демами — ${Math.round(snapshot.meanGeneFlow * 100)}%.`],
      ['bottleneck', 'Малые локальные популяции', bottleneck, `Самая малая дема содержит ${Math.max(0, Math.round(snapshot.weakestDeme?.abundance || 0))} особей.`]
    ].map(([key, label, score, detail]) => ({ key, label, score: clamp01(score), detail }));

    const meaningful = raw.filter((entry) => entry.score > .025).sort((a, b) => b.score - a.score);
    const selected = meaningful.slice(0, 4);
    const total = selected.reduce((sum, entry) => sum + entry.score, 0) || 1;
    const factors = selected.map((entry) => ({ ...entry, percent: Math.max(1, Math.round(entry.score / total * 100)) }));
    const direction = trend > Math.max(1, abundance * .018) ? 'growing' : trend < -Math.max(1, abundance * .018) ? 'declining' : 'stable';
    const headline = direction === 'growing'
      ? `Вид растёт: +${Math.round(trend)} за поколение`
      : direction === 'declining'
        ? `Вид сокращается: ${Math.round(trend)} за поколение`
        : 'Численность близка к равновесию';
    return { direction, headline, factors, snapshot };
  }

  function divergenceStage(deme = {}) {
    const progress = clamp01(deme.speciationProgress ?? deme.isolation ?? 0);
    const flow = clamp01(deme.geneFlow ?? deme.geneFlowEMA ?? 0);
    const age = Math.max(0, Number(deme.isolationAge ?? deme.age) || 0);
    const abundance = Math.max(0, Number(deme.abundance ?? deme.size) || 0);
    const ecological = clamp01(deme.ecologicalDivergence || 0);
    const divergence = clamp01((deme.divergence || 0) / .16);
    let index = 0;
    if (age >= 4 || ecological > .04 || divergence > .12) index = 1;
    if ((age >= 10 && flow < .34) || progress >= .28) index = 2;
    if ((age >= 18 && flow < .2 && (ecological > .08 || divergence > .3)) || progress >= .55) index = 3;
    if ((age >= 28 && flow < .1 && abundance >= 5) || progress >= .78) index = 4;
    const stages = [
      ['Стабильная популяция', 'Свободно обменивается генами с остальным видом.'],
      ['Локальная форма', 'Начала отличаться, но различия ещё легко стираются миграцией.'],
      ['Изолированная дема', 'Поток генов снизился, различия могут накапливаться.'],
      ['Экологический экотип', 'Занимает отдельную нишу и предпочитает собственную группу.'],
      ['Почти отдельный вид', 'Изоляция устойчива; требуется сохранить численность и различия.']
    ];
    const blockers = [];
    if (abundance < 5) blockers.push('слишком малая численность');
    if (flow > .16) blockers.push('высокий поток генов');
    if (age < 16) blockers.push('изоляция ещё слишком короткая');
    if (ecological < .06 && divergence < .22) blockers.push('недостаточное экологическое или генетическое расхождение');
    return {
      index,
      label: stages[index][0],
      description: stages[index][1],
      progress: Math.max(progress, index / 4),
      blockers,
      ready: index === 4 && !blockers.length
    };
  }

  function buildReplayBundle({ seed, originMode, commands, version = '4.1.0', createdGeneration = 0 } = {}) {
    const cleaned = (commands || [])
      .filter((command) => command && typeof command.type === 'string')
      .map((command) => {
        const entry = { g: Math.max(0, Math.round(Number(command.g) || 0)), type: command.type };
        for (const key of ['key', 'value', 'x', 'y', 'amount', 'seed', 'originMode']) {
          if (command[key] !== undefined) entry[key] = command[key];
        }
        return entry;
      })
      .sort((a, b) => a.g - b.g);
    return {
      schema: 'clada-replay-v1',
      app: 'КЛАДА',
      version,
      seed: String(seed || cleaned.find((entry) => entry.type === 'world-created')?.seed || 'garden'),
      originMode: originMode || cleaned.find((entry) => entry.type === 'world-created')?.originMode || 'mature',
      createdGeneration: Math.max(0, Math.round(Number(createdGeneration) || 0)),
      commands: cleaned.filter((entry) => entry.type !== 'world-created')
    };
  }

  function compactSeries(series = [], maxPoints = 160) {
    if (series.length <= maxPoints) return series.map((entry) => ({ ...entry }));
    const stride = Math.ceil(series.length / maxPoints);
    const output = [];
    for (let index = 0; index < series.length; index += stride) output.push({ ...series[index] });
    const last = series.at(-1);
    if (output.at(-1)?.g !== last?.g) output.push({ ...last });
    return output;
  }

  return { clamp01, round, weightedMean, speciesSnapshot, pressureBreakdown, divergenceStage, buildReplayBundle, compactSeries };
})();
