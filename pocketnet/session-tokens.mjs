// PocketNet session credentials are random 256-bit bearer tokens.
// Persist only a one-way digest; the wire protocol still uses the raw token.
const TOKEN_RE = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

export function isSessionToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

export async function sessionTokenKey(token) {
  if (!isSessionToken(token)) throw new TypeError('invalid_session_token');
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  return 'sha256:' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Existing sessions from before this migration remain valid for the rest of
// their original TTL. Each successful authentication upgrades its row in
// place, without exposing plaintext tokens in newly written records.
export async function findSessionByToken(query, rawToken, now = Date.now()) {
  const hashed = await sessionTokenKey(rawToken);
  const statement = 'SELECT id, name, account_id, avatar FROM sessions WHERE token = ? AND expires > ?';
  const current = query(statement, hashed, now).toArray()[0];
  if (current) return current;
  const legacy = query(statement, rawToken, now).toArray()[0];
  if (legacy) query('UPDATE sessions SET token = ? WHERE token = ?', hashed, rawToken);
  return legacy || null;
}
