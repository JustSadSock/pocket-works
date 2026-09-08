import { AnimationGroup } from '@babylonjs/core';
import { MAX_SPEED, gaitWeights } from './locomotion';

type Gait = 'idle' | 'walk' | 'jog' | 'run';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const normalizeClipName = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');

export class LocomotionMixer {
  private clips = new Map<Gait, AnimationGroup>();

  constructor(groups: AnimationGroup[]) {
    const exact = (name: Gait) => groups.find((group) => normalizeClipName(group.name) === name);
    const idle = exact('idle') || groups[0];
    const walk = exact('walk') || idle;
    const jog = exact('jog') || walk;
    const run = exact('run') || jog;
    if (!idle) throw new Error('Blender GLB не содержит Idle animation action.');
    this.clips.set('idle', idle);
    this.clips.set('walk', walk);
    this.clips.set('jog', jog);
    this.clips.set('run', run);

    for (const group of new Set(this.clips.values())) {
      for (const target of group.targetedAnimations) {
        target.animation.enableBlending = true;
        target.animation.blendingSpeed = 0.085;
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
  }

  update(speed: number): Gait {
    const weights = gaitWeights(speed);
    const totals = new Map<AnimationGroup, number>();
    (Object.keys(weights) as Gait[]).forEach((gait) => {
      const clip = this.clips.get(gait);
      if (clip) totals.set(clip, (totals.get(clip) || 0) + weights[gait]);
    });
    totals.forEach((weight, clip) => clip.setWeightForAllAnimatables(clamp(weight, 0, 1)));
    this.syncLocomotionPhase(speed);

    if (speed < 0.2) return 'idle';
    if (speed < 2.2) return 'walk';
    if (speed < 3.8) return 'jog';
    return 'run';
  }
}
