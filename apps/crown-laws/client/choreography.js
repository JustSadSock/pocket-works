// Pure presentation planner. All authoritative game logic lives in game-engine.js.
// In online play, intermediate states are not sent by PocketNet. NEVER invent them.
export const PHASE_ORDER = Object.freeze(["laws", "priest", "champion", "guard", "beast", "thief", "throne"]);
export const PHASE_LABELS = Object.freeze({
  start: "Два тайных указа", laws: "Законы раскрыты", priest: "Жрец",
  champion: "Претенденты", guard: "Стражник", beast: "Зверь",
  thief: "Вор", throne: "Решение трона", settled: "Ход завершён",
  outcome: "Итог открытого хода"
});
const DURATIONS = Object.freeze({
  start: 260, laws: 510, priest: 420, champion: 500,
  guard: 460, beast: 530, thief: 480, throne: 650,
  outcome: 740, settled: 220
});
const byPhase = (logs, phase) => (logs || []).filter(x => x.phase === phase);
const moved = frame => Array.isArray(frame.moves) && frame.moves.length > 0;
const interesting = frame => moved(frame) || (frame.logs || []).some(log => !["hold", "crown-check", "guard-stance", "beast-hold", "thief-hold"].includes(log.kind));

export function planTurnFilm({before, after, frames = null, logs = [], conflicts = []}, {compact = false} = {}) {
  if (!before || !after) return [];
  if (Array.isArray(frames) && frames.length >= 2) {
    return frames.map((frame, i) => {
      const phase = frame.phase;
      const changed = interesting(frame);
      const duration = compact ? 90 : (changed ? DURATIONS[phase] || 400 : Math.min(230, DURATIONS[phase] || 240));
      return {
        phase,
        label: PHASE_LABELS[phase] || phase,
        state: frame.state,
        logs: frame.logs || [],
        moves: frame.moves || [],
        crowns: frame.crowns || [],
        seals: frame.seals || [],
        conflicts: phase === "laws" ? conflicts : [],
        duration,
        index: i,
        count: frames.length,
        source: "engine"
      };
    });
  }
  // Network packets intentionally omit exact phase snapshots. Use only public before/after.
  return [
    {phase:"start", label:PHASE_LABELS.start, state:before, logs:[],moves:[],crowns:[],seals:[],conflicts:[],duration:compact?90:360,index:0,count:3,source:"network"},
    {phase:"outcome",label:PHASE_LABELS.outcome,state:after,logs:(logs||[]).slice(0,12),moves:[],crowns:[],seals:[],conflicts,duration:compact?90:740,index:1,count:3,source:"network"},
    {phase:"settled",label:PHASE_LABELS.settled,state:after,logs:[],moves:[],crowns:[],seals:[],conflicts:[],duration:compact?60:200,index:2,count:3,source:"network"}
  ];
}

export function soundForFrame(frame) {
  if (!frame) return null;
  const kinds=(frame.logs||[]).map(entry=>entry.kind);
  if (frame.phase === "laws") return frame.conflicts?.length ? "conflict" : "ready";
  if (frame.phase === "priest") return kinds.includes("shield") ? "shield" : "priest";
  if (frame.phase === "champion") return moved(frame) ? "champion" : null;
  if (frame.phase === "guard") return kinds.some(k=>String(k).includes("attack")||k==="hit") ? "guard" : moved(frame) ? "move" : null;
  if (frame.phase === "beast") return moved(frame)||kinds.some(k=>String(k).includes("attack")) ? "beast" : null;
  if (frame.phase === "thief") return kinds.some(k=>String(k).includes("seal")||String(k).includes("steal")) ? "seal" : moved(frame) ? "thief" : null;
  if (frame.phase === "throne") return (frame.crowns||[]).some(c=>c.kind==="gain") ? "crown" : null;
  if (frame.phase === "outcome") return frame.conflicts?.length ? "conflict" : kinds.some(k=>k==="crown-gain") ? "crown" : "move";
  return null;
}
