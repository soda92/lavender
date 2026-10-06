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

type FacePage = NonNullable<RenderedSprite['facePage']>;

const faceCache = new Map<string, HTMLCanvasElement>();
const faceInflight = new Map<string, Promise<HTMLCanvasElement>>();

function buildFaceComposite(fp: FacePage): Promise<HTMLCanvasElement> {
  const part = (p: RenderedSpritePart | null) =>
    p ? `${p.url}@${p.x},${p.y},${p.w},${p.h},${p.opacity}` : '';
  const key = `${fp.w}x${fp.h}|${part(fp.body)}|${part(fp.face)}`;
  const hit = faceCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = faceInflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    // Body first, then the face plate on top, at RAW authored-page coords.
    const parts = [fp.body, fp.face].filter((p): p is RenderedSpritePart => !!p);
    const images = await Promise.all(parts.map((p) => loadImage(p.url)));
    const cv = document.createElement('canvas');
    cv.width = fp.w;
    cv.height = fp.h;
    const ctx = cv.getContext('2d');
    if (ctx) {
      images.forEach((img, i) => {
        const p = parts[i];
        ctx.globalAlpha = p.opacity;
        ctx.drawImage(img, p.x, p.y, p.w, p.h);
      });
      ctx.globalAlpha = 1;
    }
    faceCache.set(key, cv);
    if (faceCache.size > MAX_CACHED) {
      const oldest = faceCache.keys().next().value;
      if (oldest !== undefined) faceCache.delete(oldest);
    }
    faceInflight.delete(key);
    return cv;
  })();

  faceInflight.set(key, promise);
  return promise;
}

/**
 * Paint the message-window bust ("miniface"): the level-0 顔領域 crop of
 * the composed standing sprite, drawn 1:1 into `target`. The level-0 bust
 * page is the full authored (untrimmed) canvas; the marker rect indexes it
 * directly in raw canvas coordinates.
 */
export async function paintSpriteFace(
  rendered: RenderedSprite,
  target: HTMLCanvasElement,
  isCurrent: () => boolean,
): Promise<boolean> {
  const fp = rendered.facePage;
  if (!fp) {
    // Defensive fallback for manifests lacking a level-0 page.
    const source = await buildComposite(rendered);
    if (!isCurrent()) return false;
    const r = rendered.faceRect;
    if (target.width !== r.width || target.height !== r.height) {
      target.width = r.width;
      target.height = r.height;
    }
    const ctx = target.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(
      source,
      r.left - rendered.page.x, r.top - rendered.page.y, r.width, r.height,
      0, 0, r.width, r.height,
    );
    return true;
  }

  const source = await buildFaceComposite(fp);
  if (!isCurrent()) return false;
  const r = fp.rect;
  if (target.width !== r.width || target.height !== r.height) {
    target.width = r.width;
    target.height = r.height;
  }
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, r.left, r.top, r.width, r.height, 0, 0, r.width, r.height);
  return true;
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
