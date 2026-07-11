/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 秘境随机地形生成器：区域邻接图（RAG）、拓扑角色回灌、门位预留。
 *
 * 次序是 几何 → 图 → 几何：先 BSP 切几何，自底向上抽出 RAG（图与几何恒定一致，
 * 没有「先画抽象图再嵌入」的对齐漂移），再把关卡角色回灌到 RAG 节点上。
 *
 * boss 取「从 entry 起 RAG 图距最远且放得下 boss 房」的叶，而不是「最深的 BSP 叶」——
 * BSP 深度只反映切分次数，与玩家实际要走的距离无关。
 *
 * 门位在任何区域生成之前就定死，作为强制通道传给各区生成器。这让「门 → 区内连通」
 * 成为构造不变量，全图连通性因而可对 BSP 树做归纳证明，不必依赖事后的全局 carve。
 */
import { ProcgenRng } from './procgen-random';
import { DEFAULT_REGION_MAX_ASPECT, sharedEdge, type ProcgenBspLeaf } from './procgen-partition';
import type {
  ProcgenLevelEdge,
  ProcgenLevelGraph,
  ProcgenNodeRole,
  ProcgenRegionKind,
  ProcgenRegionNode,
  ProcgenRegionPort,
  ProcgenTopologySpec,
} from './procgen-types';

/** 各生成器的最小 footprint。放不下就沿 dungeon → maze → open → corridor 确定性降级。 */
const FOOTPRINT: Record<'dungeon' | 'boss' | 'maze' | 'vault', number> = {
  dungeon: 30,
  boss: 26,
  maze: 16,
  vault: 12,
};

/**
 * 自由池各结构 kind 的最小 footprint 门槛：对齐 FOOTPRINT，town 单列为 16，open 恒可放。
 * assignKinds 保底与加权分配都以短边（min(w,h)）与此门槛比较，放不下则回退 open。
 */
const KIND_FOOTPRINT: Record<'open' | 'town' | 'maze' | 'dungeon', number> = {
  open: 0,
  town: 16,
  maze: FOOTPRINT.maze,
  dungeon: FOOTPRINT.dungeon,
};

/** 自由池默认配额：open 压倒性主导，结构类仅少量。仅在 preset 未给 kindMix 时兜底。
 * 每类结构≥1 由保底无条件保证（与此权重解耦），故此处结构权重低不会导致缺类；
 * 配合「保底挑小区、大区留 open」，令自然地貌与人造结构面积大致均衡（约各半）。 */
const DEFAULT_KIND_MIX: Partial<Record<ProcgenRegionKind, number>> = {
  open: 6,
  town: 1,
  maze: 1,
  dungeon: 1,
};

interface RagEdge {
  a: string;
  b: string;
  side: 'N' | 'E' | 'S' | 'W';
  from: number;
  to: number;
}

export interface ProcgenTopologyResult {
  regions: ProcgenRegionNode[];
  graph: ProcgenLevelGraph;
  warnings: string[];
}

/** 抽出 RAG。叶表已按 nodeId 排序，成对枚举的顺序因此稳定，不依赖任何 Map 遍历。 */
function buildRag(leaves: readonly ProcgenBspLeaf[]): RagEdge[] {
  const edges: RagEdge[] = [];
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const shared = sharedEdge(leaves[i].rect, leaves[j].rect);
      if (!shared) continue;
      // 门至少要离共享边两端各留 1 格，否则门会贴在区角上。
      if (shared.to - shared.from < 2) continue;
      edges.push({ a: leaves[i].nodeId, b: leaves[j].nodeId, side: shared.side, from: shared.from, to: shared.to });
    }
  }
  return edges;
}

function neighborsOf(edges: readonly RagEdge[], nodeId: string): string[] {
  const result: string[] = [];
  for (const edge of edges) {
    if (edge.a === nodeId) result.push(edge.b);
    else if (edge.b === nodeId) result.push(edge.a);
  }
  return result.sort();
}

