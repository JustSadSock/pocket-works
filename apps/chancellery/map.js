function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hashNumber(value) {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function quantile(values, target) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * target)))];
}

function ownerHue(owner) {
  return hashNumber(owner) % 360;
}

function goodHue(good) {
  return hashNumber(good) % 360;
}

export function buildCartogramLayout(locations, cellSize = 42) {
  const normalized = (locations || []).map((location, index) => ({ ...location, _index: index }));
  const withCoordinates = normalized.filter((location) => finite(location.x) !== null && finite(location.y) !== null);
  if (withCoordinates.length >= Math.max(4, normalized.length * 0.65)) {
    const minX = Math.min(...withCoordinates.map((item) => finite(item.x)));
    const maxX = Math.max(...withCoordinates.map((item) => finite(item.x)));
    const minY = Math.min(...withCoordinates.map((item) => finite(item.y)));
    const maxY = Math.max(...withCoordinates.map((item) => finite(item.y)));
    return normalized.map((location) => {
      const x = finite(location.x);
      const y = finite(location.y);
      if (x === null || y === null) {
        const seed = hashNumber(location.id);
        return { ...location, cx: (seed % 23) * cellSize, cy: (Math.floor(seed / 23) % 23) * cellSize, size: cellSize - 5 };
      }
      return {
        ...location,
        cx: ((x - minX) / Math.max(1, maxX - minX)) * 1200,
        cy: ((y - minY) / Math.max(1, maxY - minY)) * 800,
        size: cellSize - 5
      };
    });
  }

  const sorted = [...normalized].sort((left, right) => {
    const owner = String(left.owner || '').localeCompare(String(right.owner || ''));
    if (owner) return owner;
    const market = String(left.market || '').localeCompare(String(right.market || ''));
    if (market) return market;
    return String(left.name || left.id).localeCompare(String(right.name || right.id));
  });
  const columns = Math.max(5, Math.ceil(Math.sqrt(sorted.length * 1.6)));
  return sorted.map((location, index) => ({
    ...location,
    cx: (index % columns) * cellSize,
    cy: Math.floor(index / columns) * cellSize,
    size: cellSize - 5
  }));
}

function colorFor(location, layer, context) {
  if (layer === 'control') {
    const control = finite(location.control);
    if (control === null) return '#c9c1ac';
    const hue = clamp(control, 0, 100) * 1.15;
    return `hsl(${hue} 48% 48%)`;
  }
  if (layer === 'population') {
    const population = Math.max(0, finite(location.population) || 0);
    const value = context.populationMax ? Math.sqrt(population / context.populationMax) : 0;
    return `hsl(29 58% ${74 - value * 38}%)`;
  }
  if (layer === 'goods') return location.good ? `hsl(${goodHue(location.good)} 45% 56%)` : '#c9c1ac';
  if (layer === 'problems') {
    if (context.problemIds.has(String(location.id))) return '#a74732';
    const control = finite(location.control);
    if (control !== null && control < 45) return '#c68b3a';
    return '#8ca28d';
  }
  return `hsl(${ownerHue(location.owner)} 34% 55%)`;
}

