import wasmModule from './rapier_wasm3d_bg.wasm';
import * as imports from './rapier_wasm3d_bg.js';
const instance=new WebAssembly.Instance(wasmModule,{'./rapier_wasm3d_bg.js':imports});
imports.__wbg_set_wasm(instance.exports);
export * from './rapier_wasm3d_bg.js';
