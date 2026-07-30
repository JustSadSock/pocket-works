import {
  compileBlueprint as compileCore,
  createRepairPacket,
  formatBlueprintReport,
  looksLikeBlueprintText,
  isFormaBlueprint,
  BlueprintError,
  AI_BLUEPRINT_PROMPT,
  BLUEPRINT_EXAMPLE
} from './blueprint.js';

export { createRepairPacket, formatBlueprintReport, looksLikeBlueprintText, isFormaBlueprint, BlueprintError, AI_BLUEPRINT_PROMPT, BLUEPRINT_EXAMPLE };

export function compileBlueprint(source) {
  const result = compileCore(source);
  const lifts = new Map();
  for (const frame of source.parts || []) {
    if (frame?.kind !== 'gearboxFrame' || !Array.isArray(frame.gears)) continue;
    const lift = positive(frame.baseThickness, 2.2) + positive(frame.axialClearance, 0.3);
    for (const id of frame.gears) lifts.set(String(id), Math.max(lifts.get(String(id)) || 0, lift));
  }
  for (const part of result.document.parts) {
    const lift = lifts.get(part.id);
    if (!lift) continue;
    part.node = { type: 'union', position: [0, 0, lift], children: [part.node] };
  }
  if (lifts.size) result.report.decisions.push(`Вращающиеся детали подняты над основанием на ${[...new Set(lifts.values())].join('/')} мм.`);
  return result;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
