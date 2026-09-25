import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const WIRE_VERSION = 1;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function tokenFor(secret, player) {
  const body = Buffer.from(JSON.stringify({ id: randomUUID(), name: player.name, expires: Date.now() + 7 * 86400_000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyToken(secret, token) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const player = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof player.id === 'string' && typeof player.name === 'string' && player.expires > Date.now() ? player : null;
  } catch { return null; }
}

export function parseMessage(data) {
  if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES) throw new Error('message_too_large');
  const value = JSON.parse(String(data));
  if (!value || typeof value !== 'object' || value.wireVersion !== WIRE_VERSION || typeof value.type !== 'string') throw new Error('invalid_message');
  return value;
}

export function send(socket, type, payload = {}) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ wireVersion: WIRE_VERSION, type, ...payload }));
}
