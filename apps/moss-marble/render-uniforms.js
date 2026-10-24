// One authoritative WebGL upload for the marble's optical projection pivot.
// The vertex shader makes ONLY material 10 (the marble) look circular.
// If uBallCenter is left at its default (0,0,0) on a course-specific
// renderer, every ball vertex contracts toward the corner of the screen and
// the ball appears hundreds of pixels above its real collision position.
export function uploadBallCenterUniform(gl, location, center) {
  if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) {
    throw new Error('Moss & Marble: missing physical marble center for WebGL projection');
  }
  gl.uniform3f(location, center[0], center[1], center[2]);
}
