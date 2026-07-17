
for (const button of el.modeChoices.querySelectorAll('button')) {
  button.addEventListener('click', () => { mode = button.dataset.value; syncChoices(); });
}
for (const button of el.levelChoices.querySelectorAll('button')) {
  button.addEventListener('click', () => { level = button.dataset.value; syncChoices(); });
}
el.startButton.addEventListener('click', () => startGame());
el.resumeButton.addEventListener('click', loadGame);
el.menuButton.addEventListener('click', () => openSheet(el.menuSheet));
el.continueButton.addEventListener('click', closeSheets);
el.newGameButton.addEventListener('click', confirmNewGame);
el.rulesButton.addEventListener('click', () => openSheet(el.rulesSheet));
el.rulesStartButton.addEventListener('click', () => openSheet(el.rulesSheet));
el.menuRulesButton.addEventListener('click', () => openSheet(el.rulesSheet));
el.auditStartButton.addEventListener('click', () => openSheet(el.auditSheet));
el.menuAuditButton.addEventListener('click', () => openSheet(el.auditSheet));
el.sheetBackdrop.addEventListener('click', closeSheets);
for (const button of document.querySelectorAll('[data-close-sheet]')) button.addEventListener('click', closeSheets);
el.swapButton.addEventListener('click', claimSwap);
el.declineSwapButton.addEventListener('click', declineSwap);
el.undoButton.addEventListener('click', undo);
el.clearButton.addEventListener('click', clearSelection);
el.azureReserveButton.addEventListener('click', () => toggleDeploy(PLAYER.AZURE));
el.ochreReserveButton.addEventListener('click', () => toggleDeploy(PLAYER.OCHRE));
el.resignButton.addEventListener('click', resign);
el.rematchButton.addEventListener('click', () => { closeSheets(); startGame({ alternate: true }); });
el.resultHomeButton.addEventListener('click', showStart);
el.soundToggle.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); });
el.hapticToggle.addEventListener('click', () => { settings.haptic = !settings.haptic; saveSettings(); });
el.tutorialCard.addEventListener('click', () => {
  localStorage.setItem(TUTORIAL_KEY, '1');
  el.tutorialCard.classList.add('hidden');
});

try { createWorkshopMode({ root: document.querySelector('[data-app-shell]'), appId: 'seam' }); } catch {}
try { watchConnectivity(); } catch {}

saveSettings();
syncChoices();
refreshResume();
showStart();
