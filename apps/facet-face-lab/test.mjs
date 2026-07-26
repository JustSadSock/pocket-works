import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const sourceV20 = readFileSync(new URL('./analysis-v20.js', import.meta.url), 'utf8');
const sourceV21 = readFileSync(new URL('./analysis-v21-core.js', import.meta.url), 'utf8');
const sourceUiV21 = readFileSync(new URL('./ui-v21.js', import.meta.url), 'utf8');

function createElement(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    hidden: false,
    children: [],
    innerHTML: '',
    textContent: '',
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

function createContext() {
  return vm.createContext({
    console,
    Math,
    Map,
    Set,
    Number,
    Object,
    Array,
    String,
    RegExp,
    JSON,
    structuredClone,
    navigator: {},
    document: {
      createElement,
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getElementById() { return null; }
    },
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback) { callback(); },
    toast() {}
  });
}

function executeV20(sample) {
  const context = createContext();
  const boot = `
    var el = null;
    var combined = null;
    var finalized = false;
    var renderResult;
    var combineProtocolAssessments;
  `;
  const assertionBridge = `globalThis.__facetTestResult = __facetV20CalibrateResult(${JSON.stringify(sample)});`;
  vm.runInContext(`${boot}\n${sourceV20}\n${assertionBridge}`, context, { filename: 'analysis-v20.js' });
  return context.__facetTestResult;
}

function executeV21(frames) {
  const context = createContext();
  const boot = `
    var el = null;
    var combined = null;
    var finalized = false;
    var renderResult;
    var __facetV191Steps = [];
    function combineProtocolAssessments(values) {
      const quality = values.reduce((sum, item) => sum + Number(item.quality?.score || 70), 0) / values.length;
      return {
        rating: 4.2,
        halfWidth: .62,
        reliability: quality,
        consistency: 76,
        coordinationScore: 72,
        advanced: {
          confidence: quality,
          landmarkStability: 76,
          configurationScore: 74,
          descriptors: [
            { key: 'eyes', label: 'Глаза', zone: 'eyes', classification: 'Восходящие', confidence: 82, stability: 78, salience: 70 },
            { key: 'nose', label: 'Нос', zone: 'center', classification: 'Выраженный', confidence: 80, stability: 74, salience: 68 },
            { key: 'jaw', label: 'Челюсть', zone: 'lower', classification: 'Угловатая', confidence: 79, stability: 72, salience: 72 }
          ],
          relations: [{ score: 76 }, { score: 70 }]
        }
      };
    }
  `;
  vm.runInContext(
    `${boot}\n${sourceV20}\n${sourceV21}\n${sourceUiV21}\nglobalThis.__facetTestResult = combineProtocolAssessments(${JSON.stringify(frames)});`,
    context,
    { filename: 'analysis-v21.js' }
  );
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

const descriptorSeries = (delta = 0) => [
  { key: 'eyeTilt', label: 'Глаза', zone: 'eyes', value: 0.12 + delta },
  { key: 'noseWidth', label: 'Нос', zone: 'center', value: 0.31 + delta },
  { key: 'jawWidth', label: 'Челюсть', zone: 'lower', value: 0.72 + delta }
];

const stableFrames = [
  { quality: { score: 88, faceScale: .38, centerX: .5, centerY: .5 }, pose: { yaw: 0, roll: 0 }, descriptors: descriptorSeries(0) },
  { quality: { score: 84, faceScale: .39, centerX: .5, centerY: .5 }, pose: { yaw: -15, roll: 1 }, descriptors: descriptorSeries(.003) },
  { quality: { score: 85, faceScale: .38, centerX: .51, centerY: .5 }, pose: { yaw: 15, roll: 1 }, descriptors: descriptorSeries(-.002) },
  { quality: { score: 86, faceScale: .38, centerX: .5, centerY: .5 }, pose: { yaw: 0, roll: 0 }, descriptors: descriptorSeries(.001) },
  { quality: { score: 87, faceScale: .39, centerX: .5, centerY: .5 }, pose: { yaw: 0, roll: 0 }, descriptors: descriptorSeries(-.001) }
];

test('builds a stable appearance profile and calibrates the experimental score', () => {
  const result = executeV20(strongSample);
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
  const result = executeV20(weak);
  assert.equal(result.appearanceV2.robust.length, 0);
  assert.equal(result.appearanceV2.ambiguous.length, 3);
  assert.ok(result.rating < 4);
  assert.ok(result.halfWidth > weak.halfWidth);
  assert.ok(result.appearanceV2.support < 60);
});

test('uses only the three core views when control frames add no information', () => {
  const result = executeV21(stableFrames);
  assert.equal(result.model.selectedFrames, 3);
  assert.equal(result.model.capturedFrames, 5);
  assert.equal(result.appearanceV2.adaptiveProtocol.validationNeeded, 0);
  assert.ok(result.appearanceV2.perspective.risk < 30);
  assert.ok(result.appearanceV2.zones.every((zone) => zone.stability >= 80));
});

test('keeps validation views and widens uncertainty when perspective is unstable', () => {
  const unstable = structuredClone(stableFrames);
  unstable[0].quality.score = 60;
  unstable[0].quality.faceScale = .68;
  unstable[1].pose.yaw = -7;
  unstable[2].pose.yaw = 21;
  unstable[3].quality.faceScale = .44;
  unstable[3].quality.centerX = .59;
  unstable[3].descriptors = descriptorSeries(.11);
  unstable[4].quality.faceScale = .51;
  unstable[4].descriptors = descriptorSeries(-.08);
  const result = executeV21(unstable);
  assert.ok(result.model.selectedFrames >= 4);
  assert.ok(result.appearanceV2.perspective.risk >= 35);
  assert.ok(result.halfWidth > .62);
  assert.match(result.appearanceV2.recommendation.title, /Повтори|Нужны|Нестабильная/);
});
