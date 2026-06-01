/**
 * 本文件属于正式客户端主线，负责前端启动、状态拼装、工具函数或表现层逻辑。
 *
 * 维护时要把用户意图、显示派生和服务端权威数据分清，避免为了展示便利复制业务规则。
 */
import {
  formatBuffMaxStacks,
  GroundItemPileView,
  getTileTraversalCost,
  MonsterTier,
  S2C_TileDetail,
  RenderEntity,
  Tile,
  TileType,
  VisibleBuffState,
  isGroundInteractableObjectKind,
  isMobileEntityObjectKind,
  resolveWorldObjectRenderOrder,
  type PartialNumericStats,
} from '@mud/shared';
import { getEntityBadgeClassName, getMonsterPresentation } from './monster-presentation';
import {
  getEntityKindLabel,
  getInteractableKindLabel,
  getStructureTypeLabel,
  getSurfaceTypeLabel,
  getTerrainTypeLabel,
  getTileTypeLabel,
} from './domain-labels';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './ui/floating-tooltip';
import { createObserveModalController, type ObserveAsideCard } from './main-ui-helpers';
import { detailModalHost } from './ui/detail-modal-host';
import { bindInlineItemTooltips, renderInlineItemChip } from './ui/item-inline-tooltip';
import { describePreviewBonuses } from './ui/stat-preview';
import { formatDisplayCountBadge, formatDisplayCurrentMax, formatDisplayInteger, formatDisplayNumber, formatDisplayPercent } from './utils/number';
import type { BuildingSenseQiRoomInfo } from './main-building-fengshui-state-source';
import { t } from './ui/i18n';

const UNKNOWN_PORTAL_TARGET_MAP_NAME = t('observe.unknown-map');
/**
 * MainToastKind：统一结构类型，保证协议与运行时一致性。
 */


type MainToastKind = 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
/**
 * ObserveEntity：统一结构类型，保证协议与运行时一致性。
 */


type ObserveEntity = {
/**
 * id：ID标识。
 */

  id: string;  
  /**
 * wx：wx相关字段。
 */

  wx: number;  
  /**
 * wy：wy相关字段。
 */

  wy: number;  
  /**
 * char：char相关字段。
 */

  char: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * badge：badge相关字段。
 */

  badge?: RenderEntity['badge'];  
  /**
 * name：名称名称或显示文本。
 */

  name?: string;  
  /**
 * kind：kind相关字段。
 */

  kind?: RenderEntity['kind'] | 'ground';
  /**
 * monsterTier：怪物Tier相关字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * hp：hp相关字段。
 */

  hp?: number;  
  /**
 * maxHp：maxHp相关字段。
 */

  maxHp?: number;  
  /**
 * qi：qi相关字段。
 */

  qi?: number;  
  /**
 * maxQi：maxQi相关字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：NPC任务Marker相关字段。
 */

  npcQuestMarker?: RenderEntity['npcQuestMarker'];  
  /**
 * observation：observation相关字段。
 */

  observation?: RenderEntity['observation'];  
  /**
 * buffs：buff相关字段。
 */

  buffs?: VisibleBuffState[];
};
/**
 * ObserveEntityCardData：统一结构类型，保证协议与运行时一致性。
 */


type ObserveEntityCardData = Pick<
  ObserveEntity,
  'id' | 'name' | 'kind' | 'monsterTier' | 'badge' | 'hp' | 'maxHp' | 'qi' | 'maxQi' | 'npcQuestMarker' | 'observation' | 'buffs'
> & {
  lootPreview?: NonNullable<NonNullable<S2C_TileDetail['entities']>[number]['lootPreview']>;
};
/**
 * ActiveObservedTile：统一结构类型，保证协议与运行时一致性。
 */


type ActiveObservedTile = {
/**
 * mapId：地图ID标识。
 */

  mapId: string;  
  /**
 * x：x相关字段。
 */

  x: number;  
  /**
 * y：y相关字段。
 */

  y: number;
} | null;
/**
 * MainObserveStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainObserveStateSourceOptions = {
/**
 * observeModalEl：observe弹层El相关字段。
 */

  observeModalEl: HTMLElement | null;  
  /**
 * observeModalBodyEl：observe弹层BodyEl相关字段。
 */

  observeModalBodyEl: HTMLElement | null;  
  /**
 * observeModalSubtitleEl：observe弹层SubtitleEl相关字段。
 */

  observeModalSubtitleEl: HTMLElement | null;  
  /**
 * observeModalAsideEl：observe弹层AsideEl相关字段。
 */

  observeModalAsideEl: HTMLElement | null;  
  /**
 * observeModalShellEl：observe弹层ShellEl相关字段。
 */

  observeModalShellEl: HTMLElement | null;  
  /**
 * getPlayer：玩家引用。
 */

  getPlayer: () => {  
  /**
 * id：ID标识。
 */
 id: string;  
 /**
 * mapId：地图ID标识。
 */
 mapId: string;  
 /**
 * senseQiActive：senseQi激活相关字段。
 */
 senseQiActive?: boolean;
 /**
 * wangQiActive：望气激活相关字段。
 */
 wangQiActive?: boolean } | null;
  getWangQiRoomInfoAt?: (x: number, y: number) => BuildingSenseQiRoomInfo | null;
  requestWangQiFengShuiOverlay?: (x?: number, y?: number) => void;
 /**
 * getVisibleTileAt：可见TileAt相关字段。
 */

  getVisibleTileAt: (x: number, y: number) => Tile | null;  
  /**
 * getVisibleGroundPileAt：可见GroundPileAt相关字段。
 */

  getVisibleGroundPileAt: (x: number, y: number) => GroundItemPileView | null;  
  /**
 * getLatestEntities：LatestEntity相关字段。
 */

  getLatestEntities: () => ObserveEntity[];  
  /**
 * showToast：showToast相关字段。
 */

  showToast: (message: string, kind?: MainToastKind) => void;  
  /**
 * sendInspectTileRuntime：sendInspectTile运行态引用。
 */

  sendInspectTileRuntime: (x: number, y: number) => void;  
};
/**
 * TileRuntimeResourceDetail：统一结构类型，保证协议与运行时一致性。
 */


type TileRuntimeResourceDetail = {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * effectiveValue：effective值数值。
 */

  effectiveValue?: number;  
  /**
 * level：等级数值。
 */

  level?: number;  
  /**
 * sourceValue：来源值数值。
 */

  sourceValue?: number;
};
/**
 * escapeHtml：执行escapeHtml相关逻辑。
 * @param input string 输入参数。
 * @returns 返回escapeHtml。
 */


