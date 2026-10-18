(function(global){
  // Centralized unit and building data
  const UNIT_TYPES = {
    swordsman:{move:2,atk:2,def:1,range:1,hpMax:5,cost:3,color:'#e74c3c'},
    // increased archer cost to better balance units
    archer:   {move:2,atk:3,def:0,range:2,hpMax:4,cost:4,color:'#2ecc71'},
    heavy:    {move:1,atk:3,def:2,range:1,hpMax:6,cost:5,color:'#2c3e50'},
    cavalry:  {move:3,atk:3,def:1,range:1,hpMax:5,cost:7,color:'#3498db'},
    mage:     {move:2,atk:0,def:0,range:1,hpMax:4,cost:7,color:'#9b59b6'},
    bog:      {move:1000,atk:2,def:1,range:1,hpMax:1000,cost:0,color:'#f1c40f'}
  };

  const BUILD_TYPES = {
    base:      {spawn:['swordsman','archer'],gen:0,def:1,hpMax:4},
    barracks:  {spawn:['heavy'],gen:0,def:0,hpMax:3},
    stable:    {spawn:['cavalry'],gen:0,def:0,hpMax:3},
    mageTower: {spawn:['mage'],gen:0,def:0,hpMax:3},
    // genUp indicates income after upgrade
    mill:      {spawn:[],gen:1,genUp:2,def:0,hpMax:2},
    fort:      {spawn:[],gen:0,def:2,hpMax:4}
  };

  Object.assign(global, { UNIT_TYPES, BUILD_TYPES });
})(typeof window!=='undefined'?window:this);

