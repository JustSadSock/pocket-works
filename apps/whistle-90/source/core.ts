export type Team = 'home' | 'away';
export type RestartKind = 'goal' | 'throw-in' | 'corner' | 'goal-kick' | 'in-play';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PitchBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  goalLeft: number;
  goalRight: number;
}

export interface RestartDecision {
  kind: RestartKind;
  team?: Team;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export function normalize(v: Vec2): Vec2 {
  const l = length(v);
  return l > 0.0001 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Vec2, scalar: number): Vec2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function opposite(team: Team): Team {
  return team === 'home' ? 'away' : 'home';
}

export function decideBoundaryRestart(
  ball: Vec2,
  lastTouch: Team,
  bounds: PitchBounds,
  homeAttacksTop: boolean
): RestartDecision {
  const insideGoal = ball.x >= bounds.goalLeft && ball.x <= bounds.goalRight;
  if (ball.y < bounds.top && insideGoal) {
    const scoringTeam: Team = homeAttacksTop ? 'home' : 'away';
    return { kind: 'goal', team: scoringTeam, side: 'top' };
  }
  if (ball.y > bounds.bottom && insideGoal) {
    const scoringTeam: Team = homeAttacksTop ? 'away' : 'home';
    return { kind: 'goal', team: scoringTeam, side: 'bottom' };
  }
  if (ball.x < bounds.left) return { kind: 'throw-in', team: opposite(lastTouch), side: 'left' };
  if (ball.x > bounds.right) return { kind: 'throw-in', team: opposite(lastTouch), side: 'right' };

  if (ball.y < bounds.top) {
    const defendingTeam: Team = homeAttacksTop ? 'away' : 'home';
    return lastTouch === defendingTeam
      ? { kind: 'corner', team: opposite(defendingTeam), side: 'top' }
      : { kind: 'goal-kick', team: defendingTeam, side: 'top' };
  }
  if (ball.y > bounds.bottom) {
    const defendingTeam: Team = homeAttacksTop ? 'home' : 'away';
    return lastTouch === defendingTeam
      ? { kind: 'corner', team: opposite(defendingTeam), side: 'bottom' }
      : { kind: 'goal-kick', team: defendingTeam, side: 'bottom' };
  }
  return { kind: 'in-play' };
}

export function isOffsidePosition(
  attackerY: number,
  ballY: number,
  defenderYs: number[],
  attacksTop: boolean,
  halfwayY: number
): boolean {
  if (defenderYs.length < 2) return false;
  if (attacksTop) {
    if (attackerY >= halfwayY || attackerY >= ballY) return false;
    const secondLast = [...defenderYs].sort((a, b) => a - b)[1];
    return attackerY < secondLast;
  }
  if (attackerY <= halfwayY || attackerY <= ballY) return false;
  const sorted = [...defenderYs].sort((a, b) => b - a);
  return attackerY > sorted[1];
}

export function cardForFoul(severity: number, previousYellow: boolean): 'none' | 'yellow' | 'red' | 'second-yellow' {
  if (severity >= 0.92) return 'red';
  if (severity >= 0.58) return previousYellow ? 'second-yellow' : 'yellow';
  return 'none';
}

export function chargeToShotSpeed(chargeMs: number): number {
  return 285 + clamp(chargeMs / 900, 0, 1) * 190;
}

export function matchMinute(elapsedSeconds: number, realSecondsPerHalf: number): number {
  const half = realSecondsPerHalf;
  if (elapsedSeconds <= half) return Math.min(45, Math.floor((elapsedSeconds / half) * 45));
  return Math.min(90, 45 + Math.floor(((elapsedSeconds - half) / half) * 45));
}

export function formatClock(minute: number, secondsFraction: number): string {
  const minutes = Math.max(0, Math.floor(minute));
  const seconds = Math.floor(clamp(secondsFraction, 0, 0.999) * 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
