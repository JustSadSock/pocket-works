(() => {
  'use strict';

  const fatal = document.querySelector('#fatal');
  const status = document.querySelector('#statusText');

  function fail(error) {
    console.error('ЛИПУЧКА failed to start', error);
    const copy = fatal?.querySelector('span');
    if (copy) copy.textContent = 'Не удалось распаковать игровой движок. Перезагрузи приложение — прогресс сохранён.';
    if (fatal) fatal.hidden = false;
  }

  async function start() {
    try {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream is unavailable');
      }
      if (status) status.textContent = 'Распаковываем валик…';
      const encoded = await fetch('./runtime.txt?v=1.0.0').then((response) => {
        if (!response.ok) throw new Error(`Runtime request failed: ${response.status}`);
        return response.text();
      });
      const binary = atob(encoded.trim());
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const source = await new Response(stream).text();
      new Function(source)();
    } catch (error) {
      fail(error);
    }
  }

  start();
})();
