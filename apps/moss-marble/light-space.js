// Shared solar vector and terrain-following penumbrae for the greenhouse.
// Renderer/WebGL keeps the same light direction on desktop and rotated phones.
// Shadows are visual-only vertex meshes and never alter collision geometry.
export const KEY_LIGHT = Object.freeze({ x: -.48, y: -.52, z: .70 });
export const SHADOW_MATERIAL = 3;
const TAU = Math.PI * 2;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const normal = [0,0,1];

export function keyOnScreen(rotation = 0) {
  const cs = Math.cos(rotation), sn = Math.sin(rotation);
  return { x: KEY_LIGHT.x * cs - KEY_LIGHT.y * sn, y: KEY_LIGHT.x * sn + KEY_LIGHT.y * cs };
}

export function shadowDisplacement(height = 0) {
  const h = clamp(Number(height) || 0, 0, 180);
  return { x: -KEY_LIGHT.x / KEY_LIGHT.z * h * .55, y: -KEY_LIGHT.y / KEY_LIGHT.z * h * .55 };
}

export function appendSoftShadow(mesh, terrainHeight, options) {
  const { x, y, radiusX, radiusY, height = 0, strength = .30, angle = 0, segments = 20, offsetFactor = 1 } = options;
  if (![x,y,radiusX,radiusY].every(Number.isFinite) || radiusX <= 0 || radiusY <= 0) return;
  const displacement = shadowDisplacement(height);
  const ox = displacement.x * offsetFactor, oy = displacement.y * offsetFactor;
  const cx = x + ox, cy = y + oy;
  const c = Math.cos(angle), s = Math.sin(angle);
  const radii = [0, .40, .74, 1];
  const opacities = [1, .76, .29, 0];
  const vertex = (radius, theta) => {
    const lx = Math.cos(theta) * radiusX * radius;
    const ly = Math.sin(theta) * radiusY * radius;
    const wx = cx + lx * c - ly * s, wy = cy + lx * s + ly * c;
    // Sample the actual heightfield at each vertex: no shadow floats across
    // a slope or cuts through a raised green on a rotated device.
    const z = (typeof terrainHeight === 'function' ? terrainHeight(wx,wy) : 0) + .38;
    return [wx,wy,z];
  };
  const rgba = opacities.map(a => [.025,.055,.041,clamp(strength * a,0,.65)]);
  const vertices = [];
  for(let ring=0;ring<radii.length;ring++) {
    vertices.push(Array.from({length:segments},(_,i)=>vertex(radii[ring], i / segments * TAU)));
  }
  for(let ring=0;ring<radii.length-1;ring++){
    for(let i=0;i<segments;i++){
      const j=(i+1)%segments;
      const corners=[
        [vertices[ring][i],rgba[ring]],
        [vertices[ring][j],rgba[ring]],
        [vertices[ring+1][j],rgba[ring+1]],
        [vertices[ring+1][i],rgba[ring+1]]
      ];
      for(const [a,b,c] of [[0,1,2],[0,2,3]]) {
        for(const index of [a,b,c]) mesh.vertex(corners[index][0], normal, corners[index][1], SHADOW_MATERIAL);
      }
    }
  }
}

export function appendLineShadow(mesh, terrainHeight, {ax,ay,bx,by,width,height,strength=.27}) {
  const dx = bx-ax, dy = by-ay;
  const length = Math.hypot(dx,dy) || 1;
  appendSoftShadow(mesh,terrainHeight,{
    x:(ax+bx)*.5,y:(ay+by)*.5,
    radiusX:length*.53+Math.max(6,width*.28),
    radiusY:Math.max(10,width*1.35),
    height, strength,
    angle:Math.atan2(dy,dx), segments:26
  });
}
