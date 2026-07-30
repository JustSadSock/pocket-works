import { tolerantJsonParse, normalizeDocument } from './engine.js';
import { compileOpenScad, looksLikeScad } from './scad.js';
import { validateMechanismContract, createContractRepairPacket } from './contract-strict.js';

export const CAD_FORMAT = 'forma-cad-project-1';

export function looksLikeCadProjectText(source, fileName = '') {
  const text = String(source || '').trim();
  return /"format"\s*:\s*"forma-cad-project-1"/i.test(text)
    || /FORMA_PROJECT\s*\{/i.test(text)
    || /\.scad$/i.test(fileName)
    || looksLikeScad(text);
}

export function parseCadProject(source, { fileName = '' } = {}) {
  const text = String(source ?? '').trim();
  if (!text) throw new Error('CAD-код пуст.');
  let project;
  if (looksLikeScad(text) || /\.scad$/i.test(fileName)) {
    const metadata = extractScadMetadata(text);
    project = {
      format: CAD_FORMAT,
      name: metadata.name || stripExtension(fileName) || 'OpenSCAD model',
      engine: 'openscad-compatible',
      source: text,
      parts: metadata.parts || [{ id: 'model', name: 'Model', color: '#d9dfd3', entry: metadata.entry || '__top__' }],
      contract: metadata.contract || { mode: 'static' },
      settings: metadata.settings || {}
    };
  } else {
    project = tolerantJsonParse(text);
  }
  return normalizeCadProject(project);
}

export function normalizeCadProject(input) {
  if (!input || typeof input !== 'object') throw new Error('Корень CAD-проекта должен быть объектом.');
  if (String(input.format || '').toLowerCase() !== CAD_FORMAT) throw new Error(`Ожидается "format": "${CAD_FORMAT}".`);
  const engine = String(input.engine || 'openscad-compatible').toLowerCase();
  if (!['openscad', 'openscad-compatible'].includes(engine)) throw new Error('FORMA 2.0 принимает engine: "openscad" или "openscad-compatible".');
  if (typeof input.source !== 'string' || !input.source.trim()) throw new Error('Поле source должно содержать OpenSCAD-код.');
  const parts = Array.isArray(input.parts) && input.parts.length ? input.parts : [{ id: 'model', name: 'Model', entry: '__top__', color: '#d9dfd3' }];
  const ids = new Set();
  const normalizedParts = parts.map((part, index) => {
    const id = cleanId(part?.id || `part-${index + 1}`);
    if (ids.has(id)) throw new Error(`Повторяющийся id детали: ${id}.`);
    ids.add(id);
    return {
      ...part,
      id,
      name: String(part?.name || id).slice(0, 80),
      entry: String(part?.entry || part?.module || (parts.length === 1 ? '__top__' : id)),
      color: normalizeColor(part?.color),
      mechanics: part?.mechanics && typeof part.mechanics === 'object' ? structuredCloneSafe(part.mechanics) : null,
      visible: part?.visible !== false
    };
  });
  const mode = String(input.contract?.mode || 'static');
  if (!['static', 'mechanical'].includes(mode)) throw new Error('contract.mode должен быть "static" или "mechanical".');
  return {
    format: CAD_FORMAT,
    name: String(input.name || 'Без названия').slice(0, 120),
    units: 'mm',
    engine,
    source: input.source,
    parts: normalizedParts,
    contract: {
      mode,
      joints: Array.isArray(input.contract?.joints) ? structuredCloneSafe(input.contract.joints) : [],
      objectives: Array.isArray(input.contract?.objectives) ? structuredCloneSafe(input.contract.objectives) : []
    },
    settings: {
      detail: clamp(Math.round(Number(input.settings?.detail ?? 52)), 20, 96),
      margin: clamp(Number(input.settings?.margin ?? 2), 0.5, 20)
    },
    notes: String(input.notes || '').slice(0, 2000)
  };
}

export function compileCadProject(input, options = {}) {
  const project = typeof input === 'string' ? parseCadProject(input, options) : normalizeCadProject(input);
  const compiled = compileOpenScad(project.source, project.parts);
  const document = normalizeDocument({
    format: 'formacode-1',
    name: project.name,
    units: 'mm',
    notes: `Generated from ${CAD_FORMAT}. ${project.notes || ''}`.trim(),
    settings: project.settings,
    parts: compiled.parts
  });
  const report = validateMechanismContract(project, { parts: document.parts });
  return { project, document, report, evidence: compiled.evidence };
}

export function serializeCadProject(project) {
  return JSON.stringify(normalizeCadProject(project), null, 2);
}

export function makeRepairPacket(source, report, error) {
  return createContractRepairPacket(source, report, error);
}

function extractScadMetadata(source) {
  const match = String(source).match(/\/\*\s*FORMA_PROJECT\s*([\s\S]*?)\*\//i);
  if (!match) return {};
  try { return JSON.parse(match[1].trim()); }
  catch (error) { throw new Error(`Ошибка JSON в блоке FORMA_PROJECT: ${error.message}`); }
}
function stripExtension(fileName) { return String(fileName || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, ''); }
function cleanId(value) { return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'part'; }
function normalizeColor(value) { const color = String(value || '#d9dfd3'); return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#d9dfd3'; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function structuredCloneSafe(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }

export const CAD_EXAMPLE = {
  format: CAD_FORMAT,
  name: 'Planetary Accelerator 5x',
  engine: 'openscad-compatible',
  settings: { detail: 56, margin: 2 },
  source: `// Certified 5x planetary accelerator: ring fixed, carrier input, sun output.\nmodule sun(){ translate([0,0,5.5]) forma_spur_gear(teeth=12, module=1, thickness=5, bore=3.2); }\nmodule ring(){ translate([0,0,5.5]) forma_ring_gear(teeth=48, module=1, thickness=5, wall=3); }\nmodule planet(){ translate([15,0,5.5]) forma_spur_gear(teeth=18, module=1, thickness=5, bore=3.4); }\nmodule carrier(){ forma_planet_carrier(orbit=15, count=1, plate_thickness=3, pin_diameter=3, pin_height=5, bore=3.2, plate_radius=20); }`,
  parts: [
    { id: 'sun', name: 'Output sun', color: '#e07043', entry: 'sun', mechanics: { kind: 'gear', teeth: 12, module: 1, dof: 'revolute' } },
    { id: 'ring', name: 'Fixed ring', color: '#263936', entry: 'ring', mechanics: { kind: 'ringGear', teeth: 48, module: 1, dof: 'fixed' } },
    { id: 'planet', name: 'Planet gear', color: '#d2b36a', entry: 'planet', mechanics: { kind: 'gear', teeth: 18, module: 1, dof: 'revolute' } },
    { id: 'carrier', name: 'Input carrier', color: '#7d9a91', entry: 'carrier', mechanics: { kind: 'carrier', dof: 'revolute' } }
  ],
  contract: {
    mode: 'mechanical',
    joints: [
      { type: 'fixed', part: 'ring' },
      { type: 'revolute', part: 'sun', axis: 'z' },
      { type: 'revolute', part: 'carrier', axis: 'z' },
      { type: 'planetary', sun: 'sun', ring: 'ring', carrier: 'carrier', planets: ['planet'], teeth: { sun: 12, planet: 18, ring: 48 }, module: 1 }
    ],
    objectives: [
      { type: 'fixedPart', part: 'ring' },
      { type: 'speedRatio', input: 'carrier', output: 'sun', ratio: 5, direction: 'increase', tolerance: 0.01 },
      { type: 'noExternalHardware' },
      { type: 'partCount', value: 4 }
    ]
  }
};

export const AI_CAD_PROMPT = `Create one CAD file for FORMA 2.0. Return ONLY raw .scad file contents, without Markdown fences or explanations.

The file MUST begin with this metadata comment:
/* FORMA_PROJECT
{
  "name": "...",
  "settings": { "detail": 56, "margin": 2 },
  "parts": [
    { "id": "...", "name": "...", "color": "#RRGGBB", "entry": "module_name", "mechanics": {} }
  ],
  "contract": { "mode": "static|mechanical", "joints": [], "objectives": [] }
}
*/

After the comment, write actual OpenSCAD code. Every physical or separately coloured printable part must have its own module and matching parts[].entry.

Supported OpenSCAD profile:
- module declarations, module parameters/defaults, variables inside modules, arithmetic, arrays/ranges, for, if;
- cube, sphere, cylinder, polygon;
- translate, rotate, scale, mirror, color;
- union, difference, intersection;
- linear_extrude and rotate_extrude;
- certified modules forma_spur_gear(teeth,module,thickness,bore,backlash=0.18), forma_ring_gear(teeth,module,thickness,wall,backlash=0.18), forma_planet_carrier(orbit,count,plate_thickness,pin_diameter,pin_height,bore,plate_radius).
Do NOT use hull, minkowski, text, import, surface, projection, polyhedron, children, external libraries, undefined modules or top-level global variables.

Mechanical contract rules:
- Mechanical projects MUST declare input/driver, output, fixed members, joints and numeric objectives.
- Supported certified joints: fixed, revolute, gearMesh and planetary. coaxial is accepted only when every referenced part exposes a measurable certified axis. contains is not yet certifiable and will block export.
- Supported objectives: fixedPart, speedRatio, partCount, noExternalHardware.
- speedRatio is abs(output angular speed / input angular speed). direction="increase" means output is faster; direction="reduction" means output is slower.
- gearMesh is accepted only when both parts use certified gear modules, teeth/module match metadata, axes are parallel, and measured centre distance equals module*(teethA+teethB)/2 plus declared clearance.
- planetary requires ringTeeth = sunTeeth + 2*planetTeeth, coaxial sun/ring, planets on the calculated orbit, and a matching certified carrier.
- A true differential is NOT certified in FORMA 2.0. Never replace it with coaxial disks, a box, a fake custom core, or decorative gears. If the requested model fundamentally requires a differential, include a differential joint honestly; FORMA will block export instead of producing a lie.
- Never use placeholders, TODO, custom black boxes, pretend mechanisms or claims that cannot be calculated from the contract.
- Use millimetres and Z-up. FDM defaults: 0.2–0.35 mm clearance per side, walls at least 1.2 mm, no external hardware unless requested.

Before returning the file, calculate every tooth relation, centre distance and ratio direction yourself.`;

export const CAD_GUIDE_MARKDOWN = `# FORMA 2.0 — AI CAD contract\n\nFORMA accepts real OpenSCAD-style source plus a separate functional contract. Geometry and claims are no longer the same thing.\n\n## Core rule\n\nThe AI writes standard CAD code. FORMA compiles the supported profile and independently checks declared mechanical goals. Unsupported syntax or unproved mechanics blocks export.\n\n## Project format\n\nPrefer one .scad file beginning with a FORMA_PROJECT metadata comment. Static objects use contract.mode: static. Moving mechanisms use mechanical with joints and objectives.\n\n## Certified mechanisms\n\nFORMA 2.0 certifies external spur-gear trains and simple planetary sets. It does not certify bevel differentials or housing containment yet. Those claims are rejected instead of being replaced by decorative geometry.\n\n## Repair loop\n\nWhen compilation or validation fails, copy the repair packet. It includes exact error codes, required fixes and the original project. Send it back to the AI unchanged and request one corrected raw .scad file.\n`;
