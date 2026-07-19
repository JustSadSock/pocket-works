(() => {
  'use strict';

  const baseBeginCommandGesture = globalThis.beginCommandGesture;
  globalThis.beginCommandGesture = function guardedCommandGesture(event) {
    if (!simulation?.metrics) return false;
    return baseBeginCommandGesture(event);
  };

  const commandUpdateRegiment = Simulation.prototype.updateRegiment;
  Simulation.prototype.updateRegiment = function commandInertiaAnchor(regiment, dt) {
    const anchorX = regiment.anchorX;
    const anchorY = regiment.anchorY;
    commandUpdateRegiment.call(this, regiment, dt);
    if (!this.demo && regiment.team === 0 && regiment.commandState?.transition > 0) {
      regiment.anchorX = lerp(anchorX, regiment.anchorX, .34);
      regiment.anchorY = lerp(anchorY, regiment.anchorY, .34);
    }
  };

  const style = document.createElement('style');
  style.textContent = '.command-pip::before{height:100%!important;transform-origin:bottom;transform:scaleY(var(--charge,0))}';
  document.head.appendChild(style);
})();
