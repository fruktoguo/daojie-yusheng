/**
 * 秘境生成器 demo：页面装配与交互。
 * 生成逻辑全部来自 packages/shared/src/procgen（与未来服务端共用同一实现）。
 */
import { generateProcgenMap } from '../../../packages/shared/src/procgen/procgen-generator';
import { buildProcgenTileCatalog, findUnregisteredTileChars } from '../../../packages/shared/src/procgen/procgen-catalog';
import { PROCGEN_BUILTIN_PRESETS } from '../../../packages/shared/src/procgen/procgen-presets';
import { hashStringToUint32 } from '../../../packages/shared/src/procgen/procgen-random';
import type { ProcgenBiomePreset, ProcgenMapResult, ProcgenTileDef } from '../../../packages/shared/src/procgen/procgen-types';
import { renderMap, renderLegend, describeCell } from './demo-render';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const presetSelect = el<HTMLSelectElement>('preset-select');
const seedInput = el<HTMLInputElement>('seed-input');
const widthInput = el<HTMLInputElement>('width-input');
const heightInput = el<HTMLInputElement>('height-input');
const cellSizeInput = el<HTMLInputElement>('cell-size');
const canvas = el<HTMLCanvasElement>('map-canvas');
const tooltip = el<HTMLDivElement>('tooltip');
const tilesJsonInput = el<HTMLTextAreaElement>('tiles-json');
const presetJsonInput = el<HTMLTextAreaElement>('preset-json');
const configError = el<HTMLDivElement>('config-error');

let lastResult: ProcgenMapResult | null = null;
let lastCatalog = buildProcgenTileCatalog();
let lastPresetName = '';

function parseCustomTiles(): ProcgenTileDef[] {
  const raw = tilesJsonInput.value.trim();
  return raw ? (JSON.parse(raw) as ProcgenTileDef[]) : [];
}

function currentPreset(): ProcgenBiomePreset {
  return JSON.parse(presetJsonInput.value) as ProcgenBiomePreset;
}

function generate(): void {
  configError.textContent = '';
  try {
    const preset = currentPreset();
    const tiles = parseCustomTiles();
    const seed = seedInput.value.trim() || 'seed';
    const width = widthInput.value ? Number(widthInput.value) : undefined;
    const height = heightInput.value ? Number(heightInput.value) : undefined;
    const start = performance.now();
    const result = generateProcgenMap({ preset, tiles, seed, widthOverride: width, heightOverride: height });
    const elapsedMs = performance.now() - start;
    lastResult = result;
    lastCatalog = buildProcgenTileCatalog(tiles);
    lastPresetName = preset.name;
    renderMap(canvas, result, lastCatalog, Number(cellSizeInput.value));
    renderLegend(el('legend'), result, lastCatalog);
    const chestCount = result.contentAnchors.filter((a) => a.kind === 'chest').length;
    const monsterCount = result.contentAnchors.filter((a) => a.kind === 'monster').length;
    const doorCount = result.stats.tileCounts['structure:door'] ?? 0;
    el('stats').textContent = [
      `种子：${result.seed}    尺寸：${result.width}×${result.height}`,
      `可行走占比：${(result.stats.walkableRatio * 100).toFixed(1)}%    连通块：${result.stats.regionCount}`,
      `凿通格数：${result.stats.carvedCells}    回填格数：${result.stats.filledCells}`,
      `传送阵：入口 1 / 出口 ${result.portals.length - 1}    房屋门数：${doorCount}`,
      `宝箱锚点：${chestCount}    怪物据点：${monsterCount}    生成耗时：${elapsedMs.toFixed(1)}ms`,
    ].join('\n');
    el('warnings').textContent = result.warnings.length ? `⚠ ${result.warnings.join('\n⚠ ')}` : '';
    renderThumbnails(preset, width, height);
  } catch (error) {
    configError.textContent = String(error instanceof Error ? error.message : error);
  }
}

/** 九宫格缩略图：同配置不同种子，点击换用。必须与主图用同一尺寸覆盖，否则预览与点击结果不一致。 */
function renderThumbnails(preset: ProcgenBiomePreset, width: number | undefined, height: number | undefined): void {
  const host = el('thumbs');
  host.innerHTML = '';
  const baseSeed = seedInput.value.trim() || 'seed';
  const tiles = parseCustomTiles();
  for (let i = 1; i <= 9; i += 1) {
    const seed = `${baseSeed}#${i}`;
    try {
      const result = generateProcgenMap({ preset, tiles, seed, widthOverride: width, heightOverride: height });
      const thumb = document.createElement('canvas');
      renderMap(thumb, result, lastCatalog, 2);
      thumb.title = `seed=${seed}（点击使用）`;
      thumb.addEventListener('click', () => {
        seedInput.value = seed;
        generate();
      });
      host.appendChild(thumb);
    } catch {
      /* 单个缩略图失败不阻塞主流程 */
    }
  }
}

