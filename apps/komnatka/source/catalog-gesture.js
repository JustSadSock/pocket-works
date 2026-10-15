// Decide a catalogue gesture by the direction toward the room. On desktop
// the room is to the left; on a portrait phone it is above the catalogue.
// Scrolling is still available in the opposite axis.
export function catalogGestureIntent(dx,dy,portraitDock){
 const ax=Math.abs(dx),ay=Math.abs(dy);
 if(Math.hypot(dx,dy)<11)return 'wait';
 if(portraitDock){
  if(dy < -9 && ay >= ax*.72)return 'drag';
  if(ax>10 && ax>=ay*1.05)return 'scroll';
 }else{
  if(dx < -9 && ax >= ay*.72)return 'drag';
  if(ay>10 && ay>=ax*1.05)return 'scroll';
 }
 return 'wait';
}
