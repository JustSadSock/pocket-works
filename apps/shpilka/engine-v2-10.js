function drawProps() {
  for (const prop of props) {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.rotation);
    const s = prop.size;
    if (prop.type === 'scrub') {
      ctx.fillStyle = prop.variant > 0.5 ? theme.propA : theme.propB;
      ctx.strokeStyle = 'rgba(30,33,31,0.38)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-s * 0.85, s * 0.72);
      ctx.lineTo(-s * 0.58, -s * 0.52);
      ctx.lineTo(0, -s);
      ctx.lineTo(s * 0.72, -s * 0.2);
      ctx.lineTo(s * 0.68, s * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (prop.type === 'rock') {
      ctx.fillStyle = theme.terrainDark;
      ctx.strokeStyle = 'rgba(30,33,31,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, s * 0.42);
      ctx.lineTo(-s * 0.34, -s * 0.72);
      ctx.lineTo(s * 0.52, -s * 0.58);
      ctx.lineTo(s * 0.82, s * 0.18);
      ctx.lineTo(s * 0.2, s * 0.76);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (prop.type === 'marker') {
      ctx.fillStyle = prop.variant > 0.5 ? '#f2eee0' : theme.propA;
      ctx.strokeStyle = 'rgba(30,33,31,0.42)';
      ctx.lineWidth = 3;
      ctx.fillRect(-s * 0.42, -s * 0.72, s * 0.84, s * 1.44);
      ctx.strokeRect(-s * 0.42, -s * 0.72, s * 0.84, s * 1.44);
    } else {
      ctx.fillStyle = theme.id === 'port' ? (prop.variant > 0.5 ? '#e15f32' : '#53686c') : theme.propB;
      ctx.strokeStyle = 'rgba(30,33,31,0.42)';
      ctx.lineWidth = 4;
      ctx.fillRect(-s * 0.8, -s * 0.48, s * 1.6, s * 0.96);
      ctx.strokeRect(-s * 0.8, -s * 0.48, s * 1.6, s * 0.96);
    }
    ctx.restore();
  }
}

function drawTrackSurface() {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = theme.shoulder;
  ctx.lineWidth = roadWidth + 52;
  ctx.stroke(trackPath);

  ctx.strokeStyle = '#20231f';
  ctx.lineWidth = roadWidth + 14;
  ctx.stroke(trackPath);

  ctx.strokeStyle = theme.asphalt;
  ctx.lineWidth = roadWidth;
  ctx.stroke(trackPath);

  ctx.save();
  ctx.strokeStyle = 'rgba(245,241,228,0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([26, 34]);
  ctx.stroke(racingLinePath);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(242,238,224,0.22)';
  ctx.lineWidth = 3;
  ctx.setLineDash([28, 32]);
  ctx.stroke(trackPath);
  ctx.restore();

  drawCurbs();
  drawFinishLine();
  drawRamp();
}

function drawCurbs() {
  for (let i = 0; i < track.length; i += 8) {
    const a = track[i];
    const b = track[(i + 8) % track.length];
    const color = Math.floor(i / 8) % 2 === 0 ? theme.curbA : theme.curbB;
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.lineCap = 'butt';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a.x + a.nx * side * (roadHalf + 2), a.y + a.ny * side * (roadHalf + 2));
      ctx.lineTo(b.x + b.nx * side * (roadHalf + 2), b.y + b.ny * side * (roadHalf + 2));
      ctx.stroke();
    }
  }
  ctx.lineCap = 'round';
}

function drawFinishLine() {
  if (!track.length) return;
  const point = track[0];
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  const cell = 10;
  const rows = Math.ceil(roadWidth / cell);
  for (let i = -Math.floor(rows / 2); i <= Math.floor(rows / 2); i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      ctx.fillStyle = (i + j) % 2 === 0 ? '#f2eee0' : '#1e211f';
      ctx.fillRect(-cell * 1.5 + j * cell, i * cell, cell, cell);
    }
  }
  ctx.restore();
}

function drawRamp() {
  if (rampIndex < 0 || !track.length) return;
  const point = track[rampIndex];
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(point.heading);
  ctx.fillStyle = '#d45731';
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 4;
  ctx.fillRect(-32, -roadHalf + 12, 64, roadWidth - 24);
  ctx.strokeRect(-32, -roadHalf + 12, 64, roadWidth - 24);
  ctx.fillStyle = '#f2eee0';
  for (let y = -roadHalf + 18; y < roadHalf - 18; y += 24) {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.lineTo(6, y + 10);
    ctx.lineTo(-20, y + 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawSkidMarks() {
  ctx.save();
  ctx.strokeStyle = '#191b19';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const mark of skidMarks) {
    ctx.globalAlpha = mark.alpha;
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y1);
    ctx.lineTo(mark.x2, mark.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.globalAlpha = alpha * (particle.kind === 'dust' ? 0.42 : 1);
    ctx.fillStyle = particle.color;
    if (particle.kind === 'dust') {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillRect(particle.x - particle.size * 0.5, particle.y - particle.size * 0.5, particle.size, particle.size);
    }
  }
  ctx.globalAlpha = 1;
}
