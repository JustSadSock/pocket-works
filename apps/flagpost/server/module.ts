import type { PocketModule } from '../../../pocket-server/module-contract.js';

export const MIN_PLAYERS = 2;
export const RULESET_VERSION = 1;

type Player = { id: string; name: string };
type Unit = { id: number; side: 0 | 1; x: number; y: number };
type State = {
  phase: 'lobby' | 'battle' | 'finished';
  host: string;
  players: Player[];
  units: Unit[];
  turn: 0 | 1;
  actions: number;
  scores: [number, number];
  round: number;
  nextUnit: number;
  winner: 0 | 1 | null;
  last: string;
  revision: number;
};

const WIDTH = 5;
const HEIGHT = 7;
const WIN_SCORE = 3;
const rocks = new Set(['0,3', '4,3']);
const inside = (x: number, y: number) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const at = (s: State, x: number, y: number) => s.units.find(unit => unit.x === x && unit.y === y);
const sideLabel = (side: number) => side === 0 ? 'Север' : 'Юг';
const whole = (n: unknown): n is number => Number.isInteger(n);
const emit = (s: State) => [{ type: 'state', payload: s }];
const notice = (id: string, text: string) => [{ type: 'notice', to: id, payload: text }];

function reset(s: State) {
  s.phase = 'lobby';
  s.units = [];
  s.turn = 0;
  s.actions = 2;
  s.scores = [0, 0];
  s.round = 1;
  s.nextUnit = 1;
  s.winner = null;
  s.last = 'Ожидание второго полководца';
  s.revision++;
}
function start(s: State) {
  s.phase = 'battle';
  s.units = [];
  for (const [side, row] of [[0, 1], [1, 5]] as const) {
    for (const x of [1, 2, 3]) {
      s.units.push({ id: s.nextUnit++, side, x, y: row });
    }
  }
  s.turn = 0;
  s.actions = 2;
  s.scores = [0, 0];
  s.round = 1;
  s.winner = null;
  s.last = 'Север начинает. Два приказа за ход.';
  s.revision++;
}
function finish(s: State, winner: 0 | 1 | null, detail: string) {
  s.phase = 'finished';
  s.winner = winner;
  s.actions = 0;
  s.last = detail;
  s.revision++;
}
function actMove(s: State, player: Player, raw: Record<string, unknown>) {
  const { x, y, tx, ty } = raw;
  if (![x, y, tx, ty].every(whole)) return 'Выбери клетку на поле.';
  const sx = x as number, sy = y as number, dx = tx as number, dy = ty as number;
  if (!inside(sx, sy) || !inside(dx, dy) || Math.abs(sx - dx) + Math.abs(sy - dy) !== 1) return 'Приказ возможен только на соседнюю клетку.';
  if (rocks.has(`${dx},${dy}`)) return 'Через скалы не пройти.';
  const unit = at(s, sx, sy);
  if (!unit || unit.side !== s.turn) return 'Это не твой отряд.';
  const target = at(s, dx, dy);
  if (target?.side === s.turn) return 'Клетка занята союзником.';
  if (target) s.units = s.units.filter(other => other.id !== target.id);
  unit.x = dx;
  unit.y = dy;
  s.actions--;
  s.revision++;
  const label = sideLabel(s.turn);
  s.last = target ? `${label} захватил вражеский отряд` : `${label} передвинул отряд`;
  if (dx === 2 && dy === (s.turn === 0 ? 6 : 0)) {
    finish(s, s.turn, `${label} захватил крепость противника!`);
  }
  return null;
}
function recruit(s: State) {
  const side = s.turn;
  const x = 2, y = side === 0 ? 0 : 6;
  if (at(s, x, y)) return 'Казарма занята — освободи крепость.';
  if (s.units.filter(unit => unit.side === side).length >= 5) return 'Можно содержать не больше пяти отрядов.';
  s.units.push({ id: s.nextUnit++, side, x, y });
  s.actions--;
  s.revision++;
  s.last = `${sideLabel(side)} создал новый отряд`;
  return null;
}
function endTurn(s: State) {
  const center = at(s, 2, 3);
  if (center?.side === s.turn) {
    s.scores[s.turn]++;
    s.last = `${sideLabel(s.turn)} держит сигнальную башню: +1 знамя`;
    if (s.scores[s.turn] >= WIN_SCORE) {
      finish(s, s.turn, `${sideLabel(s.turn)} удержал башню три раза!`);
      return;
    }
  } else {
    s.last = `Приказы переданы стороне «${sideLabel(1 - s.turn)}»`;
  }
  if (s.round >= 60) {
    const winner = s.scores[0] > s.scores[1] ? 0 : s.scores[1] > s.scores[0] ? 1 : null;
    finish(s, winner, winner === null ? 'Ничья после 60 ходов.' : `${sideLabel(winner)} победил по знамёнам.`);
    return;
  }
  s.turn = (1 - s.turn) as 0 | 1;
  s.round++;
  s.actions = 2;
  s.revision++;
}

