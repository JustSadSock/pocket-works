# Architecture

`app.js` owns Pocket Works lifecycle integration. `game-loader.js` reconstructs the local compressed simulation module. The simulation bundle exposes `window.__DOCTRINA__` for persistence, testing and Workshop reset without coupling the game rules to the launcher.
