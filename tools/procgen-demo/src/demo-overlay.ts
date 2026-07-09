/**
 * 秘境生成器 demo：分区 / 拓扑 / 内容锚点的调试 overlay。
 *
 * 这些图层只服务于「看懂生成器为什么这么切图」，不参与地图导出，也不影响任何生成结果。
 * 旧的全图噪声管线不产出 regions / levelGraph，两个绘制函数因此都在缺字段时静默跳过。
 */
import type {
  ProcgenAnchorKind,
  ProcgenContentAnchor,
  ProcgenMapResult,
  ProcgenNodeRole,
  ProcgenRegionKind,
  ProcgenRegionNode,
} from '../../../packages/shared/src/procgen/procgen-types';

interface AnchorStyle {
  color: string;
  shape: 'square' | 'triangle' | 'diamond' | 'circle' | 'cross';
  label: string;
}

/** 七种锚点各有独立图形：只靠颜色区分在 6px 格子下是认不出来的。 */
const ANCHOR_STYLES: Record<ProcgenAnchorKind, AnchorStyle> = {
  chest: { color: '#f2a740', shape: 'square', label: '宝箱' },
  monster: { color: '#e0574f', shape: 'triangle', label: '怪物据点' },
  boss: { color: '#b91c1c', shape: 'diamond', label: 'BOSS' },
  herb: { color: '#4ade80', shape: 'circle', label: '草药' },
  scripture: { color: '#38bdf8', shape: 'diamond', label: '藏经台' },
  lock: { color: '#dc2626', shape: 'cross', label: '锁门' },
  key: { color: '#facc15', shape: 'circle', label: '钥匙' },
};

// transition / exit / hub 已在类型里预留，当前拓扑生成器还不会产出。
// 这里仍然给全，Record 的穷尽性因此能在编译期挡住「新增枚举值忘了配色」。
const REGION_KIND_COLORS: Record<ProcgenRegionKind, string> = {
  open: '#22c55e',
  maze: '#8b5cf6',
  dungeon: '#0ea5e9',
  vault: '#f59e0b',
  boss: '#ef4444',
  corridor: '#94a3b8',
  transition: '#14b8a6',
};

const ROLE_LABELS: Record<ProcgenNodeRole, string> = {
  entry: '入口',
  combat: '战斗',
  branch: '旁支',
  vault: '宝库',
  boss: 'BOSS',
  exit: '出口',
  hub: '枢纽',
};

const KIND_LABELS: Record<ProcgenRegionKind, string> = {
  open: '开放',
  maze: '迷宫',
  dungeon: '地牢',
  vault: '宝库',
  boss: 'BOSS房',
  corridor: '走廊',
  transition: '过渡',
};

function centerOf(region: ProcgenRegionNode, cellSize: number): [number, number] {
  return [
    (region.rect.x + region.rect.w / 2) * cellSize,
    (region.rect.y + region.rect.h / 2) * cellSize,
  ];
}

/** 区域底色 + 边框 + 角色标签。填充用低 alpha，压在地形之上但仍看得见地块。 */
export function drawRegions(ctx: CanvasRenderingContext2D, result: ProcgenMapResult, cellSize: number): void {
  const regions = result.regions;
  if (!regions || regions.length === 0) return;

  for (const region of regions) {
    const x = region.rect.x * cellSize;
    const y = region.rect.y * cellSize;
    const w = region.rect.w * cellSize;
    const h = region.rect.h * cellSize;
    const color = REGION_KIND_COLORS[region.kind];

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;

    // 临界路上的区加粗描边，一眼看出 entry → boss 的主线。
    const critical = result.levelGraph?.criticalPath.includes(region.nodeId) ?? false;
    ctx.strokeStyle = color;
    ctx.lineWidth = critical ? 3 : 1.5;
    ctx.setLineDash(critical ? [] : [4, 3]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);

    if (cellSize >= 4 && w > 46 && h > 26) {
      const text = `${ROLE_LABELS[region.role]}·${KIND_LABELS[region.kind]}`;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const metrics = ctx.measureText(text);
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(x + 3, y + 3, metrics.width + 8, 15);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 7, y + 5);
    }
  }
}

