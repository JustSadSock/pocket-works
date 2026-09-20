# PocketLAN - local device-to-device networking

PocketLAN is the shared Pocket Works contract for multiplayer, collaboration, controller links and other device-to-device features that should work on a local network without a cloud backend.

The application-facing API lives in `shared/capabilities/lan.js`.

## Network model

PocketLAN is transport-agnostic. Devices do not need the same physical connection method; they need peer reachability inside the same local network.

Expected topologies for a native LAN provider include:

- two phones on the same Wi-Fi router;
- one device on Wi-Fi and another on Ethernet behind the same routed LAN;
- devices connected to the same phone hotspot, even when that hotspot has no global internet connection;
- a normal home mesh where peers are allowed to communicate;
- a LAN with no WAN/internet route at all.

A network can still block peer traffic. Guest Wi-Fi, AP/client isolation, separate VLANs, enterprise firewall policy or multicast filtering can prevent discovery or direct connections. User-facing copy should describe that as a local-network isolation problem, not as a missing internet connection.

Do not use `navigator.onLine` as a LAN-readiness test.

## Architecture

PocketLAN deliberately has two provider tiers behind one application contract.

### Native LAN provider - preferred UX

A future/native Pocket Works shell can inject:

```js
globalThis.PocketWorksLAN
```

with a `createClient(config)` function. `createPocketLan()` automatically delegates to it.

The native provider is responsible for:

- Bonjour/mDNS or a platform-equivalent local service discovery mechanism;
- direct local socket transport;
- reliable ordered traffic for lobby state, commands and durable events;
- low-latency realtime traffic for replaceable input/state snapshots where supported;
- local-network permission prompts and useful denial/error results;
- room lifecycle, reconnect and peer identity;
- preserving the public PocketLAN room/message API.

On Apple platforms the intended implementation is Network.framework plus Bonjour/mDNS. Android or desktop wrappers may use platform equivalents. Applications must not import those platform APIs directly.

The injected bridge client must implement at least:

```js
const client = globalThis.PocketWorksLAN.createClient({
  applicationId,
  protocolVersion,
  player,
  maxReliableBytes,
  maxRealtimeBytes
});

await client.getCapabilities();
await client.discoverRooms(options);
await client.hostRoom(options);
await client.joinRoom(roomDescriptor, options);
```

`getCapabilities()` should report `mode: 'native-lan'` and `automaticDiscovery: true` when automatic room discovery is available.

### Browser WebRTC fallback - works without a server

A normal PWA/browser cannot advertise a Bonjour service, listen on arbitrary TCP/UDP ports or scan the LAN. PocketLAN does not pretend otherwise.

When no native provider exists, `createPocketLan()` uses WebRTC DataChannel with:

```js
{ iceServers: [] }
```

Therefore the fallback has:

- no STUN server;
- no TURN relay;
- no cloud signaling server;
- no media requirement;
- a direct peer-to-peer gameplay connection;
- no global internet requirement when peers can reach each other locally.

Because a browser cannot perform zero-server LAN discovery, peers exchange one offline pairing package before the direct connection is established. The core represents that package as a portable `PWL1...` string. A product UI may move it by QR, local share/AirDrop/Nearby Share, copy/paste or another offline channel.

## Basic integration

```js
import { createPocketLan } from '../../shared/capabilities/lan.js';

const lan = createPocketLan({
  applicationId: 'my-game',
  protocolVersion: 1,
  displayName: profile.name,
  player: {
    id: profile.localId,
    name: profile.name,
    metadata: { skin: profile.skin }
  }
});

const capabilities = await lan.getCapabilities();
```

Use a stable app-owned `applicationId`. Increment `protocolVersion` when wire-level gameplay messages become incompatible.

## Native automatic room flow

Host:

```js
const room = await lan.hostRoom({
  name: "Ilya's game",
  maxPlayers: 4,
  metadata: { mode: 'duel', map: 'yard' }
});

room.on('message', ({ peer, type, payload }) => {
  handleNetworkMessage(peer, type, payload);
});
```

Joining device:

```js
const rooms = await lan.discoverRooms({ timeoutMs: 1500 });
const room = await lan.joinRoom(rooms[0]);
```

Prefer this flow whenever `capabilities.automaticDiscovery === true`.

## Browser/offline manual pairing flow

Host:

```js
const room = await lan.hostRoom({
  name: 'Local match',
  maxPlayers: 2
});

const offer = await room.createInvite();
// Render/share offer locally. QR is recommended on phones.
```

Joining device:

```js
const { room, answer } = await lan.joinInvite(offerFromHost);
// Return answer to the host through the same offline UX.
```

Host finishes pairing:

```js
await room.completeInvite(answerFromClient);
```

Once `completeInvite()` succeeds, the pairing UI is no longer involved. Gameplay messages travel directly between peers.

A host can call `createInvite()` repeatedly for additional peers up to `maxPlayers`. A pending invite can be removed with `cancelInvite()`.

## Messaging

