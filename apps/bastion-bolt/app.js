import { installMobileRuntime } from '../../shared/mobile-runtime.js';
import { Renderer } from './engine.js';
import { createSiegeScene } from './scene.js';
import { startSiegeGame } from './game.js';

installMobileRuntime();

const $ = id => document.getElementById(id);
const ui = {
  canvas: $('world'), loading: $('loading'), loadingText: $('loadingText'), fallback: $('fallback'),
  topbar: $('topbar'), controls: $('controls'), intro: $('intro'), brief: $('brief'), result: $('result'),
  start: $('startButton'), briefButton: $('briefButton'), briefClose: $('briefClose'), briefStart: $('briefStart'),
  power: $('power'), angle: $('angle'), yaw: $('yaw'), powerOut: $('powerOut'), angleOut: $('angleOut'), yawOut: $('yawOut'),
  ammoRow: $('ammoRow'), fire: $('fireButton'), fireHint: $('fireHint'), reset: $('resetButton'), camera: $('cameraButton'), sound: $('soundButton'),
  targetCard: $('targetCard'), targetName: $('targetName'), targetHealth: $('targetHealth'), targetStatus: $('targetStatus'),
  windCard: $('windCard'), windValue: $('windValue'), windArrow: $('windArrow'), reticle: $('reticle'), rangeLabel: $('rangeLabel'),
  callout: $('shotCallout'), flash: $('impactFlash'), bestHit: $('bestHit'), destroyedCount: $('destroyedCount'), shotCount: $('shotCount'),
  resultKicker: $('resultKicker'), resultTitle: $('resultTitle'), damageValue: $('damageValue'), resultTarget: $('resultTarget'),
  resultDistance: $('resultDistance'), resultTime: $('resultTime'), resultError: $('resultError'), reload: $('reloadButton'), resultReset: $('resultReset'),
};

try {
  const renderer = new Renderer(ui.canvas);
  const scene = createSiegeScene();
  startSiegeGame({ ui, renderer, scene });
} catch (error) {
  ui.loading.hidden = true;
  ui.fallback.hidden = false;
  console.error('Bastion Ballista failed to initialize', error);
}
