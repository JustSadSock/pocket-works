// Build the durable SQLite representation without stringifying unrelated artworks.
// Every key remains tracked for atomic deletion, even if the payload is unchanged.
export function prepareArtworkStorage(state, artRef, dirtyOwner = null) {
  const stored = {...state, assignments: {...state.assignments}, drafts: {...state.drafts}, draftAssemblies: {...state.draftAssemblies}};
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
  return {stored, activeKeys, updates};
}
