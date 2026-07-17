const DIRECTIONS = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
function analyze(width, height, startBlue, startOrange) {
  const bit = (cell) => 1n << BigInt(cell);
  const rowCol = (cell) => [Math.floor(cell / width), cell % width];
  const key = (blue, orange, blocked, turn) => `${blue}:${orange}:${blocked.toString(36)}:${turn}`;
  function moves(blue, orange, blocked, turn) {
    const origin = turn === 0 ? blue : orange;
    const opponent = turn === 0 ? orange : blue;
    const [row, col] = rowCol(origin);
    const result = [];
    for (const [dr, dc] of DIRECTIONS) {
      let r = row + dr, c = col + dc;
      while (r >= 0 && r < height && c >= 0 && c < width) {
        const destination = r * width + c;
        if (destination === opponent || (blocked & bit(destination)) !== 0n) break;
        result.push(destination); r += dr; c += dc;
      }
    }
    return result;
  }
  const reachable = new Set();
  function visit(blue, orange, blocked, turn) {
    const id = key(blue, orange, blocked, turn);
    if (reachable.has(id)) return;
    reachable.add(id);
    const origin = turn === 0 ? blue : orange;
    for (const destination of moves(blue, orange, blocked, turn)) {
      visit(turn === 0 ? destination : blue, turn === 1 ? destination : orange, blocked | bit(origin), 1 - turn);
    }
  }
  const solved = new Map();
  function currentPlayerWins(blue, orange, blocked, turn) {
    const id = key(blue, orange, blocked, turn);
    if (solved.has(id)) return solved.get(id);
    const options = moves(blue, orange, blocked, turn);
    if (!options.length) { solved.set(id, false); return false; }
    const origin = turn === 0 ? blue : orange;
    const result = options.some((destination) => !currentPlayerWins(
      turn === 0 ? destination : blue,
      turn === 1 ? destination : orange,
      blocked | bit(origin),
      1 - turn,
    ));
    solved.set(id, result);
    return result;
  }
  visit(startBlue, startOrange, 0n, 0);
  const openings = moves(startBlue, startOrange, 0n, 0);
  const winningOpenings = openings.filter((destination) => !currentPlayerWins(destination, startOrange, bit(startBlue), 1)).length;
  return { board: `${width}×${height}`, reachableStates: reachable.size, openings: openings.length, winningOpenings, starterWins: currentPlayerWins(startBlue, startOrange, 0n, 0) };
}
for (const report of [analyze(3,3,1,7), analyze(4,3,1,10), analyze(3,4,1,10)]) console.log(report);
