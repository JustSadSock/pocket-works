import {describe,it,expect} from 'vitest';
import {hardwareScale} from './render-quality.js';
import {compareMemory} from './memory-review.js';

describe('Retina quality',()=>{
 it('keeps native resolution on current phones even at 3x DPR',()=>{
  expect(hardwareScale({width:430,height:710,dpr:3})).toBe(1);
  expect(hardwareScale({width:393,height:620,dpr:3})).toBe(1);
 });
 it('caps exceptionally large rendering surfaces without oscillation',()=>{
  const scale=hardwareScale({width:2000,height:1200,dpr:3});
  expect(scale).toBeGreaterThan(1);
  expect(hardwareScale({width:2000,height:1200,dpr:3})).toBe(scale);
  expect(hardwareScale({width:700,height:500,dpr:1})).toBe(1);
 });
});

describe('memory round review',()=>{
 const goal=[
  {type:'sofa',x:1,z:1,rot:0,color:'#aa'},
  {type:'rug',x:0,z:0,rot:1,color:'#bb'},
  {type:'mug',x:1,z:0,rot:0,color:'#cc',support:'table'}
 ];
 it('explains perfect reconstructions',()=>{
  const output=compareMemory(goal,goal.map(x=>({...x})));
  expect(output.exact).toBe(3);expect(output.partial).toBe(0);
  expect(output.missing).toBe(0);expect(output.extra).toBe(0);
 });
 it('explains distance, rotation, paint, absence and surplus distinctly',()=>{
  const output=compareMemory(goal,[
   {type:'sofa',x:2,z:1,rot:2,color:'#xx'},
   {type:'rug',x:0,z:0,rot:1,color:'#bb'},
   {type:'plant',x:0,z:2,rot:0,color:'#aa'}
  ]);
  expect(output.exact).toBe(1);
  expect(output.partial).toBe(1);
  expect(output.missing).toBe(1);
  expect(output.extra).toBe(1);
  expect(output.rows[0].detail).toContain('положение');
  expect(output.rows[0].detail).toContain('поворот');
  expect(output.rows[0].detail).toContain('цвет');
 });
});
