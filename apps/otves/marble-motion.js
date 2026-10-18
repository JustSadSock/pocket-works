// Pure, deterministic kinematics for OTVES. Coordinate system: X and Z are the
// maze floor; Y is up. Quaternions are [x,y,z,w] in world space.
export const MARBLE_RADIUS = 0.265;
export const WELL_DEPTH = 0.95;
export const GOAL_CAPTURE_MS = 1250;
export const identityRotation = () => [0, 0, 0, 1];
export const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

export function normalizedQuaternion(q) {
  const n = Math.hypot(q[0],q[1],q[2],q[3]);
  return n > 1e-12 && Number.isFinite(n)
    ? [q[0]/n,q[1]/n,q[2]/n,q[3]/n] : identityRotation();
}

export function multiplyQuaternions(a,b) {
  const [ax,ay,az,aw]=a, [bx,by,bz,bw]=b;
  return [
    aw*bx+ax*bw+ay*bz-az*by,
    aw*by-ax*bz+ay*bw+az*bx,
    aw*bz+ax*by-ay*bx+az*bw,
    aw*bw-ax*bx-ay*by-az*bz
  ];
}

// No-slip rolling: angular displacement = distance / radius.
// Axis = up cross displacement = [-deltaZ,0,deltaX].
export function rollQuaternion(orientation, deltaX, deltaZ, radius = MARBLE_RADIUS) {
  const distance = Math.hypot(deltaX,deltaZ);
  if (distance < 1e-9 || !(radius > 0)) return normalizedQuaternion(orientation);
  const angle = distance/radius;
  const scale = Math.sin(angle/2)/distance;
  const increment = [-deltaZ*scale,0,deltaX*scale,Math.cos(angle/2)];
  return normalizedQuaternion(multiplyQuaternions(increment,orientation));
}

// Used in the vertex shader: a world-space rotation with a translated center.
// Geometry is built at origin, and receives no scaling (collision radius is fixed).
export function marbleModelMatrix(position,orientation) {
  const [x,y,z,w]=normalizedQuaternion(orientation);
  const xx=x*x, yy=y*y, zz=z*z;
  const xy=x*y, xz=x*z, yz=y*z;
  const wx=w*x, wy=w*y, wz=w*z;
  return new Float32Array([
    1-2*(yy+zz), 2*(xy+wz), 2*(xz-wy), 0,
    2*(xy-wz), 1-2*(xx+zz), 2*(yz+wx), 0,
    2*(xz+wy), 2*(yz-wx), 1-2*(xx+yy), 0,
    position.x,position.y,position.z,1
  ]);
}

export function startGoalCapture(marble,goal) {
  return {
    fromX:marble.position.x,
    fromZ:marble.position.y,
    goalX:goal.x,
    goalZ:goal.y,
    vx:marble.velocity.x,
    vz:marble.velocity.y,
    radius:marble.radius,
    rotation:normalizedQuaternion(marble.orientation),
    startedAt:0,
    duration:GOAL_CAPTURE_MS
  };
}

export function sampleGoalCapture(capture, progress) {
  const t=clamp01(progress);
  // Physically legible three phases:
  //  0-0.28: retained tangential motion + centering on the brass aperture,
  //  0.28-0.87: accelerated drop, the hole visibly occludes the sphere,
  //  0.87-1: a short damped settling against the hidden ceramic bottom.
  const ingress=clamp01(t/.28);
  const smooth=ingress*ingress*(3-2*ingress);
  const dragX=Math.max(-.07,Math.min(.07,capture.vx*.025));
  const dragZ=Math.max(-.07,Math.min(.07,capture.vz*.025));
  const x=capture.fromX+(capture.goalX-capture.fromX)*smooth
    +dragX*Math.sin(Math.PI*ingress)*(1-ingress);
  const z=capture.fromZ+(capture.goalZ-capture.fromZ)*smooth
    +dragZ*Math.sin(Math.PI*ingress)*(1-ingress);
  const down=clamp01((t-.28)/.59);
  const dropDistance=WELL_DEPTH;
  const depth=dropDistance*down*down;
  const landing=clamp01((t-.87)/.13);
  const rebound=landing>0 ? .027*Math.sin(landing*Math.PI)*Math.exp(-5*landing) : 0;
  const position={x,y:capture.radius-depth+rebound,z};
  const dx=x-capture.fromX,dz=z-capture.fromZ;
  return {
    position,
    rotation:rollQuaternion(capture.rotation,dx,dz,capture.radius),
    depth,
    phase:t<.28?'rim':t<.87?'fall':'settle',
    done:t>=1
  };
}
