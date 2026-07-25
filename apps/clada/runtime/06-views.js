function drawWorld() {
  const snapshot = activeSnapshot();
  const organisms = snapshot?.organisms || state.organisms;
  const env = snapshot?.env || state.env;
  const temperature = env.temperature;
  const topHue = lerp(202, 28, temperature);
  const bottomHue = lerp(168, 42, temperature);
  const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
  gradient.addColorStop(0, `hsl(${topHue} 24% ${lerp(84, 75, Math.abs(temperature - .5) * 2)}%)`);
  gradient.addColorStop(1, `hsl(${bottomHue} 24% ${lerp(78, 69, Math.abs(temperature - .5) * 2)}%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = 'rgba(31,42,36,.065)';
  ctx.lineWidth = 1;
  for (let index = 1; index < 8; index += 1) {
    const y = cssHeight * index / 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssWidth, y + Math.sin(index * 1.7) * 3);
    ctx.stroke();
  }

  const plants = snapshot ? state.plants.slice(0, Math.min(65, state.plants.length)) : state.plants;
  for (const plant of plants) {
    if (plant.energy < .15) continue;
    const x = plant.x * cssWidth;
    const y = plant.y * cssHeight;
    const size = 1.5 + Math.sqrt(plant.energy) * 2.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(plant.phase) * .18);
    ctx.strokeStyle = `rgba(54,81,59,${.25 + plant.energy * .12})`;
    ctx.fillStyle = `rgba(85,123,88,${.2 + plant.energy * .12})`;
    ctx.lineWidth = .8;
    ctx.beginPath();
    ctx.moveTo(0, size * .9);
    ctx.lineTo(0, -size * .7);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-size * .35, -size * .25, size * .46, size * .22, -.55, 0, TAU);
    ctx.ellipse(size * .35, -size * .55, size * .46, size * .22, .55, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (state.shock?.type === 'meteor' && !snapshot) {
    const x = state.shock.x * cssWidth;
    const y = state.shock.y * cssHeight;
    const radius = (1 - state.shock.strength * .35) * Math.min(cssWidth, cssHeight) * .1;
    ctx.save();
    ctx.strokeStyle = `rgba(154,89,70,${.28 + state.shock.strength * .5})`;
    ctx.fillStyle = `rgba(78,61,48,${.18 + state.shock.strength * .18})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  renderHits = [];
  const scaleBase = clamp(Math.min(cssWidth, cssHeight) / 42, 5.2, 10.5);
  for (const organism of organisms) {
    const x = organism.x * cssWidth;
    const y = organism.y * cssHeight;
    const angle = Math.atan2(organism.vy || 0, organism.vx || .001);
    const scale = scaleBase * (.7 + organism.genome.size * .38);
    drawOrganismShape(ctx, organism, x, y, scale, angle);
    if (state.lens && !snapshot) {
      const fitness = clamp(organism.energy / (10 + organism.genome.size * 4));
      ctx.strokeStyle = `hsla(${lerp(8, 116, fitness)} 56% 38% / .55)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, scale * 1.28, -Math.PI / 2, -Math.PI / 2 + TAU * fitness);
      ctx.stroke();
    }
    if (state.selectedId === organism.id) {
      ctx.strokeStyle = '#1f2a24';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(x, y, scale * 1.55, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    renderHits.push({ type: 'organism', id: organism.id, x, y, radius: Math.max(13, scale * 1.7) });
  }

  if (state.seedMode) {
    ctx.fillStyle = 'rgba(31,42,36,.72)';
    ctx.font = '700 11px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('КОСНИСЬ СРЕДЫ — ЗДЕСЬ ПОЯВИТСЯ ОСНОВАТЕЛЬ', cssWidth / 2, cssHeight - 28);
  }
}

function buildTreeLayout(generation) {
  const visible = state.species.filter((species) => species.born <= generation).slice(-56);
  const yMap = new Map();
  const children = new Map();
  for (const species of visible) {
    if (!children.has(species.parentId)) children.set(species.parentId, []);
    children.get(species.parentId).push(species);
  }
  let leafIndex = 0;
  function assign(species) {
    const descendants = children.get(species.id) || [];
    if (!descendants.length) {
      yMap.set(species.id, leafIndex++);
      return yMap.get(species.id);
    }
    const childYs = descendants.map(assign);
    const value = childYs.reduce((sum, y) => sum + y, 0) / childYs.length;
    yMap.set(species.id, value);
    return value;
  }
  const roots = visible.filter((species) => !visible.some((candidate) => candidate.id === species.parentId));
  roots.forEach(assign);
  for (const species of visible) if (!yMap.has(species.id)) yMap.set(species.id, leafIndex++);
  return { visible, yMap, rows: Math.max(1, leafIndex) };
}

function drawTree() {
  const generation = visibleGeneration();
  ctx.fillStyle = '#e7e1cf';
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const margin = { left: 30, right: 28, top: 32, bottom: 28 };
  const startGeneration = Math.max(0, state.species.reduce((min, species) => Math.min(min, species.born), generation));
  const span = Math.max(1, generation - startGeneration);
  const { visible, yMap, rows } = buildTreeLayout(generation);
  const xFor = (g) => margin.left + (clamp((g - startGeneration) / span) * (cssWidth - margin.left - margin.right));
  const yFor = (id) => margin.top + ((yMap.get(id) + .5) / rows) * (cssHeight - margin.top - margin.bottom);

  ctx.strokeStyle = 'rgba(31,42,36,.12)';
  ctx.fillStyle = 'rgba(31,42,36,.45)';
  ctx.font = '8px ui-sans-serif, system-ui';
  ctx.textAlign = 'center';
  for (let tick = 0; tick <= 5; tick += 1) {
    const generationTick = Math.round(lerp(startGeneration, generation, tick / 5));
    const x = xFor(generationTick);
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, cssHeight - 18);
    ctx.stroke();
    ctx.fillText(`G${generationTick}`, x, cssHeight - 8);
  }

  renderHits = [];
  for (const species of visible) {
    const x1 = xFor(species.born);
    const endGeneration = species.extinct === null || species.extinct > generation ? generation : species.extinct;
    const x2 = xFor(endGeneration);
    const y = yFor(species.id);
    const extinct = species.extinct !== null && species.extinct <= generation;
    ctx.strokeStyle = extinct ? 'rgba(154,89,70,.64)' : `hsla(${species.hue} 35% 35% / .88)`;
    ctx.lineWidth = extinct ? 1.4 : 2.2;
    ctx.setLineDash(extinct ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const parent = visible.find((entry) => entry.id === species.parentId);
    if (parent) {
      const parentY = yFor(parent.id);
      ctx.strokeStyle = 'rgba(31,42,36,.46)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, parentY);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }

    ctx.fillStyle = extinct ? '#9a5946' : organismColor(species.centroid, 39, 1);
    ctx.beginPath();
    ctx.arc(x2, y, extinct ? 3 : 4.5, 0, TAU);
    ctx.fill();
    renderHits.push({ type: 'species', id: species.id, x: x2, y, radius: 15 });
  }

  const tips = visible.filter((species) => species.extinct === null || species.extinct > generation).slice(-8);
  ctx.textAlign = 'right';
  ctx.font = '700 8px ui-sans-serif, system-ui';
  for (const species of tips) {
    const y = yFor(species.id);
    ctx.fillStyle = '#1f2a24';
    ctx.fillText(species.common.toUpperCase(), cssWidth - 11, clamp(y - 6, 15, cssHeight - 12));
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1f2a24';
  ctx.font = '600 12px ui-serif, Georgia, serif';
  ctx.fillText(`${visible.length} зафиксированных ветвей`, 18, 20);
}

function drawStrata() {
  ctx.fillStyle = '#dfd8c4';
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  const history = state.history;
  renderHits = [];
  if (!history.length) return;
  const layerHeight = Math.max(7, (cssHeight - 48) / history.length);
  const populationMax = Math.max(1, ...history.map((entry) => entry.population));
  const richnessMax = Math.max(1, ...history.map((entry) => Object.keys(entry.counts).length));

  ctx.font = '8px ui-sans-serif, system-ui';
  for (let index = 0; index < history.length; index += 1) {
    const snapshot = history[index];
    const y = cssHeight - 24 - (index + 1) * layerHeight;
    const temperatureHue = lerp(205, 27, snapshot.env.temperature);
    const light = 74 - snapshot.population / populationMax * 10;
    ctx.fillStyle = `hsl(${temperatureHue} 22% ${light}%)`;
    ctx.fillRect(0, y, cssWidth, layerHeight + .5);

    const populationWidth = snapshot.population / populationMax * (cssWidth - 88);
    ctx.fillStyle = 'rgba(54,81,59,.42)';
    ctx.fillRect(58, y + layerHeight * .25, populationWidth, Math.max(1, layerHeight * .5));

    const richness = Object.keys(snapshot.counts).length;
    for (let dot = 0; dot < richness; dot += 1) {
      ctx.fillStyle = `rgba(154,89,70,${.35 + dot / richnessMax * .45})`;
      ctx.beginPath();
      ctx.arc(cssWidth - 18 - dot * 5, y + layerHeight / 2, 1.5, 0, TAU);
      ctx.fill();
    }

    if (snapshot.event) {
      ctx.fillStyle = snapshot.event.type === 'extinction' || snapshot.event.type === 'shock' ? '#9a5946' : '#36513b';
      ctx.beginPath();
      ctx.moveTo(47, y + layerHeight / 2);
      ctx.lineTo(52, y + layerHeight / 2 - 4);
      ctx.lineTo(52, y + layerHeight / 2 + 4);
      ctx.closePath();
      ctx.fill();
    }

    if (index % Math.max(1, Math.ceil(history.length / 8)) === 0 || index === history.length - 1) {
      ctx.fillStyle = 'rgba(31,42,36,.72)';
      ctx.textAlign = 'left';
      ctx.fillText(`G${snapshot.generation}`, 8, y + layerHeight * .72);
    }
    renderHits.push({ type: 'history', id: index, x: cssWidth / 2, y: y + layerHeight / 2, radius: Math.max(8, layerHeight / 2) });
  }

  const selectedIndex = state.fossilIndex ?? history.length - 1;
  const selectedY = cssHeight - 24 - (selectedIndex + .5) * layerHeight;
  ctx.strokeStyle = '#1f2a24';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, selectedY);
  ctx.lineTo(cssWidth, selectedY);
  ctx.stroke();

  ctx.fillStyle = '#1f2a24';
  ctx.font = '600 12px ui-serif, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('ИСКОПАЕМАЯ ЛЕТОПИСЬ', 8, 16);
  ctx.font = '8px ui-sans-serif, system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('популяция →', cssWidth - 8, 16);
}

