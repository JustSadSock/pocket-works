import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// The legacy Pocket Server uploads one standalone Node ESM module with a
// strict 1 MiB limit. Importing a .wasm file directly leaves an undeployable
// asset; esbuild's 'binary' loader alone would pass bytes to Instance, which
// requires a compiled Module. Preserve the original wrapper's synchrony.
export function embeddedNodeWasm() {
  return {
    name: 'pocket-server-embedded-wasm',
    setup(build) {
      build.onLoad({filter: /\.wasm$/}, async ({path: filename}) => {
        const bytes = await readFile(filename);
        const zipped = gzipSync(bytes, {level: 9, mtime: 0});
        const encoded = JSON.stringify(zipped.toString('base64'));
        return {
          loader: 'js',
          contents: 'import { gunzipSync } from "node:zlib"; ' +
            'export default new WebAssembly.Module(gunzipSync(Buffer.from(' +
            encoded + ', "base64")));'
        };
      });
    }
  };
}
