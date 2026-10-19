export const WS_URL = window.location.hostname.includes('netlify')
  ? 'wss://irgri.uk/ws'
  : 'ws://localhost:3000/ws';

export const DEFAULT_ROOM = 'dojo';
