export const AXES = [
  { id: 'freedom', label: 'Свобода', glyph: '◇' },
  { id: 'welfare', label: 'Равенство', glyph: '●' },
  { id: 'tradition', label: 'Провинции', glyph: '⌂' },
  { id: 'security', label: 'Порядок', glyph: '◆' },
  { id: 'growth', label: 'Развитие', glyph: '↗' }
];

export const FACTIONS = [
  {
    id: 'civic', name: 'Гражданский союз', short: 'Союз', seats: 14, color: '#42647a', mark: '◇',
    ideal: { freedom: 0.95, welfare: 0.2, tradition: -0.45, security: -0.45, growth: 0.25 }
  },
  {
    id: 'labor', name: 'Трудовой блок', short: 'Труд', seats: 13, color: '#9a574b', mark: '●',
    ideal: { freedom: 0.05, welfare: 0.95, tradition: -0.2, security: 0.05, growth: -0.2 }
  },
  {
    id: 'provinces', name: 'Лига провинций', short: 'Лига', seats: 12, color: '#6c7b46', mark: '⌂',
    ideal: { freedom: 0.2, welfare: 0.3, tradition: 0.95, security: 0.15, growth: -0.15 }
  },
  {
    id: 'order', name: 'Национальный порядок', short: 'Порядок', seats: 11, color: '#65536d', mark: '◆',
    ideal: { freedom: -0.7, welfare: -0.25, tradition: 0.65, security: 0.95, growth: 0.05 }
  },
  {
    id: 'future', name: 'Форум будущего', short: 'Форум', seats: 10, color: '#a57933', mark: '↗',
    ideal: { freedom: 0.65, welfare: -0.1, tradition: -0.7, security: -0.25, growth: 0.95 }
  }
];

export const BILLS = [
  {
    id: 'land', code: 'ЗП–14', title: 'Земля тем, кто её обрабатывает',
    summary: 'Выкуп пустующих владений и передача земли кооперативам.',
    core: { freedom: 0.15, welfare: 0.95, tradition: -0.65, security: -0.05, growth: 0.1 }, integrityWord: 'реформа'
  },
  {
    id: 'charter', code: 'ХР–07', title: 'Хартия региональной автономии',
    summary: 'Провинции получают собственные бюджеты и право местного нормотворчества.',
    core: { freedom: 0.45, welfare: 0.15, tradition: 0.95, security: -0.45, growth: -0.05 }, integrityWord: 'автономия'
  },
  {
    id: 'network', code: 'СВ–22', title: 'Свободная сеть',
    summary: 'Шифрование становится правом, а блокировки требуют решения суда.',
    core: { freedom: 0.95, welfare: 0.05, tradition: -0.55, security: -0.7, growth: 0.55 }, integrityWord: 'свобода'
  },
  {
    id: 'defence', code: 'ОБ–31', title: 'Щит республики',
    summary: 'Модернизация армии и единое командование на пять лет.',
    core: { freedom: -0.3, welfare: -0.35, tradition: 0.25, security: 0.95, growth: 0.2 }, integrityWord: 'оборона'
  },
  {
    id: 'industry', code: 'ПР–18', title: 'Новый промышленный пояс',
    summary: 'Инфраструктура, дешёвый кредит и ускоренные разрешения для заводов.',
    core: { freedom: -0.15, welfare: 0.2, tradition: -0.35, security: 0.05, growth: 0.95 }, integrityWord: 'рост'
  },
  {
    id: 'clean', code: 'ЧВ–04', title: 'Чистая власть',
    summary: 'Открытые декларации, независимый прокурор и запрет тайного лоббизма.',
    core: { freedom: 0.75, welfare: 0.2, tradition: -0.55, security: 0.2, growth: 0.25 }, integrityWord: 'контроль'
  },
  {
    id: 'school', code: 'ШК–26', title: 'Единая школа',
    summary: 'Общий стандарт образования и бесплатный доступ к старшей ступени.',
    core: { freedom: 0.2, welfare: 0.8, tradition: -0.45, security: 0.05, growth: 0.55 }, integrityWord: 'образование'
  },
  {
    id: 'energy', code: 'ЭН–11', title: 'Энергетический разворот',
    summary: 'Закрытие старых станций и быстрый переход к распределённой генерации.',
    core: { freedom: 0.15, welfare: 0.25, tradition: -0.7, security: -0.1, growth: 0.85 }, integrityWord: 'переход'
  }
];

