/**
 * 无限世界 demo 入口：玩家在中心，方向键/WASD 走动或拖拽平移，滚轮缩放。
 * 玩家周围的块按需流式生成、远处淘汰——演示「大地图、玩家周围才生成、不穿帮」。
 */
import { INFINITE_WORLD_DEFAULT, type InfiniteWorldSpec } from '../../../packages/shared/src/procgen/procgen-chunk';
import { getImagePack } from './demo-image-pack';
import { InfiniteWorld } from './infinite-world';
import { renderInfinite, type Camera } from './infinite-render';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('view');
const seedInput = el<HTMLInputElement>('seed');
const spriteToggle = el<HTMLInputElement>('sprites');
const hud = el<HTMLDivElement>('hud');

const pack = getImagePack();
const specFor = (seed: string): InfiniteWorldSpec => ({ ...INFINITE_WORLD_DEFAULT, seed });
let world = new InfiniteWorld(specFor(seedInput.value || 'infinite'));
const cam: Camera = { x: 0.5, y: 0.5, cellSize: 16 };

// 持续按键移动：记录按下的方向键。
const held = new Set<string>();
const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};
window.addEventListener('keydown', (e) => { if (MOVE_KEYS[e.code]) { held.add(e.code); e.preventDefault(); } });
window.addEventListener('keyup', (e) => held.delete(e.code));

// 拖拽平移。
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.x -= (e.clientX - lastX) / cam.cellSize;
  cam.y -= (e.clientY - lastY) / cam.cellSize;
  lastX = e.clientX;
  lastY = e.clientY;
});

// 滚轮缩放（朝画布中心）。
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  cam.cellSize = Math.min(40, Math.max(6, cam.cellSize * factor));
}, { passive: false });

seedInput.addEventListener('change', () => { world.reset(specFor(seedInput.value || 'infinite')); });
el<HTMLButtonElement>('recenter').addEventListener('click', () => { cam.x = 0.5; cam.y = 0.5; });

function resize(): void {
  canvas.width = Math.floor(canvas.clientWidth);
  canvas.height = Math.floor(canvas.clientHeight);
}
window.addEventListener('resize', resize);

let last = 0;
function frame(now: number): void {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;

  // 键盘移动：速度随缩放（格/秒），保持手感一致。
  let vx = 0;
  let vy = 0;
  for (const code of held) { const d = MOVE_KEYS[code]; if (d) { vx += d[0]; vy += d[1]; } }
  if (vx || vy) {
    const speed = 12;
    const len = Math.hypot(vx, vy) || 1;
    cam.x += (vx / len) * speed * dt;
    cam.y += (vy / len) * speed * dt;
  }

  world.beginFrame();
  const size = world.chunkSize;
  const centerCx = Math.floor(cam.x / size);
  const centerCy = Math.floor(cam.y / size);
  // 预取半径：覆盖视口再外扩 1 圈防穿帮；淘汰半径再大 1 圈避免抖动重生成。
  const viewChunks = Math.ceil((Math.max(canvas.width, canvas.height) / cam.cellSize) / size) + 1;
  world.prefetch(centerCx, centerCy, viewChunks);
  world.evict(centerCx, centerCy, viewChunks + 1);

  const view = renderInfinite(canvas, world, cam, pack, spriteToggle.checked && pack !== null);

  hud.textContent = `世界坐标 (${Math.round(cam.x)}, ${Math.round(cam.y)}) · 缩放 ${cam.cellSize.toFixed(0)}px`
    + ` · 可见 ${view.cols}×${view.rows} 格 · 已载 ${world.loadedChunks} 块 (${size}×${size})`
    + ` · 贴图 ${spriteToggle.checked && pack ? '开' : '关'}`;
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
