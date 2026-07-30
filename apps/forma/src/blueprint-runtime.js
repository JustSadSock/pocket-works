import {
  createRepairPacket,
  formatBlueprintReport,
  looksLikeBlueprintText,
  isFormaBlueprint,
  BlueprintError,
  AI_BLUEPRINT_PROMPT,
  BLUEPRINT_EXAMPLE
} from './blueprint.js';

export { createRepairPacket, formatBlueprintReport, looksLikeBlueprintText, isFormaBlueprint, BlueprintError, AI_BLUEPRINT_PROMPT, BLUEPRINT_EXAMPLE };

export function compileBlueprint() {
  throw new BlueprintError(
    'FormaBlueprint 1 отключён: он описывал намерение, но не мог доказать реальную кинематику. Экспортируйте ответ нейронки как FORMA 2.0 .scad с блоком FORMA_PROJECT и функциональным contract.'
  );
}
