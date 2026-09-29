import type { AgentKind, AgentState } from '../../../daemon/src/types';

/** Brand colour per agent kind (ring, rug, badges). */
export const CHARACTER: Record<AgentKind, { color: string }> = {
  claude: { color: '#d97757' },
  codex: { color: '#10a37f' },
  gemini: { color: '#4285f4' },
};

/** KayKit Adventurers 1.0 (CC0) — see public/models/LICENSE-KayKit.txt. All share one rig + clip set. */
// relative to the site base (/ from the daemon, /agent-village/ on GitHub Pages)
export const MODELS = ['Mage', 'Rogue', 'Knight', 'Barbarian', 'Rogue_Hooded'].map((m) => `${import.meta.env.BASE_URL}models/${m}.glb`);
const TINTS = ['#ffffff', '#ffe8cc', '#dbeafe', '#dcfce7', '#fde2e4', '#ede9fe'];

export interface Look { url: string; tint: string; scale: number }

/**
 * Per-agent look so a room of same-kind agents isn't a row of clones: model × tint × height from a hash.
 * Keyed on pid (stable when a scanned placeholder becomes a hooked session, and across /clear).
 */
export function lookFor(a: Pick<AgentState, 'id' | 'pid' | 'kind'>): Look {
  let h = 2166136261;
  for (const c of `${a.kind}:${a.pid || a.id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return {
    url: MODELS[h % MODELS.length],
    tint: TINTS[Math.floor(h / MODELS.length) % TINTS.length],
    scale: 0.95 + ((h >>> 12) % 11) / 100,
  };
}

export const STATUS_COLOR = {
  working: '#3b82f6',
  needs_input: '#f59e0b',
  idle: '#9ca3af',
  crashed: '#ef4444',
} as const;

/** Clip names in the KayKit rig; first existing candidate wins so other packs can be dropped in. */
export const CLIPS = {
  walk: ['Walking_A', 'Walking', 'Walk'],
  sitWork: ['Sit_Chair_Idle', 'Sitting', 'Sit'],
  standWork: ['Interact', 'Use_Item', 'Idle'],
  needsYou: ['Cheer', 'Wave', 'Spellcast_Raise'],
  idleStand: ['Idle', 'Unarmed_Idle'],
  idleSitChair: ['Sit_Chair_Pose', 'Sit_Chair_Idle'], // done: leaning back in the chair
  idleSit: ['Sit_Floor_Idle', 'Sitting', 'Idle'],
  crashed: ['Death_A', 'Death', 'Lie_Idle'],
} as const;

export const ONCE_CLIPS = new Set(['Death_A', 'Death_B', 'Death']);

export const PERSON_HEIGHT = 1.7;
