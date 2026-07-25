function drawReports(scenario, width, height, timestamp) {
  const pulse = 1 + Math.sin(timestamp / 650) * .05; const offsets = { scout: -1, merchant: 0, bell: 1 };
  SOURCE_KEYS.forEach((key, sourceIndex) => {
    if (!state.visibleSources.includes(key)) return;
    const claim = scenario.claims[key]; const target = cityPoint(claim, width, height); const startBase = point(sourceStartForClaim(claim, sourceIndex), width, height); const color = SOURCE_DATA[key].color;
    const perpendicular = offsets[key] * Math.min(width, height) * .025; const curve = curveControl(startBase, target, perpendicular + scenario.curl * 8);
    ctx.save(); ctx.globalAlpha = state.phase === 'resolving' ? .26 : .7; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, width * .005); ctx.lineCap = 'round';
    ctx.setLineDash(key === 'scout' ? [9, 7] : key === 'merchant' ? [2, 6] : [4, 5, 1, 5]);
    ctx.beginPath(); ctx.moveTo(startBase.x, startBase.y); ctx.quadraticCurveTo(curve.x, curve.y, target.x, target.y); ctx.stroke();
    const routePoint = quadraticPoint(startBase, curve, target, .77); drawArrowHead(routePoint, target, color, width * .018); drawClaimMarker(target.x + offsets[key] * 10, target.y - 22 - Math.abs(offsets[key]) * 4, key, color, pulse); ctx.restore();
  });
}
function sourceStartForClaim(claim, sourceIndex) {
  const city = CITY_DATA[claim]; const spread = (sourceIndex - 1) * .09;
  return city.x < .5 ? { x: -.04, y: clamp(city.y + spread, .08, .92) } : { x: 1.04, y: clamp(city.y + spread, .08, .92) };
}
function curveControl(start, end, offset) {
  const midX = (start.x + end.x) / 2; const midY = (start.y + end.y) / 2; const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy) || 1;
  return { x: midX - dy / length * offset, y: midY + dx / length * offset };
}
function quadraticPoint(a, b, c, t) { const one = 1 - t; return { x: one * one * a.x + 2 * one * t * b.x + t * t * c.x, y: one * one * a.y + 2 * one * t * b.y + t * t * c.y }; }
function drawArrowHead(from, to, color, size) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x); ctx.save(); ctx.translate(from.x, from.y); ctx.rotate(angle); ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .8, size * .55); ctx.lineTo(-size * .45, 0); ctx.lineTo(-size * .8, -size * .55); ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawClaimMarker(x, y, key, color, pulse) {
  ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
  if (key === 'scout') { ctx.beginPath(); ctx.moveTo(-9, 5); ctx.quadraticCurveTo(0, -9, 11, -8); ctx.quadraticCurveTo(5, 0, 10, 8); ctx.quadraticCurveTo(0, 4, -9, 5); ctx.stroke(); }
  else if (key === 'merchant') { ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, -4); ctx.quadraticCurveTo(7, -4, 4, 0); ctx.lineTo(-1, 0); ctx.quadraticCurveTo(-6, 0, -3, 4); ctx.lineTo(4, 4); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(8, 5); ctx.lineTo(5, 0); ctx.lineTo(5, -4); ctx.quadraticCurveTo(0, -11, -5, -4); ctx.lineTo(-5, 0); ctx.closePath(); ctx.stroke(); }
  ctx.restore();
}
function drawScorchedCities(width, height, timestamp) {
  const flicker = Math.sin(timestamp / 130) * .08;
  for (const index of state.scorchedCities) {
    const city = cityPoint(index, width, height); ctx.save(); ctx.translate(city.x, city.y); ctx.globalAlpha = .5 + flicker; ctx.fillStyle = '#5c2b1f';
    for (let i = 0; i < 7; i += 1) { const angle = i / 7 * Math.PI * 2; const radius = 14 + (i % 3) * 3; ctx.beginPath(); ctx.ellipse(Math.cos(angle) * radius, Math.sin(angle) * radius * .65, 5 + i % 2, 2.5, angle, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = .18; ctx.fillStyle = '#2e1c15'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
function drawCities(width, height, timestamp) {
  const pulse = Math.sin(timestamp / 420) * .4;
  CITY_DATA.forEach((city, index) => {
    const x = city.x * width; const y = city.y * height; const scorched = state.scorchedCities.includes(index); ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = scorched ? 'rgba(73, 36, 27, .72)' : 'rgba(40, 38, 32, .88)'; ctx.fillStyle = scorched ? 'rgba(91, 44, 32, .85)' : 'rgba(220, 199, 150, .96)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 13 + (index === state.shieldCity ? pulse : 0), 0, Math.PI * 2); ctx.setLineDash([2, 4]); ctx.globalAlpha = .45; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(-5, 4); ctx.lineTo(0, 1); ctx.lineTo(5, 4); ctx.lineTo(5, -4); ctx.stroke();
    ctx.font = `700 ${Math.max(8.5, width * .026)}px ui-serif, Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = scorched ? 'rgba(78, 37, 28, .82)' : 'rgba(43, 41, 36, .8)'; ctx.fillText(city.name, 0, 16); ctx.restore();
  });
}
function drawVerifiedCities(width, height, timestamp) {
  const scenario = currentScenario(); if (!scenario) return; const shimmer = .5 + Math.sin(timestamp / 360) * .13;
  for (const index of state.verifiedCities) {
    const city = cityPoint(index, width, height); const isTarget = index === scenario.target; ctx.save(); ctx.translate(city.x, city.y);
    ctx.strokeStyle = isTarget ? `rgba(133, 45, 34, ${.75 + shimmer * .2})` : `rgba(109, 83, 43, ${.65 + shimmer * .15})`; ctx.fillStyle = isTarget ? 'rgba(158, 53, 40, .13)' : 'rgba(238, 221, 173, .24)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (isTarget) { ctx.fillStyle = '#7f2c23'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -9, 10, 0); ctx.quadraticCurveTo(0, 9, -10, 0); ctx.fill(); ctx.fillStyle = '#ead9aa'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(87, 69, 42, .78)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke(); }
    ctx.restore();
  }
}
function drawShield(width, height, timestamp) {
  if (state.shieldCity === null) return;
  const city = cityPoint(state.shieldCity, width, height); const settle = state.phase === 'resolving' ? 1 : 1 + Math.sin(timestamp / 480) * .015;
  ctx.save(); ctx.translate(city.x, city.y); ctx.scale(settle, settle); ctx.fillStyle = 'rgba(143, 44, 34, .9)'; ctx.strokeStyle = 'rgba(101, 30, 23, .95)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(236, 209, 166, .8)'; ctx.lineWidth = 1.7; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(0, 0, 15.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(236, 217, 174, .92)'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(8, 4); ctx.quadraticCurveTo(6, 10, 0, 14); ctx.quadraticCurveTo(-6, 10, -8, 4); ctx.lineTo(-9, -6); ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawAttack(scenario, width, height, timestamp) {
  const elapsed = timestamp - attackAnimation.startedAt; const raw = clamp(elapsed / attackAnimation.duration, 0, 1); const progress = easeInOutCubic(raw);
  const start = point(scenario.start, width, height); const target = cityPoint(scenario.target, width, height); const control = curveControl(start, target, scenario.curl * 38 + (target.x > start.x ? 18 : -18)); const current = quadraticPoint(start, control, target, progress);
  ctx.save(); ctx.strokeStyle = 'rgba(115, 34, 27, .92)'; ctx.lineWidth = Math.max(2.5, width * .009); ctx.lineCap = 'round'; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(start.x, start.y);
  const segments = 44; for (let i = 1; i <= Math.ceil(segments * progress); i += 1) { const p = quadraticPoint(start, control, target, Math.min(progress, i / segments)); ctx.lineTo(p.x, p.y); } ctx.stroke();
  drawEnemyToken(current.x, current.y, Math.atan2(target.y - current.y, target.x - current.x), width);
  if (raw > .78) { const hit = clamp((raw - .78) / .22, 0, 1); const defended = state.shieldCity === scenario.target; ctx.globalAlpha = hit; ctx.strokeStyle = defended ? 'rgba(227, 207, 147, .95)' : 'rgba(91, 34, 27, .9)'; ctx.lineWidth = defended ? 4 : 7; ctx.beginPath(); ctx.arc(target.x, target.y, 24 + hit * 15, 0, Math.PI * 2); ctx.stroke(); if (!defended) drawImpactSmoke(target.x, target.y, hit, width); }
  ctx.restore();
}
function drawEnemyToken(x, y, angle, width) {
  const size = Math.max(8, width * .025); ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = '#74271f'; ctx.strokeStyle = '#492019'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * .65, size * .58); ctx.lineTo(-size * .25, 0); ctx.lineTo(-size * .65, -size * .58); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function drawImpactSmoke(x, y, progress, width) {
  const base = Math.max(10, width * .034); ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(73, 38, 27, .35)';
  for (let index = 0; index < 6; index += 1) { const angle = index / 6 * Math.PI * 2 + .3; const distance = progress * base * (1.3 + index * .12); ctx.beginPath(); ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * .7, base * (.3 + progress * .28), 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function easeInOutCubic(value) { return value < .5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
