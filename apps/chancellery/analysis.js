function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function ratio(value, total) {
  const left = finite(value);
  const right = finite(total);
  return left !== null && right > 0 ? left / right : null;
}

function round(value, digits = 2) {
  const numeric = finite(value);
  if (numeric === null) return null;
  const power = 10 ** digits;
  return Math.round(numeric * power) / power;
}

function metric(snapshot, path) {
  return path.split('.').reduce((value, key) => value?.[key], snapshot);
}

function locationMap(snapshot) {
  return new Map((snapshot?.locations || []).map((location) => [String(location.id), location]));
}

function change(before, after) {
  const left = finite(before);
  const right = finite(after);
  if (left === null || right === null) return { before: left, after: right, delta: null, percent: null };
  const delta = right - left;
  return {
    before: left,
    after: right,
    delta: round(delta),
    percent: left === 0 ? null : round((delta / Math.abs(left)) * 100, 1)
  };
}

const METRICS = [
  ['treasury', 'Казна', 'economy.treasury'],
  ['income', 'Доход', 'economy.income'],
  ['expenses', 'Расходы', 'economy.expenses'],
  ['balance', 'Баланс', 'economy.balance'],
  ['debt', 'Долг', 'economy.totalDebt'],
  ['population', 'Население', 'country.population'],
  ['territories', 'Территории', 'country.territoryCount'],
  ['control', 'Средний контроль', 'country.averageControl'],
  ['manpower', 'Людские ресурсы', 'country.manpower'],
  ['soldiers', 'Солдаты', 'military.soldiers'],
  ['ships', 'Корабли', 'military.ships']
];

export function campaignKey(snapshot) {
  return snapshot?.campaignKey || `${snapshot?.metadata?.tag || 'unknown'}:${snapshot?.metadata?.startDate || 'unknown'}`;
}

export function compareSnapshots(base, current) {
  if (!base || !current) return null;
  const metrics = METRICS.map(([id, label, path]) => ({ id, label, path, ...change(metric(base, path), metric(current, path)) }));
  const beforeLocations = locationMap(base);
  const afterLocations = locationMap(current);
  const locationChanges = [];
  const ids = new Set([...beforeLocations.keys(), ...afterLocations.keys()]);
  for (const id of ids) {
    const before = beforeLocations.get(id);
    const after = afterLocations.get(id);
    const population = change(before?.population, after?.population);
    const control = change(before?.control, after?.control);
    const ownerChanged = Boolean(before && after && before.owner !== after.owner);
    const status = !before ? 'gained' : !after ? 'lost' : ownerChanged ? 'transferred' : 'kept';
    if (status !== 'kept' || Math.abs(population.delta || 0) > 0 || Math.abs(control.delta || 0) > 0.01) {
      locationChanges.push({
        id,
        name: after?.name || before?.name || id,
        status,
        before,
        after,
        population,
        control,
        score: (status === 'kept' ? 0 : 1000) + Math.abs(population.percent || 0) + Math.abs(control.delta || 0)
      });
    }
  }
  locationChanges.sort((left, right) => right.score - left.score);
  const gained = locationChanges.filter((item) => item.status === 'gained').length;
  const lost = locationChanges.filter((item) => item.status === 'lost').length;
  const causes = explainChanges(base, current, metrics, locationChanges);
  return {
    baseHash: base.hash,
    currentHash: current.hash,
    baseDate: base.metadata?.date,
    currentDate: current.metadata?.date,
    metrics,
    locationChanges: locationChanges.slice(0, 200),
    summary: { gained, lost, changed: locationChanges.length },
    causes
  };
}

function evidence(title, detail, options = {}) {
  return {
    id: options.id || `${title}:${detail}`,
    title,
    detail,
    tone: options.tone || 'neutral',
    certainty: options.certainty || 'medium',
    metric: options.metric || null,
    locationIds: options.locationIds || [],
    chain: options.chain || []
  };
}

