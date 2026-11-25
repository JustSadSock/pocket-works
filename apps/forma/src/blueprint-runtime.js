import {
  formatBlueprintReport,
  looksLikeBlueprintText,
  isFormaBlueprint,
  BlueprintError,
  AI_BLUEPRINT_PROMPT,
  BLUEPRINT_EXAMPLE
} from './blueprint.js';

export { formatBlueprintReport, looksLikeBlueprintText, isFormaBlueprint, BlueprintError, AI_BLUEPRINT_PROMPT, BLUEPRINT_EXAMPLE };

export function compileBlueprint() {
  throw new BlueprintError(
    'FormaBlueprint 1 отключён: он описывал намерение, но не мог доказать реальную кинематику. Экспортируйте ответ нейронки как FORMA 2.0 .scad с блоком FORMA_PROJECT и функциональным contract.'
  );
}

// The legacy compiler is retained for archival validation, but the live import
// must never invite an AI to regenerate a format that runtime refuses.
export function createRepairPacket(source,error){
 const issues=error?.issues||[error?.message||String(error)];
 return 'Перенеси исходный FormaBlueprint в FORMA 2.0 .scad с блоком FORMA_PROJECT и функциональным contract. Не выдавай FormaBlueprint 1: он больше не принимается. Сохрани размеры, детали и проверяемые кинематические ограничения.\n\nОшибки:\n'+issues.join('\n')+'\n\nИсходный Blueprint:\n'+(typeof source==='string'?source:JSON.stringify(source,null,2));
}
