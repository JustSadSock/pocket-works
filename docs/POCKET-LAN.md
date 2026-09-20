# PocketLAN â€” local device-to-device networking

PocketLAN is the shared Pocket Works contract for multiplayer, collaboration, controller links and any other device-to-device feature that should work on a local network without a cloud backend.

The application-facing API lives in `shared/capabilities/lan.js`.

## What â€œlocal networkâ€ means

PocketLAN is transport-agnostic. Devices do not have to use the same physical connection method; they need IP reachability inside the same local network.

Supported topology examples for the native provider:

- two phones on the same Wi-Fi router;
- one device on Wi-Fi and another on Ethernet behind the same LAN/router;
- devices connected to the same phone hotspot, even when that hotspot has no global internet connection;
- a normal home mesh where peers are allowed to communicate;
- a LAN with no WAN/internet route at all.

A network can still block peer traffic. Guest Wi-Fi, AP/client isolation, separate VLANs, enterprise firewall policy or multicast filtering may prevent discovery or direct connections. Applications must show a useful â€œlocal devices cannot reach each otherâ€ state rather than claiming that internet access is required.

## Architecture

PocketLAN deliberately has two provider tiers behind one application contract.

### 1. Native LAN provider â€” preferred UX

A future/native Pocket Works shell injects `globalThis.PocketWorksLAN` with a `createClient(config)` function. `createPocketLan()` automatically delegates to it.

The native provider is responsible for:

- Bonjour/mDNS or the platform-equivalent service discovery;
- direct local socket transport;
- reliable ordered traffic for lobby, commands and durable events;
- low-latency realtime traffic for input/state snapshots where the platform supports it;
- local-network permission prompts and clear denial/error results;
- room lifecycle, reconnect and peer identity;
- preserving the public PocketLAN room/message API documented here.

On Apple platforms the intended implementation is Network.framework + Bonjour/mDNS. Android or desktop wrappers may use their platform equivalents. Applications must never import those platform APIs directly.

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

`getCapabilities()` should report `mode: 'native-lan'`, `automaticDiscovery: true` and the supported reliable/realtime features.

### 2. Browser WebRTC fallback â€” works today, no server

A normal PWA/browser cannot advertise a Bonjour service, listen on arbitrary TCP/UDP ports or scan the LAN. PocketLAN does not fake those capabilities.

When no native provider exists, `createPocketLan()` uses WebRTC DataChannel with `iceServers: []`. This means:

- there is no STUN server;
- there is no TURN relay;
- there is no signaling server;
- media is not requested;
- the resulting gameplay connection is direct peer-to-peer;
- global internet is not required when peers can reach each other locally.

Because the browser cannot do zero-server LAN discovery, the two devices exchange an offline pairing package. The core exposes the package as a portable `PWL1...` string. An app may present it as QR, Nearby Share/AirDrop, copy/paste or another local UX without changing the network protocol.

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

Use a stable `applicationId` owned by the app. Increment `protocolVersion` when wire-level gameplay messages become incompatible.

### Native automatic room flow

```js
const room = await lan.hostRoom({
  name: 'Ilyaâ€™s game',
  maxPlayers: 4,
  metadata: { mode: 'duel', map: 'yard' }
});

room.on('message', ({ peer, type, payload }) => {
  handleNetworkMessage(peer, type, payload);
});
```

On the joining device:

```js
const rooms = await lan.discoverRooms({ timeoutMs: 1500 });
const room = await lan.joinRoom(rooms[0]);
```

Applications should prefer this flow whenever `capabilities.automaticDiscovery === true`.

### Browser/offline manual pairing flow

Host:

```js
const room = await lan.hostRoom({ name: 'Local match', maxPlayers: 2 });
const offer = await room.createInvite();
// Render/share `offer` locally. A QR UI is recommended on phones.
```

Joining device:

```js
const { room, answer } = await lan.joinInvite(offerFromHost);
// Return `answer` to the host locally.
```

Host finishes the pairing:

```js
await room.completeInvite(answerFromClient);
```

