// Production decisions, not a style preset. v2 visual-direction remains compatible.
const axes = ['medium', 'composition', 'interaction', 'motion'];
const todo = hint => `TODO — ${hint}`;
export function draftArtBible(product) {
  return { schemaVersion: 1, product, status: 'draft',
    memoryReview: [],
    references: [],
    concepts: [1,2,3].map(n => ({ id: `concept-${n}`, ...Object.fromEntries(axes.map(k => [k,todo(`Distinct ${k} decision`)])), rationale: todo('Tradeoffs for this game and phone') })),
    selection: { concept: '', reason: todo('Why this direction serves the gameplay'), rejected: [] },
    tools: [], assets: [],
    constraints: { viewport: [390,844], textureBytes: 0, triangles: 0, targetFps: 60 },
    verification: { states: ['initial','action','settled'], risks: [], comparisons: [] }
  };
}
export function validateArtBible(b, product) {
  const errors = [];
  const arrayFields = ['concepts','references','memoryReview','tools','assets'];
  if (b && arrayFields.some(k => !Array.isArray(b[k]) || b[k].some(v => !v || typeof v !== 'object' || Array.isArray(v)))) return ['Art Bible collections must contain objects'];
  const specific = (v, name) => { if(typeof v !== 'string' || v.trim().length < 24 || /^(TODO|TBD|placeholder)/i.test(v.trim())) errors.push(`${name}: concrete description required`); };
  if(!b || typeof b !== 'object' || Array.isArray(b)) return ['Art Bible must be an object'];
  if(b.schemaVersion !== 1 || b.product !== product || b.status !== 'ready') errors.push('Art Bible requires version 1, matching product and ready status');
  const concepts = Array.isArray(b.concepts) ? b.concepts : [];
  if(concepts.length !== 3 || new Set(concepts.map(c=>c?.id)).size !== 3) errors.push('Exactly three independently identified concepts required');
  for(const c of concepts) for(const k of [...axes,'rationale']) specific(c?.[k],`${c?.id}.${k}`);
  for(let i=0;i<concepts.length;i++) for(let j=i+1;j<concepts.length;j++) {
    const different = axes.filter(k=>String(concepts[i]?.[k]).trim().toLowerCase() !== String(concepts[j]?.[k]).trim().toLowerCase());
    if(different.length < 3) errors.push(`Concepts ${i+1}/${j+1} must differ on at least three production/interaction axes`);
  }
  if(!concepts.some(c=>c?.id === b.selection?.concept)) errors.push('Choose one actual concept');
  specific(b.selection?.reason,'selection.reason');
  const rejected = b.selection?.rejected;
  if(!Array.isArray(rejected) || rejected.length !== 2 || new Set(rejected.map(r=>r?.concept)).size !== 2 || rejected.some(r=>r?.concept === b.selection?.concept || !concepts.some(c=>c?.id===r?.concept))) errors.push('Explain rejection of both other concepts');
  else rejected.forEach(r=>specific(r.reason,'rejected.reason'));
  if(!Array.isArray(b.references) || b.references.length < 3) errors.push('Research at least three real references');
  else {
    if(new Set(b.references.map(r=>r.url)).size < 3) errors.push('Research three distinct reference sources');
    for(const r of b.references) {
    try { const u=new URL(r.url); if(!['https:','http:'].includes(u.protocol)) throw Error(); } catch { errors.push('Reference needs a public source URL'); }
    for(const k of ['observation','principle','application','avoid']) specific(r[k],`reference.${k}`);
    if(!r.inspectedAt || !Number.isFinite(Date.parse(r.inspectedAt))) errors.push('Reference inspection date required');
  }
  }
  if(!Array.isArray(b.memoryReview) || b.memoryReview.length < 2) errors.push('Review at least two existing products using visual memory');
  else b.memoryReview.forEach(m=> { if(!m.slug || !m.evidence) errors.push('Memory review requires product and evidence path or explicit missing-evidence note'); specific(m.lesson,'memory.lesson'); });
  const tools=Array.isArray(b.tools)?b.tools:[];
  if(!tools.length || new Set(tools.map(t=>t?.id)).size!==tools.length) errors.push('Identify unique production tools');
  tools.forEach(t=> { if(!t.id || !['available','unavailable','unverified'].includes(t.availability)) errors.push('Tool needs id and observed availability'); specific(t.reason,'tool.reason'); if(t.availability!=='available') specific(t.fallback,'tool.fallback'); });
  const assets=Array.isArray(b.assets)?b.assets:[];
  if(!assets.length || new Set(assets.map(a=>a?.id)).size!==assets.length) errors.push('Plan uniquely identified focal assets');
  const local = p => typeof p==='string' && p.length>0 && !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..');
  for(const a of assets) {
    if(!a.id || !tools.some(t=>t.id===a.tool)) errors.push('Asset must use a planned tool');
    if(!local(a.source) || !local(a.output) || a.source===a.output) errors.push('Asset needs distinct app-local source and export paths');
    for(const k of ['role','acceptance','integration','provenance']) specific(a[k],`asset.${k}`);
    if(!Number.isFinite(a.maxBytes) || a.maxBytes<=0) errors.push('Asset requires positive byte budget');
  }
  for(const k of ['textureBytes','triangles','targetFps']) if(!Number.isFinite(b.constraints?.[k]) || b.constraints[k]<0 || (k==='targetFps' && b.constraints[k]===0)) errors.push(`Invalid constraint ${k}`);
  if(!Array.isArray(b.constraints?.viewport) || b.constraints.viewport.length!==2 || !b.constraints.viewport.every(n=>Number.isFinite(n)&&n>0)) errors.push('Target viewport required');
  if(!['initial','action','settled'].every(s=>b.verification?.states?.includes(s))) errors.push('Plan initial/action/settled evidence');
  if(!Array.isArray(b.verification?.risks) || !b.verification.risks.length) errors.push('Identify observable visual risks');
  if(!Array.isArray(b.verification?.comparisons) || b.verification.comparisons.length<2) errors.push('Plan two image comparisons');
  return errors;
}
