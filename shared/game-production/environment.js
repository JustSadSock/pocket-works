/** 2D composition plan for authored meshes. Coordinates are world X/Z; no rendering engine dependency. */
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function corridorDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return distance(point, { x: a.x + t * dx, z: a.z + t * dz });
}

export function composeEnvironment({ bounds, focalPoint, camera, density = 0.65, seed = 1, layers, sightlineWidth = 3 }) {
  if (!bounds || !focalPoint || !camera || !Array.isArray(layers) || !layers.length) throw new TypeError('bounds, focalPoint, camera and layers are required');
  if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, focalPoint.x, focalPoint.z, camera.x, camera.z, density].every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ || density < 0 || density > 1) throw new RangeError('Invalid composition bounds or density');
  const rng = randomGenerator(seed);
  const placements = [];
  const skipped = [];
  const centers = [focalPoint];
  for (const layer of layers) {
    if (!layer.id || !Array.isArray(layer.assets) || !layer.assets.length || !Number.isInteger(layer.count) || layer.count < 0 || !Number.isFinite(layer.minSpacing) || layer.minSpacing < 0) throw new TypeError(`Invalid layer ${layer.id}`);
    const count = Math.round(layer.count * density);
    let placed = 0;
    const attempts = Math.max(count * 48, 48);
    for (let i = 0; i < attempts && placed < count; i++) {
      const cluster = centers[Math.floor(rng() * centers.length)];
      const spread = layer.spread ?? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.3;
      const theta = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * spread;
      const candidate = { x: cluster.x + Math.cos(theta) * radius, z: cluster.z + Math.sin(theta) * radius };
      if (candidate.x < bounds.minX || candidate.x > bounds.maxX || candidate.z < bounds.minZ || candidate.z > bounds.maxZ) continue;
      if (distance(candidate, focalPoint) < (layer.focalClearance ?? 3)) continue;
      if (layer.keepSightline !== false && corridorDistance(candidate, camera, focalPoint) < sightlineWidth + layer.minSpacing * 0.5) continue;
      if (placements.some((other) => distance(candidate, other) < layer.minSpacing + other.spacing)) continue;
      const edge = Math.min(candidate.x - bounds.minX, bounds.maxX - candidate.x, candidate.z - bounds.minZ, bounds.maxZ - candidate.z);
      if (layer.zone === 'edge' && edge > (layer.edgeWidth ?? 4)) continue;
      if (layer.zone === 'interior' && edge < (layer.edgeWidth ?? 2)) continue;
      const asset = layer.assets[Math.floor(rng() * layer.assets.length)];
      const placement = { ...candidate, asset, layer: layer.id, rotation: rng() * Math.PI * 2, scale: 0.88 + rng() * 0.24, spacing: layer.minSpacing * 0.5 };
      placements.push(placement);
      if (layer.createClusters && centers.length < 12 && placed % 3 === 0) centers.push(candidate);
      placed++;
    }
    if (placed < count) skipped.push({ layer: layer.id, requested: count, placed });
  }
  return { focalPoint: { ...focalPoint }, placements, skipped };
}

export function composeVillage({ focalPoint, camera, bounds, assets, density = 0.65, seed = 1 }) {
  if (!assets?.building?.length || !assets?.prop?.length || !assets?.detail?.length) throw new TypeError('Provide building, prop and detail asset lists');
  return composeEnvironment({ bounds, focalPoint, camera, density, seed, layers: [
    { id: 'secondary', assets: assets.building, count: 10, minSpacing: 4, focalClearance: 6, spread: 19, createClusters: true },
    { id: 'edge', assets: assets.prop, count: 18, minSpacing: 1.6, focalClearance: 3, zone: 'edge', edgeWidth: 5, spread: 30 },
    { id: 'detail', assets: assets.detail, count: 32, minSpacing: 0.7, focalClearance: 2, spread: 27, keepSightline: true }
  ] });
}