/** 从 start 做无权 BFS，返回图距与前驱（前驱按 nodeId 排序取最小，保证唯一最短路）。 */
function bfs(edges: readonly RagEdge[], nodeIds: readonly string[], start: string): {
  depth: Map<string, number>;
  previous: Map<string, string>;
} {
  const depth = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const queue: string[] = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const next of neighborsOf(edges, current)) {
      if (depth.has(next)) continue;
      depth.set(next, (depth.get(current) ?? 0) + 1);
      previous.set(next, current);
      queue.push(next);
    }
  }
  void nodeIds;
  return { depth, previous };
}

/**
 * 按 footprint 与形状决定区域生成器种类。细条一律降为走廊。
 *
 * 分区的整形阶段已把长宽比压到 DEFAULT_REGION_MAX_ASPECT 以内，走廊只在撞到 maxRegions
 * 上限、细条无法再切时兜底出现。阈值与分区共用同一常量，避免两处独立漂移。
 */
function resolveKind(leaf: ProcgenBspLeaf, role: ProcgenNodeRole): ProcgenRegionKind {
  const { w, h } = leaf.rect;
  const short = Math.min(w, h);
  const aspect = Math.max(w, h) / Math.max(1, short);
  if (aspect > DEFAULT_REGION_MAX_ASPECT) return 'corridor';
  if (role === 'boss') return short >= FOOTPRINT.boss ? 'boss' : short >= FOOTPRINT.maze ? 'maze' : 'open';
  if (role === 'vault') return short >= FOOTPRINT.vault ? 'vault' : 'open';
  if (role === 'entry') return 'open';
  if (role === 'combat') {
    if (short >= FOOTPRINT.dungeon) return 'dungeon';
    if (short >= FOOTPRINT.maze) return 'maze';
    return 'open';
  }
  return short >= FOOTPRINT.maze ? 'maze' : 'open';
}

/**
 * 按配额确定性地为每个区决定 kind。只决定「区是什么地貌」，绝不触碰 role/门位/边集，
 * 因此对连通性构造完全透明（reservePort/connectRegions 只看 ports 不看 kind）。
 *
 * 固定项：细条→corridor；entry→open；boss/vault 按 footprint 就位或降级。
 * 自由池（combat/branch 的非细条区）先保底、再按 kindMix 加权铺满：
 *  ① 对 [dungeon,maze,town] 中权重>0 的类，各挑一个放得下的最大区，尽量保证每类≥1。
 *  ② 其余自由区按 kindMix 权重加权取 kind，结构类放不下则回退 open。
 * 全程确定性：freePool 沿 leaves 的 nodeId 序枚举，平局用 nodeId 破，rng 顺序固定。
 */