export const CLAUSES = [
  { id: 'sunset', title: 'Срок действия — 2 года', note: 'Закон автоматически пересмотрят после испытательного периода.', cost: 8, delta: { freedom: 0.1, welfare: 0, tradition: 0.1, security: -0.05, growth: 0 }, appeals: ['civic', 'provinces'], angers: [], stability: 2 },
  { id: 'regional-veto', title: 'Региональное вето', note: 'Три провинции вместе могут заморозить исполнение нормы.', cost: 19, delta: { freedom: 0.1, welfare: -0.1, tradition: 0.55, security: -0.25, growth: -0.1 }, appeals: ['provinces'], angers: ['order'], stability: -1 },
  { id: 'union-seat', title: 'Квота профсоюзов', note: 'Работники получают места в наблюдательных советах.', cost: 18, delta: { freedom: -0.05, welfare: 0.6, tradition: 0, security: 0.05, growth: -0.25 }, appeals: ['labor'], angers: ['future'], stability: 1 },
  { id: 'tax-cap', title: 'Налоговый потолок', note: 'Расходы нельзя покрывать ростом ставки выше установленного предела.', cost: 17, delta: { freedom: 0.15, welfare: -0.5, tradition: 0.05, security: 0, growth: 0.5 }, appeals: ['future', 'civic'], angers: ['labor'], stability: -1 },
  { id: 'security-review', title: 'Надзор безопасности', note: 'Силовой комитет получает право приостанавливать отдельные положения.', cost: 22, delta: { freedom: -0.45, welfare: -0.05, tradition: 0.2, security: 0.6, growth: -0.05 }, appeals: ['order'], angers: ['civic'], stability: -2 },
  { id: 'open-ledger', title: 'Открытый реестр', note: 'Все решения и получатели средств публикуются автоматически.', cost: 11, delta: { freedom: 0.45, welfare: 0.05, tradition: -0.15, security: -0.05, growth: 0.1 }, appeals: ['civic', 'future'], angers: [], stability: 1 },
  { id: 'province-fund', title: 'Фонд провинций', note: 'Пятая часть бюджета резервируется для удалённых территорий.', cost: 15, delta: { freedom: 0, welfare: 0.3, tradition: 0.45, security: 0.05, growth: -0.15 }, appeals: ['provinces', 'labor'], angers: ['future'], stability: 2 },
  { id: 'emergency', title: 'Чрезвычайная оговорка', note: 'Правительство может ускорить исполнение в период кризиса.', cost: 25, delta: { freedom: -0.55, welfare: -0.05, tradition: 0.15, security: 0.7, growth: 0.1 }, appeals: ['order'], angers: ['civic', 'labor'], stability: -3 },
  { id: 'citizen-panel', title: 'Гражданское жюри', note: 'Случайно выбранная коллегия проверяет исполнение раз в квартал.', cost: 13, delta: { freedom: 0.5, welfare: 0.15, tradition: -0.25, security: -0.15, growth: -0.05 }, appeals: ['civic', 'labor'], angers: ['order'], stability: 1 },
  { id: 'private-pilot', title: 'Частный пилот', note: 'Первую очередь разрешено запускать через частных операторов.', cost: 16, delta: { freedom: 0.15, welfare: -0.35, tradition: -0.2, security: -0.05, growth: 0.65 }, appeals: ['future'], angers: ['labor'], stability: -1 },
  { id: 'local-custom', title: 'Сохранить местные нормы', note: 'Провинции могут оставить действующие правила, если цель закона достигнута.', cost: 18, delta: { freedom: 0.2, welfare: -0.1, tradition: 0.65, security: -0.2, growth: -0.15 }, appeals: ['provinces'], angers: ['future'], stability: 1 },
  { id: 'state-guarantee', title: 'Государственная гарантия', note: 'Казна покрывает базовые издержки и берёт на себя провал проекта.', cost: 20, delta: { freedom: -0.2, welfare: 0.55, tradition: 0.1, security: 0.25, growth: 0.1 }, appeals: ['labor', 'order'], angers: ['future'], stability: 2 },
  { id: 'court-lock', title: 'Судебный замок', note: 'Ключевые полномочия включаются только после проверки конституционным судом.', cost: 12, delta: { freedom: 0.35, welfare: 0, tradition: 0.15, security: -0.2, growth: -0.05 }, appeals: ['civic', 'provinces'], angers: ['order'], stability: 2 },
  { id: 'national-standard', title: 'Единый стандарт', note: 'Исполнение унифицируется по всей республике без местных исключений.', cost: 17, delta: { freedom: -0.25, welfare: 0.15, tradition: -0.5, security: 0.45, growth: 0.25 }, appeals: ['order', 'future'], angers: ['provinces'], stability: 0 }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
function mulberry32(seed) { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let next = value; next = Math.imul(next ^ (next >>> 15), next | 1); next ^= next + Math.imul(next ^ (next >>> 7), next | 61); return ((next ^ (next >>> 14)) >>> 0) / 4294967296; }; }
function hashString(input) { let hash = 2166136261; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function shuffle(items, random) { const result = [...items]; for (let index = result.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(random() * (index + 1)); [result[index], result[swapIndex]] = [result[swapIndex], result[index]]; } return result; }
function dossierBias(seed, billId, factionId) { const random = mulberry32(seed ^ hashString(`${billId}:${factionId}`)); return Math.round((random() - 0.5) * 12); }
function vectorWith(base, additions) { const vector = { ...base }; for (const addition of additions) for (const axis of AXES) vector[axis.id] = clamp((vector[axis.id] || 0) + (addition.delta[axis.id] || 0), -1.35, 1.35); return vector; }
function affinity(ideal, policy) { return AXES.reduce((total, axis) => total + ideal[axis.id] * policy[axis.id], 0) / AXES.length; }
function logistic(value) { return 1 / (1 + Math.exp(-value)); }
function coalitionChoices(clauseIds) { const choices = [[]]; for (let first = 0; first < clauseIds.length; first += 1) { choices.push([clauseIds[first]]); for (let second = first + 1; second < clauseIds.length; second += 1) { choices.push([clauseIds[first], clauseIds[second]]); for (let third = second + 1; third < clauseIds.length; third += 1) choices.push([clauseIds[first], clauseIds[second], clauseIds[third]]); } } return choices; }
function findBestCoalition(campaign, clauseIds) {
  const testCampaign = { ...campaign, dossiers: campaign.dossiers.map((dossier, index) => index === campaign.round ? { ...dossier, clauseIds: [...clauseIds] } : dossier) };
  return coalitionChoices(clauseIds).reduce((best, selected) => { const result = evaluateBill(testCampaign, selected); if (!result) return best; if (result.votes > best.votes || (result.votes === best.votes && result.integrity > best.integrity)) return { votes: result.votes, integrity: result.integrity, clauseIds: selected }; return best; }, { votes: -1, integrity: -1, clauseIds: [] });
}

export function createCampaign(seed = Date.now()) {
  const normalizedSeed = Math.abs(Math.floor(seed)) || 1;
  const random = mulberry32(normalizedSeed);
  const bills = shuffle(BILLS, random).slice(0, 6);
  const clauseOrder = shuffle(CLAUSES, random);
  const dossiers = bills.map((bill, index) => { const offset = (index * 3) % clauseOrder.length; const offered = []; for (let step = 0; offered.length < 6; step += 1) { const clause = clauseOrder[(offset + step) % clauseOrder.length]; if (!offered.includes(clause.id)) offered.push(clause.id); } return { billId: bill.id, clauseIds: offered }; });
  const campaign = { seed: normalizedSeed, round: 0, legitimacy: 64, stability: 68, failures: 0, passed: 0, selectedClauseIds: [], trust: Object.fromEntries(FACTIONS.map((faction) => [faction.id, 0])), dossiers, history: [], startedAt: new Date().toISOString(), finishedAt: null };
  campaign.dossiers = campaign.dossiers.map((dossier, round) => {
    const testCampaign = { ...campaign, round, selectedClauseIds: [] };
    if (findBestCoalition(testCampaign, dossier.clauseIds).votes >= 31) return dossier;
    const globalBest = findBestCoalition(testCampaign, CLAUSES.map((clause) => clause.id));
    const repaired = [...dossier.clauseIds];
    for (const clauseId of globalBest.clauseIds) { if (repaired.includes(clauseId)) continue; let replaceIndex = repaired.length - 1; while (replaceIndex >= 0 && globalBest.clauseIds.includes(repaired[replaceIndex])) replaceIndex -= 1; repaired[Math.max(0, replaceIndex)] = clauseId; }
    return { ...dossier, clauseIds: repaired };
  });
  return campaign;
}

export function getCurrentDossier(campaign) { if (!campaign || campaign.round >= campaign.dossiers.length) return null; const entry = campaign.dossiers[campaign.round]; const bill = BILLS.find((item) => item.id === entry.billId); const clauses = entry.clauseIds.map((id) => CLAUSES.find((item) => item.id === id)).filter(Boolean); return { ...entry, bill, clauses }; }

export function evaluateBill(campaign, selectedClauseIds = campaign?.selectedClauseIds || []) {
  const dossier = getCurrentDossier(campaign); if (!dossier) return null;
  const selected = selectedClauseIds.map((id) => CLAUSES.find((item) => item.id === id)).filter((clause) => clause && dossier.clauseIds.includes(clause.id)).slice(0, 3);
  const policy = vectorWith(dossier.bill.core, selected);
  const integrity = clamp(100 - selected.reduce((total, clause) => total + clause.cost, 0), 0, 100);
  const factions = FACTIONS.map((faction) => {
    const directAppeal = selected.reduce((total, clause) => clause.appeals.includes(faction.id) ? total + 9 : clause.angers.includes(faction.id) ? total - 9 : total, 0);
    const score = clamp(45 + affinity(faction.ideal, policy) * 58 + (campaign.trust?.[faction.id] || 0) + dossierBias(campaign.seed, dossier.bill.id, faction.id) + directAppeal, 2, 98);
    const yes = clamp(Math.round(faction.seats * logistic((score - 50) / 8.5)), 0, faction.seats);
    return { ...faction, score: Math.round(score), yes, no: faction.seats - yes };
  });
  const votes = factions.reduce((total, faction) => total + faction.yes, 0);
  const mean = factions.reduce((total, faction) => total + faction.score, 0) / factions.length;
  const variance = factions.reduce((total, faction) => total + (faction.score - mean) ** 2, 0) / factions.length;
  const tension = Math.round(clamp(16 + Math.sqrt(variance) * 0.9 + selected.length * 3 - integrity * 0.06, 0, 100));
  const clauseStability = selected.reduce((total, clause) => total + clause.stability, 0);
  const passed = votes >= 31;
  const legitimacyDelta = passed ? Math.round((integrity - 58) / 8 + (votes - 31) / 5 - tension / 32) : -8;
  const stabilityDelta = passed ? Math.round(5 - tension / 14 + clauseStability) : -5;
  return { dossier, selected, policy, integrity, factions, votes, passed, tension, legitimacyDelta, stabilityDelta, majorityMargin: votes - 30 };
}

export function toggleClause(campaign, clauseId) { const dossier = getCurrentDossier(campaign); if (!dossier || !dossier.clauseIds.includes(clauseId)) return campaign; const selected = [...(campaign.selectedClauseIds || [])]; const existing = selected.indexOf(clauseId); if (existing >= 0) selected.splice(existing, 1); else if (selected.length < 3) selected.push(clauseId); return { ...campaign, selectedClauseIds: selected }; }

export function resolveVote(campaign) {
  const evaluation = evaluateBill(campaign); if (!evaluation) return campaign;
  const trust = { ...campaign.trust };
  for (const faction of evaluation.factions) { const aligned = faction.score >= 50; const shift = evaluation.passed ? (aligned ? 2 : -2) : (aligned ? -2 : 1); trust[faction.id] = clamp(Math.round((trust[faction.id] || 0) + shift), -14, 14); }
  const next = { ...campaign, round: campaign.round + 1, legitimacy: clamp(campaign.legitimacy + evaluation.legitimacyDelta, 0, 100), stability: clamp(campaign.stability + evaluation.stabilityDelta, 0, 100), failures: campaign.failures + (evaluation.passed ? 0 : 1), passed: campaign.passed + (evaluation.passed ? 1 : 0), selectedClauseIds: [], trust, history: [...campaign.history, { billId: evaluation.dossier.bill.id, selectedClauseIds: evaluation.selected.map((item) => item.id), votes: evaluation.votes, integrity: evaluation.integrity, tension: evaluation.tension, passed: evaluation.passed, legitimacyDelta: evaluation.legitimacyDelta, stabilityDelta: evaluation.stabilityDelta }] };
  if (isCampaignOver(next)) next.finishedAt = new Date().toISOString();
  return next;
}

export function isCampaignOver(campaign) { return campaign.round >= campaign.dossiers.length || campaign.failures >= 3 || campaign.stability <= 0; }
export function scoreCampaign(campaign) { if (!campaign) return 0; const integrityAverage = campaign.history.length ? campaign.history.reduce((total, entry) => total + entry.integrity, 0) / campaign.history.length : 0; return Math.max(0, Math.round(campaign.passed * 220 + campaign.legitimacy * 5 + campaign.stability * 5 + integrityAverage * 3 - campaign.failures * 90)); }
export function describeEnding(campaign) {
  const score = scoreCampaign(campaign);
  if (campaign.stability <= 0) return { title: 'Палата распущена', text: 'Коалиции пережгли республику быстрее, чем успели провести программу.', grade: 'КРИЗИС', score };
  if (campaign.failures >= 3) return { title: 'Вотум недоверия', text: 'Три провала подряд превратили правительство в мебель с печатью.', grade: 'ПРОВАЛ', score };
  if (campaign.passed >= 5 && campaign.legitimacy >= 60 && campaign.stability >= 50) return { title: 'Большой мандат', text: 'Большинство собрано, законы узнаваемы, республика всё ещё функционирует. Подозрительно профессионально.', grade: 'ГОСУДАРСТВЕННИК', score };
  if (campaign.passed >= 4) return { title: 'Рабочее большинство', text: 'Не красиво, зато законы приняты и никто пока не вынес двери парламента.', grade: 'КОАЛИЦИЯ', score };
  return { title: 'Тонкое меньшинство', text: 'Республика выжила, но программа осталась в основном в папке для красивых речей.', grade: 'КОМПРОМИСС', score };
}
export function validateCampaign(value) { return Boolean(value && Number.isInteger(value.seed) && Number.isInteger(value.round) && Array.isArray(value.dossiers) && Array.isArray(value.history) && Array.isArray(value.selectedClauseIds) && value.trust); }
