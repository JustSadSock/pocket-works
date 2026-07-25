function render() {
  if (!state) return;
  resizeCanvas();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.view === 'tree') drawTree();
  else if (state.view === 'strata') drawStrata();
  else drawWorld();
}

function frame(now) {
  const delta = Math.min(80, now - lastFrame);
  lastFrame = now;
  if (state && !state.paused && state.fossilIndex === null && !document.hidden) {
    const multipliers = [1, 4, 12];
    accumulator += delta * multipliers[state.speedIndex];
    const stepDuration = 1000 / 30;
    let guard = 0;
    while (accumulator >= stepDuration && guard < 18) {
      simulateStep();
      accumulator -= stepDuration;
      guard += 1;
    }
  }
  render();
  requestAnimationFrame(frame);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height), px: event.clientX - rect.left, py: event.clientY - rect.top };
}

function nearestHit(px, py) {
  let nearest = null;
  let best = Infinity;
  for (const hit of renderHits) {
    const d = Math.hypot(px - hit.x, py - hit.y);
    if (d <= hit.radius && d < best) {
      nearest = hit;
      best = d;
    }
  }
  return nearest;
}

function handleCanvasTap(event) {
  const point = pointFromEvent(event);
  if (state.view === 'world') {
    if (state.seedMode && state.fossilIndex === null) {
      seedAt(point.x, point.y, 12);
      return;
    }
    const hit = nearestHit(point.px, point.py);
    if (!hit) {
      clearSelection();
      return;
    }
    const organism = getVisibleOrganisms().find((entry) => entry.id === hit.id);
    selectOrganism(organism);
    return;
  }
  if (state.view === 'tree') {
    const hit = nearestHit(point.px, point.py);
    if (hit) openSpeciesSheet(state.species.find((entry) => entry.id === hit.id));
    return;
  }
  if (state.view === 'strata') {
    const hit = nearestHit(point.px, point.py);
    if (hit) {
      selectHistory(hit.id);
      pulse(8);
    }
  }
}

