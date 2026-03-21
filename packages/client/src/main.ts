import { SocketManager } from './network/socket';
import { TextRenderer } from './renderer/text';
import { Camera } from './renderer/camera';
import { KeyboardInput } from './input/keyboard';
import { MouseInput } from './input/mouse';
import { LoginUI } from './ui/login';
import { HUD } from './ui/hud';
import { ChatUI } from './ui/chat';
import { SidePanel } from './ui/side-panel';
import { DebugPanel } from './ui/debug-panel';
import { AttrPanel } from './ui/panels/attr-panel';
import { InventoryPanel } from './ui/panels/inventory-panel';
import { EquipmentPanel } from './ui/panels/equipment-panel';
import { TechniquePanel } from './ui/panels/technique-panel';
import { QuestPanel } from './ui/panels/quest-panel';
import { ActionPanel } from './ui/panels/action-panel';
import { LootPanel } from './ui/panels/loot-panel';
import { SettingsPanel } from './ui/panels/settings-panel';
import { WorldPanel } from './ui/panels/world-panel';
import { FloatingTooltip } from './ui/floating-tooltip';
import { detailModalHost } from './ui/detail-modal-host';
import { adjustZoom, getDisplayRangeX, getDisplayRangeY, getZoom, updateDisplayMetrics } from './display';
import { hydrateTileCacheFromMemory, rememberVisibleTiles } from './map-memory';
import {
  ActionDef,
  computeAffectedCellsFromAnchor,
  Direction,
  encodeTileTargetRef,
  GameTimeState,
  GroundItemPileView,
  GridPoint,
  isPointInRange,
  MapMeta,
  manhattanDistance,
  PlayerState,
  RenderEntity,
  NUMERIC_SCALAR_STAT_KEYS,
  SkillDef,
  Tile,
  TileType,
  TechniqueState,
  VisibleTile,
  S2C_Init,
  S2C_Tick,
  TargetingGeometrySpec,
  TargetingShape,
  VisibleBuffState,
  VIEW_RADIUS,
  TechniqueRealm,
  getTileTraversalCost,
} from '@mud/shared';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const canvasHost = document.getElementById('game-stage') as HTMLElement;
const zoomInBtn = document.getElementById('zoom-in') as HTMLButtonElement | null;
const zoomOutBtn = document.getElementById('zoom-out') as HTMLButtonElement | null;
const zoomLevelEl = document.getElementById('zoom-level');
const tickRateEl = document.getElementById('map-tick-rate');
const currentTimeEl = document.getElementById('map-current-time');
const currentTimeValueEl = document.getElementById('map-current-time-value');
const currentTimePhaseEl = document.getElementById('map-current-time-phase');
const currentTimeHourAEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-a"]');
const currentTimeHourBEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="hour-b"]');
const currentTimeDotEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="dot"]');
const currentTimeMinAEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-a"]');
const currentTimeMinBEl = currentTimeValueEl?.querySelector<HTMLElement>('[data-time-part="min-b"]');
const tickRateValueEl = document.getElementById('map-tick-rate-value');
const tickRateIntEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="int"]');
const tickRateDotEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="dot"]');
const tickRateFracAEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-a"]');
const tickRateFracBEl = tickRateValueEl?.querySelector<HTMLElement>('[data-part="frac-b"]');

function renderTickRate(seconds: number) {
  const [integer, fraction] = seconds.toFixed(2).split('.');
  if (tickRateIntEl) tickRateIntEl.textContent = integer;
  if (tickRateDotEl) tickRateDotEl.textContent = '.';
  if (tickRateFracAEl) tickRateFracAEl.textContent = fraction[0] ?? '0';
  if (tickRateFracBEl) tickRateFracBEl.textContent = fraction[1] ?? '0';
}

function renderCurrentTime(state: GameTimeState | null) {
  const totalMinutes = state
    ? Math.floor((state.localTicks / Math.max(1, state.dayLength)) * 24 * 60)
    : null;
  const hours = totalMinutes === null ? '--' : String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const minutes = totalMinutes === null ? '--' : String(totalMinutes % 60).padStart(2, '0');
  if (currentTimeHourAEl) currentTimeHourAEl.textContent = hours[0] ?? '-';
  if (currentTimeHourBEl) currentTimeHourBEl.textContent = hours[1] ?? '-';
  if (currentTimeDotEl) currentTimeDotEl.textContent = ':';
  if (currentTimeMinAEl) currentTimeMinAEl.textContent = minutes[0] ?? '-';
  if (currentTimeMinBEl) currentTimeMinBEl.textContent = minutes[1] ?? '-';
  if (currentTimePhaseEl) currentTimePhaseEl.textContent = state?.phaseLabel ?? '未明';
  if (currentTimeEl) {
    currentTimeEl.setAttribute('title', state ? `${state.phaseLabel} ${hours}:${minutes}` : '当前时间未同步');
  }
}

renderTickRate(1);
renderCurrentTime(null);
const socket = new SocketManager();
const camera = new Camera();
const renderer = new TextRenderer();
const loginUI = new LoginUI(socket);
const hud = new HUD();
const chatUI = new ChatUI();
const mouseInput = new MouseInput();
const debugPanel = new DebugPanel();

// 修仙系统面板
const sidePanel = new SidePanel();
const attrPanel = new AttrPanel();
const inventoryPanel = new InventoryPanel();
const equipmentPanel = new EquipmentPanel();
const techniquePanel = new TechniquePanel();
const questPanel = new QuestPanel();
const actionPanel = new ActionPanel();
const lootPanel = new LootPanel();
const worldPanel = new WorldPanel();
const settingsPanel = new SettingsPanel();
const targetingBadgeEl = document.getElementById('map-targeting-indicator');
const observeModalEl = document.getElementById('observe-modal');
const observeModalBodyEl = document.getElementById('observe-modal-body');
const observeModalSubtitleEl = document.getElementById('observe-modal-subtitle');
const observeBuffTooltip = new FloatingTooltip();
const senseQiTooltip = new FloatingTooltip();
let pendingTargetedAction: {
  actionId: string;
  actionName: string;
  targetMode?: string;
  range: number;
  shape?: TargetingShape;
  radius?: number;
  maxTargets?: number;
  hoverX?: number;
  hoverY?: number;
} | null = null;
let hoveredMapTile: {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
} | null = null;

const TILE_TYPE_NAMES: Record<TileType, string> = {
  [TileType.Floor]: '地面',
  [TileType.Road]: '大路',
  [TileType.Trail]: '小路',
  [TileType.Wall]: '墙体',
  [TileType.Door]: '门扉',
  [TileType.Portal]: '传送阵',
  [TileType.Stairs]: '楼梯',
  [TileType.Grass]: '草地',
  [TileType.Hill]: '山地',
  [TileType.Mud]: '泥地',
  [TileType.Swamp]: '沼泽',
  [TileType.Water]: '水域',
  [TileType.Tree]: '树木',
  [TileType.Stone]: '岩石',
};

function getTileTypeName(type: TileType): string {
  return TILE_TYPE_NAMES[type] ?? '未知地貌';
}

const ENTITY_KIND_NAMES: Record<string, string> = {
  player: '修士',
  monster: '妖兽',
  npc: '人物',
  container: '容器',
};

const ATTR_LABELS = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
} as const;

