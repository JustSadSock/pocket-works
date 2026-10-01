export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function healthPercent(health: number, maxHealth: number) {
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) return 0;
  return clampPercent((health / maxHealth) * 100);
}

export function hasProgress(flags: Record<string, boolean>, inventory: string[], playSeconds: number) {
  return Object.keys(flags).some((key) => flags[key] === true) || inventory.length > 0 || playSeconds > 5;
}

export function canUseOath(resolve: number, cost = 40) {
  return Number.isFinite(resolve) && resolve >= cost;
}


export type OccludedSection = 'crypt' | 'hall' | 'tower' | 'archive' | 'seal';

export function getOccludedSections(flags: Record<string, boolean>): OccludedSection[] {
  const hidden: OccludedSection[] = [];
  if (!flags.secretDoorOpen) hidden.push('crypt');
  if (!flags.cryptWardenDefeated) hidden.push('hall');
  if (!flags.hallAwakened) hidden.push('tower');
  if (!flags.bellFightCleared) hidden.push('archive');
  if (!flags.archiveExamined) hidden.push('seal');
  return hidden;
}