function assignKinds(
  leaves: readonly ProcgenBspLeaf[],
  roles: ReadonlyMap<string, ProcgenNodeRole>,
  depthMap: ReadonlyMap<string, number>,
  opts: { maxAspect: number; kindMix?: Partial<Record<ProcgenRegionKind, number>> },
  seed: string,
): Map<string, ProcgenRegionKind> {
  // 深度暂不参与 kind 决策；保留入参以对齐 buildTopology 调用口径并预留扩展（同 bfs 的 nodeIds）。
  void depthMap;
  const rng = new ProcgenRng(seed);
  const kinds = new Map<string, ProcgenRegionKind>();
  const kindMix = opts.kindMix ?? DEFAULT_KIND_MIX;
  const shortOf = (leaf: ProcgenBspLeaf): number => Math.min(leaf.rect.w, leaf.rect.h);

  // 第一遍：固定角色与细条走廊直接定 kind；combat/branch 等非细条区进自由池。
  const freePool: ProcgenBspLeaf[] = [];
  for (const leaf of leaves) {
    const { w, h } = leaf.rect;
    const short = Math.min(w, h);
    const aspect = Math.max(w, h) / Math.max(1, short);
    const role = roles.get(leaf.nodeId) ?? 'branch';
    if (aspect > opts.maxAspect) kinds.set(leaf.nodeId, 'corridor');
    else if (role === 'entry') kinds.set(leaf.nodeId, 'open');
    else if (role === 'boss') kinds.set(leaf.nodeId, short >= FOOTPRINT.boss ? 'boss' : short >= FOOTPRINT.maze ? 'maze' : 'open');
    else if (role === 'vault') kinds.set(leaf.nodeId, short >= FOOTPRINT.vault ? 'vault' : 'open');
    else freePool.push(leaf);
  }

  // 自由池候选 kind：kindMix 中权重>0 且属于 {open,town,maze,dungeon} 的类（固定枚举序，保证确定性）。
  const structural: readonly ('open' | 'town' | 'maze' | 'dungeon')[] = ['open', 'town', 'maze', 'dungeon'];
  const eligible = structural.filter((kind) => (kindMix[kind] ?? 0) > 0);
  const assigned = new Set<string>();

  // ① 保底：dungeon→maze→town 各挑一个「刚好放得下的较小区」（平局取 nodeId 小者），
  // 无条件保证每类结构≥1（全套地貌需求，与 kindMix 权重解耦）。挑小区而非大区——把大区
  // 留给 open 自然地貌；再配合自由池 open 权重压倒性，令自然:结构面积大致均衡。
  for (const kind of ['dungeon', 'maze', 'town'] as const) {
    const threshold = KIND_FOOTPRINT[kind];
    let best: ProcgenBspLeaf | undefined;
    for (const leaf of freePool) {
      if (assigned.has(leaf.nodeId) || shortOf(leaf) < threshold) continue;
      if (best === undefined || shortOf(leaf) < shortOf(best)
        || (shortOf(leaf) === shortOf(best) && leaf.nodeId < best.nodeId)) best = leaf;
    }
    if (best !== undefined) {
      kinds.set(best.nodeId, kind);
      assigned.add(best.nodeId);
    }
  }

  // ② 其余自由区：按 kindMix 权重加权取 kind；结构类放不下（短边<门槛）则回退 open。eligible 为空则全 open。
  const totalWeight = eligible.reduce((sum, kind) => sum + (kindMix[kind] ?? 0), 0);
  for (const leaf of freePool) {
    if (assigned.has(leaf.nodeId)) continue;
    let picked: 'open' | 'town' | 'maze' | 'dungeon' = 'open';
    if (eligible.length > 0 && totalWeight > 0) {
      let roll = rng.next() * totalWeight;
      let chosen: 'open' | 'town' | 'maze' | 'dungeon' = 'open';
      for (const kind of eligible) {
        chosen = kind;
        roll -= kindMix[kind] ?? 0;
        if (roll < 0) break;
      }
      picked = shortOf(leaf) >= KIND_FOOTPRINT[chosen] ? chosen : 'open';
    }
    kinds.set(leaf.nodeId, picked);
    assigned.add(leaf.nodeId);
  }

  return kinds;
}

/**
 * 为一条 RAG 边预留门位：取共享边的中点。
 *
 * 不再按迷宫 pitch 对齐。地形迷宫把门位直接接进通道骨架（见 procgen-maze.ts），
 * 门位落在哪都能长出一条峡谷通道过去；旧的奇数对齐是砖墙迷宫「少凿一格墙」的补丁。
 */
function reservePort(edge: RagEdge, rectA: ProcgenRegionNode, rectB: ProcgenRegionNode): [ProcgenRegionPort, ProcgenRegionPort] {
  const along = Math.min(Math.max(edge.from + 1, Math.floor((edge.from + edge.to) / 2)), edge.to - 1);

  if (edge.side === 'E') {
    return [
      { side: 'E', x: rectA.rect.x + rectA.rect.w - 1, y: along, toNodeId: rectB.nodeId },
      { side: 'W', x: rectB.rect.x, y: along, toNodeId: rectA.nodeId },
    ];
  }
  if (edge.side === 'W') {
    return [
      { side: 'W', x: rectA.rect.x, y: along, toNodeId: rectB.nodeId },
      { side: 'E', x: rectB.rect.x + rectB.rect.w - 1, y: along, toNodeId: rectA.nodeId },
    ];
  }
  if (edge.side === 'S') {
    return [
      { side: 'S', x: along, y: rectA.rect.y + rectA.rect.h - 1, toNodeId: rectB.nodeId },
      { side: 'N', x: along, y: rectB.rect.y, toNodeId: rectA.nodeId },
    ];
  }
  return [
    { side: 'N', x: along, y: rectA.rect.y, toNodeId: rectB.nodeId },
    { side: 'S', x: along, y: rectB.rect.y + rectB.rect.h - 1, toNodeId: rectA.nodeId },
  ];
}