const NUMERIC_STAT_LABELS: Partial<Record<(typeof NUMERIC_SCALAR_STAT_KEYS)[number], string>> = {
  maxHp: '最大生命',
  maxQi: '最大灵力',
  physAtk: '物理攻击',
  spellAtk: '法术攻击',
  physDef: '物理防御',
  spellDef: '法术防御',
  hit: '命中',
  dodge: '闪避',
  crit: '暴击',
  critDamage: '暴击伤害',
  breakPower: '破招',
  resolvePower: '化解',
  maxQiOutputPerTick: '灵力输出',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '灵耗减免',
  auraPowerRate: '术法增幅',
  playerExpRate: '角色经验',
  techniqueExpRate: '功法经验',
  realmExpPerTick: '每息境界经验',
  techniqueExpPerTick: '每息功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  viewRange: '视野',
  moveSpeed: '移动速度',
};

type ObservedEntity = {
  id: string;
  wx: number;
  wy: number;
  char: string;
  color: string;
  name?: string;
  kind?: string;
  hp?: number;
  maxHp?: number;
  qi?: number;
  maxQi?: number;
  npcQuestMarker?: RenderEntity['npcQuestMarker'];
  observation?: RenderEntity['observation'];
  buffs?: VisibleBuffState[];
};

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function openBreakthroughModal() {
  const preview = myPlayer?.realm?.breakthrough;
  const currentRealm = myPlayer?.realm;
  if (!preview || !currentRealm) {
    showToast('当前境界尚未圆满，暂时不能突破');
    return;
  }

  const hasConsumableRequirements = preview.requirements.some((requirement) => requirement.type === 'item');
  const requirementRows = preview.requirements.length > 0
    ? preview.requirements.map((requirement) => `
      <div class="action-item">
        <div class="action-copy">
          <div>
            <span class="action-name">${escapeHtml(requirement.label)}</span>
            <span class="action-type">[${requirement.blocksBreakthrough === false ? (requirement.completed ? '已生效' : '未生效') : (requirement.completed ? '已达成' : '未达成')}]</span>
          </div>
          <div class="action-desc">${escapeHtml(requirement.hidden
            ? '该要求尚未解锁，只能通过主线或支线任务逐步获知。'
            : (requirement.detail ?? (requirement.completed ? '当前已满足。' : '当前尚未满足。')))}</div>
        </div>
      </div>
    `).join('')
    : '<div class="empty-hint">当前无额外突破要求。</div>';

  detailModalHost.open({
    ownerId: 'realm:breakthrough',
    title: `突破至 ${preview.targetDisplayName}`,
    subtitle: `${currentRealm.displayName} · 核心要求 ${preview.completedBlockingRequirements}/${preview.blockingRequirements}`,
    hint: preview.canBreakthrough
      ? (hasConsumableRequirements ? '含材料减免项，已生效的材料会在突破后消耗' : '点击空白处关闭')
      : (hasConsumableRequirements ? '材料和功法减免项都是可选的；未生效时会保留更高的基础属性要求' : '未达成的隐藏条件需通过任务逐步解锁'),
    bodyHtml: `
      <div class="panel-section">
        <div class="panel-section-title">突破要求</div>
        ${requirementRows}
      </div>
      ${hasConsumableRequirements ? `
        <div class="panel-section">
          <div class="empty-hint">提示：材料和功法减免项不会卡死突破；只要减免后的属性要求满足即可。已生效的材料会在突破成功后直接消耗。</div>
        </div>
      ` : ''}
      <div class="tech-modal-actions">
        <button class="small-btn" type="button" data-breakthrough-confirm ${preview.canBreakthrough ? '' : 'disabled'}>确认突破</button>
      </div>
    `,
    onAfterRender: (body) => {
      body.querySelector<HTMLElement>('[data-breakthrough-confirm]')?.addEventListener('click', () => {
        detailModalHost.close('realm:breakthrough');
        socket.sendAction('realm:breakthrough');
      });
    },
  });
}

hud.setCallbacks(() => {
  cancelTargeting();
  hideObserveModal();
  openBreakthroughModal();
});

function syncTargetingOverlay() {
  if (!myPlayer || !pendingTargetedAction) {
    renderer.setTargetingOverlay(null);
    targetingBadgeEl?.classList.add('hidden');
    syncSenseQiOverlay();
    return;
  }
  const affectedCells = computeAffectedCells(pendingTargetedAction);
  renderer.setTargetingOverlay({
    originX: myPlayer.x,
    originY: myPlayer.y,
    range: pendingTargetedAction.range,
    shape: pendingTargetedAction.shape,
    radius: pendingTargetedAction.radius,
    affectedCells,
    hoverX: pendingTargetedAction.hoverX,
    hoverY: pendingTargetedAction.hoverY,
  });
  if (targetingBadgeEl) {
    const rangeLabel = pendingTargetedAction.actionId === 'client:observe' ? `视野 ${pendingTargetedAction.range}` : `射程 ${pendingTargetedAction.range}`;
    const shapeLabel = pendingTargetedAction.shape === 'line'
      ? ` · 直线${pendingTargetedAction.maxTargets ? ` ${pendingTargetedAction.maxTargets}目标` : ''}`
      : pendingTargetedAction.shape === 'area'
        ? ` · 范围半径 ${Math.max(0, pendingTargetedAction.radius ?? 1)}${pendingTargetedAction.maxTargets ? ` · 最多 ${pendingTargetedAction.maxTargets} 目标` : ''}`
        : '';
    targetingBadgeEl.textContent = `选定 ${pendingTargetedAction.actionName} 目标 · ${rangeLabel}${shapeLabel}`;
    targetingBadgeEl.classList.remove('hidden');
  }
  syncSenseQiOverlay();
}

function cancelTargeting(showMessage = false) {
  if (!pendingTargetedAction) return;
  pendingTargetedAction = null;
  syncTargetingOverlay();
  if (showMessage) {
    showToast('已取消目标选择');
  }
}

function getSkillDefByActionId(actionId: string): SkillDef | null {
  if (!myPlayer) return null;
  for (const technique of myPlayer.techniques) {
    const skill = technique.skills.find((entry) => entry.id === actionId);
    if (skill) {
      return skill;
    }
  }
  return null;
}

function beginTargeting(actionId: string, actionName: string, targetMode?: string, range = 1) {
  if (pendingTargetedAction?.actionId === actionId) {
    cancelTargeting(true);
    return;
  }
  const skill = getSkillDefByActionId(actionId);
  pendingTargetedAction = {
    actionId,
    actionName,
    targetMode,
    range: Math.max(1, range),
    shape: skill?.targeting?.shape ?? 'single',
    radius: skill?.targeting?.radius,
    maxTargets: skill?.targeting?.maxTargets,
  };
  syncTargetingOverlay();
  if (actionId === 'client:observe') {
    showToast('请选择当前视野内的目标格，Esc 或右键取消');
    return;
  }
  showToast(`请选择 ${Math.max(1, range)} 格内目标，Esc 或右键取消`);
}

function computeAffectedCells(action: NonNullable<typeof pendingTargetedAction>): Array<{ x: number; y: number }> {
  if (action.hoverX === undefined || action.hoverY === undefined) {
    return [];
  }
  return computeAffectedCellsForAction(action, { x: action.hoverX, y: action.hoverY });
}

