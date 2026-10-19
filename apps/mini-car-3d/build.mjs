import {build} from 'esbuild';
await build({entryPoints:['src/game.js'],outfile:'game.bundle.js',bundle:true,format:'esm',target:'es2022',minify:true});
await build({entryPoints:['server/entry.js'],outfile:'server/module.ts',bundle:true,format:'esm',platform:'browser',plugins:[{name:'immutable-wasm',setup(b){b.onResolve({filter:/\.wasm$/},args=>({path:'../../../apps/mini-car-3d/server/vendor/rapier-0.12-da5bcba9ab82/rapier_wasm3d_bg.wasm',external:true}));}}]});
