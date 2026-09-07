// Babylon.js uses a left-handed scene by default. For an XZ grid whose Z
// increases by row, this winding keeps the upward-facing surface as the front face.
export function appendBabylonGroundCell(indices, a, b, d, e) {
  indices.push(b, e, d, a, b, d);
}

export function interpolateGroundCell(ha, hb, hd, he, tx, tz) {
  if (tx + tz <= 1) return ha + tx * (hb - ha) + tz * (hd - ha);
  return hb * (1 - tz) + hd * (1 - tx) + he * (tx + tz - 1);
}
