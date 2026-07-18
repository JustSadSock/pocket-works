import test from 'node:test';
import assert from 'node:assert/strict';
import {HERALDIC_SCHOOLS,schoolForDoctrine,shieldGeometry,compositionForDoctrine,paletteForDoctrine} from '../heraldry.js';
test('visual school is independent from ordinary',()=>{for(const ordinary of ['pale','fess','bend','chevron'])assert.equal(schoolForDoctrine({field:'gules',ordinary,main:'lion',school:'northern'}),'northern');});
test('four schools retain distinct silhouettes',()=>{const paths=Object.keys(HERALDIC_SCHOOLS).map(school=>shieldGeometry({school}).path);assert.equal(new Set(paths).size,4);});
test('evolution changes pose without changing school or palette roles',()=>{const base={field:'azure',ordinary:'fess',main:'lion',school:'knightly'};const a=compositionForDoctrine(base),b=compositionForDoctrine({...base,mainEvolution:'lion-regardant'});assert.notDeepEqual(a.main,b.main);assert.equal(a.school,b.school);const palette=paletteForDoctrine(base);assert.ok(new Set([palette.field,palette.metal,palette.accent]).size>=3);});
