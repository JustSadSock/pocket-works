/** Every floor item in a legacy or fresh starter save may omit y.
 * Babylon Vector3.set(undefined) corrupts its world transform and hides the mesh.
 */
export function sceneY(item){return Number.isFinite(item?.y)?item.y:0;}
