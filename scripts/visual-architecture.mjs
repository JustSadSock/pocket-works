// Product-specific interaction architecture. These labels describe observed layout,
 // not styles to be applied. No shared visual tokens or components are generated.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const ARCHITECTURE_AXES = Object.freeze({
  spatialLayout: ['header-stage-footer', 'full-bleed-world', 'single-instrument', 'open-workbench', 'document-spread', 'split-workspace', 'map-table', 'freeform', 'other'],
  controlLocation: ['bottom-deck', 'direct-on-object', 'perimeter', 'in-world-props', 'contextual', 'side-rail', 'gesture-only', 'other'],
  navigation: ['overlay-list', 'page-turn', 'world-travel', 'scene-zoom', 'spatial-props', 'editor-toolbox', 'none', 'other'],
  chromeTopology: ['framed-stage', 'layered-panels', 'diegetic-tools', 'unframed-scene', 'single-surface', 'tiled-grid', 'other'],
  dominantMotion: ['rotational-inertia', 'folding', 'spring-settle', 'sliding', 'elastic', 'immediate', 'none', 'other']
});

const REQUIRED_PROSE = ['primaryVerb', 'physicalFeedback', 'spatialRationale'];
const isSpecific = value => typeof value === 'string' && value.trim().length >= 38 &&
  !/^(todo|tbd|placeholder|n\/a|none|same as)/i.test(value.trim());

// Verified against each app's shipped markup, not aspirational concept art.
// Old v1 directions have no architectural profile; only curated legacy entries
// can be compared until an app receives a v2 direction.
export const LEGACY_PROFILES = Object.freeze({
  'mechanica': {
    spatialLayout: 'header-stage-footer', controlLocation: 'bottom-deck',
    navigation: 'overlay-list', chromeTopology: 'framed-stage',
    dominantMotion: 'rotational-inertia'
  },
  'cantica-glass': {
    spatialLayout: 'header-stage-footer', controlLocation: 'bottom-deck',
    navigation: 'page-turn', chromeTopology: 'framed-stage',
    dominantMotion: 'folding'
  }
});

export function draftArchitecture() {
  return {
    spatialLayout: 'TODO — choose the actual phone layout',
    controlLocation: 'TODO — place controls by the core verbs',
    navigation: 'TODO — define how navigation works in the product',
    chromeTopology: 'TODO — decide which permanent frames or surfaces exist',
    dominantMotion: 'TODO — choose a physical timing model',
    primaryVerb: 'TODO — name a real action that a player performs with the object',
    physicalFeedback: 'TODO — describe response, inertia, friction, sound and cancellation',
    spatialRationale: 'TODO — explain why this composition is optimal on a phone',
    comparisons: []
  };
}

export function validateArchitecture(architecture) {
  const errors = [];
  if (!architecture || typeof architecture !== 'object' || Array.isArray(architecture)) {
    return ['architecture must describe the actual layout and interaction, not a style'];
  }
  for (const [axis, options] of Object.entries(ARCHITECTURE_AXES)) {
    if (!options.includes(architecture[axis])) {
      errors.push('architecture.' + axis + ' must be one of: ' + options.join(', '));
    }
  }
  for (const field of REQUIRED_PROSE) {
    if (!isSpecific(architecture[field])) errors.push('architecture.' + field + ' needs a concrete description (38+ characters)');
  }
  if (Object.keys(ARCHITECTURE_AXES).some(axis => architecture[axis] === 'other') &&
      !isSpecific(architecture.spatialRationale)) {
    errors.push('Custom architecture values require a concrete spatialRationale');
  }
  if (!Array.isArray(architecture.comparisons)) errors.push('architecture.comparisons must be an array');
  return errors;
}

// These three axes form the visible silhouette in a thumbnail with its title
// removed. Different colors, content and animation cannot rescue a reused one.
export function compareArchitecture(candidate, reference) {
  const matching = Object.keys(ARCHITECTURE_AXES).filter(axis =>
    candidate?.[axis] === reference?.[axis] && ARCHITECTURE_AXES[axis].includes(candidate?.[axis]));
  const shellClone = ['spatialLayout', 'controlLocation', 'chromeTopology'].every(axis => matching.includes(axis));
  return { matching, shellClone, tooSimilar: shellClone || matching.length >= 4 };
}

async function readJson(filename) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch { return null; }
}

export async function getRecentArchitectureProfiles(root, exclude = '', limit = 5) {
  const appsPath = path.join(root, 'apps');
  const entries = await readdir(appsPath, { withFileTypes: true });
  const profiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === exclude) continue;
    const folder = path.join(appsPath, entry.name);
    const config = await readJson(path.join(folder, 'app.config.json'));
    if (!config || config.status === 'archived') continue;
    const direction = await readJson(path.join(folder, 'visual-direction.json'));
    const profile = direction?.schemaVersion === 2 && direction.status === 'ready'
      ? direction.architecture : LEGACY_PROFILES[entry.name];
    if (!profile || !Object.keys(ARCHITECTURE_AXES).every(key => ARCHITECTURE_AXES[key].includes(profile[key]))) continue;
    profiles.push({
      slug: entry.name,
      timestamp: Date.parse(config.releaseDateTime || config.releaseDate || '') || 0,
      architecture: profile
    });
  }
  return profiles.sort((a,b) => b.timestamp - a.timestamp || a.slug.localeCompare(b.slug)).slice(0, limit);
}

export function validateArchitecturalDiversity(architecture, references, slug) {
  const errors = [];
  if (!architecture || !Array.isArray(architecture.comparisons)) return errors;
  const reviewed = new Map();
  for (const comparison of architecture.comparisons) {
    if (!comparison || typeof comparison !== 'object') {
      errors.push('architecture.comparisons entries must be objects'); continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(comparison.slug || '') || comparison.slug === slug ||
        reviewed.has(comparison.slug)) {
      errors.push('architecture.comparisons requires distinct valid neighboring app slugs'); continue;
    }
    reviewed.set(comparison.slug, comparison);
    if (!isSpecific(comparison.spatialDifference) || !isSpecific(comparison.interactionDifference))
      errors.push('architecture.comparisons for ' + comparison.slug + ' must describe BOTH a visible spatial and an interaction difference (38+ characters each)');
  }
  // Review the most recently released two *known profiles* rather than choose
  // conveniently different old products. Other reference profiles are checked too.
  for (const reference of references.slice(0, 2)) {
    if (!reviewed.has(reference.slug)) errors.push('architecture.comparisons must explicitly review recent app ' + reference.slug);
  }
  for (const reference of references) {
    const { matching, tooSimilar } = compareArchitecture(architecture, reference.architecture);
    if (tooSimilar) errors.push(
      'Architecture repeats ' + reference.slug + ' (' + matching.join(', ') +
      '). Change the actual composition/control topology, not just colors or the description.'
    );
  }
  return errors;
}
