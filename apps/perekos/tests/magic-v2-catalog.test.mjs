import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../design/magic-v2-catalog.json', import.meta.url);
const design = JSON.parse(readFileSync(file, 'utf8'));
const runes = design.runes;
const indexed = new Map(runes.map(rune => [rune.id, rune]));
const permitted = new Set(['common', 'uncommon', 'rare', 'epic', 'transformation']);
const schools = new Set(['common', 'stone', 'fire', 'storm']);
const aspects = new Set(['shape', 'origin', 'motion', 'impact']);

test('magic v2 design is explicitly unreleased and has an exact rune inventory', () => {
  assert.equal(design.status, 'design-only');
  assert.equal(design.baseGameVersion, '0.27.0');
  assert.equal(runes.length, 92);
  assert.equal(indexed.size, runes.length);
  assert.equal(runes.filter(r => r.school === 'common').length, 20);
  for (const school of ['stone', 'fire', 'storm']) {
    const scoped = runes.filter(r => r.school === school);
    assert.equal(scoped.length, 24);
    assert.equal(scoped.filter(r => r.kind === 'when').length, 3);
    assert.equal(scoped.filter(r => r.kind === 'do').length, 7);
    assert.equal(scoped.filter(r => r.kind === 'how' && r.rarity !== 'transformation').length, 8);
    assert.equal(scoped.filter(r => r.rarity === 'transformation').length, 6);
  }
});

test('every catalog card has an unambiguous identity, kind, rarity, school, and transformation aspect', () => {
  for (const rune of runes) {
    assert.match(rune.id, /^[a-z][a-z0-9_]+$/);
    assert.ok(schools.has(rune.school), rune.id);
    assert.ok(['when', 'do', 'how'].includes(rune.kind), rune.id);
    assert.ok(permitted.has(rune.rarity), rune.id);
    assert.ok(rune.name && rune.effect, rune.id);
    if (rune.rarity === 'transformation') {
      assert.equal(rune.kind, 'how', rune.id);
      assert.ok(aspects.has(rune.aspect), rune.id);
      assert.notEqual(rune.school, 'common', rune.id);
    } else {
      assert.equal(rune.aspect, undefined, rune.id);
    }
  }
});

test('rarity values and single-school magic remain part of design contract', () => {
  assert.equal(indexed.get('u_on_cast').rarity, 'epic');
  assert.equal(indexed.get('u_on_hit').rarity, 'common');
  assert.equal(design.rules.noCrossElement, true);
  assert.deepEqual(design.rules.spellLimits, { when: 1, do: 2, how: 2 });
  assert.equal(design.rules.editableSlots, 3);
  assert.equal(design.rules.aspects.length, 4);
});

test('all example metamorphoses use same-school cards and cannot be explicitly forbidden', () => {
  const forbidden = new Set(design.transforms.explicitlyForbidden.map(pair => [...pair].sort().join(':')));
  assert.equal(design.transforms.recipes.length, 18);
  for (const recipe of design.transforms.recipes) {
    assert.equal(recipe.requires.length, 2);
    assert.ok(recipe.name && recipe.effect);
    const [a, b] = recipe.requires.map(id => {
      assert.ok(indexed.has(id), id);
      return indexed.get(id);
    });
    assert.equal(a.school, recipe.school);
    assert.equal(b.school, recipe.school);
    assert.equal(a.rarity, 'transformation');
    assert.equal(b.rarity, 'transformation');
    assert.ok(a.aspect !== b.aspect, recipe.name);
    assert.ok(!forbidden.has(recipe.requires.slice().sort().join(':')), recipe.name);
  }
});

test('forbidden pairs exist, stay within a school, and are not self-pairs', () => {
  for (const [first, second] of design.transforms.explicitlyForbidden) {
    assert.ok(indexed.has(first), first);
    assert.ok(indexed.has(second), second);
    assert.notEqual(first, second);
    assert.equal(indexed.get(first).school, indexed.get(second).school);
    assert.equal(indexed.get(first).rarity, 'transformation');
    assert.equal(indexed.get(second).rarity, 'transformation');
  }
});
