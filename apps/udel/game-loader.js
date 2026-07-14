const CHUNKS = [
  './chunks/game-01.txt',
  './chunks/game-02.txt',
  './chunks/game-03.txt',
  './chunks/game-04.txt',
  './chunks/game-05.txt',
  './chunks/game-06.txt',
  './chunks/game-07.txt',
  './chunks/game-08.txt',
  './chunks/game-09.txt',
  './chunks/game-10.txt',
  './chunks/game-11a.txt',
  './chunks/game-11b.txt',
  './chunks/game-11c.txt',
  './chunks/game-11d.txt',
  './chunks/game-12a.txt',
  './chunks/game-12b.txt',
  './chunks/game-12c.txt',
  './chunks/game-13.txt'
];

export async function loadGameModule() {
  const responses = await Promise.all(CHUNKS.map((path) => fetch(path)));
  const failed = responses.find((response) => !response.ok);
  if (failed) throw new Error(`Не удалось загрузить модуль игры: ${failed.status}`);
  const source = (await Promise.all(responses.map((response) => response.text()))).join('');
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
