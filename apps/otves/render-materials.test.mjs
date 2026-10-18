import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERTEX_SOURCE, OPAQUE_FRAGMENT_SOURCE, GLASS_FRAGMENT_SOURCE,
  BLIT_VERTEX_SOURCE, BLIT_FRAGMENT_SOURCE,
  chooseOpticalProfile
} from './render-materials.js';

test('optical quality selects three tiers using GPU and viewport limits', () => {
  const high=chooseOpticalProfile({width:390,height:844,dpr:3,maxTextureSize:8192,
    deviceMemory:8,hardwareConcurrency:8});
  assert.equal(high.level,'high');
  assert.equal(high.refraction,true);
  assert.equal(high.shadowSize,1024);
  const medium=chooseOpticalProfile({width:390,height:844,dpr:2,maxTextureSize:4096,
    deviceMemory:4,hardwareConcurrency:4});
  assert.equal(medium.level,'balanced');
  assert.equal(medium.refraction,false);
  assert.equal(medium.shadows,true);
  const low=chooseOpticalProfile({width:390,height:844,dpr:2,maxTextureSize:2048,
    deviceMemory:2,hardwareConcurrency:2});
  assert.equal(low.level,'low');
  assert.equal(low.refraction,false);
  assert.equal(low.shadows,false);
  assert.ok(low.pixelRatio<=1.1);
});

test('reduced motion does not disable the physical simulation or optics', () => {
  const config=chooseOpticalProfile({width:390,height:844,dpr:2,maxTextureSize:8192,
    deviceMemory:8,hardwareConcurrency:8,reducedMotion:true});
  assert.equal(config.staticHighlights,true);
  assert.equal(config.refraction,true);
});

test('GLSL programs target WebGL2 and keep lighting consistent', () => {
  for(const src of [VERTEX_SOURCE,OPAQUE_FRAGMENT_SOURCE,
    GLASS_FRAGMENT_SOURCE,BLIT_VERTEX_SOURCE,BLIT_FRAGMENT_SOURCE]) {
    assert.ok(src.startsWith('#version 300 es'));
    assert.ok(src.includes('void main()'));
    assert.equal(src.includes('samplerExternalOES'),false);
  }
  assert.match(GLASS_FRAGMENT_SOURCE,/refract\(/);
  assert.match(GLASS_FRAGMENT_SOURCE,/fresnel|fres/);
  assert.match(OPAQUE_FRAGMENT_SOURCE,/distributionGGX/);
  assert.match(OPAQUE_FRAGMENT_SOURCE,/rough/);
  assert.match(GLASS_FRAGMENT_SOURCE,/uUseRefraction/);
});
