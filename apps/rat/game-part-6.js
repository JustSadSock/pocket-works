function drawBattle(sim, ctx, canvas, demo = false) {
  const metrics = resizeCanvas(canvas, ctx, WORLD.width, WORLD.height);
  sim.metrics = metrics;
  ctx.save();
  if (!demo && sim.cameraKick > .02 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ctx.translate(rand(-sim.cameraKick, sim.cameraKick) * 4, rand(-sim.cameraKick, sim.cameraKick) * 3);
  }
  drawGround(ctx, sim);
  drawObjectives(ctx, sim, demo);
  const renderables = [];
  sim.units.forEach((unit) => renderables.push({ y: unit.y, kind: 'unit', value: unit }));
  sim.projectiles.forEach((arrow) => renderables.push({ y: arrow.y, kind: 'arrow', value: arrow }));
  renderables.sort((a, b) => a.y - b.y);
  for (const item of renderables) {
    if (item.kind === 'unit') drawUnit(ctx, item.value, sim.time, demo);
    else drawArrow(ctx, item.value);
  }
  sim.regiments.forEach((regiment) => drawBanner(ctx, regiment, sim.time, demo));
  sim.particles.forEach((particle) => drawParticle(ctx, particle));
  ctx.restore();
  return metrics;
}

function drawGround(ctx, sim) {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  gradient.addColorStop(0, '#677661');
  gradient.addColorStop(.5, '#879174');
  gradient.addColorStop(1, '#69745f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  ctx.fillStyle = 'rgba(35,49,39,.08)';
  ctx.fillRect(0, 0, WORLD.width, 90);
  ctx.fillRect(0, WORLD.height - 90, WORLD.width, 90);

  for (const mark of sim.terrain) {
    ctx.fillStyle = `rgba(31,47,36,${mark.a})`;
    ctx.beginPath();
    ctx.ellipse(mark.x, mark.y, mark.r * 1.8, mark.r, .4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(240,231,202,.07)';
  ctx.lineWidth = 1;
  for (let y = 150; y < WORLD.height; y += 145) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(260, y + 18, 640, y - 18, 900, y + 4);
    ctx.stroke();
  }
}

function drawObjectives(ctx, sim, demo) {
  if (demo) return;
  sim.teamRegiments(0).forEach((regiment) => {
    if (!regiment.manualObjective || commandMode === 'observe') return;
    const selected = regiment === selectedRegiment;
    ctx.save();
    ctx.translate(regiment.manualObjective.x, regiment.manualObjective.y);
    ctx.strokeStyle = selected ? 'rgba(247,220,145,.95)' : 'rgba(247,220,145,.48)';
    ctx.lineWidth = selected ? 4 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, selected ? 22 : 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, -28);
    ctx.lineTo(22, -20);
    ctx.lineTo(0, -12);
    ctx.stroke();
    ctx.restore();
  });
}

function perspectiveScale(y) {
  return .76 + clamp(y / WORLD.height, 0, 1) * .34;
}

function drawUnit(ctx, unit, time, demo) {
  if (unit.dead && unit.deathTime > 12) return;
  const scale = perspectiveScale(unit.y);
  const teamColor = unit.team === 0 ? '#c66a3f' : '#405c73';
  const dark = unit.team === 0 ? '#6f3326' : '#233848';
  const alpha = unit.dead ? clamp(1 - unit.deathTime / 12, .16, .72) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(unit.x, unit.y);
  ctx.rotate(unit.dead ? unit.facing + Math.PI / 2 : 0);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(26,34,29,.24)';
  ctx.beginPath();
  ctx.ellipse(0, 7, unit.dead ? 13 : 8, unit.dead ? 4 : 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const walk = unit.dead ? 0 : Math.sin(time * 10 + unit.seed) * clamp(Math.hypot(unit.vx, unit.vy) / 60, 0, 1);
  ctx.rotate(unit.dead ? 0 : unit.facing + Math.PI / 2);

  if (!unit.dead) {
    ctx.strokeStyle = '#2c3029';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 7);
    ctx.lineTo(-4 + walk * 2.4, 15);
    ctx.moveTo(2, 7);
    ctx.lineTo(4 - walk * 2.4, 15);
    ctx.stroke();
  }

  ctx.fillStyle = unit.hitFlash > 0 ? '#f6e2b2' : teamColor;
  ctx.beginPath();
  ctx.roundRect(-5.5, -6, 11, 16, 3);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.fillRect(-5.5, 4, 11, 4);

  ctx.fillStyle = '#d7b88d';
  ctx.beginPath();
  ctx.arc(0, -10, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -11, 5, Math.PI, Math.PI * 2);
  ctx.fill();

  if (unit.type === 'swords') drawSwordUnit(ctx, unit);
  else if (unit.type === 'spears') drawSpearUnit(ctx, unit);
  else drawArcherUnit(ctx, unit);

  ctx.restore();
}