const module: PocketModule<State> = {
  protocolVersion: 1,
  createRoom({ player }) {
    return {
      state: { phase: 'lobby', host: player.id, players: [player], units: [],
        turn: 0, actions: 2, scores: [0, 0], round: 1, nextUnit: 1,
        winner: null, last: 'Ожидание второго полководца', revision: 0 }
    };
  },
  onJoin({ state, player, players }) {
    if (players.length > 2) throw Error('room_full');
    if (state.phase === 'battle') throw Error('match_in_progress');
    if (state.phase === 'finished') reset(state);
    state.players = players;
    state.last = 'Оба игрока в зале. Можно начинать.';
    state.revision++;
    return { state, events: emit(state) };
  },
  onLeave({ state, player, players }) {
    const leavingSide = state.players.findIndex(p => p.id === player.id);
    if (state.phase === 'battle') finish(state, (1 - leavingSide) as 0 | 1, 'Соперник покинул поле. Победа!');
    // Preserve original side mapping in a completed match.
    if (state.phase === 'lobby') {
      state.players = players;
      state.last = 'Ожидание второго полководца';
    }
    if (state.host === player.id) state.host = players[0]?.id || '';
    return { state, events: emit(state) };
  },
  onMessage({ state, player, players, payload }) {
    const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const side = state.players.findIndex(p => p.id === player.id);
    if (side < 0) return { state, events: notice(player.id, 'Ты не участник комнаты.') };
    if (raw.type === 'sync') return { state, events: [{ type: 'state', to: player.id, payload: state }] };
    if (raw.type === 'start') {
      if (state.phase !== 'lobby' || state.host !== player.id || state.players.length !== 2 || players.length !== 2)
        return { state, events: notice(player.id, 'Начать может создатель, когда подключатся два игрока.') };
      start(state);
      return { state, events: emit(state) };
    }
    if (raw.type === 'again') {
      if (state.phase !== 'finished' || state.host !== player.id || state.players.length !== 2 || players.length !== 2)
        return { state, events: notice(player.id, 'Новая партия доступна создателю комнаты, когда оба игрока здесь.') };
      reset(state);
      return { state, events: emit(state) };
    }
    if (state.phase !== 'battle') return { state, events: notice(player.id, 'Сейчас нет активного сражения.') };
    if (raw.type === 'resign') {
      finish(state, (1 - side) as 0 | 1, `${sideLabel(side)} признал поражение`);
      return { state, events: emit(state) };
    }
    if (side !== state.turn) return { state, events: notice(player.id, 'Сейчас ход соперника.') };
    let error: string | null = null;
    if (raw.type === 'move') {
      if (!state.actions) error = 'Приказы закончились. Передай ход.';
      else error = actMove(state, player, raw);
    } else if (raw.type === 'recruit') {
      if (!state.actions) error = 'Приказы закончились. Передай ход.';
      else error = recruit(state);
    } else if (raw.type === 'end') {
      endTurn(state);
    } else error = 'Неизвестный приказ.';
    return { state, events: error ? notice(player.id, error) : emit(state) };
  }
};
export default module;
