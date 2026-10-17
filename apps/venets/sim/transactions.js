// All goods movements use accounts. External flows are explicit and audited.
const GOODS = new Set(['grain', 'coin']);
export function recordEvent(world, kind, cause, effect) {
  if (typeof kind !== 'string' || !kind || typeof cause !== 'string' || !cause) throw new TypeError('Event kind and cause required');
  const seq = world.nextEventId++;
  const event = { id: seq, year: world.year, kind, cause, effect };
  world.events.push(event);
  return event;
}
function account(world, key) {
  if (key === null) return null;
  if (typeof key !== 'string') throw new TypeError('Invalid account key');
  const [kind, id] = key.split(':');
  if (!id || !['person','province'].includes(kind)) throw new TypeError('Unknown account type: ' + key);
  const entity = kind === 'person' ? world.people.find(p => p.id === id) : world.provinces.find(p => p.id === id);
  if (!entity) throw new RangeError('Missing account: ' + key);
  return entity.treasury;
}
export function transfer(world, { good, from = null, to = null, amount, cause }) {
  if (!GOODS.has(good)) throw new TypeError('Invalid good');
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Transfer must be a nonnegative integer');
  if (from === null && to === null) throw new TypeError('Transfer requires a source or destination');
  if (from === to) throw new TypeError('Cannot transfer to the same account');
  if (typeof cause !== 'string' || !cause) throw new TypeError('A causal label is required');
  // Fully validate before mutation so a rejected transfer has no partial effect.
  const source = account(world, from), target = account(world, to);
  if (source && source[good] < amount) throw new RangeError('Insufficient ' + good + ' in ' + from);
  if (target && !Number.isSafeInteger(target[good] + amount)) throw new RangeError('Target account overflow');
  if (from === null && !Number.isSafeInteger(world.ledger.created[good] + amount)) throw new RangeError('Created ledger overflow');
  if (to === null && !Number.isSafeInteger(world.ledger.consumed[good] + amount)) throw new RangeError('Consumed ledger overflow');
  if (amount === 0) return null;
  if (source) source[good] -= amount; else world.ledger.created[good] += amount;
  if (target) target[good] += amount; else world.ledger.consumed[good] += amount;
  return recordEvent(world, 'transfer', cause, { good, from, to, amount });
}
export function changeTitleHolder(world, { titleId, newHolderId, cause }) {
  const title = world.titles.find(t => t.id === titleId);
  if (!title || !world.people.some(p => p.id === newHolderId && p.alive)) throw new RangeError('Unknown title or deceased holder');
  if (!cause || typeof cause !== 'string') throw new TypeError('Cause required');
  if (title.holderId === newHolderId) return null;
  const oldHolderId = title.holderId;
  title.holderId = newHolderId;
  if (Array.isArray(title.history)) title.history.push({year:world.year,from:oldHolderId,to:newHolderId,cause});
  return recordEvent(world, 'title-transfer', cause, { titleId, oldHolderId, newHolderId });
}
