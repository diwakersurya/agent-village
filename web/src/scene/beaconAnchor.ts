import type { Object3D } from 'three';

/** agentId → its beacon (registered by Beacon), so the DOM beacon menu can pin itself to it. */
export const beaconObjs = new Map<string, Object3D>();
/** The beacon menu's element (ui/BeaconMenu), positioned every frame by scene/BeaconMenuAnchor. */
export const menuAnchor: { el: HTMLElement | null } = { el: null };
