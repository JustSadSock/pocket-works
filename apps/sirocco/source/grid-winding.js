// Babylon.js uses a left-handed scene by default. For an XZ grid whose row
// coordinate increases toward +Z, the same top-facing winding used by
// CreateTiledGroundVertexData is [b,e,d, a,b,d]. In conventional right-handed
// cross-product math those triangles have a negative Y geometric cross normal;
// Babylon still treats them as the upward/front side of its default ground.
export function appendBabylonXZCell(indices, a, b, d, e) {
  indices.push(b, e, d, a, b, d);
}

export function babylonXZCellIndices(a, b, d, e) {
  return [b, e, d, a, b, d];
}
