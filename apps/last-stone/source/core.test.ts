import { it, expect } from 'vitest';
import { newGame, wavePlan } from './core';

it('starts with a build phase and a northern approach',()=>{
  expect(newGame().phase).toBe('build');
  expect(wavePlan(1).side).toBe('north');
});
