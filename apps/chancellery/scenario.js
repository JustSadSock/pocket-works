const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const maybe = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};

export const SCENARIO_TEMPLATES = Object.freeze([
  { id: 'construction', name: 'Строительство', defaults: { cost: 100, incomeDelta: 2 } },
  { id: 'control', name: 'Административное усиление', defaults: { cost: 60, controlDelta: 10 } },
  { id: 'loan', name: 'Новый займ', defaults: { debtDelta: 200, treasuryDelta: 200, expenseDelta: 1.5 } },
  { id: 'military', name: 'Расширение армии', defaults: { cost: 120, expenseDelta: 3, soldiersDelta: 5000, manpowerDelta: -5000 } },
  { id: 'custom', name: 'Своя гипотеза', defaults: {} }
]);

export function createScenario(templateId = 'custom', name = '') {
  const template = SCENARIO_TEMPLATES.find((item) => item.id === templateId) || SCENARIO_TEMPLATES.at(-1);
  return {
    id: globalThis.crypto?.randomUUID?.() || `scenario-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name || template.name,
    templateId: template.id,
    territoryId: null,
    assumptions: {
      cost: 0,
      treasuryDelta: 0,
      incomeDelta: 0,
      expenseDelta: 0,
      debtDelta: 0,
      manpowerDelta: 0,
      soldiersDelta: 0,
      controlDelta: 0,
      ...template.defaults
    }
  };
}

export function evaluateScenario(snapshot, scenario) {
  const economy = snapshot?.economy || {};
  const country = snapshot?.country || {};
  const military = snapshot?.military || {};
  const a = scenario?.assumptions || {};
  const cost = Math.max(0, num(a.cost));
  const treasuryDelta = num(a.treasuryDelta) - cost;
  const incomeDelta = num(a.incomeDelta);
  const expenseDelta = num(a.expenseDelta);
  const debtDelta = num(a.debtDelta);
  const manpowerDelta = num(a.manpowerDelta);
  const soldiersDelta = num(a.soldiersDelta);
  const netMonthlyDelta = incomeDelta - expenseDelta;

  const locations = Array.isArray(snapshot?.locations) ? snapshot.locations : [];
  const target = scenario?.territoryId == null ? null : locations.find((item) => String(item.id) === String(scenario.territoryId));
  const controlValues = locations.map((item) => maybe(item.control)).filter((value) => value !== null);
  let controlBefore = maybe(country.averageControl);
  if (controlBefore === null && controlValues.length) controlBefore = controlValues.reduce((sum, value) => sum + value, 0) / controlValues.length;
  let controlAfter = controlBefore;
  let targetControl = null;
  if (target && maybe(target.control) !== null && num(a.controlDelta) !== 0) {
    const before = num(target.control);
    targetControl = clamp(before + num(a.controlDelta), 0, 100);
    if (controlValues.length) controlAfter = controlBefore + (targetControl - before) / controlValues.length;
  }

  const before = {
    treasury: maybe(economy.treasury),
    income: maybe(economy.income),
    expenses: maybe(economy.expenses),
    balance: maybe(economy.balance),
    debt: maybe(economy.totalDebt) ?? 0,
    manpower: maybe(country.manpower),
    soldiers: maybe(military.soldiers),
    control: controlBefore
  };
  const after = {
    treasury: before.treasury === null ? null : before.treasury + treasuryDelta,
    income: before.income === null ? null : before.income + incomeDelta,
    expenses: before.expenses === null ? null : before.expenses + expenseDelta,
    balance: before.balance === null ? null : before.balance + netMonthlyDelta,
    debt: before.debt + debtDelta,
    manpower: before.manpower === null ? null : before.manpower + manpowerDelta,
    soldiers: before.soldiers === null ? null : before.soldiers + soldiersDelta,
    control: controlAfter
  };

  const paybackMonths = cost > 0 && netMonthlyDelta > 0 ? round(cost / netMonthlyDelta, 1) : null;
  const warnings = [];
  if (after.treasury !== null && after.treasury < 0) warnings.push('Казна уходит ниже нуля по заданным допущениям.');
  if (after.balance !== null && after.balance < 0) warnings.push('После сценария найденный баланс остаётся отрицательным.');
  if (after.manpower !== null && after.manpower < 0) warnings.push('Расход людских ресурсов превышает доступный запас.');
  if (debtDelta > 0 && netMonthlyDelta <= 0) warnings.push('Долг растёт без прямого улучшения месячного баланса.');
  if (num(a.controlDelta) !== 0 && !target) warnings.push('Изменение контроля задано без распознанной целевой территории.');

  const exact = [
    { label: 'Казна', before: before.treasury, after: after.treasury, delta: treasuryDelta },
    { label: 'Доход', before: before.income, after: after.income, delta: incomeDelta },
    { label: 'Расходы', before: before.expenses, after: after.expenses, delta: expenseDelta },
    { label: 'Баланс', before: before.balance, after: after.balance, delta: netMonthlyDelta },
    { label: 'Долг', before: before.debt, after: after.debt, delta: debtDelta },
    { label: 'Людские ресурсы', before: before.manpower, after: after.manpower, delta: manpowerDelta },
    { label: 'Солдаты', before: before.soldiers, after: after.soldiers, delta: soldiersDelta },
    { label: 'Средний контроль', before: before.control, after: after.control, delta: before.control === null || after.control === null ? null : after.control - before.control }
  ];

  return {
    scenarioId: scenario?.id,
    name: scenario?.name || 'Сценарий',
    before,
    after,
    exact,
    target: target ? { id: String(target.id), name: target.name || String(target.id), controlAfter: targetControl } : null,
    paybackMonths,
    warnings,
    classification: {
      direct: 'Рассчитано из текущего снимка и введённых тобой чисел.',
      estimate: paybackMonths === null ? 'Окупаемость не определена.' : `Простая окупаемость: ${paybackMonths} мес. при неизменных прочих условиях.`,
      unknown: 'Рынки, ИИ, события, миграция и скрытые модификаторы движка не симулируются.'
    }
  };
}

export function rankScenarios(snapshot, scenarios) {
  return scenarios.map((scenario) => {
    const result = evaluateScenario(snapshot, scenario);
    const balance = result.after.balance ?? -Infinity;
    const treasury = result.after.treasury ?? 0;
    const debt = result.after.debt ?? 0;
    const score = (Number.isFinite(balance) ? balance * 10 : -1000) + treasury * 0.02 - debt * 0.015 - result.warnings.length * 8;
    return { scenario, result, score: round(score, 2) };
  }).sort((a, b) => b.score - a.score);
}
