import { validateMechanismContract as validateBase, createContractRepairPacket } from './contract.js';

export { createContractRepairPacket };

export function validateMechanismContract(project, compiled) {
  const report = validateBase(project, compiled);
  const extra = [];
  const evidence = new Map((compiled.parts || []).map(part => [String(part.id), part.meta?.scadEvidence || []]));
  const joints = Array.isArray(project.contract?.joints) ? project.contract.joints : [];

  for (const joint of joints) {
    if (joint?.type === 'contains') {
      extra.push(issue(
        'CONTAINMENT_NOT_CERTIFIED',
        `Связь contains для корпуса «${joint.housing || '?'}» пока только заявлена и не доказывает удержание деталей.`,
        'Не используйте contains как доказательство. Добавьте проверяемые опорные поверхности/оси после появления сертификатора корпуса либо удалите функциональное утверждение.'
      ));
    }

    if (joint?.type === 'coaxial') {
      const ids = Array.isArray(joint.parts) ? joint.parts.map(String) : [];
      const items = ids.map(id => firstAxialEvidence(evidence.get(id)));
      if (ids.length < 2) continue;
      if (items.some(item => !item)) {
        extra.push(issue(
          'UNVERIFIED_COAXIAL',
          `Соосность ${ids.join(', ')} нельзя измерить: не у всех деталей есть сертифицированная ось.`,
          'Используйте сертифицированные gear/ring/carrier-модули или не заявляйте coaxial как доказанный факт.'
        ));
        continue;
      }
      const first = items[0];
      const tolerance = Math.max(0.02, Number(joint.tolerance ?? 0.12));
      for (let i = 1; i < items.length; i++) {
        if (items[i].axis !== first.axis) {
          extra.push(issue('COAXIAL_AXIS_MISMATCH', `Оси ${ids[0]} и ${ids[i]} имеют направления ${first.axis} и ${items[i].axis}.`, 'Поверните детали на одну ось.'));
          continue;
        }
        const distance = perpendicularDistance(first.center, items[i].center, first.axis);
        if (distance > tolerance) extra.push(issue('COAXIAL_CENTER_MISMATCH', `Оси ${ids[0]} и ${ids[i]} разнесены на ${distance.toFixed(3)} мм.`, `Совместите центры с допуском ${tolerance} мм.`));
      }
    }
  }

  if (extra.length) {
    report.issues = [...(report.issues || []), ...extra];
    report.errors = [...(report.errors || []), ...extra];
    report.verified = false;
    report.exportAllowed = false;
    report.summary = `Экспорт заблокирован: ${report.errors.length} ошибок контракта.`;
  }
  return report;
}

function firstAxialEvidence(items = []) {
  return items.find(item => Array.isArray(item.center) && ['x', 'y', 'z'].includes(item.axis)) || null;
}
function perpendicularDistance(a, b, axis) {
  const dx = Number(a?.[0] || 0) - Number(b?.[0] || 0);
  const dy = Number(a?.[1] || 0) - Number(b?.[1] || 0);
  const dz = Number(a?.[2] || 0) - Number(b?.[2] || 0);
  return axis === 'x' ? Math.hypot(dy, dz) : axis === 'y' ? Math.hypot(dx, dz) : Math.hypot(dx, dy);
}
function issue(code, message, fix) { return { severity: 'error', code, message, fix }; }
