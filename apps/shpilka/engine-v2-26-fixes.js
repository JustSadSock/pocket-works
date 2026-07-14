// ШПИЛЬКА 2.6 — integration fixes after all feature layers are installed.

var shp26IntegratedBeginRace = beginRace;
beginRace = function shp26IntegratedRaceStart(options = {}) {
  if (mode === 'paused' && shp26ChampionshipRaceActive) {
    shp26RaceDifficulty = shp26Career.championship?.difficulty || shpPrefs.difficulty;
    shp26CareerUi.finishPanel.hidden = true;
    shp26BaseBeginRace({ newRoute: false });
    return;
  }
  shp26IntegratedBeginRace(options);
};
