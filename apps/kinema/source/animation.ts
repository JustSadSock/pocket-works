import { AnimationGroup } from '@babylonjs/core';
import { gaitWeights } from './locomotion';

type Gait = 'idle' | 'walk' | 'jog' | 'run';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class LocomotionMixer {
  private clips = new Map<Gait, AnimationGroup>();

  constructor(groups: AnimationGroup[]) {
    const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const find = (name: Gait) => groups.find((group) => key(group.name).includes(name));
    const idle = find('idle') || groups[0];
    const walk = find('walk') || idle;
    const jog = find('jog') || walk;
    const run = find('run') || jog;
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

  update(speed: number): Gait {
    const weights = gaitWeights(speed);
    const totals = new Map<AnimationGroup, number>();
    (Object.keys(weights) as Gait[]).forEach((gait) => {
      const clip = this.clips.get(gait);
      if (clip) totals.set(clip, (totals.get(clip) || 0) + weights[gait]);
    });
    totals.forEach((weight, clip) => clip.setWeightForAllAnimatables(clamp(weight, 0, 1)));
    const walk = this.clips.get('walk');
    const jog = this.clips.get('jog');
    const run = this.clips.get('run');
    if (walk) walk.speedRatio = clamp(0.82 + speed / 5.0, 0.84, 1.32);
    if (jog) jog.speedRatio = clamp(0.9 + speed / 6.5, 0.95, 1.4);
    if (run) run.speedRatio = clamp(0.94 + speed / 7.4, 1.0, 1.56);
    if (speed < 0.2) return 'idle';
    if (speed < 2.2) return 'walk';
    if (speed < 3.8) return 'jog';
    return 'run';
  }
}
