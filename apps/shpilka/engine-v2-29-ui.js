// ШПИЛЬКА 2.9 — cosmetic garage. No performance tuning.
var shp29CosmeticStorageKey = 'pocket-works:shpilka:cosmetics:v1';
var shp29Palettes = [
  { id: 'ember', label: 'УГОЛЬ', body: '#d65a35', accent: '#f1e8d5', wheel: '#171918' },
  { id: 'ivory', label: 'СЛОНОВАЯ КОСТЬ', body: '#e9e2d0', accent: '#d45531', wheel: '#1d201e' },
  { id: 'moss', label: 'МОХ', body: '#60705a', accent: '#d9b34b', wheel: '#171918' },
  { id: 'fjord', label: 'ФЬОРД', body: '#54747b', accent: '#f0e8d7', wheel: '#171918' },
  { id: 'plum', label: 'СЛИВА', body: '#775366', accent: '#e3b44a', wheel: '#171918' },
  { id: 'graphite', label: 'ГРАФИТ', body: '#383d3a', accent: '#e0663c', wheel: '#171918' }
];
var shp29Liveries = [
  { id: 'spine', label: 'ХРЕБЕТ' },
  { id: 'split', label: 'РАЗРЕЗ' },
  { id: 'chevron', label: 'ШЕВРОН' },
  { id: 'clean', label: 'ЧИСТАЯ' }
];
var shp29Numbers = [7, 13, 17, 23, 44, 88];

function shp29LoadCosmetics() {
  try {
    const parsed = JSON.parse(localStorage.getItem(shp29CosmeticStorageKey) || '{}');
    return {
      palette: shp29Palettes.some((item) => item.id === parsed.palette) ? parsed.palette : 'ember',
      livery: shp29Liveries.some((item) => item.id === parsed.livery) ? parsed.livery : 'spine',
      number: shp29Numbers.includes(Number(parsed.number)) ? Number(parsed.number) : 17
    };
  } catch {
    return { palette: 'ember', livery: 'spine', number: 17 };
  }
}

var shp29Cosmetics = shp29LoadCosmetics();

function shp29SaveCosmetics() {
  try {
    localStorage.setItem(shp29CosmeticStorageKey, JSON.stringify(shp29Cosmetics));
  } catch {
    // Cosmetic persistence is optional.
  }
}

function shp29CurrentPalette() {
  return shp29Palettes.find((item) => item.id === shp29Cosmetics.palette) || shp29Palettes[0];
}

