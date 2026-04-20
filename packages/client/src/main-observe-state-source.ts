import {
  formatBuffMaxStacks,
  GroundItemPileView,
  getTileTraversalCost,
  MonsterTier,
  NEXT_S2C_Detail,
  NEXT_S2C_TileDetail,
  RenderEntity,
  Tile,
  TileType,
  VisibleBuffState,
} from '@mud/shared-next';
import { getMonsterPresentation } from './monster-presentation';
import { getEntityKindLabel, getTileTypeLabel } from './domain-labels';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './ui/floating-tooltip';
import { createObserveModalController, type ObserveAsideCard } from './main-ui-helpers';
import { describePreviewBonuses } from './ui/stat-preview';
import { formatDisplayCountBadge, formatDisplayCurrentMax, formatDisplayInteger } from './utils/number';
/**
 * MainToastKind：统一结构类型，保证协议与运行时一致性。
 */


type MainToastKind = 'system' | 'chat' | 'quest' | 'combat' | 'loot' | 'grudge' | 'success' | 'warn' | 'travel';
/**
 * ObserveEntity：统一结构类型，保证协议与运行时一致性。
 */


type ObserveEntity = {
/**
 * id：对象字段。
 */

  id: string;  
  /**
 * wx：对象字段。
 */

  wx: number;  
  /**
 * wy：对象字段。
 */

  wy: number;  
  /**
 * char：对象字段。
 */

  char: string;  
  /**
 * color：对象字段。
 */

  color: string;  
  /**
 * name：对象字段。
 */

  name?: string;  
  /**
 * kind：对象字段。
 */

  kind?: string;  
  /**
 * monsterTier：对象字段。
 */

  monsterTier?: MonsterTier;  
  /**
 * hp：对象字段。
 */

  hp?: number;  
  /**
 * maxHp：对象字段。
 */

  maxHp?: number;  
  /**
 * qi：对象字段。
 */

  qi?: number;  
  /**
 * maxQi：对象字段。
 */

  maxQi?: number;  
  /**
 * npcQuestMarker：对象字段。
 */

  npcQuestMarker?: RenderEntity['npcQuestMarker'];  
  /**
 * observation：对象字段。
 */

  observation?: RenderEntity['observation'];  
  /**
 * buffs：对象字段。
 */

  buffs?: VisibleBuffState[];
};
/**
 * ObserveEntityCardData：统一结构类型，保证协议与运行时一致性。
 */


type ObserveEntityCardData = Pick<
  ObserveEntity,
  'id' | 'name' | 'kind' | 'monsterTier' | 'hp' | 'maxHp' | 'qi' | 'maxQi' | 'npcQuestMarker' | 'observation' | 'buffs'
>;
/**
 * ActiveObservedTile：统一结构类型，保证协议与运行时一致性。
 */


type ActiveObservedTile = {
/**
 * mapId：对象字段。
 */

  mapId: string;  
  /**
 * x：对象字段。
 */

  x: number;  
  /**
 * y：对象字段。
 */

  y: number;
} | null;
/**
 * MainObserveStateSourceOptions：统一结构类型，保证协议与运行时一致性。
 */


