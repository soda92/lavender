import type { RenderedSprite, RenderedSpritePart } from './metadata';

/**
 * The engine composites every pose layer (body, face plate, ...) onto ONE
 * PSD page bitmap before display. We instead ship body/face as separate PNGs
 * and stacked them as separate <img> elements. When the stage is CSS-scaled,
 * the browser rasterizes each image independently: at the shared edge the
 * face plate's opaque border is filtered against the body's transparent hole,
 * bleeding the background through as a faint hairline. Compositing the parts
 * onto a single canvas first — exactly like the engine's PSDLayer page —
 * makes that edge internal to one opaque bitmap, so scaling cannot open a
 * seam.
 */

const MAX_CACHED = 80;
const cache = new Map<string, HTMLCanvasElement>();
const inflight = new Map<string, Promise<HTMLCanvasElement>>();

function compositeKey(r: RenderedSprite): string {
  const part = (p: RenderedSpritePart | null) =>
    p ? `${p.url}@${p.x},${p.y},${p.w},${p.h},${p.opacity}` : '';
  return `${r.page.w}x${r.page.h}|${part(r.body)}|${part(r.face)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load sprite: ${src}`));
    img.src = src;
  });
}

function buildComposite(r: RenderedSprite): Promise<HTMLCanvasElement> {
  const key = compositeKey(r);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    // Body first, then the face plate on top; drawImage() with explicit
    // destination rects in case the PNG's natural size ever differs.
    const parts = [r.body, r.face].filter((p): p is RenderedSpritePart => !!p);
    const images = await Promise.all(parts.map((p) => loadImage(p.url)));
    const cv = document.createElement('canvas');
    cv.width = r.page.w;
    cv.height = r.page.h;
    const ctx = cv.getContext('2d');
    if (ctx) {
      images.forEach((img, i) => {
        const p = parts[i];
        ctx.globalAlpha = p.opacity;
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
      });
      ctx.globalAlpha = 1;
    }
    cache.set(key, cv);
    // Simple insertion-order LRU.
    if (cache.size > MAX_CACHED) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    inflight.delete(key);
    return cv;
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Paint the body+face composite for `rendered` onto `target`. Resolves false
 * if the sprite changed / component went away before the bitmap was ready.
 */
export async function paintSpriteComposite(
  rendered: RenderedSprite,
  target: HTMLCanvasElement,
  isCurrent: () => boolean,
): Promise<boolean> {
  const source = await buildComposite(rendered);
  if (!isCurrent()) return false;
  if (target.width !== rendered.page.w || target.height !== rendered.page.h) {
    target.width = rendered.page.w;
    target.height = rendered.page.h;
  }
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
  return true;
}
