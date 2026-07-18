import './app-v2.js';
import './interface-v2.js';

const releaseVersion = '1.2.0';
const versionLabel = document.querySelector('.menu-footer span');
if (versionLabel) versionLabel.textContent = `v${releaseVersion}`;
