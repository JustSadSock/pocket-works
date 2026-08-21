import { SNAPSHOT, AXES, HEROES } from './hero-data.js';
import { CORE_QUESTIONS, PRECISION_QUESTIONS } from './questions.js';

export { SNAPSHOT, AXES, HEROES, CORE_QUESTIONS, PRECISION_QUESTIONS };

const clamp = value => Math.max(0, Math.min(100, Math.round(value)));

const QUESTION_BY_ID = new Map([...CORE_QUESTIONS,...PRECISION_QUESTIONS].map(q => [q.id,q]));

export function buildPlayerProfile(answers = {}) {
  const sums = Object.fromEntries(Object.keys(AXES).map(axis => [axis, 50 * 0.4]));
  const weights = Object.fromEntries(Object.keys(AXES).map(axis => [axis, 0.4]));
  for (const [id, raw] of Object.entries(answers)) {
    const question = QUESTION_BY_ID.get(id);
    if (!question) continue;
    const value = Math.max(0, Math.min(4, Number(raw)));
    const t = value / 4;
    for (const [axis, spec] of Object.entries(question.targets)) {
      const [left,right,weight=1] = spec;
      const target = left + (right - left) * t;
      sums[axis] += target * weight;
      weights[axis] += weight;
    }
  }
  const vector = {};
  for (const axis of Object.keys(AXES)) vector[axis] = clamp(sums[axis] / weights[axis]);
  return { vector, weights };
}

const AXIS_IMPORTANCE = {aim:1,range:.85,mobility:1,aggression:.85,frontline:1.15,support:1.2,utility:1,setup:.9,mechanics:1.05,tempo:.8,autonomy:.9,burst:.7,brawl:.9};

export function heroFit(hero, player) {
  let weightedDistance = 0;
  let total = 0;
  let severe = 0;
  const deltas = {};
  for (const axis of Object.keys(AXES)) {
    const confidenceWeight = Math.min(1.25, 0.55 + (player.weights[axis] || 0) / 4);
    const weight = AXIS_IMPORTANCE[axis] * confidenceWeight;
    const delta = Math.abs(player.vector[axis] - hero.vector[axis]);
    deltas[axis] = delta;
    weightedDistance += delta * weight;
    total += weight;
    if (delta > 48 && ['frontline','support','mechanics','brawl','aim'].includes(axis)) severe += (delta - 48) * 0.07;
  }
  const avgDistance = weightedDistance / Math.max(1,total);
  const raw = 100 - avgDistance * 0.82 - severe;
  return { score: Math.max(1, Math.min(96, Math.round(raw))), deltas };
}

export function rankHeroes(answers = {}) {
  const player = buildPlayerProfile(answers);
  return HEROES.map(hero => ({ hero, ...heroFit(hero,player) }))
    .sort((a,b) => b.score - a.score || a.hero.order - b.hero.order);
}

function variance(values) {
  if (!values.length) return 0;
  const avg = values.reduce((a,b)=>a+b,0)/values.length;
  return values.reduce((sum,value)=>sum+(value-avg)**2,0)/values.length;
}

export function choosePrecisionQuestion(answers = {}, asked = []) {
  const used = new Set(asked);
  const player = buildPlayerProfile(answers);
  const candidates = rankHeroes(answers).slice(0,8).map(x => x.hero);
  const scored = PRECISION_QUESTIONS.filter(q => !used.has(q.id)).map(question => {
    let score = 0;
    for (const [axis,spec] of Object.entries(question.targets)) {
      const weight = spec[2] ?? 1;
      const spread = Math.sqrt(variance(candidates.map(hero => hero.vector[axis]))) / 25;
      const underMeasured = 1 + 1 / Math.max(.8, player.weights[axis]);
      score += spread * weight * underMeasured;
    }
    return { question, score };
  }).sort((a,b)=>b.score-a.score || a.question.id.localeCompare(b.question.id));
  return scored[0]?.question || null;
}

export function resultAnalysis(answers = {}) {
  const player = buildPlayerProfile(answers);
  const ranking = rankHeroes(answers);
  const top = ranking[0];
  const axisRows = Object.keys(AXES).map(axis => ({
    axis,
    label: AXES[axis].label,
    player: player.vector[axis],
    hero: top.hero.vector[axis],
    delta: Math.abs(player.vector[axis]-top.hero.vector[axis]),
    weight: AXIS_IMPORTANCE[axis]
  }));
  const strengths = [...axisRows].sort((a,b)=>(a.delta-a.weight*6)-(b.delta-b.weight*6)).slice(0,4);
  const conflicts = [...axisRows].sort((a,b)=>b.delta-a.delta).slice(0,3);
  const roleBest = ['Vanguard','Duelist','Strategist'].map(role => ranking.find(x => x.hero.role === role)).filter(Boolean);
  const spread = Math.max(0, top.score - (ranking[3]?.score ?? top.score));
  const answerCount = Object.keys(answers).length;
  const confidence = Math.min(92, Math.round(58 + Math.min(22,answerCount*.85) + Math.min(12,spread*2)));
  return { player, ranking, top, strengths, conflicts, roleBest, confidence };
}

export function validateSnapshot() {
  return HEROES.length === SNAPSHOT.heroCount && new Set(HEROES.map(h=>h.id)).size === HEROES.length;
}