type MainObserveStateSourceOptions = {
/**
 * observeModalEl：对象字段。
 */

  observeModalEl: HTMLElement | null;  
  /**
 * observeModalBodyEl：对象字段。
 */

  observeModalBodyEl: HTMLElement | null;  
  /**
 * observeModalSubtitleEl：对象字段。
 */

  observeModalSubtitleEl: HTMLElement | null;  
  /**
 * observeModalAsideEl：对象字段。
 */

  observeModalAsideEl: HTMLElement | null;  
  /**
 * observeModalShellEl：对象字段。
 */

  observeModalShellEl: HTMLElement | null;  
  /**
 * getPlayer：对象字段。
 */

  getPlayer: () => {  
  /**
 * id：对象字段。
 */
 id: string;  
 /**
 * mapId：对象字段。
 */
 mapId: string;  
 /**
 * senseQiActive：对象字段。
 */
 senseQiActive?: boolean } | null;  
 /**
 * getVisibleTileAt：对象字段。
 */

  getVisibleTileAt: (x: number, y: number) => Tile | null;  
  /**
 * getVisibleGroundPileAt：对象字段。
 */

  getVisibleGroundPileAt: (x: number, y: number) => GroundItemPileView | null;  
  /**
 * getLatestEntities：对象字段。
 */

  getLatestEntities: () => ObserveEntity[];  
  /**
 * showToast：对象字段。
 */

  showToast: (message: string, kind?: MainToastKind) => void;  
  /**
 * sendInspectTileRuntime：对象字段。
 */

  sendInspectTileRuntime: (x: number, y: number) => void;  
  /**
 * openEntityDetailPending：对象字段。
 */

  openEntityDetailPending: (kind: NEXT_S2C_Detail['kind'], id: string, title: string) => void;  
  /**
 * sendRequestDetail：对象字段。
 */

  sendRequestDetail: (kind: NEXT_S2C_Detail['kind'], id: string) => void;
};
/**
 * TileRuntimeResourceDetail：统一结构类型，保证协议与运行时一致性。
 */


type TileRuntimeResourceDetail = {
/**
 * key：对象字段。
 */

  key: string;  
  /**
 * label：对象字段。
 */

  label: string;  
  /**
 * value：对象字段。
 */

  value: number;  
  /**
 * effectiveValue：对象字段。
 */

  effectiveValue?: number;  
  /**
 * level：对象字段。
 */

  level?: number;  
  /**
 * sourceValue：对象字段。
 */

  sourceValue?: number;
};
/**
 * escapeHtml：执行核心业务逻辑。
 * @param input string 输入参数。
 * @returns string。
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
 * isCrowdEntityKind：执行状态校验并返回判断结果。
 * @param kind string | null | undefined 参数说明。
 * @returns boolean。
 */


function isCrowdEntityKind(kind: string | null | undefined): boolean {
  return kind === 'crowd';
}
/**
 * getTileTypeName：按给定条件读取/查询数据。
 * @param type TileType 参数说明。
 * @returns string。
 */


function getTileTypeName(type: TileType): string {
  return getTileTypeLabel(type, '未知地貌');
}
/**
 * formatTraversalCost：执行核心业务逻辑。
 * @param tile Tile 参数说明。
 * @returns string。
 */


function formatTraversalCost(tile: Tile): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!tile.walkable) {
    return '无法通行';
  }
  return `${getTileTraversalCost(tile.type)} 点/格`;
}
/**
 * formatCurrentMax：执行核心业务逻辑。
 * @param current number 参数说明。
 * @param max number 参数说明。
 * @returns string。
 */


function formatCurrentMax(current?: number, max?: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (typeof current !== 'number' || typeof max !== 'number') {
    return '未明';
  }
  return formatDisplayCurrentMax(Math.max(0, Math.round(current)), Math.max(0, Math.round(max)));
}
/**
 * buildObservationRows：构建并返回目标对象。
 * @param rows Array<{ label: string; value?: string; valueHtml?: string }> 参数说明。
 * @returns string。
 */


