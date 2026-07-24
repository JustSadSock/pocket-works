// FACET v1.5 compact runtime bundle.
const contourStyles = document.createElement('link');
contourStyles.rel = 'stylesheet';
contourStyles.href = new URL('./v15.css', import.meta.url).href;
document.head.append(contourStyles);

const partUrls = [0, 1, 2, 3].map((index) => new URL(`./facet-v15-bundle-${index}.txt`, import.meta.url));
const encoded = (await Promise.all(partUrls.map(async (url) => {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`FACET bundle part unavailable: ${response.status}`);
  return response.text();
}))).join('');
const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
let source = await new Response(stream).text();
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
if (heroCopy) heroCopy.textContent = 'Три кадра, устойчивые ориентиры и отдельная пиксельная проверка волос и кожи.';
const footerVersion = document.querySelector('.app-footer span:first-child');
if (footerVersion) footerVersion.textContent = 'FACET v1.5';
const methodCopy = document.querySelector('.method-copy');
if (methodCopy) methodCopy.innerHTML = `
  <section><h3>Контуры</h3><p>Глаза, губы, брови, нос и нижняя часть лица строятся по полным соединениям Face Landmarker. Верхняя дуга лицевой сетки не считается линией роста волос.</p></section>
  <section><h3>Вертикальные кадры</h3><p>До измерений координаты переводятся в изотропное пространство с учётом реального соотношения сторон. Портретный кадр больше не растягивает высоту лица и наклон черт.</p></section>
  <section><h3>Волосы и лоб</h3><p>Линия роста волос показывается только при уверенном результате отдельной пиксельной сегментации волос и кожи. Иначе верхний контур не дорисовывается и форма лица помечается предварительной.</p></section>
  <section><h3>Три кадра</h3><p>Ориентиры трёх снимков совмещаются по глазам и усредняются медианой. Нестабильные сегменты становятся пунктирными или не показываются, а пограничная форма лица выводится как сочетание двух типов.</p></section>`;
