// Optional distribution asset: generate from licensed upstream, never embed
// undocumented synthetic replacements. Run at packaging time, not on every UI test.
import {mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadLibrary} from './geographic-dem-library.mjs';
import {packExemplars,validateExemplars} from './genesis-natural.mjs';
const dir=new URL('./dem/',import.meta.url);await mkdir(dir,{recursive:true});const library=await loadLibrary(join(tmpdir(),'crown-dem-library')),data=validateExemplars(packExemplars(library),{requirePackedChecksum:true});await writeFile(new URL('frozen-exemplars.json',dir),JSON.stringify(data));await writeFile(new URL('provenance.json',dir),JSON.stringify(library.map(x=>x.metadata),null,2));console.log('DEM packed with CRC32 and source attribution',data.length);