function explainChanges(base, current, metrics, locationChanges) {
  const output = [];
  const byId = Object.fromEntries(metrics.map((item) => [item.id, item]));
  const gained = locationChanges.filter((item) => item.status === 'gained');
  const lost = locationChanges.filter((item) => item.status === 'lost');
  const controlDrops = locationChanges.filter((item) => (item.control.delta || 0) < -2).slice(0, 12);
  const populationDrops = locationChanges.filter((item) => (item.population.percent || 0) < -2).slice(0, 12);

  if ((byId.balance?.delta || 0) < 0) {
    const chain = [];
    if ((byId.expenses?.delta || 0) > 0) chain.push(`Расходы выросли на ${round(byId.expenses.delta, 1)}`);
    if ((byId.income?.delta || 0) < 0) chain.push(`Доход снизился на ${Math.abs(round(byId.income.delta, 1))}`);
    if ((byId.debt?.delta || 0) > 0) chain.push(`Долг вырос на ${round(byId.debt.delta, 1)}`);
    output.push(evidence('Баланс ухудшился', 'Изменение раскладывается на найденные доходы, расходы и долг.', {
      tone: 'danger', certainty: 'high', metric: byId.balance, chain
    }));
  }

  if (lost.length) {
    output.push(evidence('Потеря территорий', `Из снимка исчезло территорий: ${lost.length}.`, {
      tone: 'danger', certainty: 'high', locationIds: lost.map((item) => item.id),
      chain: [`Население потерянных территорий: ${round(lost.reduce((sum, item) => sum + (item.before?.population || 0), 0), 0)}`]
    }));
  }

  if (gained.length) {
    output.push(evidence('Новые территории', `В текущем снимке появилось территорий: ${gained.length}.`, {
      tone: 'positive', certainty: 'high', locationIds: gained.map((item) => item.id),
      chain: [`Население новых территорий: ${round(gained.reduce((sum, item) => sum + (item.after?.population || 0), 0), 0)}`]
    }));
  }

  if (controlDrops.length) {
    output.push(evidence('Падение контроля', `Контроль заметно снизился в ${controlDrops.length} территориях.`, {
      tone: 'warning', certainty: 'high', locationIds: controlDrops.map((item) => item.id),
      chain: controlDrops.slice(0, 4).map((item) => `${item.name}: ${round(item.control.delta, 1)}`)
    }));
  }

  if (populationDrops.length) {
    output.push(evidence('Локальные потери населения', `Население снизилось более чем на 2% в ${populationDrops.length} территориях.`, {
      tone: 'warning', certainty: 'medium', locationIds: populationDrops.map((item) => item.id),
      chain: populationDrops.slice(0, 4).map((item) => `${item.name}: ${round(item.population.percent, 1)}%`)
    }));
  }

  if (!output.length) {
    output.push(evidence('Резких изменений не найдено', 'Основные доступные показатели между снимками стабильны.', {
      tone: 'positive', certainty: 'medium'
    }));
  }
  return output;
}

