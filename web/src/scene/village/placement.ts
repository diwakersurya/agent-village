import type { AgentState } from '../../../../daemon/src/types';

export type Building = 'workshop' | 'library' | 'drafting' | 'post';
export type Vec3 = [number, number, number];

/** Tool buildings sit on an inner ring around the village square. */
export const BUILDINGS: Record<Building, [number, number]> = {
  workshop: [0, -7],
  library: [-7, 0],
  drafting: [7, 0],
  post: [0, 7],
};

export const BUILDING_LABEL: Record<Building, string> = {
  workshop: '🔨 Workshop · Bash',
  library: '📚 Library · Read/Search',
  drafting: '✏️ Drafting · Edit',
  post: '📮 Post office · Web/MCP',
};

const BASH = /^(Bash|BashOutput|exec_command|shell|local_shell|run_shell_command|write_stdin)$/;
const READ = /^(Read|Grep|Glob|LS|read_file|read_many_files|list_directory|glob|search_file_content|grep)$/;
const EDIT = /^(Edit|Write|MultiEdit|NotebookEdit|apply_patch|write_file|replace|edit)$/;
const WEB = /^(WebFetch|WebSearch|web_fetch|google_web_search|web_search|mcp__.*)$/;

export function buildingFor(tool?: string): Building | null {
  if (!tool) return null;
  if (BASH.test(tool)) return 'workshop';
  if (READ.test(tool)) return 'library';
  if (EDIT.test(tool)) return 'drafting';
  if (WEB.test(tool)) return 'post';
  return null;
}

/** Houses on an outer ring, ordered by name so positions survive reloads and reordering. */
export function housePositions(projects: string[]): Record<string, [number, number]> {
  const names = [...new Set(projects)].sort();
  const r = Math.max(15, names.length * 2.2);
  const out: Record<string, [number, number]> = {};
  names.forEach((name, i) => {
    const ang = (i / names.length) * Math.PI * 2 + Math.PI / 4;
    out[name] = [round(Math.cos(ang) * r), round(Math.sin(ang) * r)];
  });
  return out;
}

/** Where a person should stand. `index` = rank among agents sharing the same spot. */
export function personTarget(a: AgentState, index: number, houses: Record<string, [number, number]>): Vec3 {
  const b = a.status === 'working' ? buildingFor(a.activity.tool) : null;
  if (b) {
    const [bx, bz] = BUILDINGS[b];
    const ang = index * 1.3 + Math.PI / 2;
    return [round(bx + Math.cos(ang) * 2.2), 0, round(bz + Math.sin(ang) * 2.2)];
  }
  const [hx, hz] = houses[a.project] ?? [0, 0];
  const len = Math.hypot(hx, hz) || 1;
  const [dx, dz] = [-hx / len, -hz / len]; // towards the square
  const [px, pz] = [-dz, dx]; // sideways
  const side = (index % 2 ? 1 : -1) * Math.ceil(index / 2) * 1.3;
  return [round(hx + dx * 3 + px * side), 0, round(hz + dz * 3 + pz * side)];
}

const round = (v: number) => Math.round(v * 100) / 100;
