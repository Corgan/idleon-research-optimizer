import { SNEAKING_SPRITE as sprite } from '../stats/data/w6/sneaking-sprites.js';

const images = new Map();
const failures = new Map();
function image(file) {
  if (!images.has(file)) {
    const img = new Image();
    img.onerror = () => failures.set(img, file);
    img.src = new URL('../../assets/sneaking/' + file, import.meta.url).href;
    images.set(file, img);
  }
  return images.get(file);
}

export function sneakingSceneFrame(mode, elapsed) {
  const ranges = { normal: [31, 40], training: [7, 14], door: [56, 62], untie: [74, 80], ko: [99, 104] };
  const [lo, hi] = ranges[mode] || [42, 48];
  const duration = sprite.durations.slice(lo, hi + 1).reduce((sum, value) => sum + value, 0);
  let time = ((elapsed % duration) + duration) % duration;
  for (let frame = lo; frame <= hi; frame++) {
    time -= sprite.durations[frame];
    if (time < 0) return frame;
  }
  return lo;
}

export function drawSneakingTwin(ctx, body, hat, frame, x, feet, facing = 1) {
  const width = sprite.width / sprite.across;
  const height = sprite.height / sprite.down;
  ctx.save();
  ctx.translate(x, feet);
  ctx.scale(2 * facing, 2);
  ctx.drawImage(body, frame % sprite.across * width, Math.floor(frame / sprite.across) * height,
    width, height, -sprite.originX, -sprite.originY, width, height);
  if (hat?.naturalWidth) {
    const flipped = (frame >= 16 && frame <= 23) || frame === 29 || frame === 30;
    ctx.translate(-sprite.originX + Math.round((flipped ? 37 : 4) + sprite.hatX[frame]),
      -sprite.originY + Math.round(-4 + sprite.hatY[frame]));
    if (flipped) ctx.scale(-1, 1);
    ctx.drawImage(hat, 0, 0);
  }
  ctx.restore();
}

export function mountSneakingScenes(root, floors) {
  const scenes = Array.from(root.querySelectorAll('canvas[data-sneaking-floor]')).map(canvas => ({
    canvas, ctx: canvas.getContext('2d'), twins: floors[Number(canvas.dataset.sneakingFloor)] || [],
  }));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const body = image(sprite.file);
  const used = new Set([body]);
  for (const scene of scenes) {
    scene.canvas.width = 874;
    scene.canvas.height = 150;
    for (const twin of scene.twins) if (twin.hat != null) used.add(image('NjHat' + twin.hat + '.png'));
  }
  let request;
  let previous = -Infinity;
  function draw(time) {
    request = null;
    if (document.hidden) return;
    if (!reduced.matches) request = requestAnimationFrame(draw);
    if (time - previous < 50 && !reduced.matches) return;
    previous = time;
    for (const { canvas, ctx, twins } of scenes) {
      if (!canvas.isConnected || canvas.getBoundingClientRect().width === 0) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      const missing = [...used].filter(img => failures.has(img));
      if (missing.length && !canvas.parentElement.querySelector('.saved-scene-error')) {
        const note = document.createElement('span');
        note.className = 'saved-scene-error';
        note.setAttribute('role', 'alert');
        note.style.cssText = 'position:absolute;bottom:0;left:0;background:#1a1a2e;color:#f88;font-size:12px';
        note.textContent = 'Sneaking art unavailable: ' + missing.map(img => failures.get(img)).join(', ');
        canvas.parentElement.append(note);
      }
      if (!body.naturalWidth) continue;
      twins.forEach((twin, index) => {
        const phase = reduced.matches ? 0 : time + twin.idx * 271;
        const moving = twin.mode === 'normal' || twin.mode === 'training';
        const travel = moving && !reduced.matches ? Math.sin(phase / 4000) * 15 : 0;
        const x = 52 + (index + 0.5) * 770 / twins.length + travel;
        const frame = sneakingSceneFrame(twin.mode, phase);
        const facing = moving && Math.cos(phase / 4000) < 0 ? -1 : 1;
        drawSneakingTwin(ctx, body, twin.hat == null ? null : image('NjHat' + twin.hat + '.png'), frame, x, 139, facing);
      });
    }
  }
  function redraw() {
    if (document.hidden) {
      if (request != null) cancelAnimationFrame(request);
      request = null;
    } else if (request == null) request = requestAnimationFrame(draw);
  }
  for (const img of used) {
    img.addEventListener('load', redraw);
    img.addEventListener('error', redraw);
  }
  document.addEventListener('visibilitychange', redraw);
  reduced.addEventListener('change', redraw);
  request = requestAnimationFrame(draw);
  return () => {
    if (request != null) cancelAnimationFrame(request);
    for (const img of used) {
      img.removeEventListener('load', redraw);
      img.removeEventListener('error', redraw);
    }
    document.removeEventListener('visibilitychange', redraw);
    reduced.removeEventListener('change', redraw);
  };
}
