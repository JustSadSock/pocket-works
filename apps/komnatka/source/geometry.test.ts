import { describe, expect, it } from 'vitest';
import { roundedGeometry } from './geometry.js';

function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
describe('closed rounded prisms',()=>{
 it('preserves outward normals and Babylon left-handed front-face winding on all six sides',()=>{
  const n=8,geo=roundedGeometry(2.45,.48,1.14,.14,n),faceSize=(n+1)**2;
  expect(geo.positions.length/3).toBe(6*faceSize);
  expect(geo.indices.length).toBe(6*n*n*6);
  for(let face=0;face<6;face++){
   // Central quad on each surface: the local RH cross is inward for Babylon LH rasterization.
   const i0=face*faceSize+3*(n+1)+3;
   const triangle=geo.indices.slice((face*n*n+3*n+3)*6,(face*n*n+3*n+3)*6+3);
   expect(triangle).toHaveLength(3);
   const p=triangle.map(i=>geo.positions.slice(i*3,i*3+3));
   const v1=p[1].map((v,i)=>v-p[0][i]),v2=p[2].map((v,i)=>v-p[0][i]);
   const normal=cross(v1,v2);
   const outward=geo.normals.slice(i0*3,i0*3+3);
   expect(normal.reduce((sum,v,i)=>sum+v*outward[i],0)).toBeLessThan(0);
  }
 });
 it('has no NaNs or out-of-volume vertices for furniture proportions',()=>{
  for(const [w,h,d,r] of [[1.12,.62,.94,.125],[2.25,.26,2.63,.11],[1.8,1.95,.11,.03]]){
   const geo=roundedGeometry(w,h,d,r);
   expect(geo.positions.every(Number.isFinite)).toBe(true);
   for(let i=0;i<geo.positions.length;i+=3){
    expect(Math.abs(geo.positions[i])).toBeLessThanOrEqual(w/2+.00001);
    expect(Math.abs(geo.positions[i+1])).toBeLessThanOrEqual(h/2+.00001);
    expect(Math.abs(geo.positions[i+2])).toBeLessThanOrEqual(d/2+.00001);
   }
  }
 });
});
