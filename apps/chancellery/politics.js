const finite = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => { const p = 10 ** digits; return Math.round(value * p) / p; };

export function simulatePolitics(estates = [], changes = {}) {
  const rows = estates.map((estate) => {
    const id = String(estate.id ?? estate.name);
    const change = changes[id] || {};
    const powerBefore = finite(estate.power);
    const satisfactionBefore = finite(estate.satisfaction);
    const powerDelta = finite(change.powerDelta) ?? 0;
    const satisfactionDelta = finite(change.satisfactionDelta) ?? 0;
    const powerAfter = powerBefore === null ? null : clamp(powerBefore + powerDelta, 0, 100);
    const satisfactionAfter = satisfactionBefore === null ? null : clamp(satisfactionBefore + satisfactionDelta, 0, 100);
    const actualPowerDelta = powerBefore === null ? null : powerAfter - powerBefore;
    const actualSatisfactionDelta = satisfactionBefore === null ? null : satisfactionAfter - satisfactionBefore;
    const score = (actualPowerDelta ?? 0) + (actualSatisfactionDelta ?? 0) * 0.35;
    return {
      id,
      name: estate.name || id,
      powerBefore,
      powerAfter,
      powerDelta: actualPowerDelta,
      satisfactionBefore,
      satisfactionAfter,
      satisfactionDelta: actualSatisfactionDelta,
      score: round(score, 2)
    };
  });

  const winners = rows.filter((row) => row.score > 0.5).sort((a, b) => b.score - a.score);
  const losers = rows.filter((row) => row.score < -0.5).sort((a, b) => a.score - b.score);
  const risks = [];
  const angry = rows.filter((row) => row.satisfactionAfter !== null && row.satisfactionAfter < 25);
  if (angry.length) risks.push(`Критически низкая удовлетворённость: ${angry.map((row) => row.name).join(', ')}.`);
  const dominant = [...rows].filter((row) => row.powerAfter !== null).sort((a, b) => b.powerAfter - a.powerAfter)[0];
  if (dominant?.powerAfter >= 60) risks.push(`${dominant.name}: влияние достигает ${round(dominant.powerAfter)} — проверь цену концентрации власти.`);
  if (!rows.length) risks.push('Сословия не распознаны в текущем снимке.');

  return { rows, winners, losers, risks };
}
