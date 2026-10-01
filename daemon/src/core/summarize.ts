import { clip } from '../util';

export type ToolCategory = 'bash' | 'read' | 'edit' | 'web' | 'other';

const BASH = new Set(['Bash', 'BashOutput', 'exec_command', 'shell', 'local_shell', 'run_shell_command', 'write_stdin']);
const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'read_file', 'read_many_files', 'list_directory', 'glob', 'search_file_content', 'grep']);
const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch', 'write_file', 'replace', 'edit']);
const WEB = new Set(['WebFetch', 'WebSearch', 'web_fetch', 'google_web_search', 'web_search']);

export function toolCategory(tool: string): ToolCategory {
  if (BASH.has(tool)) return 'bash';
  if (READ.has(tool)) return 'read';
  if (EDIT.has(tool)) return 'edit';
  if (WEB.has(tool) || tool.startsWith('mcp__')) return 'web';
  return 'other';
}

const base = (p: unknown) => (typeof p === 'string' ? p.split('/').pop() || p : '');

export function summarizeTool(tool: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const cmd = i.command ?? i.cmd;
  switch (toolCategory(tool)) {
    case 'bash':
      return cmd ? `Bash: ${clip(String(Array.isArray(cmd) ? cmd.join(' ') : cmd), 60)}` : 'Bash';
    case 'edit': {
      const f = base(i.file_path ?? i.path ?? i.notebook_path);
      return f ? `editing ${f}` : 'editing files';
    }
    case 'read': {
      if (i.pattern) return `searching ${clip(String(i.pattern), 50)}`;
      const f = base(i.file_path ?? i.path ?? i.absolute_path);
      return f ? `reading ${f}` : 'reading files';
    }
    case 'web':
      return tool.startsWith('mcp__') ? `using ${tool.split('__')[1] ?? tool}` : 'browsing the web';
    default:
      return tool;
  }
}
