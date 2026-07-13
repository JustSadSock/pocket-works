const workshopIdentity = Object.freeze({
  storageNamespace: 'pocket-works:petlya-17',
  cachePrefix: 'petlya-17-'
});

window.addEventListener('workshopopen', () => {
  document.documentElement.dataset.workshopApp = workshopIdentity.storageNamespace;
});

window.addEventListener('workshopclose', () => {
  delete document.documentElement.dataset.workshopApp;
});
