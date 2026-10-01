import type { AgentKind, Status } from '../../../daemon/src/types';

/**
 * The one TypeScript source for status / kind colours (3D scene, beacons, rugs, badges).
 * ui/tokens.css mirrors these values for the DOM; keep the two in sync.
 */
export const STATUS_COLOR: Record<Status, string> = {
  working: '#3b82f6',
  needs_input: '#f59e0b',
  idle: '#9ca3af',
  crashed: '#ef4444',
};

/** Brand colour per agent kind (ring, rug, badges). */
export const KIND_COLOR: Record<AgentKind, string> = {
  claude: '#d97757',
  codex: '#10a37f',
  gemini: '#4285f4',
};

/** "You answered" green (the ✓ beacon). */
export const SENT_COLOR = '#16a34a';