After that exchange, the pairing UI is no longer involved. Messages travel directly between devices.

A host can call `createInvite()` repeatedly for more peers up to `maxPlayers`. Pending invites can be removed with `cancelInvite()`.

## Messaging

PocketLAN exposes two semantics rather than forcing game code to care about TCP, UDP or DataChannel details.

Reliable/default:

```js
room.send(peerId, 'ready', { ready: true });
room.broadcast('round-start', { seed, startsAt });
```

Realtime/unreliable:

```js
room.broadcast('input', { frame, steer, throttle }, { reliability: 'realtime' });
```

Use reliable traffic for lobby state, purchases, inventory, match transitions, authoritative events and anything that must arrive in order. Use realtime traffic for frequent inputs, aim vectors, transforms and replaceable snapshots where a stale packet is worse than a missing packet.

PocketLAN validates application/protocol identity and enforces conservative message-size limits. Applications must still validate every payload. A peer is untrusted input.

## Recommended simulation model

For realtime games, prefer an authoritative host:

```text
clients -> compact input commands -> host simulation
host -> snapshots/events -> clients
```

Do not run two independent authoritative simulations and hope they remain deterministic unless the game was explicitly engineered for lockstep networking.

Useful defaults:

- inputs: 20â€“60 Hz depending on the game;
- snapshots: 10â€“30 Hz with interpolation;
- durable game events: reliable channel;
- cosmetic/transient state: realtime channel;
- include simulation tick/frame numbers in gameplay messages;
- cap queues and drop stale realtime state.

Host migration is not part of the browser fallback contract. If a game needs seamless host migration, design it as a game-level protocol and use native-provider capabilities when available.

## Room and event surface

Browser rooms expose:

- `room.id`, `room.name`, `room.role`, `room.info`, `room.localPlayer`;
- `room.listPeers()`;
- `room.send(peerId, type, payload, options)`;
- `room.broadcast(type, payload, options)`;
- `room.on('peerjoin' | 'peerleave' | 'message' | 'state' | 'error' | 'close', callback)`;
- `room.close()`;
- host-only fallback helpers `createInvite()`, `completeInvite()` and `cancelInvite()`.

Native rooms should preserve the same common surface. Provider-specific diagnostics may be added without making applications depend on them.

## Lifecycle

A LAN-enabled app must:

1. create PocketLAN only after application identity/profile state is ready;
2. close the room when the user explicitly leaves the multiplayer session;
3. decide whether `pagehide`/backgrounding means suspend/reconnect or leave, based on the game;
4. stop high-frequency sends while hidden;
5. show reconnect/disconnected states instead of silently freezing;
6. never erase unrelated local progress when a network session fails.

For an offline-first app, multiplayer is an additional capability. The rest of the application should continue to work when no peer is available.

## Service Worker / offline packaging

PocketLAN has no remote runtime dependency. Any app that imports it must cache the module in its own Service Worker shell:

```js
'../../shared/capabilities/lan.js'
```

Enhanced apps must make the equivalent file available in their production bundle/cache. Do not add a cloud signaling dependency merely to make development easier.

## User experience requirements

Native provider:

- primary action: **Create local game**;
- nearby rooms should appear automatically;
- do not ask users for IP addresses or ports;
- explain the local-network permission in product language;
- if nothing is found, suggest the same Wi-Fi/hotspot and mention guest-network isolation;
- internet status is irrelevant and must not be used as a â€œLAN unavailableâ€ signal.

