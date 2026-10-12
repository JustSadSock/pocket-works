/**
 * Rounded prism authored as six beveled grids.
 * Babylon's default left-handed mesh front face uses clockwise winding,
 * i.e. the cross product of a visible triangle points *into* the prism.
 * Smooth vertex normals, by contrast, always point outward.
 */
export function roundedGeometry(w,h,d,r,n=8) {
 const positions=[],normals=[],uvs=[],indices=[],ext=[w/2,h/2,d/2];
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  const a=(axis+1)%3,b=(axis+2)%3,base=positions.length/3;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
   const q=[0,0,0];q[axis]=sign*ext[axis];q[a]=(i/n*2-1)*ext[a];q[b]=(j/n*2-1)*ext[b];
   const cl=q.map((v,k)=>Math.min(ext[k]-r,Math.max(-ext[k]+r,v)));
   const delta=q.map((v,k)=>v-cl[k]),len=Math.hypot(...delta)||1;
   const normal=delta.map(v=>v/len);
   positions.push(...cl.map((v,k)=>v+normal[k]*r));
   normals.push(...normal);uvs.push(i/n,j/n);
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const v0=base+j*(n+1)+i,v1=v0+1,v2=v0+n+1,v3=v2+1;
   // Invert conventional RH cross product winding for Babylon LH.
   if(sign>0)indices.push(v0,v2,v1,v1,v2,v3);
   else indices.push(v0,v1,v2,v1,v3,v2);
  }
 }
 return {positions,normals,uvs,indices};
}
