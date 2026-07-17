const reserveStyle = document.createElement('link');
reserveStyle.rel = 'stylesheet';
reserveStyle.href = './reserve.css?v=2.2.0';
document.head.append(reserveStyle);

const boardFrame = document.querySelector('#boardFrame');
const board = document.querySelector('#boardCanvas');
const thinking = document.querySelector('#thinking');
const turnLabel = document.querySelector('#turnLabel');
const turnPill = document.querySelector('#turnPill');
const boardCaption = document.querySelector('#boardCaption');
const azurePieces = document.querySelector('#azurePieces');
const ochrePieces = document.querySelector('#ochrePieces');

if (boardFrame && board && thinking && turnLabel) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layer = document.createElement('div');
  layer.className = 'motion-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="front-scan"></div><div class="turn-sweep"></div><i class="impact-ring"></i>';
  boardFrame.append(layer);

  const impactRing = layer.querySelector('.impact-ring');
  let beforeFrame = null;
  let lastTurn = turnLabel.textContent;
  let lastThinking = !thinking.classList.contains('hidden');
  let lastCounts = {
    azure: Number(azurePieces?.textContent || 0),
    ochre: Number(ochrePieces?.textContent || 0)
  };

  function takeSnapshot() {
    if (reduceMotion || !board.width || !board.height) return null;
    try {
      const context = board.getContext('2d', { willReadFrequently: true });
      return {
        width: board.width,
        height: board.height,
        cssWidth: board.getBoundingClientRect().width,
        cssHeight: board.getBoundingClientRect().height,
        data: context.getImageData(0, 0, board.width, board.height)
      };
    } catch {
      return null;
    }
  }

  function maskDifference(previous, current, useCurrent) {
    const output = document.createElement('canvas');
    output.width = current.width;
    output.height = current.height;
    output.className = useCurrent ? 'motion-ghost-new' : 'motion-ghost-old';
    const context = output.getContext('2d');
    const image = context.createImageData(current.width, current.height);
    const source = useCurrent ? current.data.data : previous.data.data;
    const a = previous.data.data;
    const b = current.data.data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let index = 0; index < a.length; index += 4) {
      const difference = Math.abs(a[index] - b[index])
        + Math.abs(a[index + 1] - b[index + 1])
        + Math.abs(a[index + 2] - b[index + 2]);
      if (difference < 92) continue;
      const pixel = index / 4;
      const x = pixel % current.width;
      const y = Math.floor(pixel / current.width);
      image.data[index] = source[index];
      image.data[index + 1] = source[index + 1];
      image.data[index + 2] = source[index + 2];
      image.data[index + 3] = Math.min(230, Math.max(80, difference * .72));
      sumX += x;
      sumY += y;
      count += 1;
    }
    if (count < 36) return null;
    context.putImageData(image, 0, 0);
    output.style.width = `${current.cssWidth}px`;
    output.style.height = `${current.cssHeight}px`;
    return { canvas: output, x: sumX / count, y: sumY / count, count };
  }

  function animateDifference(previous) {
    if (!previous || reduceMotion) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const current = takeSnapshot();
      if (!current || current.width !== previous.width || current.height !== previous.height) return;
      const oldMask = maskDifference(previous, current, false);
      const newMask = maskDifference(previous, current, true);
      if (!oldMask || !newMask) return;

      const scaleX = current.cssWidth / current.width;
      const scaleY = current.cssHeight / current.height;
      const dx = (newMask.x - oldMask.x) * scaleX * .32;
      const dy = (newMask.y - oldMask.y) * scaleY * .32;
      const originX = `${oldMask.x / current.width * 100}%`;
      const originY = `${oldMask.y / current.height * 100}%`;
      for (const mask of [oldMask.canvas, newMask.canvas]) {
        mask.style.setProperty('--ghost-x', originX);
        mask.style.setProperty('--ghost-y', originY);
      }
      oldMask.canvas.style.setProperty('--ghost-dx', `${dx}px`);
      oldMask.canvas.style.setProperty('--ghost-dy', `${dy}px`);
      layer.append(oldMask.canvas, newMask.canvas);
      setTimeout(() => { oldMask.canvas.remove(); newMask.canvas.remove(); }, 560);

      impactRing.style.left = `${newMask.x * scaleX}px`;
      impactRing.style.top = `${newMask.y * scaleY}px`;
      impactRing.classList.remove('play');
      void impactRing.offsetWidth;
      impactRing.classList.add('play');
    }));
  }

  function pulseTurn() {
    boardFrame.classList.remove('turn-transition');
    turnPill?.classList.remove('turn-pulse');
    void boardFrame.offsetWidth;
    boardFrame.classList.add('turn-transition');
    turnPill?.classList.add('turn-pulse');
    setTimeout(() => {
      boardFrame.classList.remove('turn-transition');
      turnPill?.classList.remove('turn-pulse');
    }, 560);
  }

  function spawnShards(color) {
    const rect = boardFrame.getBoundingClientRect();
    for (let index = 0; index < 12; index += 1) {
      const shard = document.createElement('i');
      shard.className = 'edge-shard';
      const angle = Math.random() * Math.PI * 2;
      const distance = 35 + Math.random() * 55;
      shard.style.left = `${rect.width * (.42 + Math.random() * .16)}px`;
      shard.style.top = `${rect.height * (.42 + Math.random() * .16)}px`;
      shard.style.setProperty('--sx', `${Math.cos(angle) * distance}px`);
      shard.style.setProperty('--sy', `${Math.sin(angle) * distance}px`);
      shard.style.setProperty('--sr', `${-150 + Math.random() * 300}deg`);
      shard.style.setProperty('--shard-color', color);
      layer.append(shard);
      setTimeout(() => shard.remove(), 720);
    }
  }

  function updateThinking() {
    const active = !thinking.classList.contains('hidden');
    boardFrame.classList.toggle('is-thinking', active);
    if (active && !lastThinking) beforeFrame = takeSnapshot();
    lastThinking = active;
  }

  function updateAxisAlert() {
    const text = boardCaption?.textContent || '';
    boardFrame.classList.toggle('axis-alert', /Ось|ось/.test(text) && /ответ|переж|Сорвите|Удержите/.test(text));
  }

  function updateCounter(node, key, color) {
    if (!node) return;
    const value = Number(node.textContent || 0);
    if (value < lastCounts[key]) {
      node.classList.remove('counter-drop');
      void node.offsetWidth;
      node.classList.add('counter-drop');
      spawnShards(color);
    }
    lastCounts[key] = value;
  }

  const observer = new MutationObserver(() => {
    updateThinking();
    updateAxisAlert();
    updateCounter(azurePieces, 'azure', '#4d88a4');
    updateCounter(ochrePieces, 'ochre', '#c67c3c');

    const nextTurn = turnLabel.textContent;
    if (nextTurn !== lastTurn) {
      animateDifference(beforeFrame);
      beforeFrame = null;
      lastTurn = nextTurn;
      pulseTurn();
    }
  });

  observer.observe(document.querySelector('.game-screen'), {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class']
  });

  document.querySelector('.game-screen')?.addEventListener('pointerdown', () => {
    if (!thinking.classList.contains('hidden')) return;
    beforeFrame = takeSnapshot();
  }, { capture: true, passive: true });

  updateThinking();
  updateAxisAlert();
}
