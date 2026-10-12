# Pocket ID — identity foundation (2026-10-12)

Pocket ID is a persistent account system in the **existing** Pocket Works Cloudflare Worker.
It deliberately does **not** synchronize game saves, paintings, achievements or friends yet.
Those future capabilities can read the account from `GET /pocket-id/me` once access-control
and versioned save contracts are added.

## Storage and deployments

The `PocketIdentity` **SQLite-backed Durable Object** is independent of `PocketNetHub`.
It is provisioned by the `pocket-id-sqlite-v1` Wrangler migration, using the same
Cloudflare Workers Free plan. No new D1 database or separate VM has to be created.
All users are currently stored in the one object named `pocket-id-global-v1` so the
`nickname_key UNIQUE` constraint is atomic **across the entire library**.

Database tables:
- `accounts` (UUID, optional Google `sub`, unique normalized nickname, preset avatar,
  hashed recovery key and creation/update times).
- `login_sessions` (SHA-256 token hash, account UUID and expiry).
- `oauth_states` (hashed CSRF state, browser binding, PKCE verifier, optional link account).
- `recovery_limits` (persistent registration/recovery/OAuth rate limits per IP).

**Important:** these are real server-side identity records. Keep a backup/export strategy
before running database migrations at scale. The existing PocketNet guest token is
unchanged and **does not** provide Pocket ID authorization.

## Features

- Sign up with a unique Unicode nickname (3–20 characters; letters, digits, `_`, `-`,
  case-insensitive after NFKC) and one of eight curated vector avatars.
- New account receives a high-entropy recovery key in `PW1-UUID.secret` format.
  Store it privately outside the browser; the plaintext key cannot be retrieved.
- Sign in with a recovery key on another device; rotate it from an authenticated profile.
- Google OAuth 2.0 (server-side code exchange, PKCE S256, state and browser cookies,
  Google userinfo, verified email required). Linking Google to an existing recovery-key
  account keeps its nickname and account UUID.
- Secure HttpOnly, SameSite=Lax, host-only cookies; 30-day server-side sessions.
- Account deletion and cloud backup/export are **not** implemented yet.
- Local saves and games continue working without Pocket ID.

## Google Cloud — one-time owner action

Google authorization requires credentials owned by the Pocket Works administrator.
The GitHub repository intentionally includes **no client secret**.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview)
   and configure the consent screen (External for regular Gmail accounts).
   For Testing mode, add each intended Google account under Test users.
2. In **Clients**, create an OAuth Client ID of type **Web application**.
   Under **Authorized redirect URIs** add exactly:
   `https://YOUR_POCKET_WORKS_DOMAIN/pocket-id/callback/google`
   Replace the hostname with the **actual** production Pocket Works origin.
3. In **Cloudflare Dashboard → Workers & Pages → pocket-works → Settings → Variables
   and Secrets**, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as encrypted
   secrets to the Worker. Alternatively use `npx wrangler secret put GOOGLE_CLIENT_ID`
   and `npx wrangler secret put GOOGLE_CLIENT_SECRET` with the correct Cloudflare account.
4. Deploy/redeploy and open `/pocket-id/config`.
   It should return `googleEnabled: true`. The Google button will appear automatically.
5. Test login, sign-out, profile creation, and Google linking from an existing key account.

OAuth login requires the exact same production origin for callback and cookies.
Do not share any secret in chat, source control, screenshots or frontend JS.
If credentials are absent, the login route returns a clear 503 and the UI hides
the Google action. Recovery-key accounts remain fully usable.

## Stage A — Pocket ID in applications (2026-10-12)

Implemented integrations:

- **ЗАМАЗКА 1.10** — account nickname automatically fills the restoration-room
  entry field; verified nicknames are read-only, the server supplies the actual
  account name, and the lobby/results show verified avatar badges. Hand-drawn
  player seals remain independently editable and device-local.
- **ФЛАГПОСТ 1.1** — verified player nicknames and avatars in entry, lobby,
  battle information and scores.
