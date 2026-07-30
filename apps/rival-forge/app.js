import { TEAM_UPS } from './data.js';
import { box,$,saveState,closeSheet,openSheet,setView,clickSound } from './store.js';
import { renderBuilder,setPlannerMode,setPartySize,placeHero,removeHero,toggleLock,chooseLoadout,optimizeAllLoadouts,applyPreset,clearCurrent,autoFill,optimize,saveVariant,loadVariant,deleteVariant,toggleCompareHero,openCompare } from './builder.js';
import { renderHeroes,renderTiers,renderLinks,setHeroRole,toggleFavorites,setLinkType } from './catalog.js';
import { openPicker,setPickerRole,setPickerSearch,pickHero,clearPicker,openHero,renderHeroSheet,addCurrentHero,toggleFavorite,updateHeroPreference,renderAnalysisSheet,saveCurrentTeam,renderSavedTeams,loadSavedTeam,duplicateSaved,deleteSaved,exportData,importData,resetAll,renderMeta } from './sheets.js';
import { openPlayersSheet,selectEditingPlayer,addPlayer,deletePlayer,updateProfileField,updateProfileColor,openAssignmentSheet,assignPlayer,updatePlayerHeroSkill,togglePlayerHeroBlocked } from './profiles.js';
import { setMatchContext,openEnemyPicker,setEnemySearch,pickEnemy,clearEnemySlot,clearEnemies,applyReplacement,openMatchLog,saveMatchRecord,renderHistorySheet,deleteMatchRecord,renderLocalMetaSheet } from './match.js';

