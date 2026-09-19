import type RAPIER from '@dimforge/rapier3d-compat';
import type { Vehicle } from './vehicle';

export type ObstacleMaterial = 'concrete' | 'steel' | 'soft' | 'car';

export type CollisionMeta = {
  kind: 'vehicle' | 'obstacle' | 'prop';
  vehicle?: Vehicle;
  stiffness: number;
  contactArea: number;
  material: ObstacleMaterial;
  mass: number;
  label: string;
};

export type CollisionRegistry = Map<number, CollisionMeta>;

export type DynamicProp = {
  body: RAPIER.RigidBody;
  mesh: import('@babylonjs/core').TransformNode;
};
