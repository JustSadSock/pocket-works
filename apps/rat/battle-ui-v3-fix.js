(() => {
  'use strict';

  function hideLegacyHint() {
    const hint = document.querySelector('#orderHint');
    if (hint) hint.hidden = true;
  }

  function repairTempoIndicators() {
    document.querySelectorAll('.regiment-tempo > i').forEach((indicator) => {
      const value = indicator.style.getPropertyValue('--tempo') || '0';
      indicator.parentElement?.style.setProperty('--tempo', value);
      indicator.remove();
    });
  }

  const interfaceStartBattle = startBattle;
  startBattle = function fixedInterfaceStartBattle(options = {}) {
    interfaceStartBattle(options);
    hideLegacyHint();
    repairTempoIndicators();
  };

  const interfaceRenderRegimentBar = renderRegimentBar;
  renderRegimentBar = function fixedInterfaceRegimentBar() {
    interfaceRenderRegimentBar();
    repairTempoIndicators();
  };

  const style = document.createElement('style');
  style.dataset.ratUiFix = '1.3.0';
  style.textContent = `
    .regiment-emblem small,
    .regiment-info small { opacity: 1; }
    .regiment-tempo > i { display: none !important; }
  `;
  document.head.appendChild(style);

  hideLegacyHint();
  repairTempoIndicators();
  globalThis.__RAT_UI_V3_FIXED = true;
})();
