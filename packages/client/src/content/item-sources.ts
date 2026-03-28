import sourceCatalog from '../constants/world/item-sources.generated.json';

export type ItemSourceKind = 'monster_drop' | 'mining' | 'search' | 'shop' | 'quest';
const SPIRIT_STONE_ITEM_ID = 'spirit_stone';

interface ItemSourceBaseEntry {
  kind: ItemSourceKind;
  mapId: string;
  mapName: string;
}

export interface MonsterItemSourceEntry extends ItemSourceBaseEntry {
  kind: 'monster_drop';
  monsterId: string;
  monsterName: string;
  chance?: number;
  count: number;
}

export interface DirectItemNodeSourceEntry extends ItemSourceBaseEntry {
  kind: 'mining' | 'search';
  landmarkId: string;
  landmarkName: string;
  mode: 'direct';
  chance?: number;
  count: number;
}

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

export interface QuestItemSourceEntry extends ItemSourceBaseEntry {
  kind: 'quest';
  questId: string;
  questTitle: string;
  line?: string;
  chapter?: string;
}

export interface ShopItemSourceEntry extends ItemSourceBaseEntry {
  kind: 'shop';
  npcId: string;
  npcName: string;
}

export type ItemSourceEntry =
  | MonsterItemSourceEntry
  | DirectItemNodeSourceEntry
  | PoolItemNodeSourceEntry
  | ShopItemSourceEntry
  | QuestItemSourceEntry;

type ItemSourceCatalog = Record<string, ItemSourceEntry[]>;

const ITEM_SOURCE_CATALOG = sourceCatalog as ItemSourceCatalog;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

export function getItemSourceEntries(itemId: string): ItemSourceEntry[] {
  return ITEM_SOURCE_CATALOG[itemId] ?? [];
}

export function getItemSourceEntryCount(itemId: string): number {
  return getItemSourceEntries(itemId).length;
}

export function isSpecialSourceSummaryItem(itemId: string): boolean {
  return itemId === SPIRIT_STONE_ITEM_ID;
}

function renderSpecialSourceSummaryHtml(itemId: string): string | null {
  if (itemId !== SPIRIT_STONE_ITEM_ID) {
    return null;
  }
  return '<span class="inventory-source-note">挖矿或者全部怪物击杀都有概率获得</span>';
}

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
