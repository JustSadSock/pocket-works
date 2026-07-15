const pauseButton = document.querySelector('#pauseButton');
const startOverlay = document.querySelector('#startOverlay');
const tutorialOverlay = document.querySelector('#tutorialOverlay');
const pauseOverlay = document.querySelector('#pauseOverlay');
const resultOverlay = document.querySelector('#resultOverlay');
const scoreValue = document.querySelector('#scoreValue');
const levelValue = document.querySelector('#levelValue');
const pauseScore = document.querySelector('#pauseScore');
const pauseLevel = document.querySelector('#pauseLevel');

let suspendedActiveRun = false;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    suspendedActiveRun = !pauseButton.hidden
      && startOverlay.hidden
      && tutorialOverlay.hidden
      && pauseOverlay.hidden
      && resultOverlay.hidden;
    return;
  }

  if (!suspendedActiveRun) return;
  suspendedActiveRun = false;
  pauseScore.textContent = scoreValue.textContent;
  pauseLevel.textContent = levelValue.textContent;
  pauseOverlay.hidden = false;
});
