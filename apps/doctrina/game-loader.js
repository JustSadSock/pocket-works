const CHUNKS = [
  './chunks-gz/game-01.txt',
  './chunks-gz/game-02.txt',
  './chunks-gz/game-03.txt',
  './chunks-gz/game-04.txt'
];
const EXPECTED_LENGTHS = [18000, 18000, 18000, 124];

function restoreBundledPayload(parts) {
  const restored = [...parts];

  // The original second one-line asset was committed with one dropped split byte.
  // Repair only that exact fingerprint, then enforce the complete bundle shape.
  if (
    restored[1]?.length === 17999
    && restored[1].slice(1374, 1394) === 'r4ahE9JtoeXW7lIpEkeW'
  ) {
    restored[1] = `${restored[1].slice(0, 1382)}t${restored[1].slice(1382)}`;
  }

  restored.forEach((part, index) => {
    if (part.length !== EXPECTED_LENGTHS[index]) {
      throw new Error(`Game payload part ${index + 1} is incomplete (${part.length}/${EXPECTED_LENGTHS[index]}).`);
    }
  });

  const encoded = restored.join('');
  if (encoded.length % 4 !== 0) throw new Error('Game payload has invalid base64 alignment.');
  return encoded;
}

async function loadGameModule() {
  const responses = await Promise.all(CHUNKS.map((path) => fetch(path)));
  for (const response of responses) {
    if (!response.ok) throw new Error(`Game payload unavailable: ${response.url}`);
  }

  const parts = await Promise.all(responses.map((response) => response.text()));
  const binary = atob(restoreBundledPayload(parts));
  const compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

await loadGameModule();
