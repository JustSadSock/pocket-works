import assert from 'node:assert/strict';
import { draftVisualDirection, validateVisualDirection } from './visual-direction.mjs';
import { compareArchitecture, validateArchitecturalDiversity, LEGACY_PROFILES } from './visual-architecture.mjs';
import { retainedScaffoldShare, visualChanges } from './validate-visual-direction.mjs';

const slug = 'new-visual-app';
const draft = draftVisualDirection(slug, 'New Visual App');
assert.equal(draft.status, 'draft');
assert.ok(validateVisualDirection(draft, slug).length >= 15, 'Forge draft must not pass the release gate');

const finished = structuredClone(draft);
finished.status = 'ready';
let i = 0;
for (const category of ['direction', 'production', 'motion']) {
  for (const key of Object.keys(finished[category])) {
    i++;
    finished[category][key] = `Specific authored ${key} choice ${i}: the ${slug} scene will use ${i} deliberate layers and gestures.`;
  }
}
finished.architecture = {
  spatialLayout: 'full-bleed-world', controlLocation: 'direct-on-object',
  navigation: 'world-travel', chromeTopology: 'unframed-scene',
  dominantMotion: 'spring-settle',
  primaryVerb: 'Drag the primary object through the world to engage its mechanical lock.',
  physicalFeedback: 'A heavy resisted pickup transfers momentum into a brief spring settlement.',
  spatialRationale: 'The scene occupies the full viewport; secondary controls emerge close to the touched object.',
  comparisons: [
    { slug: 'mechanica', spatialDifference: 'The world is full bleed, with no dedicated header, footer or framed board.', interactionDifference: 'The object is dragged directly rather than installed through a bottom parts console.' },
    { slug: 'cantica-glass', spatialDifference: 'The spatial world replaces the centered window and the persistent bottom toolbar.', interactionDifference: 'World travel replaces book page navigation and tap-to-rotate actions.' }
  ]
};
finished.evidence.expectedChange = 'The player sees the physical structure settle into its new location after releasing the control.';
assert.deepEqual(validateVisualDirection(finished, slug), [], 'concrete authored decisions and actionable visual proof accepted');

const neighbors = [{ slug: 'mechanica', architecture: LEGACY_PROFILES.mechanica }, { slug: 'cantica-glass', architecture: LEGACY_PROFILES['cantica-glass'] }];
assert.deepEqual(validateArchitecturalDiversity(finished.architecture, neighbors, slug), [], 'different viewport and control arrangement passes');
assert.ok(compareArchitecture(LEGACY_PROFILES.mechanica, LEGACY_PROFILES['cantica-glass']).shellClone,
  'the two recent apps exhibit the same visible header-stage-bottom silhouette');
const copied = { ...finished.architecture, ...LEGACY_PROFILES.mechanica };
assert.ok(validateArchitecturalDiversity(copied, neighbors, slug).some(message => message.includes('repeats mechanica')),
  'repeated structural shell fails even with different text, physics or palette');
assert.ok(validateArchitecturalDiversity({ ...finished.architecture, comparisons: [] }, neighbors, slug).some(message => message.includes('review recent')),
  'comparison cannot omit recent neighbors');
finished.motion.action = finished.motion.character;
assert.ok(validateVisualDirection(finished, slug).some(message => message.includes('Copy-pasted')), 'copy/pasted fields are flagged');
finished.motion.action = 'Clean modern premium interface with smooth animations and glowing cards';
assert.ok(validateVisualDirection(finished, slug).some(message => message.includes('generic')), 'empty design clichés are flagged');

assert.equal(retainedScaffoldShare('a line over 12 chars\nanother long line', 'a line over 12 chars\nanother long line'), 1);
assert.ok(retainedScaffoldShare('custom special treatment', 'a line over 12 chars\nanother long line') < 0.76);
const changeSet = visualChanges([
  'apps/new-visual-app/styles.css', 'apps/new-visual-app/app.config.json',
  'apps/other-game/README.md', 'apps/_template/styles.css', 'shared/mobile-runtime.css'
]);
assert.equal(changeSet.get('new-visual-app').visual, true);
assert.equal(changeSet.get('other-game').visual, false);
assert.equal(changeSet.has('_template'), false);
console.log('Creative brief, generic-copy rejection, template detection and changed-app scope passed.');
