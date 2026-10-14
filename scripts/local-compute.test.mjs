import test from 'node:test';
import assert from 'node:assert/strict';
import { parseComputeRequest, validateRequest, ISSUE_TITLE, OWNER, AUDIT_SEEDS } from './local-compute.mjs';

const issue = (body, overrides = {}) => ({
  action: 'opened',
  issue: { title: ISSUE_TITLE, user: { login: OWNER }, body, ...overrides },
});

test('owner issue triggers allowlisted audit with bounded parameters', () => {
  assert.deepEqual(parseComputeRequest(issue('{"profile":"audit","worlds":8,"years":100,"period":20}'), 'issues'), {
    profile: 'audit', worlds: 8, years: 100, period: 20, scenario: 'normal',
  });
  assert.equal(AUDIT_SEEDS.length, 8);
});

test('outside contributors cannot trigger compute, even with the same issue body', () => {
  assert.throws(() => parseComputeRequest(issue('{"profile":"audit"}', { user: { login: 'attacker' } }), 'issues'), /Untrusted/);
  assert.throws(() => parseComputeRequest(issue('{}', { title: '[compute] something-else' }), 'issues'), /Untrusted/);
  assert.throws(() => parseComputeRequest({ ...issue('{}'), action: 'edited' }, 'issues'), /Untrusted/);
  assert.throws(() => parseComputeRequest(issue('{}'), 'pull_request'), /Unsupported/);
});

test('manual workflow accepts safe strings and chooses defaults', () => {
  assert.deepEqual(parseComputeRequest({ inputs: { profile: 'regression' } }, 'workflow_dispatch'), {
    profile: 'regression', worlds: 4, years: 50, period: 10, scenario: 'normal',
  });
});

test('malformed or unexpected issue payloads are rejected', () => {
  assert.throws(() => parseComputeRequest(issue('{"profile":"audit","script":"rm -rf /"}'), 'issues'), /Unknown request field/);
  assert.throws(() => parseComputeRequest(issue('{"profile":"audit","years":"1; shutdown"}'), 'issues'), /integer/);
  assert.throws(() => parseComputeRequest(issue('no JSON'), 'issues'), /JSON/);
  assert.throws(() => parseComputeRequest(issue(' '.repeat(2049)), 'issues'), /Request must|JSON/);
  assert.throws(() => parseComputeRequest(issue('{"profile":"audit"}'.repeat(200)), 'issues'), /too long/);
  assert.throws(() => validateRequest([]), /JSON object/);
});

test('resource limits and enumerations cannot be bypassed', () => {
  for (const value of [0, 9, 10000, 'NaN']) {
    assert.throws(() => validateRequest({ profile: 'audit', worlds: value }), /worlds/);
  }
  assert.throws(() => validateRequest({ years: 101 }), /years/);
  assert.throws(() => validateRequest({ years: 55, period: 20 }), /divisible/);
  assert.throws(() => validateRequest({ scenario: 'javascript:alert(1)' }), /scenario/);
  assert.throws(() => validateRequest({ profile: '../unknown.js' }), /Profile/);
  assert.throws(() => validateRequest({ profile: 'audit', years: 11, period: 10 }), /divisible/);
});
