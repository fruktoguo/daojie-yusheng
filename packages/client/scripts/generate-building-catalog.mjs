/**
 * 本文件负责客户端侧的配置、视图、网络或运行态辅助逻辑，服务于正式前端主线的展示与意图收集。
 *
 * 维护时要保持前端只处理表现和派生状态，避免复制服务端权威真源或让多套 UI 状态互相分叉。
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '..', '..');
const sourcePath = path.join(repoRoot, 'packages/server/data/content/building-runtime/buildings.json');
const targetDir = path.join(process.cwd(), 'src/constants/world');
const targetPath = path.join(targetDir, 'building-catalog.generated.json');

const buildings = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const catalog = buildings.map((building) => ({
  id: building.id,
  name: building.name,
  layer: building.placement?.layer ?? 'decoration',
  visualTileType: building.visual?.tileType,
  visualGlyph: building.visual?.glyph,
  visualColor: building.visual?.color,
  allowRotate: building.placement?.allowRotate !== false,
  footprint: (building.placement?.footprint ?? []).map((cell) => ({ dx: Math.trunc(Number(cell.dx) || 0), dy: Math.trunc(Number(cell.dy) || 0) })),
  cost: (building.economy?.cost ?? []).map((entry) => ({ itemId: entry.itemId, count: Math.max(1, Math.trunc(Number(entry.count) || 1)) })),
  traits: Array.isArray(building.fengShui?.traits) ? building.fengShui.traits.slice() : [],
  elementVector: building.fengShui?.elementVector ?? {},
  durabilityMultiplier: Number.isFinite(Number(building.economy?.durabilityMultiplier))
    ? Number(building.economy.durabilityMultiplier)
    : undefined,
  buildTicks: Math.max(1, Math.trunc(Number(building.economy?.buildTicks) || 1)),
  maxHp: Math.max(1, Math.trunc(Number(building.economy?.maxHp) || 1)),
  stability: Math.trunc(Number(building.fengShui?.stability) || 0),
  comfort: Math.trunc(Number(building.fengShui?.comfort) || 0),
  opening: building.topology?.opening ?? 'none',
  blocksMove: building.topology?.blocksMove === true,
  blocksSight: building.topology?.blocksSight === true,
}));

fs.mkdirSync(targetDir, { recursive: true });
const next = `${JSON.stringify(catalog, null, 2)}\n`;
if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== next) {
  fs.writeFileSync(targetPath, next);
  console.log(`已生成 ${path.relative(repoRoot, targetPath)}`);
} else {
  console.log('building-catalog.generated.json 无变更');
}
