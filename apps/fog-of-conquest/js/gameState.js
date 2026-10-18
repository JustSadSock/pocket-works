(function(global){
  /**
   * Shared global game state.
   * @global {number} BASE_ROWS Default map rows
   * @global {number} BASE_COLS Default map columns
   * @global {number} ROWS Current map rows
   * @global {number} COLS Current map columns
   * @global {string} mapSize Human friendly map size label
   * @global {Object} TERRAIN Enum of terrain types
   * @global {string[]} TERR_COL Terrain colors
   * @global {number[]} TERR_COST Movement costs per terrain
   * @global {number[]} TERR_DEF Defense bonus per terrain
   * @global {Object[]} buildings List of building objects
   * @global {Object[]} units List of unit objects
   * @global {Object} state Persistent match state
   */
  const BASE_ROWS = 20, BASE_COLS = 30;
  let ROWS = BASE_ROWS, COLS = BASE_COLS;
  let mapSize = 'medium';
  const TERRAIN = { PLAIN:0, WATER:1, FOREST:2, HILL:3, MOUNTAIN:4 };
  const TERR_COL  = ['#a6d88c','#6db6f8','#2e8b3d','#d4b55c','#8d8d8d'];
  const TERR_COST = [1,2,2,2,999];
  const TERR_DEF  = [0,-1,1,2,0];
  let TERR_LABELS = [];
  const TILE_IMAGES = {
    grass:['tiles/grass1'],
    water:['tiles/water'],
    pond:['tiles/pound','tiles/pound2','tiles/pound3'],
    hill:['tiles/hill'],
    mountain:['tiles/mountains3'],
    forest:['tiles/trees1']
  };
  const UNIT_IMG_MAP = {
    swordsman:'militia',
    archer:'archer',
    heavy:'heavy',
    cavalry:'horseman',
    mage:'healer',
    bog:'militia'
  };
  // UNIT_TYPES and BUILD_TYPES are provided by data.js
  const BASE_SPAWN_DEFAULT = [...BUILD_TYPES.base.spawn];
  const map = [];
  const buildings = [];
  const units = [];
  const state = {
    currentPlayer:1,
    turn:0,
    gold:{1:5,2:5},
    fog:{}, seen:{},
    grace:{1:null,2:null},
    log:{1:[],2:[]}
  };
  let nextUnitId = 1;
  Object.assign(global,{
    BASE_ROWS,BASE_COLS,ROWS,COLS,mapSize,
    TERRAIN,TERR_COL,TERR_COST,TERR_DEF,TERR_LABELS,
    TILE_IMAGES,UNIT_IMG_MAP,UNIT_TYPES,BUILD_TYPES,
    BASE_SPAWN_DEFAULT,map,buildings,units,state,nextUnitId
  });
})(typeof window!=='undefined'?window:this);
