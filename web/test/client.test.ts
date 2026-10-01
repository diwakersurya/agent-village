import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class FakeWS {
  static OPEN = 1;
  static last: FakeWS | undefined;
  static count = 0;
  readyState = 0;
  onopen?: () => void;
  onclose?: () => void | Promise<void>;
  onmessage?: (e: { data: string }) => void;
  constructor(public url: string) { FakeWS.last = this; FakeWS.count++; }
  send() {}
  close() {}
}

const store = new Map<string, string>();

beforeEach(() => {
  vi.useFakeTimers();
  store.clear();
  FakeWS.count = 0;
  vi.stubGlobal('location', { href: 'http://localhost:7777/', host: 'localhost:7777', protocol: 'http:', search: '' });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });
  vi.stubGlobal('history', { replaceState() {} });
  vi.stubGlobal('WebSocket', FakeWS);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

const load = () => import('../src/api/client');

describe('live client', () => {
  it('a socket refused before it ever opened + 401 from /api: forgets the token, switches to no-token, stops retrying', async () => {
    store.set('village.token', 'stale');
    const fetchMock = vi.fn(async () => ({ status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { createLiveClient } = await load();
    const c = createLiveClient('stale');
    const onMode = vi.fn(), onStatus = vi.fn();
    c.connect(() => {}, onStatus, onMode);
    await FakeWS.last!.onclose!();
    expect(fetchMock).toHaveBeenCalledWith('/api/agents', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer stale' }) }));
    expect(onMode).toHaveBeenCalledWith('no-token');
    expect(c.mode).toBe('no-token');
    expect(store.has('village.token')).toBe(false);
    expect(onStatus).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(10_000);
    expect(FakeWS.count).toBe(1);
  });

  it('daemon unreachable (probe fails): keeps the token and retries', async () => {
    store.set('village.token', 'good');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const { createLiveClient } = await load();
    const c = createLiveClient('good');
    const onMode = vi.fn();
    c.connect(() => {}, () => {}, onMode);
    await FakeWS.last!.onclose!();
    vi.advanceTimersByTime(1_000);
    expect(FakeWS.count).toBe(2);
    expect(onMode).not.toHaveBeenCalled();
    expect(c.mode).toBe('live');
    expect(store.get('village.token')).toBe('good');
  });

  it('a socket that opened and later dropped just reconnects (no probe)', async () => {
    const fetchMock = vi.fn(async () => ({ status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { createLiveClient } = await load();
    createLiveClient('t').connect(() => {}, () => {});
    FakeWS.last!.onopen!();
    await FakeWS.last!.onclose!();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(FakeWS.count).toBe(2);
  });

  it('survives blocked storage', async () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 401 })));
    const { createLiveClient, api } = await load();
    expect(api.mode).toBe('no-token');
    const c = createLiveClient('t');
    c.connect(() => {}, () => {});
    await FakeWS.last!.onclose!();
    expect(c.mode).toBe('no-token');
  });
});

describe('no token', () => {
  it('does not stream demo agents unless asked for', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { api } = await load();
    expect(api.mode).toBe('no-token');
    const onMsg = vi.fn(), onStatus = vi.fn();
    api.connect(onMsg, onStatus);
    vi.advanceTimersByTime(10_000);
    expect(onMsg).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(false);
    expect(await api.reply('a', 'k', { option: 'Allow' } as never)).toEqual({ ok: false, error: 'no-token' });
  });
  it('?demo opts into the scripted agents', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:7777/?demo=1', host: 'localhost:7777', protocol: 'http:', search: '?demo=1' });
    const { api } = await load();
    expect(api.mode).toBe('demo');
    const onMsg = vi.fn();
    const stop = api.connect(onMsg, () => {});
    expect(onMsg).toHaveBeenCalledWith(expect.objectContaining({ type: 'snapshot' }));
    stop();
  });
});
