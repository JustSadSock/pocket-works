(async () => {
  try {
    if (typeof DecompressionStream !== 'function') throw new Error('Браузер не поддерживает распаковку эволюционного ядра');
    const response = await fetch('./runtime/advanced-runtime.b64', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось загрузить эволюционное ядро: ${response.status}`);
    const encoded = (await response.text()).trim();
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const source = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    (0, eval)(`${source}\n//# sourceURL=clada-advanced-runtime.js`);
  } catch (error) {
    console.error('КЛАДА: расширенное ядро не загрузилось', error);
    if (typeof showToast === 'function') showToast('Расширенная эволюция не загрузилась', 3200);
  }
})();