function shp29DrawPlayerLivery(car) {
  const palette = shp29CurrentPalette();
  const elevationScale = 1 + clamp(car.z / 850, 0, 0.085);
  const bodyLift = car.z * 0.08;
  ctx.save();
  ctx.translate(car.x, car.y - bodyLift);
  ctx.rotate(car.angle);
  ctx.scale(elevationScale, elevationScale);
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 1.4;

  if (shp29Cosmetics.livery === 'spine') {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(-20, -2.2, 40, 4.4);
    ctx.fillStyle = palette.body;
    ctx.fillRect(-5, -1, 13, 2);
  } else if (shp29Cosmetics.livery === 'split') {
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(13, -11);
    ctx.lineTo(-13, -11);
    ctx.lineTo(-24, -6);
    ctx.lineTo(-24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (shp29Cosmetics.livery === 'chevron') {
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-17, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-17, 8);
    ctx.moveTo(-8, -8);
    ctx.lineTo(5, 0);
    ctx.lineTo(-8, 8);
    ctx.stroke();
  }

  ctx.fillStyle = '#f2eee0';
  ctx.strokeStyle = '#1e211f';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-3, 0, 6.8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1e211f';
  ctx.font = '900 7px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(shp29Cosmetics.number), -3, 0.4);
  ctx.restore();
}

var shp29BaseDrawCar = drawCar;
drawCar = function shp29DrawCar(car) {
  if (!car?.player) return shp29BaseDrawCar(car);
  const palette = shp29CurrentPalette();
  const originalColor = car.color;
  const originalAccent = car.accent;
  car.color = palette.body;
  car.accent = palette.accent;
  try {
    shp29BaseDrawCar(car);
    shp29DrawPlayerLivery(car);
  } finally {
    car.color = originalColor;
    car.accent = originalAccent;
  }
};

function shp29GaragePreviewSvg() {
  const palette = shp29CurrentPalette();
  const livery = shp29Cosmetics.livery;
  const stripe = livery === 'spine'
    ? `<rect x="38" y="48" width="104" height="10" fill="${palette.accent}"/>`
    : livery === 'split'
      ? `<path d="M141 53 116 27H57L38 42v11Z" fill="${palette.accent}"/>`
      : livery === 'chevron'
        ? `<path d="m63 31 30 22-30 22M82 31l30 22-30 22" fill="none" stroke="${palette.accent}" stroke-width="9"/>`
        : '';
  return `
    <svg viewBox="0 0 180 106" role="img" aria-label="Предпросмотр машины">
      <ellipse cx="94" cy="88" rx="64" ry="11" fill="rgba(25,28,26,.22)"/>
      <rect x="45" y="17" width="24" height="12" fill="${palette.wheel}"/><rect x="112" y="17" width="24" height="12" fill="${palette.wheel}"/>
      <rect x="45" y="76" width="24" height="12" fill="${palette.wheel}"/><rect x="112" y="76" width="24" height="12" fill="${palette.wheel}"/>
      <path d="M153 53 132 22H53L27 38v30l26 16h79Z" fill="${palette.body}" stroke="#1e211f" stroke-width="5"/>
      ${stripe}
      <path d="M122 53 105 38H77L63 53l14 15h28Z" fill="#27302c"/>
      <path d="M108 53 99 43H86v20h13Z" fill="#8aa09b"/>
      <circle cx="76" cy="53" r="13" fill="#f2eee0" stroke="#1e211f" stroke-width="3"/>
      <text x="76" y="58" text-anchor="middle" font-family="ui-monospace,monospace" font-size="15" font-weight="900" fill="#1e211f">${shp29Cosmetics.number}</text>
    </svg>`;
}

function shp29UpdateGarage() {
  const preview = document.querySelector('#garagePreview');
  if (preview) preview.innerHTML = shp29GaragePreviewSvg();
  for (const button of document.querySelectorAll('[data-garage-palette]')) {
    button.classList.toggle('is-selected', button.dataset.garagePalette === shp29Cosmetics.palette);
    button.setAttribute('aria-pressed', String(button.dataset.garagePalette === shp29Cosmetics.palette));
  }
  for (const button of document.querySelectorAll('[data-garage-livery]')) {
    button.classList.toggle('is-selected', button.dataset.garageLivery === shp29Cosmetics.livery);
    button.setAttribute('aria-pressed', String(button.dataset.garageLivery === shp29Cosmetics.livery));
  }
  for (const button of document.querySelectorAll('[data-garage-number]')) {
    button.classList.toggle('is-selected', Number(button.dataset.garageNumber) === shp29Cosmetics.number);
    button.setAttribute('aria-pressed', String(Number(button.dataset.garageNumber) === shp29Cosmetics.number));
  }
}

function shp29BuildGarage() {
  if (document.querySelector('#garageScreen')) return;
  const routeRow = document.querySelector('.route-action-row');
  const routeHubButton = document.querySelector('#routeHubButton');
  const garageButton = document.createElement('button');
  garageButton.id = 'garageButton';
  garageButton.className = 'secondary-action';
  garageButton.type = 'button';
  garageButton.textContent = 'МАШИНА';
  if (routeRow) routeRow.append(garageButton);
  else routeHubButton?.after(garageButton);

  const screen = document.createElement('section');
  screen.id = 'garageScreen';
  screen.className = 'garage-screen';
  screen.hidden = true;
  screen.innerHTML = `
    <div class="garage-sheet" role="dialog" aria-modal="true" aria-labelledby="garageTitle">
      <header>
        <div><p class="eyebrow">ТОЛЬКО ВНЕШНОСТЬ</p><h2 id="garageTitle">МАШИНА</h2></div>
        <button id="garageClose" type="button">ГОТОВО</button>
      </header>
      <div class="garage-preview" id="garagePreview"></div>
      <section class="garage-group">
        <span>ЦВЕТ</span>
        <div class="garage-swatches">
          ${shp29Palettes.map((palette) => `<button type="button" data-garage-palette="${palette.id}" aria-label="${palette.label}" style="--swatch-body:${palette.body};--swatch-accent:${palette.accent}"><i></i><b>${palette.label}</b></button>`).join('')}
        </div>
      </section>
      <section class="garage-group">
        <span>ЛИВРЕЯ</span>
        <div class="garage-segments">
          ${shp29Liveries.map((livery) => `<button type="button" data-garage-livery="${livery.id}">${livery.label}</button>`).join('')}
        </div>
      </section>
      <section class="garage-group">
        <span>НОМЕР</span>
        <div class="garage-numbers">
          ${shp29Numbers.map((number) => `<button type="button" data-garage-number="${number}">${number}</button>`).join('')}
        </div>
      </section>
      <p class="garage-note">Цвет, ливрея и номер не меняют скорость, сцепление или поведение машины.</p>
    </div>`;
  document.querySelector('.app-shell')?.append(screen);

  const setOpen = (open) => {
    screen.hidden = !open;
    if (open) {
      shp29UpdateGarage();
      screen.querySelector('#garageClose')?.focus();
    } else {
      garageButton.focus();
    }
  };

  garageButton.addEventListener('click', () => setOpen(true));
  screen.querySelector('#garageClose')?.addEventListener('click', () => setOpen(false));
  screen.addEventListener('pointerdown', (event) => { if (event.target === screen) setOpen(false); });
  screen.addEventListener('click', (event) => {
    const palette = event.target.closest('[data-garage-palette]')?.dataset.garagePalette;
    const livery = event.target.closest('[data-garage-livery]')?.dataset.garageLivery;
    const number = Number(event.target.closest('[data-garage-number]')?.dataset.garageNumber);
    if (palette) shp29Cosmetics.palette = palette;
    if (livery) shp29Cosmetics.livery = livery;
    if (shp29Numbers.includes(number)) shp29Cosmetics.number = number;
    if (palette || livery || shp29Numbers.includes(number)) {
      shp29SaveCosmetics();
      shp29UpdateGarage();
      audio.blip?.('menu', 0.58);
      navigator.vibrate?.(5);
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !screen.hidden) {
      event.preventDefault();
      setOpen(false);
    }
  });
  shp29UpdateGarage();
}

shp29BuildGarage();
