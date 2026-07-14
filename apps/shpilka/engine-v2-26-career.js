// ШПИЛЬКА 2.6 — three-stage championship, persistent rivalry and Pilot unlock.

var shp26CareerStorageKey = 'pocket-works:shpilka:career:v26';
var shp26DriverNames = { player: 'ТЫ', rook: 'ГРАЧ', volt: 'ВОЛЬТ', mara: 'МАРА', shunt: 'ШУНТ' };
var shp26PointsTable = [10, 7, 5, 3, 1];
var shp26ChampionshipRaceActive = false;
var shp26RaceDifficulty = shpPrefs.difficulty;
var shp26CareerUi = {};

function shp26LoadCareer() {
  try {
    const parsed = JSON.parse(localStorage.getItem(shp26CareerStorageKey) || '{}');
    const scores = parsed.rivalry?.scores || {};
    return {
      pilotUnlocked: parsed.pilotUnlocked === true,
      cupsWon: Number.isFinite(parsed.cupsWon) ? parsed.cupsWon : 0,
      raceCount: Number.isFinite(parsed.raceCount) ? parsed.raceCount : 0,
      rivalry: {
        id: ['rook', 'volt', 'mara', 'shunt'].includes(parsed.rivalry?.id) ? parsed.rivalry.id : null,
        scores: {
          rook: Number(scores.rook) || 0,
          volt: Number(scores.volt) || 0,
          mara: Number(scores.mara) || 0,
          shunt: Number(scores.shunt) || 0
        },
        playerWins: Number(parsed.rivalry?.playerWins) || 0,
        rivalWins: Number(parsed.rivalry?.rivalWins) || 0
      },
      championship: parsed.championship && Array.isArray(parsed.championship.stages) ? parsed.championship : null,
      lastCup: parsed.lastCup || null
    };
  } catch {
    return {
      pilotUnlocked: false,
      cupsWon: 0,
      raceCount: 0,
      rivalry: { id: null, scores: { rook: 0, volt: 0, mara: 0, shunt: 0 }, playerWins: 0, rivalWins: 0 },
      championship: null,
      lastCup: null
    };
  }
}

var shp26Career = shp26LoadCareer();

function shp26SaveCareer() {
  try { localStorage.setItem(shp26CareerStorageKey, JSON.stringify(shp26Career)); } catch { /* optional storage */ }
}

