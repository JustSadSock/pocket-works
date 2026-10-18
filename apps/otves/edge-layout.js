// Screen-as-instrument optics. No decorative camera padding: the outer walls
// become the glass/ceramic continuation of the physical phone bezel.
const PITCH_SLOPE = 0.14;
const PITCH_COSINE = 1 / Math.sqrt(1 + PITCH_SLOPE * PITCH_SLOPE);
const EDGE_MARGIN = 0.10; // world units, narrower than the perimeter walls

export function edgeMazeDimensions(level, viewportAspect) {
  const aspect = Math.max(.28,Math.min(3.5,Number(viewportAspect)||.46));
  const step = Math.max(0,Math.floor(level)-1);
  if (aspect >= 1) {
    const rows = Math.min(10,7+Math.floor(step/3));
    return { cols:Math.max(rows,Math.min(28,Math.round(rows*aspect*PITCH_COSINE))),
      rows };
  }
  const cols = Math.min(11,7+Math.floor(step/3));
  return { cols,rows:Math.max(cols,Math.min(28,Math.round(cols/aspect*PITCH_COSINE))) };
}

// Cover the phone by a very small overscan when the maze matches the device.
// An existing in-progress board may have been generated in another orientation;
// in that case CONTAIN avoids cropping playable cells and protects progress.
export function edgeCameraFit(cols,rows,viewWidth,viewHeight) {
  const width=Math.max(1,viewWidth),height=Math.max(1,viewHeight);
  const worldWidth=cols+EDGE_MARGIN;
  const worldHeight=rows*PITCH_COSINE+EDGE_MARGIN;
  const widthScale=width/worldWidth;
  const heightScale=height/worldHeight;
  const aspectMismatch=Math.abs(Math.log(widthScale/heightScale));
  const fullBleed=aspectMismatch<=.105;
  const scale=fullBleed ? Math.max(widthScale,heightScale) : Math.min(widthScale,heightScale);
  return {
    scale,halfX:width/(2*scale),halfY:height/(2*scale),
    fullBleed,aspectMismatch,
    pitchSlope:PITCH_SLOPE,
    widthCoverage:worldWidth*scale/width,
    heightCoverage:worldHeight*scale/height
  };
}

/** New full-bleed layouts must not overwrite or compare old-level records
 * produced on a different maze size. Legacy numeric keys stay untouched. */
export function recordKey(level,cols,rows) {
  return String(Math.max(1,Math.floor(level)))+':'+cols+'x'+rows;
}