function buildObservationRows(rows: Array<{
/**
 * label：对象字段。
 */
 label: string;
 /**
 * value：对象字段。
 */
 value?: string;
 /**
 * valueHtml：对象字段。
 */
 valueHtml?: string }>): string {
  return rows
    .map((row) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(row.label)}</span><span class="observe-modal-value">${row.valueHtml ?? escapeHtml(row.value ?? '')}</span></div>`)
    .join('');
}
/**
 * formatBuffDuration：执行核心业务逻辑。
 * @param buff VisibleBuffState 参数说明。
 * @returns string。
 */


function formatBuffDuration(buff: VisibleBuffState): string {
  return `${formatDisplayInteger(Math.max(0, Math.round(buff.remainingTicks)))} / ${formatDisplayInteger(Math.max(1, Math.round(buff.duration)))} 息`;
}
/**
 * buildBuffEffectLines：构建并返回目标对象。
 * @param buff VisibleBuffState 参数说明。
 * @returns string[]。
 */


function buildBuffEffectLines(buff: VisibleBuffState): string[] {
  return describePreviewBonuses(buff.attrs, buff.stats);
}
/**
 * buildBuffTooltipLines：构建并返回目标对象。
 * @param buff VisibleBuffState 参数说明。
 * @returns string[]。
 */


function buildBuffTooltipLines(buff: VisibleBuffState): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const lines = [
    `类别：${buff.category === 'debuff' ? '减益' : '增益'}`,
    `剩余：${formatBuffDuration(buff)}`,
  ];
  const stackLimit = formatBuffMaxStacks(buff.maxStacks);
  if (stackLimit) {
    lines.push(`层数：${formatDisplayInteger(buff.stacks)} / ${stackLimit}`);
  }
  if (buff.sourceSkillName || buff.sourceSkillId) {
    lines.push(`来源：${buff.sourceSkillName ?? buff.sourceSkillId}`);
  }
  const effectLines = buildBuffEffectLines(buff);
  if (effectLines.length > 0) {
    lines.push(`效果：${effectLines.join('，')}`);
  }
  if (buff.desc) {
    lines.push(buff.desc);
  }
  return lines;
}
/**
 * buildBuffBadgeHtml：构建并返回目标对象。
 * @param buff VisibleBuffState 参数说明。
 * @returns string。
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
 * @returns string。
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
 * @returns 函数返回值。
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
  let activeObservedTileDetail: NEXT_S2C_TileDetail | null = null;
  let activeObservedTileError: string | null = null;  
  /**
 * isMatchingObservedTile：执行状态校验并返回判断结果。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns boolean。
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
 * getObservedTileRuntimeResources：按给定条件读取/查询数据。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns TileRuntimeResourceDetail[]。
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
    if (typeof activeObservedTileDetail.aura === 'number') {
      return [{
        key: 'aura',
        label: '灵气',
        value: activeObservedTileDetail.aura,
        level: activeObservedTileDetail.aura,
      }];
    }
    return [];
  }  
  /**
 * formatObservedResourceOverview：执行核心业务逻辑。
 * @param resource TileRuntimeResourceDetail 参数说明。
 * @param fallbackLevel number 参数说明。
 * @returns string。
 */


  function formatObservedResourceOverview(resource: TileRuntimeResourceDetail, fallbackLevel?: number): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (typeof resource.level === 'number') {
      return formatDisplayInteger(Math.max(0, Math.round(resource.level)));
    }
    if (typeof fallbackLevel === 'number') {
      return formatDisplayInteger(Math.max(0, Math.round(fallbackLevel)));
    }
    return formatDisplayInteger(Math.max(0, Math.round(resource.value)));
  }  
  /**
 * buildObservedResourceAsideLines：构建并返回目标对象。
 * @param resource TileRuntimeResourceDetail 参数说明。
 * @returns string[]。
 */


  function buildObservedResourceAsideLines(resource: TileRuntimeResourceDetail): string[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const effectiveValue = typeof resource.effectiveValue === 'number' && Number.isFinite(resource.effectiveValue)
      ? resource.effectiveValue
      : undefined;
    const hasProjectedValue = effectiveValue !== undefined && Math.round(effectiveValue) !== Math.round(resource.value);
    const lines = [`当前数值：${formatDisplayInteger(Math.max(0, Math.round(hasProjectedValue ? effectiveValue : resource.value)))}`];
    if (hasProjectedValue) {
      lines.push(`原始值：${formatDisplayInteger(Math.max(0, Math.round(resource.value)))}`);
    }
    if (typeof resource.level === 'number') {
      lines.unshift(`当前等级：${formatDisplayInteger(Math.max(0, Math.round(resource.level)))}`);
    }
    return lines;
  }  
  /**
 * buildObservedResourceAsideCards：构建并返回目标对象。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @param tile Tile 参数说明。
 * @returns ObserveAsideCard[]。
 */


  function buildObservedResourceAsideCards(targetX: number, targetY: number, tile: Tile): ObserveAsideCard[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const player = options.getPlayer();
    if (!player?.senseQiActive || !isMatchingObservedTile(targetX, targetY)) {
      return [];
    }
    const detailResources = getObservedTileRuntimeResources(targetX, targetY);
    if (!activeObservedTileDetail) {
      if ((tile.aura ?? 0) <= 0) {
        return [];
      }
      return [{
        mark: '气',
        title: '气机细察',
        lines: [
          `总灵气等级：${formatDisplayInteger(Math.max(0, Math.round(tile.aura ?? 0)))}`,
          '感气决运转中，正在细察此地气机。',
        ],
        tone: 'buff',
      }];
    }
    if (detailResources.length === 0) {
      return [];
    }
    return detailResources.map((resource) => {
      const lines = buildObservedResourceAsideLines(resource);
      if (resource.key === 'aura' && !lines.some((line) => line.startsWith('当前等级：'))) {
        lines.unshift(`当前等级：${formatObservedResourceOverview(resource, tile.aura ?? 0)}`);
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
 * toObserveEntityCardData：执行核心业务逻辑。
 * @param entity ObserveEntity 参数说明。
 * @returns ObserveEntityCardData。
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
    };
  }  
  /**
 * normalizeObserveEntityCardData：执行核心业务逻辑。
 * @param entity NonNullable<NEXT_S2C_TileDetail['entities']>[number] 参数说明。
 * @returns ObserveEntityCardData。
 */


  function normalizeObserveEntityCardData(entity: NonNullable<NEXT_S2C_TileDetail['entities']>[number]): ObserveEntityCardData {
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
      buffs: entity.buffs ?? undefined,
    };
  }  
  /**
 * resolveObserveEntities：执行核心业务逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns ObserveEntityCardData[]。
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
  /**
 * resolveObserveDetailKind：执行核心业务逻辑。
 * @param kind ObserveEntityCardData['kind'] 参数说明。
 * @returns NEXT_S2C_Detail['kind'] | null。
 */


  function resolveObserveDetailKind(kind: ObserveEntityCardData['kind']): NEXT_S2C_Detail['kind'] | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (kind === 'npc' || kind === 'monster' || kind === 'player' || kind === 'portal' || kind === 'ground' || kind === 'container') {
      return kind;
    }
    return null;
  }  
  /**
 * buildObservedEntityCardHtml：构建并返回目标对象。
 * @param entity ObserveEntityCardData 参数说明。
 * @returns string。
 */


  function buildObservedEntityCardHtml(entity: ObserveEntityCardData): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (isCrowdEntityKind(entity.kind)) {
      return `<div class="observe-entity-card">
        <div class="observe-entity-head">
          <span class="observe-entity-name">${escapeHtml(entity.name ?? '人群')}</span>
          <span class="observe-entity-kind">${escapeHtml(getEntityKindLabel(entity.kind, '人群'))}</span>
        </div>
        <div class="observe-entity-verdict">此地人影交叠，气机纷杂，只能辨出这里聚着一团密集人群。</div>
        <div class="observe-entity-empty">地图广播已将此格玩家聚合为人群显示，不再实时展开单人的血条、Buff 与细节变化。</div>
      </div>`;
    }
    const detailRows = entity.observation?.lines ?? [];
    const monsterPresentation = entity.kind === 'monster'
      ? getMonsterPresentation(entity.name, entity.monsterTier)
      : null;
    const title = monsterPresentation?.label ?? entity.name ?? entity.id;
    const badge = monsterPresentation?.badgeText
      ? `<span class="${monsterPresentation.badgeClassName}">${escapeHtml(monsterPresentation.badgeText)}</span>`
      : '';
    const vitalRows = [
      { label: '生命', value: formatCurrentMax(entity.hp, entity.maxHp) },
      { label: '灵力', value: formatCurrentMax(entity.qi, entity.maxQi) },
    ].filter((entry) => entry.value !== '—');
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
      ${buildBuffSectionHtml('增益状态', [...publicBuffs, ...observeOnlyBuffs], '当前未见明显增益状态')}
      ${buildBuffSectionHtml('减益状态', [...publicDebuffs, ...observeOnlyDebuffs], '当前未见明显减益状态')}
    </div>`;
    const detailKind = resolveObserveDetailKind(entity.kind);
    const detailAttrs = detailKind
      ? ` data-observe-detail-kind="${escapeHtml(detailKind)}" data-observe-detail-id="${escapeHtml(entity.id)}" data-observe-detail-title="${escapeHtml(title)}"`
      : '';
    const tag = detailKind ? 'button' : 'div';
    const typeAttr = detailKind ? ' type="button"' : '';
    return `<${tag} class="observe-entity-card${detailKind ? ' observe-entity-card--interactive' : ''}"${typeAttr}${detailAttrs}>
      <div class="observe-entity-head">
        <span class="observe-entity-name">${badge}${escapeHtml(title)}</span>
        <span class="observe-entity-kind">${escapeHtml(getEntityKindLabel(entity.kind, '未知'))}</span>
      </div>
      <div class="observe-entity-verdict">${escapeHtml(entity.observation?.verdict ?? '神识轻拂而过，未得更多回响。')}</div>
      ${detailGrid.length > 0
        ? `<div class="observe-entity-grid">${buildObservationRows(detailGrid)}</div>`
        : '<div class="observe-entity-empty">此身气机尽藏，暂未看出更多端倪。</div>'}
      ${buffSection}
    </${tag}>`;
  }  
  /**
 * buildObservedEntitySectionHtml：构建并返回目标对象。
 * @param entities ObserveEntityCardData[] 参数说明。
 * @returns string。
 */


  function buildObservedEntitySectionHtml(entities: ObserveEntityCardData[]): string {
    return `<section class="observe-modal-section">
      <div class="observe-modal-section-title">地块实体</div>
      ${entities.length > 0
        ? `<div class="observe-entity-list">${entities.map((entity) => buildObservedEntityCardHtml(entity)).join('')}</div>`
        : '<div class="observe-entity-empty">该地块当前没有可观察的角色、怪物、NPC、传送点或地面物。</div>'}
    </section>`;
  }  
  /**
 * bindObserveEntityDetailActions：执行核心业务逻辑。
 * @param root ParentNode 参数说明。
 * @returns void。
 */


  function bindObserveEntityDetailActions(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-observe-detail-id][data-observe-detail-kind]').forEach((node) => {
      node.addEventListener('click', (event) => {
        const kind = node.dataset.observeDetailKind as NEXT_S2C_Detail['kind'] | undefined;
        const id = node.dataset.observeDetailId?.trim();
        if (!kind || !id) {
          return;
        }
        const title = node.dataset.observeDetailTitle?.trim() || node.textContent?.trim() || id;
        options.openEntityDetailPending(kind, id, title);
        options.sendRequestDetail(kind, id);
        event.preventDefault();
        event.stopPropagation();
      }, true);
    });
  }  
  /**
 * bindObserveBuffTooltips：执行核心业务逻辑。
 * @param root ParentNode 参数说明。
 * @returns void。
 */


  function bindObserveBuffTooltips(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-buff-tooltip-title]').forEach((node) => {
      const title = node.dataset.buffTooltipTitle ?? '';
      const detail = node.dataset.buffTooltipDetail ?? '';
      const lines = detail.split('\n').filter(Boolean);
      const tapMode = prefersPinnedTooltipInteraction();
      node.addEventListener('click', (event) => {
        if (!tapMode) {
          return;
        }
        if (observeBuffTooltip.isPinnedTo(node)) {
          observeBuffTooltip.hide(true);
          return;
        }
        observeBuffTooltip.showPinned(node, title, lines, event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
      }, true);
      node.addEventListener('mouseenter', (event) => {
        observeBuffTooltip.show(title, lines, event.clientX, event.clientY);
      });
      node.addEventListener('mousemove', (event) => {
        observeBuffTooltip.move(event.clientX, event.clientY);
      });
      node.addEventListener('mouseleave', () => {
        observeBuffTooltip.hide();
      });
    });
  }  
  /**
 * render：执行核心业务逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns void。
 */


  function render(targetX: number, targetY: number): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const tile = options.getVisibleTileAt(targetX, targetY);
    if (!tile) {
      options.showToast('只能观察当前视野内的格子');
      return;
    }
    const observedTileDetail = isMatchingObservedTile(targetX, targetY) ? activeObservedTileDetail : null;
    const observeError = isMatchingObservedTile(targetX, targetY) ? activeObservedTileError : null;
    const groundPile = options.getVisibleGroundPileAt(targetX, targetY);
    const groundItems = observedTileDetail?.ground?.items ?? groundPile?.items ?? [];
    const groundSourceId = observedTileDetail?.ground?.sourceId ?? null;
    const portalDetail = observedTileDetail?.portal ?? null;
    const safeZone = observedTileDetail?.safeZone ?? null;
    const sortedEntities = [...resolveObserveEntities(targetX, targetY)].sort((left, right) => {
      const order = (kind?: string): number => (kind === 'crowd' ? 0 : kind === 'player' ? 1 : kind === 'container' ? 2 : kind === 'npc' ? 3 : kind === 'monster' ? 4 : 5);
      return order(left.kind) - order(right.kind);
    });
    const terrainRows = [
      { label: '地貌', value: getTileTypeName(tile.type) },
      { label: '是否可通行', value: tile.walkable ? '可通行' : '不可通行' },
      { label: '行走消耗', value: formatTraversalCost(tile) },
      { label: '是否阻挡视线', value: tile.blocksSight ? '会阻挡' : '不会阻挡' },
    ];
    if (typeof tile.hp === 'number' && typeof tile.maxHp === 'number') {
      terrainRows.push({
        label: tile.type === TileType.Wall ? '壁垒稳固' : '地物稳固',
        value: formatCurrentMax(tile.hp, tile.maxHp),
      });
    }
    if (sortedEntities.length > 0) {
      terrainRows.push({ label: '驻足气息', value: sortedEntities.map((entity) => entity.name ?? getEntityKindLabel(entity.kind, entity.id)).join('、') });
    } else if (tile.occupiedBy) {
      terrainRows.push({ label: '驻足气息', value: '此地留有生灵立身之痕' });
    }
    if (tile.modifiedAt) {
      terrainRows.push({ label: '最近变动', value: '此地近期发生过变化' });
    }
    if (tile.hiddenEntrance) {
      terrainRows.push({ label: '异状', value: tile.hiddenEntrance.title });
    }
    if (safeZone) {
      terrainRows.push({
        label: '安全区',
        value: safeZone.x === targetX && safeZone.y === targetY
          ? `安全区中心 · 半径 ${safeZone.radius}`
          : `已处于安全区内 · 中心 (${safeZone.x}, ${safeZone.y}) · 半径 ${safeZone.radius}`,
      });
    }
    if (typeof observedTileDetail?.aura === 'number') {
      terrainRows.push({
        label: '灵气',
        value: formatDisplayInteger(Math.max(0, Math.round(observedTileDetail.aura))),
      });
    }
    if (groundSourceId) {
      terrainRows.push({ label: '掉落来源', value: groundSourceId });
    }
    if (portalDetail) {
      terrainRows.push({ label: '界门去向', value: portalDetail.targetMapName ?? portalDetail.targetMapId });
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
          ? '<div class="observe-entity-empty">这里暂时没有可拾取物品。</div>'
          : '<div class="observe-entity-empty">该地块当前没有可见地面物品。</div>';
      const safeZoneHtml = safeZone
        ? `
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">安全区</div>
            <div class="observe-entity-list">
              <div class="observe-modal-row">
                <span class="observe-modal-label">中心</span>
                <span class="observe-modal-value">(${safeZone.x}, ${safeZone.y})</span>
              </div>
              <div class="observe-modal-row">
                <span class="observe-modal-label">半径</span>
                <span class="observe-modal-value">${safeZone.radius} 格</span>
              </div>
            </div>
          </section>
        `
        : '';
      const portalHtml = portalDetail
        ? `
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">传送点</div>
            <div class="observe-entity-list">
              <div class="observe-modal-row">
                <span class="observe-modal-label">类型</span>
                <span class="observe-modal-value">${escapeHtml(portalDetail.kind === 'stairs' ? '楼梯' : portalDetail.kind === 'gate' ? '关隘' : '传送点')}</span>
              </div>
              <div class="observe-modal-row">
                <span class="observe-modal-label">目标地图</span>
                <span class="observe-modal-value">${escapeHtml(portalDetail.targetMapName ?? portalDetail.targetMapId)}</span>
              </div>
              <div class="observe-modal-row">
                <span class="observe-modal-label">目标坐标</span>
                <span class="observe-modal-value">${typeof portalDetail.targetX === 'number' && typeof portalDetail.targetY === 'number' ? `(${portalDetail.targetX}, ${portalDetail.targetY})` : '未知'}</span>
              </div>
              <div class="observe-modal-row">
                <span class="observe-modal-label">触发方式</span>
                <span class="observe-modal-value">${escapeHtml(portalDetail.trigger === 'auto' ? '自动触发' : '手动触发')}</span>
              </div>
            </div>
          </section>
        `
        : '';
      const groundMetaHtml = groundSourceId
        ? `<div class="observe-entity-empty">来源：${escapeHtml(groundSourceId)} · 共 ${formatDisplayInteger(groundItems.length)} 种堆叠</div>`
        : '';
      const errorHtml = observeError
        ? `<section class="observe-modal-section"><div class="observe-modal-section-title">观察回响</div><div class="observe-entity-empty">${escapeHtml(observeError)}</div></section>`
        : '';
      observeModalController.renderBody(`
        <div class="observe-modal-top">
          ${errorHtml}
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">地块信息</div>
            <div class="observe-modal-grid">${buildObservationRows(terrainRows)}</div>
          </section>
          ${safeZoneHtml}
          ${tile.hiddenEntrance ? `
            <section class="observe-modal-section">
              <div class="observe-modal-section-title">隐藏入口</div>
              <div class="observe-entity-list">
                <div class="observe-modal-row">
                  <span class="observe-modal-label">痕迹</span>
                  <span class="observe-modal-value">${escapeHtml(tile.hiddenEntrance.title)}</span>
                </div>
                <div class="observe-entity-empty">${escapeHtml(tile.hiddenEntrance.desc ?? '这里隐约残留着一处被刻意遮掩的入口痕迹。')}</div>
              </div>
            </section>
          ` : ''}
          ${portalHtml}
          <section class="observe-modal-section">
            <div class="observe-modal-section-title">地面物品</div>
            ${groundMetaHtml}
            ${groundHtml}
          </section>
        </div>
        ${buildObservedEntitySectionHtml(sortedEntities)}
      `);
      bindObserveEntityDetailActions(options.observeModalBodyEl);
      bindObserveBuffTooltips(options.observeModalBodyEl);
    }
    observeModalController.renderAsideCards(buildObservedResourceAsideCards(targetX, targetY, tile));
    observeModalController.show();
  }

  return {  
  /**
 * clear：执行核心业务逻辑。
 * @returns void。
 */

    clear(): void {
      activeObservedTile = null;
      activeObservedTileDetail = null;
      activeObservedTileError = null;
    },    
    /**
 * hide：执行核心业务逻辑。
 * @returns void。
 */

    hide(): void {
      observeModalController.hide();
      this.clear();
    },    
    /**
 * show：执行核心业务逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns void。
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
 * render：执行核心业务逻辑。
 * @param targetX number 参数说明。
 * @param targetY number 参数说明。
 * @returns void。
 */

    render(targetX: number, targetY: number): void {
      render(targetX, targetY);
    },    
    /**
 * handleTileDetail：处理事件并驱动执行路径。
 * @param data NEXT_S2C_TileDetail 原始数据。
 * @returns void。
 */

    handleTileDetail(data: NEXT_S2C_TileDetail): void {
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
 * isOpen：执行状态校验并返回判断结果。
 * @returns boolean。
 */

    isOpen(): boolean {
      return !(options.observeModalEl?.classList.contains('hidden') ?? true);
    },
  };
}
