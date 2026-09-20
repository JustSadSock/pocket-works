import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  POCKET_LAN,
  createPocketLan,
  decodePocketLanSignal,
  encodePocketLanSignal,
  getPocketLanEnvironment
} from '../shared/capabilities/lan.js';

const root = process.cwd();
const errors = [];
const fail = (message) => errors.push(message);

const source = await readFile(path.join(root, 'shared/capabilities/lan.js'), 'utf8');
for (const fragment of [
  'export function createPocketLan',
  'export function getPocketLanEnvironment',
  'export function encodePocketLanSignal',
  'export function decodePocketLanSignal',
  'RTCPeerConnection',
  'iceServers: []',
  'PocketWorksLAN',
  'createInvite',
  'completeInvite',
  'reliability === \'realtime\''
]) {
  if (!source.includes(fragment)) fail(`shared/capabilities/lan.js must include ${fragment}`);
}
if (/https?:\/\//.test(source)) fail('shared/capabilities/lan.js must not depend on a remote runtime service');

const sample = {
  schema: 'pocket-lan-signal',
  wireVersion: POCKET_LAN.wireVersion,
  kind: 'offer',
  applicationId: 'validation-game',
  protocolVersion: 3,
  inviteId: 'invite-test',
  room: { id: 'room-test', name: 'Validation room' },
  description: { type: 'offer', sdp: 'v=0\r\na=validation:✓\r\n' }
};
const encoded = encodePocketLanSignal(sample);
const decoded = decodePocketLanSignal(encoded);
if (!encoded.startsWith(POCKET_LAN.signalPrefix)) fail('PocketLAN signal prefix is missing');
if (decoded.description?.sdp !== sample.description.sdp) fail('PocketLAN pairing signal does not round-trip Unicode SDP');

try { decodePocketLanSignal('garbage'); fail('PocketLAN must reject foreign pairing strings'); } catch { /* expected */ }
try { createPocketLan({ applicationId: 'bad id with spaces' }); fail('PocketLAN must reject unsafe application IDs'); } catch { /* expected */ }

const environment = getPocketLanEnvironment({ bridge: null });
if (!['webrtc-manual', 'unsupported'].includes(environment.preferredMode)) fail('PocketLAN browser environment returned an invalid mode');

const nativeClient = {
  getCapabilities: async () => ({ supported: true, mode: 'native-lan', automaticDiscovery: true }),
  discoverRooms: async () => [],
  hostRoom: async () => ({ id: 'native-room' }),
  joinRoom: async () => ({ id: 'native-room' })
};
const delegated = createPocketLan({
  applicationId: 'validation-game',
  bridge: { createClient: () => nativeClient }
});
if (delegated !== nativeClient) fail('PocketLAN did not delegate to the native LAN provider');

const docs = await readFile(path.join(root, 'docs/POCKET-LAN.md'), 'utf8');
for (const fragment of ['same Wi-Fi', 'hotspot', 'Guest Wi-Fi', 'createPocketLan', 'createInvite', 'completeInvite', 'PocketWorksLAN', 'Service Worker']) {
  if (!docs.includes(fragment)) fail(`docs/POCKET-LAN.md must document ${fragment}`);
}

if (errors.length) {
  console.error(`PocketLAN validation failed with ${errors.length} issue${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('PocketLAN protocol, offline signaling fallback and native-provider contract passed validation.');
