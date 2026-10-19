const MESSAGE_TYPES = {
  CLIENT_JOIN: 'join',
  CLIENT_INPUT: 'input',
  CLIENT_READY: 'ready',
  SERVER_ROOM: 'room',
  SERVER_STATE: 'state',
  SERVER_EVENT: 'event'
};

const EVENTS = {
  ROUND_START: 'roundStart',
  ROUND_END: 'roundEnd',
  PARRY: 'parry',
  KILL: 'kill',
  CLASH: 'clash'
};

module.exports = { MESSAGE_TYPES, EVENTS };
