const runtimeParts = [
  './runtime/01-core.js',
  './runtime/02-life.js',
  './runtime/03-simulation.js',
  './runtime/04-history.js',
  './runtime/05-inspector.js',
  './runtime/06-views.js',
  './runtime/07-render.js',
  './runtime/08-controls.js'
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
