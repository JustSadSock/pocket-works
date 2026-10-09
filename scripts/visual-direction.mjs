// Authoring contract for Pocket Works visual work. The questionnaire is intentionally
// not an art-style picker: every answer must describe THIS product, not a preset skin.
export const VISUAL_SCHEMA_VERSION = 1;

const draft = hint => `TODO — ${hint}`;

export function draftVisualDirection(slug, name) {
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    status: 'draft',
    product: slug,
    direction: {
      premise: draft(`What should ${name} feel like, beyond its genre?`),
      composition: draft('Describe the dominant spatial layout and focal point on a phone'),
      shapeLanguage: draft('Name distinctive silhouettes, edges, proportions and negative space'),
      surfaceAndMaterial: draft('Describe material response, texture or illustration method'),
      paletteLogic: draft('Describe value hierarchy and why the chosen colors belong to this world'),
      typography: draft('Describe type character and hierarchy, including in-game functional text'),
      signature: draft('One unique visual or interactive behavior recognizable without a logo'),
      distinction: draft('Which nearby Pocket Works apps look similar and how will this differ?')
    },
    production: {
      renderer: draft('Why DOM/CSS, sprites, Canvas, WebGL, or authored 3D is appropriate'),
      focalAsset: draft('What is the hero object and how will its visual asset be authored?')
    },
    motion: {
      character: draft('Heavy, elastic, precise, organic, mechanical, etc; give reasons'),
      action: draft('Identify the user action whose motion must feel distinctive'),
      anticipation: draft('What moves BEFORE the action and why?'),
      response: draft('What visually reacts on the first frame of input?'),
      followThrough: draft('What settles, lags, rebounds, or remains changed afterward?'),
      interruption: draft('How rapid repeat input redirects motion without queued delay'),
      reducedMotion: draft('What remains legible when motion is reduced')
    },
    evidence: {
      entry: './',
      interaction: { type: 'click', selector: '#primary-action' },
      expectedChange: draft('What should an observer see after performing this real action?'),
      capture: ['initial', 'action', 'settled']
    }
  };
}

const placeholder = str => /^(?:todo\b|tbd\b|placeholder\b|replace\b|write\b|lorem\b|not applicable\b|n\/a\b)/i.test(String(str).trim());
const categories = {
  direction: ['premise','composition','shapeLanguage','surfaceAndMaterial','paletteLogic','typography','signature','distinction'],
  production: ['renderer','focalAsset'],
  motion: ['character','action','anticipation','response','followThrough','interruption','reducedMotion']
};
const suspicious = /(?:clean modern(?: premium)?|beautiful and unique|high quality visuals|nice animations|good user experience|cool visual|make it pop)/i;

export function validateVisualDirection(record, slug) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['visual-direction.json must contain an object'];
  if (record.schemaVersion !== VISUAL_SCHEMA_VERSION) errors.push('Unsupported visual direction schema version');
  if (record.status !== 'ready') errors.push('Set status to ready after visual work and screenshot review');
  if (record.product !== slug) errors.push(`Expected visual product slug ${slug}`);
  const allAnswers = [];
  for (const [category, keys] of Object.entries(categories)) {
    for (const key of keys) {
      const value = record[category]?.[key];
      if (typeof value !== 'string' || value.trim().length < 24 || placeholder(value)) {
        errors.push(`${category}.${key} requires a specific, non-placeholder description (24+ characters)`);
      } else {
        allAnswers.push(value.trim().toLowerCase());
        if (suspicious.test(value)) errors.push(`${category}.${key} is too generic: name the concrete design decision`);
      }
    }
  }
  if (new Set(allAnswers).size !== allAnswers.length) errors.push('Copy-pasted answers across visual decisions are not evidence of a direction');
  const evidence = record.evidence;
  if (!evidence || evidence.entry !== './') errors.push('evidence.entry must point to the app root (./)');
  if (typeof evidence?.expectedChange !== 'string' || evidence.expectedChange.trim().length < 24 ||
      placeholder(evidence.expectedChange)) errors.push('evidence.expectedChange must describe a visible consequence');
  if (JSON.stringify(evidence?.capture) !== JSON.stringify(['initial','action','settled']))
    errors.push('evidence.capture must capture initial, action and settled states');
  const action = evidence?.interaction;
  if (!action || !['click','tap','drag'].includes(action.type)) {
    errors.push('evidence.interaction must be a click, tap or drag');
  } else if (action.type === 'click') {
    if (typeof action.selector !== 'string' || !action.selector.trim()) errors.push('Click needs a real CSS selector');
  } else {
    if (!Array.isArray(action.from) || action.from.length !== 2 ||
        !action.from.every(n => Number.isFinite(n) && n >= 0 && n <= 1))
      errors.push('Tap/drag needs relative from coordinates [0..1, 0..1]');
    if (action.type === 'drag' &&
        (!Array.isArray(action.to) || action.to.length !== 2 ||
         !action.to.every(n => Number.isFinite(n) && n >= 0 && n <= 1)))
      errors.push('Drag needs relative to coordinates [0..1, 0..1]');
  }
  return errors;
}
