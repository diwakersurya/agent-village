import type { HistoryItem, Reply, ScreenResult, ServerMsg } from '../../../daemon/src/types';
import { createDemoClient } from './demo';

export type ReplyResult = { ok: true; via: string } | { ok: false; error: 'stale' | 'no-channel' | 'network' | string };

/** live = talking to villaged; demo = scripted agents (opted into with ?demo); no-token = no (valid) access token: nothing to show. */
export type ClientMode = 'live' | 'demo' | 'no-token';

const TOKEN_KEY = 'village.token';

/** The single network path between UI and villaged. */
export interface Client {
  /** Current mode; a live client drops to 'no-token' when the daemon rejects its token (reported via connect's onMode). */
  readonly mode: ClientMode;
  connect(onMsg: (m: ServerMsg) => void, onStatus: (open: boolean) => void, onMode?: (m: ClientMode) => void): () => void;
  reply(id: string, askId: string, r: Reply): Promise<ReplyResult>;
  focus(id: string): Promise<void>;
  history(id: string): Promise<HistoryItem[]>;
  screen(id: string): Promise<ScreenResult>;
}

function readToken(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    try { localStorage.setItem(TOKEN_KEY, fromUrl); } catch { /* storage blocked */ }
    url.searchParams.delete('token');
    history.replaceState(null, '', url); // keep the token out of screenshots / shared URLs
    return fromUrl;
  }
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function forgetToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

/** Not connected (no token, or a rejected one): streams nothing, so the UI can say so instead of faking a live village. */
export function createOfflineClient(): Client {
  const notConnected = () => Promise.reject(new Error('not connected to villaged'));
  return {
    mode: 'no-token',
    connect(_onMsg, onStatus) { onStatus(false); return () => {}; },
    async reply() { return { ok: false, error: 'no-token' }; },
    async focus() {},
    history: notConnected,
    screen: notConnected,
  };
}

export function createLiveClient(token: string): Client {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const call = async (path: string, init: RequestInit = {}) => fetch(`/api${path}`, { ...init, headers });
  let mode: ClientMode = 'live';

  return {
    get mode() { return mode; },
    connect(onMsg, onStatus, onMode) {
      let ws: WebSocket | undefined;
      let retry = 500;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      /**
       * The socket closed without ever opening: a browser can't see the upgrade's status, so ask the cheapest
       * authenticated endpoint. 401 = the token is stale (daemon re-keyed): forget it and stop retrying.
       */
      const rejected = async () => {
        try { return (await call('/agents')).status === 401; } catch { return false; } // daemon down: keep retrying
      };
      const open = () => {
        let opened = false;
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
        // The daemon only holds agents' hooks while a *visible* village tab is watching.
        const sendVisibility = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'visibility', visible: document.visibilityState === 'visible' })); };
        document.addEventListener('visibilitychange', sendVisibility);
        ws.onopen = () => { opened = true; retry = 500; onStatus(true); sendVisibility(); };
        ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
        ws.onclose = async () => {
          document.removeEventListener('visibilitychange', sendVisibility);
          onStatus(false);
          if (stopped) return;
          if (!opened && await rejected()) {
            if (stopped) return;
            stopped = true;
            forgetToken();
            mode = 'no-token';
            onMode?.(mode);
            return;
          }
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
  // no token: show the "not connected" notice; demo agents only when asked for (?demo)
  return createOfflineClient();
}

export const api: Client = pick();
