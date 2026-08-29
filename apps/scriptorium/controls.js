export function createControls(options) {
  const {
    getState,
    mutate,
    addFigure,
    addObject,
    applyPalette,
    useStory,
    clearSelection,
    syncSelectionUi,
    updateHistoryButtons,
    svgFor,
    FORMATS,
    BACKGROUNDS,
    FRAMES,
    ORNAMENTS,
    FIGURES,
    OBJECTS,
    HEADWEAR,
    HELD,
    PALETTES,
    STORIES
  } = options;

  function buildControls() {
    const state = getState();
    fillSegmented('formatChoices', FORMATS, state.format, (key) => mutate(() => { getState().format = key; clearSelection(); }));
    fillChoices('backgroundChoices', BACKGROUNDS, state.background, (key) => mutate(() => { getState().background = key; }), true);
    fillChoices('frameChoices', labelMap(FRAMES), state.frame, (key) => mutate(() => { getState().frame = key; }));
    fillChoices('ornamentChoices', labelMap(ORNAMENTS), state.ornament, (key) => mutate(() => { getState().ornament = key; }));
    fillSegmented('inscriptionPosition', { top: { label: 'Сверху' }, bottom: { label: 'Снизу' } }, state.inscriptionPosition, (key) => mutate(() => { getState().inscriptionPosition = key; }));

    const figureStamps = document.getElementById('figureStamps');
    figureStamps.replaceChildren(...Object.entries(FIGURES).map(([key, value]) => stampButton(key, value.label, 'figure', () => addFigure(key))));
    const objectStamps = document.getElementById('objectStamps');
    objectStamps.replaceChildren(...Object.entries(OBJECTS).map(([key, value]) => stampButton(key, value, 'object', () => addObject(key))));

    fillSelect(document.getElementById('headwearSelect'), HEADWEAR);
    fillSelect(document.getElementById('heldSelect'), HELD);

    const paletteChoices = document.getElementById('paletteChoices');
    paletteChoices.replaceChildren(...Object.entries(PALETTES).map(([key, value]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `palette-button${state.palette === key ? ' is-active' : ''}`;
      button.dataset.palette = key;
      const title = document.createElement('strong'); title.textContent = value.label;
      const dots = document.createElement('span'); dots.className = 'palette-dots';
      for (const color of value.colors) {
        const dot = document.createElement('i');
        dot.style.background = color;
        dots.append(dot);
      }
      button.append(title, dots);
      button.addEventListener('click', () => applyPalette(key));
      return button;
    }));

    const storyList = document.getElementById('storyList');
    const romans = ['I', 'II', 'III', 'IV'];
    storyList.replaceChildren(...STORIES.map((story, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'story-card';
      const roman = document.createElement('span'); roman.className = 'roman'; roman.textContent = romans[index] || String(index + 1);
      const copy = document.createElement('span');
      const strong = document.createElement('strong'); strong.textContent = story.title;
      const small = document.createElement('small'); small.textContent = story.subtitle;
      copy.append(strong, small);
      const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→';
      button.append(roman, copy, arrow);
      button.addEventListener('click', () => useStory(index));
      return button;
    }));
  }

  function syncControls() {
    const state = getState();
    document.querySelectorAll('#formatChoices button').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.format));
    document.querySelectorAll('#backgroundChoices button').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.background));
    document.querySelectorAll('#frameChoices button').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.frame));
    document.querySelectorAll('#ornamentChoices button').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.ornament));
    document.querySelectorAll('#inscriptionPosition button').forEach((b) => b.classList.toggle('is-active', b.dataset.value === state.inscriptionPosition));
    document.querySelectorAll('.palette-button').forEach((b) => b.classList.toggle('is-active', b.dataset.palette === state.palette));
    document.getElementById('inscriptionInput').value = state.inscription;
    document.getElementById('lineWeight').value = String(state.lineWeight);
    document.getElementById('lineWeightOutput').value = String(state.lineWeight);
    document.getElementById('textureToggle').checked = state.texture;
    syncSelectionUi();
    updateHistoryButtons();
  }

  function labelMap(source) {
    return Object.fromEntries(Object.entries(source).map(([key, label]) => [key, { label }]));
  }

  function fillSegmented(id, entries, active, onClick) {
    const host = document.getElementById(id);
    host.replaceChildren(...Object.entries(entries).map(([key, value]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value.label || value;
      button.dataset.value = key;
      if (active === key) button.classList.add('is-active');
      button.addEventListener('click', () => onClick(key));
      return button;
    }));
  }

  function fillChoices(id, entries, active, onClick, swatches = false) {
    const host = document.getElementById(id);
    host.replaceChildren(...Object.entries(entries).map(([key, value]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `choice-button${active === key ? ' is-active' : ''}`;
      button.dataset.value = key;
      if (swatches) {
        const swatch = document.createElement('span');
        swatch.className = 'choice-swatch';
        swatch.style.background = value.fill;
        const label = document.createElement('span');
        label.className = 'choice-label';
        label.textContent = value.label;
        button.append(swatch, label);
      } else {
        const label = document.createElement('span');
        label.className = 'choice-label';
        label.textContent = value.label || value;
        button.append(label);
      }
      button.addEventListener('click', () => onClick(key));
      return button;
    }));
  }

  function stampButton(key, label, type, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stamp-button';
    button.innerHTML = `${svgFor(key, type)}<span></span>`;
    button.lastElementChild.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function fillSelect(select, entries) {
    select.replaceChildren(...Object.entries(entries).map(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      return option;
    }));
  }

  return { buildControls, syncControls };
}
