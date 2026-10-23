// ZAMAZKA receives a private authoritative snapshot using its subsequent sync
// game event. The initial room_joined envelope must not disclose the unfiltered
// server state (including other players' concealed artwork) or duplicate its
// potentially multi-megabyte gallery payload.
export function roomJoinView(room, getProjectedView) {
  if (room.gameId === 'zamazka') {
    return { phase: room.state?.phase || 'lobby' };
  }
  return getProjectedView();
}
