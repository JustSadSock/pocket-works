const EPS = 1e-6;

export class ContractError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ContractError';
    this.issues = issues;
  }
}

export function validateMechanismContract(project, compiled) {
  const contract = project.contract || { mode: 'static' };
  const mode = String(contract.mode || 'static');
  const issues = [];
  const checks = [];
  const partMap = new Map((project.parts || []).map(part => [String(part.id), part]));
  const compiledMap = new Map((compiled.parts || []).map(part => [String(part.id), part]));
  const joints = Array.isArray(contract.joints) ? contract.joints : [];
  const objectives = Array.isArray(contract.objectives) ? contract.objectives : [];

  for (const [id] of partMap) {
    if (!compiledMap.has(id)) issues.push(issue('PART_NOT_COMPILED', `Деталь «${id}» объявлена, но не скомпилирована.`, `Проверьте entry/module у parts.${id}.`));
  }

  const refs = value => Array.isArray(value) ? value : [value];
  const requireParts = (joint, keys) => {
    for (const key of keys) for (const id of refs(joint[key]).filter(Boolean)) {
      if (!partMap.has(String(id))) issues.push(issue('UNKNOWN_PART', `Связь ${joint.type || 'unknown'} ссылается на отсутствующую деталь «${id}».`, `Добавьте parts с id «${id}» или исправьте ссылку.`));
    }
  };

  const fixed = new Set();
  const graph = new Map();
  const planetary = [];
  const certified = collectEvidence(compiled.parts || []);

  for (const joint of joints) {
    const type = String(joint?.type || '');
    if (type === 'fixed') {
      requireParts(joint, ['part']);
      if (joint.part) fixed.add(String(joint.part));
      checks.push(ok(`Фиксация: ${joint.part}`));
      continue;
    }
    if (type === 'revolute') {
      requireParts(joint, ['part']);
      if (!['x', 'y', 'z'].includes(String(joint.axis || 'z'))) issues.push(issue('BAD_AXIS', `revolute для «${joint.part}» имеет неизвестную ось.`, 'Используйте axis: "x", "y" или "z".'));
      checks.push(ok(`Вращательная степень свободы: ${joint.part}`));
      continue;
    }
    if (type === 'gearMesh') {
      requireParts(joint, ['a', 'b']);
      const a = partMap.get(String(joint.a));
      const b = partMap.get(String(joint.b));
      const ta = gearTeeth(a, joint.teethA), tb = gearTeeth(b, joint.teethB);
      const ma = gearModule(a, joint.module), mb = gearModule(b, joint.module);
      if (!(ta > 0 && tb > 0)) issues.push(issue('MISSING_TEETH', `Зацепление ${joint.a} ↔ ${joint.b} не имеет числа зубьев.`, 'Укажите mechanics.teeth у обеих деталей.'));
      if (!(ma > 0 && mb > 0)) issues.push(issue('MISSING_MODULE', `Зацепление ${joint.a} ↔ ${joint.b} не имеет модуля.`, 'Укажите mechanics.module у обеих деталей.'));
      if (ma > 0 && mb > 0 && Math.abs(ma - mb) > EPS) issues.push(issue('MODULE_MISMATCH', `Модули шестерён ${joint.a} (${ma}) и ${joint.b} (${mb}) не совпадают.`, 'Используйте одинаковый module.'));
      const evidenceA = getCertifiedGear(certified, joint.a, ta, ma);
      const evidenceB = getCertifiedGear(certified, joint.b, tb, mb);
      if (!evidenceA || !evidenceB) {
        issues.push(issue('UNVERIFIED_GEAR_GEOMETRY', `Зацепление ${joint.a} ↔ ${joint.b} не подтверждено сертифицированной геометрией.`, 'Стройте обе детали через forma_spur_gear(...) с параметрами, совпадающими с mechanics.'));
      } else {
        if (evidenceA.axis !== evidenceB.axis) issues.push(issue('GEAR_AXIS_MISMATCH', `Оси ${joint.a} (${evidenceA.axis}) и ${joint.b} (${evidenceB.axis}) не параллельны.`, 'Поверните шестерни на одну ось.'));
        const actualDistance = distancePerpendicular(evidenceA.center, evidenceB.center, evidenceA.axis);
        const clearance = Number(joint.clearance ?? 0);
        const expectedDistance = ma * (ta + tb) / 2 + clearance;
        const tolerance = Math.max(0.08, Number(joint.centerTolerance ?? 0.18));
        if (Math.abs(actualDistance - expectedDistance) > tolerance) issues.push(issue('GEAR_CENTER_DISTANCE', `Межосевое ${joint.a} ↔ ${joint.b}: ${actualDistance.toFixed(3)} мм, требуется ${expectedDistance.toFixed(3)} ± ${tolerance} мм.`, 'Исправьте translate(...) одной из шестерён или числа зубьев/module.'));
        else checks.push(ok(`Межосевое ${joint.a} ↔ ${joint.b}: ${actualDistance.toFixed(3)} мм`));
      }
      if (ta > 0 && tb > 0) {
        addEdge(graph, String(joint.a), String(joint.b), -ta / tb, type);
        addEdge(graph, String(joint.b), String(joint.a), -tb / ta, type);
        checks.push(ok(`Зацепление ${joint.a} → ${joint.b}: ${formatRatio(ta / tb)}`));
      }
      continue;
    }
    if (type === 'coaxial') {
      requireParts(joint, ['parts']);
      const ids = refs(joint.parts).map(String);
      if (ids.length < 2) issues.push(issue('COAXIAL_TOO_SHORT', 'coaxial должен содержать минимум две детали.', 'Добавьте parts: ["a", "b"].'));
      checks.push(ok(`Общая ось: ${ids.join(', ')}`));
      continue;
    }
    if (type === 'contains') {
      requireParts(joint, ['housing', 'parts']);
      checks.push(ok(`Корпус ${joint.housing} удерживает ${refs(joint.parts).join(', ')}`));
      continue;
    }
    if (type === 'planetary') {
      requireParts(joint, ['sun', 'ring', 'carrier', 'planets']);
      const ns = Number(joint.teeth?.sun ?? gearTeeth(partMap.get(String(joint.sun))));
      const nr = Number(joint.teeth?.ring ?? gearTeeth(partMap.get(String(joint.ring))));
      const np = Number(joint.teeth?.planet ?? gearTeeth(partMap.get(String(refs(joint.planets)[0]))));
      if (!(ns > 0 && nr > 0 && np > 0)) issues.push(issue('PLANETARY_TEETH_MISSING', 'Планетарная связь требует teeth.sun, teeth.ring и teeth.planet.', 'Укажите целые числа зубьев.'));
      if (ns > 0 && nr > 0 && np > 0 && Math.abs(nr - (ns + 2 * np)) > EPS) issues.push(issue('PLANETARY_GEOMETRY', `Для внутреннего зацепления должно быть ring = sun + 2×planet, сейчас ${nr} ≠ ${ns} + 2×${np}.`, `Используйте ring=${ns + 2 * np} или пересчитайте комплект.`));
      const moduleValues = [joint.sun, joint.ring, ...refs(joint.planets)].map(id => gearModule(partMap.get(String(id)), joint.module)).filter(v => v > 0);
      if (moduleValues.length && moduleValues.some(v => Math.abs(v - moduleValues[0]) > EPS)) issues.push(issue('PLANETARY_MODULE_MISMATCH', 'У планетарного комплекта не совпадают модули.', 'Назначьте один module всем колёсам.'));
      const sunEvidence = getCertifiedGear(certified, joint.sun, ns, moduleValues[0]);
      const ringEvidence = getCertifiedRing(certified, joint.ring, nr, moduleValues[0]);
      const planetIds = refs(joint.planets).map(String);
      const planetEvidence = planetIds.map(id => getCertifiedGear(certified, id, np, moduleValues[0]));
      const carrierEvidence = getCertifiedCarrier(certified, joint.carrier);
      if (!sunEvidence || !ringEvidence || planetEvidence.some(item => !item) || !carrierEvidence) {
        issues.push(issue('UNVERIFIED_PLANETARY_GEOMETRY', 'Планетарный комплект не подтверждён сертифицированными sun/ring/planet/carrier-геометриями.', 'Используйте forma_spur_gear для sun/planet, forma_ring_gear для ring и forma_planet_carrier для carrier.'));
      } else {
        const centerError = distance3(sunEvidence.center, ringEvidence.center);
        if (centerError > 0.12) issues.push(issue('PLANETARY_NOT_COAXIAL', `Центры sun и ring расходятся на ${centerError.toFixed(3)} мм.`, 'Совместите их translate(...) координаты.'));
        const expectedOrbit = moduleValues[0] * (ns + np) / 2;
        for (let i = 0; i < planetEvidence.length; i++) {
          const orbit = distancePerpendicular(sunEvidence.center, planetEvidence[i].center, sunEvidence.axis);
          if (Math.abs(orbit - expectedOrbit) > 0.18) issues.push(issue('PLANET_ORBIT', `Планета ${planetIds[i]} стоит на радиусе ${orbit.toFixed(3)} мм, требуется ${expectedOrbit.toFixed(3)} мм.`, 'Исправьте translate(...) планеты.'));
        }
        if (Math.abs(carrierEvidence.orbit - expectedOrbit) > 0.18) issues.push(issue('CARRIER_ORBIT', `Оси carrier имеют радиус ${carrierEvidence.orbit.toFixed(3)} мм, требуется ${expectedOrbit.toFixed(3)} мм.`, 'Исправьте orbit в forma_planet_carrier(...).'));
        if (carrierEvidence.count !== planetIds.length) issues.push(issue('CARRIER_PIN_COUNT', `Carrier содержит ${carrierEvidence.count} осей, а contract объявляет ${planetIds.length} планет.`, 'Согласуйте count и planets.'));
        if (!issues.some(item => ['PLANETARY_NOT_COAXIAL','PLANET_ORBIT','CARRIER_ORBIT','CARRIER_PIN_COUNT'].includes(item.code))) checks.push(ok(`Планетарная раскладка: орбита ${expectedOrbit.toFixed(3)} мм`));
      }
      planetary.push({ ...joint, ns, nr, np });
      checks.push(ok(`Планетарный комплект: sun ${ns}, planet ${np}, ring ${nr}`));
      continue;
    }
    if (type === 'differential') {
      requireParts(joint, ['carrier', 'outputs']);
      const outputs = refs(joint.outputs).filter(Boolean);
      issues.push(issue('DIFFERENTIAL_NOT_CERTIFIED', `Дифференциал «${joint.id || 'без id'}» нельзя подтвердить текущим CAD-профилем.`, `FORMA 2.0 не будет притворяться: замените механизм на проверяемый planetary либо дождитесь сертифицированного генератора bevel differential. Заявленные outputs: ${outputs.join(', ') || 'нет'}.`));
      continue;
    }
    issues.push(issue('UNKNOWN_JOINT', `Неизвестный тип связи «${type || 'пусто'}».`, 'Используйте fixed, revolute, gearMesh, coaxial, contains или planetary.'));
  }

  if (mode === 'mechanical' && !joints.length) issues.push(issue('NO_MECHANISM', 'Механический проект не содержит contract.joints.', 'Опишите степени свободы и передачи.'));
  if (mode === 'mechanical' && !objectives.length) issues.push(issue('NO_OBJECTIVE', 'Механический проект не содержит проверяемой цели.', 'Добавьте objectives, например speedRatio или fixedPart.'));

  const objectiveResults = [];
  for (const objective of objectives) {
    const type = String(objective?.type || '');
    if (type === 'fixedPart') {
      const id = String(objective.part || '');
      if (!partMap.has(id)) issues.push(issue('OBJECTIVE_UNKNOWN_PART', `Цель fixedPart ссылается на «${id}».`, 'Исправьте objective.part.'));
      else if (!fixed.has(id)) issues.push(issue('FIXED_OBJECTIVE_FAILED', `Деталь «${id}» должна быть неподвижной, но contract.joints не фиксирует её.`, `Добавьте {"type":"fixed","part":"${id}"}.`));
      else objectiveResults.push(pass(`Неподвижная деталь: ${id}`, 1, 1));
      continue;
    }
    if (type === 'speedRatio') {
      const input = String(objective.input || '');
      const output = String(objective.output || '');
      const target = positiveNumber(objective.ratio);
      if (!partMap.has(input) || !partMap.has(output)) {
        issues.push(issue('RATIO_UNKNOWN_PART', `Цель speedRatio ссылается на отсутствующий input/output.`, 'Исправьте objective.input и objective.output.'));
        continue;
      }
      let actual = solveGraphRatio(graph, input, output);
      if (actual == null) actual = solvePlanetaryRatio(planetary, fixed, input, output);
      if (actual == null) {
        issues.push(issue('RATIO_UNSOLVED', `Не удалось вычислить скорость ${output} относительно ${input}.`, 'Свяжите их gearMesh или planetary и укажите фиксированный элемент.'));
        continue;
      }
      const magnitude = Math.abs(actual);
      const direction = String(objective.direction || 'either');
      const tolerance = Math.max(0.001, Number(objective.tolerance ?? 0.03));
      const relativeError = target > 0 ? Math.abs(magnitude - target) / target : Infinity;
      const directionOk = direction === 'either' || (direction === 'increase' && magnitude > 1 + EPS) || (direction === 'reduction' && magnitude < 1 - EPS);
      if (!(target > 0)) issues.push(issue('BAD_RATIO_TARGET', 'objective.ratio должен быть положительным.', 'Укажите, например, ratio: 5.'));
      else if (relativeError > tolerance) issues.push(issue('RATIO_FAILED', `Требуется ${target}:1, рассчитано ${magnitude.toFixed(4)}:1 (${actual < 0 ? 'обратное' : 'то же'} направление).`, `Исправьте числа зубьев или target; допустимое отклонение ${Math.round(tolerance * 100)}%.`));
      else if (!directionOk) issues.push(issue('RATIO_DIRECTION_FAILED', `Численное отношение подходит, но direction «${direction}» не выполняется: |ωout/ωin|=${magnitude.toFixed(4)}.`, 'Для ускорения output должен быть быстрее input; для редукции — медленнее.'));
      else objectiveResults.push(pass(`Скорость ${input} → ${output}`, target, magnitude, actual < 0 ? 'reverse' : 'same'));
      continue;
    }
    if (type === 'partCount') {
      const expected = Math.round(Number(objective.value));
      const actual = project.parts?.length || 0;
      if (actual !== expected) issues.push(issue('PART_COUNT_FAILED', `Требуется ${expected} печатных деталей, объявлено ${actual}.`, 'Исправьте parts или objective.value.'));
      else objectiveResults.push(pass('Количество деталей', expected, actual));
      continue;
    }
    if (type === 'noExternalHardware') {
      const offenders = [...partMap.values()].filter(part => part.externalHardware === true || part.mechanics?.externalHardware === true);
      if (offenders.length) issues.push(issue('EXTERNAL_HARDWARE', `Обнаружены внешние компоненты: ${offenders.map(p => p.id).join(', ')}.`, 'Уберите их или измените цель.'));
      else objectiveResults.push(pass('Без внешних компонентов', 0, 0));
      continue;
    }
    issues.push(issue('UNKNOWN_OBJECTIVE', `Неизвестная цель «${type || 'пусто'}».`, 'Используйте fixedPart, speedRatio, partCount или noExternalHardware.'));
  }

  const errors = issues.filter(item => item.severity === 'error');
  const warnings = issues.filter(item => item.severity === 'warning');
  const verified = errors.length === 0 && (mode === 'static' || objectiveResults.length === objectives.length);
  return {
    mode,
    verified,
    exportAllowed: verified,
    issues,
    errors,
    warnings,
    checks,
    objectives: objectiveResults,
    summary: verified
      ? mode === 'static' ? 'Статическая CAD-модель принята.' : `Механический контракт доказан: ${objectiveResults.length} целей.`
      : `Экспорт заблокирован: ${errors.length} ошибок контракта.`
  };
}

