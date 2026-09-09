import { AnimationGroup } from '@babylonjs/core';
import { MAX_SPEED, directionalWeights, gaitWeights } from './locomotion';

type Gait = 'idle' | 'walk' | 'jog' | 'run';
type DirectionalKey = 'back' | 'left' | 'right' | 'pivotLeft' | 'pivotRight';
export type MotionMode = Gait | 'back' | 'strafe' | 'pivot';
export type MotionBlendState = { gait: Gait; mode: MotionMode; directionalWeight: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const normalizeClipName = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');

export class LocomotionMixer {
  private clips = new Map<Gait, AnimationGroup>();
  private directional = new Map<DirectionalKey, AnimationGroup>();
  readonly directionalClipCount: number;

  constructor(groups: AnimationGroup[]) {
    const normalized = groups.map((group) => ({ group, name: normalizeClipName(group.name) }));
    const resolve = (name: string) => normalized.find((entry) => entry.name === name)?.group
      || normalized.find((entry) => entry.name.endsWith(name))?.group;

    const idle = resolve('idle') || groups[0];
    const walk = resolve('walk') || idle;
    const jog = resolve('jog') || walk;
    const run = resolve('run') || jog;
    if (!idle) throw new Error('Blender GLB не содержит Idle animation action.');
    this.clips.set('idle', idle);
    this.clips.set('walk', walk);
    this.clips.set('jog', jog);
    this.clips.set('run', run);

    const optional: Array<[DirectionalKey, string]> = [
      ['back', 'walkback'],
      ['left', 'strafeleft'],
      ['right', 'straferight'],
      ['pivotLeft', 'pivotleft'],
      ['pivotRight', 'pivotright']
    ];
    for (const [key, name] of optional) {
      const clip = resolve(name);
      if (clip) this.directional.set(key, clip);
    }
    this.directionalClipCount = this.directional.size;

    const all = new Set<AnimationGroup>([...this.clips.values(), ...this.directional.values()]);
    for (const group of all) {
      for (const target of group.targetedAnimations) {
        target.animation.enableBlending = true;
        target.animation.blendingSpeed = 0.1;
      }
      group.start(true, 1, group.from, group.to, false);
      group.setWeightForAllAnimatables(0);
    }
    idle.setWeightForAllAnimatables(1);
  }

  private syncLocomotionPhase(speed: number): void {
    const runT = clamp(speed / MAX_SPEED, 0, 1);
    const targetCycleSeconds = 0.98 - runT * 0.40;
    for (const gait of ['walk', 'jog', 'run'] as const) {
      const clip = this.clips.get(gait);
      if (!clip) continue;
      const authoredSeconds = Math.max(1, clip.to - clip.from) / 30;
      clip.speedRatio = clamp(authoredSeconds / targetCycleSeconds, 0.72, 1.72);
    }

    const directionalCycle = 1.02 - clamp(speed / 3.25, 0, 1) * 0.22;
    for (const key of ['back', 'left', 'right'] as const) {
      const clip = this.directional.get(key);
      if (!clip) continue;
      const authoredSeconds = Math.max(1, clip.to - clip.from) / 30;
      clip.speedRatio = clamp(authoredSeconds / directionalCycle, 0.78, 1.45);
    }
    for (const key of ['pivotLeft', 'pivotRight'] as const) {
      const clip = this.directional.get(key);
      if (clip) clip.speedRatio = 1.05;
    }
  }

  update(
    speed: number,
    intent: { localForward: number; localRight: number; turnError: number }
  ): MotionBlendState {
    const baseWeights = gaitWeights(speed);
    const direction = directionalWeights(intent.localForward, intent.localRight, speed, intent.turnError);
    const totals = new Map<AnimationGroup, number>();
    const add = (clip: AnimationGroup | undefined, weight: number) => {
      if (!clip || weight <= 0) return;
      totals.set(clip, (totals.get(clip) || 0) + weight);
    };

    (Object.keys(baseWeights) as Gait[]).forEach((gait) => {
      add(this.clips.get(gait), baseWeights[gait] * direction.forward);
    });
    add(this.directional.get('back') || this.clips.get('walk'), direction.back);
    add(this.directional.get('left') || this.clips.get('walk'), direction.left);
    add(this.directional.get('right') || this.clips.get('walk'), direction.right);
    add(this.directional.get('pivotLeft') || this.clips.get('idle'), direction.pivotLeft);
    add(this.directional.get('pivotRight') || this.clips.get('idle'), direction.pivotRight);

    const all = new Set<AnimationGroup>([...this.clips.values(), ...this.directional.values()]);
    for (const clip of all) clip.setWeightForAllAnimatables(clamp(totals.get(clip) || 0, 0, 1));
    this.syncLocomotionPhase(speed);

    const gait: Gait = speed < 0.2 ? 'idle' : speed < 2.2 ? 'walk' : speed < 3.8 ? 'jog' : 'run';
    const pivot = direction.pivotLeft + direction.pivotRight;
    const strafe = direction.left + direction.right;
    let mode: MotionMode = gait;
    if (pivot > 0.34) mode = 'pivot';
    else if (direction.back > 0.42) mode = 'back';
    else if (strafe > 0.42) mode = 'strafe';

    return {
      gait,
      mode,
      directionalWeight: clamp(1 - direction.forward, 0, 1)
    };
  }
}
