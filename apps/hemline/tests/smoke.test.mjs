import assert from 'node:assert/strict';
import { createInitialState, applyAction } from '../engine.js';
import { BOT_PERSONAS, chooseBotAction } from '../bot.js';

const personas = Object.keys(BOT_PERSONAS);
const results = [];
for (const first of personas) {
  for (const second of personas) {
    for (let game = 0; game < 2; game += 1) {
      let state = createInitialState();
      let turns = 0;
      let shifts = 0;
      let captures = 0;
      while (!state.winner && turns < 140) {
        const persona = state.turn === 1 ? first : second;
        const action = chooseBotAction(state, persona);
        assert.ok(action, `${persona} must find a move`);
        const result = applyAction(state, action);
        assert.equal(result.ok, true, result.reason);
        if (action.type === 'shift') shifts += 1;
        captures += result.captured.length;
        state = result.state;
        turns += 1;
      }
      assert.ok(state.winner, `${first} vs ${second} exceeded turn limit`);
      results.push({ first, second, winner: state.winner, turns, shifts, captures });
    }
  }
}
assert.equal(results.length, 32);
assert.ok(results.some((game) => game.shifts > 0), 'shifts should appear in self-play');
assert.ok(results.some((game) => game.captures > 0), 'captures should appear in self-play');
assert.ok(results.some((game) => game.winner === 1));
assert.ok(results.some((game) => game.winner === 2));
console.log(JSON.stringify({ games: results.length, avgTurns: results.reduce((s,g)=>s+g.turns,0)/results.length, maxTurns: Math.max(...results.map(g=>g.turns)), gamesWithCaptures: results.filter(g=>g.captures).length, gamesWithShifts: results.filter(g=>g.shifts).length }, null, 2));
