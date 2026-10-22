export const SPAWN_BAY_WIDTH=4;
export const SPAWN_BAY_HEIGHT=2;
// Board width is 10 + 4 for every additional player.
// Divide the spare cells evenly, leaving discrete four-cell entrances.
export function spawnLaneX(index,count,width=10+4*(count-1)){
  if(!Number.isInteger(count)||count<1||count>4||!Number.isInteger(index)||index<0||index>=count)
    throw new RangeError('Invalid spawn player index or count');
  if(count===1)return Math.floor((width-SPAWN_BAY_WIDTH)/2);
  const spare=width-SPAWN_BAY_WIDTH*count;
  if(spare<count-1)throw new RangeError('Board too narrow for individual entrances');
  return SPAWN_BAY_WIDTH*index+Math.floor(spare*(index+1)/(count+1));
}
