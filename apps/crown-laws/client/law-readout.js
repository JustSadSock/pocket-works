import {BASE_LAWS,CARD_BY_ID,SLOT_LABELS,SLOT_TYPES} from "../shared/game-data.js";

// Pure UI projection. It never substitutes an unplayed decree into match state.
export function lawReadout(state, selectedCardId=null, focusCardId=null, mode=null){
  if (!state || !mode || !["compare","inspect"].includes(mode)) return null;
  const selected = selectedCardId && CARD_BY_ID[selectedCardId] || null;
  const inspected = focusCardId && (CARD_BY_ID[focusCardId] || Object.values(BASE_LAWS).find(l=>l.id===focusCardId)) || null;
  const card = mode==="compare" ? selected : inspected;
  if(!card || !SLOT_TYPES.includes(card.slot))return null;
  const slot = card.slot;
  const active = CARD_BY_ID[state.slots[slot]?.activeCardId] || BASE_LAWS[slot];
  const comparison=mode==="compare" && !!selected;
  const same=!!(comparison && active.id===card.id);
  return {
    slot,label:SLOT_LABELS[slot],active,card,comparison,same,
    selectedId:selected?.id||null,
    categoryMatches:!!selected&&selected.slot===slot,
    activeIsBase:active.id===BASE_LAWS[slot].id,
    status:comparison?(same?"Указ уже действует":"Замена действующего закона"):"Действует для обоих игроков",
    mode
  };
}
export function lawSlotsView(state,selectedCardId=null,inspectedSlot=null){
  const proposed=selectedCardId && CARD_BY_ID[selectedCardId]||null;
  return SLOT_TYPES.map(slot=>{
    const active=CARD_BY_ID[state.slots[slot]?.activeCardId]||BASE_LAWS[slot];
    return {slot,active,selected:proposed?.slot===slot,inspected:inspectedSlot===slot,
      base:active.id===BASE_LAWS[slot].id,selectedLaw:proposed?.slot===slot?proposed:null};
  });
}
