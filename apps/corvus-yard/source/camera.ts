import { FreeCamera, Scene, Vector3 } from '@babylonjs/core';
import type { CrowState } from './flight';

type Collider = { min: Vector3; max: Vector3 };
const response = (rate: number, dt: number) => 1 - Math.exp(-rate * Math.min(0.1, Math.max(0, dt)));

/** Horizon-stable chase camera: speed widens the view rather than shaking it. */
export class CrowCamera {
  readonly camera: FreeCamera;
  private target = Vector3.Zero();
  private heading = new Vector3(0, 0, 1);
  private distance = 2.8;
  private initialized = false;

  constructor(scene: Scene, private canvas: HTMLCanvasElement) {
    this.camera = new FreeCamera('crow-chase', new Vector3(0, 3, -6), scene);
    this.camera.minZ = 0.09;
    this.camera.maxZ = 240;
    this.camera.fov = 1.08;
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
  }

  reset(state: CrowState) {
    this.heading.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    this.distance = state.grounded ? 2.8 : 4.2;
    this.target.copyFromFloats(state.position.x, state.position.y, state.position.z).addInPlace(new Vector3(0, 0.65, 0)).addInPlace(this.heading.scale(1.1));
    this.camera.position.copyFromFloats(state.position.x, state.position.y, state.position.z).subtractInPlace(this.heading.scale(this.distance));
    this.camera.position.y = Math.max(0.5, state.position.y + .70);
    this.camera.fov = 1.08;
    this.camera.setTarget(this.target);
    this.initialized = true;
  }

  update(state: CrowState, dt: number, colliders: Collider[] = []) {
    if (!this.initialized) this.reset(state);
    const position = new Vector3(state.position.x, state.position.y, state.position.z);
    const speed = Math.max(0, state.speed);
    const speedN = Math.min(1, speed / 21);
    const forward = new Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    // Heading follows the body's intention, with only a small contribution from lateral momentum.
    const velocityXZ = new Vector3(state.velocity.x, 0, state.velocity.z);
    if (velocityXZ.lengthSquared() > 5 && !state.grounded) {
      velocityXZ.normalize();
      forward.scaleInPlace(0.86).addInPlace(velocityXZ.scale(0.14)).normalize();
    }
    this.heading = Vector3.Lerp(this.heading, forward, response(state.grounded ? 5.8 : 4.6, dt));
    if (this.heading.lengthSquared() < 0.01) this.heading.copyFrom(forward);
    this.heading.normalize();
    this.distance += ((state.grounded ? 2.8 : 4.2 + speedN * 0.7) - this.distance) * response(3.8, dt);
    const portrait = this.canvas.clientHeight > this.canvas.clientWidth;
    const targetHeight = portrait ? 0.34 : 0.30;
    const lookahead = state.grounded ? 0.60 : 1.3 + speedN * 0.8;
    const desiredTarget = position.add(new Vector3(0, targetHeight, 0)).add(this.heading.scale(lookahead));
    // Vertical look-ahead is small enough that diving never points the entire view at the ground.
    desiredTarget.y += Math.max(-0.65, Math.min(0.65, state.velocity.y * 0.04));
    this.target = Vector3.Lerp(this.target, desiredTarget, response(7.5, dt));
    const anchor = position.add(new Vector3(0, 0.65, 0));
    let desired = position.subtract(this.heading.scale(this.distance));
    desired.y += .70 + speedN * 0.3;
    desired = this.avoidObstacles(anchor, desired, colliders);
    // Enter tight spaces promptly, emerge gradually so walls do not whip the camera around.
    const blocked = Vector3.DistanceSquared(anchor, desired) < this.distance * this.distance * 0.65;
    this.camera.position = Vector3.Lerp(this.camera.position, desired, response(blocked ? 14 : 5.4, dt));
    this.camera.position.copyFrom(this.avoidObstacles(anchor, this.camera.position, colliders));
    this.camera.position.y = Math.max(0.42, this.camera.position.y);
    this.camera.fov += (1.08 + speedN * 0.13 - this.camera.fov) * response(2.5, dt);
    this.camera.setTarget(this.target);
  }

  preview(state:CrowState,time:number,dt:number){
    if(!this.initialized)this.reset(state);
    const angle=2.3+Math.sin(time*.12)*.14;
    const desired=new Vector3(state.position.x+Math.sin(angle)*2.75,state.position.y+.12,state.position.z-Math.cos(angle)*2.75);
    this.camera.position.copyFrom(desired);
    this.target.set(state.position.x,state.position.y-.48,state.position.z);
    this.camera.fov=.90;this.camera.setTarget(this.target);
  }
  private avoidObstacles(anchor: Vector3, desired: Vector3, colliders: Collider[]) {
    const delta = desired.subtract(anchor);
    let nearest = 1;
    for (const box of colliders) {
      let enter = 0;
      let exit = 1;
      let valid = true;
      let inside = true;
      for (const axis of ['x', 'y', 'z'] as const) {
        const min = box.min[axis] - 0.18;
        const max = box.max[axis] + 0.18;
        const origin = anchor[axis];
        if (origin < min || origin > max) inside = false;
        if (Math.abs(delta[axis]) < 1e-7) {
          if (origin < min || origin > max) { valid = false; break; }
        } else {
          const first = (min - origin) / delta[axis];
          const second = (max - origin) / delta[axis];
          enter = Math.max(enter, Math.min(first, second));
          exit = Math.min(exit, Math.max(first, second));
          if (enter > exit) { valid = false; break; }
        }
      }
      // The support itself may contain the anchor while the crow is perched on its edge.
      if (valid && !inside && enter >= 0 && enter < nearest) nearest = Math.max(0.07, enter - 0.035);
    }
    const result = anchor.add(delta.scale(nearest));
    result.y = Math.max(0.42, result.y);
    return result;
  }
  dispose() { this.camera.dispose(); }
}
