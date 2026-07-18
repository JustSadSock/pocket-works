import test from 'node:test';
import assert from 'node:assert/strict';
import { HERALDIC_SCHOOLS, FIELD_PALETTES, schoolForDoctrine, paletteForDoctrine, shieldGeometry, compositionForDoctrine, liveryForDoctrine } from '../heraldry.js';

test('four visual schools are intentionally bounded', () => {
  assert.equal(Object.keys(HERALDIC_SCHOOLS).length, 4);
  assert.equal(Object.keys(FIELD_PALETTES).length, 4);
});

test('ordinary selects a distinct visual school', () => {
  assert.equal(schoolForDoctrine({ordinary:'pale'}), 'imperial');
  assert.equal(schoolForDoctrine({ordinary:'fess'}), 'civic');
  assert.equal(schoolForDoctrine({ordinary:'bend'}), 'knightly');
  assert.equal(schoolForDoctrine({ordinary:'chevron'}), 'northern');
});

test('every school uses a different shield silhouette', () => {
  const paths = ['pale','fess','bend','chevron'].map((ordinary) => shieldGeometry({ordinary}).path);
  assert.equal(new Set(paths).size, 4);
});

test('palette always has three distinct heraldic roles', () => {
  for (const field of Object.keys(FIELD_PALETTES)) {
    const palette = paletteForDoctrine({field, ordinary:'pale', main:'lion', secondary:'eagle'});
    assert.ok(palette.field && palette.metal && palette.accent && palette.main);
    assert.ok(new Set([palette.field,palette.metal,palette.accent]).size >= 3);
  }
});

test('composition changes rather than stamping one template', () => {
  const layouts = ['pale','fess','bend','chevron'].map((ordinary) => compositionForDoctrine({ordinary,main:'lion',secondary:'rose'}));
  assert.equal(new Set(layouts.map((item) => `${item.main.x}:${item.main.y}:${item.secondary.length}`)).size, 4);
});

test('army livery carries field metal accent and emblem separately', () => {
  const livery = liveryForDoctrine({field:'azure',ordinary:'bend',main:'boar',secondary:'sun'});
  assert.equal(livery.school, 'knightly');
  assert.ok(livery.primary !== livery.metal);
  assert.ok(livery.accent !== livery.primary);
  assert.ok(livery.emblem);
});
