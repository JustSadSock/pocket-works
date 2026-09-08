import {
  Color3,
  EngineStore,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  TransformNode,
  Vector3
} from '@babylonjs/core';

const material = (scene, name, diffuse, emissive = null, metallic = false) => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = diffuse;
  m.ambientColor = diffuse.scale(0.7);
  m.specularColor = metallic ? new Color3(0.26, 0.25, 0.19) : new Color3(0.055, 0.055, 0.05);
  m.specularPower = metallic ? 52 : 18;
  if (emissive) m.emissiveColor = emissive;
  m.backFaceCulling = false;
  return m;
};

const finishMesh = (mesh, parent, mat) => {
  mesh.parent = parent;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
};

export function installColossusVisualOverhaul() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene || scene.metadata?.colossusVisualOverhaul) return;
  scene.metadata = { ...(scene.metadata || {}), colossusVisualOverhaul: true };

  const back = scene.getTransformNodeByName('carrier-back');
  const shoulder = scene.getTransformNodeByName('carrier-shoulder');
  const head = scene.getTransformNodeByName('carrier-head');
  if (!back || !shoulder || !head) return;

  const armor = material(scene, 'macro-armor', new Color3(0.135, 0.155, 0.135), new Color3(0.009, 0.012, 0.009), true);
  const armorHi = material(scene, 'macro-armor-highlight', new Color3(0.205, 0.205, 0.155), new Color3(0.012, 0.011, 0.006), true);
  const recess = material(scene, 'macro-recess', new Color3(0.027, 0.038, 0.034), new Color3(0.003, 0.005, 0.004), true);
  const bone = material(scene, 'macro-bone', new Color3(0.25, 0.25, 0.19), new Color3(0.012, 0.012, 0.007), true);
  const tissue = material(scene, 'macro-tissue', new Color3(0.19, 0.038, 0.026), new Color3(0.035, 0.004, 0.002));
  const conduit = material(scene, 'macro-conduit', new Color3(0.24, 0.14, 0.035), new Color3(0.045, 0.021, 0.002), true);
  const sensor = material(scene, 'macro-sensor', new Color3(0.02, 0.19, 0.16), new Color3(0.035, 0.68, 0.52), true);

  // The traversal deck is only the exposed crest of a body that is dozens of metres wide.
  const torso = finishMesh(MeshBuilder.CreateSphere('macro-torso', { diameter: 2, segments: 22 }, scene), back, recess);
  torso.scaling.set(10.8, 4.7, 18.5);
  torso.position.set(0, -5.6, 1.6);

  const upperMass = finishMesh(MeshBuilder.CreateSphere('macro-upper-mass', { diameter: 2, segments: 18 }, scene), back, armor);
  upperMass.scaling.set(9.1, 2.15, 13.6);
  upperMass.position.set(0, -2.15, 2.8);

  // Interlocking dorsal scutes make the playable route read as part of the colossus rather than floating platforms.
  const zs = [-11, -7.2, -3.1, 1.2, 5.5, 9.3, 12.4];
  zs.forEach((z, i) => {
    for (const side of [-1, 1]) {
      const plate = finishMesh(MeshBuilder.CreateBox(`macro-scute-${i}-${side}`, {
        width: 5.7 + (i % 2) * 0.7,
        height: 0.72,
        depth: 4.55
      }, scene), back, i % 3 === 1 ? armorHi : armor);
      plate.position.set(side * (4.0 + (i % 2) * 0.35), -0.62 + Math.sin(i * 0.7) * 0.18, z);
      plate.rotation.y = side * (0.11 + (i % 3) * 0.025);
      plate.rotation.z = side * (-0.11 - i * 0.006);
      plate.rotation.x = (i - 3) * 0.012;

      const seam = finishMesh(MeshBuilder.CreateBox(`macro-seam-${i}-${side}`, {
        width: 0.16,
        height: 0.20,
        depth: 3.8
      }, scene), back, conduit);
      seam.position.set(side * 1.42, 0.08, z);
      seam.rotation.y = side * 0.03;
    }

    const vertebra = finishMesh(MeshBuilder.CreateCylinder(`macro-vertebra-${i}`, {
      diameter: 2.45,
      height: 1.15,
      tessellation: 14
    }, scene), back, bone);
    vertebra.rotation.z = Math.PI / 2;
    vertebra.position.set(0, -0.22, z + 0.18);
    vertebra.scaling.z = 0.72;
  });

  // Massive ribs disappear into the storm on both sides, selling city-scale anatomy.
  for (let i = 0; i < 6; i++) {
    const z = -9 + i * 4.3;
    for (const side of [-1, 1]) {
      const rib = finishMesh(MeshBuilder.CreateTorus(`macro-rib-${i}-${side}`, {
        diameter: 10.4,
        thickness: 0.46,
        tessellation: 34
      }, scene), back, bone);
      rib.position.set(side * 5.4, -3.8, z);
      rib.rotation.x = Math.PI / 2;
      rib.rotation.y = side * (0.82 + i * 0.015);
      rib.scaling.set(1.0, 0.62, 1.0);
    }
  }

  // Exposed tendons and service conduits visually connect otherwise separated traversal plates.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const cable = finishMesh(MeshBuilder.CreateCylinder(`macro-tendon-${i}`, {
      diameter: 0.42 + (i % 3) * 0.12,
      height: 18 + (i % 2) * 6,
      tessellation: 10
    }, scene), back, i % 3 === 0 ? tissue : conduit);
    cable.rotation.x = Math.PI / 2;
    cable.rotation.z = side * (0.14 + (i % 3) * 0.025);
    cable.position.set(side * (5.5 + (i % 4) * 0.82), -1.35 - (i % 3) * 0.55, 1.0 + (i - 4) * 1.25);
  }

  for (const side of [-1, 1]) {
    const socket = finishMesh(MeshBuilder.CreateSphere(`macro-shoulder-socket-${side}`, { diameter: 2, segments: 20 }, scene), back, armorHi);
    socket.scaling.set(4.6, 4.0, 4.2);
    socket.position.set(side * 8.4, -1.7, 10.5);

    const joint = finishMesh(MeshBuilder.CreateCylinder(`macro-shoulder-joint-${side}`, {
      diameter: 5.4,
      height: 5.2,
      tessellation: 18
    }, scene), back, bone);
    joint.rotation.z = Math.PI / 2;
    joint.position.set(side * 9.0, -0.6, 10.8);
  }

  const shoulderMass = finishMesh(MeshBuilder.CreateSphere('macro-active-shoulder', { diameter: 2, segments: 20 }, scene), shoulder, armor);
  shoulderMass.scaling.set(7.2, 3.7, 6.1);
  shoulderMass.position.set(-0.4, -3.2, 1.8);

  const cranium = finishMesh(MeshBuilder.CreateSphere('macro-cranium', { diameter: 2, segments: 22 }, scene), head, armor);
  cranium.scaling.set(6.8, 4.4, 8.2);
  cranium.position.set(0, -4.2, 2.1);

  const crown = finishMesh(MeshBuilder.CreateBox('macro-cranial-crown', { width: 8.8, height: 0.72, depth: 10.5 }, scene), head, armorHi);
  crown.position.set(0, -0.75, 2.4);

  // Beacon and local spill light give mobile Safari a reliable depth/goal cue without flattening the storm lighting.
  const beaconRoot = new TransformNode('macro-beacon-root', scene);
  beaconRoot.parent = back;
  beaconRoot.position.set(0, 3.2, 12.1);
  const beacon = finishMesh(MeshBuilder.CreateTorus('macro-beacon', { diameter: 2.9, thickness: 0.16, tessellation: 36 }, scene), beaconRoot, sensor);
  beacon.rotation.x = Math.PI / 2;
  const beaconLight = new PointLight('macro-beacon-light', new Vector3(0, 0, 0), scene);
  beaconLight.parent = beaconRoot;
  beaconLight.diffuse = new Color3(0.12, 0.95, 0.74);
  beaconLight.intensity = 1.35;
  beaconLight.range = 20;

  const cameraFill = new PointLight('traveler-camera-fill', new Vector3(0, 0, 0), scene);
  cameraFill.parent = scene.activeCamera;
  cameraFill.position.set(0, 2.2, -0.8);
  cameraFill.diffuse = new Color3(0.62, 0.69, 0.60);
  cameraFill.intensity = 0.52;
  cameraFill.range = 18;

  let t = 0;
  scene.onBeforeRenderObservable.add(() => {
    t += scene.getEngine().getDeltaTime() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.15);
    sensor.emissiveColor.set(0.025 + pulse * 0.025, 0.44 + pulse * 0.28, 0.34 + pulse * 0.2);
    beaconLight.intensity = 1.1 + pulse * 0.65;
    tissue.emissiveColor.set(0.024 + pulse * 0.018, 0.003, 0.0015);
  });
}