export function buildTopology(
  leaves: readonly ProcgenBspLeaf[],
  width: number,
  height: number,
  spec: ProcgenTopologySpec,
  seed: string,
): ProcgenTopologyResult {
  const warnings: string[] = [];
  const rng = new ProcgenRng(seed);
  const rag = buildRag(leaves);
  const nodeIds = leaves.map((leaf) => leaf.nodeId);
  const byId = new Map(leaves.map((leaf) => [leaf.nodeId, leaf]));

  // entry：最靠近地图边缘的叶（外圈开放地貌）。平局用 nodeId 破。
  const edgeDistance = (leaf: ProcgenBspLeaf): number => Math.min(
    leaf.rect.x, leaf.rect.y, width - (leaf.rect.x + leaf.rect.w), height - (leaf.rect.y + leaf.rect.h),
  );
  const entry = leaves.slice().sort((a, b) => edgeDistance(a) - edgeDistance(b) || (a.nodeId < b.nodeId ? -1 : 1))[0];

  const { depth, previous } = bfs(rag, nodeIds, entry.nodeId);
  // boss：图距最远、且短边放得下 boss 房的叶。都放不下就取图距最远的最大叶（会降级成 maze/open）。
  const reachable = leaves.filter((leaf) => depth.has(leaf.nodeId) && leaf.nodeId !== entry.nodeId);
  if (reachable.length < leaves.length - 1) warnings.push('procgen_rag_disconnected');
  const rank = (leaf: ProcgenBspLeaf): number => (depth.get(leaf.nodeId) ?? 0) * 1000 + Math.min(leaf.rect.w, leaf.rect.h);
  const bossCandidates = reachable.filter((leaf) => Math.min(leaf.rect.w, leaf.rect.h) >= FOOTPRINT.boss);
  const bossPool = bossCandidates.length > 0 ? bossCandidates : reachable;
  const boss = bossPool.length > 0
    ? bossPool.slice().sort((a, b) => rank(b) - rank(a) || (a.nodeId < b.nodeId ? -1 : 1))[0]
    : entry;
  if (bossCandidates.length === 0 && reachable.length > 0) warnings.push('procgen_boss_footprint_undersized');

  // 临界路：entry → boss 的唯一最短路。
  const criticalPath: string[] = [];
  for (let cursor: string | undefined = boss.nodeId; cursor !== undefined; cursor = previous.get(cursor)) {
    criticalPath.unshift(cursor);
    if (cursor === entry.nodeId) break;
  }
  const criticalSet = new Set(criticalPath);

  // 边集 = BFS 生成树（保证连通）+ 少量非临界环 link（降低迷宫折返感）。
  // 生成树必须先于角色回灌算出：死端要看「玩家实际能走的边」的度，不是几何邻接度。
  const treeEdges = rag.filter((edge) => previous.get(edge.b) === edge.a || previous.get(edge.a) === edge.b);
  const treeDegree = new Map<string, number>();
  for (const edge of treeEdges) {
    treeDegree.set(edge.a, (treeDegree.get(edge.a) ?? 0) + 1);
    treeDegree.set(edge.b, (treeDegree.get(edge.b) ?? 0) + 1);
  }

  // vault：挂在临界路外的真·死端旁支（生成树上度为 1）。找不到就降级 warn，
  // 绝不把 boss 前一个节点提升为 vault —— 那会把「可选」变成「必经」。
  //
  // 度必须取自生成树。BSP 矩形分割里几乎每个叶都有 ≥2 个几何邻居，按 RAG 度筛死端
  // 永远筛不出东西（实测 8/8 落空），宝库、锁、钥匙于是全线消失。
  const roles = new Map<string, ProcgenNodeRole>();
  roles.set(entry.nodeId, 'entry');
  roles.set(boss.nodeId, 'boss');
  const branchLimit = rng.intInRange(spec.branchCount ?? [1, 2]);
  const deadEnds = leaves.filter((leaf) => !criticalSet.has(leaf.nodeId)
    && depth.has(leaf.nodeId)
    && (treeDegree.get(leaf.nodeId) ?? 0) === 1);
  // 深处、放得下宝库的死端优先。
  const vaults = deadEnds
    .slice()
    .sort((a, b) => {
      const fitA = Math.min(a.rect.w, a.rect.h) >= FOOTPRINT.vault ? 1 : 0;
      const fitB = Math.min(b.rect.w, b.rect.h) >= FOOTPRINT.vault ? 1 : 0;
      if (fitA !== fitB) return fitB - fitA;
      return (depth.get(b.nodeId) ?? 0) - (depth.get(a.nodeId) ?? 0) || (a.nodeId < b.nodeId ? -1 : 1);
    })
    .slice(0, Math.max(0, branchLimit));
  for (const vault of vaults) roles.set(vault.nodeId, 'vault');
  if (vaults.length === 0) warnings.push('procgen_vault_no_dead_end');

  for (const nodeId of criticalPath) {
    if (!roles.has(nodeId)) roles.set(nodeId, 'combat');
  }
  for (const leaf of leaves) {
    if (!roles.has(leaf.nodeId)) roles.set(leaf.nodeId, 'branch');
  }

  // kind 按配额确定性分配（保证 maze/dungeon/town 等结构类尽量各出现）；放不下或 kindMix 未覆盖时用 resolveKind 兜底。
  // 只决定「区是什么地貌」，不动 role/门位/边集——上面已算完的连通性构造不受影响。
  const kinds = assignKinds(leaves, roles, depth, { maxAspect: DEFAULT_REGION_MAX_ASPECT, kindMix: spec.kindMix }, `${seed}:kinds`);
  const regions: ProcgenRegionNode[] = leaves.map((leaf) => {
    const role = roles.get(leaf.nodeId) ?? 'branch';
    return {
      nodeId: leaf.nodeId,
      rect: leaf.rect,
      kind: kinds.get(leaf.nodeId) ?? resolveKind(leaf, role),
      role,
      depth: depth.get(leaf.nodeId) ?? -1,
      ports: [],
    };
  });
  const regionById = new Map(regions.map((region) => [region.nodeId, region]));

  // 环 link 绕开 vault，vault 因而在最终边集上仍是度 1 的死端，锁门是它唯一的入口。
  const extraRng = new ProcgenRng(`${seed}:cross`);
  const crossEdges = rag.filter((edge) => !treeEdges.includes(edge)
    && !(criticalSet.has(edge.a) && criticalSet.has(edge.b))
    && roles.get(edge.a) !== 'vault' && roles.get(edge.b) !== 'vault'
    && extraRng.chance(0.25));

  // 每个上锁宝库拿一把**独立**的锁。lockCount 是「上锁几个」，不是「锁不锁」的开关：
  // 一个 id 复用到多扇门上，会让 placeKeyAnchors 为同一个 group 反复放钥匙。
  // 超出 lockCount 的宝库保持敞开——仍是宝库房间，只是不设锁。
  const lockLimit = Math.max(0, rng.intInRange(spec.lockCount ?? [0, 1]));
  const lockIdByVault = new Map<string, number>();
  for (const vault of vaults) {
    if (lockIdByVault.size >= lockLimit) break;
    lockIdByVault.set(vault.nodeId, lockIdByVault.size + 1);
  }

  const edges: ProcgenLevelEdge[] = [];
  let edgeId = 0;
  for (const edge of [...treeEdges, ...crossEdges]) {
    const regionA = regionById.get(edge.a);
    const regionB = regionById.get(edge.b);
    if (!regionA || !regionB) continue;
    const critical = criticalSet.has(edge.a) && criticalSet.has(edge.b) && treeEdges.includes(edge);
    // 宝库在最终边集上度为 1，所以「通往宝库的边」唯一，锁必然落在它的唯一入口上。
    const lockId = lockIdByVault.get(edge.a) ?? lockIdByVault.get(edge.b);
    const [portA, portB] = reservePort(edge, regionA, regionB);
    if (lockId !== undefined) {
      portA.lockId = lockId;
      portB.lockId = lockId;
    }
    regionA.ports.push(portA);
    regionB.ports.push(portB);
    edges.push({ id: edgeId++, from: edge.a, to: edge.b, kind: 'corridor', lockId, critical });
  }

  return { regions, graph: { nodes: regions, edges, criticalPath }, warnings };
}
