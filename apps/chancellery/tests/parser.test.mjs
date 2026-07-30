import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseCampaignBuffer, UnsupportedSaveError } from '../parser.js';

const sample = `EU5txt
# Minimal EU5-like plaintext fixture
meta_data={
  version="1.0.2"
  date=1350.2.3
  player_country=CAS
}
countries={
  CAS={
    tag=CAS
    name="Crown of Castile"
    human=yes
    ruler_name="Alfonso XI"
    treasury=412.5
    monthly_income=18.25
    monthly_expenses=13.5
    manpower=24000
  }
  POR={ tag=POR name="Portugal" treasury=100 }
}
locations={
  1={ owner=CAS population=100000 control=0.8 }
  2={ owner=CAS population=50000 control=0.7 }
  3={ owner=POR population=20000 control=0.9 }
}
armies={
  10={ owner=CAS soldiers=12000 regiments=12 }
  11={ owner=POR soldiers=6000 regiments=6 }
}
navies={
  20={ owner=CAS ships=15 }
}
wars={
  30={ name="War for the Strait" start_date=1349.5.1 attackers=CAS defenders=POR war_goal=conquest }
}
diplomacy={
  40={ source=CAS target=POR opinion=-72 type=rivalry }
}
`;

function writeU16(target, offset, value) {
  target.writeUInt16LE(value, offset);
}

function writeU32(target, offset, value) {
  target.writeUInt32LE(value >>> 0, offset);
}

function createZip(name, content) {
  const nameBytes = Buffer.from(name);
  const source = Buffer.from(content);
  const compressed = deflateRawSync(source);

  const local = Buffer.alloc(30 + nameBytes.length + compressed.length);
  writeU32(local, 0, 0x04034b50);
  writeU16(local, 4, 20);
  writeU16(local, 6, 0x0800);
  writeU16(local, 8, 8);
  writeU32(local, 14, 0);
  writeU32(local, 18, compressed.length);
  writeU32(local, 22, source.length);
  writeU16(local, 26, nameBytes.length);
  writeU16(local, 28, 0);
  nameBytes.copy(local, 30);
  compressed.copy(local, 30 + nameBytes.length);

  const central = Buffer.alloc(46 + nameBytes.length);
  writeU32(central, 0, 0x02014b50);
  writeU16(central, 4, 20);
  writeU16(central, 6, 20);
  writeU16(central, 8, 0x0800);
  writeU16(central, 10, 8);
  writeU32(central, 16, 0);
  writeU32(central, 20, compressed.length);
  writeU32(central, 24, source.length);
  writeU16(central, 28, nameBytes.length);
  writeU16(central, 30, 0);
  writeU16(central, 32, 0);
  writeU16(central, 34, 0);
  writeU16(central, 36, 0);
  writeU32(central, 38, 0);
  writeU32(central, 42, 0);
  nameBytes.copy(central, 46);

  const eocd = Buffer.alloc(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, 1);
  writeU16(eocd, 10, 1);
  writeU32(eocd, 12, central.length);
  writeU32(eocd, 16, local.length);
  writeU16(eocd, 20, 0);

  return Buffer.concat([local, central, eocd]);
}

test('parses a plaintext EU5 campaign into a normalized snapshot', async () => {
  const snapshot = await parseCampaignBuffer(Buffer.from(sample), { fileName: 'castile.eu5' });
  assert.equal(snapshot.metadata.version, '1.0.2');
  assert.equal(snapshot.metadata.date, '1350.02.03');
  assert.equal(snapshot.metadata.tag, 'CAS');
  assert.equal(snapshot.metadata.countryName, 'Crown of Castile');
  assert.equal(snapshot.metadata.ruler, 'Alfonso XI');
  assert.equal(snapshot.economy.treasury, 412.5);
  assert.equal(snapshot.economy.balance, 4.75);
  assert.equal(snapshot.country.population, 150000);
  assert.equal(snapshot.country.territoryCount, 2);
  assert.equal(snapshot.country.averageControl, 0.75);
  assert.equal(snapshot.military.armies, 1);
  assert.equal(snapshot.military.soldiers, 12000);
  assert.equal(snapshot.military.fleets, 1);
  assert.equal(snapshot.military.ships, 15);
  assert.equal(snapshot.wars[0].name, 'War for the Strait');
  assert.equal(snapshot.relations[0].target, 'POR');
  assert.equal(snapshot.metadata.container, 'plaintext');
});

test('parses a ZIP-compressed gamestate', async () => {
  const zip = createZip('gamestate', sample);
  const snapshot = await parseCampaignBuffer(zip, { fileName: 'castile-compressed.eu5' });
  assert.equal(snapshot.metadata.container, 'zip');
  assert.equal(snapshot.metadata.tag, 'CAS');
  assert.deepEqual(snapshot.diagnostics.zipEntries, ['gamestate']);
});

test('rejects binary saves with a stable diagnostic code', async () => {
  const binary = Buffer.concat([Buffer.from('EU5bin\n'), Buffer.from([0, 1, 2, 3, 4, 5, 0, 255])]);
  await assert.rejects(
    () => parseCampaignBuffer(binary, { fileName: 'ironman.eu5' }),
    (error) => error instanceof UnsupportedSaveError && error.code === 'BINARY_SAVE_UNSUPPORTED'
  );
});