- **ЛЕНТА 1.1** — current account nickname and visual avatar in music-studio
  tracks, with local guest fallback. **PocketLAN is peer-to-peer** and cannot
  cryptographically establish that another peer owns a Google account; avatar
  artwork received over PocketLAN is never displayed as a server-verification badge.

Reusable frontend capability: `shared/capabilities/identity.js`. Apps call
`getPocketIdentity({force:true})`, `preferredPocketName(user, guestName)`,
`pocketAvatarMarkup(avatar)`, and `pocketPlayerBadge(player)`. The library
exposes `/?pocket-id=login` for returning to the profile sheet.

Online room identity is verified **at the Worker edge** on
`POST /pocketnet/session` and the `/pocketnet/ws` handshake using the
HttpOnly Pocket ID cookie. The Worker strips all inbound `x-pw-*` identity
headers before attaching the server-validated identity. The PocketNet
Durable Object accepts identity metadata only from this edge proxy:

- Online sessions store a persistent optional `account_id`, nickname and
  preset avatar. Legacy guest rows are migrated additively with nullable
  account columns. No guest can claim a verified member badge.
- The server overwrites any client-provided nickname with the
  account's currently registered nickname.
- All unauthenticated nicknames are prefixed `Гость · `.
- A room cannot contain two simultaneous seats with the same account UUID.
- PocketNet tokens are bound to the currently verified Pocket ID on WebSocket
  authentication. A stolen account token without its valid session cookie,
  or with another user's cookie, is rejected.
- Nickname/portrait changes refresh on reconnection without changing the
  user's room seat or game scores.
- Token caching in `shared/capabilities/net.js` distinguishes account IDs
  from guests, preventing a guest token being reused after sign-in or the
  reverse after sign-out.

No cloud saves, drawings, music compositions, friends, achievements or
cross-device game-state sync are implemented in this stage. Those remain the
planned Pocket Cloud and Pocket Social follow-ups.

Security test: `node pocketnet/test/identity.mjs` inside local Wrangler
tests account impersonation, forged HTTP headers, name collisions, token
theft, account-switch rejection, verified avatar/name propagation, same-account
double joins, and logout.

## HTTP API

All endpoints start with `/pocket-id/`, are same-origin and return uncached JSON
except OAuth redirects.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `config` | Google enabled flag and avatar preset identifiers |
| GET | `me` | Current user or `null`; safe public fields only |
| GET | `nickname?value=` | Non-authoritative availability hint |
| POST | `register` | Create account; return one-time-shown recovery key |
| POST | `recover` | Sign in with recovery key |
| POST | `profile` | Update own nickname and avatar |
| POST | `new-key` | Rotate recovery key (old key invalid immediately) |
| POST | `logout` | Revoke current session |
| GET | `login/google` | OAuth 2.0 authorization start |
| GET | `callback/google` | OAuth 2.0 code exchange, redirect home |

POST actions require `Origin` matching request origin and
`Content-Type: application/json`. Server-generated sessions are in
`__Host-pw-id`, never localStorage. Call `window.PocketID.getUser()`,
`window.PocketID.refresh()` and subscribe to the `pocket-id:changed` document event
in future launcher integrations. Apps must **not** trust the event as authentication;
they must ask the backend to validate the session and data ownership.

## Testing

Local Wrangler smoke test:
```sh
npx wrangler dev --local --port 8787
node pocket-id/test/edge.mjs
```

PocketNet Edge CI runs this alongside its room/WebSocket suite, ensuring new
account functionality does not break the existing multiplayer backend.

## Stage C — one profile interface (PocketWorks 0.10.11)

For signed-in players, the existing Pocket ID launcher button opens the Pocket Social card, which is now the single profile editor. It edits the nickname, drawn avatar, background, frame, favorite game and privacy settings, and offers Friends and Invitations as neighboring tabs. Pocket ID's separate dialog handles **authentication and account security only** (Google, recovery key, sign-out, and first-time account creation). The older editable badge grid and signed-in Pocket ID appearance editor have been removed from the user flow. Older badge presets remain secure fallbacks; they are not a second customization surface. Direct links from games use `/?pocket-id=profile` to open the unified card.
