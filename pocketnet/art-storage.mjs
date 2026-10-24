// Build the durable SQLite representation without stringifying unrelated artworks.
// Every key remains tracked for atomic deletion, even if the payload is unchanged.
export function prepareArtworkStorage(state, artRef, dirtyOwner = null) {
  const stored = {...state, assignments: {...state.assignments}, drafts: {...state.drafts}, draftAssemblies: {...state.draftAssemblies}, ballotSprites: {...state.ballotSprites}, ballotAssemblies: {...state.ballotAssemblies}};
  const activeKeys = new Set();
  const updates = [];
  function record(kind, id, strokes) {
    const key = kind + ':' + id;
    activeKeys.add(key);
    if (dirtyOwner === null || dirtyOwner === id) updates.push([key, JSON.stringify(strokes)]);
  }
  for (const [id, item] of Object.entries(stored.assignments || {})) {
    if (!Array.isArray(item?.strokes)) continue;
    record('final', id, item.strokes);
    stored.assignments[id] = {...item, strokes: artRef};
  }
  for (const [id, strokes] of Object.entries(stored.drafts || {})) {
    if (!Array.isArray(strokes)) continue;
    record('draft', id, strokes);
    stored.drafts[id] = artRef;
  }
  for (const [id, item] of Object.entries(stored.draftAssemblies || {})) {
    if (!Array.isArray(item?.strokes)) continue;
    record('assembly', id, item.strokes);
    stored.draftAssemblies[id] = {...item, strokes: artRef};
  }
  // Keep full WebP ballots and their retryable fragments OUT of the 256 KiB
  // room metadata. Only the active owner's blob is rewritten per chunk.
  for(const [id,raster] of Object.entries(stored.ballotSprites||{})){
   if(typeof raster!=='string'||!raster.startsWith('data:image/webp;base64,'))continue;
   record('ballot',id,raster);stored.ballotSprites[id]=artRef;
  }
  for(const [id,assembly] of Object.entries(stored.ballotAssemblies||{})){
   if(!assembly||typeof assembly!=='object'||typeof assembly.data!=='string')continue;
   record('ballot-assembly',id,assembly);stored.ballotAssemblies[id]=artRef;
  }
  return {stored, activeKeys, updates};
}
