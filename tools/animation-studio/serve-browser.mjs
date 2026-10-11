// Reuse the platform's contained test server, with a private evidence root.
process.env.ART_FORGE_EVIDENCE=process.env.MOTION_EVIDENCE;
await import('../art-forge/serve-browser.mjs');
