export async function loadClassicScript(source) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = () => { script.remove(); resolve(); };
    script.onerror = () => { script.remove(); reject(new Error(`Не удалось загрузить ${source}`)); };
    document.head.append(script);
  });
}

export async function loadRuntimeGroup(parts) {
  const responses = await Promise.all(parts.map((source) => fetch(source, { cache: 'no-store' })));
  const failedIndex = responses.findIndex((response) => !response.ok);
  if (failedIndex >= 0) throw new Error(`Не удалось загрузить ${parts[failedIndex]}: ${responses[failedIndex].status}`);
  const chunks = await Promise.all(responses.map((response) => response.text()));
  const source = chunks.map((chunk, index) => `${chunk}\n//# sourceURL=${parts[index]}\n`).join('\n');
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { await loadClassicScript(blobUrl); }
  finally { URL.revokeObjectURL(blobUrl); }
}

export async function loadCladaRuntime({ scripts, groups }) {
  for (const source of scripts) await loadClassicScript(source);
  for (const group of groups) await loadRuntimeGroup(group);
}
