import type { HistoryItem, Reply, ScreenResult, ServerMsg } from '../../../daemon/src/types';
import { createDemoClient } from './demo';

export type ReplyResult = { ok: true; via: string } | { ok: false; error: 'stale' | 'no-channel' | 'network' | string };

/** The single network path between UI and villaged. */
export interface Client {
  readonly mode: 'live' | 'demo' | 'no-token';
  connect(onMsg: (m: ServerMsg) => void, onStatus: (open: boolean) => void): () => void;
  reply(id: string, askId: string, r: Reply): Promise<ReplyResult>;
  focus(id: string): Promise<void>;
  history(id: string): Promise<HistoryItem[]>;
  screen(id: string): Promise<ScreenResult>;
}

function readToken(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    try { localStorage.setItem('village.token', fromUrl); } catch { /* storage blocked */ }
    url.searchParams.delete('token');
    history.replaceState(null, '', url); // keep the token out of screenshots / shared URLs
    return fromUrl;
  }
  try { return localStorage.getItem('village.token'); } catch { return null; }
}

function createLiveClient(token: string): Client {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const call = async (path: string, init: RequestInit = {}) => fetch(`/api${path}`, { ...init, headers });

  return {
    mode: 'live',
    connect(onMsg, onStatus) {
      let ws: WebSocket | undefined;
      let retry = 500;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      const open = () => {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
        // The daemon only holds agents' hooks while a *visible* village tab is watching.
        const sendVisibility = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'visibility', visible: document.visibilityState === 'visible' })); };
        document.addEventListener('visibilitychange', sendVisibility);
        ws.onopen = () => { retry = 500; onStatus(true); sendVisibility(); };
        ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
        ws.onclose = () => {
          document.removeEventListener('visibilitychange', sendVisibility);
          onStatus(false);
          if (!stopped) timer = setTimeout(open, (retry = Math.min(retry * 2, 5000)));
        };
      };
      open();
      return () => { stopped = true; clearTimeout(timer); ws?.close(); };
    },
    async reply(id, askId, r) {
      try {
        const res = await call(`/agents/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ askId, ...r }) });
        const body = await res.json().catch(() => ({}));
        return res.ok ? { ok: true, via: body.via } : { ok: false, error: body.error ?? `http ${res.status}` };
      } catch {
        return { ok: false, error: 'network' };
      }
    },
    async focus(id) {
      await call(`/agents/${encodeURIComponent(id)}/focus`, { method: 'POST' });
    },
    async history(id) {
      const res = await call(`/agents/${encodeURIComponent(id)}/history`);
      if (!res.ok) throw new Error(`history failed (${res.status})`);
      return res.json();
    },
    async screen(id) {
      const res = await call(`/agents/${encodeURIComponent(id)}/screen`);
      if (!res.ok) throw new Error(`screen failed (${res.status})`);
      return res.json();
    },
  };
}

function pick(): Client {
  // the GitHub Pages build has no daemon behind it: always the demo
  if (import.meta.env.VITE_DEMO === '1' || new URLSearchParams(location.search).has('demo')) return createDemoClient();
  const token = readToken();
  if (token) return createLiveClient(token);
  return { ...createDemoClient(), mode: 'no-token' };
}

export const api: Client = pick();
