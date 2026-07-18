import fs from 'node:fs';
import { createGame, applyAction, currentPlayer } from '../engine.js';
import { chooseAction as chooseNew, seededRandom } from '../ai.js';
import { chooseAction as chooseLegacy } from './legacy-ai-reference.mjs';

const styles = ['adaptive', 'assault', 'formation', 'frontier'];
const details = [];
const started = performance.now();
for (let index = 0; index < 6; index += 1) {
  let state = createGame();
  const newSide = index % 2;
  const newStyle = styles[index % styles.length];
  const legacyStyle = styles[(index + 1) % styles.length];
  const random = seededRandom(25_000 + index * 811);
  let thinkingMs = 0;
  let thinkingMoves = 0;
  while (state.winner === null) {
    const player = currentPlayer(state);
    const before = performance.now();
    const action = player === newSide
      ? chooseNew(state, { difficulty: 'marshal', style: newStyle, random, iterations: 180 })
      : chooseLegacy(state, { style: legacyStyle });
    if (player === newSide) {
      thinkingMs += performance.now() - before;
      thinkingMoves += 1;
    }
    state = applyAction(state, action);
  }
  const result = state.winner === -1 ? 'draw' : state.winner === newSide ? 'new' : 'legacy';
  details.push({
    game: index + 1,
    newSide,
    newStyle,
    legacyStyle,
    result,
    score: state.score,
    actions: state.actionCount,
    meanThinkingMs: Math.round(thinkingMs / Math.max(1, thinkingMoves))
  });
  console.log(`game ${index + 1}: ${result} ${state.score.join(':')} in ${state.actionCount}`);
}

const wins = details.filter((game) => game.result === 'new').length;
const legacyWins = details.filter((game) => game.result === 'legacy').length;
const draws = details.filter((game) => game.result === 'draw').length;
const report = {
  generatedAt: new Date().toISOString(),
  matchup: 'KORDON 1.1 Marshal vs exact KORDON 1.0 Marshal reference',
  auditIterationsPerMove: 180,
  releaseIterationsPerMove: 600,
  games: details.length,
  wins,
  legacyWins,
  draws,
  winRate: wins / details.length,
  meanThinkingMs: Math.round(details.reduce((sum, game) => sum + game.meanThinkingMs, 0) / details.length),
  elapsedMs: Math.round(performance.now() - started),
  details
};

fs.writeFileSync(new URL('../AI_STRENGTH_AUDIT.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(new URL('../AI_STRENGTH_AUDIT.md', import.meta.url), `# КОРДОН — аудит силы ИИ\n\nВерсия 1.1 проверена против точной копии «Маршала» из версии 1.0. Цвет нового ИИ чередуется, а характеры перебираются по кругу.\n\n- Партии: **${report.games}**\n- Победы нового ИИ: **${wins}**\n- Победы старого ИИ: **${legacyWins}**\n- Ничьи: **${draws}**\n- Доля побед нового ИИ: **${(report.winRate * 100).toFixed(1)}%**\n- Среднее время решения в Node.js: **${report.meanThinkingMs} мс**\n\nАудит использует 180 симуляций на ход. Релизный «Маршал» использует 600, поэтому пользовательская версия сильнее тестовой конфигурации. Дополнительно unit-тест проверяет защиту от форсированного матч-пойнта.\n`);

if (wins < 5 || legacyWins > 1) {
  throw new Error(`strength gate failed: new=${wins}, legacy=${legacyWins}, draws=${draws}`);
}
console.log(JSON.stringify(report, null, 2));
