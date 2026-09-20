const SIGNAL_PREFIX = 'PWL1.';
const SIGNAL_SCHEMA = 'pocket-lan-signal';
const MESSAGE_SCHEMA = 'pocket-lan-message';
const WIRE_VERSION = 1;
const RELIABLE_LABEL = 'pocketlan-reliable-v1';
const REALTIME_LABEL = 'pocketlan-realtime-v1';
const DEFAULT_MAX_RELIABLE_BYTES = 64 * 1024;
const DEFAULT_MAX_REALTIME_BYTES = 24 * 1024;
const DEFAULT_ICE_TIMEOUT_MS = 7000;

function requireText(value, label, maxLength = 128) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`);
  const text = value.trim();
  if (text.length > maxLength) throw new RangeError(`${label} must be at most ${maxLength} characters`);
  return text;
}

function normalizeApplicationId(value) {
  const id = requireText(value, 'applicationId', 96);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i.test(id)) {
    throw new TypeError('applicationId may contain letters, numbers, dots, underscores and hyphens');
  }
  return id;
}

function normalizeProtocolVersion(value) {
  const version = value ?? 1;
  if (!Number.isInteger(version) || version < 1) throw new TypeError('protocolVersion must be a positive integer');
  return version;
}

function cloneJson(value, label = 'value') {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new TypeError(`${label} must be JSON-serializable`);
  }
}

function randomId(prefix = 'peer') {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues?.(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function toBase64Url(value) {
  const bytes = utf8Bytes(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const encoded = typeof btoa === 'function'
    ? btoa(binary)
    : globalThis.Buffer?.from(binary, 'binary').toString('base64');
  if (!encoded) throw new Error('Base64 encoding is unavailable');
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = typeof atob === 'function'
    ? atob(padded)
    : globalThis.Buffer?.from(padded, 'base64').toString('binary');
  if (binary == null) throw new Error('Base64 decoding is unavailable');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function createEmitter() {
  const listeners = new Map();
  return {
    on(type, callback) {
      if (typeof callback !== 'function') throw new TypeError('event callback must be a function');
      const bucket = listeners.get(type) || new Set();
      bucket.add(callback);
      listeners.set(type, bucket);
      return () => bucket.delete(callback);
    },
    emit(type, detail) {
      for (const callback of listeners.get(type) || []) {
        try { callback(detail); }
        catch (error) { queueMicrotask(() => { throw error; }); }
      }
      for (const callback of listeners.get('*') || []) {
        try { callback({ type, detail }); }
        catch (error) { queueMicrotask(() => { throw error; }); }
      }
    },
    clear() { listeners.clear(); }
  };
}

function normalizePlayer(player = {}, fallbackName = 'Player') {
  return {
    id: typeof player.id === 'string' && player.id.trim() ? player.id.trim() : randomId('player'),
    name: typeof player.name === 'string' && player.name.trim() ? player.name.trim().slice(0, 48) : fallbackName,
    metadata: cloneJson(player.metadata || {}, 'player.metadata')
  };
}

function normalizeRoomOptions(options = {}) {
  return {
    id: typeof options.id === 'string' && options.id.trim() ? options.id.trim().slice(0, 96) : randomId('room'),
    name: typeof options.name === 'string' && options.name.trim() ? options.name.trim().slice(0, 64) : 'Local game',
    maxPlayers: Number.isInteger(options.maxPlayers) && options.maxPlayers >= 2 ? Math.min(options.maxPlayers, 16) : 2,
    metadata: cloneJson(options.metadata || {}, 'room.metadata')
  };
}

function assertSignalCompatibility(signal, config, expectedKind) {
  if (signal.schema !== SIGNAL_SCHEMA || signal.wireVersion !== WIRE_VERSION) throw new TypeError('Unsupported PocketLAN pairing signal');
  if (signal.applicationId !== config.applicationId) throw new Error(`Pairing signal belongs to ${signal.applicationId}, not ${config.applicationId}`);
  if (signal.protocolVersion !== config.protocolVersion) throw new Error(`PocketLAN protocol mismatch: expected ${config.protocolVersion}, received ${signal.protocolVersion}`);
  if (expectedKind && signal.kind !== expectedKind) throw new TypeError(`Expected a ${expectedKind} pairing signal`);
}

function createWireMessage(config, sender, sequence, kind, body) {
  return {
    schema: MESSAGE_SCHEMA,
    wireVersion: WIRE_VERSION,
    applicationId: config.applicationId,
    protocolVersion: config.protocolVersion,
    senderId: sender.id,
    sequence,
    sentAt: Date.now(),
    kind,
    ...body
  };
}

function parseWireMessage(raw, config) {
  let message;
  try { message = JSON.parse(raw); }
  catch { throw new TypeError('PocketLAN received malformed JSON'); }
  if (message?.schema !== MESSAGE_SCHEMA || message?.wireVersion !== WIRE_VERSION) throw new TypeError('PocketLAN received an unsupported message envelope');
  if (message.applicationId !== config.applicationId) throw new Error('PocketLAN message belongs to another application');
  if (message.protocolVersion !== config.protocolVersion) throw new Error('PocketLAN message protocol mismatch');
  return message;
}

function ensureMessageSize(serialized, maximum, label) {
  const bytes = utf8Bytes(serialized).byteLength;
  if (bytes > maximum) throw new RangeError(`${label} exceeds the ${maximum}-byte PocketLAN limit`);
  return bytes;
}

function waitForIceGatheringComplete(connection, timeoutMs = DEFAULT_ICE_TIMEOUT_MS) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => { if (connection.iceGatheringState === 'complete') finish(); };
    const timer = setTimeout(finish, timeoutMs);
    connection.addEventListener('icegatheringstatechange', check);
  });
}

function createRtcConnection() {
  if (typeof globalThis.RTCPeerConnection !== 'function') throw new PocketLanUnavailableError('WebRTC DataChannel is unavailable in this browser');
  return new globalThis.RTCPeerConnection({ iceServers: [] });
}

function channelIsOpen(channel) {
  return channel?.readyState === 'open';
}

function closeQuietly(target) {
  try { target?.close?.(); } catch { /* best-effort cleanup */ }
}

function makePeerTransport({ connection, reliable, realtime, config, localPlayer, expectedPeerId = null, onReady, onMessage, onState }) {
  let reliableChannel = reliable;
  let realtimeChannel = realtime;
  let remotePlayer = null;
  let sequence = 0;
  let announced = false;
  let readyAnnounced = false;
  let closed = false;

  const sendSerialized = (serialized, reliability) => {
    const channel = reliability === 'realtime' ? realtimeChannel : reliableChannel;
    if (!channelIsOpen(channel)) throw new PocketLanStateError(`PocketLAN ${reliability} channel is not open`);
    channel.send(serialized);
  };

  const sendHello = () => {
    if (!channelIsOpen(reliableChannel) || announced) return;
    announced = true;
    const serialized = JSON.stringify(createWireMessage(config, localPlayer, sequence++, 'hello', { player: localPlayer }));
    ensureMessageSize(serialized, config.maxReliableBytes, 'PocketLAN hello');
    reliableChannel.send(serialized);
  };

  const configureChannel = (channel, reliability) => {
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => {
      if (reliability === 'reliable') sendHello();
      onState?.('channel-open', { reliability });
    });
    channel.addEventListener('close', () => onState?.('channel-close', { reliability }));
    channel.addEventListener('error', (event) => onState?.('channel-error', { reliability, event }));
    channel.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      try {
        ensureMessageSize(event.data, reliability === 'realtime' ? config.maxRealtimeBytes : config.maxReliableBytes, `PocketLAN ${reliability} incoming message`);
        const message = parseWireMessage(event.data, config);
        if (message.kind === 'hello') {
          const player = normalizePlayer(message.player || {}, 'Peer');
          if (expectedPeerId && player.id !== expectedPeerId) throw new Error('PocketLAN peer identity does not match the pairing signal');
          remotePlayer = player;
          if (!readyAnnounced) {
            readyAnnounced = true;
            onReady?.(player);
          }
          return;
        }
        if (message.kind !== 'data' || !remotePlayer) return;
        const messageType = requireText(message.type, 'received message type', 96);
        onMessage?.({
          peer: remotePlayer,
          type: messageType,
          payload: message.payload,
          reliability,
          sequence: message.sequence,
          sentAt: message.sentAt
        });
      } catch (error) {
        onState?.('protocol-error', { error });
      }
    });
    if (channel.readyState === 'open' && reliability === 'reliable') sendHello();
  };

  if (reliableChannel) configureChannel(reliableChannel, 'reliable');
  if (realtimeChannel) configureChannel(realtimeChannel, 'realtime');

  if (!reliableChannel || !realtimeChannel) {
    connection.addEventListener('datachannel', (event) => {
      if (event.channel.label === RELIABLE_LABEL && !reliableChannel) {
        reliableChannel = event.channel;
        configureChannel(reliableChannel, 'reliable');
      } else if (event.channel.label === REALTIME_LABEL && !realtimeChannel) {
        realtimeChannel = event.channel;
        configureChannel(realtimeChannel, 'realtime');
      }
    });
  }

  connection.addEventListener('connectionstatechange', () => onState?.('connection-state', { state: connection.connectionState }));
  connection.addEventListener('iceconnectionstatechange', () => onState?.('ice-state', { state: connection.iceConnectionState }));

  return {
    connection,
    get remotePlayer() { return remotePlayer; },
    send(type, payload, options = {}) {
      if (closed) throw new PocketLanStateError('PocketLAN peer is closed');
      const reliability = options.reliability === 'realtime' ? 'realtime' : 'reliable';
      const normalizedType = requireText(type, 'message type', 96);
      const message = createWireMessage(config, localPlayer, sequence++, 'data', {
        type: normalizedType,
        payload: cloneJson(payload, 'message payload')
      });
      const serialized = JSON.stringify(message);
      ensureMessageSize(serialized, reliability === 'realtime' ? config.maxRealtimeBytes : config.maxReliableBytes, `PocketLAN ${reliability} message`);
      sendSerialized(serialized, reliability);
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      closeQuietly(reliableChannel);
      closeQuietly(realtimeChannel);
      closeQuietly(connection);
    }
  };
}

function createBrowserRoom({ config, roomInfo, localPlayer, role }) {
  const events = createEmitter();
  const peers = new Map();
  const pendingInvites = new Map();
  let closed = false;

  const addPeerTransport = (key, transport) => {
    peers.set(key, transport);
    return transport;
  };

  const removePeer = (key, reason = 'closed') => {
    const transport = peers.get(key);
    if (!transport) return;
    const peer = transport.remotePlayer;
    transport.close();
    peers.delete(key);
    if (peer) events.emit('peerleave', { peer, reason });
  };

  const room = {
    id: roomInfo.id,
    name: roomInfo.name,
    role,
    mode: 'webrtc-manual',
    info: cloneJson(roomInfo),
    localPlayer: cloneJson(localPlayer),
    on: events.on,
    listPeers() {
      return Array.from(peers.values()).map((transport) => transport.remotePlayer).filter(Boolean).map((peer) => cloneJson(peer));
    },
    send(peerId, type, payload, options = {}) {
      for (const transport of peers.values()) {
        if (transport.remotePlayer?.id === peerId) return transport.send(type, payload, options);
      }
      throw new PocketLanStateError(`PocketLAN peer ${peerId} is not connected`);
    },
    broadcast(type, payload, options = {}) {
      let count = 0;
      for (const transport of peers.values()) {
        if (!transport.remotePlayer) continue;
        try { transport.send(type, payload, options); count += 1; }
        catch (error) { events.emit('error', { error, peer: transport.remotePlayer }); }
      }
      return count;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const transport of peers.values()) transport.close();
      for (const pending of pendingInvites.values()) closeQuietly(pending.connection);
      peers.clear();
      pendingInvites.clear();
      events.emit('close', { roomId: roomInfo.id });
      events.clear();
    }
  };

  if (role === 'host') {
    room.createInvite = async () => {
      if (closed) throw new PocketLanStateError('PocketLAN room is closed');
      const activeCount = peers.size + pendingInvites.size + 1;
      if (activeCount >= roomInfo.maxPlayers) throw new PocketLanStateError('PocketLAN room is full');
      const inviteId = randomId('invite');
      const connection = createRtcConnection();
      const reliable = connection.createDataChannel(RELIABLE_LABEL, { ordered: true });
      const realtime = connection.createDataChannel(REALTIME_LABEL, { ordered: false, maxRetransmits: 0 });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIceGatheringComplete(connection, config.iceGatheringTimeoutMs);
      const signal = encodePocketLanSignal({
        schema: SIGNAL_SCHEMA,
        wireVersion: WIRE_VERSION,
        kind: 'offer',
        applicationId: config.applicationId,
        protocolVersion: config.protocolVersion,
        inviteId,
        room: roomInfo,
        host: localPlayer,
        description: connection.localDescription
      });
      pendingInvites.set(inviteId, { connection, reliable, realtime });
      events.emit('invite', { inviteId, signal });
      return signal;
    };

    room.completeInvite = async (answerSignal) => {
      if (closed) throw new PocketLanStateError('PocketLAN room is closed');
      const answer = decodePocketLanSignal(answerSignal);
      assertSignalCompatibility(answer, config, 'answer');
      const pending = pendingInvites.get(answer.inviteId);
      if (!pending) throw new PocketLanStateError('PocketLAN invite is missing, expired or already completed');
      pendingInvites.delete(answer.inviteId);
      await pending.connection.setRemoteDescription(answer.description);
      const key = answer.peer?.id || answer.inviteId;
      const transport = makePeerTransport({
        ...pending,
        config,
        localPlayer,
        expectedPeerId: answer.peer?.id || null,
        onReady(peer) {
          if (peer.id !== key) {
            peers.delete(key);
            peers.set(peer.id, transport);
          }
          events.emit('peerjoin', { peer: cloneJson(peer) });
        },
        onMessage(message) { events.emit('message', message); },
        onState(type, detail) {
          events.emit('state', { peerId: transport.remotePlayer?.id || key, type, ...detail });
          if (type === 'connection-state' && ['failed', 'closed'].includes(detail.state)) removePeer(transport.remotePlayer?.id || key, detail.state);
        }
      });
      addPeerTransport(key, transport);
      return true;
    };

    room.cancelInvite = (signalOrInviteId) => {
      let inviteId = signalOrInviteId;
      if (typeof signalOrInviteId === 'string' && signalOrInviteId.startsWith(SIGNAL_PREFIX)) inviteId = decodePocketLanSignal(signalOrInviteId).inviteId;
      const pending = pendingInvites.get(inviteId);
      if (!pending) return false;
      closeQuietly(pending.connection);
      pendingInvites.delete(inviteId);
      return true;
    };
  }

  room._addPeerTransport = addPeerTransport;
  room._events = events;
  return room;
}

async function joinBrowserInvite(config, localPlayer, offerSignal) {
  const offer = decodePocketLanSignal(offerSignal);
  assertSignalCompatibility(offer, config, 'offer');
  const roomInfo = normalizeRoomOptions(offer.room || {});
  const room = createBrowserRoom({ config, roomInfo, localPlayer, role: 'client' });
  const connection = createRtcConnection();
  let transport;
  transport = makePeerTransport({
    connection,
    config,
    localPlayer,
    expectedPeerId: offer.host?.id || null,
    onReady(peer) { room._events.emit('peerjoin', { peer: cloneJson(peer) }); },
    onMessage(message) { room._events.emit('message', message); },
    onState(type, detail) {
      room._events.emit('state', { peerId: transport.remotePlayer?.id || offer.host?.id || null, type, ...detail });
      if (type === 'connection-state' && ['failed', 'closed'].includes(detail.state)) room.close();
    }
  });
  room._addPeerTransport(offer.host?.id || offer.inviteId, transport);
  await connection.setRemoteDescription(offer.description);
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await waitForIceGatheringComplete(connection, config.iceGatheringTimeoutMs);
  const answerSignal = encodePocketLanSignal({
    wireVersion: WIRE_VERSION,
    kind: 'answer',
    applicationId: config.applicationId,
    protocolVersion: config.protocolVersion,
    inviteId: offer.inviteId,
    roomId: roomInfo.id,
    peer: localPlayer,
    description: connection.localDescription
  });
  return { room, answer: answerSignal, host: cloneJson(offer.host || null) };
}

function browserCapabilities() {
  const webrtc = typeof globalThis.RTCPeerConnection === 'function';
  return {
    supported: webrtc,
    mode: webrtc ? 'webrtc-manual' : 'unsupported',
    directPeerToPeer: webrtc,
    worksWithoutInternet: webrtc,
    automaticDiscovery: false,
    manualPairing: webrtc,
    reliableChannel: webrtc,
    realtimeChannel: webrtc,
    hostMigration: false,
    reason: webrtc ? 'Browser fallback requires an offline pairing exchange because web pages cannot advertise/listen for arbitrary LAN services.' : 'WebRTC DataChannel is unavailable.'
  };
}

function validateNativeClient(client) {
  for (const method of ['getCapabilities', 'discoverRooms', 'hostRoom', 'joinRoom']) {
    if (typeof client?.[method] !== 'function') throw new TypeError(`PocketWorksLAN native client must implement ${method}()`);
  }
  return client;
}

export class PocketLanUnavailableError extends Error {
  constructor(message) { super(message); this.name = 'PocketLanUnavailableError'; }
}

export class PocketLanStateError extends Error {
  constructor(message) { super(message); this.name = 'PocketLanStateError'; }
}

export function encodePocketLanSignal(payload) {
  if (!payload || typeof payload !== 'object') throw new TypeError('PocketLAN signal payload must be an object');
  return `${SIGNAL_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

export function decodePocketLanSignal(signal) {
  const normalized = requireText(signal, 'PocketLAN pairing signal', 2_000_000);
  if (!normalized.startsWith(SIGNAL_PREFIX)) throw new TypeError('Not a PocketLAN pairing signal');
  let value;
  try { value = JSON.parse(fromBase64Url(normalized.slice(SIGNAL_PREFIX.length))); }
  catch { throw new TypeError('PocketLAN pairing signal is corrupted'); }
  if (value?.schema !== SIGNAL_SCHEMA || value?.wireVersion !== WIRE_VERSION) throw new TypeError('Unsupported PocketLAN pairing signal');
  return value;
}

export function getPocketLanEnvironment(options = {}) {
  const bridge = options.bridge ?? globalThis.PocketWorksLAN ?? null;
  const nativeBridge = Boolean(bridge && typeof bridge.createClient === 'function');
  const webrtc = typeof globalThis.RTCPeerConnection === 'function';
  return {
    nativeBridge,
    webrtc,
    preferredMode: nativeBridge ? 'native-lan' : (webrtc ? 'webrtc-manual' : 'unsupported')
  };
}

export function createPocketLan(options = {}) {
  const config = {
    applicationId: normalizeApplicationId(options.applicationId),
    protocolVersion: normalizeProtocolVersion(options.protocolVersion),
    maxReliableBytes: Number.isInteger(options.maxReliableBytes) && options.maxReliableBytes > 0 ? options.maxReliableBytes : DEFAULT_MAX_RELIABLE_BYTES,
    maxRealtimeBytes: Number.isInteger(options.maxRealtimeBytes) && options.maxRealtimeBytes > 0 ? options.maxRealtimeBytes : DEFAULT_MAX_REALTIME_BYTES,
    iceGatheringTimeoutMs: Number.isInteger(options.iceGatheringTimeoutMs) && options.iceGatheringTimeoutMs >= 1000 ? options.iceGatheringTimeoutMs : DEFAULT_ICE_TIMEOUT_MS
  };
  const localPlayer = normalizePlayer(options.player || { name: options.displayName }, options.displayName || 'Player');
  const bridge = options.bridge ?? globalThis.PocketWorksLAN ?? null;

  if (bridge && typeof bridge.createClient === 'function') {
    return validateNativeClient(bridge.createClient({ ...config, player: cloneJson(localPlayer) }));
  }

  return {
    mode: 'browser',
    localPlayer: cloneJson(localPlayer),
    async getCapabilities() { return browserCapabilities(); },
    async discoverRooms() { return []; },
    async hostRoom(roomOptions = {}) {
      if (typeof globalThis.RTCPeerConnection !== 'function') throw new PocketLanUnavailableError('This browser cannot create PocketLAN sessions');
      return createBrowserRoom({ config, roomInfo: normalizeRoomOptions(roomOptions), localPlayer, role: 'host' });
    },
    async joinRoom() {
      throw new PocketLanUnavailableError('Automatic LAN room joining requires the PocketWorks native LAN provider; use joinInvite() in the browser fallback');
    },
    async joinInvite(signal) {
      if (typeof globalThis.RTCPeerConnection !== 'function') throw new PocketLanUnavailableError('This browser cannot create PocketLAN sessions');
      return joinBrowserInvite(config, localPlayer, signal);
    }
  };
}

export const POCKET_LAN = Object.freeze({
  wireVersion: WIRE_VERSION,
  signalPrefix: SIGNAL_PREFIX,
  reliableLabel: RELIABLE_LABEL,
  realtimeLabel: REALTIME_LABEL,
  defaultMaxReliableBytes: DEFAULT_MAX_RELIABLE_BYTES,
  defaultMaxRealtimeBytes: DEFAULT_MAX_REALTIME_BYTES
});
