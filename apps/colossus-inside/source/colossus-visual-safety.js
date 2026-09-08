export function applyColossusVisualSafety(scene) {
  if (!scene || scene.metadata?.colossusVisualSafety) return;
  scene.metadata = { ...(scene.metadata || {}), colossusVisualSafety: true };

  // Macro geometry must never become a dark 'inside the mesh' camera shell.
  // Keep single-sided surfaces and sink the two broad body volumes below the traversal crest.
  for (const mat of scene.materials) {
    if (mat?.name?.startsWith('macro-')) mat.backFaceCulling = true;
  }

  const torso = scene.getMeshByName('macro-torso');
  if (torso) {
    torso.position.y = -8.4;
    torso.scaling.y = 4.15;
  }

  const upper = scene.getMeshByName('macro-upper-mass');
  if (upper) {
    upper.position.y = -4.35;
    upper.scaling.y = 2.5;
  }

  const shoulder = scene.getMeshByName('macro-active-shoulder');
  if (shoulder) shoulder.position.y = -4.8;

  const cranium = scene.getMeshByName('macro-cranium');
  if (cranium) cranium.position.y = -5.7;

  const crown = scene.getMeshByName('macro-cranial-crown');
  if (crown) crown.position.y = -1.45;
}
