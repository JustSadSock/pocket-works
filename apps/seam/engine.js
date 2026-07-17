import {
  AxisGame as BaseAxisGame,
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

export class AxisGame extends BaseAxisGame {
  constructor(options = {}) {
    super({ centerReplies: 3, centerSupport: 4, crownMinGroup: 2, maxTurns: 200, ...options });
    this.reserveEnabled = options.reserveEnabled !== false;
    this.reserve = { 1: 0, 2: 0, ...(options.reserve || {}) };
  }

  static fromJSON(data = {}) {
    const restored = BaseAxisGame.fromJSON({
      ...data,
      centerReplies: Number.isInteger(data.centerReplies) ? data.centerReplies : 3,
      centerSupport: Number.isInteger(data.centerSupport) ? data.centerSupport : 4,
      maxTurns: data.maxTurns || 200
    });
    Object.setPrototypeOf(restored, AxisGame.prototype);
    restored.reserveEnabled = data.reserveEnabled !== false;
    restored.reserve = { 1: Number(data.reserve?.[1]) || 0, 2: Number(data.reserve?.[2]) || 0 };
    return restored;
  }

  clone() {
    return AxisGame.fromJSON(this.toJSON());
  }

  toJSON() {
    return { ...super.toJSON(), reserveEnabled: this.reserveEnabled, reserve: { ...this.reserve } };
  }

  homeCells(player = this.turn) {
    const homeR = player === PLAYER.AZURE ? -this.radius : this.radius;
    return boardCells(this.radius).filter((cell) => cell[1] === homeR);
  }

  deploymentCells(player = this.turn) {
    if (!this.reserveEnabled || this.reserve[player] <= 0) return [];
    return this.homeCells(player).filter((cell) => {
      if (this.valueAt(cell) !== 0) return false;
      return DIRECTIONS.some(([dq, dr]) => this.valueAt([cell[0] + dq, cell[1] + dr]) === player);
    });
  }

  legalMoves(player = this.turn) {
    const moves = super.legalMoves(player);
    if (this.winner) return moves;
    for (const cell of this.deploymentCells(player)) {
      moves.push({ selected: [], direction: -1, kind: 'deploy', pushed: [], ejected: [], destinations: [coordKey(cell)] });
    }
    return moves;
  }

  applyMove(move) {
    if (move?.kind === 'deploy') return this.applyDeployment(move);
    const crownsBefore = { ...this.crown };
    const result = super.applyMove(move);
    if (!result.ok || !this.reserveEnabled) return result;
    result.ejected?.forEach((key, index) => {
      const owner = result.ejectedPlayers?.[index];
      if (owner && crownsBefore[owner] !== key) this.reserve[owner] += 1;
    });
    result.reserve = { ...this.reserve };
    return result;
  }

  applyDeployment(move) {
    if (this.winner) return { ok: false, reason: 'finished' };
    const player = this.turn;
    const opponent = 3 - player;
    const destination = move?.destinations?.[0];
    const allowed = new Set(this.deploymentCells(player).map(coordKey));
    if (!destination || !allowed.has(destination)) return { ok: false, reason: 'illegal' };

    this.board[destination] = player;
    this.reserve[player] -= 1;
    this.moveNumber += 1;
    this.swapAvailable = this.pieRule && this.moveNumber === 1;
    this.lastMove = { selected: [], direction: -1, kind: 'deploy', pushed: [], ejected: [], destinations: [destination], player };

    this.updateCenterAfterAction(player);
    if (!this.winner) {
      this.turn = opponent;
      this.swapAvailable = this.pieRule && this.moveNumber === 1;
      if (this.moveNumber >= this.maxTurns) {
        this.winner = -1;
        this.winReason = 'turn-limit';
      }
    } else {
      this.swapAvailable = false;
    }

    return {
      ok: true,
      move: this.lastMove,
      player,
      pushed: [],
      ejected: [],
      ejectedPlayers: [],
      winner: this.winner,
      winReason: this.winReason,
      centerClaim: this.centerClaim ? { ...this.centerClaim } : null,
      reserve: { ...this.reserve }
    };
  }

  updateCenterAfterAction(player) {
    if (this.centerClaim) {
      const claimant = this.centerClaim.player;
      const intact = this.crown[claimant] === '0,0' && this.supportFor(claimant) >= this.centerSupport;
      if (!intact) this.centerClaim = null;
      else if (player === 3 - claimant) {
        this.centerClaim.replies += 1;
        if (this.centerClaim.replies >= this.centerReplies) {
          this.winner = claimant;
          this.winReason = 'center-held';
        }
      }
    }
    if (!this.winner) {
      const ready = this.crown[player] === '0,0' && this.supportFor(player) >= this.centerSupport;
      if (ready && this.centerClaim?.player !== player) this.centerClaim = { player, replies: 0 };
      if (!ready && this.centerClaim?.player === player) this.centerClaim = null;
    }
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
