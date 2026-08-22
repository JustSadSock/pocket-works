const finite = (value) => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const dateKey = (snapshot) => String(snapshot?.metadata?.date || snapshot?.metadata?.importedAt || '');
const snap = (record) => record?.snapshot || record;

function event(title, detail, tone = 'neutral') { return { title, detail, tone }; }

export function buildChronicle(records = []) {
  const ordered = [...records].map(snap).filter(Boolean).sort((a, b) => dateKey(a).localeCompare(dateKey(b)));
  const entries = ordered.map((snapshot, index) => {
    const previous = index > 0 ? ordered[index - 1] : null;
    const events = [];
    if (!previous) events.push(event('Начало архива', 'Первый импортированный снимок этой кампании.', 'neutral'));
    else {
      const beforeLocations = new Map((previous.locations || []).map((item) => [String(item.id), item]));
      const afterLocations = new Map((snapshot.locations || []).map((item) => [String(item.id), item]));
      const gained = [...afterLocations.keys()].filter((id) => !beforeLocations.has(id)).length;
      const lost = [...beforeLocations.keys()].filter((id) => !afterLocations.has(id)).length;
      if (gained) events.push(event('Расширение', `Новых территорий: ${gained}.`, 'positive'));
      if (lost) events.push(event('Территориальные потери', `Потеряно территорий: ${lost}.`, 'danger'));
      const beforeBalance = finite(previous.economy?.balance);
      const afterBalance = finite(snapshot.economy?.balance);
      if ((beforeBalance ?? 0) >= 0 && (afterBalance ?? 0) < 0) events.push(event('Бюджет ушёл в минус', 'Баланс сменил знак между снимками.', 'danger'));
      if ((beforeBalance ?? 0) < 0 && (afterBalance ?? 0) >= 0) events.push(event('Бюджет восстановлен', 'Баланс снова неотрицательный.', 'positive'));
      const debtDelta = (finite(snapshot.economy?.totalDebt) ?? 0) - (finite(previous.economy?.totalDebt) ?? 0);
      if (debtDelta > 0) events.push(event('Долг вырос', `Изменение долга: +${Math.round(debtDelta)}.`, 'warning'));
      const popBefore = finite(previous.country?.population); const popAfter = finite(snapshot.country?.population);
      const popPercent = popBefore && popAfter !== null ? ((popAfter - popBefore) / Math.abs(popBefore)) * 100 : null;
      if (popPercent !== null && popPercent <= -5) events.push(event('Снижение населения', `${Math.abs(Math.round(popPercent * 10) / 10)}% между снимками.`, 'warning'));
      const controlBefore = finite(previous.country?.averageControl); const controlAfter = finite(snapshot.country?.averageControl);
      const controlDelta = controlBefore !== null && controlAfter !== null ? controlAfter - controlBefore : null;
      if (controlDelta !== null && controlDelta <= -5) events.push(event('Ослабление контроля', `${Math.abs(Math.round(controlDelta * 10) / 10)} п.п. между снимками.`, 'warning'));
      if (!events.length) events.push(event('Период стабильности', 'Крупных изменений по распознанным метрикам не найдено.', 'neutral'));
    }
    return { hash: snapshot.hash, date: snapshot.metadata?.date || 'без даты', snapshot, events };
  });

  const series = {
    treasury: ordered.map((item) => finite(item.economy?.treasury)),
    balance: ordered.map((item) => finite(item.economy?.balance)),
    population: ordered.map((item) => finite(item.country?.population)),
    control: ordered.map((item) => finite(item.country?.averageControl)),
    debt: ordered.map((item) => finite(item.economy?.totalDebt))
  };
  return { entries, series };
}

export function sparklinePoints(values, width = 260, height = 64, padding = 6) {
  const clean = values.map((value) => finite(value));
  const present = clean.filter((value) => value !== null);
  if (present.length < 2) return '';
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  return clean.map((value, index) => {
    if (value === null) return null;
    const x = padding + (index / Math.max(1, clean.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
}