export class TerritoryCartogram {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = options.onSelect || (() => {});
    this.locations = [];
    this.layout = [];
    this.layer = 'control';
    this.problemIds = new Set();
    this.selectedId = null;
    this.focusIds = new Set();
    this.scale = 1;
    this.offsetX = 20;
    this.offsetY = 20;
    this.pointers = new Map();
    this.dragOrigin = null;
    this.lastPinch = null;
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.windowResize = () => this.resize();
    if (!this.resizeObserver) globalThis.addEventListener?.('resize', this.windowResize);
    this.#bind();
    this.resize();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    if (!this.resizeObserver) globalThis.removeEventListener?.('resize', this.windowResize);
  }

  setData(locations, options = {}) {
    this.locations = locations || [];
    this.layout = buildCartogramLayout(this.locations);
    this.problemIds = new Set((options.problemIds || []).map(String));
    this.selectedId = options.selectedId ? String(options.selectedId) : null;
    this.focusIds.clear();
    this.resetView();
  }

  setLayer(layer) {
    this.layer = layer;
    this.draw();
  }

  setProblems(ids) {
    this.problemIds = new Set((ids || []).map(String));
    this.draw();
  }

  select(id, notify = false) {
    this.selectedId = id == null ? null : String(id);
    this.draw();
    if (notify) this.onSelect(this.locations.find((item) => String(item.id) === this.selectedId) || null);
  }

  focus(ids) {
    this.focusIds = new Set((ids || []).map(String));
    const targets = this.layout.filter((location) => this.focusIds.has(String(location.id)));
    if (!targets.length) {
      this.draw();
      return;
    }
    const minX = Math.min(...targets.map((item) => item.cx));
    const maxX = Math.max(...targets.map((item) => item.cx + item.size));
    const minY = Math.min(...targets.map((item) => item.cy));
    const maxY = Math.max(...targets.map((item) => item.cy + item.size));
    const boundsWidth = Math.max(60, maxX - minX);
    const boundsHeight = Math.max(60, maxY - minY);
    this.scale = clamp(Math.min(this.canvas.clientWidth / (boundsWidth + 80), this.canvas.clientHeight / (boundsHeight + 80)), 0.45, 4);
    this.offsetX = this.canvas.clientWidth / 2 - ((minX + maxX) / 2) * this.scale;
    this.offsetY = this.canvas.clientHeight / 2 - ((minY + maxY) / 2) * this.scale;
    this.draw();
  }

  resetView() {
    if (!this.layout.length) {
      this.scale = 1;
      this.offsetX = 20;
      this.offsetY = 20;
      this.draw();
      return;
    }
    const maxX = Math.max(...this.layout.map((item) => item.cx + item.size));
    const maxY = Math.max(...this.layout.map((item) => item.cy + item.size));
    const availableWidth = Math.max(120, this.canvas.clientWidth - 36);
    const availableHeight = Math.max(120, this.canvas.clientHeight - 36);
    this.scale = clamp(Math.min(availableWidth / Math.max(1, maxX), availableHeight / Math.max(1, maxY)), 0.28, 1.35);
    this.offsetX = (this.canvas.clientWidth - maxX * this.scale) / 2;
    this.offsetY = (this.canvas.clientHeight - maxY * this.scale) / 2;
    this.draw();
  }

  resize() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw();
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale
    };
  }

  draw() {
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const width = this.canvas.width / ratio;
    const height = this.canvas.height / ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = '#d8d0bd';
    this.ctx.fillRect(0, 0, width, height);
    if (!this.layout.length) {
      this.ctx.fillStyle = '#5b584f';
      this.ctx.font = '600 15px system-ui';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('В этом снимке территории не распознаны', width / 2, height / 2);
      return;
    }
    const populationMax = quantile(this.layout.map((item) => Math.max(0, finite(item.population) || 0)), 0.95) || 1;
    const context = { populationMax, problemIds: this.problemIds };
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    this.ctx.lineWidth = 1 / this.scale;
    for (const location of this.layout) {
      const id = String(location.id);
      this.ctx.fillStyle = colorFor(location, this.layer, context);
      this.ctx.fillRect(location.cx, location.cy, location.size, location.size);
      this.ctx.strokeStyle = this.focusIds.has(id) ? '#fff6d6' : '#554f43';
      this.ctx.lineWidth = (this.focusIds.has(id) ? 4 : 1) / this.scale;
      this.ctx.strokeRect(location.cx, location.cy, location.size, location.size);
      if (id === this.selectedId) {
        this.ctx.strokeStyle = '#11100e';
        this.ctx.lineWidth = 5 / this.scale;
        this.ctx.strokeRect(location.cx - 2, location.cy - 2, location.size + 4, location.size + 4);
      }
      if (this.scale > 1.15) {
        this.ctx.fillStyle = '#171612';
        this.ctx.font = `${Math.max(7, 10 / this.scale)}px system-ui`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const label = String(location.name || location.id).slice(0, 8);
        this.ctx.fillText(label, location.cx + location.size / 2, location.cy + location.size / 2);
      }
    }
    this.ctx.restore();
  }

  #pick(clientX, clientY) {
    const point = this.screenToWorld(clientX, clientY);
    return [...this.layout].reverse().find((location) => point.x >= location.cx && point.x <= location.cx + location.size && point.y >= location.cy && point.y <= location.cy + location.size) || null;
  }

  #zoomAt(clientX, clientY, factor) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const worldX = (sx - this.offsetX) / this.scale;
    const worldY = (sy - this.offsetY) / this.scale;
    const next = clamp(this.scale * factor, 0.2, 6);
    this.offsetX = sx - worldX * next;
    this.offsetY = sy - worldY * next;
    this.scale = next;
    this.draw();
  }

  #bind() {
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.#zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });

    this.canvas.addEventListener('pointerdown', (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.dragOrigin = { x: event.clientX, y: event.clientY, offsetX: this.offsetX, offsetY: this.offsetY, moved: false };
      if (this.pointers.size === 2) {
        const [first, second] = [...this.pointers.values()];
        this.lastPinch = { distance: Math.hypot(second.x - first.x, second.y - first.y), scale: this.scale };
      }
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const [first, second] = [...this.pointers.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const centerX = (first.x + second.x) / 2;
        const centerY = (first.y + second.y) / 2;
        if (this.lastPinch?.distance) {
          const target = clamp(this.lastPinch.scale * (distance / this.lastPinch.distance), 0.2, 6);
          this.#zoomAt(centerX, centerY, target / this.scale);
        }
        return;
      }
      if (this.dragOrigin) {
        const dx = event.clientX - this.dragOrigin.x;
        const dy = event.clientY - this.dragOrigin.y;
        if (Math.hypot(dx, dy) > 5) this.dragOrigin.moved = true;
        this.offsetX = this.dragOrigin.offsetX + dx;
        this.offsetY = this.dragOrigin.offsetY + dy;
        this.draw();
      }
    });

    const finish = (event) => {
      const wasMoved = this.dragOrigin?.moved;
      this.pointers.delete(event.pointerId);
      if (!wasMoved && this.pointers.size === 0) {
        const location = this.#pick(event.clientX, event.clientY);
        if (location) {
          this.selectedId = String(location.id);
          this.onSelect(location);
          this.draw();
        }
      }
      if (this.pointers.size < 2) this.lastPinch = null;
      if (this.pointers.size === 0) this.dragOrigin = null;
    };
    this.canvas.addEventListener('pointerup', finish);
    this.canvas.addEventListener('pointercancel', finish);
  }
}