/** 拓扑边：临界路金色实线、锁门红色粗线、冗余环 link 灰色虚线。 */
export function drawTopology(ctx: CanvasRenderingContext2D, result: ProcgenMapResult, cellSize: number): void {
  const graph = result.levelGraph;
  if (!graph) return;
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));

  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const [x1, y1] = centerOf(from, cellSize);
    const [x2, y2] = centerOf(to, cellSize);

    if (edge.lockId !== undefined) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([]);
    } else if (edge.critical) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(148,163,184,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 节点圆点画在边之上，避免被线压住。
  for (const node of graph.nodes) {
    const [cx, cy] = centerOf(node, cellSize);
    ctx.fillStyle = REGION_KIND_COLORS[node.kind];
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** 内容锚点。形状与 ANCHOR_STYLES 一一对应，颜色只作辅助。 */
export function drawAnchors(ctx: CanvasRenderingContext2D, result: ProcgenMapResult, cellSize: number): void {
  for (const anchor of result.contentAnchors) {
    const cx = (anchor.x + 0.5) * cellSize;
    const cy = (anchor.y + 0.5) * cellSize;
    const size = Math.max(3, cellSize * 0.55);
    const half = size / 2;
    const style = ANCHOR_STYLES[anchor.kind];
    ctx.fillStyle = style.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;

    switch (style.shape) {
      case 'square':
        ctx.fillRect(cx - half, cy - half, size, size);
        ctx.strokeRect(cx - half, cy - half, size, size);
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(cx, cy - half);
        ctx.lineTo(cx + half, cy + half);
        ctx.lineTo(cx - half, cy + half);
        ctx.closePath();
        ctx.fill();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(cx, cy - half);
        ctx.lineTo(cx + half, cy);
        ctx.lineTo(cx, cy + half);
        ctx.lineTo(cx - half, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(cx, cy, half, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'cross':
        ctx.lineWidth = Math.max(1.5, size * 0.28);
        ctx.strokeStyle = style.color;
        ctx.beginPath();
        ctx.moveTo(cx - half, cy - half);
        ctx.lineTo(cx + half, cy + half);
        ctx.moveTo(cx + half, cy - half);
        ctx.lineTo(cx - half, cy + half);
        ctx.stroke();
        break;
    }
  }
}

/** 锚点的检视文本；锁与钥匙带上配对组号，方便肉眼核对可解性。 */
export function describeAnchor(anchor: ProcgenContentAnchor): string {
  const style = ANCHOR_STYLES[anchor.kind];
  const group = anchor.gateGroupId ?? anchor.keyGroupId;
  return `★ ${style.label}锚点${group === undefined ? '' : `（组 ${group}）`}`;
}

/** 该格所属的分区节点；旧管线没有分区，返回 undefined。 */
export function regionAt(result: ProcgenMapResult, x: number, y: number): ProcgenRegionNode | undefined {
  return result.regions?.find((region) => x >= region.rect.x && y >= region.rect.y
    && x < region.rect.x + region.rect.w && y < region.rect.y + region.rect.h);
}

export function describeRegion(region: ProcgenRegionNode): string {
  return `分区 ${region.nodeId}：${ROLE_LABELS[region.role]}·${KIND_LABELS[region.kind]}（图距 ${region.depth}）`;
}

export const ANCHOR_LEGEND = '■橙=宝箱 ▲红=怪物 ◆深红=BOSS ●绿=草药 ◆蓝=藏经台 ✕红=锁门 ●黄=钥匙';
export const OVERLAY_LEGEND = '分区底色按区型；粗边框=临界路；金线=主线边，红线=锁门边，灰虚线=冗余环';
export { KIND_LABELS as REGION_KIND_LABELS };
