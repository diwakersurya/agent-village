import type { Vector3 } from 'three';

/** Live world position of each person (written every frame by Person), so the camera can fly to one. */
export const positions = new Map<string, Vector3>();

