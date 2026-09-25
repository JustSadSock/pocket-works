export default {
  protocolVersion: 1,
  createRoom() { return { state: { count: 100 }, events: [] }; },
  onMessage({ state }) { return { state: { count: state.count + 10 }, events: [{ type: 'count', payload: state.count + 10 }] }; }
};
