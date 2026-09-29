import type { Reply } from '../types';

interface Hold { askId: string; toolUseId?: string; resolve: (r: Reply | null) => void; timer: NodeJS.Timeout }

/** Hook requests parked until the user answers. At most one per agent. */
export class Holds {
  private map = new Map<string, Hold>();

  wait(agentId: string, askId: string, timeoutMs: number, toolUseId?: string): Promise<Reply | null> {
    this.cancel(agentId);
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish(agentId, null), timeoutMs);
      this.map.set(agentId, { askId, toolUseId, resolve, timer });
    });
  }

  resolve(agentId: string, askId: string, reply: Reply): boolean {
    if (!this.has(agentId, askId)) return false;
    this.finish(agentId, reply);
    return true;
  }

  has(agentId: string, askId?: string): boolean {
    const h = this.map.get(agentId);
    return !!h && (askId === undefined || h.askId === askId);
  }

  toolUseId(agentId: string): string | undefined {
    return this.map.get(agentId)?.toolUseId;
  }

  cancel(agentId: string): void {
    this.finish(agentId, null);
  }

  cancelAll(): void {
    for (const id of [...this.map.keys()]) this.finish(id, null);
  }

  private finish(agentId: string, reply: Reply | null) {
    const h = this.map.get(agentId);
    if (!h) return;
    clearTimeout(h.timer);
    this.map.delete(agentId);
    h.resolve(reply);
  }
}
