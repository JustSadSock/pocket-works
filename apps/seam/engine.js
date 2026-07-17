import {
  AxisGame as CoreAxisGame,
  PLAYER,
  DIRECTIONS,
  hexDistance,
  boardCells,
  STYLE_WEIGHTS,
  evaluatePosition,
  shouldSwapOpening,
  chooseAIMove,
  lineBetween,
  coordKey,
  parseCoordKey
} from './engine-core.js';

export class AxisGame extends CoreAxisGame {
  constructor(options = {}) {
    super({ maxTurns: 200, ...options });
  }

  static fromJSON(data = {}) {
    const restored = CoreAxisGame.fromJSON({ ...data, maxTurns: data.maxTurns || 200 });
    Object.setPrototypeOf(restored, AxisGame.prototype);
    return restored;
  }
}

export {
  PLAYER,
  DIRECTIONS,
  hexDistance,
  boardCells,
  STYLE_WEIGHTS,
  evaluatePosition,
  shouldSwapOpening,
  chooseAIMove,
  lineBetween,
  coordKey,
  parseCoordKey
};
