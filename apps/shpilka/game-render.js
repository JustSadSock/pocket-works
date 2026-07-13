function pathTrack(startIndex = 0, endIndex = track.length - 1, close = false) {
  ctx.beginPath();
  ctx.moveTo(track[startIndex].x, track[startIndex].y);
  for (let i = startIndex + 1; i <= endIndex; i += 1) ctx.lineTo(track[i % track.length].x, track[i % track.length].y);
  if (close) ctx.closePath();
}

function drawWorldBackground() {
  ctx.fillStyle = '#d2c49d';
  ctx.fillRect(-2200, -1800, 4400, 3600);

  ctx.strokeStyle = 'rgba(69, 70, 60, 0.10)';
  ctx.lineWidth = 1.5;
  for (let radius = 180; radius < 1700; radius += 110) {
    ctx.beginPath();
    for (let step = 0; step <= 84; step += 1) {
      const angle = step / 84 * TAU;
      const wobble = Math.sin(angle * 3 + radius * 0.013) * 28 + Math.sin(angle * 7) * 12;
      const x = Math.cos(angle) * (radius + wobble) - 80;
      const y = Math.sin(angle) * (radius * 0.72 + wobble) + 40;
      if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const prop of props) drawProp(prop);
}

function drawProp(prop) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.rotation);
  if (prop.type === 'scrub') {
    ctx.fillStyle = '#8a8d68';
    ctx.beginPath();
    ctx.moveTo(-prop.size, prop.size * 0.2);
    ctx.lineTo(-prop.size * 0.25, -prop.size * 0.72);
    ctx.lineTo(prop.size * 0.65, -prop.size * 0.2);
    ctx.lineTo(prop.size, prop.size * 0.55);
    ctx.lineTo(0, prop.size * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,33,31,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (prop.type === 'rock') {
    ctx.fillStyle = '#aaa078';
    ctx.fillRect(-prop.size * 0.75, -prop.size * 0.45, prop.size * 1.5, prop.size * 0.9);
    ctx.strokeStyle = 'rgba(30,33,31,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-prop.size * 0.75, -prop.size * 0.45, prop.size * 1.5, prop.size * 0.9);
  } else if (prop.type === 'marker') {
    ctx.fillStyle = '#e65e2f';
    ctx.fillRect(-2, -prop.size, 4, prop.size * 2);
    ctx.fillStyle = '#1e211f';
    ctx.fillRect(-7, -prop.size, 14, 4);
  } else {
    ctx.fillStyle = '#57594f';
    ctx.fillRect(-prop.size, -prop.size * 0.55, prop.size * 2, prop.size * 1.1);
    ctx.fillStyle = '#f4efe0';
    ctx.fillRect(-prop.size * 0.75, -prop.size * 0.35, prop.size * 0.45, prop.size * 0.7);
    ctx.fillRect(prop.size * 0.15, -prop.size * 0.35, prop.size * 0.45, prop.size * 0.7);
  }
  ctx.restore();
}

function drawBaseTrack() {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  pathTrack(0, track.length - 1, true);
  ctx.strokeStyle = '#aa9b71';
  ctx.lineWidth = ROAD_WIDTH + 40;
  ctx.stroke();

  pathTrack(0, track.length - 1, true);
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = ROAD_WIDTH + 15;
  ctx.stroke();

  pathTrack(0, track.length - 1, true);
  ctx.strokeStyle = '#343632';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.stroke();

  pathTrack(0, track.length - 1, true);
  ctx.strokeStyle = 'rgba(244,239,224,0.16)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  ctx.stroke();
  ctx.setLineDash([]);

  drawCurbs();
  drawStartLine();
  drawSkidMarks();
}

function drawCurbs() {
  ctx.lineCap = 'butt';
  for (let i = 0; i < track.length; i += 4) {
    const point = track[i];
    const next = track[(i + 4) % track.length];
    if (point.curvature < 0.09 && i % 12 !== 0) continue;
    const color = Math.floor(i / 4) % 2 === 0 ? '#f4efe0' : '#e65e2f';
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(point.x + point.nx * side * (ROAD_HALF - 2), point.y + point.ny * side * (ROAD_HALF - 2));
      ctx.lineTo(next.x + next.nx * side * (ROAD_HALF - 2), next.y + next.ny * side * (ROAD_HALF - 2));
      ctx.stroke();
    }
  }
  ctx.lineCap = 'round';
}

function drawStartLine() {
  const point = track[0];
  const segments = 8;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(Math.atan2(point.ty, point.tx));
  for (let i = 0; i < segments; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#f4efe0' : '#1e211f';
    ctx.fillRect(-5, -ROAD_HALF + i * (ROAD_WIDTH / segments), 10, ROAD_WIDTH / segments + 1);
  }
  ctx.restore();
}

function drawSkidMarks() {
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const mark of skidMarks) {
    ctx.strokeStyle = `rgba(12,14,13,${mark.alpha})`;
    ctx.beginPath();
    ctx.moveTo(mark.x1, mark.y1);
    ctx.lineTo(mark.x2, mark.y2);
    ctx.stroke();
  }
}

function drawBridge() {
  const start = Math.floor(BRIDGE_START);
  const end = Math.floor(BRIDGE_END);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.translate(12, 15);
  pathTrack(start, end);
  ctx.strokeStyle = 'rgba(30,33,31,0.32)';
  ctx.lineWidth = ROAD_WIDTH + 34;
  ctx.stroke();
  ctx.restore();

  pathTrack(start, end);
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = ROAD_WIDTH + 18;
  ctx.stroke();

  pathTrack(start, end);
  ctx.strokeStyle = '#3b3d38';
  ctx.lineWidth = ROAD_WIDTH;
  ctx.stroke();

  pathTrack(start, end);
  ctx.strokeStyle = 'rgba(244,239,224,0.19)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = start; i <= end; i += 1) {
      const point = track[i];
      const x = point.x + point.nx * side * (ROAD_HALF + 5);
      const y = point.y + point.ny * side * (ROAD_HALF + 5);
      if (i === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f4efe0';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#e65e2f';
    ctx.lineWidth = 2;
    ctx.setLineDash([22, 18]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const jumpPoint = track[Math.floor(JUMP_TRIGGER_START)];
  ctx.save();
  ctx.translate(jumpPoint.x, jumpPoint.y);
  ctx.rotate(Math.atan2(jumpPoint.ty, jumpPoint.tx));
  ctx.fillStyle = '#e65e2f';
  ctx.fillRect(-13, -ROAD_HALF + 8, 26, ROAD_WIDTH - 16);
  ctx.fillStyle = '#f4efe0';
  for (let y = -ROAD_HALF + 12; y < ROAD_HALF - 10; y += 24) ctx.fillRect(-13, y, 26, 9);
  ctx.restore();
}
