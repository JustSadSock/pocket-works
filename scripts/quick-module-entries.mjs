// Resolve only first-party ES module entrypoints explicitly loaded by the
// application's own HTML. Classic scripts and shared bootstrap modules are not
// substitutes for the app's Workshop initialization.
export function ownModuleScripts(html) {
  const result = new Set();
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*["']\.\/([^"']+)["']/i)?.[1];
    if (!src || !/^[a-z0-9_.\/-]+\.js$/i.test(src)) continue;
    if (src.split('/').some(p=>p==='..'||p==='.'||p==='')) continue;
    result.add(src);
  }
  return [...result];
}