function computeAffectedCellsForAction(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'range' | 'shape' | 'radius'>,
  anchor: GridPoint,
): GridPoint[] {
  if (!myPlayer) {
    return [];
  }
  const spec: TargetingGeometrySpec = {
    range: action.range,
    shape: action.shape,
    radius: action.radius,
  };
  return computeAffectedCellsFromAnchor({ x: myPlayer.x, y: myPlayer.y }, anchor, spec);
}

function resolveTargetRefForAction(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'shape' | 'targetMode'>,
  target: { x: number; y: number; entityId?: string; entityKind?: string },
): string | null {
  const entityTargetRef = target.entityKind === 'player' && target.entityId
    ? `player:${target.entityId}`
    : target.entityKind === 'monster' && target.entityId
      ? target.entityId
      : null;
  if (action.shape && action.shape !== 'single') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
  if (action.targetMode === 'entity') {
    return entityTargetRef;
  }
  if (action.targetMode === 'tile') {
    return encodeTileTargetRef({ x: target.x, y: target.y });
  }
  if (entityTargetRef) {
    return entityTargetRef;
  }
  return encodeTileTargetRef({ x: target.x, y: target.y });
}

function hasAffectableTargetInArea(
  action: Pick<NonNullable<typeof pendingTargetedAction>, 'shape' | 'range' | 'radius'>,
  anchorX: number,
  anchorY: number,
): boolean {
  if (!action.shape || action.shape === 'single') {
    return true;
  }
  const affectedCells = computeAffectedCellsForAction(action, { x: anchorX, y: anchorY });
  if (affectedCells.length === 0) {
    return false;
  }
  return affectedCells.some((cell) => {
    const hasMonster = latestEntities.some((entity) => entity.kind === 'monster' && entity.wx === cell.x && entity.wy === cell.y);
    const hasPlayer = latestEntities.some((entity) => entity.kind === 'player' && entity.wx === cell.x && entity.wy === cell.y);
    if (hasMonster || hasPlayer) {
      return true;
    }
    const tile = getVisibleTileAt(cell.x, cell.y);
    return Boolean(tile?.hp && tile.hp > 0 && tile.maxHp && tile.maxHp > 0);
  });
}

function getTileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function getVisibleTileAt(x: number, y: number): Tile | null {
  const key = getTileKey(x, y);
  if (!currentVisibleTiles.has(key)) return null;
  return tileCache.get(key) ?? null;
}

function getKnownTileAt(x: number, y: number): Tile | null {
  return tileCache.get(getTileKey(x, y)) ?? null;
}

function getVisibleGroundPileAt(x: number, y: number): GroundItemPileView | null {
  return visibleGroundPiles.get(getTileKey(x, y)) ?? null;
}

function syncSenseQiOverlay(): void {
  if (!myPlayer?.senseQiActive) {
    renderer.setSenseQiOverlay(null);
    senseQiTooltip.hide();
    return;
  }

  renderer.setSenseQiOverlay({
    hoverX: hoveredMapTile?.x,
    hoverY: hoveredMapTile?.y,
  });

  if (pendingTargetedAction || !hoveredMapTile) {
    senseQiTooltip.hide();
    return;
  }

  const tile = getVisibleTileAt(hoveredMapTile.x, hoveredMapTile.y);
  if (!tile) {
    senseQiTooltip.hide();
    return;
  }

  senseQiTooltip.show(
    '感气视角',
    [
      `坐标 (${hoveredMapTile.x}, ${hoveredMapTile.y})`,
      `灵气 ${Math.max(0, Math.floor(tile.aura ?? 0))}`,
    ],
    hoveredMapTile.clientX,
    hoveredMapTile.clientY,
  );
}

function isWithinDisplayedMemoryBounds(x: number, y: number): boolean {
  if (!myPlayer) {
    return false;
  }
  return Math.abs(x - myPlayer.x) <= getDisplayRangeX() && Math.abs(y - myPlayer.y) <= getDisplayRangeY();
}

function hideObserveModal(): void {
  observeBuffTooltip.hide();
  observeModalEl?.classList.add('hidden');
  observeModalEl?.setAttribute('aria-hidden', 'true');
}

function buildObservationRows(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map((row) => `<div class="observe-modal-row"><span class="observe-modal-label">${escapeHtml(row.label)}</span><span class="observe-modal-value">${escapeHtml(row.value)}</span></div>`)
    .join('');
}

function formatCurrentMax(current?: number, max?: number): string {
  if (typeof current !== 'number' || typeof max !== 'number') {
    return '未明';
  }
  return `${Math.max(0, Math.round(current))} / ${Math.max(0, Math.round(max))}`;
}

function formatBuffDuration(buff: VisibleBuffState): string {
  return `${Math.max(0, Math.round(buff.remainingTicks))} / ${Math.max(1, Math.round(buff.duration))} 息`;
}

function formatSignedValue(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
}

function buildBuffEffectLines(buff: VisibleBuffState): string[] {
  const lines: string[] = [];
  if (buff.attrs) {
    for (const [key, value] of Object.entries(buff.attrs)) {
      if (typeof value !== 'number' || value === 0) continue;
      const label = ATTR_LABELS[key as keyof typeof ATTR_LABELS] ?? key;
      lines.push(`${label} ${formatSignedValue(value)}`);
    }
  }
  if (buff.stats) {
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const value = buff.stats[key];
      if (typeof value !== 'number' || value === 0) continue;
      lines.push(`${NUMERIC_STAT_LABELS[key] ?? key} ${formatSignedValue(value)}`);
    }
    if (buff.stats.elementDamageBonus) {
      for (const [key, value] of Object.entries(buff.stats.elementDamageBonus)) {
        if (typeof value !== 'number' || value === 0) continue;
        lines.push(`${key}行增伤 ${formatSignedValue(value)}`);
      }
    }
    if (buff.stats.elementDamageReduce) {
      for (const [key, value] of Object.entries(buff.stats.elementDamageReduce)) {
        if (typeof value !== 'number' || value === 0) continue;
        lines.push(`${key}行减伤 ${formatSignedValue(value)}`);
      }
    }
  }
  return lines;
}

