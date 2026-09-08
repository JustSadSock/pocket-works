import { Vector3 } from '@babylonjs/core';
import { clamp } from './core.js';

function frame(yaw) {
  return {
    forward: new Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
    right: new Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  };
}

function installForWarrior(warrior) {
  const originalWeapon = warrior.applyWeaponImpulse.bind(warrior);
  const originalShield = warrior.applyShieldImpulse.bind(warrior);
  const originalBody = warrior.applyBodyImpulse.bind(warrior);
  let lastLoad = 0;

  const transmit = (impulse, side, gain) => {
    const f = frame(warrior.upperYaw);
    const lateral = Vector3.Dot(impulse, f.right);
    const forward = Vector3.Dot(impulse, f.forward);
    const vertical = impulse.y;
    const magnitude = impulse.length();
    lastLoad = Math.max(lastLoad * .72, magnitude);

    // Shoulder torque: lateral contact twists the chest; forward pressure rolls
    // the corresponding shoulder back. Values are intentionally small and
    // critically damped by the existing upperYaw spring on the following tick.
    warrior.upperYawState.velocity += clamp((lateral * .020 - forward * side * .011) * gain, -.19, .19);
    warrior.bodyYawState.velocity += clamp(lateral * .0045 * gain, -.045, .045);

    const lean = f.right.scale(clamp(-lateral * .012 * gain, -.055, .055))
      .add(f.forward.scale(clamp(-forward * .009 * gain, -.045, .045)))
      .add(new Vector3(0, clamp(vertical * .005 * gain, -.020, .020), 0));
    warrior.impactLeanVelocity.addInPlace(lean);
    warrior.velocity.addInPlace(f.right.scale(clamp(-lateral * .0032 * gain, -.020, .020)));
  };

  warrior.applyWeaponImpulse = (impulse) => {
    originalWeapon(impulse);
    transmit(impulse, 1, .86);
  };
  warrior.applyShieldImpulse = (impulse) => {
    originalShield(impulse);
    transmit(impulse, -1, 1.08);
  };
  warrior.applyBodyImpulse = (impulse) => {
    originalBody(impulse);
    transmit(impulse, 0, .72);
  };

  return {
    tick(dt) { lastLoad *= Math.exp(-7.5 * dt); },
    get load() { return lastLoad; }
  };
}

export function installTorsoCoupling(game) {
  const player = installForWarrior(game.player);
  const enemy = installForWarrior(game.enemy);
  const originalUpdate = game.update.bind(game);
  game.update = (dt, now) => {
    originalUpdate(dt, now);
    player.tick(dt);
    enemy.tick(dt);
    game.player.torsoLoad = player.load;
    game.enemy.torsoLoad = enemy.load;
  };
  return { player, enemy };
}
