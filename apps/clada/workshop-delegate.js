document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-workshop-trigger]')) return;
  event.preventDefault();
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'w',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true
  }));
});