function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
/**
 * isCrowdEntityKind：判断CrowdEntityKind是否满足条件。
 * @param kind string | null | undefined 参数说明。
 * @returns 返回是否满足CrowdEntityKind条件。
 */


function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}

function isCharacterObserveEntityKind(kind: string | null | undefined): boolean {
  return isMobileEntityObjectKind(kind);
}

function isGroundInteractableObserveEntityKind(kind: string | null | undefined): boolean {
  return isGroundInteractableObjectKind(kind);
}

function getObserveEntityNames(entities: ObserveEntityCardData[]): string[] {
  return entities
    .map((entity) => entity.name?.trim() || getEntityKindLabel(entity.kind, ''))
    .filter((name) => name.length > 0);
}

function formatMovementPointCost(tile: Tile): string {
  const movementCost = tile.movementCost;
  const cost = typeof movementCost === 'number' && Number.isFinite(movementCost) && movementCost > 0
    ? Math.trunc(movementCost)
    : getTileTraversalCost(tile.type);
  return t('observe.tile.traversal.cost', { cost });
}
/**
 * getTileTypeName：读取TileType名称。
 * @param type TileType 参数说明。
 * @returns 返回TileType名称。
 */


function getTileTypeName(type: TileType): string {
  return getTileTypeLabel(type, t('observe.tile.unknown-type', undefined));
}

function getObservedTilePrimaryTypeLabel(tile: Tile): string {
  if (typeof tile.structureType === 'string' && tile.structureType.length > 0) {
    return getStructureTypeLabel(tile.structureType, getTileTypeName(tile.type));
  }
  if (typeof tile.surfaceType === 'string' && tile.surfaceType.length > 0) {
    return getSurfaceTypeLabel(tile.surfaceType, getTileTypeName(tile.type));
  }
  if (typeof tile.terrainType === 'string' && tile.terrainType.length > 0) {
    return getTerrainTypeLabel(tile.terrainType, getTileTypeName(tile.type));
  }
  return getTileTypeName(tile.type);
}
function mergeObservedTileWithDetail(tile: Tile, detail: S2C_TileDetail | null): Tile {
  if (!detail) {
    return tile;
  }
  return {
    ...tile,
    type: detail.type ?? tile.type,
    walkable: typeof detail.walkable === 'boolean' ? detail.walkable : tile.walkable,
    blocksSight: typeof detail.blocksSight === 'boolean' ? detail.blocksSight : tile.blocksSight,
    movementCost: typeof detail.movementCost === 'number' && Number.isFinite(detail.movementCost)
      ? detail.movementCost
      : tile.movementCost,
    qiDrainPerTick: typeof detail.qiDrainPerTick === 'number' && Number.isFinite(detail.qiDrainPerTick)
      ? detail.qiDrainPerTick
      : tile.qiDrainPerTick,
    terrainType: detail.terrainType ?? tile.terrainType,
    surfaceType: detail.surfaceType === undefined ? tile.surfaceType : detail.surfaceType,
    structureType: detail.structureType === undefined ? tile.structureType : detail.structureType,
    interactableKinds: Array.isArray(detail.interactableKinds) ? detail.interactableKinds : tile.interactableKinds,
  };
}
/**
 * formatCurrentMax：规范化或转换当前Max。
 * @param current number 参数说明。
 * @param max number 参数说明。
 * @returns 返回CurrentMax。
 */


function formatCurrentMax(current?: number, max?: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof current !== 'number' || typeof max !== 'number') {
    return t('observe.value.unknown', undefined);
  }
  return formatDisplayCurrentMax(Math.max(0, Math.round(current)), Math.max(0, Math.round(max)));
}

function isObservationVitalLabel(label: string | null | undefined): boolean {
  return label === t('observe.label.life', undefined)
    || label === t('observe.label.hp', undefined)
    || label === t('observe.label.qi', undefined);
}

function isObservationDuplicatePrimaryLabel(label: string | null | undefined): boolean {
  return isObservationVitalLabel(label);
}

function buildObservePrimaryRows(entity: ObserveEntityCardData): Array<{ label: string; value: string }> {
  return [
    { label: t('observe.label.life', undefined), value: formatCurrentMax(entity.hp, entity.maxHp) },
    { label: t('observe.label.qi', undefined), value: formatCurrentMax(entity.qi, entity.maxQi) },
  ].filter((entry) => entry.value !== t('observe.value.unknown', undefined));
}

function buildObserveDetailRows(entity: ObserveEntityCardData): Array<{ label: string; value: string }> {
  return (entity.observation?.lines ?? []).filter((row) => !isObservationDuplicatePrimaryLabel(row.label));
}
/**
 * buildObservationRows：构建并返回目标对象。
 * @param rows Array<{ label: string; value?: string; valueHtml?: string }> 参数说明。
 * @returns 返回ObservationRow。
 */


