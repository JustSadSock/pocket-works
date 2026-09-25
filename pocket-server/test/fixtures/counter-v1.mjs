export default {
  protocolVersion: 1,
  createRoom() { return { state: { count: 0 }, events: [] }; },
  onMessage({ state }) { return { state: { count: state.count + 1 }, events: [{ type: 'count', payload: state.count + 1 }] }; }
};
