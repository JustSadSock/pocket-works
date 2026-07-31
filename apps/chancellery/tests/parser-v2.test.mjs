import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCampaignFile } from '../parser-v2.js';

const SAMPLE = `EU5txt
meta_data={ date=1450.1.2 start_date=1337.1.1 player=POL version="1.0.4" }
countries={ POL={ tag=POL name="Poland" treasury=245.5 income=31 expenses=22 manpower=18000 ruler_name="Kazimierz" } }
locations={ 101={ owner=POL name="Krakow" population=120000 control=0.82 trade_good=cloth culture=polish religion=catholic market=krakow buildings={ market=1 town=1 } food=12 } 102={ owner=POL name="Poznan" population=80000 control=41 trade_good=grain culture=polish religion=catholic market=poznan unrest=7 buildings={ workshop=1 } } 103={ owner=BOH name="Prague" population=150000 control=90 trade_good=glass } }
estates={ nobles={ name="Nobles" power=42 satisfaction=31 } burghers={ name="Burghers" power=25 satisfaction=58 } }
markets={ krakow={ name="Krakow market" owner=POL value=55 } }
loans={ first={ amount=100 interest=4 } }`;

test('enriches a base save with locations, goods, estates, markets and debt', async () => {
  const file = new File([SAMPLE], 'poland.eu5', { type: 'text/plain' });
  const snapshot = await parseCampaignFile(file);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.metadata.tag, 'POL');
  assert.equal(snapshot.locations.length, 3);
  assert.equal(snapshot.locations[0].control, 82);
  assert.equal(snapshot.country.territoryCount, 2);
  assert.equal(snapshot.goods.find((item) => item.name === 'cloth').count, 1);
  assert.equal(snapshot.estates.length, 2);
  assert.equal(snapshot.markets.length, 1);
  assert.equal(snapshot.economy.totalDebt, 100);
  assert.deepEqual(snapshot.locations[0].buildings.sort(), ['market', 'town']);
});
