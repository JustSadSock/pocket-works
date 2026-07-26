import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./analysis-v20.js', import.meta.url), 'utf8');

function createElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    hidden: false,
    children: [],
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    append(...nodes) { this.children.push(...nodes); },
    prepend(...nodes) { this.children.unshift(...nodes); },
    after() {},
    remove() {},
    replaceWith() {},
    setAttribute() {},
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    cloneNode() { return createElement(tag); }
  };
}

function execute(sample) {
  const context = vm.createContext({
    console,
    Math,
    Map,
    Number,
    Object,
    Array,
    String,
    RegExp,
    JSON,
    navigator: {},
    document: {
      createElement,
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    requestAnimationFrame(callback) { callback(); },
    toast() {}
  });
  const boot = `
    var el = null;
    var combined = null;
    var finalized = false;
    var renderResult;
    var combineProtocolAssessments;
  `;
  const assertionBridge = `
    globalThis.__facetTestResult = __facetV20CalibrateResult(${JSON.stringify(sample)});
  `;
  vm.runInContext(`${boot}\n${source}\n${assertionBridge}`, context, { filename: 'analysis-v20.js' });
  return context.__facetTestResult;
}

const strongSample = {
  rating: 4.2,
  halfWidth: 0.7,
  reliability: 82,
  consistency: 76,
  coordinationScore: 71,
  advanced: {
    confidence: 84,
    landmarkStability: 78,
    configurationScore: 74,
    descriptors: [
      { key: 'faceShape', label: 'Контур', classification: 'Удлинённый', confidence: 88, stability: 83, salience: 78, evidence: 'Вертикаль выражена.' },
      { key: 'eyeTilt', label: 'Наклон глаз', classification: 'Восходящий', confidence: 77, stability: 72, salience: 70, evidence: 'Внешние уголки выше.' },
      { key: 'jaw', label: 'Челюсть', classification: 'Пограничная', confidence: 58, stability: 52, salience: 55, evidence: 'Смешанный контур.' }
    ],
    relations: [{ score: 76 }, { score: 69 }]
  }
};

test('builds a stable appearance profile and calibrates the experimental score', () => {
  const result = execute(strongSample);
  assert.ok(result.appearanceV2);
  assert.equal(result.appearanceV2.robust.length, 2);
  assert.equal(result.appearanceV2.ambiguous.length, 1);
  assert.ok(result.rating < strongSample.rating);
  assert.ok(result.rating > 3);
  assert.ok(result.interval[0] < result.rating && result.interval[1] > result.rating);
  assert.ok(result.appearanceV2.suggestions.some((item) => item.title === 'Баланс контура'));
  assert.ok(result.appearanceV2.suggestions.some((item) => item.title === 'Линия глаз'));
});

test('widens uncertainty and suppresses overconfident output for weak evidence', () => {
  const weak = structuredClone(strongSample);
  weak.rating = 4.5;
  weak.halfWidth = 0.5;
  weak.reliability = 48;
  weak.consistency = 42;
  weak.advanced.confidence = 49;
  weak.advanced.landmarkStability = 44;
  weak.advanced.descriptors = weak.advanced.descriptors.map((item) => ({
    ...item,
    confidence: 50,
    stability: 43,
    classification: `Пограничная ${item.classification}`
  }));
  const result = execute(weak);
  assert.equal(result.appearanceV2.robust.length, 0);
  assert.equal(result.appearanceV2.ambiguous.length, 3);
  assert.ok(result.rating < 4);
  assert.ok(result.halfWidth > weak.halfWidth);
  assert.ok(result.appearanceV2.support < 60);
});