function buildBuffTooltipLines(buff: VisibleBuffState): string[] {
  const lines = [
    `类别：${buff.category === 'debuff' ? '减益' : '增益'}`,
    `剩余：${formatBuffDuration(buff)}`,
  ];
  if (buff.maxStacks > 1) {
    lines.push(`层数：${buff.stacks} / ${buff.maxStacks}`);
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

function buildBuffBadgeHtml(buff: VisibleBuffState): string {
  const title = escapeHtml(buff.name);
  const detail = escapeHtml(buildBuffTooltipLines(buff).join('\n'));
  const stackText = buff.maxStacks > 1 ? `<span class="observe-buff-stack">${buff.stacks}</span>` : '';
  const className = buff.category === 'debuff' ? 'observe-buff-chip debuff' : 'observe-buff-chip buff';
  return `<button class="${className}"
    type="button"
    data-buff-tooltip-title="${title}"
    data-buff-tooltip-detail="${detail}">
    <span class="observe-buff-mark">${escapeHtml(buff.shortMark)}</span>
    <span class="observe-buff-name">${escapeHtml(buff.name)}</span>
    <span class="observe-buff-duration">${escapeHtml(formatBuffDuration(buff))}</span>
    ${stackText}
  </button>`;
}

function buildBuffSectionHtml(title: string, buffs: VisibleBuffState[], emptyText: string): string {
  return `<section class="observe-buff-section">
    <div class="observe-buff-title">${escapeHtml(title)}</div>
    ${buffs.length > 0
      ? `<div class="observe-buff-list">${buffs.map((buff) => buildBuffBadgeHtml(buff)).join('')}</div>`
      : `<div class="observe-entity-empty">${escapeHtml(emptyText)}</div>`}
  </section>`;
}

function toObservedEntity(entity: RenderEntity): ObservedEntity {
  return {
    id: entity.id,
    wx: entity.x,
    wy: entity.y,
    char: entity.char,
    color: entity.color,
    name: entity.name,
    kind: entity.kind,
    hp: entity.hp,
    maxHp: entity.maxHp,
    qi: entity.qi,
    maxQi: entity.maxQi,
    npcQuestMarker: entity.npcQuestMarker,
    observation: entity.observation,
    buffs: entity.buffs,
  };
}

function formatTraversalCost(tile: Tile): string {
  if (!tile.walkable) {
    return '无法通行';
  }
  const cost = getTileTraversalCost(tile.type);
  return `${cost} 点/格`;
}

function buildObservedEntityCardHtml(entity: ObservedEntity): string {
  const shouldAlwaysShowVitals = entity.kind === 'monster' || entity.kind === 'npc';
  const vitalRows = shouldAlwaysShowVitals
    ? [
        { label: '生命', value: formatCurrentMax(entity.hp, entity.maxHp) },
        { label: '灵力', value: formatCurrentMax(entity.qi, entity.maxQi) },
      ]
    : [];
  const detailRows = entity.observation?.lines ?? [];
  const detailGrid = [...vitalRows, ...detailRows];
  const visibleBuffs = entity.buffs ?? [];
  const publicBuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'buff');
  const publicDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'public' && buff.category === 'debuff');
  const observeOnlyBuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'buff');
  const observeOnlyDebuffs = visibleBuffs.filter((buff) => buff.visibility === 'observe_only' && buff.category === 'debuff');
  const buffSection = `<div class="observe-buff-columns">
    ${buildBuffSectionHtml('增益状态', [...publicBuffs, ...observeOnlyBuffs], '当前未见明显增益状态')}
    ${buildBuffSectionHtml('减益状态', [...publicDebuffs, ...observeOnlyDebuffs], '当前未见明显减益状态')}
  </div>`;
  return `<div class="observe-entity-card">
    <div class="observe-entity-head">
      <span class="observe-entity-name">${escapeHtml(entity.name ?? entity.id)}</span>
      <span class="observe-entity-kind">${escapeHtml(ENTITY_KIND_NAMES[entity.kind ?? ''] ?? '未知')}</span>
    </div>
    <div class="observe-entity-verdict">${escapeHtml(entity.observation?.verdict ?? '神识轻拂而过，未得更多回响。')}</div>
    ${detailGrid.length > 0
      ? `<div class="observe-entity-grid">${buildObservationRows(detailGrid)}</div>`
      : '<div class="observe-entity-empty">此身气机尽藏，暂未看出更多端倪。</div>'}
    ${buffSection}
  </div>`;
}

function buildObservedEntitySectionHtml(entities: ObservedEntity[]): string {
  return `<section class="observe-modal-section">
    <div class="observe-modal-section-title">角色信息</div>
    ${entities.length > 0
      ? `<div class="observe-entity-list">${entities.map((entity) => buildObservedEntityCardHtml(entity)).join('')}</div>`
      : '<div class="observe-entity-empty">该地块当前没有角色、怪物或 NPC。</div>'}
  </section>`;
}

function bindObserveBuffTooltips(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-buff-tooltip-title]').forEach((node) => {
    const title = node.dataset.buffTooltipTitle ?? '';
    const detail = node.dataset.buffTooltipDetail ?? '';
    const lines = detail.split('\n').filter(Boolean);
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

