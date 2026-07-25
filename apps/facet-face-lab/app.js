// FACET v1.6 compact runtime bundle.
const contourStyles = document.createElement('link');
contourStyles.rel = 'stylesheet';
contourStyles.href = new URL('./v15.css', import.meta.url).href;
document.head.append(contourStyles);

const partNames = ['00', '01', '02', '03', '04', '05', '06a', '06b', '07', '08', '09', '10'];
const encoded = (await Promise.all(partNames.map(async (name) => {
  const url = new URL(`./facet-v15-c-${name}.txt`, import.meta.url);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`FACET bundle part unavailable: ${response.status}`);
  return response.text();
}))).join('');

const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
let source = await new Response(stream).text();

// The compressed payload contains the geometry engine followed by the UI runtime.
// Isolate the engine so its private math helpers cannot collide with UI helpers.
const runtimeMarker = 'const { installMobileRuntime } = await import("__MOBILE_RUNTIME__");';
const runtimeOffset = source.indexOf(runtimeMarker);
if (runtimeOffset < 0) throw new Error('FACET runtime boundary is missing');
const engineSource = source.slice(0, runtimeOffset);
const appSource = source.slice(runtimeOffset);
const engineExports = [
  'blendshapeMap',
  'boundingBoxFromLandmarks',
  'combineAssessments',
  'computeGeometryProfile',
  'computeImageQuality',
  'createScanAssessment',
  'LANDMARK_GROUPS',
  'qualityGate',
  'ratingLabel'
];
source = `
const __facetEngine = (() => {
${engineSource}
return { ${engineExports.join(', ')} };
})();
const { ${engineExports.join(', ')} } = __facetEngine;
${appSource}`;

