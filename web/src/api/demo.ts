import type { AgentState, HistoryItem, ScreenResult, ServerMsg } from '../../../daemon/src/types';
import type { Client } from './client';

const base = (p: Partial<AgentState> & Pick<AgentState, 'id' | 'kind' | 'project'>): AgentState => ({
  pid: 1000 + p.id.charCodeAt(1) * 7, cwd: `/demo/${p.project}`, host: 'tmux', hostRef: { tmuxPane: '%1' }, status: 'working',
  activity: { summary: 'thinking…' }, canReply: true, canFocus: true, lastEventAt: Date.now(), ...p,
});

const TOOLS: [string, string][] = [
  ['Bash', 'Bash: npm test'], ['Read', 'reading Table.tsx'], ['Edit', 'editing Table.tsx'],
  ['Grep', 'searching useAgents'], ['WebFetch', 'browsing the web'], ['Bash', 'Bash: git status'],
];

/** Scripted fake agents behind the same Client interface. */
export function createDemoClient(): Client {
  let n = 0;
  const askId = () => `demo-ask-${++n}`;
  const agents = new Map<string, AgentState>([
    ['d1', base({ id: 'd1', kind: 'claude', project: 'ui-server', activity: { tool: 'Edit', summary: 'editing Table.tsx' } })],
    ['d2', base({ id: 'd2', kind: 'codex', project: 'api', status: 'needs_input', host: 'orca', hostRef: { orcaPane: 'x' },
      activity: { tool: 'Bash', summary: 'wants to use Bash' },
      ask: { id: askId(), type: 'permission', text: 'Bash: rm -rf dist && npm run build', options: ['Allow', 'Deny'] } })],
    ['d3', base({ id: 'd3', kind: 'gemini', project: 'docs', status: 'idle', host: 'terminal', hostRef: { termProgram: 'WarpTerminal' }, canReply: false,
      activity: { summary: 'done — what next?' }, ask: { id: askId(), type: 'idle', text: 'Finished. What should I do next?' } })],
    ['d4', base({ id: 'd4', kind: 'claude', project: 'agents-village', status: 'needs_input', activity: { summary: 'has a question' },
      ask: { id: askId(), type: 'question', text: 'Which avatar pack should I use?', options: ['KayKit', 'Quaternius', 'Robots'] } })],
    ['d5', base({ id: 'd5', kind: 'claude', project: 'ui-server', status: 'crashed', crashedAt: Date.now(), canReply: false, activity: { summary: 'exited' } })],
    ['d6', base({ id: 'd6', kind: 'codex', project: 'agents-village', activity: { tool: 'Grep', summary: 'searching holds' } })],
  ]);
  let emit: (m: ServerMsg) => void = () => {};
  const put = (a: AgentState) => { agents.set(a.id, a); emit({ type: 'upsert', agent: a }); };

  return {
    mode: 'demo',
    connect(onMsg, onStatus) {
      emit = onMsg;
      onMsg({ type: 'snapshot', agents: [...agents.values()] });
      onStatus(true);
      let tick = 0;
      const timer = setInterval(() => {
        tick++;
        for (const a of agents.values()) {
          if (a.status !== 'working') continue;
          const [tool, summary] = TOOLS[(tick + a.id.charCodeAt(1)) % TOOLS.length];
          put({ ...a, activity: { tool, summary }, lastEventAt: Date.now() });
        }
        if (tick % 5 === 0) { // someone finishes a turn now and then
          const w = [...agents.values()].find((a) => a.status === 'working');
          if (w) put({ ...w, status: 'idle', activity: { summary: 'done — what next?' }, ask: { id: askId(), type: 'idle', text: 'Finished. What should I do next?' } });
        }
      }, 3500);
      return () => clearInterval(timer);
    },
    async reply(id, ask, r) {
      const a = agents.get(id);
      if (!a?.ask || a.ask.id !== ask) return { ok: false, error: 'stale' };
      if (!a.canReply) return { ok: false, error: 'no-channel' };
      setTimeout(() => put({ ...a, status: 'working', ask: undefined, activity: { summary: r.option === 'Deny' ? 'finding another way' : 'got your reply' } }), 400);
      return { ok: true, via: 'demo' };
    },
    async focus() {},
    async screen(id): Promise<ScreenResult> {
      const a = agents.get(id);
      const t = Math.floor(Date.now() / 1000);
      if (a?.host === 'orca') {
        return { source: 'screen', lines: ['╭─ codex ─ api ───────────────────────────────╮', '│ Allow command?                              │', '│   rm -rf dist && npm run build              │', '│ ❯ 1. Yes   2. No, tell Codex what to do     │', '╰─────────────────────────────────────────────╯', '', `  ${'.'.repeat(t % 4)}`] };
      }
      const now = Date.now();
      return { source: 'commands', commands: [
        { at: now - 40_000, cmd: 'git status --short', output: ' M web/src/ui/Table.tsx\n?? web/src/ui/Table.test.tsx', running: false },
        { at: now - 20_000, cmd: 'npm test -- Table', output: ' ✓ Table > renders rows (12ms)\n ✓ Table > sorts (4ms)\n\n Tests  2 passed (2)', running: false },
        { at: now - 2_000, cmd: 'npm run build', output: '', running: a?.status === 'working' },
      ] };
    },
    async history(id): Promise<HistoryItem[]> {
      const now = Date.now();
      const a = agents.get(id);
      return [
        { at: now - 60_000, role: 'user', text: `Work on ${a?.project ?? 'the project'}` },
        { at: now - 50_000, role: 'assistant', text: 'Looking at the codebase first.' },
        { at: now - 40_000, role: 'tool', text: 'searching useAgents' },
        { at: now - 30_000, role: 'tool', text: 'editing Table.tsx' },
        { at: now - 10_000, role: 'assistant', text: a?.activity.summary ?? '' },
      ];
    },
  };
}