export function renderAll(){renderBuilder();renderHeroes();renderTiers();renderLinks();renderSavedTeams();renderMeta();setView(box.state.activeView,false);}
function bindEvents(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-nav]'))return setView(button.dataset.nav);
    if(button.matches('[data-planner-mode]'))return setPlannerMode(button.dataset.plannerMode);
    if(button.matches('[data-party-size]'))return setPartySize(button.dataset.partySize);
    if(button.matches('[data-pick-slot]'))return openPicker(button.dataset.pickSlot);
    if(button.matches('[data-open-hero]'))return openHero(button.dataset.openHero);
    if(button.matches('[data-add-hero]')){const slot=button.dataset.addSlot??null;if(box.activeSheet==='heroSheet')addCurrentHero(slot);else{placeHero(button.dataset.addHero,slot);if(box.activeSheet==='compareSheet')closeSheet(false);}return;}
    if(button.matches('[data-remove-slot]'))return removeHero(Number(button.dataset.removeSlot));
    if(button.matches('[data-lock-slot]'))return toggleLock(Number(button.dataset.lockSlot));
    if(button.matches('[data-set-loadout]')){chooseLoadout(button.dataset.setLoadout);if(box.activeSheet==='heroSheet')renderHeroSheet();return;}
    if(button.matches('[data-role]'))return setHeroRole(button.dataset.role);
    if(button.matches('[data-picker-role]'))return setPickerRole(button.dataset.pickerRole);
    if(button.matches('[data-picker-hero]'))return pickHero(button.dataset.pickerHero);
    if(button.matches('[data-clear-picker]'))return clearPicker();
    if(button.matches('[data-set-tier]')){updateHeroPreference('tier',button.dataset.setTier);return renderHeroSheet();}
    if(button.matches('[data-favorite-hero]'))return toggleFavorite(button.dataset.favoriteHero);
    if(button.matches('[data-preset]'))return applyPreset(button.dataset.preset);
    if(button.matches('[data-link-type]'))return setLinkType(button.dataset.linkType);
    if(button.matches('[data-jump-link]')){const link=TEAM_UPS.find(x=>x.id===button.dataset.jumpLink);box.state.linkSearch=link?.name||'';box.state.linkType='tactical';saveState();closeSheet(false);setView('links');return renderLinks();}
    if(button.matches('[data-load-team]'))return loadSavedTeam(button.dataset.loadTeam);
    if(button.matches('[data-duplicate-team]'))return duplicateSaved(button.dataset.duplicateTeam);
    if(button.matches('[data-delete-team]'))return deleteSaved(button.dataset.deleteTeam);
    if(button.matches('[data-assign-player]'))return openAssignmentSheet(button.dataset.assignPlayer);
    if(button.matches('[data-select-player]'))return assignPlayer(button.dataset.selectPlayer);
    if(button.matches('[data-edit-player]'))return selectEditingPlayer(button.dataset.editPlayer);
    if(button.matches('[data-add-player]'))return addPlayer();
    if(button.matches('[data-delete-player]'))return deletePlayer(button.dataset.deletePlayer);
    if(button.matches('[data-player-color]'))return updateProfileColor(button.dataset.playerColor);
    if(button.matches('[data-toggle-player-block]')){togglePlayerHeroBlocked(button.dataset.togglePlayerBlock);return renderHeroSheet();}
    if(button.matches('[data-load-variant]'))return loadVariant(button.dataset.loadVariant);
    if(button.matches('[data-delete-variant]'))return deleteVariant(button.dataset.deleteVariant);
    if(button.matches('[data-compare-hero]'))return toggleCompareHero(button.dataset.compareHero);
    if(button.matches('[data-match-context]')){const[field,value]=button.dataset.matchContext.split(':');return setMatchContext(field,value);}
    if(button.matches('[data-enemy-slot]'))return openEnemyPicker(button.dataset.enemySlot);
    if(button.matches('[data-pick-enemy]'))return pickEnemy(button.dataset.pickEnemy);
    if(button.matches('[data-clear-enemy]'))return clearEnemySlot(button.dataset.clearEnemy);
    if(button.matches('[data-apply-replacement]'))return applyReplacement(button.dataset.applyReplacement);
    if(button.matches('[data-delete-match]'))return deleteMatchRecord(button.dataset.deleteMatch);
    if(button.id==='openCompareButton')return openCompare();
    if(button.id==='openPlayersButton')return openPlayersSheet();
    if(button.id==='clearEnemiesButton')return clearEnemies();
    if(button.id==='openMatchLogButton')return openMatchLog();
    if(button.id==='openHistoryButton')return renderHistorySheet();
    if(button.id==='openLocalMetaButton')return renderLocalMetaSheet();
    if(button.id==='saveMatchRecordButton')return saveMatchRecord();
    if(button.matches('[data-close-sheet]'))return closeSheet();
  });
  document.addEventListener('rival-forge:profiles-changed',()=>{renderBuilder();renderSavedTeams();});
  document.addEventListener('rival-forge:match-changed',()=>{renderBuilder();renderSavedTeams();});
  $('#scrim').addEventListener('click',()=>closeSheet());
  $('#backButton').addEventListener('click',()=>{if(box.activeSheet)return closeSheet();if(history.length>1)history.back();else location.href='../../';});
  $('#openSavedButton').addEventListener('click',()=>{renderSavedTeams();openSheet('savedSheet');});
  $('#openMenuButton').addEventListener('click',()=>openSheet('menuSheet'));
  $('#analysisDetailsButton').addEventListener('click',()=>{renderAnalysisSheet();openSheet('analysisSheet');});
  $('#clearTeamButton').addEventListener('click',clearCurrent);$('#saveTeamButton').addEventListener('click',saveCurrentTeam);$('#autoCompleteButton').addEventListener('click',autoFill);$('#optimizeButton').addEventListener('click',optimize);$('#refreshRecommendationsButton').addEventListener('click',()=>{renderBuilder();clickSound();});
  $('#optimizeLoadoutsButton').addEventListener('click',optimizeAllLoadouts);$('#saveVariantButton').addEventListener('click',saveVariant);
  $('#heroFilterButton').addEventListener('click',toggleFavorites);
  $('#resetTiersButton').addEventListener('click',()=>{if(!confirm('Вернуть исходные тиры всем героям?'))return;box.state.prefs.tiers={};saveState();renderTiers();renderHeroes();renderBuilder();});
  $('#exportButton').addEventListener('click',exportData);$('#importButton').addEventListener('click',()=>$('#importInput').click());$('#resetAllButton').addEventListener('click',()=>resetAll(renderAll));
  $('#soundToggle').addEventListener('click',()=>{box.state.sound=!box.state.sound;saveState();$('#soundToggleValue').textContent=box.state.sound?'Включены':'Выключены';if(box.state.sound)clickSound('good');});
  $('#importInput').addEventListener('change',event=>event.target.files?.[0]&&importData(event.target.files[0],renderAll));
  $('#heroSearch').addEventListener('input',event=>{box.state.heroSearch=event.target.value;saveState();renderHeroes();});
  $('#pickerSearch').addEventListener('input',event=>setPickerSearch(event.target.value));
  $('#enemyPickerSearch').addEventListener('input',event=>setEnemySearch(event.target.value));
  $('#linkSearch').addEventListener('input',event=>{box.state.linkSearch=event.target.value;saveState();renderLinks();});
  $('#tierRoleFilter').addEventListener('change',event=>{box.state.tierRole=event.target.value;saveState();renderTiers();});
  $('#tierSort').addEventListener('change',event=>{box.state.tierSort=event.target.value;saveState();renderTiers();});
  document.addEventListener('change',event=>{if(event.target.id==='matchModeSelect')setMatchContext('mode',event.target.value);if(event.target.id==='matchMapSelect')setMatchContext('mapId',event.target.value);});
  $('#playersSheet').addEventListener('input',event=>{if(event.target.matches('[data-player-field="name"]'))updateProfileField('name',event.target.value);});
  $('#playersSheet').addEventListener('change',event=>{if(event.target.matches('[data-player-field]'))updateProfileField(event.target.dataset.playerField,event.target.value);});
  $('#heroSheet').addEventListener('input',event=>{if(event.target.id==='heroPowerRange'){if($('#powerOutput'))$('#powerOutput').textContent=event.target.value;updateHeroPreference('score',event.target.value);}if(event.target.id==='heroConfidenceRange'){if($('#confidenceOutput'))$('#confidenceOutput').textContent=event.target.value;updateHeroPreference('confidence',event.target.value);}if(event.target.id==='heroNotes')updateHeroPreference('notes',event.target.value);if(event.target.matches('[data-player-skill]'))updatePlayerHeroSkill(event.target.dataset.playerSkill,event.target.dataset.heroId,event.target.value);});
  $('#matchLogSheet').addEventListener('input',event=>{if(event.target.id==='matchComfort'&&$('#matchComfortOutput'))$('#matchComfortOutput').textContent=event.target.value;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&box.activeSheet)closeSheet();});
}
bindEvents();renderAll();
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));
