import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

const W = 512;
const H = 294; // matches the 0.87 × 0.5 monitor screen
const FONT = '700 54px ui-monospace, SFMono-Regular, Menlo, monospace';
const LINE = 62;
const MAX_LINES = 4;

/** Wraps text into at most MAX_LINES lines of maxW px; breaks long words (paths, commands) by character. */
export function wrapText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text.replace(/\s+/g, ' ').trim()) {
    const next = cur + ch;
    if (measure(next) <= maxW) { cur = next; continue; }
    const cut = ch !== ' ' && cur.includes(' ') ? cur.lastIndexOf(' ') : cur.length;
    lines.push(cur.slice(0, cut).trimEnd());
    cur = (cur.slice(cut) + ch).trimStart();
  }
  if (cur) lines.push(cur);
  if (lines.length > MAX_LINES) {
    lines.length = MAX_LINES;
    lines[MAX_LINES - 1] = lines[MAX_LINES - 1].replace(/.$/, '…');
  }
  return lines;
}

/** A canvas-backed texture redrawn by `draw` whenever `deps` change. Real geometry: depth-tested and one-sided,
 *  unlike an Html overlay which always draws on top (through heads, beacons, walls). */
export function useCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [w, h]);
  useEffect(() => {
    const ctx = (tex.image as HTMLCanvasElement).getContext('2d');
    if (!ctx) return;
    draw(ctx);
    tex.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller lists what the drawing depends on
  }, [tex, ...deps]);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/** Monitor text: status-coloured screen with the activity line wrapped to fit. */
export function useTextTexture(text: string, bg: string) {
  return useCanvasTexture(W, H, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.font = FONT;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 4;
    const lines = wrapText(text, W - 40, (s) => ctx.measureText(s).width);
    const top = H / 2 - ((lines.length - 1) * LINE) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * LINE));
  }, [text, bg]);
}
