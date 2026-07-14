// ШПИЛЬКА 2.5 — make oversteer recovery distinct even when the base steering saturates.

var shp25BaseAiControlsWithMistakes = aiControls;
aiControls = function shp25AiControlsWithCountersteer(car, dt) {
  const commands = shp25BaseAiControlsWithMistakes(car, dt);
  const mistake = car.shp25Mistake;
  if (mistake?.type !== 'oversteer') return commands;

  const progress = clamp(1 - mistake.remaining / Math.max(0.001, mistake.total), 0, 1);
  const recoveryPulse = Math.sin(progress * Math.PI);
  return {
    ...commands,
    steer: clamp(commands.steer * 0.68 - mistake.direction * 0.32 * recoveryPulse, -1, 1)
  };
};
