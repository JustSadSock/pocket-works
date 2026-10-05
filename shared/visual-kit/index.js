/** Babylon-facing primitives with no global engine instance or network dependency. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createVisualKit(B) {
  if (!B?.Color3 || !B?.HemisphericLight || !B?.DirectionalLight || !B?.PBRMaterial) {
    throw new TypeError('Pass the Babylon namespace to createVisualKit(BABYLON).');
  }

  const activeFlashes = new WeakMap();

  function createForestLighting(scene, mood = 'overcast', options = {}) {
    const presets = {
      overcast: { sky: [0.72, 0.79, 0.83], ground: [0.28, 0.32, 0.29], sun: [0.88, 0.91, 0.87], ambient: 0.82, key: 0.8, direction: [-0.5, -1, 0.35], fog: [0.64, 0.72, 0.72], density: 0.006 },
      morning: { sky: [0.68, 0.78, 0.91], ground: [0.37, 0.32, 0.25], sun: [1, 0.78, 0.55], ambient: 0.65, key: 1.25, direction: [-0.8, -0.55, 0.4], fog: [0.72, 0.74, 0.66], density: 0.004 },
      dusk: { sky: [0.4, 0.46, 0.61], ground: [0.24, 0.25, 0.29], sun: [1, 0.5, 0.32], ambient: 0.48, key: 0.95, direction: [0.75, -0.35, 0.45], fog: [0.47, 0.45, 0.48], density: 0.008 }
    };
    const preset = presets[mood];
    if (!preset) throw new RangeError(`Unknown forest lighting mood: ${mood}`);
    const color = (rgb) => new B.Color3(...rgb);
    const ambient = new B.HemisphericLight(`pw-forest-${mood}-ambient`, new B.Vector3(0, 1, 0), scene);
    ambient.diffuse = color(preset.sky);
    ambient.groundColor = color(preset.ground);
    ambient.intensity = preset.ambient * clamp(options.intensity ?? 1, 0, 3);
    const key = new B.DirectionalLight(`pw-forest-${mood}-key`, new B.Vector3(...preset.direction), scene);
    key.diffuse = color(preset.sun);
    key.intensity = preset.key * clamp(options.intensity ?? 1, 0, 3);
    // Restore the scene settings when a level is unloaded; never mutate the engine globally.
    const previous = { clearColor: scene.clearColor, fogMode: scene.fogMode, fogColor: scene.fogColor, fogDensity: scene.fogDensity };
    if (options.fog !== false) {
      scene.fogMode = B.Scene.FOGMODE_EXP2;
      scene.fogColor = color(preset.fog);
      scene.fogDensity = preset.density * clamp(options.fogDensity ?? 1, 0, 4);
    }
    return {
      ambient, key,
      dispose() {
        ambient.dispose();
        key.dispose();
        scene.clearColor = previous.clearColor;
        scene.fogMode = previous.fogMode;
        scene.fogColor = previous.fogColor;
        scene.fogDensity = previous.fogDensity;
      }
    };
  }

  function createSurface(scene, name, options = {}) {
    const material = new B.PBRMaterial(name, scene);
    material.albedoColor = B.Color3.FromHexString(options.color ?? '#8b927d');
    material.metallic = clamp(options.metallic ?? 0, 0, 1);
    material.roughness = clamp(options.roughness ?? 0.85, 0, 1);
    if (options.emissiveColor) material.emissiveColor = B.Color3.FromHexString(options.emissiveColor);
    return material;
  }

  function flashHit(mesh, options = {}) {
    activeFlashes.get(mesh)?.();
    const original = mesh?.material;
    if (!original?.emissiveColor || typeof original.clone !== 'function') return () => {};
    // A hit belongs to one mesh, even when many meshes share the source material.
    const material = original.clone(`${original.name}-hit`);
    mesh.material = material;
    const base = material.emissiveColor.clone();
    const flash = B.Color3.FromHexString(options.color ?? '#ffffff');
    const duration = Math.max(0, options.duration ?? 0.12) * 1000;
    let frame;
    let start;
    let active = true;
    const tick = (now) => {
      if (!active) return;
      start ??= now;
      const t = clamp((now - start) / Math.max(duration, 1), 0, 1);
      material.emissiveColor = B.Color3.Lerp(flash, base, t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else { mesh.material = original; material.dispose(); activeFlashes.delete(mesh); active = false; }
    };
    frame = requestAnimationFrame(tick);
    const cancel = () => {
      if (!active) return;
      active = false;
      cancelAnimationFrame(frame);
      mesh.material = original;
      material.dispose();
      activeFlashes.delete(mesh);
    };
    activeFlashes.set(mesh, cancel);
    return cancel;
  }

  return { createForestLighting, createSurface, flashHit };
}
