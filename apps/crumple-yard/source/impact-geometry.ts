/** Wheel and strut loading follows the actual contact location on the shell. */
export function wheelContactLoad(
  point: { x: number; z: number },
  car: { width: number; wheelBase: number; wheelRadius: number },
  severity: number
) {
  const lateral = Math.min(1, Math.abs(point.x) / Math.max(0.1, car.width * 0.5));
  const distanceToAxle = Math.abs(Math.abs(point.z) - car.wheelBase * 0.5);
  const arch = Math.max(0, Math.min(1, 1 - distanceToAxle / (car.wheelRadius + 0.52)));
  const exposed = Math.max(0, Math.min(1, (lateral - 0.46) / 0.54));
  const direct = arch * exposed;
  const intrusion = Math.max(0, severity - 0.43) * exposed * 0.78;
  return Math.max(0, Math.min(1, direct + intrusion));
}
