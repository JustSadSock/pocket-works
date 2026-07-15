function shp29DrawLegacyLandmarkHardware() {
  for (const landmark of (typeof shp26Landmarks !== 'undefined' ? shp26Landmarks : [])) {
    if (!shp29IsNearCamera(landmark, 950)) continue;
    ctx.save();
    ctx.translate(landmark.x, landmark.y);
    ctx.rotate(landmark.angle);
    if (landmark.kind === 'bridge' || landmark.kind === 'dam') {
      ctx.strokeStyle = '#d6d0bf';
      ctx.lineWidth = 7;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-landmark.length * 0.55, side * (roadHalf + 15));
        ctx.lineTo(landmark.length * 0.55, side * (roadHalf + 15));
        ctx.stroke();
      }
    } else if (landmark.kind === 'yard') {
      const colors = ['#d65b35', '#52686d', '#c6a23d', '#785b48'];
      for (const side of [-1, 1]) {
        for (let x = -landmark.length * 0.5; x <= landmark.length * 0.38; x += 74) {
          ctx.fillStyle = colors[Math.abs(Math.floor(x / 74) + (side > 0 ? 2 : 0)) % colors.length];
          ctx.fillRect(x, side * (roadHalf + 62) - 23, 62, 46);
          ctx.strokeStyle = '#282b28';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, side * (roadHalf + 62) - 23, 62, 46);
        }
      }
    } else if (landmark.kind === 'cliff') {
      ctx.strokeStyle = '#f0ead8';
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 13]);
      ctx.beginPath();
      ctx.moveTo(-landmark.length * 0.52, landmark.side * (roadHalf + 24));
      ctx.lineTo(landmark.length * 0.52, landmark.side * (roadHalf + 24));
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (landmark.kind === 'tunnel') {
      ctx.fillStyle = 'rgba(18,21,19,0.34)';
      for (let x = -landmark.length * 0.42; x <= landmark.length * 0.42; x += 46) {
        ctx.fillRect(x - 4, -roadHalf, 8, roadWidth);
      }
    }
    ctx.restore();
  }
}

function shp29DrawTrackFurniture() {
  shp29DrawLegacyLandmarkHardware();
  for (const section of shp28Sections || []) {
    shp29DrawGuardrails(section);
    shp29DrawBrakingBoards(section);
    shp29DrawArrowGate(section);
  }
  shp29DrawStartGantry();
}

var shp29BaseDrawGround = shp281DrawGround;
shp281DrawGround = function shp29DrawGround() {
  shp29BaseDrawGround();
  shp29DrawSceneryUnderlays();
};

var shp29BaseDrawTrack = shp281DrawTrack;
shp281DrawTrack = function shp29DrawTrack() {
  shp29BaseDrawTrack();
  shp29DrawTrackFurniture();
};

function shp29BuildMapCache() {
  if (!track.length) {
    shp29MapCache = null;
    return;
  }
  const minX = track.bounds?.minX ?? Math.min(...track.map((point) => point.x));
  const maxX = track.bounds?.maxX ?? Math.max(...track.map((point) => point.x));
  const minY = track.bounds?.minY ?? Math.min(...track.map((point) => point.y));
  const maxY = track.bounds?.maxY ?? Math.max(...track.map((point) => point.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = 82 / Math.max(spanX, spanY);
  const offsetX = 9 + (82 - spanX * scale) * 0.5;
  const offsetY = 9 + (82 - spanY * scale) * 0.5;
  const project = (point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale
  });
  shp29MapCache = {
    project,
    points: track.filter((_, index) => index % 5 === 0).map(project),
    sections: (shp28Sections || []).map((section) => ({
      kind: section.kind,
      point: project(shp28PointAtDistance(section.center))
    }))
  };
}

function shp29PaintMiniMap(force = false) {
  const canvasNode = document.querySelector('#routeMapCanvas');
  const shell = document.querySelector('#routeMap');
  if (!canvasNode || !shell || !shp29MapCache) return;
  const visible = mode === 'race' || mode === 'countdown' || mode === 'paused';
  shell.hidden = !visible;
  if (!visible) return;
  const now = performance.now();
  if (!force && now - shp29MapLastPaint < 70) return;
  shp29MapLastPaint = now;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvasNode.width !== Math.round(100 * ratio)) {
    canvasNode.width = Math.round(100 * ratio);
    canvasNode.height = Math.round(100 * ratio);
  }
  const map = canvasNode.getContext('2d');
  map.setTransform(ratio, 0, 0, ratio, 0, 0);
  map.clearRect(0, 0, 100, 100);
  map.lineJoin = 'round';
  map.lineCap = 'round';
  map.beginPath();
  shp29MapCache.points.forEach((point, index) => {
    if (index === 0) map.moveTo(point.x, point.y);
    else map.lineTo(point.x, point.y);
  });
  map.closePath();
  map.strokeStyle = 'rgba(14,17,15,0.75)';
  map.lineWidth = 8;
  map.stroke();
  map.strokeStyle = theme?.curbA || '#eee8d8';
  map.lineWidth = 3;
  map.stroke();

  for (const section of shp29MapCache.sections) {
    map.fillStyle = shp29DangerKinds.has(section.kind)
      ? '#e05d35'
      : shp29WaterKinds.has(section.kind)
        ? '#6f9ca0'
        : '#d6b44b';
    map.beginPath();
    map.arc(section.point.x, section.point.y, 2.6, 0, TAU);
    map.fill();
  }

  for (const car of cars || []) {
    const point = shp29MapCache.project(car);
    map.save();
    map.translate(point.x, point.y);
    map.rotate(car.angle || 0);
    map.fillStyle = car.player ? '#f4efe0' : car.color || '#d05d39';
    map.strokeStyle = '#161917';
    map.lineWidth = car.player ? 1.7 : 1;
    map.beginPath();
    map.moveTo(4.8, 0);
    map.lineTo(-3.4, -2.7);
    map.lineTo(-2.2, 0);
    map.lineTo(-3.4, 2.7);
    map.closePath();
    map.fill();
    map.stroke();
    map.restore();
  }
}