function exportMapJson(): void {
  if (!lastResult) return;
  const result = lastResult;
  // 未注册字符导出后会被运行时解码静默回退，封闭边界/可走性口径失效，拒绝导出。
  const unregistered = findUnregisteredTileChars(lastCatalog);
  if (unregistered.length > 0) {
    configError.textContent = `无法导出：地图使用了未在 shared 注册的地块字符（${unregistered.join(', ')}），导入后会被静默回退。请先在 shared 注册这些地块字符，或改用默认地块。`;
    el('config-drawer').classList.remove('collapsed');
    return;
  }
  // seed 附加确定性短 hash：中文/非 ASCII 种子不再坍缩为下划线，不同种子导出不同 id。
  const seedHash = hashStringToUint32(result.seed).toString(36);
  const seedSlug = result.seed.replace(/[^\w-]/g, '') || 'seed';
  const docId = `mijing_${result.presetId}_${seedSlug}_${seedHash}`;
  // 传送阵导出为会被 normalize 读取的正规 portals 字段（草稿）：位置由生成器给定，
  // 传送目标 targetMapId 需策划在编辑器按秘境部署填写（占位值会在保存校验时提示）。
  const portals = result.portals.map((portal) => ({
    id: `${docId}:${portal.x},${portal.y}`,
    x: portal.x,
    y: portal.y,
    kind: 'portal' as const,
    trigger: 'manual' as const,
    direction: 'two_way' as const,
    targetMapId: '__SET_TARGET__',
    targetX: 0,
    targetY: 0,
    hidden: false,
    observeTitle: portal.role === 'entry' ? '秘境入口' : '秘境出口',
  }));
  const doc = {
    format: 2,
    id: docId,
    name: `秘境·${lastPresetName || result.presetId}`,
    width: result.width,
    height: result.height,
    mapGroupId: 'secret_realm',
    mapGroupName: '秘境',
    mapLv: 1,
    terrain: result.terrainRows,
    surface: result.surfaceRows,
    structure: result.structureRows,
    spawnPoint: result.spawnPoint,
    portals,
    monsterSpawns: [],
    npcs: [],
    landmarks: [],
    // 下划线前缀为 procgen 溯源与内容锚点，引擎 normalize 会忽略；仅供策划在编辑器
    // 对应位置摆宝箱（interactable）与怪物据点（monsterSpawns），并追溯生成参数。
    _procgen: { presetId: result.presetId, seed: result.seed },
    _procgenContent: result.contentAnchors,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${doc.id}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function init(): void {
  for (const preset of PROCGEN_BUILTIN_PRESETS) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = `${preset.name}（${preset.id}）`;
    presetSelect.appendChild(option);
  }
  const loadPresetJson = (): void => {
    const preset = PROCGEN_BUILTIN_PRESETS.find((p) => p.id === presetSelect.value) ?? PROCGEN_BUILTIN_PRESETS[0];
    presetJsonInput.value = JSON.stringify(preset, null, 2);
  };
  loadPresetJson();
  presetSelect.addEventListener('change', () => { loadPresetJson(); generate(); });
  el('generate-btn').addEventListener('click', generate);
  el('apply-config').addEventListener('click', generate);
  el('export-btn').addEventListener('click', exportMapJson);
  el('seed-random').addEventListener('click', () => {
    seedInput.value = Math.random().toString(36).slice(2, 10);
    generate();
  });
  cellSizeInput.addEventListener('input', () => {
    el('cell-size-label').textContent = cellSizeInput.value;
    if (lastResult) renderMap(canvas, lastResult, lastCatalog, Number(cellSizeInput.value));
  });
  el('tiles-example').addEventListener('click', () => {
    // 演示"同 layer+id 覆盖默认档案"：用已注册字符改写灵矿的名称/颜色/可走语义。
    // 全新地块需先在 shared 注册枚举与字符，否则生成时会以 procgen_unregistered_tile_chars 报错、并被拒绝导出。
    const example: ProcgenTileDef[] = [
      { id: 'spirit_ore', layer: 'structure', name: '极品灵矿', char: '灵', color: '#7fffd4', blocksMove: true },
      { id: 'grass', layer: 'terrain', name: '灵草地', char: '草', color: '#7fd76b', walkable: true },
    ];
    tilesJsonInput.value = JSON.stringify(example, null, 2);
    configError.textContent = '已插入示例：同 layer+id 覆盖默认地块档案（此处改写灵矿与草地的名称/颜色）。生成后可见图例更新。新增全新字符的地块须先在 shared 注册，否则会被生成器拒绝。';
  });
  el('drawer-toggle').addEventListener('click', () => {
    el('config-drawer').classList.toggle('collapsed');
  });
  canvas.addEventListener('mousemove', (event) => {
    if (!lastResult) return;
    const rect = canvas.getBoundingClientRect();
    const cellSize = Number(cellSizeInput.value);
    const x = Math.floor((event.clientX - rect.left) / cellSize);
    const y = Math.floor((event.clientY - rect.top) / cellSize);
    const text = describeCell(lastResult, lastCatalog, x, y);
    if (!text) { tooltip.style.display = 'none'; return; }
    tooltip.textContent = text;
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  });
  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  generate();
}

init();
