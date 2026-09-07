import { Vector3 } from '@babylonjs/core';
import { clamp, pointSegmentDistanceSquared, weaponDamage } from './core.js';

function lerpVector(a, b, t) {
  return Vector3.Lerp(a, b, t);
}

function bladeClosestFactor(point, base, tip) {
  return pointSegmentDistanceSquared(point, base, tip).t;
}

function segmentSegmentDistanceSquared(p1, q1, p2, q2) {
  const d1 = q1.subtract(p1);
  const d2 = q2.subtract(p2);
  const r = p1.subtract(p2);
  const a = Vector3.Dot(d1, d1);
  const e = Vector3.Dot(d2, d2);
  const f = Vector3.Dot(d2, r);
  let s;
  let t;

  if (a <= 1e-8 && e <= 1e-8) return { distanceSquared: Vector3.DistanceSquared(p1, p2), s: 0, t: 0 };
  if (a <= 1e-8) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = Vector3.Dot(d1, r);
    if (e <= 1e-8) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = Vector3.Dot(d1, d2);
      const denominator = a * e - b * b;
      s = denominator !== 0 ? clamp((b * f - c * e) / denominator, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = p1.add(d1.scale(s));
  const c2 = p2.add(d2.scale(t));
  return { distanceSquared: Vector3.DistanceSquared(c1, c2), s, t, pointA: c1, pointB: c2 };
}

function swordVelocity(trace, dt) {
  return trace.tip.subtract(trace.prevTip).scale(1 / Math.max(dt, 1 / 240));
}

function sampleCount(trace, dt) {
  const distance = Vector3.Distance(trace.prevTip, trace.tip);
  const dynamic = Math.ceil(distance / 0.16);
  return clamp(Math.max(2, dynamic), 2, 9);
}

function translateShield(warrior, delta) {
  warrior.leftHand.position.addInPlace(delta);
  warrior.shield.center.addInPlace(delta);
  warrior.meshes.shield.position.addInPlace(delta);
  warrior.meshes.shieldRim.position.addInPlace(delta);
  warrior.meshes.shieldBoss.position.addInPlace(delta);
}

function shieldBodyContact(shield, defender) {
  let best = null;
  const normal = shield.normal.normalizeToNew();
  for (const sphere of defender.getHitSpheres()) {
    const delta = sphere.center.subtract(shield.center);
    const signed = Vector3.Dot(delta, normal);
    const planar = delta.subtract(normal.scale(signed));
    const radialLimit = shield.radius + sphere.radius * 0.46;
    const planeLimit = sphere.radius + 0.085;
    if (planar.length() > radialLimit || Math.abs(signed) >= planeLimit) continue;
    const penetration = planeLimit - Math.abs(signed);
    if (!best || penetration > best.penetration) {
      best = {
        sphere,
        penetration,
        point: sphere.center.subtract(normal.scale(signed)),
        normal: signed >= 0 ? normal : normal.scale(-1)
      };
    }
  }
  return best;
}

function intersectsShield(trace, shield, dt) {
  const steps = sampleCount(trace, dt);
  let best = null;
  for (let i = 0; i <= steps; i += 1) {
    const tFrame = i / steps;
    const base = lerpVector(trace.prevBase, trace.base, tFrame);
    const tip = lerpVector(trace.prevTip, trace.tip, tFrame);
    const center = lerpVector(shield.prevCenter, shield.center, tFrame);
    const normal = lerpVector(shield.prevNormal, shield.normal, tFrame).normalize();
    const d0 = Vector3.Dot(base.subtract(center), normal);
    const d1 = Vector3.Dot(tip.subtract(center), normal);
    const thickness = 0.07;
    if (Math.min(Math.abs(d0), Math.abs(d1)) > thickness && d0 * d1 > 0) continue;
    const denominator = d0 - d1;
    const bladeT = Math.abs(denominator) > 1e-6 ? clamp(d0 / denominator, 0, 1) : (Math.abs(d0) < Math.abs(d1) ? 0 : 1);
    const point = Vector3.Lerp(base, tip, bladeT);
    const radial = point.subtract(center);
    const planar = radial.subtract(normal.scale(Vector3.Dot(radial, normal)));
    const distance = planar.length();
    if (distance <= shield.radius + 0.045) {
      best = { point, normal, frameT: tFrame, bladeT, distance };
      break;
    }
  }
  return best;
}

function intersectsBody(trace, defender, dt) {
  const steps = sampleCount(trace, dt);
  let best = null;
  const spheres = defender.getHitSpheres();
  for (let i = 0; i <= steps; i += 1) {
    const tFrame = i / steps;
    const base = lerpVector(trace.prevBase, trace.base, tFrame);
    const tip = lerpVector(trace.prevTip, trace.tip, tFrame);
    for (const sphere of spheres) {
      const result = pointSegmentDistanceSquared(sphere.center, base, tip);
      const radius = sphere.radius + 0.035;
      if (result.distanceSquared <= radius * radius) {
        const point = Vector3.Lerp(base, tip, result.t);
        const candidate = { sphere, point, bladeT: result.t, frameT: tFrame, distanceSquared: result.distanceSquared };
        if (!best || candidate.distanceSquared < best.distanceSquared) best = candidate;
      }
    }
    if (best) break;
  }
  return best;
}

function intersectsSword(traceA, traceB, dt) {
  const steps = Math.max(sampleCount(traceA, dt), sampleCount(traceB, dt));
  for (let i = 0; i <= steps; i += 1) {
    const tFrame = i / steps;
    const a0 = lerpVector(traceA.prevBase, traceA.base, tFrame);
    const a1 = lerpVector(traceA.prevTip, traceA.tip, tFrame);
    const b0 = lerpVector(traceB.prevBase, traceB.base, tFrame);
    const b1 = lerpVector(traceB.prevTip, traceB.tip, tFrame);
    const closest = segmentSegmentDistanceSquared(a0, a1, b0, b1);
    if (closest.distanceSquared < 0.0081) return { ...closest, frameT: tFrame };
  }
  return null;
}

export class CombatSystem {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.cooldowns = new Map();
  }

  key(type, a, b) {
    return `${type}:${a.id}:${b.id}`;
  }

  canContact(type, a, b, now, cooldown) {
    const key = this.key(type, a, b);
    const previous = this.cooldowns.get(key) || -Infinity;
    if (now - previous < cooldown) return false;
    this.cooldowns.set(key, now);
    return true;
  }

  resolveShieldBody(owner, defender, now) {
    const hit = shieldBodyContact(owner.getShieldTrace(), defender);
    if (!hit) return false;

    let separation = defender.position.subtract(owner.position);
    separation.y = 0;
    if (separation.lengthSquared() < 1e-6) separation = hit.normal.clone();
    separation.normalize();
    const correction = clamp(hit.penetration * 0.42 + 0.006, 0.008, 0.075);

    // The shield hand gives first, then both planted bodies share the remaining impulse.
    translateShield(owner, separation.scale(-correction * 0.82));
    owner.leftHand.velocity.addInPlace(separation.scale(-correction * 15));
    owner.position.addInPlace(separation.scale(-correction * 0.34));
    defender.position.addInPlace(separation.scale(correction * 0.28));
    owner.velocity.scaleInPlace(0.76);
    defender.velocity.scaleInPlace(0.8);
    owner.stability = Math.max(0, owner.stability - correction * 48);
    defender.applyBodyImpulse(separation.scale(correction * 20));

    if (this.canContact('shield-body', owner, defender, now, 0.11)) {
      this.onEvent({ type: 'shove', attacker: owner, defender, point: hit.point, intensity: clamp(hit.penetration / 0.22, 0.15, 0.75) });
    }
    return true;
  }

  resolveShieldShield(a, b, now) {
    const shieldA = a.getShieldTrace();
    const shieldB = b.getShieldTrace();
    const delta = shieldB.center.subtract(shieldA.center);
    const distance = delta.length();
    const minimum = (shieldA.radius + shieldB.radius) * 0.78;
    if (distance <= 1e-5 || distance >= minimum) return false;
    const normal = delta.scale(1 / distance);
    const penetration = minimum - distance;
    const correction = clamp(penetration * 0.34, 0.006, 0.06);
    translateShield(a, normal.scale(-correction));
    translateShield(b, normal.scale(correction));
    a.leftHand.velocity.addInPlace(normal.scale(-correction * 13));
    b.leftHand.velocity.addInPlace(normal.scale(correction * 13));
    a.stability = Math.max(0, a.stability - correction * 35);
    b.stability = Math.max(0, b.stability - correction * 35);
    if (this.canContact('shield-shield', a, b, now, 0.13)) {
      this.onEvent({ type: 'shield-clash', a, b, point: Vector3.Lerp(shieldA.center, shieldB.center, 0.5), intensity: clamp(penetration / 0.25, 0.15, 0.7) });
    }
    return true;
  }

  resolvePair(a, b, dt, now) {
    if (a.dead || b.dead) return;

    // Resolve large rigid contacts before blade contacts so shields cannot ghost through
    // bodies or each other while the swords continue to use swept collision.
    this.resolveShieldBody(a, b, now);
    this.resolveShieldBody(b, a, now);
    this.resolveShieldShield(a, b, now);

    const swordA = a.getSwordTrace();
    const swordB = b.getSwordTrace();
    const velocityA = swordVelocity(swordA, dt);
    const velocityB = swordVelocity(swordB, dt);
    const relative = velocityA.subtract(velocityB);

    const clash = intersectsSword(swordA, swordB, dt);
    if (clash && relative.length() > 2.1 && this.canContact('clash', a, b, now, 0.16)) {
      const directionA = velocityA.lengthSquared() > 1e-5 ? velocityA.normalizeToNew() : a.swordDirection.position;
      const directionB = velocityB.lengthSquared() > 1e-5 ? velocityB.normalizeToNew() : b.swordDirection.position;
      const intensity = clamp(relative.length() / 10, 0.2, 1);
      a.applyWeaponImpulse(directionA.scale(-2.5 * intensity));
      b.applyWeaponImpulse(directionB.scale(-2.5 * intensity));
      this.onEvent({ type: 'clash', a, b, point: clash.pointA, intensity });
      return;
    }

    this.resolveAttack(a, b, swordA, velocityA, dt, now);
    this.resolveAttack(b, a, swordB, velocityB, dt, now);
  }

  resolveAttack(attacker, defender, sword, velocity, dt, now) {
    if (attacker.dead || defender.dead) return;
    const speed = velocity.length();
    if (speed < 0.45) return;

    const shieldHit = intersectsShield(sword, defender.getShieldTrace(), dt);
    if (shieldHit && this.canContact('shield', attacker, defender, now, 0.13)) {
      const bladeDirection = velocity.lengthSquared() > 1e-5 ? velocity.normalizeToNew() : sword.tip.subtract(sword.base).normalize();
      const incidence = Math.abs(Vector3.Dot(bladeDirection, shieldHit.normal));
      const intensity = clamp((speed / 9) * (0.55 + incidence * 0.45), 0.15, 1);
      attacker.applyWeaponImpulse(bladeDirection.scale(-3.4 * intensity));
      defender.applyShieldImpulse(bladeDirection.scale(2.3 * intensity));
      this.onEvent({ type: 'block', attacker, defender, point: shieldHit.point, normal: shieldHit.normal, intensity, speed });
      return;
    }

    const bodyHit = intersectsBody(sword, defender, dt);
    if (!bodyHit) return;
    const tipFactor = Math.max(0, bladeClosestFactor(bodyHit.point, sword.base, sword.tip));
    const damage = weaponDamage(speed, tipFactor, bodyHit.sphere.multiplier);
    const direction = velocity.lengthSquared() > 1e-5 ? velocity.normalizeToNew() : sword.tip.subtract(sword.base).normalize();
    if (damage <= 0) {
      if (!this.canContact('graze', attacker, defender, now, 0.08)) return;
      this.onEvent({ type: 'graze', attacker, defender, point: bodyHit.point, intensity: clamp(speed / 5, 0.1, 0.5), speed });
      return;
    }
    if (!this.canContact('body', attacker, defender, now, 0.24)) return;
    const impulse = direction.scale(4.6 + damage * 0.13);
    const applied = defender.takeDamage(damage, impulse);
    attacker.applyWeaponImpulse(direction.scale(-(1.1 + applied * 0.025)));
    this.onEvent({
      type: 'hit', attacker, defender, point: bodyHit.point, bodyPart: bodyHit.sphere.name,
      damage: applied, intensity: clamp(applied / 28, 0.2, 1), speed
    });
  }

  reset() {
    this.cooldowns.clear();
  }
}
