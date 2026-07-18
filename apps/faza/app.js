import './app-v2.js';
import './interface-v2.js';
import './visual-v3.js';

const releaseVersion = '1.3.0';
const versionLabel = document.querySelector('.menu-footer span');
if (versionLabel) versionLabel.textContent = `v${releaseVersion}`;
