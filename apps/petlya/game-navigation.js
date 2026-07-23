startLevel = function startLevelWithConfirmation(index, reset = false) {
  const target = LEVELS[index];
  const launch = () => {
    ensureSession(index, reset);
    showScreen('game');
    playChord([190, 238], 0.06);
  };
  const hasProgress = Boolean(state.session && (state.session.echoes.length || state.session.current));
  const switchingLevel = Boolean(state.session && state.session.levelId !== target.id);
  if (hasProgress && (switchingLevel || reset)) {
    openConfirm(
      switchingLevel ? 'СМЕНИТЬ КАМЕРУ?' : 'НАЧАТЬ КАМЕРУ ЗАНОВО?',
      switchingLevel ? 'Текущая незавершённая петля будет стёрта.' : 'Текущий маршрут и все эха этой камеры будут стёрты.',
      launch,
      switchingLevel ? 'Сменить' : 'Начать заново'
    );
    return;
  }
  launch();
};