function shp26Shuffle(values, seed) {
  const result = [...values];
  const random = mulberry32(seed >>> 0);
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function shp26RivalId() {
  return shp26Career.rivalry.id;
}

function shp26RivalName() {
  return shp26DriverNames[shp26RivalId()] || 'НЕ ОПРЕДЕЛЁН';
}

function shp26ChampionshipStandings(championship = shp26Career.championship) {
  if (!championship) return [];
  return Object.entries(championship.points || {})
    .map(([id, points]) => ({ id, points: Number(points) || 0 }))
    .sort((a, b) => b.points - a.points || (championship.tiebreak?.[a.id] || 999) - (championship.tiebreak?.[b.id] || 999));
}

function shp26BuildChampionship() {
  const seed = hashSeed(Date.now() ^ Math.floor(performance.now() * 1000) ^ 0x2603c7);
  const types = shp26Shuffle(['speed', 'technical', 'mountain', 'cascade'], seed).slice(0, 3);
  const points = { player: 0, rook: 0, volt: 0, mara: 0, shunt: 0 };
  const tiebreak = { player: 0, rook: 0, volt: 0, mara: 0, shunt: 0 };
  return {
    id: seed >>> 0,
    difficulty: shpPrefs.difficulty,
    stages: types.map((type, index) => ({ type, seed: hashSeed(seed + (index + 1) * 0x9e3779b9) })),
    stageIndex: 0,
    completedStages: 0,
    points,
    tiebreak,
    history: [],
    betweenStages: false,
    complete: false,
    championId: null,
    startedAt: Date.now()
  };
}

function shp26CreateCareerUi() {
  if (shp26CareerUi.card) return;

  const rival = document.createElement('span');
  rival.id = 'rivalBadge';
  rival.className = 'rival-badge';
  routeNameNode.after(rival);

  const card = document.createElement('section');
  card.id = 'championshipCard';
  card.className = 'championship-card';
  const heading = document.createElement('div');
  heading.className = 'championship-heading';
  const title = document.createElement('b');
  title.textContent = 'КУБОК ТРЁХ';
  const stage = document.createElement('span');
  stage.id = 'championshipStage';
  heading.append(title, stage);
  const copy = document.createElement('p');
  copy.id = 'championshipCopy';
  const button = document.createElement('button');
  button.id = 'championshipButton';
  button.type = 'button';
  button.className = 'championship-action';
  button.textContent = 'НАЧАТЬ КУБОК';
  card.append(heading, copy, button);
  newRouteButton.after(card);

  const finishPanel = document.createElement('section');
  finishPanel.id = 'championshipFinish';
  finishPanel.className = 'championship-finish';
  finishPanel.hidden = true;
  resultsNode.after(finishPanel);

  button.addEventListener('click', () => {
    const championship = shp26Career.championship;
    if (!championship || championship.complete) {
      shp26Career.championship = shp26BuildChampionship();
      shp26SaveCareer();
    }
    shp26StartChampionshipStage();
  });

  shp26CareerUi = { rival, card, stage, copy, button, finishPanel };
}

function shp26RenderCareerUi() {
  shp26CreateCareerUi();
  const rivalId = shp26RivalId();
  shp26CareerUi.rival.textContent = rivalId
    ? `ГЛАВНЫЙ СОПЕРНИК · ${shp26DriverNames[rivalId]} · ${shp26Career.rivalry.playerWins}:${shp26Career.rivalry.rivalWins}`
    : 'ГЛАВНЫЙ СОПЕРНИК · ОПРЕДЕЛЯЕТСЯ';

  const championship = shp26Career.championship;
  if (!championship) {
    shp26CareerUi.stage.textContent = shp26Career.cupsWon ? `ПОБЕД ${shp26Career.cupsWon}` : '3 ЭТАПА';
    shp26CareerUi.copy.textContent = 'Три разные трассы, общая таблица очков и одна непрерывная дуэль с пелотоном.';
    shp26CareerUi.button.textContent = 'НАЧАТЬ КУБОК';
    return;
  }

  if (championship.complete) {
    const playerPlace = shp26ChampionshipStandings(championship).findIndex((entry) => entry.id === 'player') + 1;
    shp26CareerUi.stage.textContent = `ИТОГ · P${playerPlace}`;
    shp26CareerUi.copy.textContent = `${shp26DriverNames[championship.championId] || 'ПИЛОТ'} выиграл серию. Можно начать новый кубок.`;
    shp26CareerUi.button.textContent = 'НОВЫЙ КУБОК';
    return;
  }

  const nextStage = Math.min(3, championship.stageIndex + 1);
  const playerPoints = championship.points?.player || 0;
  const leader = shp26ChampionshipStandings(championship)[0];
  shp26CareerUi.stage.textContent = `ЭТАП ${nextStage}/3`;
  shp26CareerUi.copy.textContent = `У тебя ${playerPoints} очк. Лидер: ${shp26DriverNames[leader?.id] || '—'} — ${leader?.points || 0}.`;
  shp26CareerUi.button.textContent = championship.completedStages ? `ПРОДОЛЖИТЬ · ${nextStage}/3` : 'НАЧАТЬ КУБОК';
}

function shp26PrepareChampionshipStage(championship) {
  const stage = championship.stages[championship.stageIndex];
  if (!stage) return false;
  const previousType = shpPrefs.trackType;
  shpPrefs.trackType = stage.type;
  prepareRoute(stage.seed);
  shpPrefs.trackType = previousType;
  shpPrefs.difficulty = championship.difficulty;
  shpSavePrefs();
  routeMeta.textContent = `КУБОК ${championship.stageIndex + 1}/3 · ${routeMeta.textContent}`;
  return true;
}

function shp26StartChampionshipStage() {
  const championship = shp26Career.championship;
  if (!championship || championship.complete || !shp26PrepareChampionshipStage(championship)) return;
  championship.betweenStages = false;
  shp26ChampionshipRaceActive = true;
  shp26RaceDifficulty = championship.difficulty;
  shp26SaveCareer();
  shp26BaseBeginRace({ newRoute: false });
}

function shp26UpdateRivalry(ranking) {
  const playerIndex = ranking.indexOf(player);
  if (playerIndex < 0) return;
  shp26Career.raceCount += 1;
  const oldId = shp26RivalId();

  for (const car of ranking) {
    if (car.player) continue;
    const index = ranking.indexOf(car);
    const placeGap = Math.abs(index - playerIndex);
    let pressure = Math.max(0, 5 - placeGap * 1.65);
    if (Number.isFinite(player.finishTime) && Number.isFinite(car.finishTime)) {
      const timeGap = Math.abs(player.finishTime - car.finishTime);
      if (timeGap < 1.5) pressure += 5;
      else if (timeGap < 4) pressure += 2.5;
    } else {
      const distanceGap = Math.abs((player.raceScore || 0) - (car.raceScore || 0));
      if (distanceGap < 260) pressure += 2;
    }
    const previous = shp26Career.rivalry.scores[car.id] || 0;
    shp26Career.rivalry.scores[car.id] = previous * 0.91 + pressure;
  }

  const candidates = Object.entries(shp26Career.rivalry.scores).sort((a, b) => b[1] - a[1]);
  const best = candidates[0];
  const currentScore = oldId ? shp26Career.rivalry.scores[oldId] || 0 : -Infinity;
  if (shp26Career.raceCount >= 2 && best && (!oldId || best[1] > currentScore + 1.35)) shp26Career.rivalry.id = best[0];

  const rivalId = shp26RivalId();
  if (rivalId) {
    const rivalIndex = ranking.findIndex((car) => car.id === rivalId);
    if (playerIndex < rivalIndex) shp26Career.rivalry.playerWins += 1;
    else if (rivalIndex >= 0) shp26Career.rivalry.rivalWins += 1;
  }
}

function shp26AwardChampionship(ranking) {
  const championship = shp26Career.championship;
  if (!championship || !shp26ChampionshipRaceActive || championship.complete) return;

  const stageResult = [];
  ranking.forEach((car, index) => {
    const points = shp26PointsTable[index] || 0;
    championship.points[car.id] = (championship.points[car.id] || 0) + points;
    championship.tiebreak[car.id] = (championship.tiebreak[car.id] || 0) + index + 1;
    stageResult.push({ id: car.id, place: index + 1, points });
  });
  championship.history.push({ stage: championship.stageIndex, seed: trackSeed, type: shpActiveArchetype?.id, result: stageResult });
  championship.completedStages += 1;

  if (championship.completedStages >= championship.stages.length) {
    championship.complete = true;
    championship.betweenStages = false;
    const standings = shp26ChampionshipStandings(championship);
    championship.championId = standings[0]?.id || null;
    if (championship.championId === 'player') shp26Career.cupsWon += 1;
    shp26Career.lastCup = { championId: championship.championId, standings, finishedAt: Date.now() };
  } else {
    championship.stageIndex = championship.completedStages;
    championship.betweenStages = true;
  }
}

function shp26StandingsMarkup(championship) {
  const standings = shp26ChampionshipStandings(championship);
  const rows = standings.map((entry, index) => {
    const className = entry.id === 'player' ? ' class="is-player"' : entry.id === shp26RivalId() ? ' class="is-rival"' : '';
    return `<li${className}><span>${index + 1}</span><b>${shp26DriverNames[entry.id]}</b><strong>${entry.points}</strong></li>`;
  }).join('');
  const heading = championship.complete
    ? `${shp26DriverNames[championship.championId] || '—'} · ЧЕМПИОН`
    : `ПОСЛЕ ${championship.completedStages} ЭТАПА`;
  return `<header><b>КУБОК ТРЁХ</b><span>${heading}</span></header><ol>${rows}</ol>`;
}

function shp26RenderFinishCareer(ranking) {
  const championship = shp26Career.championship;
  const rivalId = shp26RivalId();
  const playerPlace = ranking.indexOf(player);
  const rivalPlace = ranking.findIndex((car) => car.id === rivalId);
  if (rivalId && rivalPlace >= 0) {
    finishSummary.textContent += playerPlace < rivalPlace
      ? ` Дуэль: ${shp26DriverNames[rivalId]} позади.`
      : ` Дуэль: ${shp26DriverNames[rivalId]} впереди.`;
  }

  if (!championship || !shp26ChampionshipRaceActive) {
    shp26CareerUi.finishPanel.hidden = true;
    return;
  }

  shp26CareerUi.finishPanel.innerHTML = shp26StandingsMarkup(championship);
  shp26CareerUi.finishPanel.hidden = false;
  if (championship.complete) {
    const playerCupPlace = shp26ChampionshipStandings(championship).findIndex((entry) => entry.id === 'player') + 1;
    finishKicker.textContent = championship.championId === 'player' ? 'КУБОК ВЗЯТ' : 'СЕРИЯ ЗАВЕРШЕНА';
    finishTitle.textContent = championship.championId === 'player' ? 'ЧЕМПИОН' : `${playerCupPlace} МЕСТО В КУБКЕ`;
    restartButtonFinish.textContent = 'В МЕНЮ';
  } else {
    restartButtonFinish.textContent = `ЭТАП ${championship.stageIndex + 1}/3`;
  }
}

var shp26BaseBeginRace = beginRace;
beginRace = function shp26BeginRace(options = {}) {
  if (mode === 'finished' && shp26ChampionshipRaceActive) {
    const championship = shp26Career.championship;
    if (championship?.complete) {
      shp26ChampionshipRaceActive = false;
      shp26Career.championship = null;
      shp26SaveCareer();
      returnToMenuWithNewRoute();
      shp26RenderCareerUi();
      return;
    }
    if (championship?.betweenStages) {
      shp26StartChampionshipStage();
      return;
    }
  }

  shp26ChampionshipRaceActive = false;
  shp26RaceDifficulty = shpPrefs.difficulty;
  shp26CareerUi.finishPanel.hidden = true;
  shp26BaseBeginRace(options);
};

var shp26BaseFinishRace = finishRace;
finishRace = function shp26FinishRace() {
  if (mode === 'finished') return;
  shp26BaseFinishRace();
  const ranking = [...cars].sort(compareRaceOrder);
  const place = ranking.indexOf(player) + 1;

  shp26UpdateRivalry(ranking);
  shp26AwardChampionship(ranking);

  if (!shp26Career.pilotUnlocked && shp26RaceDifficulty === 'maniac' && place === 1) {
    shp26Career.pilotUnlocked = true;
    finishSummary.textContent += ' Открыт уровень ПИЛОТ.';
    if (typeof shp26EnsurePilotOption === 'function') shp26EnsurePilotOption();
  }

  shp26SaveCareer();
  shp26RenderCareerUi();
  shp26RenderFinishCareer(ranking);
};

shp26CreateCareerUi();
shp26RenderCareerUi();
