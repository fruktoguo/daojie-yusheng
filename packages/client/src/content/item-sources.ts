/** 物品来源的分类类型。 */
export type ItemSourceKind = 'monster_drop' | 'mining' | 'search' | 'shop' | 'quest';
/** 灵石对应的物品 ID。 */
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/** 物品来源条目的通用字段。 */
interface ItemSourceBaseEntry {
  kind: ItemSourceKind;
  mapId: string;
  mapName: string;
}

/** 击杀掉落类来源条目。 */
export interface MonsterItemSourceEntry extends ItemSourceBaseEntry {
  kind: 'monster_drop';
  monsterId: string;
  monsterName: string;
  chance?: number;
  count: number;
}

/** 采矿或搜索的直接掉落条目。 */
export interface DirectItemNodeSourceEntry extends ItemSourceBaseEntry {
  kind: 'mining' | 'search';
  landmarkId: string;
  landmarkName: string;
  mode: 'direct';
  chance?: number;
  count: number;
}

/** 采矿或搜索的池子掉落条目。 */
export interface PoolItemNodeSourceEntry extends ItemSourceBaseEntry {
  kind: 'mining' | 'search';
  landmarkId: string;
  landmarkName: string;
  mode: 'pool';
  poolIndex: number;
  poolChance?: number;
  countMin?: number;
  countMax?: number;
  minLevel?: number;
  maxLevel?: number;
  maxGrade?: string;
  tagGroups?: string[][];
}

/** 任务奖励来源条目。 */
export interface QuestItemSourceEntry extends ItemSourceBaseEntry {
  kind: 'quest';
  questId: string;
  questTitle: string;
  line?: string;
  chapter?: string;
}

/** 商店购买来源条目。 */
export interface ShopItemSourceEntry extends ItemSourceBaseEntry {
  kind: 'shop';
  npcId: string;
  npcName: string;
}

/** 任意一种静态物品来源条目。 */
export type ItemSourceEntry =
  | MonsterItemSourceEntry
  | DirectItemNodeSourceEntry
  | PoolItemNodeSourceEntry
  | ShopItemSourceEntry
  | QuestItemSourceEntry;

/** 物品来源目录的内存结构。 */
type ItemSourceCatalog = Record<string, ItemSourceEntry[]>;
/** 已加载到内存的物品来源目录。 */
let itemSourceCatalog: ItemSourceCatalog | null = null;
/** 正在进行中的物品来源目录加载任务。 */
let itemSourceCatalogPromise: Promise<ItemSourceCatalog> | null = null;

/** 按需加载物品来源目录。该 generated JSON 仍是运行时 tooltip/背包来源说明链路的一部分。 */
function loadItemSourceCatalog(): Promise<ItemSourceCatalog> {
  if (itemSourceCatalog) {
    return Promise.resolve(itemSourceCatalog);
  }
  if (!itemSourceCatalogPromise) {
    itemSourceCatalogPromise = import('../constants/world/item-sources.generated.json')
      .then((module) => {
        itemSourceCatalog = module.default as ItemSourceCatalog;
        return itemSourceCatalog;
      });
  }
  return itemSourceCatalogPromise;
}

/** 读取已经加载完成的物品来源目录。 */
function getLoadedItemSourceCatalog(): ItemSourceCatalog | null {
  return itemSourceCatalog;
}

/** 判断物品来源目录是否已经加载。 */
export function hasLoadedItemSourceCatalog(): boolean {
  return getLoadedItemSourceCatalog() !== null;
}

/** 提前预热物品来源目录加载。 */
export async function preloadItemSourceCatalog(): Promise<void> {
  await loadItemSourceCatalog();
}

/** 转义用于拼接 HTML 的危险字符。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 读取来源标签文案。 */
function getSourceLinkLabel(kind: ItemSourceKind): string {
  switch (kind) {
    case 'monster_drop':
      return '击杀';
    case 'mining':
      return '挖矿';
    case 'search':
      return '搜索';
    case 'shop':
      return '购买';
    case 'quest':
      return '任务';
  }
}

