const finite = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => { const p = 10 ** digits; return Math.round(value * p) / p; };

function locationIndex(snapshot) {
  return new Map((snapshot?.locations || []).map((item) => [String(item.id), item]));
}

function routeDistance(objectives) {
  const withCoords = objectives.filter((item) => finite(item?.x) !== null && finite(item?.y) !== null);
  if (withCoords.length < 2) return null;
  let distance = 0;
  for (let i = 1; i < withCoords.length; i += 1) {
    const dx = withCoords[i].x - withCoords[i - 1].x;
    const dy = withCoords[i].y - withCoords[i - 1].y;
    distance += Math.hypot(dx, dy);
  }
  return round(distance, 1);
}

export function assessWarPlan(snapshot, plan = {}) {
  const soldiers = finite(snapshot?.military?.soldiers);
  const manpower = finite(snapshot?.country?.manpower);
  const treasury = finite(snapshot?.economy?.treasury);
  const balance = finite(snapshot?.economy?.balance);
  const committed = Math.max(0, finite(plan.committedTroops) ?? 0);
  const reserve = Math.max(0, finite(plan.reserveTroops) ?? 0);
  const enemy = Math.max(0, finite(plan.enemyTroops) ?? 0);
  const monthlyWarCost = Math.max(0, finite(plan.monthlyWarCost) ?? 0);
  const locations = locationIndex(snapshot);
  const objectives = (plan.objectiveIds || []).map((id) => locations.get(String(id))).filter(Boolean);

  const commitShare = soldiers && soldiers > 0 ? committed / soldiers : null;
  const reserveShare = soldiers && soldiers > 0 ? reserve / soldiers : null;
  const forceRatio = enemy > 0 ? committed / enemy : null;
  const netBurn = Math.max(0, monthlyWarCost - Math.max(0, balance ?? 0));
  const runwayMonths = treasury !== null && netBurn > 0 ? treasury / netBurn : null;
  const foodKnown = objectives.filter((item) => finite(item.food) !== null);
  const foodDeficits = foodKnown.filter((item) => item.food < 0);
  const unrestKnown = objectives.filter((item) => finite(item.unrest) !== null);
  const highUnrest = unrestKnown.filter((item) => item.unrest > 5);
  const distance = routeDistance(objectives);

  const risks = [];
  const strengths = [];
  const unknowns = [];
  let score = 70;

  if (soldiers === null) { unknowns.push('Суммарная численность армии не распознана.'); score -= 8; }
  else if (committed > soldiers) { risks.push('План требует больше солдат, чем найдено в снимке.'); score -= 30; }
  else if (commitShare !== null && commitShare > 0.85) { risks.push('В поход уходит более 85% найденной армии — стратегический резерв почти исчезает.'); score -= 18; }
  else if (commitShare !== null && commitShare >= 0.45) { strengths.push('Основная армия задействована без полного оголения резерва.'); score += 4; }

  if (reserveShare !== null && reserveShare < 0.12) { risks.push('Резерв меньше 12% найденной армии.'); score -= 12; }
  else if (reserveShare !== null && reserveShare >= 0.2) { strengths.push('Есть заметный оперативный резерв.'); score += 5; }

  if (enemy <= 0) unknowns.push('Силы противника не заданы: соотношение армий неизвестно.');
  else if (forceRatio < 0.8) { risks.push(`Заданные силы дают только ${round(forceRatio, 2)}× от оценки противника.`); score -= 20; }
  else if (forceRatio >= 1.25) { strengths.push(`Локальное соотношение сил: ${round(forceRatio, 2)}× в твою пользу.`); score += 8; }

  if (runwayMonths !== null && runwayMonths < 6) { risks.push(`При заданных расходах казны хватит примерно на ${round(runwayMonths)} мес.`); score -= 18; }
  else if (runwayMonths !== null && runwayMonths >= 12) { strengths.push(`Финансовый запас: около ${round(runwayMonths)} мес. при заданной нагрузке.`); score += 5; }
  else if (monthlyWarCost > 0 && treasury === null) unknowns.push('Казна не распознана: финансовый запас войны не вычислен.');

  if (!objectives.length) { unknowns.push('Не выбраны цели кампании.'); score -= 6; }
  if (foodKnown.length && foodDeficits.length) { risks.push(`У ${foodDeficits.length} из ${foodKnown.length} целей распознан отрицательный пищевой баланс.`); score -= Math.min(16, foodDeficits.length * 4); }
  if (unrestKnown.length && highUnrest.length) strengths.push(`У ${highUnrest.length} целей повышенное недовольство — это фактор уязвимости, но не гарантия лёгкой войны.`);
  if (!foodKnown.length && objectives.length) unknowns.push('По выбранным целям нет данных о пище/снабжении.');
  if (distance === null && objectives.length > 1) unknowns.push('Нет координат для оценки протяжённости маршрута.');

  if (manpower !== null && committed > manpower + (soldiers || 0)) { risks.push('Плановая численность превышает найденную армию плюс людские ресурсы.'); score -= 20; }

  return {
    readiness: clamp(Math.round(score), 0, 100),
    known: { soldiers, manpower, treasury, balance },
    plan: { committed, reserve, enemy, monthlyWarCost },
    ratios: {
      commitShare: commitShare === null ? null : round(commitShare * 100),
      reserveShare: reserveShare === null ? null : round(reserveShare * 100),
      forceRatio: forceRatio === null ? null : round(forceRatio, 2),
      runwayMonths: runwayMonths === null ? null : round(runwayMonths, 1),
      routeDistance: distance
    },
    objectives: objectives.map((item) => ({ id: String(item.id), name: item.name || String(item.id), food: finite(item.food), unrest: finite(item.unrest), owner: item.owner })),
    risks,
    strengths,
    unknowns
  };
}