function shp29RoutePreviewPath() {
  const svg = document.querySelector('.track-mark svg');
  const path = svg?.querySelector('path');
  if (!svg || !path || !track.length) return;
  const bounds = track.bounds || {};
  const minX = bounds.minX ?? Math.min(...track.map((point) => point.x));
  const maxX = bounds.maxX ?? Math.max(...track.map((point) => point.x));
  const minY = bounds.minY ?? Math.min(...track.map((point) => point.y));
  const maxY = bounds.maxY ?? Math.max(...track.map((point) => point.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = 142 / Math.max(spanX, spanY);
  const ox = 19 + (142 - spanX * scale) * 0.5;
  const oy = 19 + (142 - spanY * scale) * 0.5;
  const points = track.filter((_, index) => index % 10 === 0).map((point) => ({
    x: ox + (point.x - minX) * scale,
    y: oy + (point.y - minY) * scale
  }));
  path.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') + ' Z');
  const bridge = svg.querySelector('.bridge-line');
  if (bridge) {
    if (shp28Jump) {
      const a = shp28PointAtDistance(shp28Jump.startDistance);
      const b = shp28PointAtDistance(shp28Jump.startDistance + shp28Jump.gapLength);
      bridge.setAttribute('d', `M${(ox + (a.x - minX) * scale).toFixed(1)} ${(oy + (a.y - minY) * scale).toFixed(1)} L${(ox + (b.x - minX) * scale).toFixed(1)} ${(oy + (b.y - minY) * scale).toFixed(1)}`);
      bridge.hidden = false;
    } else {
      bridge.hidden = true;
    }
  }
}

function shp29UpdateRouteIdentity() {
  const root = document.documentElement;
  root.style.setProperty('--route-terrain', theme?.terrain || '#d2c49d');
  root.style.setProperty('--route-dark', theme?.terrainDark || '#8b806a');
  root.style.setProperty('--route-accent', theme?.curbB || '#df5d35');
  root.style.setProperty('--route-water', shpActiveArchetype?.id === 'cascade' ? '#6f9698' : '#87958e');
  const typeLabel = {
    speed: 'СКОРОСТНОЙ КОНТУР',
    technical: 'ТЕХНИЧЕСКИЙ ЛАБИРИНТ',
    mountain: 'ГОРНЫЙ МАРШРУТ',
    cascade: 'ГИДРОТЕХНИЧЕСКИЙ КАСКАД'
  }[shpActiveArchetype?.id] || 'СМЕШАННЫЙ МАРШРУТ';
  const landmarkCount = Array.isArray(shp26Landmarks) ? shp26Landmarks.length : 0;
  shp29RouteSignature = `${typeLabel} · ${shp28Sections.length} СЕКЦИЙ · ${landmarkCount} ОРИЕНТИРА`;
  if (routeMeta && !routeMeta.textContent.includes('СЕКЦИЙ')) routeMeta.textContent += ` · ${shp28Sections.length} СЕКЦИЙ`;
}

var shp29BasePrepareRoute = prepareRoute;
prepareRoute = function shp29PrepareRoute(seed = null) {
  shp29BasePrepareRoute(seed);
  shp29BuildScenery();
  shp29BuildMapCache();
  shp29RoutePreviewPath();
  shp29UpdateRouteIdentity();
  shp29PaintMiniMap(true);
};

var shp29BaseUpdateRouteUi = updateRouteUi;
updateRouteUi = function shp29UpdateRouteUi() {
  shp29BaseUpdateRouteUi();
  shp29UpdateRouteIdentity();
};

var shp29BaseUpdateSimulation = updateSimulation;
updateSimulation = function shp29UpdateSimulation(dt) {
  const result = shp29BaseUpdateSimulation(dt);
  shp29PaintMiniMap();
  return result;
};

function shp29CreateMiniMap() {
  if (document.querySelector('#routeMap')) return;
  const node = document.createElement('aside');
  node.id = 'routeMap';
  node.className = 'route-map';
  node.hidden = true;
  node.innerHTML = '<span>ТРАССА</span><canvas id="routeMapCanvas" width="200" height="200" aria-label="Мини-карта трассы"></canvas>';
  document.querySelector('.app-shell')?.append(node);
}

shp29CreateMiniMap();
