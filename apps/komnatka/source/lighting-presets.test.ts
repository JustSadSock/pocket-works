import { describe,it,expect } from 'vitest';
import { lightingEnvelope,STUDIO_LIGHTS,MAX_PRACTICAL_LAMPS,physicalLampEnabled } from './lighting-presets.js';

describe('toy-dollhouse lighting',()=>{
 it('keeps only two stage sources so lamp shaders have available slots',()=>{
  expect(STUDIO_LIGHTS).toBe(2);
  expect(STUDIO_LIGHTS+MAX_PRACTICAL_LAMPS).toBeLessThanOrEqual(6);
  expect(Array.from({length:7},(_,i)=>physicalLampEnabled(i))).toEqual([true,true,true,true,false,false,false]);
 });
 it('genuinely switches on warm floor and wall lamp lighting at night',()=>{
  const day=lightingEnvelope(0),night=lightingEnvelope(1),dusk=lightingEnvelope(.5);
  expect(day.lamp).toBeLessThan(.1);
  expect(night.lamp).toBeGreaterThan(2);
  expect(night.lamp/day.lamp).toBeGreaterThan(20);
  expect(day.floorGlow).toBe(0);
  expect(day.wallGlow).toBe(0);
  expect(night.floorGlow).toBeGreaterThan(.75);
  expect(night.wallGlow).toBeGreaterThan(.4);
  expect(night.shadeRed).toBeGreaterThan(day.shadeRed*15);
  expect(night.bulbRed).toBeGreaterThan(day.bulbRed*10);
  expect(dusk.lamp).toBeGreaterThan(day.lamp);
  expect(dusk.lamp).toBeLessThan(night.lamp);
 });
 it('leaves enough ambient moonlight to interact with every furniture item',()=>{
  const night=lightingEnvelope(1),day=lightingEnvelope(0);
  expect(night.ambient).toBeGreaterThanOrEqual(.17);
  expect(night.exposure).toBeGreaterThanOrEqual(day.exposure);
  expect(night.sun).toBeGreaterThan(0);
  expect(day.ambient).toBeGreaterThan(night.ambient);
 });
 it('is bounded for interrupted transitions and invalid clock deltas',()=>{
  for(const bad of [-50,Number.NaN,Infinity]){
   expect(lightingEnvelope(bad)).toEqual(lightingEnvelope(0));
  }
  expect(lightingEnvelope(10)).toEqual(lightingEnvelope(1));
 });
});
