class Simulation {
  constructor(playerSetup, enemySetup, demo = false) {
    this.demo = demo;
    this.regiments = [];
    playerSetup.forEach((config, index) => this.regiments.push(new Regiment(config, 0, index)));
    enemySetup.forEach((config, index) => this.regiments.push(new Regiment(config, 1, index)));
    this.units = this.regiments.flatMap((regiment) => regiment.units);
    this.projectiles = [];
    this.particles = [];
    this.time = 0;
    this.finished = false;
    this.winner = null;
    this.aiTimer = 0;
    this.orderCount = 0;
    this.cameraKick = 0;
    this.metrics = null;
    this.lastClash = 0;
    this.terrain = Array.from({ length: 34 }, () => ({ x: rand(20, 880), y: rand(30, 1150), r: rand(2, 8), a: rand(.03, .11) }));
  }
  teamRegiments(team) { return this.regiments.filter((regiment) => regiment.team === team); }
  teamUnits(team) { return this.units.filter((unit) => unit.team === team && !unit.dead && !unit.retreating); }
  teamStanding(team) { return this.units.filter((unit) => unit.team === team && !unit.dead).length; }
  teamActive(team) { return this.units.filter((unit) => unit.team === team && !unit.dead && !unit.retreating).length; }
  issueOrder(regiment, point) {
    regiment.manualObjective = { x: clamp(point.x, 70, 830), y: clamp(point.y, 90, 1090) };
    regiment.routed = false;
    regiment.morale = Math.max(regiment.morale, .28);
    this.orderCount++;
    this.spawnPulse(regiment.manualObjective.x, regiment.manualObjective.y, 0);
  }
  spawnPulse(x, y, team) {
    for (let i = 0; i < 12; i++) {
      this.particles.push({ x, y, vx: Math.cos(i / 12 * Math.PI * 2) * 55, vy: Math.sin(i / 12 * Math.PI * 2) * 55, life: .5, max: .5, team, kind: 'signal' });
    }
  }
  update(dt) {
    if (this.finished) return;
    const scaled = dt * Number(persistent.settings.speed || 1);
    this.time += scaled;
    this.aiTimer -= scaled;
    this.cameraKick *= Math.pow(.1, scaled);
    if (this.aiTimer <= 0) {
      this.aiTimer = persistent.settings.difficulty === 'hard' ? 2.5 : persistent.settings.difficulty === 'soft' ? 5.4 : 3.8;
      this.updateAI();
    }

    for (const regiment of this.regiments) this.updateRegiment(regiment, scaled);
    for (const unit of this.units) this.updateUnit(unit, scaled);
    this.resolveCrowding(scaled);
    this.updateProjectiles(scaled);
    this.updateParticles(scaled);
    this.checkVictory();
  }
  updateAI() {
    const enemyRegs = this.teamRegiments(1).filter((r) => r.activeCount() > 0);
    const playerRegs = this.teamRegiments(0).filter((r) => r.activeCount() > 0);
    if (!enemyRegs.length || !playerRegs.length) return;
    for (const regiment of enemyRegs) {
      const center = regiment.center();
      let best = null;
      let bestScore = Infinity;
      for (const target of playerRegs) {
        const targetCenter = target.center();
        const score = dist(center, targetCenter) / matchupMultiplier(regiment.type, target.type) + rand(-45, 45);
        if (score < bestScore) { bestScore = score; best = target; }
      }
      regiment.targetRegiment = best;
      const aim = best.center();
      const flank = persistent.settings.difficulty === 'hard' && Math.random() < .28 ? (center.x < 450 ? -75 : 75) : 0;
      regiment.objective = { x: clamp(aim.x + flank, 80, 820), y: clamp(aim.y - 18, 100, 1080) };
    }
  }
  updateRegiment(regiment, dt) {
    const alive = regiment.aliveUnits();
    if (!alive.length) return;
    const center = regiment.center();
    regiment.x = center.x;
    regiment.y = center.y;
    const casualties = 1 - regiment.totalStanding() / regiment.units.length;
    const pressure = this.countNearbyEnemies(center, regiment.team, 110) / Math.max(6, alive.length);
    regiment.casualtyShock = Math.max(0, regiment.casualtyShock - dt * .42);
    regiment.morale = clamp(1 - casualties * .76 - pressure * .06 - regiment.casualtyShock, 0, 1);
    if (casualties > .52 && regiment.morale < .08 && regiment.activeCount() > 0) {
      regiment.routed = true;
      alive.forEach((unit) => { unit.retreating = true; });
      this.spawnDust(center.x, center.y, 14, regiment.team);
    }

    if (regiment.team === 0) {
      if (commandMode === 'observe') regiment.manualObjective = null;
      if (!regiment.manualObjective) {
        const target = this.pickTargetRegiment(regiment);
        if (target) regiment.objective = target.center();
      } else regiment.objective = regiment.manualObjective;
    } else if (!regiment.targetRegiment || regiment.targetRegiment.activeCount() === 0) {
      regiment.targetRegiment = this.pickTargetRegiment(regiment);
      if (regiment.targetRegiment) regiment.objective = regiment.targetRegiment.center();
    }
  }
  pickTargetRegiment(regiment) {
    const enemies = this.teamRegiments(1 - regiment.team).filter((target) => target.activeCount() > 0);
    if (!enemies.length) return null;
    const center = regiment.center();
    return enemies.sort((a, b) => {
      const scoreA = dist(center, a.center()) / matchupMultiplier(regiment.type, a.type);
      const scoreB = dist(center, b.center()) / matchupMultiplier(regiment.type, b.type);
      return scoreA - scoreB;
    })[0];
  }
  countNearbyEnemies(point, team, radius) {
    const radiusSq = radius * radius;
    let count = 0;
    for (const unit of this.units) {
      if (unit.team === team || unit.dead || unit.retreating) continue;
      const dx = unit.x - point.x;
      const dy = unit.y - point.y;
      if (dx * dx + dy * dy < radiusSq) count++;
    }
    return count;
  }
  findNearestEnemy(unit, maxRange = Infinity) {
    let nearest = null;
    let best = maxRange * maxRange;
    for (const other of this.units) {
      if (other.team === unit.team || other.dead || other.retreating) continue;
      const dx = other.x - unit.x;
      const dy = other.y - unit.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; nearest = other; }
    }
    return nearest;
  }
  updateUnit(unit, dt) {
    if (unit.dead) {
      unit.deathTime += dt;
      return;
    }
    unit.cooldown -= dt;
    unit.attackAnim = Math.max(0, unit.attackAnim - dt * 4.8);
    unit.hitFlash = Math.max(0, unit.hitFlash - dt * 5);
    unit.retarget -= dt;

    if (unit.retreating) {
      const exitY = unit.team === 0 ? 1220 : -40;
      this.moveUnit(unit, { x: clamp(unit.x + Math.sin(unit.seed + this.time) * 45, 30, 870), y: exitY }, dt, 1.22);
      if (unit.y < -30 || unit.y > 1210) unit.dead = true;
      return;
    }

    if (unit.retarget <= 0 || !unit.target || unit.target.dead || unit.target.retreating) {
      unit.retarget = rand(.14, .34);
      unit.target = this.findNearestEnemy(unit, unit.type === 'archers' ? 320 : 170);
    }

    const target = unit.target;
    const objective = unit.regiment.objective;
    const targetDistance = target ? dist(unit, target) : Infinity;
    const data = TYPE_DATA[unit.type];

    if (unit.type === 'archers') {
      if (target && targetDistance <= data.range && targetDistance > 72) {
        unit.facing = Math.atan2(target.y - unit.y, target.x - unit.x);
        if (unit.cooldown <= 0) this.fireArrow(unit, target);
        const threat = this.countNearbyEnemies(unit, unit.team, 62);
        if (threat > 0) {
          const away = { x: unit.x - Math.cos(unit.facing) * 70, y: unit.y - Math.sin(unit.facing) * 70 };
          this.moveUnit(unit, away, dt, 1.08);
        } else {
          this.applyFormationPull(unit, dt, .38);
          unit.vx *= Math.pow(.09, dt);
          unit.vy *= Math.pow(.09, dt);
          unit.x += unit.vx * dt;
          unit.y += unit.vy * dt;
        }
      } else {
        this.moveUnit(unit, objective, dt, 1);
      }
    } else if (target && targetDistance <= data.range + 6) {
      unit.facing = Math.atan2(target.y - unit.y, target.x - unit.x);
      unit.vx *= Math.pow(.04, dt);
      unit.vy *= Math.pow(.04, dt);
      if (unit.cooldown <= 0) this.meleeAttack(unit, target);
    } else if (target && targetDistance < 145) {
      this.moveUnit(unit, target, dt, 1.1);
    } else {
      this.moveUnit(unit, objective, dt, 1);
      this.applyFormationPull(unit, dt, .5);
    }

    unit.x = clamp(unit.x, 15, 885);
    unit.y = clamp(unit.y, -45, 1225);
  }
  moveUnit(unit, target, dt, speedFactor) {
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = unit.speed * speedFactor;
    const desiredX = dx / d * speed;
    const desiredY = dy / d * speed;
    unit.vx = lerp(unit.vx, desiredX, 1 - Math.pow(.008, dt));
    unit.vy = lerp(unit.vy, desiredY, 1 - Math.pow(.008, dt));
    unit.x += unit.vx * dt;
    unit.y += unit.vy * dt;
    if (Math.abs(unit.vx) + Math.abs(unit.vy) > 4) unit.facing = Math.atan2(unit.vy, unit.vx);
  }
  applyFormationPull(unit, dt, strength) {
    const regiment = unit.regiment;
    const facing = regiment.team === 0 ? -1 : 1;
    const desired = { x: regiment.x + unit.offset.x, y: regiment.y + unit.offset.y * facing };
    unit.vx += (desired.x - unit.x) * dt * strength;
    unit.vy += (desired.y - unit.y) * dt * strength;
  }
  meleeAttack(attacker, defender) {
    const data = TYPE_DATA[attacker.type];
    attacker.cooldown = attacker.type === 'spears' ? rand(.96, 1.18) : rand(.78, .98);
    attacker.attackAnim = 1;
    const damage = data.damage * matchupMultiplier(attacker.type, defender.type) * rand(.82, 1.16);
    this.damageUnit(defender, damage, attacker);
    if (!this.demo && Math.random() < .12) audio.hit();
  }
  fireArrow(attacker, target) {
    attacker.cooldown = rand(1.42, 1.82);
    attacker.attackAnim = 1;
    const travel = dist(attacker, target) / 410;
    this.projectiles.push({
      x: attacker.x, y: attacker.y - 8,
      tx: target.x, ty: target.y,
      vx: (target.x - attacker.x) / travel,
      vy: (target.y - attacker.y) / travel,
      life: travel, max: travel,
      team: attacker.team,
      attacker, target,
      damage: TYPE_DATA.archers.damage * matchupMultiplier('archers', target.type) * rand(.78, 1.18)
    });
    if (!this.demo && Math.random() < .14) audio.arrow();
  }
  damageUnit(unit, damage, attacker) {
    unit.hp -= damage;
    unit.hitFlash = 1;
    unit.regiment.casualtyShock = Math.min(.16, unit.regiment.casualtyShock + .008);
    const angle = Math.atan2(unit.y - attacker.y, unit.x - attacker.x);
    unit.vx += Math.cos(angle) * 42;
    unit.vy += Math.sin(angle) * 42;
    this.spawnDust(unit.x, unit.y, 2, unit.team);
    if (unit.hp <= 0) {
      unit.dead = true;
      unit.deathTime = 0;
      unit.regiment.casualtyShock = Math.min(.22, unit.regiment.casualtyShock + .018);
      this.cameraKick = Math.max(this.cameraKick, .7);
      this.spawnDust(unit.x, unit.y, 5, unit.team);
    }
  }
  resolveCrowding(dt) {
    const active = this.units.filter((unit) => !unit.dead && !unit.retreating);
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = a.team === b.team ? 12 : 9;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * .5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push * dt * 8;
          a.y -= ny * push * dt * 8;
          b.x += nx * push * dt * 8;
          b.y += ny * push * dt * 8;
        }
      }
    }
  }
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const arrow = this.projectiles[i];
      arrow.life -= dt;
      arrow.x += arrow.vx * dt;
      arrow.y += arrow.vy * dt;
      if (arrow.life <= 0) {
        if (arrow.target && !arrow.target.dead && dist(arrow, arrow.target) < 34) this.damageUnit(arrow.target, arrow.damage, arrow.attacker);
        else this.spawnDust(arrow.x, arrow.y, 1, arrow.team);
        this.projectiles.splice(i, 1);
      }
    }
  }
  spawnDust(x, y, count, team) {
    for (let i = 0; i < count; i++) {
      this.particles.push({ x: x + rand(-8, 8), y: y + rand(-5, 5), vx: rand(-18, 18), vy: rand(-26, -8), life: rand(.3, .7), max: .7, team, kind: 'dust' });
    }
  }
  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.08, dt);
      particle.vy *= Math.pow(.08, dt);
      if (particle.life <= 0) this.particles.splice(i, 1);
    }
  }
  checkVictory() {
    const player = this.teamActive(0);
    const enemy = this.teamActive(1);
    if (player <= 2 || enemy <= 2 || this.time > 150) {
      this.finished = true;
      if (player === enemy) this.winner = this.teamStanding(0) >= this.teamStanding(1) ? 0 : 1;
      else this.winner = player > enemy ? 0 : 1;
    }
  }
}