PocketLAN exposes semantics instead of forcing game code to care about TCP, UDP or DataChannel details.

Reliable/default:

```js
room.send(peerId, 'ready', { ready: true });
room.broadcast('round-start', { seed, startsAt });
```

Realtime/replaceable:

```js
room.broadcast(
  'input',
  { frame, steer, throttle },
  { reliability: 'realtime' }
);
```

Use reliable traffic for lobby state, purchases, inventory, match transitions, authoritative events and anything that must arrive in order.

Use realtime traffic for frequent inputs, aim vectors, transforms and replaceable snapshots where a stale packet is worse than a missing packet.

PocketLAN validates application/protocol identity and bounds serialized message size. The application must still validate every received `type` and payload shape before mutating state.

## Recommended simulation model

For realtime games, default to a host-authoritative simulation:

```text
clients -> compact input commands -> host simulation
host -> snapshots/events -> clients
```

Useful starting points:

- inputs: 20-60 Hz depending on the game;
- snapshots: 10-30 Hz with interpolation;
- durable events: reliable channel;
- cosmetic/transient state: realtime channel;
- include simulation tick/frame numbers;
- cap queues and drop stale realtime state.

Do not run multiple independent authoritative simulations and assume they will remain synchronized unless the game is deliberately engineered for deterministic lockstep.

Host migration is not part of the browser fallback contract. If a game needs seamless host migration, design it as an explicit game-level protocol and use native-provider capabilities when available.

## Room surface

Browser rooms expose:

- `room.id`, `room.name`, `room.role`, `room.info`, `room.localPlayer`;
- `room.listPeers()`;
- `room.send(peerId, type, payload, options)`;
- `room.broadcast(type, payload, options)`;
- `room.on('peerjoin' | 'peerleave' | 'message' | 'state' | 'error' | 'close', callback)`;
- `room.close()`;
- host-only fallback helpers `createInvite()`, `completeInvite()`, `cancelInvite()`.

Native rooms should preserve the same common surface so app code does not fork by transport.

## Lifecycle

A LAN-enabled app should:

1. create PocketLAN only after local player/profile identity is ready;
2. close the room when the user explicitly leaves the multiplayer session;
3. define whether page/background transitions mean suspend/reconnect or leave;
4. stop high-frequency sends while hidden;
5. show disconnected/reconnecting state instead of silently freezing;
6. preserve unrelated local progress if networking fails.

For an offline-first app, multiplayer is an additional capability. Networking failure must not break unrelated offline/local functionality.

## Service Worker and offline packaging

PocketLAN has no remote runtime dependency.

Any app that imports it must cache the module in its own Service Worker app shell:

```js
'../../shared/capabilities/lan.js'
```

Enhanced apps must make the equivalent module available through their production bundle/cache.

Do not add a cloud signaling dependency merely to make development easier.

## UX requirements

### Native provider

- primary action: Create local game;
- nearby rooms appear automatically;
- never ask normal users for IP addresses or ports;
- explain the local-network permission in product language;
- if no room is found, suggest the same Wi-Fi/hotspot and mention Guest Wi-Fi/client isolation;
- internet status is irrelevant and must not be used as a LAN-unavailable signal.

### Browser fallback

- present pairing as a short guided two-device flow;
- QR is the preferred phone UI, with copy/share as fallback;
- clearly indicate which device scans/shares next;
- keep cancel/retry available;
- after pairing, hide signaling details and show normal player/ping presence.

Never expose raw SDP, ICE candidates, socket addresses or browser error strings to normal users.

## Security and compatibility

- Treat peers as untrusted input.
- Validate message types and payload shapes.
- Never execute received code or HTML.
- Keep secrets, auth tokens and unrelated local state out of room metadata.
- Use `applicationId` to prevent accidental cross-app pairing.
- Use `protocolVersion` to reject incompatible builds.
- Bound message size and send frequency.
- Use app-level authorization if a LAN action can modify valuable persistent data.

The pairing package is connection metadata, not user identity or authentication.

## Test matrix

Before shipping a LAN feature, test at minimum:

1. same Wi-Fi with internet available;
2. same Wi-Fi with WAN/global internet intentionally unavailable;
3. one phone hotspot with no upstream internet plus another phone connected to it;
4. Wi-Fi plus Ethernet on the same routed LAN when target devices support it;
5. temporary Wi-Fi loss and resume;
6. incompatible `protocolVersion`;
7. room full, host leaves and peer leaves;
8. Guest Wi-Fi/client-isolated network with useful failure guidance;
9. repeated create/join/leave without leaked sessions;
10. realtime packet loss/stale-state behavior for action games.

The browser fallback also needs the complete offer/answer pairing flow exercised in Safari/WebKit and Chromium.

## When not to use PocketLAN

Use PocketLAN for nearby peers that should communicate without a cloud backend.

Do not use it for global matchmaking, asynchronous internet play, cross-network friends, cloud saves or server-authoritative competitive security. Those require an internet service by definition.