/** 把来源条目拆成若干个展示标签。 */
function formatSourceDetails(entry: ItemSourceEntry): Array<{ tone: string; text: string }> {
  if (entry.kind === 'monster_drop') {
    return [
      { tone: 'map', text: entry.mapName },
      { tone: 'monster', text: entry.monsterName },
    ];
  }

  if (entry.kind === 'quest') {
    return [
      { tone: 'map', text: entry.mapName },
      { tone: 'quest', text: entry.questTitle },
    ];
  }

  if (entry.kind === 'shop') {
    return [
      { tone: 'map', text: entry.mapName },
      { tone: 'shop', text: entry.npcName },
    ];
  }

  return [
    { tone: 'map', text: entry.mapName },
    { tone: entry.kind === 'mining' ? 'mining' : 'location', text: entry.landmarkName },
  ];
}

/** 读取某个物品的静态来源条目。 */
export function getItemSourceEntries(itemId: string): ItemSourceEntry[] {
  const catalog = getLoadedItemSourceCatalog();
  if (!catalog) {
    void loadItemSourceCatalog();
    return [];
  }
  return catalog[itemId] ?? [];
}

/** 统计某个物品可展示的来源条目数。 */
export function getItemSourceEntryCount(itemId: string): number {
  return getItemSourceEntries(itemId).length;
}

/** 判断是否需要使用特殊摘要文案。 */
export function isSpecialSourceSummaryItem(itemId: string): boolean {
  return itemId === SPIRIT_STONE_ITEM_ID;
}

/** 为特殊物品生成简短来源摘要。 */
function renderSpecialSourceSummaryHtml(itemId: string): string | null {
  if (itemId !== SPIRIT_STONE_ITEM_ID) {
    return null;
  }
  return '<span class="inventory-source-note">挖矿或者全部怪物击杀都有概率获得</span>';
}

/** 把物品来源目录渲染成可直接插入的 HTML。 */
export function renderItemSourceListHtml(
  itemId: string,
  options: {
    maxEntries?: number;
    compact?: boolean;
  } = {},
): string {
  const specialSummaryHtml = renderSpecialSourceSummaryHtml(itemId);
  if (specialSummaryHtml) {
    return specialSummaryHtml;
  }
  if (!hasLoadedItemSourceCatalog()) {
    void loadItemSourceCatalog();
    return '<span class="inventory-source-note">静态来源加载中</span>';
  }
  const entries = getItemSourceEntries(itemId);
  if (entries.length === 0) {
    return '<span class="inventory-source-empty">暂无静态来源</span>';
  }
  const maxEntries = options.maxEntries ? Math.max(1, options.maxEntries) : undefined;
  const visibleEntries = maxEntries ? entries.slice(0, maxEntries) : entries;
  const remaining = entries.length - visibleEntries.length;
  const compactClass = options.compact ? ' inventory-source-list--compact' : '';
  return `<div class="inventory-source-list${compactClass}">${
    visibleEntries.map((entry) => `
      <div class="inventory-source-row">
        <span class="inventory-source-detail">${
          formatSourceDetails(entry)
            .map((part) => `<span class="inventory-source-chip inventory-source-chip--${escapeHtml(part.tone)}">${escapeHtml(part.text)}</span>`)
            .join(`<span class="inventory-source-link-wrap"><span class="inventory-source-link-label">${escapeHtml(getSourceLinkLabel(entry.kind))}</span><span class="inventory-source-link" aria-hidden="true"></span></span>`)
        }</span>
      </div>
    `).join('')
  }${
    remaining > 0
      ? `<div class="inventory-source-row"><span class="inventory-source-detail">另有 ${escapeHtml(String(remaining))} 条来源</span></div>`
      : ''
  }</div>`;
}
