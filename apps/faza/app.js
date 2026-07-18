import './app-v2.js';

const releaseVersion = '1.1.1';
const versionLabel = document.querySelector('.menu-footer span');
if (versionLabel) versionLabel.textContent = `v${releaseVersion}`;
