function bindEvents() {
  dom.startButton.addEventListener('click', () => { if (state.active) resumeCampaign(); else startNewCampaign(); });
  dom.newCampaignButton.addEventListener('click', startNewCampaign);
  dom.resultButton.addEventListener('click', startNewCampaign);
  dom.commitSeal.addEventListener('click', commitRound);
  dom.soundButton.addEventListener('click', toggleSound);
  dom.sourceButtons.forEach((button) => button.addEventListener('click', () => toggleSource(button.dataset.source)));
  setupToolDrag(dom.lensTool, 'lens'); setupToolDrag(dom.shieldTool, 'shield');
  document.addEventListener('pointerdown', (event) => {
    if (!armedTool) return;
    const insideTool = event.target.closest?.('[data-tool]'); const insideCity = event.target.closest?.('.city-button');
    if (!insideTool && !insideCity) disarmTool();
  }, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestDraw(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') disarmTool();
    if ((event.key === 'Enter' || event.key === ' ') && !dom.commitSeal.disabled && document.activeElement === document.body) { event.preventDefault(); commitRound(); }
  });
}
function setupResizeHandling() {
  if ('ResizeObserver' in window) { resizeObserver = new ResizeObserver(resizeCanvas); resizeObserver.observe(dom.mapPaper); }
  else window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120), { passive: true });
}
function registerServiceWorkerFallback() {
  if (!('serviceWorker' in navigator) || document.querySelector('[data-update-manager]')) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), { once: true });
}
function init() {
  loadState(); buildCityButtons(); bindEvents(); setupResizeHandling(); registerServiceWorkerFallback(); updateAllUi(); showIntro();
  requestAnimationFrame(() => { resizeCanvas(); requestDraw(); });
}
init();
