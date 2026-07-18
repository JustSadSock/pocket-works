function drawSwordUnit(ctx, unit) {
  const attack = unit.attackAnim;
  ctx.strokeStyle = '#d7d0ba';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -1);
  ctx.lineTo(12 + attack * 8, -9 - attack * 9);
  ctx.stroke();
  ctx.fillStyle = '#6f6b5c';
  ctx.beginPath();
  ctx.arc(-6, 0, 5.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9c2ac';
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

function drawSpearUnit(ctx, unit) {
  const attack = unit.attackAnim;
  ctx.strokeStyle = '#5d4630';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(18 + attack * 12, -8 - attack * 2);
  ctx.stroke();
  ctx.fillStyle = '#d6d1bd';
  ctx.beginPath();
  ctx.moveTo(18 + attack * 12, -8 - attack * 2);
  ctx.lineTo(13 + attack * 12, -11 - attack * 2);
  ctx.lineTo(14 + attack * 12, -5 - attack * 2);
  ctx.closePath();
  ctx.fill();
}

function drawArcherUnit(ctx, unit) {
  ctx.strokeStyle = '#5c4430';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(5, -1, 8, -1.2, 1.2);
  ctx.stroke();
  ctx.strokeStyle = '#d4cab5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, -8);
  ctx.lineTo(8 - unit.attackAnim * 5, 6);
  ctx.stroke();
}

function drawArrow(ctx, arrow) {
  const angle = Math.atan2(arrow.vy, arrow.vx);
  ctx.save();
  ctx.translate(arrow.x, arrow.y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#473a2c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();
  ctx.fillStyle = '#d8d0bb';
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(3, -2); ctx.lineTo(3, 2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBanner(ctx, regiment, time, demo) {
  const alive = regiment.aliveUnits();
  if (!alive.length) return;
  const center = regiment.center();
  const scale = perspectiveScale(center.y);
  const color = regiment.team === 0 ? '#c66a3f' : '#405c73';
  const edge = regiment.team === 0 ? '#7e3928' : '#26394a';
  ctx.save();
  ctx.translate(center.x, center.y - 10);
  ctx.scale(scale, scale);
  const flutter = Math.sin(time * 5 + regiment.bannerPhase) * 3 * (demo ? 1.2 : 1);
  ctx.strokeStyle = '#4f402f';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(0, -32);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(1, -30);
  ctx.lineTo(25 + flutter, -24);
  ctx.lineTo(18 + flutter, -13);
  ctx.lineTo(1, -17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawParticle(ctx, particle) {
  const ratio = clamp(particle.life / particle.max, 0, 1);
  ctx.save();
  ctx.globalAlpha = ratio * (particle.kind === 'signal' ? .8 : .35);
  if (particle.kind === 'signal') {
    ctx.fillStyle = particle.team === 0 ? '#f1d47e' : '#8da5b8';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3 + (1 - ratio) * 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#dfd1aa';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 2 + (1 - ratio) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