source = source.replace(/const APP_VERSION = ['"]1\.5\.0['"];?/, "const APP_VERSION = '1.6.0';");

const FACET_V16_PATCH = String.raw`
const __facetV16Paths = {
  lowerFace: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
  leftEye: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  rightEye: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466, 263],
  outerLips: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61],
  innerLips: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78],
  noseBridge: [6, 197, 195, 5, 4],
  noseLeft: [98, 97, 2],
  noseRight: [2, 326, 327]
};
const __facetV16Brows = {
  leftUpper: [70, 63, 105, 66, 107],
  leftLower: [46, 53, 52, 65, 55],
  rightUpper: [300, 293, 334, 296, 336],
  rightLower: [276, 283, 282, 295, 285]
};

function __facetV16SmoothPath(context, points, closed) {
  if (!points || points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    context.lineTo(points[1].x, points[1].y);
  } else {
    for (let index = 1; index < points.length - 1; index += 1) {
      const midpoint = {
        x: (points[index].x + points[index + 1].x) / 2,
        y: (points[index].y + points[index + 1].y) / 2
      };
      context.quadraticCurveTo(points[index].x, points[index].y, midpoint.x, midpoint.y);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
  }
  if (closed) context.closePath();
  context.stroke();
}

function __facetV16RemoveOldBlue(context, canvas) {
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];
    const isBlueContour = alpha > 8 && blue > red * 1.18 && blue > green * 1.08 && green > red * 1.18;
    if (isBlueContour) data[index + 3] = 0;
  }
  context.putImageData(image, 0, 0);
}

const __facetV15DrawOverlay = drawOverlay;
drawOverlay = function drawOverlayV16() {
  __facetV15DrawOverlay();
  if (!finalLandmarks || el.image.hidden) return;

  const placement = imagePlacement();
  if (!placement.rect.width) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const context = el.overlay.getContext('2d');
  context.setTransform(1, 0, 0, 1, 0, 0);
  __facetV16RemoveOldBlue(context, el.overlay);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(32,79,116,.88)';
  context.lineWidth = 1.35;
  context.setLineDash([]);

  const point = function point(index) {
    const landmark = finalLandmarks[index];
    return {
      x: placement.offsetX + landmark.x * placement.shownWidth,
      y: placement.offsetY + landmark.y * placement.shownHeight
    };
  };
  const points = function points(indices) { return indices.map(point); };

  __facetV16SmoothPath(context, points(__facetV16Paths.lowerFace), false);
  __facetV16SmoothPath(context, points(__facetV16Paths.leftEye), true);
  __facetV16SmoothPath(context, points(__facetV16Paths.rightEye), true);
  __facetV16SmoothPath(context, points(__facetV16Paths.outerLips), true);
  context.globalAlpha = .72;
  context.lineWidth = 1.05;
  __facetV16SmoothPath(context, points(__facetV16Paths.innerLips), true);
  context.globalAlpha = 1;

  const averageBrow = function averageBrow(upper, lower) {
    return upper.map(function (upperIndex, index) {
      const top = point(upperIndex);
      const bottom = point(lower[index]);
      return { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 };
    });
  };
  context.lineWidth = 1.55;
  __facetV16SmoothPath(context, averageBrow(__facetV16Brows.leftUpper, __facetV16Brows.leftLower), false);
  __facetV16SmoothPath(context, averageBrow(__facetV16Brows.rightUpper, __facetV16Brows.rightLower), false);

  context.globalAlpha = .70;
  context.lineWidth = 1.1;
  context.setLineDash([4, 3]);
  __facetV16SmoothPath(context, points(__facetV16Paths.noseBridge), false);
  __facetV16SmoothPath(context, points(__facetV16Paths.noseLeft), false);
  __facetV16SmoothPath(context, points(__facetV16Paths.noseRight), false);
  context.setLineDash([]);
  context.globalAlpha = 1;
};

function __facetV16FeatureDelta(feature) {
  const center = Math.max(.0001, Number(feature.center) || .0001);
  const percent = Math.round(Math.abs(Number(feature.value) / center - 1) * 100);
  if ((Number(feature.z) || 0) < .25) return 'около центрального значения';
  return (Number(feature.signedZ) > 0 ? '+' : '−') + Math.max(1, percent) + '% от центрального значения';
}

function __facetV16ReportText() {
  const traits = (combined.traits || [])
    .slice()
    .sort(function (left, right) {
      return ((right.stability || 100) + right.confidence) - ((left.stability || 100) + left.confidence);
    });
  const distinctive = (combined.featureDetails || [])
    .slice()
    .sort(function (left, right) { return (right.z || 0) - (left.z || 0); })
    .slice(0, 4);
  const frameLines = (scans || []).map(function (scan, index) {
    return 'Кадр ' + (index + 1) + ': надёжность ' + scan.reliability + '%, фронтальность ' + scan.capture.frontal + '%, видимость ' + scan.capture.visibility + '%.';
  });
  const traitLines = traits.map(function (item) {
    return traitTitle(item.key) + ': ' + item.label + ' — уверенность ' + item.confidence + '%, повторяемость ' + (item.stability || 100) + '%.';
  });
  const featureLines = distinctive.map(function (feature) {
    return feature.label + ': ' + __facetV16FeatureDelta(feature) + '.';
  });
  const intervalText = combined.timingVerified
    ? (combined.intervals || []).map(function (value) { return (value / 1000).toFixed(1) + ' с'; }).join(' · ')
    : 'для файлов из галереи не подтверждён';

  return [
    'FACET v1.6 — подробный отчёт',
    '',
    'ИТОГ',
    'Оценка модели: ' + combined.rating.toFixed(1) + '/5 — ' + ratingLabel(combined.rating) + '.',
    'Диапазон неопределённости: ' + combined.interval[0].toFixed(1) + '–' + combined.interval[1].toFixed(1) + '.',
    '',
    'ПРОТОКОЛ',
    'Кадров: 3. ' + combined.protocolLabel + '.',
    'Интервалы: ' + intervalText + '.',
    'Общая надёжность: ' + combined.reliability + '%.',
    'Повторяемость результата: ' + combined.consistency + '%.',
    'Повторяемость геометрии: ' + (combined.geometryConsistency ?? combined.consistency) + '%.',
    ...frameLines,
    '',
    'ГЕОМЕТРИЧЕСКИЕ ПОКАЗАТЕЛИ',
    'Типичность пропорций: ' + combined.typicalityPercentile + '%.',
    'Координация черт: ' + combined.coordinationScore + '%.',
    'Левый/правый баланс: ' + combined.symmetryScore + '%.',
    'Открытость и видимость лица: ' + combined.occlusionScore + '%.',
    '',
    'ТИПАЖ',
    ...traitLines,
    '',
    'НАИБОЛЕЕ ВЫРАЖЕННЫЕ ОСОБЕННОСТИ',
    ...featureLines,
    '',
    'Метод: медиана трёх проверенных кадров; нестабильность ориентиров расширяет диапазон. Оценка модели описывает статистическую реакцию обучающей выборки и не является объективной мерой внешности.'
  ].join('\n');
}

el.share.removeEventListener('click', share);
share = async function shareV16() {
  if (!combined || !finalized) return;
  const text = __facetV16ReportText();
  try {
    if (navigator.share) await navigator.share({ title: 'FACET — подробный отчёт', text: text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Подробный отчёт скопирован.');
    }
  } catch (error) {
    if (error && error.name !== 'AbortError') toast('Не удалось поделиться отчётом.');
  }
};
el.share.addEventListener('click', share);
window.addEventListener('resize', function () { requestAnimationFrame(drawOverlay); });
`;
source += FACET_V16_PATCH;

const resolve = (path) => new URL(path, import.meta.url).href;
source = source
  .replaceAll('__MOBILE_RUNTIME__', resolve('../../shared/mobile-runtime.js'))
  .replaceAll('__STORAGE__', resolve('../../shared/capabilities/storage.js'))
  .replaceAll('__WORKSHOP__', resolve('../../shared/workshop-mode.js'))
  .replaceAll('__PWA_UTILS__', resolve('../../shared/pwa-utils.js'));

const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
} finally {
  URL.revokeObjectURL(moduleUrl);
}

const heroCopy = document.querySelector('.hero > p:last-child');
if (heroCopy) heroCopy.textContent = 'Три кадра, устойчивые ориентиры и минимальные контуры без ложной детализации.';
const footerVersion = document.querySelector('.app-footer span:first-child');
if (footerVersion) footerVersion.textContent = 'FACET v1.6';
const methodCopy = document.querySelector('.method-copy');
if (methodCopy) methodCopy.innerHTML = `
  <section><h3>Контуры</h3><p>Глаза показываются только по наружной границе без условных контуров радужки. Каждая бровь сведена к устойчивой средней оси, а нос — к переносице и линии крыльев без фиктивного замкнутого многоугольника.</p></section>
  <section><h3>Вертикальные кадры</h3><p>До измерений координаты переводятся в изотропное пространство с учётом реального соотношения сторон. Портретный кадр не растягивает высоту лица и наклон черт.</p></section>
  <section><h3>Волосы и лоб</h3><p>Линия роста волос показывается только при уверенном результате отдельной пиксельной сегментации волос и кожи. Иначе верхний контур не дорисовывается и форма лица помечается предварительной.</p></section>
  <section><h3>Три кадра</h3><p>Ориентиры трёх снимков совмещаются по глазам и усредняются медианой. Пограничная форма лица выводится как сочетание двух типов, а кнопка «Поделиться» формирует полный отчёт с метриками каждого кадра.</p></section>`;