export function createContractRepairPacket(projectSource, report, compileError = null) {
  const failures = compileError ? [{ code: 'CAD_COMPILE_ERROR', message: compileError.message, fix: 'Исправьте OpenSCAD-код по строке и столбцу из ошибки.' }] : report?.errors || [];
  return JSON.stringify({
    task: 'Repair this FORMA CAD project. Return exactly one raw .scad file and no Markdown.',
    rules: [
      'Do not use placeholders, decorative substitutes, custom black boxes or unsupported differential claims.',
      'Keep geometry in OpenSCAD source. Keep functional intent in the FORMA_PROJECT contract.',
      'Every mechanical objective must be computable from certified joints and tooth counts.',
      'For speed increase, |output speed / input speed| must be greater than 1 and match objective.ratio.',
      'Use forma_spur_gear, forma_ring_gear and forma_planet_carrier when claiming certified gear geometry.'
    ],
    failures,
    original: safeProject(projectSource)
  }, null, 2);
}

function safeProject(source) {
  if (typeof source === 'string' && source.length > 24000) return source.slice(0, 24000) + '\n...[truncated]';
  return source;
}

function collectEvidence(parts) {
  const map = new Map();
  for (const part of parts) map.set(String(part.id), part.meta?.scadEvidence || []);
  return map;
}
function getCertifiedGear(map, id, teeth, moduleValue) {
  return (map.get(String(id)) || []).find(e => e.type === 'certified-gear' && same(e.teeth, teeth) && same(e.module, moduleValue)) || null;
}
function getCertifiedRing(map, id, teeth, moduleValue) {
  return (map.get(String(id)) || []).find(e => e.type === 'certified-ring-gear' && same(e.teeth, teeth) && same(e.module, moduleValue)) || null;
}
function getCertifiedCarrier(map, id) {
  return (map.get(String(id)) || []).find(e => e.type === 'certified-planet-carrier') || null;
}
function distance3(a,b) { return Math.hypot((a?.[0]||0)-(b?.[0]||0),(a?.[1]||0)-(b?.[1]||0),(a?.[2]||0)-(b?.[2]||0)); }
function distancePerpendicular(a,b,axis='z') {
  const dx=(a?.[0]||0)-(b?.[0]||0),dy=(a?.[1]||0)-(b?.[1]||0),dz=(a?.[2]||0)-(b?.[2]||0);
  return axis==='x'?Math.hypot(dy,dz):axis==='y'?Math.hypot(dx,dz):Math.hypot(dx,dy);
}
function same(a, b) { return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < EPS; }
function gearTeeth(part, fallback) { return positiveNumber(part?.mechanics?.teeth ?? fallback); }
function gearModule(part, fallback) { return positiveNumber(part?.mechanics?.module ?? fallback); }
function positiveNumber(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function addEdge(graph, from, to, ratio, type) { if (!graph.has(from)) graph.set(from, []); graph.get(from).push({ to, ratio, type }); }
function solveGraphRatio(graph, input, output) {
  if (input === output) return 1;
  const queue = [{ id: input, ratio: 1 }], seen = new Set([input]);
  while (queue.length) {
    const current = queue.shift();
    for (const edge of graph.get(current.id) || []) {
      if (seen.has(edge.to)) continue;
      const ratio = current.ratio * edge.ratio;
      if (edge.to === output) return ratio;
      seen.add(edge.to); queue.push({ id: edge.to, ratio });
    }
  }
  return null;
}
function solvePlanetaryRatio(sets, fixed, input, output) {
  for (const set of sets) {
    const members = { sun: String(set.sun), ring: String(set.ring), carrier: String(set.carrier) };
    const inputKey = Object.keys(members).find(key => members[key] === input);
    const outputKey = Object.keys(members).find(key => members[key] === output);
    const fixedKey = Object.keys(members).find(key => fixed.has(members[key]));
    if (!inputKey || !outputKey || !fixedKey || new Set([inputKey, outputKey, fixedKey]).size !== 3) continue;
    const coefficient = { sun: -set.ns, ring: -set.nr, carrier: set.nr + set.ns };
    const known = { [fixedKey]: 0, [inputKey]: 1 };
    return -(coefficient[fixedKey] * known[fixedKey] + coefficient[inputKey] * known[inputKey]) / coefficient[outputKey];
  }
  return null;
}
function issue(code, message, fix, severity = 'error') { return { severity, code, message, fix }; }
function ok(message) { return { ok: true, message }; }
function pass(label, target, actual, direction = null) { return { ok: true, label, target, actual, direction }; }
function formatRatio(value) { return Number(value).toFixed(3).replace(/\.0+$/, ''); }