function showObserveModal(targetX: number, targetY: number): void {
  const tile = getVisibleTileAt(targetX, targetY);
  if (!tile) {
    showToast('只能观察当前视野内的格子');
    return;
  }

  const groundPile = getVisibleGroundPileAt(targetX, targetY);
  const entities = latestEntities.filter((entity) => entity.wx === targetX && entity.wy === targetY);
  const sortedEntities = [...entities].sort((left, right) => {
    const order = (kind?: string): number => (kind === 'player' ? 0 : kind === 'container' ? 1 : kind === 'npc' ? 2 : kind === 'monster' ? 3 : 4);
    return order(left.kind) - order(right.kind);
  });
  const terrainRows = [
    { label: '地貌', value: getTileTypeName(tile.type) },
    { label: '灵气', value: `${Math.max(0, Math.floor(tile.aura ?? 0))}` },
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
  if (entities.length > 0) {
    terrainRows.push({ label: '驻足气息', value: entities.map((entity) => entity.name ?? ENTITY_KIND_NAMES[entity.kind ?? ''] ?? entity.id).join('、') });
  } else if (tile.occupiedBy) {
    terrainRows.push({ label: '驻足气息', value: '此地留有生灵立身之痕' });
  }
  if (tile.modifiedAt) {
    terrainRows.push({ label: '最近变动', value: '此地近期发生过变化' });
  }

  if (observeModalSubtitleEl) {
    observeModalSubtitleEl.textContent = `坐标 (${targetX}, ${targetY})`;
  }
  if (observeModalBodyEl) {
    const groundHtml = groundPile && groundPile.items.length > 0
      ? `<div class="observe-entity-list">${groundPile.items.map((entry) => `
          <div class="observe-modal-row">
            <span class="observe-modal-label">${escapeHtml(entry.name)}</span>
            <span class="observe-modal-value">x${entry.count}</span>
          </div>
        `).join('')}</div>`
      : '<div class="observe-entity-empty">该地块当前没有可见地面物品。</div>';
    observeModalBodyEl.innerHTML = `
      <div class="observe-modal-top">
        <section class="observe-modal-section">
          <div class="observe-modal-section-title">地块信息</div>
          <div class="observe-modal-grid">${buildObservationRows(terrainRows)}</div>
        </section>
        <section class="observe-modal-section">
          <div class="observe-modal-section-title">地面物品</div>
          ${groundHtml}
        </section>
      </div>
      ${buildObservedEntitySectionHtml(sortedEntities)}
    `;
    bindObserveBuffTooltips(observeModalBodyEl);
  }
  observeModalEl?.classList.remove('hidden');
  observeModalEl?.setAttribute('aria-hidden', 'false');
}

// 面板回调绑定
inventoryPanel.setCallbacks(
  (slotIndex) => socket.sendUseItem(slotIndex),
  (slotIndex, count) => socket.sendDropItem(slotIndex, count),
  (slotIndex) => socket.sendEquip(slotIndex),
  () => socket.sendSortInventory(),
);
lootPanel.setCallbacks((sourceId, itemKey) => {
  socket.sendTakeLoot(sourceId, itemKey);
});
equipmentPanel.setCallbacks(
  (slot) => socket.sendUnequip(slot),
);
techniquePanel.setCallbacks(
  (techId) => socket.sendCultivate(techId),
);
questPanel.setCallbacks((x, y) => {
  planPathTo({ x, y }, { ignoreVisibilityLimit: true, allowNearestReachable: true });
});
actionPanel.setCallbacks(
  (actionId, requiresTarget, targetMode, range, actionName) => {
    if (actionId === 'client:take') {
      beginTargeting(actionId, actionName ?? actionId, targetMode, range ?? 1);
      return;
    }
    if (actionId === 'realm:breakthrough') {
      cancelTargeting();
      hideObserveModal();
      openBreakthroughModal();
      return;
    }
    if (requiresTarget) {
      beginTargeting(actionId, actionName ?? actionId, targetMode, actionId === 'client:observe' ? getInfoRadius() : (range ?? 1));
      return;
    }
    cancelTargeting();
    hideObserveModal();
    socket.sendAction(actionId);
  },
  (skills) => {
    socket.sendUpdateAutoBattleSkills(skills);
  },
);
debugPanel.setCallbacks(() => {
  showToast('已发送回出生点请求');
  socket.sendDebugResetSpawn();
});
chatUI.setCallback((message) => socket.sendChat(message));
settingsPanel.setOptions({
  getCurrentDisplayName: () => myPlayer?.displayName ?? '',
  getCurrentRoleName: () => myPlayer?.name ?? '',
  onDisplayNameUpdated: (displayName) => {
    applyLocalDisplayName(displayName);
    showToast(`显示名称已改为 ${displayName}`);
  },
  onRoleNameUpdated: (roleName) => {
    applyLocalRoleName(roleName);
    showToast(`角色名称已改为 ${roleName}`);
  },
  onLogout: () => {
    detailModalHost.close('settings-panel');
    socket.disconnect();
    resetGameState();
    loginUI.logout('已退出登录');
  },
});
zoomInBtn?.addEventListener('click', () => {
  const previous = getZoom();
  const zoom = adjustZoom(1);
  refreshZoomChrome(zoom);
  if (zoom !== previous) {
    refreshZoomViewport();
    showToast(`缩放已切换为 ${zoom}x`);
  }
});
zoomOutBtn?.addEventListener('click', () => {
  const previous = getZoom();
  const zoom = adjustZoom(-1);
  refreshZoomChrome(zoom);
  if (zoom !== previous) {
    refreshZoomViewport();
    showToast(`缩放已切换为 ${zoom}x`);
  }
});

document.getElementById('hud-toggle-auto-battle')?.addEventListener('click', () => {
  socket.sendAction('toggle:auto_battle');
});
document.getElementById('hud-toggle-auto-retaliate')?.addEventListener('click', () => {
  socket.sendAction('toggle:auto_retaliate');
});
// S2C 更新回调
socket.onAttrUpdate((data) => {
  if (myPlayer) {
    myPlayer.baseAttrs = data.baseAttrs;
    myPlayer.bonuses = data.bonuses;
    myPlayer.finalAttrs = data.finalAttrs;
    myPlayer.numericStats = data.numericStats;
    myPlayer.ratioDivisors = data.ratioDivisors;
    myPlayer.maxHp = data.maxHp;
    myPlayer.qi = data.qi;
    myPlayer.viewRange = Math.max(1, Math.round(data.numericStats.viewRange || myPlayer.viewRange));
    myPlayer.realm = data.realm;
    myPlayer.realmName = data.realm?.name;
    myPlayer.realmStage = data.realm?.shortName;
    myPlayer.realmReview = data.realm?.review;
    myPlayer.breakthroughReady = data.realm?.breakthroughReady;
  }
  attrPanel.update(data);
  refreshHudChrome();
});
socket.onInventoryUpdate((data) => {
  if (myPlayer) myPlayer.inventory = data.inventory;
  inventoryPanel.update(data.inventory);
});
socket.onEquipmentUpdate((data) => {
  if (myPlayer) myPlayer.equipment = data.equipment;
  equipmentPanel.update(data.equipment);
});
socket.onTechniqueUpdate((data) => {
  const shouldRefreshTechniquePanel = !myPlayer
    || buildTechniqueRenderSignature(myPlayer.techniques, myPlayer.cultivatingTechId) !== buildTechniqueRenderSignature(data.techniques, data.cultivatingTechId);
  if (myPlayer) {
    myPlayer.techniques = data.techniques;
    myPlayer.cultivatingTechId = data.cultivatingTechId;
  }
  if (shouldRefreshTechniquePanel) {
    techniquePanel.update(data.techniques, data.cultivatingTechId, myPlayer ?? undefined);
    refreshUiChrome();
  }
});
socket.onActionsUpdate((data) => {
  const previousActions = myPlayer?.actions ?? [];
  const previousAutoBattle = myPlayer?.autoBattle ?? false;
  const previousAutoRetaliate = myPlayer?.autoRetaliate ?? true;
  const nextAutoBattle = data.autoBattle ?? myPlayer?.autoBattle ?? false;
  const nextAutoRetaliate = data.autoRetaliate ?? myPlayer?.autoRetaliate ?? true;
  const nextSenseQiActive = data.senseQiActive ?? myPlayer?.senseQiActive ?? false;
  const shouldRefreshActionPanel = !myPlayer
    || previousAutoBattle !== nextAutoBattle
    || previousAutoRetaliate !== nextAutoRetaliate
    || buildActionRenderSignature(previousActions) !== buildActionRenderSignature(data.actions);
  if (myPlayer) {
    myPlayer.actions = data.actions;
    myPlayer.autoBattleSkills = data.actions
      .filter((action) => action.type === 'skill')
      .map((action) => ({
        skillId: action.id,
        enabled: action.autoBattleEnabled !== false,
      }));
    myPlayer.autoBattle = data.autoBattle ?? inferAutoBattle(myPlayer.autoBattle, data.actions);
    myPlayer.autoRetaliate = data.autoRetaliate ?? inferAutoRetaliate(myPlayer.autoRetaliate !== false, data.actions);
    myPlayer.senseQiActive = nextSenseQiActive;
  }
  if (shouldRefreshActionPanel) {
    actionPanel.update(data.actions, nextAutoBattle, nextAutoRetaliate, myPlayer ?? undefined);
    refreshUiChrome();
  } else {
    actionPanel.syncDynamic(data.actions, nextAutoBattle, nextAutoRetaliate, myPlayer ?? undefined);
  }
  syncSenseQiOverlay();
});
socket.onLootWindowUpdate((data) => {
  lootPanel.update(data.window);
});
socket.onQuestUpdate((data) => {
  if (myPlayer) myPlayer.quests = data.quests;
  questPanel.setCurrentMapId(myPlayer?.mapId);
  questPanel.update(data.quests);
  refreshUiChrome();
});
socket.onSystemMsg((data) => {
  if (data.kind === 'chat') {
    chatUI.addMessage(data.text, data.from, data.kind);
    return;
  }
  if (data.kind === 'quest' || data.kind === 'combat' || data.kind === 'loot') {
    const label = data.from ?? (data.kind === 'quest' ? '任务' : data.kind === 'combat' ? '战斗' : '掉落');
    chatUI.addMessage(data.text, label, data.kind);
    if (data.kind === 'quest' || data.kind === 'loot') {
      showToast(data.text, data.kind);
    }
    return;
  }
  chatUI.addMessage(data.text, data.from ?? '系统', data.kind ?? 'system');
  showToast(data.text, data.kind ?? 'system');
});
socket.onError(async (data) => {
  if (data.code === 'AUTH_FAIL') {
    const restored = await loginUI.restoreSession();
    if (restored) return;
    resetGameState();
    loginUI.show('登录已失效，请重新登录');
    return;
  }
  showToast(data.message);
});
socket.onKick(() => {
  resetGameState();
  loginUI.logout('账号已在其他位置登录');
});
socket.onConnectError((message) => {
  if (socket.connected) return;
  if (loginUI.hasRefreshToken()) return;
  showToast(`连接失败: ${message}`);
});
socket.onDisconnect((reason) => {
  if (reason === 'io client disconnect') return;
  if (!myPlayer) return;
  showToast('连接已断开，正在等待重新登录或恢复');
});

let pathCells: { x: number; y: number }[] = [];
let pathTarget: { x: number; y: number } | null = null;

// 动画状态
let tickStartTime = performance.now();
let tickDuration = 1000;
let myPlayer: PlayerState | null = null;
let currentMapMeta: MapMeta | null = null;
let currentTimeState: GameTimeState | null = null;
let latestEntities: ObservedEntity[] = [];
let visibleGroundPiles = new Map<string, GroundItemPileView>();

// 视野中心平滑值（浮点格子坐标），无延迟快速 lerp
let viewCenterX = 0;
let viewCenterY = 0;
const VIEW_LERP_SPEED = 12;

// 世界地图缓存：key = "x,y" → Tile
const tileCache = new Map<string, Tile>();
const currentVisibleTiles = new Set<string>();

// 当前服务端发来的 tiles 及其 origin
let currentTiles: VisibleTile[][] = [];
let tileOriginX = 0;
let tileOriginY = 0;

const MAP_FALLBACK: Record<string, { danger: number; recommendedRealm: string }> = {
  spawn: { danger: 1, recommendedRealm: '锻体到后天' },
  bamboo_forest: { danger: 2, recommendedRealm: '后天到先天' },
  wildlands: { danger: 2, recommendedRealm: '后天到先天' },
  black_iron_mine: { danger: 3, recommendedRealm: '先天到练气前夜' },
  ancient_ruins: { danger: 3, recommendedRealm: '先天圆熟到练气启蒙' },
  beast_valley: { danger: 5, recommendedRealm: '练气期' },
  spirit_ridge: { danger: 4, recommendedRealm: '先天到练气' },
  sky_ruins: { danger: 5, recommendedRealm: '练气到筑基' },
};

function showToast(message: string, kind: 'system' | 'chat' | 'quest' | 'combat' | 'loot' = 'system') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast-kind-${kind}`;
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.add('show');
  window.setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, 2500);
}

function refreshZoomChrome(zoom = getZoom()) {
  if (zoomLevelEl) {
    zoomLevelEl.innerHTML = `<span>x</span><span>${zoom}</span>`;
  }
}

function refreshZoomViewport() {
  syncDisplayMetrics();
  if (myPlayer) {
    camera.snap(myPlayer);
  }
  renderer.updateEntities(latestEntities);
}

function inferAutoBattle(current: boolean, actions: { id: string; name: string; desc: string }[]): boolean {
  const toggle = actions.find(a => a.id.includes('auto') && (a.id.includes('battle') || a.name.includes('自动战斗') || a.desc.includes('自动战斗')));
  if (!toggle) return current;
  if (toggle.name.includes('关闭')) return true;
  if (toggle.name.includes('开启')) return false;
  if (toggle.desc.includes('已开启')) return true;
  if (toggle.desc.includes('已关闭')) return false;
  return current;
}

function buildActionRenderSignature(actions: ActionDef[]): string {
  return JSON.stringify(actions.map((action) => ({
    id: action.id,
    name: action.name,
    desc: action.desc,
    type: action.type,
    range: action.range,
    requiresTarget: action.requiresTarget,
    targetMode: action.targetMode,
    autoBattleEnabled: action.autoBattleEnabled,
    autoBattleOrder: action.autoBattleOrder,
  })));
}

function buildTechniqueRenderSignature(techniques: TechniqueState[], cultivatingTechId?: string): string {
  return JSON.stringify({
    cultivatingTechId: cultivatingTechId ?? null,
    techniques: techniques.map((technique) => ({
      techId: technique.techId,
      name: technique.name,
      level: technique.level,
      exp: technique.exp,
      expToNext: technique.expToNext,
      realm: technique.realm,
      skills: technique.skills.map((skill) => skill.id),
    })),
  });
}

function resolveMapDanger(): string {
  const fallback = myPlayer ? MAP_FALLBACK[myPlayer.mapId] : undefined;
  const danger = currentMapMeta?.dangerLevel ?? fallback?.danger;
  return danger ? `危 ${danger}/5` : '未知';
}

function resolveRealmLabel(player: PlayerState): string {
  if (player.realmName) {
    return player.realmStage ? `${player.realmName} · ${player.realmStage}` : player.realmName;
  }
  const top = [...player.techniques].sort((a, b) => b.realm - a.realm)[0];
  if (!top) return '凡俗武者';
  const labels: Record<TechniqueRealm, string> = {
    [TechniqueRealm.Entry]: '武学入门',
    [TechniqueRealm.Minor]: '后天圆熟',
    [TechniqueRealm.Major]: '先天凝意',
    [TechniqueRealm.Perfection]: '半步修真',
  };
  return labels[top.realm] ?? '修行中';
}

function resolveTitleLabel(player: PlayerState): string {
  if (player.realm?.path === 'immortal') {
    return player.realm.shortName === '筑基' ? '云游真修' : '初登仙门';
  }
  const top = [...player.techniques].sort((a, b) => b.level - a.level)[0];
  if (!top) return '无名后学';
  if (top.realm >= TechniqueRealm.Perfection) return '名动一方';
  if (top.realm >= TechniqueRealm.Major) return '先天气成';
  if (top.realm >= TechniqueRealm.Minor) return '游历武者';
  return '见习弟子';
}

function resolveObjectiveLabel(player: PlayerState): string {
  const ready = player.quests.find((entry) => entry.status === 'ready');
  if (ready) return `交付 ${ready.title}`;
  const active = player.quests.find((entry) => entry.status === 'active');
  return active ? `${active.targetName} ${active.progress}/${active.required}` : '暂无主目标';
}

function resolveThreatLabel(player: PlayerState): string {
  const monsters = latestEntities
    .filter((entity) => entity.kind === 'monster')
    .map((entity) => manhattanDistance({ x: entity.wx, y: entity.wy }, player));
  if (monsters.length === 0) return '平稳';
  const nearest = Math.min(...monsters);
  if (nearest <= 2) return '近身威胁';
  if (nearest <= 5) return '附近有敌';
  return '远处异动';
}

function refreshUiChrome() {
  refreshHudChrome();
  if (!myPlayer) return;
  if (shouldPauseWorldPanelRefresh()) {
    return;
  }
  worldPanel.update({
    player: myPlayer,
    mapMeta: currentMapMeta,
    entities: latestEntities,
    actions: myPlayer.actions,
    quests: myPlayer.quests,
  });
}

function refreshHudChrome() {
  if (!myPlayer) return;
  hud.update(myPlayer, {
    mapName: currentMapMeta?.name ?? myPlayer.mapId,
    mapDanger: resolveMapDanger(),
    realmLabel: myPlayer.realm?.displayName ?? resolveRealmLabel(myPlayer),
    realmReviewLabel: myPlayer.realm?.review ?? myPlayer.realmReview,
    objectiveLabel: resolveObjectiveLabel(myPlayer),
    threatLabel: resolveThreatLabel(myPlayer),
    titleLabel: resolveTitleLabel(myPlayer),
  });
}

function hasSelectionWithin(root: HTMLElement | null): boolean {
  if (!root) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return !!anchor && !!focus && root.contains(anchor) && root.contains(focus);
}

function shouldPauseWorldPanelRefresh(): boolean {
  return hasSelectionWithin(document.getElementById('layout-center'));
}

function inferAutoRetaliate(current: boolean, actions: { id: string; name: string; desc: string }[]): boolean {
  const toggle = actions.find(a => a.id.includes('auto_retaliate') || a.name.includes('受击'));
  if (!toggle) return current;
  if (toggle.name.includes('不开战')) return false;
  if (toggle.name.includes('自动开战')) return true;
  if (toggle.desc.includes('不会自动')) return false;
  if (toggle.desc.includes('自动开启')) return true;
  return current;
}

function getInfoRadius(): number {
  return currentTimeState?.effectiveViewRange ?? myPlayer?.viewRange ?? VIEW_RADIUS;
}

function syncDisplayMetrics(): void {
  const baseRadius = myPlayer?.viewRange ?? VIEW_RADIUS;
  updateDisplayMetrics(canvas.width, canvas.height, baseRadius);
}

function clearCurrentPath() {
  pathCells = [];
  pathTarget = null;
}

function sendMoveCommand(dir: Direction) {
  if (!myPlayer) return;
  clearCurrentPath();
  myPlayer.facing = dir;
  socket.sendMove(dir);
}

function planPathTo(target: { x: number; y: number }, options?: { ignoreVisibilityLimit?: boolean; allowNearestReachable?: boolean }) {
  if (!myPlayer) return;
  pathTarget = target;
  pathCells = [{ x: target.x, y: target.y }];
  socket.sendMoveTo(target.x, target.y, options);
}

function resetGameState() {
  myPlayer = null;
  currentMapMeta = null;
  currentTimeState = null;
  renderCurrentTime(null);
  clearCurrentPath();
  currentTiles = [];
  tileOriginX = 0;
  tileOriginY = 0;
  tileCache.clear();
  currentVisibleTiles.clear();
  visibleGroundPiles.clear();
  pendingTargetedAction = null;
  hoveredMapTile = null;
  hideObserveModal();
  syncTargetingOverlay();
  sidePanel.hide();
  chatUI.hide();
  chatUI.clear();
  debugPanel.hide();
  attrPanel.clear();
  inventoryPanel.clear();
  equipmentPanel.clear();
  techniquePanel.clear();
  questPanel.clear();
  actionPanel.clear();
  lootPanel.clear();
  worldPanel.clear();
  resizeCanvas();
  document.getElementById('hud')?.classList.add('hidden');
}

function applyLocalDisplayName(displayName: string) {
  if (!myPlayer) {
    return;
  }
  myPlayer.displayName = displayName;
  latestEntities = latestEntities.map((entity) => {
    if (entity.id !== myPlayer?.id) {
      return entity;
    }
    return {
      ...entity,
      char: [...displayName][0] ?? entity.char,
    };
  });
  renderer.updateEntities(latestEntities);
  refreshHudChrome();
}

function applyLocalRoleName(roleName: string) {
  if (!myPlayer) {
    return;
  }
  myPlayer.name = roleName;
  latestEntities = latestEntities.map((entity) => {
    if (entity.id !== myPlayer?.id) {
      return entity;
    }
    return {
      ...entity,
      name: roleName,
    };
  });
  renderer.updateEntities(latestEntities);
  refreshHudChrome();
}

/** 将服务端发来的 tiles 写入缓存 */
function cacheTiles(mapId: string, tiles: VisibleTile[][], originX: number, originY: number) {
  currentVisibleTiles.clear();
  rememberVisibleTiles(mapId, tiles, originX, originY);
  for (let r = 0; r < tiles.length; r++) {
    for (let c = 0; c < tiles[r].length; c++) {
      const tile = tiles[r][c];
      const key = `${originX + c},${originY + r}`;
      if (!tile) continue;
      currentVisibleTiles.add(key);
      tileCache.set(key, tile);
    }
  }
}

// 键盘输入
const keyboard = new KeyboardInput((dirs: Direction[]) => {
  clearCurrentPath();
  if (dirs.length > 0) {
    sendMoveCommand(dirs[0]);
  }
});

renderer.init(canvas);
sidePanel.setVisibilityChangeCallback((visible) => {
  if (visible) {
    requestAnimationFrame(() => resizeCanvas());
  }
});

function resizeCanvas() {
  const rect = canvasHost.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.width = width;
  canvas.height = height;
  syncDisplayMetrics();
}
resizeCanvas();
refreshZoomChrome();
window.addEventListener('resize', resizeCanvas);
window.addEventListener('contextmenu', (event) => {
  if (pendingTargetedAction) {
    event.preventDefault();
    cancelTargeting(true);
    return;
  }
  event.preventDefault();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !(observeModalEl?.classList.contains('hidden') ?? true)) {
    hideObserveModal();
    return;
  }
  if (event.key === 'Escape' && pendingTargetedAction) {
    cancelTargeting(true);
  }
});

observeModalEl?.addEventListener('click', () => {
  hideObserveModal();
});

// 鼠标输入
mouseInput.init(
  canvas,
  () => camera,
  (x, y) => getKnownTileAt(x, y),
  () => latestEntities,
  () => currentMapMeta,
  (target) => {
    if (pendingTargetedAction) {
      if (pendingTargetedAction.actionId === 'client:observe') {
        if (!getVisibleTileAt(target.x, target.y)) {
          showToast('只能观察当前视野内的格子');
          return;
        }
        showObserveModal(target.x, target.y);
        cancelTargeting();
        return;
      }
      if (pendingTargetedAction.actionId === 'client:take') {
        if (!myPlayer || !isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
          showToast(`超出拿取范围，最多 ${pendingTargetedAction.range} 格`);
          return;
        }
        socket.sendAction('loot:open', encodeTileTargetRef({ x: target.x, y: target.y }));
        cancelTargeting();
        return;
      }
      if (!myPlayer || !isPointInRange({ x: myPlayer.x, y: myPlayer.y }, { x: target.x, y: target.y }, pendingTargetedAction.range)) {
        showToast(`超出施法范围，最多 ${pendingTargetedAction.range} 格`);
        return;
      }
      if (!hasAffectableTargetInArea(pendingTargetedAction, target.x, target.y)) {
        showToast('该位置范围内没有可命中的目标或可受影响的地块');
        return;
      }
      const targetRef = resolveTargetRefForAction(pendingTargetedAction, target);
      if (!targetRef) {
        showToast('该技能需要选中有效目标');
        return;
      }
      socket.sendAction(pendingTargetedAction.actionId, targetRef);
      cancelTargeting();
      return;
    }
    if (target.entityKind === 'monster' && target.entityId) {
      socket.sendAction('battle:engage', target.entityId);
      return;
    }
    if (!isWithinDisplayedMemoryBounds(target.x, target.y)) {
      showToast('只能点击当前显示区域内的格子');
      return;
    }
    const knownTile = getKnownTileAt(target.x, target.y);
    if (!knownTile) {
      showToast('完全未知的黑色区域无法点击移动');
      return;
    }
    if (!knownTile.walkable) {
      showToast('无法到达该位置');
      return;
    }
    planPathTo(target);
  },
  (target) => {
    hoveredMapTile = target && typeof target.clientX === 'number' && typeof target.clientY === 'number'
      ? {
          x: target.x,
          y: target.y,
          clientX: target.clientX,
          clientY: target.clientY,
        }
      : null;
    if (pendingTargetedAction) {
      pendingTargetedAction.hoverX = target?.x;
      pendingTargetedAction.hoverY = target?.y;
      syncTargetingOverlay();
      return;
    }
    syncSenseQiOverlay();
  },
);

// 初始化
socket.onInit((data: S2C_Init) => {
  pendingTargetedAction = null;
  hoveredMapTile = null;
  hideObserveModal();
  myPlayer = data.self;
  currentTimeState = data.time ?? null;
  renderCurrentTime(currentTimeState);
  myPlayer.senseQiActive = myPlayer.senseQiActive === true;
  syncTargetingOverlay();
  currentMapMeta = data.mapMeta;
  currentTiles = data.tiles;
  tileOriginX = myPlayer.x - getInfoRadius();
  tileOriginY = myPlayer.y - getInfoRadius();

  tileCache.clear();
  hydrateTileCacheFromMemory(myPlayer.mapId, tileCache);
  cacheTiles(myPlayer.mapId, currentTiles, tileOriginX, tileOriginY);
  syncSenseQiOverlay();

  syncDisplayMetrics();
  camera.snap(myPlayer);
  viewCenterX = myPlayer.x;
  viewCenterY = myPlayer.y;

  const entities = data.players.map(toObservedEntity);
  latestEntities = entities;
  renderer.updateEntities(entities);

  tickStartTime = performance.now();
  clearCurrentPath();

  // 显示主界面布局并初始化各子面板
  sidePanel.show();
  chatUI.clear();
  chatUI.show();
  document.getElementById('hud')?.classList.remove('hidden');
  resizeCanvas();
  refreshZoomChrome();
  attrPanel.initFromPlayer(myPlayer);
  inventoryPanel.initFromPlayer(myPlayer);
  equipmentPanel.initFromPlayer(myPlayer);
  techniquePanel.initFromPlayer(myPlayer);
  questPanel.initFromPlayer(myPlayer);
  actionPanel.initFromPlayer(myPlayer);
  refreshUiChrome();
});

// Tick 更新
socket.onTick((data: S2C_Tick) => {
  if (!myPlayer) return;
  let mapChanged = false;
  if (data.time) {
    currentTimeState = data.time;
    renderCurrentTime(currentTimeState);
  }
  if (data.fx) {
    for (const effect of data.fx) {
      if (effect.type === 'attack') {
        renderer.addAttackTrail(effect.fromX, effect.fromY, effect.toX, effect.toY, effect.color);
      } else {
        renderer.addFloatingText(effect.x, effect.y, effect.text, effect.color, effect.variant);
      }
    }
  }

  if (data.dt) {
    tickDuration = data.dt;
    if (tickRateEl) {
      const seconds = Math.max(data.dt, 0) / 1000;
      renderTickRate(seconds);
    }
  }

  if (data.m) {
    mapChanged = myPlayer.mapId !== data.m;
    if (mapChanged) {
      clearCurrentPath();
      currentTiles = [];
      tileCache.clear();
      currentVisibleTiles.clear();
      visibleGroundPiles.clear();
      hoveredMapTile = null;
      hideObserveModal();
      lootPanel.clear();
      cancelTargeting();
      renderer.resetScene();
    }
    myPlayer.mapId = data.m;
    questPanel.setCurrentMapId(myPlayer.mapId);
    if (mapChanged) {
      hydrateTileCacheFromMemory(myPlayer.mapId, tileCache);
    }
  }
  if (data.mapMeta) {
    currentMapMeta = data.mapMeta;
  }

  if (typeof data.hp === 'number') {
    myPlayer.hp = data.hp;
  }
  if (typeof data.qi === 'number') {
    myPlayer.qi = data.qi;
  }
  if (data.f !== undefined) {
    myPlayer.facing = data.f;
  }

  const oldX = myPlayer.x;
  const oldY = myPlayer.y;

  for (const entity of data.p) {
    if (entity.id === myPlayer.id) {
      if (entity.name) {
        myPlayer.name = entity.name;
      }
      myPlayer.x = entity.x;
      myPlayer.y = entity.y;
      break;
    }
  }

  if (data.v) {
    currentTiles = data.v;
    tileOriginX = myPlayer.x - getInfoRadius();
    tileOriginY = myPlayer.y - getInfoRadius();
    cacheTiles(myPlayer.mapId, currentTiles, tileOriginX, tileOriginY);
    syncSenseQiOverlay();
  }
  visibleGroundPiles = new Map((data.g ?? []).map((pile) => [`${pile.x},${pile.y}`, pile]));
  if (mapChanged) {
    camera.snap(myPlayer);
  } else {
    camera.follow(myPlayer);
  }

  const moved = !mapChanged && (myPlayer.x !== oldX || myPlayer.y !== oldY);

  const entities = data.p.map(toObservedEntity);
  const mapEntities = data.e.map(toObservedEntity);
  entities.push(...mapEntities);
  latestEntities = entities;
  syncTargetingOverlay();
  refreshHudChrome();

  if (moved) {
    const shiftX = myPlayer.x - oldX;
    const shiftY = myPlayer.y - oldY;
    renderer.updateEntities(entities, myPlayer.id, shiftX, shiftY);

    while (pathCells.length > 0 && pathCells[0].x === myPlayer.x && pathCells[0].y === myPlayer.y) {
      pathCells.shift();
    }
  } else {
    renderer.updateEntities(entities);
  }

  if (pathTarget && myPlayer.x === pathTarget.x && myPlayer.y === pathTarget.y) {
    clearCurrentPath();
  }
  if (data.path) {
    pathCells = data.path.map(([x, y]) => ({ x, y }));
    if (pathCells.length === 0 && pathTarget) {
      clearCurrentPath();
    }
  }

  tickStartTime = performance.now();
});

let lastFrameTime = performance.now();

function gameLoop() {
  const now = performance.now();
  const frameDt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  const progress = Math.min((now - tickStartTime) / tickDuration, 1);

  if (myPlayer) {
    syncDisplayMetrics();
    camera.follow(myPlayer);
  }
  camera.update(frameDt);

  // 视野中心平滑追赶玩家，无延迟
  if (myPlayer) {
    const vt = 1 - Math.exp(-VIEW_LERP_SPEED * frameDt);
    viewCenterX += (myPlayer.x - viewCenterX) * vt;
    viewCenterY += (myPlayer.y - viewCenterY) * vt;
    if (Math.abs(viewCenterX - myPlayer.x) < 0.01) viewCenterX = myPlayer.x;
    if (Math.abs(viewCenterY - myPlayer.y) < 0.01) viewCenterY = myPlayer.y;
  }

  renderer.clear();

  if (myPlayer) {
    renderer.setPathHighlight(pathCells);
    renderer.renderWorld(
      camera,
      tileCache,
      currentVisibleTiles,
      myPlayer.x,
      myPlayer.y,
      getDisplayRangeX(),
      getDisplayRangeY(),
      currentTimeState,
    );
    renderer.renderAttackTrails(camera);
    renderer.renderEntities(camera, progress);
    renderer.renderFloatingTexts(camera);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

void loginUI.restoreSession();
