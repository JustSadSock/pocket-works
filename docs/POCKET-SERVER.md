# Pocket Server

Pocket Server is the single long-running WebSocket process for internet play. The existing PocketLAN capability remains the zero-server option for local play. The launcher and applications remain hosted through the existing Cloudflare production pipeline; only the online game backend runs on Lightsail.

## Contract

An online game owns `apps/<game>/server/module.ts` and `module.json`. Its module is bundled into one ESM file by `pocket-server/scripts/modules.mjs`, hashed, and published by the `pocket-server-modules` workflow after it reaches `main`.

`module.json`:

```json
{ "gameId": "my-game", "protocolVersion": 1 }
```

`module.ts` exports a default object implementing `PocketModule` from `../../../pocket-server/module-contract.d.ts`:

```ts
import type { PocketModule } from '../../../pocket-server/module-contract.js';

type State = { turn: number };
const module: PocketModule<State> = {
  protocolVersion: 1,
  createRoom() { return { state: { turn: 0 } }; },
  onMessage({ state, payload }) {
    // Validate payload and player authority here.
    return { state: { turn: state.turn + 1 }, events: [{ type: 'turn', payload: state.turn + 1 }] };
  }
};
export default module;
```

The game client imports `shared/capabilities/net.js`, creates `new PocketNet({ serverUrl, name })`, calls `connect()`, then `createRoom(gameId)` or `joinRoom(roomId)`. It listens for `room_joined`, `game_event`, `presence`, `room_closed`, `error`, and `disconnected`. The client can run PocketLAN as a separate local mode. The online endpoint is configured per application; never put the deployment token in browser code.

The server owns connections, guest session tokens, room membership, reconnect, version routing, snapshots, and JSON logs. A room keeps its module hash through reconnect and process restart. Publishing verifies the checksum and worker contract before switching the current version. New rooms use that version. Old workers remain until their rooms end. Abandoned rooms with no connected players expire after 30 minutes. Failed publication leaves the previous version active. Snapshot files under `POCKET_DATA_DIR` are the state source of truth; back this directory up. A module update does not migrate an active match.

The current identity system is a signed guest token. It identifies one browser profile for reconnect; it is not PocketWorks account authentication. Game modules must validate each action and enforce turn ownership. Modules execute as trusted repository code in workers, not as a security sandbox for arbitrary third-party uploads.

## Local development

Requires Node 22 or later.

```sh
npm ci --prefix pocket-server
npm test --prefix pocket-server
node pocket-server/scripts/modules.mjs
PORT=8788 node pocket-server/src/main.mjs
```

Set a development `POCKET_SERVER_URL=http://localhost:8788` in the game's local configuration. The server generates an ephemeral auth secret in development unless one is supplied. To publish local modules, set the same `POCKET_DEPLOY_TOKEN` on the server and in the shell, then run `node pocket-server/scripts/modules.mjs --publish`. Localhost HTTP is allowed for development; remote publishing requires HTTPS.

## Lightsail handoff

1. Create one Linux Lightsail instance and a static IP. Point a domain such as `games.example.com` to it. Open inbound 80/443; keep port 8788 private.
2. Install Node 22, Caddy, and Git. Clone this repository to `/opt/pocket-works`, then run `npm ci --prefix pocket-server --omit=dev`.
3. Create a `pocketserver` service account and `/var/lib/pocket-server`, owned by that account. Copy `.env.example` to `/etc/pocket-server.env`, fill in long independent random values, set mode 600, and set `POCKET_ALLOWED_ORIGINS` to the actual PocketWorks site origin.
4. Install `deploy/pocket-server.service` as a systemd unit, and adapt `deploy/Caddyfile.example` for the domain. Start both services. Verify `https://games.example.com/health` returns `{ "ok": true }`.
5. Set GitHub Actions variable `POCKET_SERVER_URL` to that HTTPS origin, and secret `POCKET_DEPLOY_TOKEN` to the same deployment token as on the server. Run the `Pocket Server modules` workflow once. Future changes to `apps/*/server/**` on `main` publish automatically.
6. Configure each game's client with the public HTTPS origin, test a full match and reconnect, and take regular backups of `/var/lib/pocket-server`.

Deploying a new core version still requires updating the service checkout and restarting it. Game module updates do not restart the core. A single Lightsail instance has no high availability; a host outage interrupts live sockets. Persisted rooms reload after restart, but a game must tolerate its clients reconnecting.

## Operations

- Health: `GET /health`
- Guest token: `POST /session` with `{ "name": "..." }`
- Publish: `POST /admin/modules` with Bearer deployment token and `{ gameId, protocolVersion, bundle, sha256 }`
- WebSocket: `/ws`, protocol version 1
- Logs: `journalctl -u pocket-server`

The server should sit behind HTTPS; browser clients connect over `wss://`. The admin endpoint uses a separate high-entropy secret. Rotate it if exposed and update both `/etc/pocket-server.env` and the GitHub secret.
