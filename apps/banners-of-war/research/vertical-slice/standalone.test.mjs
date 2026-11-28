import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {standalone} from './build-slice.mjs';
test('standalone is exactly reproducible from the app engine and UI',async()=>{assert.equal(await readFile(new URL('./standalone.html',import.meta.url),'utf8'),await standalone())});