export function diagnoseSnapshot(snapshot, previous = null) {
  const locations = snapshot?.locations || [];
  const population = finite(snapshot?.country?.population) || locations.reduce((sum, item) => sum + (finite(item.population) || 0), 0);
  const lowControl = locations.filter((location) => finite(location.control) !== null && location.control < 45);
  const richLowControl = [...lowControl]
    .sort((left, right) => (finite(right.population) || 0) - (finite(left.population) || 0))
    .slice(0, 12);
  const lowControlPopulation = lowControl.reduce((sum, location) => sum + (finite(location.population) || 0), 0);
  const lowControlShare = ratio(lowControlPopulation, population);
  const unrest = locations.filter((location) => (finite(location.unrest) || 0) > 5).sort((a, b) => b.unrest - a.unrest).slice(0, 12);
  const foodDeficit = locations.filter((location) => finite(location.food) !== null && location.food < 0).sort((a, b) => a.food - b.food).slice(0, 12);
  const fires = [];
  const opportunities = [];

  if ((finite(snapshot?.economy?.balance) || 0) < 0) {
    fires.push(evidence('Отрицательный баланс', 'Расходы превышают найденный доход.', {
      id: 'negative-balance', tone: 'danger', certainty: 'high',
      metric: { value: snapshot.economy.balance },
      chain: [`Доход: ${snapshot.economy.income ?? '—'}`, `Расходы: ${snapshot.economy.expenses ?? '—'}`]
    }));
  }

  if ((finite(snapshot?.economy?.totalDebt) || 0) > 0) {
    fires.push(evidence('Долговая нагрузка', `Обнаружено займов: ${snapshot.economy.loans || snapshot.loans?.length || 0}.`, {
      id: 'debt', tone: 'warning', certainty: 'high', metric: { value: snapshot.economy.totalDebt },
      chain: (snapshot.loans || []).slice(0, 4).map((loan) => `Сумма ${loan.amount ?? '—'}, процент ${loan.interest ?? '—'}`)
    }));
  }

  if (lowControlShare !== null && lowControlShare > 0.12) {
    fires.push(evidence('Население вне эффективного контроля', `${round(lowControlShare * 100, 1)}% населения живёт в территориях с контролем ниже 45.`, {
      id: 'low-control', tone: 'warning', certainty: 'high',
      locationIds: richLowControl.map((location) => String(location.id)),
      chain: richLowControl.slice(0, 4).map((location) => `${location.name}: контроль ${round(location.control, 1)}, население ${round(location.population, 0)}`)
    }));
  }

  if (unrest.length) {
    fires.push(evidence('Очаги недовольства', `Повышенное недовольство найдено в ${unrest.length} территориях.`, {
      id: 'unrest', tone: 'danger', certainty: 'medium', locationIds: unrest.map((location) => String(location.id)),
      chain: unrest.slice(0, 4).map((location) => `${location.name}: ${round(location.unrest, 1)}`)
    }));
  }

  if (foodDeficit.length) {
    fires.push(evidence('Локальный дефицит пищи', `Отрицательный пищевой баланс найден в ${foodDeficit.length} территориях.`, {
      id: 'food-deficit', tone: 'warning', certainty: 'medium', locationIds: foodDeficit.map((location) => String(location.id)),
      chain: foodDeficit.slice(0, 4).map((location) => `${location.name}: ${round(location.food, 1)}`)
    }));
  }

  const weakEstates = (snapshot?.estates || []).filter((estate) => finite(estate.satisfaction) !== null && estate.satisfaction < 35);
  if (weakEstates.length) {
    fires.push(evidence('Недовольные сословия', `Слабая удовлетворённость: ${weakEstates.map((estate) => estate.name).join(', ')}.`, {
      id: 'estate-satisfaction', tone: 'warning', certainty: 'medium',
      chain: weakEstates.slice(0, 4).map((estate) => `${estate.name}: ${round(estate.satisfaction, 1)}`)
    }));
  }

  const highPopulationLowBuildings = locations
    .filter((location) => (finite(location.population) || 0) > 0 && (location.buildings?.length || 0) <= 1)
    .sort((a, b) => (b.population || 0) - (a.population || 0))
    .slice(0, 10);
  if (highPopulationLowBuildings.length >= 3) {
    opportunities.push(evidence('Крупные территории с малой застройкой', 'Высокое население сочетается с нулём или одним распознанным зданием.', {
      id: 'building-opportunity', tone: 'positive', certainty: 'medium',
      locationIds: highPopulationLowBuildings.map((location) => String(location.id)),
      chain: highPopulationLowBuildings.slice(0, 4).map((location) => `${location.name}: ${round(location.population, 0)} жителей`)
    }));
  }

  const diverseGoods = snapshot?.goods?.length || 0;
  if (diverseGoods >= 8) {
    opportunities.push(evidence('Разнообразная товарная база', `Распознано типов товаров: ${diverseGoods}.`, {
      id: 'goods-diversity', tone: 'positive', certainty: 'high',
      chain: (snapshot.goods || []).slice(0, 6).map((item) => `${item.name}: ${item.count}`)
    }));
  }

  const marketless = locations.filter((location) => !location.market).slice(0, 12);
  if (locations.length && marketless.length / locations.length > 0.2) {
    opportunities.push(evidence('Неопределённая рыночная связь', 'У заметной доли территорий рынок не распознан. Это может быть пробел схемы или реальная зона для проверки.', {
      id: 'market-gap', tone: 'neutral', certainty: 'low', locationIds: marketless.map((location) => String(location.id))
    }));
  }

  const comparison = previous ? compareSnapshots(previous, snapshot) : null;
  return {
    fires,
    opportunities,
    changes: comparison?.causes || [],
    health: Math.max(0, 100 - fires.reduce((score, item) => score + (item.tone === 'danger' ? 22 : 12), 0)),
    coverage: {
      locations: locations.length,
      populationShareLowControl: lowControlShare,
      estates: snapshot?.estates?.length || 0,
      goods: snapshot?.goods?.length || 0
    }
  };
}

export function groupCampaigns(records) {
  const groups = new Map();
  for (const record of records || []) {
    const snapshot = record.snapshot || record;
    const key = campaignKey(snapshot);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const items of groups.values()) {
    items.sort((left, right) => String((left.snapshot || left).metadata?.date || '').localeCompare(String((right.snapshot || right).metadata?.date || '')));
  }
  return groups;
}
