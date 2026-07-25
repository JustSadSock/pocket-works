/** Deterministic, DOM-free optics primitives used by unit tests. */
export type Vec = { x: number; y: number };

export const V = {
  dot: (a: Vec, b: Vec) => a.x * b.x + a.y * b.y,
  mul: (a: Vec, scalar: number): Vec => ({ x: a.x * scalar, y: a.y * scalar }),
  sub: (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y }),
  len: (a: Vec) => Math.hypot(a.x, a.y),
  norm: (a: Vec): Vec => {
    const length = Math.hypot(a.x, a.y) || 1;
    return { x: a.x / length, y: a.y / length };
  }
};

export function reflect(direction: Vec, normal: Vec): Vec {
  const n = V.norm(normal);
  return V.norm(V.sub(direction, V.mul(n, 2 * V.dot(direction, n))));
}

export function refract(direction: Vec, normal: Vec, n1: number, n2: number): Vec | null {
  let n = V.norm(normal);
  const d = V.norm(direction);
  let cosI = -V.dot(n, d);
  if (cosI < 0) {
    n = V.mul(n, -1);
    cosI = -V.dot(n, d);
  }
  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  return V.norm({
    x: eta * d.x + (eta * cosI - Math.sqrt(k)) * n.x,
    y: eta * d.y + (eta * cosI - Math.sqrt(k)) * n.y
  });
}

export function cauchyIor(base: number, dispersion: number, wavelengthNm: number): number {
  const wavelengthMicrometers = wavelengthNm / 1000;
  return base + dispersion / (wavelengthMicrometers * wavelengthMicrometers);
}

export function validateImportEnvelope(bytes: number, objectCount: number): void {
  if (!Number.isFinite(bytes) || bytes < 0 || bytes > 2_000_000) throw new Error('Файл больше 2 МБ.');
  if (!Number.isInteger(objectCount) || objectCount < 0 || objectCount > 500) throw new Error('В сцене слишком много объектов.');
}