function buildObservationRows(rows: Array<{
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * value：值数值。
 */
 value?: string;
 /**
 * valueHtml：值Html相关字段。
 */
 valueHtml?: string }>): string {
  return rows
    .map((row) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(row.label)}</span><span class="observe-modal-value">${row.valueHtml ?? escapeHtml(row.value ?? '')}</span></div>`)
    .join('');
}

function formatSignedInteger(value: number): string {
  const normalized = Math.trunc(Number(value) || 0);
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

/**
 * formatBuffDuration：规范化或转换Buff耗时。
 * @param buff VisibleBuffState 参数说明。
 * @returns 返回BuffDuration。
 */


function formatBuffDuration(buff: VisibleBuffState): string {
  const estimatedRemaining = estimateBuffRemainingTicks(buff);
  return t('observe.buff.duration', {
    remaining: formatDisplayInteger(Math.max(0, Math.round(estimatedRemaining))),
    duration: formatDisplayInteger(Math.max(1, Math.round(buff.duration))),
  });
}

/** 本地估算 buff 剩余 ticks：基于收到时间戳按 1Hz 递减。 */
function estimateBuffRemainingTicks(buff: VisibleBuffState): number {
  const baseTime = (buff as unknown as Record<string, unknown>)._remainingTicksReceivedAt;
  if (typeof baseTime !== 'number' || baseTime <= 0) {
    return buff.remainingTicks;
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - baseTime) / 1000));
  return Math.max(0, buff.remainingTicks - elapsedSeconds);
}

function scaleBuffAttrs(
  attrs: VisibleBuffState['attrs'],
  stacks: number,
): VisibleBuffState['attrs'] | undefined {
  if (!attrs || stacks === 1) {
    return attrs;
  }
  const scaled: NonNullable<VisibleBuffState['attrs']> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== 'number') {
      continue;
    }
    scaled[key as keyof NonNullable<VisibleBuffState['attrs']>] = value * stacks;
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}

function scaleBuffStats(
  stats: VisibleBuffState['stats'],
  stacks: number,
): VisibleBuffState['stats'] | undefined {
  if (!stats || stacks === 1) {
    return stats;
  }
  const scaled: PartialNumericStats = {};
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number') {
      (scaled as Record<string, unknown>)[key] = value * stacks;
      continue;
    }
    if (!value || typeof value !== 'object') {
      continue;
    }
    const nested: Record<string, number> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (typeof nestedValue !== 'number') {
        continue;
      }
      nested[nestedKey] = nestedValue * stacks;
    }
    if (Object.keys(nested).length > 0) {
      (scaled as Record<string, unknown>)[key] = nested;
    }
  }
  return Object.keys(scaled).length > 0 ? scaled : undefined;
}
/**
 * buildBuffEffectLines：构建并返回目标对象。
 * @param buff VisibleBuffState 参数说明。
 * @returns 返回BuffEffectLine列表。
 */


function buildBuffEffectLines(buff: VisibleBuffState): string[] {
  const stackFactor = Math.max(1, Math.floor(buff.stacks || 1));
  return describePreviewBonuses(
    scaleBuffAttrs(buff.attrs, stackFactor),
    scaleBuffStats(buff.stats, stackFactor),
    undefined,
    buff.attrMode ?? 'percent',
    buff.statMode ?? 'percent',
  );
}
/**
 * buildBuffTooltipLines：构建并返回目标对象。
 * @param buff VisibleBuffState 参数说明。
 * @returns 返回Buff提示Line列表。
 */


function buildBuffTooltipLines(buff: VisibleBuffState): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const lines = [
    t('observe.buff.tooltip.category', { category: buff.category === 'debuff' ? t('observe.buff.category.debuff', undefined) : t('observe.buff.category.buff', undefined) }),
    t('observe.buff.tooltip.remaining', { duration: formatBuffDuration(buff) }),
  ];
  const stackLimit = formatBuffMaxStacks(buff.maxStacks);
  if (stackLimit) {
    lines.push(t('observe.buff.tooltip.stacks', { stacks: formatDisplayInteger(buff.stacks), max: stackLimit }));
  }
  if (buff.sourceSkillName || buff.sourceSkillId) {
    lines.push(t('observe.buff.tooltip.source', { source: buff.sourceSkillName ?? t('observe.value.unknown', undefined) }));
  }
  const effectLines = buildBuffEffectLines(buff);
  if (effectLines.length > 0) {
    lines.push(t('observe.buff.tooltip.effect', { effect: effectLines.join('，') }));
  }
  if (buff.desc) {
    lines.push(buff.desc);
  }
  return lines;
}
/**
 * buildBuffBadgeHtml：构建并返回目标对象。
 * @param buff VisibleBuffState 参数说明。
 * @returns 返回BuffBadgeHtml。
 */


function buildBuffBadgeHtml(buff: VisibleBuffState): string {
  const title = escapeHtml(buff.name);
  const detail = escapeHtml(buildBuffTooltipLines(buff).join('\n'));
  const stackText = buff.maxStacks > 1 ? `<span class="observe-buff-stack">${formatDisplayInteger(buff.stacks)}</span>` : '';
  const className = buff.category === 'debuff' ? 'observe-buff-chip debuff' : 'observe-buff-chip buff';
  return `<button class="${className}" type="button" data-buff-tooltip-title="${title}" data-buff-tooltip-detail="${detail}">
    <span class="observe-buff-mark">${escapeHtml(buff.shortMark)}</span>
    <span class="observe-buff-name">${escapeHtml(buff.name)}</span>
    <span class="observe-buff-duration">${escapeHtml(formatBuffDuration(buff))}</span>
    ${stackText}
  </button>`;
}
/**
 * buildBuffSectionHtml：构建并返回目标对象。
 * @param title string 参数说明。
 * @param buffs VisibleBuffState[] 参数说明。
 * @param emptyText string 参数说明。
 * @returns 返回BuffSectionHtml。
 */


function buildBuffSectionHtml(title: string, buffs: VisibleBuffState[], emptyText: string): string {
  return `<section class="observe-buff-section">
    <div class="observe-buff-title">${escapeHtml(title)}</div>
    ${buffs.length > 0
      ? `<div class="observe-buff-list">${buffs.map((buff) => buildBuffBadgeHtml(buff)).join('')}</div>`
      : `<div class="observe-entity-empty">${escapeHtml(emptyText)}</div>`}
  </section>`;
}
/**
 * MainObserveStateSource：统一结构类型，保证协议与运行时一致性。
 */


export type MainObserveStateSource = ReturnType<typeof createMainObserveStateSource>;
/**
 * createMainObserveStateSource：构建并返回目标对象。
 * @param options MainObserveStateSourceOptions 选项参数。
 * @returns 无返回值，直接更新MainObserve状态来源相关状态。
 */


export function createMainObserveStateSource(options: MainObserveStateSourceOptions) {
  const observeBuffTooltip = new FloatingTooltip();
  const observeModalController = createObserveModalController({
    observeModalEl: options.observeModalEl,
    observeModalBodyEl: options.observeModalBodyEl,
    observeModalSubtitleEl: options.observeModalSubtitleEl,
    observeModalAsideEl: options.observeModalAsideEl,
    observeBuffTooltip,
    escapeHtml,
  });

  let activeObservedTile: ActiveObservedTile = null;
  let activeObservedTileDetail: S2C_TileDetail | null = null;
  let activeObservedTileError: string | null = null;
  const boundObserveModalRoots = new WeakSet<HTMLElement>();
  let observeBuffTooltipTarget: HTMLElement | null = null;
  /**
 * isMatchingObservedTile：判断MatchingObservedTile是否满足条件。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 返回是否满足MatchingObservedTile条件。
 */


  function isMatchingObservedTile(targetX: number, targetY: number): boolean {
    const player = options.getPlayer();
    return Boolean(
      player
      && activeObservedTile
      && activeObservedTile.mapId === player.mapId
      && activeObservedTile.x === targetX
      && activeObservedTile.y === targetY,
    );
  }  
  /**
 * getObservedTileRuntimeResources：读取ObservedTile运行态Resource。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 返回ObservedTile运行态Resource列表。
 */


  function getObservedTileRuntimeResources(targetX: number, targetY: number): TileRuntimeResourceDetail[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = options.getPlayer();
    if (
      !player
      || !activeObservedTile
      || activeObservedTile.mapId !== player.mapId
      || activeObservedTile.x !== targetX
      || activeObservedTile.y !== targetY
      || !activeObservedTileDetail
    ) {
      return [];
    }
    if (Array.isArray(activeObservedTileDetail.resources) && activeObservedTileDetail.resources.length > 0) {
      return activeObservedTileDetail.resources.map((resource) => ({
        key: resource.key,
        label: resource.label,
        value: resource.value,
        effectiveValue: resource.effectiveValue,
        level: resource.level,
        sourceValue: resource.sourceValue,
      }));
    }
    if (typeof activeObservedTileDetail.aura === 'number' && activeObservedTileDetail.aura > 0) {
      return [{
        key: 'aura',
        label: t('observe.resource.aura', undefined),
        value: activeObservedTileDetail.aura,
        level: activeObservedTileDetail.aura,
      }];
    }
    return [];
  }  
  /**
 * formatObservedResourceOverview：规范化或转换ObservedResourceOverview。
 * @param resource TileRuntimeResourceDetail 参数说明。
 * @param fallbackLevel number 参数说明。
 * @returns 返回ObservedResourceOverview。
 */


  function formatObservedResourceOverview(resource: TileRuntimeResourceDetail, fallbackLevel?: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof resource.level === 'number') {
      return formatDisplayInteger(Math.max(0, Math.round(resource.level)));
    }
    if (typeof fallbackLevel === 'number') {
      return formatDisplayInteger(Math.max(0, Math.round(fallbackLevel)));
    }
    return formatDisplayNumber(Math.max(0, resource.value));
  }  
  /**
 * buildObservedResourceAsideLines：构建并返回目标对象。
 * @param resource TileRuntimeResourceDetail 参数说明。
 * @returns 返回ObservedResourceAsideLine列表。
 */


  function buildObservedResourceAsideLines(resource: TileRuntimeResourceDetail): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const effectiveValue = typeof resource.effectiveValue === 'number' && Number.isFinite(resource.effectiveValue)
      ? resource.effectiveValue
      : undefined;
    const hasProjectedValue = effectiveValue !== undefined && Math.abs(effectiveValue - resource.value) > 0.005;
    const lines = [t('observe.resource.current-value', { value: formatDisplayNumber(Math.max(0, hasProjectedValue ? effectiveValue : resource.value)) })];
    if (hasProjectedValue) {
      lines.push(t('observe.resource.source-value', { value: formatDisplayNumber(Math.max(0, resource.value)) }));
    }
    if (typeof resource.level === 'number') {
      lines.unshift(t('observe.resource.current-level', { level: formatDisplayInteger(Math.max(0, Math.round(resource.level))) }));
    }
    return lines;
  }  
  /**
 * buildObservedResourceAsideCards：构建并返回目标对象。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @param tile Tile 参数说明。
 * @returns 返回ObservedResourceAsideCard列表。
 */


  function buildObservedResourceAsideCards(targetX: number, targetY: number, tile: Tile): ObserveAsideCard[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = options.getPlayer();
    if (!player?.senseQiActive || !isMatchingObservedTile(targetX, targetY)) {
      return [];
    }
    const detailResources = getObservedTileRuntimeResources(targetX, targetY);
    if (!activeObservedTileDetail) {
      const visibleTileResources = tile.resources?.filter((resource) => (
        (resource.effectiveValue ?? resource.value) > 0
        || (typeof resource.level === 'number' && Number.isFinite(resource.level) && resource.level > 0)
      )) ?? [];
      if (visibleTileResources.length === 0 && (tile.aura ?? 0) <= 0) {
        return [];
      }
      if (visibleTileResources.length > 0) {
        return visibleTileResources.map((resource) => ({
          mark: resource.label.slice(0, 1),
          title: resource.label,
          lines: [
            typeof resource.level === 'number'
              ? t('observe.resource.current-level', { level: formatDisplayInteger(Math.max(0, Math.round(resource.level))) })
              : t('observe.resource.current-value', { value: formatDisplayNumber(Math.max(0, resource.effectiveValue ?? resource.value)) }),
            t('observe.resource.senseqi.loading', undefined),
          ],
          tone: 'buff',
        }));
      }
      return [{
        mark: t('observe.resource.aura-mark', undefined),
        title: t('observe.resource.inspect-title', undefined),
        lines: [
          t('observe.resource.total-aura-level', { level: formatDisplayInteger(Math.max(0, Math.round(tile.aura ?? 0))) }),
          t('observe.resource.senseqi.loading', undefined),
        ],
        tone: 'buff',
      }];
    }
    if (detailResources.length === 0) {
      return [];
    }
    return detailResources.map((resource) => {
      const lines = buildObservedResourceAsideLines(resource);
      if (resource.key === 'aura' && !lines.some((line) => line.startsWith(t('observe.resource.current-level-prefix', undefined)))) {
        lines.unshift(t('observe.resource.current-level', { level: formatObservedResourceOverview(resource, tile.aura ?? 0) }));
      }
      return {
        mark: resource.label.slice(0, 1),
        title: resource.label,
        lines,
        tone: 'buff',
      };
    });
  }  
  /**
 * toObserveEntityCardData：执行toObserveEntityCardData相关逻辑。
 * @param entity ObserveEntity 参数说明。
 * @returns 返回toObserveEntityCardData。
 */


  function toObserveEntityCardData(entity: ObserveEntity): ObserveEntityCardData {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (isCrowdEntityKind(entity.kind)) {
      return {
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        monsterTier: entity.monsterTier,
      };
    }
    return {
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      monsterTier: entity.monsterTier,
      hp: entity.hp,
      maxHp: entity.maxHp,
      qi: entity.qi,
      maxQi: entity.maxQi,
      npcQuestMarker: entity.npcQuestMarker,
      observation: entity.observation,
      buffs: entity.buffs,
      lootPreview: undefined,
    };
  }  
  /**
 * normalizeObserveEntityCardData：规范化或转换ObserveEntityCardData。
 * @param entity NonNullable<S2C_TileDetail['entities']>[number] 参数说明。
 * @returns 返回ObserveEntityCardData。
 */


  function normalizeObserveEntityCardData(entity: NonNullable<S2C_TileDetail['entities']>[number]): ObserveEntityCardData {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (isCrowdEntityKind(entity.kind)) {
      return {
        id: entity.id,
        name: entity.name,
        kind: entity.kind ?? undefined,
        monsterTier: entity.monsterTier ?? undefined,
      };
    }
    return {
      id: entity.id,
      name: entity.name,
      kind: entity.kind ?? undefined,
      monsterTier: entity.monsterTier ?? undefined,
      hp: entity.hp,
      maxHp: entity.maxHp,
      qi: entity.qi,
      maxQi: entity.maxQi,
      npcQuestMarker: entity.npcQuestMarker ?? undefined,
      observation: entity.observation ?? undefined,
      lootPreview: entity.lootPreview ?? undefined,
      buffs: entity.buffs ?? undefined,
    };
  }  
  /**
 * resolveObserveEntities：规范化或转换ObserveEntity。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 返回ObserveEntity列表。
 */


  function resolveObserveEntities(targetX: number, targetY: number): ObserveEntityCardData[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (
      activeObservedTile
      && activeObservedTile.mapId === options.getPlayer()?.mapId
      && activeObservedTile.x === targetX
      && activeObservedTile.y === targetY
      && activeObservedTileDetail?.entities
    ) {
      return activeObservedTileDetail.entities.map((entity) => normalizeObserveEntityCardData(entity));
    }
    const localEntities = options.getLatestEntities()
      .filter((entity) => entity.wx === targetX && entity.wy === targetY);
    const hasCrowdEntity = localEntities.some((entity) => isCrowdEntityKind(entity.kind));
    return localEntities
      .filter((entity) => !hasCrowdEntity || entity.kind !== 'player')
      .map((entity) => toObserveEntityCardData(entity));
  }  
  function buildLootPreviewRowsHtml(
    lootPreview: NonNullable<ObserveEntityCardData['lootPreview']>,
    maxEntries?: number,
  ): string {
    if (lootPreview.entries.length === 0) {
      return `<div class="observe-entity-empty">${escapeHtml(lootPreview.emptyText ?? t('observe.loot.empty', undefined))}</div>`;
    }
    const visibleEntries = typeof maxEntries === 'number' && maxEntries > 0
      ? lootPreview.entries.slice(0, maxEntries)
      : lootPreview.entries;
    const remainingCount = Math.max(0, lootPreview.entries.length - visibleEntries.length);
    const rowsHtml = visibleEntries.map((entry) => `
      <div class="observe-modal-row">
        <span class="observe-modal-label">${renderInlineItemChip(entry.itemId, {
          count: entry.count,
          label: entry.name,
          tone: 'reward',
        })}</span>
        <span class="observe-modal-value">${escapeHtml(formatDisplayPercent(Math.max(0, entry.chance * 100), { maximumFractionDigits: 2 }))}</span>
      </div>
    `).join('');
    const moreHtml = remainingCount > 0
      ? `<div class="observe-entity-empty">${t('observe.loot.more', { count: escapeHtml(formatDisplayCountBadge(remainingCount)) })}</div>`
      : '';
    return `<div class="observe-entity-list">${rowsHtml}</div>${moreHtml}`;
  }

  function rerenderActiveObservedTile(): void {
    const player = options.getPlayer();
    if (!player || !activeObservedTile || activeObservedTile.mapId !== player.mapId) {
      return;
    }
    render(activeObservedTile.x, activeObservedTile.y);
  }
  /**
 * buildObservedEntityCardHtml：构建并返回目标对象。
 * @param entity ObserveEntityCardData 参数说明。
 * @returns 返回ObservedEntityCardHtml。
 */


  function buildObservedEntityCardHtml(entity: ObserveEntityCardData): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (isCrowdEntityKind(entity.kind)) {
      return `<div class="observe-entity-card">
        <div class="observe-entity-head">
          <span class="observe-entity-name">${escapeHtml(entity.name ?? t('observe.entity.crowd', undefined))}</span>
          <span class="observe-entity-kind">${escapeHtml(getEntityKindLabel(entity.kind, t('observe.entity.crowd', undefined)))}</span>
        </div>
        <div class="observe-entity-verdict">${t('observe.entity.crowd.verdict', undefined)}</div>
        <div class="observe-entity-empty">${t('observe.entity.crowd.hint', undefined)}</div>
      </div>`;
    }
    const detailRows = buildObserveDetailRows(entity);
    const monsterPresentation = entity.kind === 'monster'
      ? getMonsterPresentation(entity.name, entity.monsterTier)
      : null;
    const title = monsterPresentation?.label ?? entity.name ?? t('observe.entity.target', undefined);
    const badge = entity.badge ?? monsterPresentation?.badge;
    const badgeClassName = getEntityBadgeClassName(badge);
    const badgeHtml = badge && badgeClassName
      ? `<span class="${badgeClassName}">${escapeHtml(badge.text)}</span>`
      : '';
    const vitalRows = buildObservePrimaryRows(entity);
    const fallbackVitalRows = (entity.kind === 'monster' || entity.kind === 'npc' || entity.kind === 'player') && detailRows.length === 0
      ? vitalRows
      : [];
    const detailGrid = detailRows.length > 0 ? [...vitalRows, ...detailRows] : fallbackVitalRows;
    const visibleBuffs = entity.buffs ?? [];
    const publicBuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'buff');
    const publicDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'debuff');
    const observeOnlyBuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'buff');
    const observeOnlyDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'debuff');
    const buffSection = `<div class="observe-buff-columns">
      ${buildBuffSectionHtml(t('observe.buff.section.buffs', undefined), [...publicBuffs, ...observeOnlyBuffs], t('observe.buff.empty.buffs', undefined))}
      ${buildBuffSectionHtml(t('observe.buff.section.debuffs', undefined), [...publicDebuffs, ...observeOnlyDebuffs], t('observe.buff.empty.debuffs', undefined))}
    </div>`;
    const lootAction = entity.kind === 'monster'
      ? `<div class="observe-entity-actions">
          <button
            class="small-btn ghost observe-entity-action-btn${entity.observation?.clarity === 'complete' ? '' : ' is-disabled'}"
            type="button"
            data-observe-loot-id="${escapeHtml(entity.id)}"
            aria-disabled="${entity.observation?.clarity === 'complete' ? 'false' : 'true'}"
            aria-label="${escapeHtml(entity.observation?.clarity === 'complete' ? t('observe.loot.action.title-ready', undefined) : t('observe.loot.action.title-locked', undefined))}"
          >${t('observe.loot.action', undefined)}</button>
        </div>`
      : '';
    return `<div class="observe-entity-card">
      <div class="observe-entity-head">
        <span class="observe-entity-name">${badgeHtml}${escapeHtml(title)}</span>
        <span class="observe-entity-kind">${escapeHtml(getEntityKindLabel(entity.kind, t('observe.value.unknown', undefined)))}</span>
      </div>
      <div class="observe-entity-verdict">${escapeHtml(entity.observation?.verdict ?? t('observe.entity.verdict.empty', undefined))}</div>
      ${detailGrid.length > 0
        ? `<div class="observe-entity-grid">${buildObservationRows(detailGrid)}</div>`
        : `<div class="observe-entity-empty">${t('observe.entity.detail.empty', undefined)}</div>`}
      ${buffSection}
      ${lootAction}
    </div>`;
  }  
  /**
 * buildObservedEntitySectionHtml：构建并返回目标对象。
 * @param entities ObserveEntityCardData[] 参数说明。
 * @returns 返回ObservedEntitySectionHtml。
 */


  function buildObservedEntitySectionHtml(entities: ObserveEntityCardData[]): string {
    if (entities.length === 0) {
      return '';
    }
    return `<section class="observe-modal-section">
      <div class="observe-modal-section-title">${t('observe.entity.section.title', undefined)}</div>
      <div class="observe-entity-list">${entities.map((entity) => buildObservedEntityCardHtml(entity)).join('')}</div>
    </section>`;
  }  
  /**
 * findObservedEntityById：通过当前已观察详情查找实体。
 * @param entityId string 参数说明。
 * @returns 返回观察实体卡数据。
 */


  function findObservedEntityById(entityId: string): ObserveEntityCardData | null {
    const entities = activeObservedTileDetail?.entities;
    if (!entities) {
      return null;
    }
    const matched = entities.find((entity) => entity.id === entityId);
    return matched ? normalizeObserveEntityCardData(matched) : null;
  }
  /**
 * openObserveLootPreview：打开怪物掉落预览详情。
 * @param entity ObserveEntityCardData 参数说明。
 * @returns 无返回值，直接更新目标相关状态。
 */


  function openObserveLootPreview(entity: ObserveEntityCardData): void {
    if (entity.kind !== 'monster' || entity.observation?.clarity !== 'complete' || !entity.lootPreview) {
      return;
    }
    detailModalHost.open({
      ownerId: 'observe-loot-preview',
      variantClass: 'detail-modal--loot',
      title: t('observe.loot.modal.title', { name: entity.name ?? t('observe.entity.target', undefined) }),
      subtitle: t('observe.loot.modal.subtitle', undefined),
      bodyHtml: `
        <section class="quest-detail-section">
          <strong>${t('observe.loot.modal.section', undefined)}</strong>
          <div class="observe-loot-preview-list">${buildLootPreviewRowsHtml(entity.lootPreview)}</div>
        </section>
      `,
      onAfterRender: (body, signal) => {
        bindInlineItemTooltips(body, signal);
      },
    });
  }
  /**
 * bindObserveModalDelegatedEvents：绑定观察弹层的委托事件。
 * @param root HTMLElement 参数说明。
 * @returns 无返回值，直接更新观察弹层交互状态。
 */


  function bindObserveModalDelegatedEvents(root: HTMLElement): void {
    if (boundObserveModalRoots.has(root)) {
      return;
    }
    boundObserveModalRoots.add(root);
    const tapMode = prefersPinnedTooltipInteraction();

    root.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const lootNode = target.closest<HTMLElement>('[data-observe-loot-id]');
      if (lootNode && root.contains(lootNode)) {
        const entityId = lootNode.dataset.observeLootId?.trim();
        if (!entityId) {
          return;
        }
        const entity = findObservedEntityById(entityId);
        if (!entity || entity.kind !== 'monster' || entity.observation?.clarity !== 'complete' || !entity.lootPreview) {
          options.showToast(t('observe.toast.loot-locked', undefined));
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        openObserveLootPreview(entity);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!tapMode) {
        return;
      }
      const tooltipNode = target.closest<HTMLElement>('[data-buff-tooltip-title]');
      if (!tooltipNode || !root.contains(tooltipNode)) {
        return;
      }
      if (observeBuffTooltip.isPinnedTo(tooltipNode)) {
        hideObserveBuffTooltip(true);
        return;
      }
      const title = tooltipNode.dataset.buffTooltipTitle ?? '';
      const detail = tooltipNode.dataset.buffTooltipDetail ?? '';
      observeBuffTooltipTarget = tooltipNode;
      observeBuffTooltip.showPinned(tooltipNode, title, splitObserveBuffTooltipLines(detail), event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
    }, true);

    root.addEventListener('pointermove', (event) => {
      if (tapMode && observeBuffTooltip.isPinned()) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        hideObserveBuffTooltip();
        return;
      }
      const tooltipNode = target.closest<HTMLElement>('[data-buff-tooltip-title]');
      if (!tooltipNode || !root.contains(tooltipNode)) {
        hideObserveBuffTooltip();
        return;
      }
      if (observeBuffTooltipTarget !== tooltipNode) {
        const title = tooltipNode.dataset.buffTooltipTitle ?? '';
        const detail = tooltipNode.dataset.buffTooltipDetail ?? '';
        observeBuffTooltipTarget = tooltipNode;
        observeBuffTooltip.show(title, splitObserveBuffTooltipLines(detail), event.clientX, event.clientY);
        return;
      }
      observeBuffTooltip.move(event.clientX, event.clientY);
    });

    root.addEventListener('pointerleave', () => {
      hideObserveBuffTooltip();
    });
  }

  function splitObserveBuffTooltipLines(detail: string): string[] {
    return detail.split('\n').filter(Boolean);
  }

  function hideObserveBuffTooltip(force = false): void {
    if (!observeBuffTooltipTarget && !force) {
      return;
    }
    observeBuffTooltipTarget = null;
    observeBuffTooltip.hide(force);
  }  
  /**
 * render：执行render相关逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 无返回值，直接更新目标相关状态。
 */


  function render(targetX: number, targetY: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tile = options.getVisibleTileAt(targetX, targetY);
    if (!tile) {
      options.showToast(t('observe.toast.out-of-vision', undefined));
      return;
    }
    const player = options.getPlayer();
    const wangQiActive = player?.wangQiActive === true;
    if (wangQiActive) {
      options.requestWangQiFengShuiOverlay?.(targetX, targetY);
    }
    const wangQiRoomInfo = wangQiActive ? options.getWangQiRoomInfoAt?.(targetX, targetY) ?? null : null;
    const observedTileDetail = isMatchingObservedTile(targetX, targetY) ? activeObservedTileDetail : null;
    const observeError = isMatchingObservedTile(targetX, targetY) ? activeObservedTileError : null;
    const observedTile = mergeObservedTileWithDetail(tile, observedTileDetail);
    const groundPile = options.getVisibleGroundPileAt(targetX, targetY);
    const groundItems = observedTileDetail?.ground?.items ?? groundPile?.items ?? [];
    const hasGroundDetail = Boolean(observedTileDetail?.ground);
    const portalDetail = observedTileDetail?.portal ?? null;
    const safeZone = observedTileDetail?.safeZone ?? null;
    const sortedEntities = [...resolveObserveEntities(targetX, targetY)].sort((left, right) => (
      resolveWorldObjectRenderOrder(left.kind) - resolveWorldObjectRenderOrder(right.kind)
    ));
    const characterEntities = sortedEntities.filter((entity) => isCharacterObserveEntityKind(entity.kind));
    const groundInteractableEntities = sortedEntities.filter((entity) => isGroundInteractableObserveEntityKind(entity.kind));
    const groundInteractableNames = getObserveEntityNames(groundInteractableEntities);
    const baseStructureLabel = getStructureTypeLabel(observedTile.structureType, '');
    const terrainRows = [
      { label: t('observe.tile.label.type', undefined), value: getObservedTilePrimaryTypeLabel(observedTile) },
      { label: t('observe.tile.label.terrain', undefined), value: getTerrainTypeLabel(observedTile.terrainType, getObservedTilePrimaryTypeLabel(observedTile)) },
      { label: t('observe.tile.label.surface', undefined), value: getSurfaceTypeLabel(observedTile.surfaceType, t('observe.value.none', undefined)) },
      { label: t('observe.tile.label.structure', undefined), value: baseStructureLabel || t('observe.value.none', undefined) },
      { label: t('observe.tile.label.traversal-cost', undefined), value: formatMovementPointCost(observedTile) },
    ];
    if (!observedTile.walkable) {
      terrainRows.push({ label: t('observe.tile.label.access', undefined), value: t('observe.tile.traversal.blocked', undefined) });
    }
    if (observedTile.blocksSight) {
      terrainRows.push({ label: t('observe.tile.label.visibility', undefined), value: t('observe.tile.blocks-sight.yes', undefined) });
    }
    if (observedTileDetail?.playerOverlap === true) {
      terrainRows.push({ label: t('observe.tile.label.overlap', undefined), value: t('observe.tile.overlap.player', undefined) });
    }
    if (Number.isFinite(observedTile.qiDrainPerTick) && (observedTile.qiDrainPerTick ?? 0) > 0) {
      terrainRows.push({ label: t('observe.tile.label.qi-drain', undefined), value: `${Math.trunc(observedTile.qiDrainPerTick ?? 0)}` });
    }
    const groundInteractableValueParts = [
      ...(Array.isArray(observedTile.interactableKinds)
        ? observedTile.interactableKinds.map((kind) => getInteractableKindLabel(kind))
        : []),
      ...groundInteractableNames,
    ];
    if (groundInteractableValueParts.length > 0) {
      terrainRows.push({
        label: t('observe.tile.label.interactable', undefined),
        value: groundInteractableValueParts.join('、'),
      });
    }
    const observedTileHp = typeof observedTileDetail?.hp === 'number'
      && typeof observedTileDetail?.maxHp === 'number'
      ? { hp: observedTileDetail.hp, maxHp: observedTileDetail.maxHp }
      : typeof observedTile.hp === 'number' && typeof observedTile.maxHp === 'number'
        ? { hp: observedTile.hp, maxHp: observedTile.maxHp }
        : null;
    const groundInteractableEntityHp = groundInteractableEntities.find((entity) => typeof entity.hp === 'number' && typeof entity.maxHp === 'number');
    if (observedTileHp) {
      terrainRows.push({
        label: baseStructureLabel ? t('observe.tile.label.structure-hp', undefined) : observedTile.type === TileType.Wall ? t('observe.tile.label.wall-hp', undefined) : t('observe.tile.label.tile-hp', undefined),
        value: formatCurrentMax(observedTileHp.hp, observedTileHp.maxHp),
      });
    } else if (groundInteractableEntityHp) {
      terrainRows.push({
        label: t('observe.tile.label.interactable-hp', undefined),
        value: formatCurrentMax(groundInteractableEntityHp.hp, groundInteractableEntityHp.maxHp),
      });
    }
    if (characterEntities.length > 0) {
      terrainRows.push({ label: t('observe.tile.label.presence', undefined), value: characterEntities.map((entity) => entity.name ?? getEntityKindLabel(entity.kind)).join('、') });
    } else if (observedTile.occupiedBy) {
      terrainRows.push({ label: t('observe.tile.label.presence', undefined), value: t('observe.tile.presence.unknown', undefined) });
    }
    if (observedTile.modifiedAt) {
      terrainRows.push({ label: t('observe.tile.label.modified', undefined), value: t('observe.tile.modified.recent', undefined) });
    }
    if (observedTile.hiddenEntrance) {
      terrainRows.push({ label: t('observe.tile.label.hidden', undefined), value: observedTile.hiddenEntrance.title });
    }
    if (safeZone) {
      terrainRows.push({
        label: t('observe.safe-zone.label', undefined),
        value: safeZone.x === targetX && safeZone.y === targetY
          ? t('observe.safe-zone.center-value', { radius: safeZone.radius })
          : t('observe.safe-zone.inside-value', { x: safeZone.x, y: safeZone.y, radius: safeZone.radius }),
      });
    }
    if (typeof observedTileDetail?.aura === 'number' && observedTileDetail.aura > 0) {
      terrainRows.push({
        label: t('observe.resource.aura', undefined),
        value: formatDisplayInteger(Math.max(0, Math.round(observedTileDetail.aura))),
      });
    }
    if ((observedTileDetail?.resources?.length ?? 0) > 0) {
      const visibleResourceSummary = observedTileDetail!.resources!
        .filter((resource) => resource.key !== 'aura.refined.neutral' && resource.value > 0)
        .map((resource) => `${resource.label} ${formatDisplayNumber(Math.max(0, resource.effectiveValue ?? resource.value))}`);
      if (visibleResourceSummary.length > 0) {
        terrainRows.push({
          label: t('observe.resource.qi-presence', undefined),
          value: visibleResourceSummary.join('、'),
        });
      }
    }
    if (wangQiActive) {
      if (wangQiRoomInfo) {
        terrainRows.push(
          { label: t('observe.fengshui.label.room', undefined), value: wangQiRoomInfo.roomLabel },
          { label: t('observe.fengshui.label.area', undefined), value: typeof wangQiRoomInfo.area === 'number' ? formatDisplayInteger(Math.max(0, Math.round(wangQiRoomInfo.area))) : t('observe.value.unknown', undefined) },
          { label: t('observe.fengshui.label.enclosure', undefined), value: typeof wangQiRoomInfo.enclosed === 'boolean' ? (wangQiRoomInfo.enclosed ? t('observe.fengshui.enclosed', undefined) : t('observe.fengshui.open', undefined)) : t('observe.value.unknown', undefined) },
          { label: t('observe.fengshui.label.doors-windows', undefined), value: `${formatDisplayInteger(Math.max(0, Math.round(wangQiRoomInfo.doorCount ?? 0)))}/${formatDisplayInteger(Math.max(0, Math.round(wangQiRoomInfo.windowCount ?? 0)))}` },
          { label: t('observe.fengshui.label.score', undefined), value: `${wangQiRoomInfo.fengShuiLabel} ${Math.round(wangQiRoomInfo.score)}` },
          { label: t('observe.fengshui.label.luck', undefined), value: formatSignedInteger(Math.trunc(Math.round(wangQiRoomInfo.score) / 10)) },
        );
        const detail = wangQiRoomInfo.detail;
        if (detail) {
          terrainRows.push(
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.shape', undefined)}`, value: formatSignedInteger(detail.shapeScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.enclosure', undefined)}`, value: formatSignedInteger(detail.enclosureScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.qi', undefined)}`, value: formatSignedInteger(detail.qiScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.sha', undefined)}`, value: formatSignedInteger(detail.shaScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.comfort', undefined)}`, value: formatSignedInteger(detail.comfortScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.element', undefined)}`, value: formatSignedInteger(detail.elementScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.formation', undefined)}`, value: formatSignedInteger(detail.formationScore) },
            { label: `${t('observe.fengshui.section.title', undefined)}·${t('observe.fengshui.dimension.integrity', undefined)}`, value: formatSignedInteger(detail.integrityScore) },
          );
          const reasonSummary = detail.reasons
            .filter((reason) => reason.delta !== 0)
            .slice()
            .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
            .slice(0, 12)
            .map((reason) => `${formatSignedInteger(reason.delta)} ${reason.code}`)
            .join('、');
          if (reasonSummary) {
            terrainRows.push({ label: t('observe.fengshui.label.score', undefined), value: reasonSummary });
          }
        }
      } else {
        terrainRows.push(
          { label: t('observe.fengshui.label.room', undefined), value: t('observe.fengshui.room.none', undefined) },
          { label: t('observe.fengshui.label.score', undefined), value: t('observe.fengshui.neutral-score', undefined) },
          { label: t('observe.fengshui.label.luck', undefined), value: '+0' },
        );
      }
    }
    if (hasGroundDetail) {
      terrainRows.push({
        label: t('observe.ground.section.title', undefined),
        value: t('entity-detail.count.items', { count: formatDisplayInteger(groundItems.length) }),
      });
    }
    const portalTargetMapName = portalDetail?.targetMapName?.trim() || UNKNOWN_PORTAL_TARGET_MAP_NAME;
    if (portalDetail) {
      terrainRows.push({ label: t('observe.portal.destination', undefined), value: portalTargetMapName });
      terrainRows.push({ label: t('observe.portal.label.trigger', undefined), value: portalDetail.trigger === 'auto' ? t('observe.portal.trigger.auto', undefined) : t('observe.portal.trigger.manual', undefined) });
      terrainRows.push({ label: t('observe.portal.label.direction', undefined), value: portalDetail.direction === 'one_way' ? t('observe.portal.direction.one-way', undefined) : t('observe.portal.direction.two-way', undefined) });
    }

    observeModalController.setSubtitle(targetX, targetY);
    if (options.observeModalBodyEl) {
      const groundHtml = groundItems.length > 0
        ? `<div class="observe-entity-list">${groundItems.map((entry) => `
            <div class="observe-modal-row">
              <span class="observe-modal-label">${escapeHtml(entry.name)}</span>
              <span class="observe-modal-value">${formatDisplayCountBadge(entry.count)}</span>
            </div>
          `).join('')}</div>`
        : observedTileDetail?.ground
          ? `<div class="observe-entity-empty">${t('observe.ground.empty.takeable', undefined)}</div>`
          : `<div class="observe-entity-empty">${t('observe.ground.empty', undefined)}</div>`;
      const groundMetaHtml = hasGroundDetail
        ? `<div class="observe-entity-empty">${escapeHtml(t('entity-detail.count.items', { count: formatDisplayInteger(groundItems.length) }))}</div>`
        : '';
      const errorHtml = observeError
        ? `<section class="observe-modal-section"><div class="observe-modal-section-title">${t('observe.error.section.title', undefined)}</div><div class="observe-entity-empty">${escapeHtml(observeError)}</div></section>`
        : '';
      observeModalController.renderBody(`
        <div class="observe-modal-top">
          ${errorHtml}
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">${t('observe.tile.section.title', undefined)}</div>
            <div class="observe-modal-grid">${buildObservationRows(terrainRows)}</div>
          </section>
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">${t('observe.ground.section.title', undefined)}</div>
            ${groundMetaHtml}
            ${groundHtml}
          </section>
        </div>
        ${buildObservedEntitySectionHtml(characterEntities)}
      `);
      bindObserveModalDelegatedEvents(options.observeModalBodyEl);
      if (observeBuffTooltipTarget && !observeBuffTooltipTarget.isConnected) {
        hideObserveBuffTooltip(true);
      }
    }
    observeModalController.renderAsideCards(buildObservedResourceAsideCards(targetX, targetY, tile));
    observeModalController.show();
  }

  return {  
  /**
 * clear：执行clear相关逻辑。
 * @returns 无返回值，直接更新clear相关状态。
 */

    clear(): void {
      activeObservedTile = null;
      activeObservedTileDetail = null;
      activeObservedTileError = null;
      hideObserveBuffTooltip(true);
    },    
    /**
 * hide：执行hide相关逻辑。
 * @returns 无返回值，直接更新hide相关状态。
 */

    hide(): void {
      hideObserveBuffTooltip(true);
      observeModalController.hide();
      this.clear();
    },    
    /**
 * show：执行show相关逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 无返回值，直接更新show相关状态。
 */

    show(targetX: number, targetY: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (!player) {
        return;
      }
      activeObservedTile = { mapId: player.mapId, x: targetX, y: targetY };
      activeObservedTileDetail = null;
      activeObservedTileError = null;
      render(targetX, targetY);
      options.sendInspectTileRuntime(targetX, targetY);
    },    
    /**
 * render：执行render相关逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns 无返回值，直接更新目标相关状态。
 */

    render(targetX: number, targetY: number): void {
      render(targetX, targetY);
    },    
    /**
 * handleTileDetail：处理Tile详情并更新相关状态。
   * @param data S2C_TileDetail 原始数据。
 * @returns 无返回值，直接更新Tile详情相关状态。
 */

    handleTileDetail(data: S2C_TileDetail): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

      const player = options.getPlayer();
      if (
        !player
        || !activeObservedTile
        || activeObservedTile.mapId !== player.mapId
        || activeObservedTile.x !== data.x
        || activeObservedTile.y !== data.y
      ) {
        return;
      }
      activeObservedTileDetail = data;
      activeObservedTileError = data.error?.trim() || null;
      if (data.error) {
        options.showToast(data.error);
      }
      render(data.x, data.y);
    },    
    /**
 * isOpen：判断Open是否满足条件。
 * @returns 返回是否满足Open条件。
 */

    isOpen(): boolean {
      return !(options.observeModalEl?.classList.contains('hidden') ?? true);
    },
  };
}
