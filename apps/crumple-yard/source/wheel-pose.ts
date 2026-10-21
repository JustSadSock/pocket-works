import { Quaternion, Vector3 } from '@babylonjs/core';

/**
 * The tire primitive is a Y-axis cylinder. Roll it 90 degrees to point its
 * axle sideways, spin about its OWN Y-axis, and only then steer/camber.
 * YawPitchRoll mixes world axes and made rolling tires appear to wobble.
 */
export function wheelPose(heading: number, camber: number, spin: number): Quaternion {
  const steering = Quaternion.RotationAxis(Vector3.Up(), heading);
  const axle = Quaternion.RotationAxis(Vector3.Forward(), Math.PI / 2 + camber);
  const rotation = Quaternion.RotationAxis(Vector3.Up(), spin);
  return steering.multiply(axle).multiply(rotation);
}
