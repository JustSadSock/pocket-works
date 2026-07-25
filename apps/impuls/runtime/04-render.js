function drawField(field) {
  const positive = field.polarity > 0;
  ctx.save();
  ctx.translate(field.x, field.y);
  ctx.strokeStyle = positive ? '#1c6380' : '#c85a34';
  ctx.fillStyle = positive ? 'rgba(28,99,128,.08)' : 'rgba(200,90,52,.08)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 7]);
  ctx.beginPath(); ctx.arc(0, 0, field.radius, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  for (let ring = .3; ring < 1; ring += .28) {
    ctx.globalAlpha = .25 + (1 - ring) * .35;
    ctx.beginPath(); ctx.arc(0, 0, field.radius * ring, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); if (positive) { ctx.moveTo(0, -4); ctx.lineTo(0, 4); } ctx.stroke();
  ctx.restore();
}

function drawConstraint(constraint) {
  const endpoints = constraintEndpoints(constraint);
  if (!endpoints) return;
  const tension = clamp(Math.abs(constraint.tension || 0), 0, 1);
  ctx.save();
  ctx.strokeStyle = state.stress ? `rgb(${Math.round(48 + 185 * tension)},${Math.round(99 - 35 * tension)},${Math.round(128 - 75 * tension)})` : '#394346';
  ctx.lineWidth = state.stress ? 2 + tension * 3 : 2;
  if (constraint.type === 'rope') {
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(endpoints.ax, endpoints.ay); ctx.lineTo(endpoints.bx, endpoints.by); ctx.stroke();
  } else {
    const dx = endpoints.bx - endpoints.ax, dy = endpoints.by - endpoints.ay;
    const n = normalize(dx, dy);
    const px = -n.y, py = n.x;
    const segments = Math.max(5, Math.floor(n.length / 14));
    ctx.beginPath(); ctx.moveTo(endpoints.ax, endpoints.ay);
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const offset = (i % 2 ? 1 : -1) * 6;
      ctx.lineTo(endpoints.ax + dx * t + px * offset, endpoints.ay + dy * t + py * offset);
    }
    ctx.lineTo(endpoints.bx, endpoints.by); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.arc(endpoints.ax, endpoints.ay, 3.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(endpoints.bx, endpoints.by, 3.5, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawBody(body) {
  const material = MATERIALS[body.material];
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.angle);
  ctx.fillStyle = material.color;
  ctx.strokeStyle = material.edge;
  ctx.lineWidth = body.id === state.selectedId ? 4 : 2;
  if (body.id === state.selectedId) { ctx.shadowColor = '#f5efdf'; ctx.shadowBlur = 0; }
  ctx.beginPath();
  if (body.shape === 'circle') ctx.arc(0, 0, body.r, 0, TAU);
  else ctx.rect(-body.w / 2, -body.h / 2, body.w, body.h);
  ctx.fill(); ctx.stroke();

  ctx.globalAlpha = .42;
  ctx.lineWidth = 1;
  if (body.material === 'wood') {
    ctx.beginPath();
    if (body.shape === 'circle') { ctx.arc(-body.r * .16, 0, body.r * .43, -.8, .8); ctx.arc(body.r * .08, 0, body.r * .62, 2.3, 4); }
    else { for (let y = -body.h * .24; y <= body.h * .24; y += 8) { ctx.moveTo(-body.w / 2 + 5, y); ctx.quadraticCurveTo(0, y + 3, body.w / 2 - 5, y); } }
    ctx.stroke();
  } else if (body.material === 'steel') {
    ctx.fillStyle = material.edge;
    const points = body.shape === 'circle' ? [[0,0]] : [[-body.w*.35,-body.h*.28],[body.w*.35,-body.h*.28],[-body.w*.35,body.h*.28],[body.w*.35,body.h*.28]];
    for (const [x,y] of points) { ctx.beginPath(); ctx.arc(x,y,2.2,0,TAU); ctx.fill(); }
  } else if (body.material === 'rubber') {
    ctx.strokeStyle = '#f4b29e';
    ctx.beginPath();
    if (body.shape === 'circle') ctx.arc(0,0,body.r*.62,0,TAU);
    else ctx.rect(-body.w*.32,-body.h*.28,body.w*.64,body.h*.56);
    ctx.stroke();
  } else if (body.material === 'ice') {
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-8,-4); ctx.lineTo(0,3); ctx.lineTo(7,-7); ctx.moveTo(0,3); ctx.lineTo(5,10); ctx.stroke();
  } else if (body.material === 'foam') {
    ctx.fillStyle = '#fff6c8';
    for (let i=0;i<5;i++){ const a=i*1.7; const r=body.shape==='circle'?body.r*.45:Math.min(body.w,body.h)*.32; ctx.beginPath(); ctx.arc(Math.cos(a)*r,Math.sin(a)*r,2.2,0,TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (body.pinned) {
    ctx.strokeStyle = '#232a2c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6,-6); ctx.lineTo(6,6); ctx.moveTo(6,-6); ctx.lineTo(-6,6); ctx.stroke();
  }
  ctx.restore();

  if (state.stress && body.invMass) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > 15) {
      const scale = Math.min(42, speed * .035);
      const n = normalize(body.vx, body.vy);
      drawArrow(body.x, body.y, body.x + n.x * scale, body.y + n.y * scale, '#1c6380');
    }
  }
}

function drawArrow(x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-Math.cos(angle-.55)*7,y2-Math.sin(angle-.55)*7); ctx.lineTo(x2-Math.cos(angle+.55)*7,y2-Math.sin(angle+.55)*7); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPreview() {
  const preview = state.preview;
  if (!preview) return;
  const dx = preview.x2 - preview.x1, dy = preview.y2 - preview.y1;
  const distance = Math.hypot(dx, dy);
  ctx.save();
  ctx.strokeStyle = preview.type === 'impulse' ? '#c85a34' : '#1c6380';
  ctx.fillStyle = 'rgba(28,99,128,.12)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6,5]);
  if (preview.type === 'circle') {
    ctx.beginPath(); ctx.arc(preview.x1, preview.y1, 22, 0, TAU); ctx.fill(); ctx.stroke();
    if (distance > 5) drawArrow(preview.x1, preview.y1, preview.x2, preview.y2, '#1c6380');
  } else if (preview.type === 'box') {
    ctx.save(); ctx.translate(preview.x1,preview.y1); ctx.rotate(Math.atan2(dy,dx)*.22); ctx.beginPath(); ctx.rect(-23,-17,46,34); ctx.fill(); ctx.stroke(); ctx.restore();
    if (distance > 5) drawArrow(preview.x1, preview.y1, preview.x2, preview.y2, '#1c6380');
  } else if (preview.type === 'wall') {
    ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(preview.x1,preview.y1); ctx.lineTo(preview.x2,preview.y2); ctx.stroke();
  } else if (preview.type === 'field') {
    ctx.beginPath(); ctx.arc(preview.x1,preview.y1,clamp(distance||78,48,190),0,TAU); ctx.fill(); ctx.stroke();
  } else if (preview.type === 'impulse') {
    ctx.setLineDash([]); drawArrow(preview.x1,preview.y1,preview.x2,preview.y2,'#c85a34');
    ctx.globalAlpha=.28;ctx.beginPath();ctx.arc(preview.x1,preview.y1,clamp(86+distance*.35,86,190),0,TAU);ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(preview.x1,preview.y1); ctx.lineTo(preview.x2,preview.y2); ctx.stroke();
  }
  ctx.restore();
}

function render() {
  const width = state.worldWidth, height = state.worldHeight;
  ctx.clearRect(0, 0, width, height);
  for (const field of state.fields) drawField(field);
  for (const constraint of state.constraints) drawConstraint(constraint);
  for (const body of state.bodies) drawBody(body);
  for (const burst of state.bursts) {
    ctx.save(); ctx.globalAlpha = burst.life; ctx.strokeStyle = '#c85a34'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(burst.x,burst.y,burst.radius,0,TAU); ctx.stroke(); ctx.restore();
  }
  drawPreview();
}

function frame(now) {
  const elapsed = Math.min(.05, (now - state.lastTime) / 1000);
  state.lastTime = now;
  if (!state.paused) {
    state.accumulator += elapsed * state.speed;
    const step = 1 / 120;
    let iterations = 0;
    while (state.accumulator >= step && iterations < 8) {
      simulate(step);
      state.accumulator -= step;
      iterations++;
    }
  }
  render();
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const oldWidth = state.worldWidth || rect.width;
  const oldHeight = state.worldHeight || rect.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.worldWidth = rect.width;
  state.worldHeight = rect.height;
  if (state.initialised && oldWidth && oldHeight && (Math.abs(oldWidth - rect.width) > 2 || Math.abs(oldHeight - rect.height) > 2)) {
    const sx = rect.width / oldWidth, sy = rect.height / oldHeight;
    for (const body of state.bodies) { body.x *= sx; body.y *= sy; body.vx *= sx; body.vy *= sy; }
    for (const field of state.fields) { field.x *= sx; field.y *= sy; field.radius *= Math.min(sx, sy); }
    for (const constraint of state.constraints) {
      constraint.rest *= Math.min(sx, sy);
      if (constraint.bx != null) constraint.bx *= sx;
      if (constraint.by != null) constraint.by *= sy;
    }
  }
}
