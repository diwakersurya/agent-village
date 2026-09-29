/**
 * Table tennis rally vs a bot, in the table's frame: x across (±TT_W/2), z along (±TT_L/2), y up.
 * You always play the +z end (the component mirrors it if you stand at the other end); the bot plays -z.
 */
export const TT_W = 1.525, TT_L = 2.74, TT_TOP = 0.78;
const G = 9.8;
const BOUNCE = 0.88;
const HIT_Z = TT_L / 2 + 0.15; // sweet spot: just past your end of the table
export const WIN_AT = 11;

export type Who = 'you' | 'bot';
export interface TTBall { x: number; y: number; z: number; vx: number; vy: number; vz: number }
export interface Rally { ball: TTBall; phase: 'serve' | 'rally' | 'point'; hitter: Who; bounced: boolean; hits: number; score: Record<Who, number>; wait: number; botMissed: boolean }

export const newRally = (score: Record<Who, number> = { you: 0, bot: 0 }): Rally =>
  ({ ball: { x: 0.2, y: TT_TOP + 0.25, z: TT_L / 2 + 0.1, vx: 0, vy: 0, vz: 0 }, phase: 'serve', hitter: 'you', bounced: false, hits: 0, score, wait: 0, botMissed: false });

/** Velocity that carries the ball from where it is to land on the table at (tx, tz) in T seconds. */
export function aimShot(b: TTBall, tx: number, tz: number, T: number) {
  b.vx = (tx - b.x) / T; b.vz = (tz - b.z) / T;
  b.vy = (TT_TOP - b.y + 0.5 * G * T * T) / T;
}

/** Where your swing sends the ball, or null when the ball isn't in reach. Early swing → your left, late → right. */
export function swing(b: TTBall): { tx: number; tz: number } | null {
  if (b.vz <= 0 || b.z < TT_L / 2 - 0.3 || b.z > TT_L / 2 + 0.7 || b.y < TT_TOP - 0.05 || b.y > TT_TOP + 0.8) return null;
  const t = Math.max(-1, Math.min(1, (b.z - HIT_Z) / 0.4));
  // a very mistimed swing still connects, but sails long
  return { tx: -t * 0.6, tz: Math.abs(t) > 0.9 ? -TT_L / 2 - 0.4 : -TT_L / 4 - 0.25 * Math.random() };
}

export type RallyEvent = 'bounce' | 'hit' | 'point-you' | 'point-bot' | 'game-you' | 'game-bot';

/** Advance the rally; `swung` = you swung this frame. Mutates r; returns events for sounds / messages. */
export function stepRally(r: Rally, dt: number, swung: boolean, rand = Math.random): RallyEvent[] {
  const ev: RallyEvent[] = [];
  const b = r.ball;
  if (r.phase === 'point') {
    r.wait -= dt;
    if (r.wait <= 0) Object.assign(r, newRally(r.score.you >= WIN_AT || r.score.bot >= WIN_AT ? { you: 0, bot: 0 } : r.score));
    return ev;
  }
  if (r.phase === 'serve') {
    if (!swung) return ev;
    aimShot(b, (rand() - 0.5) * 0.8, -TT_L / 4 - rand() * 0.3, 0.85);
    Object.assign(r, { phase: 'rally', hitter: 'you', bounced: false, hits: 1 });
    ev.push('hit');
    return ev;
  }
  if (swung && r.hitter === 'bot' && r.bounced) {
    const s = swing(b);
    if (s) { aimShot(b, s.tx, s.tz, 0.8); Object.assign(r, { hitter: 'you', bounced: false, hits: r.hits + 1 }); ev.push('hit'); }
  }
  // bot: returns once it has bounced on its side and reached its end, missing more as the rally goes on
  if (r.hitter === 'you' && r.bounced && !r.botMissed && b.vz < 0 && b.z < -TT_L / 2 - 0.1 && b.y > TT_TOP - 0.1) {
    if (rand() > 0.1 + r.hits * 0.02) {
      aimShot(b, (rand() - 0.5) * 1.0, TT_L / 4 + rand() * 0.35, 0.9);
      Object.assign(r, { hitter: 'bot', bounced: false, hits: r.hits + 1 });
      ev.push('hit');
    } else r.botMissed = true; // let it fly past
  }
  b.vy -= G * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  const onTable = Math.abs(b.x) <= TT_W / 2 && Math.abs(b.z) <= TT_L / 2;
  if (b.y <= TT_TOP && b.vy < 0 && onTable && b.y > TT_TOP - 0.1) {
    b.y = TT_TOP; b.vy = -b.vy * BOUNCE;
    // landing on the hitter's own side (or a second bounce) loses the point
    const receiverSide = r.hitter === 'you' ? b.z < 0 : b.z > 0;
    if (!receiverSide || r.bounced) return award(r, r.hitter === 'you' ? 'bot' : 'you', ev);
    r.bounced = true;
    ev.push('bounce');
  }
  // off the table: whoever failed to return it (or hit it out) loses
  if (b.y < 0.02 || Math.abs(b.z) > TT_L / 2 + 1.6) return award(r, r.bounced ? r.hitter : r.hitter === 'you' ? 'bot' : 'you', ev);
  return ev;
}

function award(r: Rally, who: Who, ev: RallyEvent[]): RallyEvent[] {
  r.score[who]++;
  r.phase = 'point'; r.wait = 1.2;
  ev.push(r.score[who] >= WIN_AT ? `game-${who}` : `point-${who}`);
  return ev;
}
