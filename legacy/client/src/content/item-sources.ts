/** ItemSourceKind：定义该类型的结构与数据语义。 */
export type ItemSourceKind = 'monster_drop' | 'mining' | 'search' | 'shop' | 'quest';
/** SPIRIT_STONE_ITEM_ID：定义该变量以承载业务值。 */
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';

/** ItemSourceBaseEntry：定义该接口的能力与字段约束。 */
interface ItemSourceBaseEntry {
/** kind：定义该变量以承载业务值。 */
  kind: ItemSourceKind;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapName：定义该变量以承载业务值。 */
  mapName: string;
}

/** MonsterItemSourceEntry：定义该接口的能力与字段约束。 */
export interface MonsterItemSourceEntry extends ItemSourceBaseEntry {
/** kind：定义该变量以承载业务值。 */
  kind: 'monster_drop';
/** monsterId：定义该变量以承载业务值。 */
  monsterId: string;
/** monsterName：定义该变量以承载业务值。 */
  monsterName: string;
  chance?: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** DirectItemNodeSourceEntry：定义该接口的能力与字段约束。 */
export interface DirectItemNodeSourceEntry extends ItemSourceBaseEntry {
/** kind：定义该变量以承载业务值。 */
  kind: 'mining' | 'search';
/** landmarkId：定义该变量以承载业务值。 */
  landmarkId: string;
/** landmarkName：定义该变量以承载业务值。 */
  landmarkName: string;
/** mode：定义该变量以承载业务值。 */
  mode: 'direct';
  chance?: number;
/** count：定义该变量以承载业务值。 */
  count: number;
}

/** PoolItemNodeSourceEntry：定义该接口的能力与字段约束。 */
export interface PoolItemNodeSourceEntry extends ItemSourceBaseEntry {
/** kind：定义该变量以承载业务值。 */
  kind: 'mining' | 'search';
/** landmarkId：定义该变量以承载业务值。 */
  landmarkId: string;
/** landmarkName：定义该变量以承载业务值。 */
  landmarkName: string;
/** mode：定义该变量以承载业务值。 */
  mode: 'pool';
/** poolIndex：定义该变量以承载业务值。 */
  poolIndex: number;
  poolChance?: number;
  countMin?: number;
  countMax?: number;
  minLevel?: number;
  maxLevel?: number;
  maxGrade?: string;
  tagGroups?: string[][];
}

/** QuestItemSourceEntry：定义该接口的能力与字段约束。 */
export interface QuestItemSourceEntry extends ItemSourceBaseEntry {
/** kind：定义该变量以承载业务值。 */
  kind: 'quest';
/** questId：定义该变量以承载业务值。 */
  questId: string;
/** questTitle：定义该变量以承载业务值。 */
  questTitle: string;
  line?: string;
  chapter?: string;
}

/** ShopItemSourceEntry：定义该接口的能力与字段约束。 */
export interface ShopItemSourceEntry extends ItemSourceBaseEntry {
/** kind：定义该变量以承载业务值。 */
  kind: 'shop';
/** npcId：定义该变量以承载业务值。 */
  npcId: string;
/** npcName：定义该变量以承载业务值。 */
  npcName: string;
}

/** ItemSourceEntry：定义该类型的结构与数据语义。 */
export type ItemSourceEntry =
  | MonsterItemSourceEntry
  | DirectItemNodeSourceEntry
  | PoolItemNodeSourceEntry
  | ShopItemSourceEntry
  | QuestItemSourceEntry;

/** ItemSourceCatalog：定义该类型的结构与数据语义。 */
type ItemSourceCatalog = Record<string, ItemSourceEntry[]>;
/** itemSourceCatalog：定义该变量以承载业务值。 */
let itemSourceCatalog: ItemSourceCatalog | null = null;
/** itemSourceCatalogPromise：定义该变量以承载业务值。 */
let itemSourceCatalogPromise: Promise<ItemSourceCatalog> | null = null;

/** loadItemSourceCatalog：执行对应的业务逻辑。 */
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

/** getLoadedItemSourceCatalog：执行对应的业务逻辑。 */
function getLoadedItemSourceCatalog(): ItemSourceCatalog | null {
  return itemSourceCatalog;
}

/** hasLoadedItemSourceCatalog：执行对应的业务逻辑。 */
export function hasLoadedItemSourceCatalog(): boolean {
  return getLoadedItemSourceCatalog() !== null;
}

/** preloadItemSourceCatalog：执行对应的业务逻辑。 */
export async function preloadItemSourceCatalog(): Promise<void> {
  await loadItemSourceCatalog();
}

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** getSourceLinkLabel：执行对应的业务逻辑。 */
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

/** formatSourceDetails：执行对应的业务逻辑。 */
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

/** getItemSourceEntries：执行对应的业务逻辑。 */
export function getItemSourceEntries(itemId: string): ItemSourceEntry[] {
/** catalog：定义该变量以承载业务值。 */
  const catalog = getLoadedItemSourceCatalog();
  if (!catalog) {
    void loadItemSourceCatalog();
    return [];
  }
  return catalog[itemId] ?? [];
}

/** getItemSourceEntryCount：执行对应的业务逻辑。 */
export function getItemSourceEntryCount(itemId: string): number {
  return getItemSourceEntries(itemId).length;
}

/** isSpecialSourceSummaryItem：执行对应的业务逻辑。 */
export function isSpecialSourceSummaryItem(itemId: string): boolean {
  return itemId === SPIRIT_STONE_ITEM_ID;
}

/** renderSpecialSourceSummaryHtml：执行对应的业务逻辑。 */
function renderSpecialSourceSummaryHtml(itemId: string): string | null {
  if (itemId !== SPIRIT_STONE_ITEM_ID) {
    return null;
  }
  return '<span class="inventory-source-note">挖矿或者全部怪物击杀都有概率获得</span>';
}

/** renderItemSourceListHtml：执行对应的业务逻辑。 */
export function renderItemSourceListHtml(
  itemId: string,
  options: {
    maxEntries?: number;
    compact?: boolean;
  } = {},
): string {
/** specialSummaryHtml：定义该变量以承载业务值。 */
  const specialSummaryHtml = renderSpecialSourceSummaryHtml(itemId);
  if (specialSummaryHtml) {
    return specialSummaryHtml;
  }
  if (!hasLoadedItemSourceCatalog()) {
    void loadItemSourceCatalog();
    return '<span class="inventory-source-note">静态来源加载中</span>';
  }
/** entries：定义该变量以承载业务值。 */
  const entries = getItemSourceEntries(itemId);
  if (entries.length === 0) {
    return '<span class="inventory-source-empty">暂无静态来源</span>';
  }
/** maxEntries：定义该变量以承载业务值。 */
  const maxEntries = options.maxEntries ? Math.max(1, options.maxEntries) : undefined;
/** visibleEntries：定义该变量以承载业务值。 */
  const visibleEntries = maxEntries ? entries.slice(0, maxEntries) : entries;
/** remaining：定义该变量以承载业务值。 */
  const remaining = entries.length - visibleEntries.length;
/** compactClass：定义该变量以承载业务值。 */
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