Browser fallback66³°¢Ò6ÆV&Ç’Æ&VÂv†–6‚FWf–6R66ç2÷6†&W2æW‡C°¢Ò&WF–â6æ6VÂ÷&WG'’7F–öã°¢Òöæ6R—&VBÂ†–FR6–væÆ–ærFWF–Ç2æB6†÷ræ÷&ÖÂÆ–W"&W6Væ6R÷–ærU‚à ¤æWfW"W‡÷6R&r4EÂ”4R6æF–FFW2Â6ö6¶WBFG&W76W2÷"'&÷w6W"W'&÷"7G&–æw2Fòæ÷&ÖÂW6W'2à ¢226V7W&—G’æB6ö×F–&–Æ—G ¢ÒG&VBVW'22VçG'W7FVBà¢ÒfÆ–FFRÖW76vRG—VæB–ÆöB6†R&Vf÷&R×WFF–ærvÖR7FFRà¢ÒæWfW"W†V7WFR&V6V—fVB6öFR÷"…DÔÂà¢Ò¶VW6V7&WG2ÂWF‚Fö¶Vç2æBVç&VÆFVBÆö6Â7FFR÷WBöb&ööÒÖWFFFà¢ÒW6RÆ–6F–öä–FFò&WfVçB66–FVçFÂ7&÷72Ö—&–ærà¢ÒW6R&÷Fö6öÅfW'6–öæFò&V¦V7B–æ6ö×F–&ÆR'V–ÆG2FVÆ–&W&FVÇ’à¢Ò&÷VæBÖW76vR6—¦RæB6VæBg&WVVæ7’à¢ÒW6RÖÆWfVÂWF†÷&—¦F–öâ–bÄâ7F–öâ6âffV7BfÇV&ÆR÷W'6—7FVçBFFà ¥F†RfÆÆ&6²—&–ær6¶vR—26öææV7F–öâÖWFFFÂæ÷BW6W"–FVçF—G’÷"WF†VçF–6F–öâ7—7FVÒà ¢22FW7BÖG&—€ ¤&Vf÷&R6†—–ærÄâfVGW&RÂFW7BBÖ–æ–×VÓ  £â6ÖRv’Ôf’Â–çFW&æWBf–Æ&ÆS°£"â6ÖRv’Ôf’ÂtâövÆö&Â–çFW&æWB–çFVçF–öæÆÇ’Væf–Æ&ÆS°£2âöæR†öæR†÷G7÷Bv—F‚æòW7G&VÒ–çFW&æWB²æ÷F†W"†öæR6öææV7FVBFò—C°£Bâv’Ôf’²WF†W&æWBöâF†R6ÖR&÷WFVBÄâv†VâF†RF&vWBFWf–6W27W÷'B—C°£Râ&6¶w&÷VæB÷&W7VÖRæBFV×÷&'’v’Ôf’Æ÷73°£bâ–æ6ö×F–&ÆR&÷Fö6öÅfW'6–öæ°£râ&ööÒgVÆÂò†÷7BÆVfW2òVW"ÆVfW3°£‚âwVW7Bv’Ôf’÷"6Æ–VçBÖ—6öÆFVBæWGv÷&³¢W6VgVÂf–ÇW&RwV–Fæ6RÂæò–æf–æ—FR7–ææW#°£’â&WVFVB7&VFRö¦ö–âöÆVfRv—F†÷WBÆV¶VB6W76–öç3°£â&VÇF–ÖR6¶WBÆ÷72÷7FÆR×7FFR&V†f–÷"f÷"7F–öâvÖW2à ¤'&÷w6W"fÆÆ&6²Ç6òæVVG2F†R6ö×ÆWFRöffW"öç7vW"—&–ærfÆ÷rFW7FVB–â6f&’õvV$¶—BæB6‡&öÖ—VÒà ¢22v†Vâæ÷BFòW6Rö6¶WDÄà ¥W6Rö6¶WDÄâf÷"æV&'’VW'2F†B6†÷VÆB6öÖ×Væ–6FRv—F†÷WB6Æ÷VB&6¶VæBâFòæ÷BW6R—Bf÷"vÆö&ÂÖF6†Ö¶–ærÂ7–æ6‡&öæ÷W2–çFW&æWBÆ’Â7&÷72ÖæWGv÷&²g&–VæG2Â6Æ÷VB6fW2÷"6W'fW"ÖWF†÷&—FF—fR6ö×WF—F—fR6V7W&—G’âF†÷6R&WV—&Râ–çFW&æWB6W'f–6R'’FVf–æ—F–öâà 