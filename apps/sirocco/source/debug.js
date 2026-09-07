import { MeshBuilder, Vector3 } from '@babylonjs/core';
import { terrainHeight, terrainNormal } from './terrain.js';

export class DebugPanel {
  constructor(scene, engine, deps) {
    this.scene = scene;
    this.engine = engine;
    this.deps = deps;
    this.enabled = new URLSearchParams(location.search).get('debug') === '1';
    this.panel = document.querySelector('#debug-panel');
    this.stats = document.querySelector('#debug-stats');
    this.normalsMesh = null;
    this.rayMesh = null;
    this.showNormals = false;
    this.showRay = false;
    this.elapsed = 0;
    if (this.enabled) this.mount();
  }

  mount() {
    this.panel.hidden = false;
    this.panel.querySelector('[data-debug="wireframe"]').addEventListener('change', (e) => this.deps.materials.setWireframe(e.target.checked));
    this.panel.querySelector('[data-debug="chunks"]').addEventListener('change', (e) => this.deps.world.setDebugBoundaries(e.target.checked));
    this.panel.querySelector('[data-debug="ik"]').addEventListener('change', (e) => this.deps.rig.setDebugTargets(e.target.checked));
    this.panel.querySelector('[data-debug="footprints"]').addEventListener('change', (e) => this.deps.footprints.setVisible(e.target.checked));
    this.panel.querySelector('[data-debug="lod"]').addEventListener('change', (e) => this.deps.world.setDebugLod(e.target.checked));
    this.panel.querySelector('[data-debug="normals"]').addEventListener('change', (e) => { this.showNormals = e.target.checked; });
    this.panel.querySelector('[data-debug="rays"]').addEventListener('change', (e) => { this.showRay = e.target.checked; });
  }

  update(dt, controller, quality) {
    if (!this.enabled) return;
    this.elapsed += dt;
    if (this.elapsed < 0.18) return;
    this.elapsed = 0;
    const drawCalls = this.engine._drawCalls?.current ?? '—';
    const stats = [
      `FPS ${this.engine.getFps().toFixed(0)} · ${(1000 / Math.max(1, this.engine.getFps())).toFixed(1)} ms`,
      `draw ${drawCalls} · tris ${Math.round(this.scene.getActiveIndices() / 3).toLocaleString()}`,
      `chunks ${this.deps.world.activeChunkCount} · footprints ${this.deps.footprints.count}`,
      `sand field geometric/SPS · particles ${quality.particles}`,
      `shadow ${quality.shadowSize}px · ${quality.label}`,
      `world ${controller.globalX.toFixed(1)}, ${controller.globalZ.toFixed(1)} · slope ${(controller.lastSlope * 57.2958).toFixed(1)}°`
    ];
    this.stats.textContent = stats.join('\n');
    this.updateNormals(controller);
    this.updateRay(controller);
  }

  updateNormals(controller) {
    this.normalsMesh?.dispose();
    this.normalsMesh = null;
    if (!this.showNormals) return;
    const lines = [];
    for (let z = -2; z <= 2; z += 1) {
      for (let x = -2; x <= 2; x += 1) {
        const lx = controller.localPosition.x + x * 1.25;
        const lz = controller.localPosition.z + z * 1.25;
        const gx = lx + controller.worldOffsetX;
        const gz = lz + controller.worldOffsetZ;
        const y = terrainHeight(gx, gz) + 0.08;
        const n = terrainNormal(gx, gz);
        lines.push([new Vector3(lx, y, lz), new Vector3(lx + n.x * 0.55, y + n.y * 0.55, lz + n.z * 0.55)]);
      }
    }
    this.normalsMesh = MeshBuilder.CreateLineSystem('debug-normals', { lines }, this.scene);
    this.normalsMesh.color.set(0.18, 0.86, 1);
  }

  updateRay(controller) {
    this.rayMesh?.dispose();
    this.rayMesh = null;
    if (!this.showRay) return;
    const p = controller.localPosition;
    this.rayMesh = MeshBuilder.CreateLines('debug-ray', {
      points: [new Vector3(p.x, p.y + 1.6, p.z), new Vector3(p.x, p.y + 0.03, p.z)]
    }, this.scene);
    this.rayMesh.color.set(1, 0.3, 0.18);
  }

  dispose() {
    this.normalsMesh?.dispose();
    this.rayMesh?.dispose();
  }
}
