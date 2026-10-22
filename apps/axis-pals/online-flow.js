// A PocketNet round is authoritative: visual overlays must follow the server's stage.
export function isFreshOnlineRound(previous, next) {
  if (next?.phase !== 'play') return false;
  if (!previous || previous.phase !== 'play') return true;
  if (previous.kind !== next.kind || previous.index !== next.index ||
      previous.level?.seed !== next.level?.seed) return true;
  // Restart of the same room, including a zero-move restart.
  return previous.revision !== next.revision && next.steps === 0;
}
export function wonStageToken(state) {
  if (state?.phase !== 'won' || !Number.isInteger(state.index) ||
      !Number.isInteger(state.level?.seed)) return '';
  return `${state.kind}:${state.index}:${state.level.seed}`;
}
