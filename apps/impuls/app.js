const runtimeParts = [
  './runtime/01-core.js',
  './runtime/02-input.js',
  './runtime/03-physics.js',
  './runtime/03-integrity.js',
  './runtime/04-render.js',
  './runtime/05-ui.js'
];

for (const source of runtimeParts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Не удалось загрузить ${source}`));
    document.head.append(script);
  });
}
