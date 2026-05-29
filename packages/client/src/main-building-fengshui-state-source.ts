/**
 * 本文件属于正式客户端主线，负责前端运行态、状态投影或通用工具。
 *
 * 维护时要区分“显示用派生数据”和“服务端权威数据”，注释只补充边界说明，不改变任何交互语义。
 */
import {
  C2S,
  S2C,
  calculateTerrainDurability,
  isGenericBuildMaterialSlotItemId,
  resolveBuildMaterialCategoryKey,
  resolveGenericBuildMaterialSlotCategory,
  type BuildMaterialCategoryKey,
  type ClientToServerEventPayload,
  type PlayerState,
  type ServerToClientEventPayload,
} from '@mud/shared';
import buildingCatalog from './constants/world/building-catalog.generated.json';
import { getElementKeyLabel } from './domain-labels';
import type { MapBuildPreviewOverlayState, MapFengShuiOverlayState } from './game-map/types';
import type { SocketBuildingSender } from './network/socket-send-building';
import { getLocalItemTemplate } from './content/local-templates';
import { detailModalHost } from './ui/detail-modal-host';
import { FloatingTooltip } from './ui/floating-tooltip';
import { t } from './ui/i18n';
import type { SidePanel, SidePanelLayoutCollapseState } from './ui/side-panel';

type MainBuildingFengShuiStateSourceOptions = {
  socket: SocketBuildingSender;
  setFengShuiOverlay: (overlay: MapFengShuiOverlayState | null) => void;
  setBuildPreviewOverlay: (overlay: MapBuildPreviewOverlayState | null) => void;
  getPlayer: () => PlayerState | null;
  getVisibleTileAt?: (x: number, y: number) => unknown;
  showToast: (message: string, kind?: 'system' | 'success' | 'warn') => void;
  beginTargeting: (actionId: string, actionName: string, targetMode?: string, range?: number) => void;
  cancelTargeting: () => void;
  getInfoRadius: () => number;
  sidePanel: Pick<
    SidePanel,
    | 'getLayoutCollapseState'
    | 'setLayoutCollapseState'
    | 'setBuildingModeActive'
    | 'isMobileLayoutActive'
  >;
};

type RoomSummaryPayload = NonNullable<ServerToClientEventPayload<typeof S2C.RoomSummaryPatch>['adds']>[number];
type FengShuiDetailPayload = ServerToClientEventPayload<typeof S2C.FengShuiDetail>;
type FengShuiOverlayCellPayload = ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch>['cells'][number];
export type BuildingSenseQiRoomInfo = {
  roomId: string;
  roomLabel: string;
  area?: number;
  enclosed?: boolean;
  doorCount?: number;
  windowCount?: number;
  fengShuiLabel: string;
  score: number;
  grade: string;
  detail?: {
    shapeScore: number;
    enclosureScore: number;
    qiScore: number;
    shaScore: number;
    comfortScore: number;
    elementScore: number;
    formationScore: number;
    integrityScore: number;
    reasons: Array<{ code: string; delta: number; severity: string }>;
  };
};
const FENGSHUI_DETAIL_MODAL_OWNER = 'building-fengshui-detail';
const buildModeTooltip = new FloatingTooltip('floating-tooltip building-mode-tooltip');
const BUILD_CATEGORY_ORDER = ['structure', 'facility', 'floor'] as const;
type BuildCategoryKey = (typeof BUILD_CATEGORY_ORDER)[number];
type BuildingCatalogEntry = (typeof buildingCatalog)[number];
type BuildMaterialRequirement = {
  slotIndex: number;
  itemId: string;
  label: string;
  count: number;
  categoryKey: BuildMaterialCategoryKey;
  isGeneric: boolean;
};
type BuildMaterialCandidate = {
  slotIndex: number;
  itemId: string;
  label: string;
  ownedCount: number;
  requiredCount: number;
  categoryKey: BuildMaterialCategoryKey;
  selected: boolean;
  disabled: boolean;
  exact: boolean;
};
type BuildMaterialSlot = {
  slotIndex: number;
  requirement: BuildMaterialRequirement;
  selectedItemId: string | null;
  selectedLabel: string | null;
  candidates: BuildMaterialCandidate[];
  selectionRequired: boolean;
  ready: boolean;
};

const BUILD_CATEGORY_META: Record<BuildCategoryKey, {
  label: string;
  layers: string[];
}> = {
  structure: {
    label: '结构',
    layers: ['structure'],
  },
  facility: {
    label: '设施',
    layers: ['facility', 'furniture', 'decoration'],
  },
  floor: {
    label: '地面',
    layers: ['floor'],
  },
};

const PREFERRED_BUILD_MATERIAL_ITEM_IDS = new Set<string>(['black_iron_chunk']);

const BUILD_MATERIAL_CATEGORY_META: Record<BuildMaterialCategoryKey, {
  label: string;
  fallbackItemLabel: string;
  accent: string;
  tint: string;
}> = {
  stone: {
    label: '石头',
    fallbackItemLabel: '石材',
    accent: '#6f7d8c',
    tint: 'rgba(111, 125, 140, 0.14)',
  },
  wood: {
    label: '木材',
    fallbackItemLabel: '木材',
    accent: '#8b5a34',
    tint: 'rgba(139, 90, 52, 0.14)',
  },
  cloth: {
    label: '布料',
    fallbackItemLabel: '布料',
    accent: '#b07a2b',
    tint: 'rgba(176, 122, 43, 0.14)',
  },
  metal: {
    label: '金属',
    fallbackItemLabel: '金属材',
    accent: '#5b6d7a',
    tint: 'rgba(91, 109, 122, 0.14)',
  },
  transparent: {
    label: '透明',
    fallbackItemLabel: '透明材',
    accent: '#4c8f94',
    tint: 'rgba(76, 143, 148, 0.14)',
  },
  other: {
    label: '杂项',
    fallbackItemLabel: '杂项材料',
    accent: '#8b6b57',
    tint: 'rgba(139, 107, 87, 0.14)',
  },
};

const BUILD_GENERIC_MATERIAL_META: Record<string, {
  categoryKey: BuildMaterialCategoryKey;
  label: string;
}> = {
  stone: {
    categoryKey: 'stone',
    label: '石材',
  },
  wood: {
    categoryKey: 'wood',
    label: '木材',
  },
  cloth: {
    categoryKey: 'cloth',
    label: '布料',
  },
  metal: {
    categoryKey: 'metal',
    label: '金属材',
  },
  glass: {
    categoryKey: 'transparent',
    label: '透明材',
  },
  transparent: {
    categoryKey: 'transparent',
    label: '透明材',
  },
};

const buildMaterialMetaCache = new Map<string, {
  categoryKey: BuildMaterialCategoryKey;
  label: string;
}>();

function prefersLocalizedMaterialLabel(label: string | undefined): boolean {
  if (!label) {
    return false;
  }
  return !/^[\x00-\x7F\s._-]+$/.test(label);
}

function resolveBuildMaterialMeta(itemId: string): {
  categoryKey: BuildMaterialCategoryKey;
  label: string;
} {
  const cached = buildMaterialMetaCache.get(itemId);
  if (cached) {
    return cached;
  }
  const generic = BUILD_GENERIC_MATERIAL_META[itemId];
  const template = getLocalItemTemplate(itemId);
  const categoryKey = resolveBuildMaterialCategoryKey({
    itemId,
    name: template?.name,
    materialCategory: template?.materialCategory,
    tags: template?.tags,
  });
  const templateLabel = template?.name?.trim() ?? '';
  const label = prefersLocalizedMaterialLabel(templateLabel)
    ? templateLabel
    : generic?.label
      || templateLabel
      || BUILD_MATERIAL_CATEGORY_META[categoryKey].fallbackItemLabel;
  const meta = {
    categoryKey,
    label,
  };
  buildMaterialMetaCache.set(itemId, meta);
  return meta;
}

function resolveBuildMaterialLabel(itemId: string): string {
  return resolveBuildMaterialMeta(itemId).label;
}

function resolveBuildMaterialAccent(categoryKey: BuildMaterialCategoryKey): string {
  return BUILD_MATERIAL_CATEGORY_META[categoryKey].accent;
}

function resolveBuildMaterialTint(categoryKey: BuildMaterialCategoryKey): string {
  return BUILD_MATERIAL_CATEGORY_META[categoryKey].tint;
}

function getCurrentBuildMaterialRequirements(entry: BuildingCatalogEntry | null): BuildMaterialRequirement[] {
  if (!entry?.cost?.length) {
    return [];
  }
  return entry.cost.map((costEntry, slotIndex) => {
    const materialMeta = resolveBuildMaterialMeta(costEntry.itemId);
    return {
      slotIndex,
      itemId: costEntry.itemId,
      label: materialMeta.label,
      count: Math.max(1, Math.trunc(Number(costEntry.count) || 1)),
      categoryKey: materialMeta.categoryKey,
      isGeneric: isGenericBuildMaterialSlotItemId(costEntry.itemId),
    } satisfies BuildMaterialRequirement;
  });
}

function resolvePrimaryBuildMaterialCategory(entry: BuildingCatalogEntry | null): BuildMaterialCategoryKey {
  const firstCost = entry?.cost?.[0];
  return firstCost ? resolveBuildMaterialMeta(firstCost.itemId).categoryKey : 'other';
}

function getPlayerInventoryMaterialCandidates(
  player: PlayerState | null,
  requirement: BuildMaterialRequirement,
  selectedItemId: string | null,
): BuildMaterialCandidate[] {
  if (!player) {
    return [];
  }
  if (!requirement.isGeneric) {
    const ownedCount = Array.isArray(player.inventory?.items)
      ? player.inventory.items.reduce((total, entry) => entry?.itemId === requirement.itemId ? total + Math.max(0, Math.trunc(Number(entry.count) || 0)) : total, 0)
      : 0;
    return [{
      slotIndex: requirement.slotIndex,
      itemId: requirement.itemId,
      label: resolveBuildMaterialLabel(requirement.itemId),
      ownedCount,
      requiredCount: requirement.count,
      categoryKey: requirement.categoryKey,
      selected: true,
      disabled: ownedCount < requirement.count,
      exact: true,
    }];
  }
  const candidates = new Map<string, BuildMaterialCandidate>();
  for (const item of Array.isArray(player.inventory?.items) ? player.inventory.items : []) {
    const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
    if (!itemId) {
      continue;
    }
    if ((item?.type ?? getLocalItemTemplate(itemId)?.type) !== 'material') {
      continue;
    }
    const categoryKey = resolveBuildMaterialCategoryKey({
      itemId,
      name: item?.name ?? getLocalItemTemplate(itemId)?.name,
      materialCategory: item?.materialCategory ?? getLocalItemTemplate(itemId)?.materialCategory,
      tags: item?.tags ?? getLocalItemTemplate(itemId)?.tags,
      type: item?.type ?? getLocalItemTemplate(itemId)?.type,
    });
    if (categoryKey !== resolveGenericBuildMaterialSlotCategory(requirement.itemId)) {
      continue;
    }
    candidates.set(itemId, {
      slotIndex: requirement.slotIndex,
      itemId,
      label: String(item?.name || resolveBuildMaterialLabel(itemId)).trim() || resolveBuildMaterialLabel(itemId),
      ownedCount: Math.max(0, Math.trunc(Number(item?.count) || 0)),
      requiredCount: requirement.count,
      categoryKey,
      selected: itemId === selectedItemId,
      disabled: Math.max(0, Math.trunc(Number(item?.count) || 0)) < requirement.count,
      exact: false,
    });
  }
  const sortedCandidates = Array.from(candidates.values()).sort((left, right) => {
    if (left.disabled !== right.disabled) {
      return left.disabled ? 1 : -1;
    }
    if (left.ownedCount !== right.ownedCount) {
      return right.ownedCount - left.ownedCount;
    }
    return left.label.localeCompare(right.label, 'zh-CN');
  });
  const preferredCandidates = sortedCandidates.filter((candidate) => PREFERRED_BUILD_MATERIAL_ITEM_IDS.has(candidate.itemId));
  return preferredCandidates.length > 0 ? preferredCandidates : sortedCandidates;
}

function buildMaterialSlots(
  player: PlayerState | null,
  entry: BuildingCatalogEntry | null,
  selectedMaterialItemIdsBySlot: Map<number, string>,
): BuildMaterialSlot[] {
  return getCurrentBuildMaterialRequirements(entry).map((requirement) => {
    const rawSelectedItemId = selectedMaterialItemIdsBySlot.get(requirement.slotIndex) ?? null;
    const candidates = getPlayerInventoryMaterialCandidates(player, requirement, rawSelectedItemId);
    const exactCandidate = !requirement.isGeneric ? candidates[0] ?? null : null;
    const selectedCandidate = candidates.find((candidate) => candidate.itemId === rawSelectedItemId)
      ?? candidates.find((candidate) => !candidate.disabled)
      ?? candidates[0]
      ?? exactCandidate;
    const selectedItemId = selectedCandidate?.itemId ?? null;
    const normalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      selected: candidate.itemId === selectedItemId,
    }));
    return {
      slotIndex: requirement.slotIndex,
      requirement,
      selectedItemId,
      selectedLabel: selectedCandidate?.label ?? null,
      candidates: normalizedCandidates,
      selectionRequired: requirement.isGeneric,
      ready: requirement.isGeneric ? Boolean(selectedCandidate && !selectedCandidate.disabled) : Boolean(exactCandidate && !exactCandidate.disabled),
    };
  });
}

function formatSelectedMaterialSummary(slots: BuildMaterialSlot[]): string {
  if (slots.length === 0) {
    return '无耗材';
  }
  return slots.map((slot) => `${slot.selectedLabel ?? slot.requirement.label} x${slot.requirement.count}`).join('、');
}

function resolveBuildingDisplayLabel(entry: BuildingCatalogEntry): string {
  const name = String(entry.name || '未命名建筑').trim();
  if (entry.opening === 'door' || name.endsWith('门')) {
    return '门';
  }
  if (entry.opening === 'window' || name.endsWith('窗')) {
    return '窗';
  }
  if (entry.visualTileType === 'wall' || name.endsWith('墙')) {
    return '墙';
  }
  if (entry.visualTileType === 'floor' || /地板|地砖|回廊/.test(name)) {
    return '地';
  }
  const simplified = name.replace(/^(石|木|铁|铜|银|金|布|竹|藤|琉璃|玻璃)/, '').trim();
  return simplified || name;
}

function resolveProjectedBuildDurationTicks(buildStrength: number): number {
  return Math.max(1, Math.trunc(Number(buildStrength) || 1));
}

function resolveProjectedBuildMaxHp(entry: BuildingCatalogEntry, buildStrength: number, builderSkillLevel: number): number {
  const baseMultiplier = Math.max(0.01, Number(entry.durabilityMultiplier ?? (Math.max(1, Math.trunc(Number(entry.maxHp) || 1)) / 100)));
  return Math.max(1, calculateTerrainDurability(builderSkillLevel, baseMultiplier) * resolveProjectedBuildDurationTicks(buildStrength));
}

function resolveBuildingBaseBuildTicks(entry: BuildingCatalogEntry | null): number {
  return Math.max(1, Math.trunc(Number(entry?.buildTicks) || 1));
}

function normalizeMaterialFailure(reason: string | undefined): string {
  if (!reason) {
    return '建造失败';
  }
  const [kind, itemId, count] = reason.split(':');
  if (kind === 'material_insufficient' && itemId) {
    return `材料不足：${resolveBuildMaterialLabel(itemId)}${count ? ` 缺少 ${count}` : ''}`;
  }
  if (kind === 'build_material_required' && itemId) {
    return `请先选择一种${BUILD_GENERIC_MATERIAL_META[itemId]?.label ?? '真实材料'}`;
  }
  if (kind === 'build_material_invalid' && itemId) {
    return `所选材料无效：${resolveBuildMaterialLabel(itemId)}`;
  }
  if (kind === 'build_material_category_mismatch' && itemId) {
    return `所选材料不能用于当前造物：${resolveBuildMaterialLabel(itemId)}`;
  }
  if (reason === 'not_in_world') {
    return '当前不在可建造世界';
  }
  if (reason === 'invalid_building_def' || reason === 'building_def_not_found') {
    return '建筑配置不存在';
  }
  if (reason === 'tile_blocked' || reason === 'occupied') {
    return '目标地块已被占用';
  }
  if (reason === 'out_of_bounds') {
    return '目标地块超出可建造范围';
  }
  if (reason === 'structure_overlap') {
    return '目标位置已有结构';
  }
  if (reason === 'building_not_found') {
    return '建筑不存在';
  }
  if (reason === 'not_owner' || reason === 'building_owner_mismatch') {
    return '没有该建筑的拆除权限';
  }
  return reason;
}

export function createMainBuildingFengShuiStateSource(options: MainBuildingFengShuiStateSourceOptions) {
  const rooms = new Map<string, RoomSummaryPayload>();
  const toolbarHost = document.getElementById('building-mode-toolbar') as HTMLElement | null;
  let latestDetail: ServerToClientEventPayload<typeof S2C.FengShuiDetail> | null = null;
  let latestOverlay: ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch> | null = null;
  let latestBuildResult: ServerToClientEventPayload<typeof S2C.BuildResult> | null = null;
  let latestOverlayCellByKey = new Map<string, FengShuiOverlayCellPayload>();
  let suppressNextFengShuiDetailUntil = 0;
  let selectedDefId = String(buildingCatalog[0]?.id ?? '');
  let selectedCategory: BuildCategoryKey = resolveBuildCategoryForLayer(findBuildingDefById(selectedDefId)?.layer);
  let buildStrength = 1;
  let buildingModeActive = false;
  let restoreDesktopLayoutState: SidePanelLayoutCollapseState | null = null;
  let toolbarRenderEvents: AbortController | null = null;
  let followFrame = 0;
  let lastBuildPreviewKey = '';
  let lastToolbarRenderKey = '';
  let selectedMaterialItemIdsBySlot = new Map<number, string>();
  let pendingPlacementIntent: {
    requestId: string;
    defId: string;
    rotation: 0 | 90 | 180 | 270;
    buildStrength: number;
    selectedMaterialItemIds: string[];
  } | null = null;
  let pendingPlacementHover: { x: number; y: number } | null = null;

  function applyOverlay(data: ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch>): void {
    const visibleCells = typeof options.getVisibleTileAt === 'function'
      ? data.cells.filter((cell) => Boolean(options.getVisibleTileAt?.(cell.x, cell.y)))
      : data.cells;
    latestOverlay = data;
    latestOverlayCellByKey = new Map(visibleCells.map((cell) => [`${cell.x},${cell.y}`, cell]));
    options.setFengShuiOverlay({
      instanceId: data.instanceId,
      revision: data.revision,
      cells: visibleCells.map((cell) => ({
        x: cell.x,
        y: cell.y,
        roomId: cell.roomId,
        score: cell.score,
        grade: cell.grade,
        revision: cell.revision,
      })),
    });
  }

  function findBuildingDefById(defId: string): BuildingCatalogEntry | null {
    return (buildingCatalog.find((entry) => entry.id === defId) as BuildingCatalogEntry | undefined) ?? null;
  }

  function resolveBuildCategoryForLayer(layer: string | undefined): BuildCategoryKey {
    if (layer === 'floor') {
      return 'floor';
    }
    if (layer === 'structure') {
      return 'structure';
    }
    return 'facility';
  }

  function getEntriesForCategory(category: BuildCategoryKey): BuildingCatalogEntry[] {
    const layers = new Set(BUILD_CATEGORY_META[category].layers);
    return buildingCatalog.filter((entry) => layers.has(String(entry.layer))) as BuildingCatalogEntry[];
  }

  function ensureBuildModeSelection(): {
    filteredEntries: BuildingCatalogEntry[];
    selectedEntry: BuildingCatalogEntry | null;
  } {
    const filteredEntries = getEntriesForCategory(selectedCategory);
    const selectedEntry = filteredEntries.find((entry) => entry.id === selectedDefId) ?? filteredEntries[0] ?? null;
    if (selectedEntry && selectedEntry.id !== selectedDefId) {
      selectedDefId = selectedEntry.id;
      latestBuildResult = null;
      selectedMaterialItemIdsBySlot = new Map();
      buildStrength = resolveBuildingBaseBuildTicks(selectedEntry);
    }
    return {
      filteredEntries,
      selectedEntry,
    };
  }

  function beginBuildingMode(): void {
    if (!buildingModeActive) {
      buildingModeActive = true;
      detailModalHost.close('building-panel');
      if (!options.sidePanel.isMobileLayoutActive()) {
        restoreDesktopLayoutState = options.sidePanel.getLayoutCollapseState();
        options.sidePanel.setLayoutCollapseState({
          leftCollapsed: true,
          rightCollapsed: true,
          bottomCollapsed: true,
        }, { persist: false });
      } else {
        restoreDesktopLayoutState = null;
      }
      options.sidePanel.setBuildingModeActive(true);
    }
    selectedCategory = resolveBuildCategoryForLayer(findBuildingDefById(selectedDefId)?.layer);
    latestBuildResult = null;
    selectedMaterialItemIdsBySlot = new Map();
    lastBuildPreviewKey = '';
    syncActiveBuildMode(true);
    ensureBuildModeFollowLoop();
  }

  function endBuildingMode(): void {
    if (!buildingModeActive) {
      options.setBuildPreviewOverlay(null);
      hideBuildModeToolbar();
      return;
    }
    buildingModeActive = false;
    stopBuildModeFollowLoop();
    hideBuildModeToolbar();
    options.setBuildPreviewOverlay(null);
    buildModeTooltip.hide(true);
    options.sidePanel.setBuildingModeActive(false);
    resetPendingPlacement(true);
    if (!options.sidePanel.isMobileLayoutActive() && restoreDesktopLayoutState) {
      options.sidePanel.setLayoutCollapseState(restoreDesktopLayoutState, { persist: false });
    }
    restoreDesktopLayoutState = null;
    selectedMaterialItemIdsBySlot = new Map();
    lastBuildPreviewKey = '';
    lastToolbarRenderKey = '';
  }

  function ensureBuildModeFollowLoop(): void {
    if (followFrame !== 0) {
      return;
    }
    const step = () => {
      followFrame = 0;
      if (!buildingModeActive) {
        return;
      }
      syncActiveBuildMode();
      followFrame = window.requestAnimationFrame(step);
    };
    followFrame = window.requestAnimationFrame(step);
  }

  function stopBuildModeFollowLoop(): void {
    if (followFrame !== 0) {
      window.cancelAnimationFrame(followFrame);
      followFrame = 0;
    }
  }

  function resetPendingPlacement(clearTargeting = false): void {
    if (!pendingPlacementIntent && !pendingPlacementHover) {
      return;
    }
    pendingPlacementIntent = null;
    pendingPlacementHover = null;
    options.setBuildPreviewOverlay(null);
    if (clearTargeting) {
      options.cancelTargeting();
    }
  }

  function syncActiveBuildMode(force = false): void {
    if (!buildingModeActive) {
      return;
    }
    const { filteredEntries, selectedEntry } = ensureBuildModeSelection();
    const activeDefId = selectedEntry?.id ?? '';
    const player = options.getPlayer();
    const materialSlots = buildMaterialSlots(player, selectedEntry, selectedMaterialItemIdsBySlot);
    const buildPreviewKey = pendingPlacementIntent && pendingPlacementHover && activeDefId
      ? `${activeDefId}|${pendingPlacementHover.x}|${pendingPlacementHover.y}`
      : 'none';
    if (force || buildPreviewKey !== lastBuildPreviewKey) {
      if (pendingPlacementIntent && pendingPlacementHover && activeDefId) {
        updateBuildPreview(options, activeDefId, pendingPlacementHover.x, pendingPlacementHover.y, pendingPlacementIntent.rotation);
      } else {
        options.setBuildPreviewOverlay(null);
      }
      lastBuildPreviewKey = buildPreviewKey;
    }
    const renderKey = [
      buildPreviewKey,
      options.sidePanel.isMobileLayoutActive() ? 'mobile' : 'desktop',
      selectedCategory,
      String(buildStrength),
      materialSlots.map((slot) => slot.selectedItemId ?? '').join(','),
      filteredEntries.map((entry) => entry.id).join(','),
      latestBuildResult?.ok === false ? latestBuildResult.reason ?? '' : latestBuildResult?.ok === true ? 'ok' : '',
    ].join('|');
    if (!force && renderKey === lastToolbarRenderKey) {
      return;
    }
    lastToolbarRenderKey = renderKey;
    renderBuildModeToolbar({
      host: toolbarHost,
      selectedCategory,
      buildStrength,
      filteredEntries,
      selectedEntry,
      selectedDefId: activeDefId,
      getPlayer: options.getPlayer,
      latestBuildResult,
      materialSlots,
      pendingPlacementActive: Boolean(pendingPlacementIntent),
      onSelectCategory: (category) => {
        resetPendingPlacement(true);
        selectedCategory = category;
        latestBuildResult = null;
        selectedMaterialItemIdsBySlot = new Map();
        syncActiveBuildMode(true);
      },
      onChangeBuildStrength: (value) => {
        resetPendingPlacement(true);
        const minBuildStrength = resolveBuildingBaseBuildTicks(selectedEntry);
        buildStrength = Math.max(minBuildStrength, Math.min(9999, Math.trunc(value)));
        latestBuildResult = null;
        syncActiveBuildMode(true);
      },
      onSelect: (defId) => {
        resetPendingPlacement(true);
        selectedDefId = defId;
        selectedCategory = resolveBuildCategoryForLayer(findBuildingDefById(defId)?.layer);
        buildStrength = resolveBuildingBaseBuildTicks(findBuildingDefById(defId));
        latestBuildResult = null;
        selectedMaterialItemIdsBySlot = new Map();
        syncActiveBuildMode(true);
      },
      onSelectMaterial: (slotIndex, itemId) => {
        resetPendingPlacement(true);
        selectedMaterialItemIdsBySlot = new Map(selectedMaterialItemIdsBySlot);
        selectedMaterialItemIdsBySlot.set(slotIndex, itemId);
        latestBuildResult = null;
        syncActiveBuildMode(true);
      },
      onPlace: () => {
        const player = options.getPlayer();
        if (!player || !activeDefId) {
          options.showToast(t('building.toast.not-buildable-world'), 'warn');
          return;
        }
        const latestMaterialSlots = buildMaterialSlots(player, selectedEntry, selectedMaterialItemIdsBySlot);
        const pendingSlot = latestMaterialSlots.find((slot) => slot.selectionRequired && !slot.ready);
        if (pendingSlot) {
          options.showToast(t('building.toast.select-requirement', { label: pendingSlot.requirement.label }), 'warn');
          return;
        }
        pendingPlacementIntent = {
          requestId: `build:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          defId: activeDefId,
          rotation: 0,
          buildStrength,
          selectedMaterialItemIds: latestMaterialSlots.map((slot) => slot.selectedItemId ?? ''),
        };
        pendingPlacementHover = null;
        options.beginTargeting('building:place', '建造位置', 'tile', Math.max(1, options.getInfoRadius()));
        syncActiveBuildMode(true);
      },
      onExit: () => {
        endBuildingMode();
      },
      prepareSignal: () => {
        toolbarRenderEvents?.abort();
        toolbarRenderEvents = new AbortController();
        return toolbarRenderEvents.signal;
      },
    });
  }

  function hideBuildModeToolbar(): void {
    toolbarRenderEvents?.abort();
    toolbarRenderEvents = null;
    if (!toolbarHost) {
      return;
    }
    toolbarHost.classList.add('hidden');
    toolbarHost.setAttribute('aria-hidden', 'true');
    toolbarHost.replaceChildren();
  }

  const api = {
    clear(): void {
      endBuildingMode();
      rooms.clear();
      latestDetail = null;
      latestOverlay = null;
      latestBuildResult = null;
      latestOverlayCellByKey = new Map();
      suppressNextFengShuiDetailUntil = 0;
      lastBuildPreviewKey = '';
      lastToolbarRenderKey = '';
      options.setFengShuiOverlay(null);
      options.setBuildPreviewOverlay(null);
      detailModalHost.close(FENGSHUI_DETAIL_MODAL_OWNER);
    },

    openBuildingPanel(): void {
      beginBuildingMode();
    },

    hasPendingPlacementTargeting(): boolean {
      return Boolean(pendingPlacementIntent);
    },

    setPendingPlacementHover(target: { x?: number; y?: number } | null): void {
      if (!pendingPlacementIntent || !target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
        if (pendingPlacementHover) {
          pendingPlacementHover = null;
          syncActiveBuildMode(true);
        }
        return;
      }
      const nextHover = { x: Math.trunc(Number(target.x)), y: Math.trunc(Number(target.y)) };
      if (pendingPlacementHover?.x === nextHover.x && pendingPlacementHover?.y === nextHover.y) {
        return;
      }
      pendingPlacementHover = nextHover;
      syncActiveBuildMode(true);
    },

    confirmBuildPlacementTarget(x: number, y: number): void {
      if (!pendingPlacementIntent) {
        return;
      }
      options.socket.sendBuildPlaceIntent({
        requestId: pendingPlacementIntent.requestId,
        defId: pendingPlacementIntent.defId,
        x,
        y,
        rotation: pendingPlacementIntent.rotation,
        buildStrength: pendingPlacementIntent.buildStrength,
        selectedMaterialItemIds: pendingPlacementIntent.selectedMaterialItemIds,
      });
      pendingPlacementIntent = null;
      pendingPlacementHover = null;
      options.setBuildPreviewOverlay(null);
      options.showToast(t('building.toast.submitted'), 'system');
      syncActiveBuildMode(true);
    },

    cancelPendingPlacementTargeting(clearTargeting = true): void {
      resetPendingPlacement(clearTargeting);
      syncActiveBuildMode(true);
    },

    sendBuildPlaceIntent(payload: ClientToServerEventPayload<typeof C2S.BuildPlaceIntent>): void {
      options.socket.sendBuildPlaceIntent(payload);
    },

    sendBuildDeconstruct(payload: ClientToServerEventPayload<typeof C2S.BuildDeconstruct>): void {
      options.socket.sendBuildDeconstruct(payload);
    },

    sendRoomSetRole(payload: ClientToServerEventPayload<typeof C2S.RoomSetRole>): void {
      options.socket.sendRoomSetRole(payload);
    },

    sendFengShuiObserve(payload: ClientToServerEventPayload<typeof C2S.FengShuiObserve>): void {
      options.socket.sendFengShuiObserve(payload);
    },

    handleBuildResult(data: ServerToClientEventPayload<typeof S2C.BuildResult>): void {
      latestBuildResult = data;
      if (data.ok) {
        pendingPlacementIntent = null;
        pendingPlacementHover = null;
        options.setBuildPreviewOverlay(null);
        options.showToast(
          data.building?.state === 'building'
            ? '已开始建造'
            : data.building
              ? '建造完成'
              : '建造请求已处理',
          'success',
        );
        syncActiveBuildMode(true);
        return;
      }
      options.showToast(normalizeMaterialFailure(data.reason), 'warn');
      syncActiveBuildMode(true);
    },

    handleRoomSummaryPatch(data: ServerToClientEventPayload<typeof S2C.RoomSummaryPatch>): void {
      for (const roomId of data.removes ?? []) {
        rooms.delete(roomId);
      }
      for (const room of data.adds ?? []) {
        rooms.set(room.id, room);
      }
      for (const room of data.updates ?? []) {
        rooms.set(room.id, room);
      }
    },

    handleFengShuiOverlayPatch(data: ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch>): void {
      applyOverlay(data);
    },

    handleFengShuiDetail(data: ServerToClientEventPayload<typeof S2C.FengShuiDetail>): void {
      latestDetail = data;
      rooms.set(data.room.id, data.room);
      if (Date.now() <= suppressNextFengShuiDetailUntil) {
        suppressNextFengShuiDetailUntil = 0;
        return;
      }
      openOrPatchFengShuiDetail(data);
    },

    getRooms(): readonly RoomSummaryPayload[] {
      return [...rooms.values()];
    },

    getLatestDetail(): ServerToClientEventPayload<typeof S2C.FengShuiDetail> | null {
      return latestDetail;
    },

    getLatestOverlay(): ServerToClientEventPayload<typeof S2C.FengShuiOverlayPatch> | null {
      return latestOverlay;
    },

    getLatestBuildResult(): ServerToClientEventPayload<typeof S2C.BuildResult> | null {
      return latestBuildResult;
    },

    getSenseQiRoomInfoAt(x: number, y: number): BuildingSenseQiRoomInfo | null {
      const cell = latestOverlayCellByKey.get(`${x},${y}`);
      if (!cell) {
        return null;
      }
      const room = rooms.get(cell.roomId);
      const roomLabel = room ? formatRoomRole(room.role) : `房间 ${cell.roomId.slice(0, 8)}`;
      const detail = latestDetail?.room.id === cell.roomId
        ? {
          shapeScore: latestDetail.fengShui.shapeScore,
          enclosureScore: latestDetail.fengShui.enclosureScore,
          qiScore: latestDetail.fengShui.qiScore,
          shaScore: latestDetail.fengShui.shaScore,
          comfortScore: latestDetail.fengShui.comfortScore,
          elementScore: latestDetail.fengShui.elementScore,
          formationScore: latestDetail.fengShui.formationScore,
          integrityScore: latestDetail.fengShui.integrityScore,
          reasons: latestDetail.fengShui.reasons.map((reason) => ({
            code: localizeReasonCode(reason.code),
            delta: reason.delta,
            severity: reason.severity,
          })),
        }
        : undefined;
      return {
        roomId: cell.roomId,
        roomLabel,
        area: room?.area,
        enclosed: room?.enclosed,
        doorCount: room?.doorCount,
        windowCount: room?.windowCount,
        fengShuiLabel: formatGrade(cell.grade),
        score: cell.score,
        grade: cell.grade,
        detail,
      };
    },

    requestSenseQiFengShuiOverlay(x?: number, y?: number): void {
      suppressNextFengShuiDetailUntil = Date.now() + 1500;
      options.socket.sendFengShuiObserve({
        overlay: true,
        ...(Number.isFinite(x) ? { x } : {}),
        ...(Number.isFinite(y) ? { y } : {}),
      });
    },
  };
  return api;
}

export type MainBuildingFengShuiStateSource = ReturnType<typeof createMainBuildingFengShuiStateSource>;

function updateBuildPreview(
  options: MainBuildingFengShuiStateSourceOptions,
  defId: string,
  originX: number,
  originY: number,
  rotation: 0 | 90 | 180 | 270,
): void {
  const def = buildingCatalog.find((entry) => entry.id === defId);
  if (!def || !Number.isFinite(originX) || !Number.isFinite(originY)) {
    options.setBuildPreviewOverlay(null);
    return;
  }
  const cells = rotateFootprint(def.footprint ?? [{ dx: 0, dy: 0 }], rotation)
    .map((cell) => ({ x: originX + cell.dx, y: originY + cell.dy, ok: true }));
  options.setBuildPreviewOverlay({ defId, originX, originY, rotation, cells });
}

function rotateFootprint(footprint: Array<{ dx: number; dy: number }>, rotation: 0 | 90 | 180 | 270): Array<{ dx: number; dy: number }> {
  return footprint.map((cell) => {
    if (rotation === 90) return { dx: -cell.dy, dy: cell.dx };
    if (rotation === 180) return { dx: -cell.dx, dy: -cell.dy };
    if (rotation === 270) return { dx: cell.dy, dy: -cell.dx };
    return { dx: cell.dx, dy: cell.dy };
  });
}

type BuildModeToolbarOptions = {
  host: HTMLElement | null;
  selectedCategory: BuildCategoryKey;
  buildStrength: number;
  filteredEntries: BuildingCatalogEntry[];
  selectedEntry: BuildingCatalogEntry | null;
  selectedDefId: string;
  getPlayer: () => PlayerState | null;
  latestBuildResult: ServerToClientEventPayload<typeof S2C.BuildResult> | null;
  materialSlots: BuildMaterialSlot[];
  pendingPlacementActive: boolean;
  onSelectCategory: (category: BuildCategoryKey) => void;
  onChangeBuildStrength: (value: number) => void;
  onSelect: (defId: string) => void;
  onSelectMaterial: (slotIndex: number, itemId: string) => void;
  onPlace: () => void;
  onExit: () => void;
  prepareSignal: () => AbortSignal;
};

function renderBuildModeToolbar(options: BuildModeToolbarOptions): void {
  if (!options.host) {
    return;
  }
  const player = options.getPlayer();
  const selected = options.selectedEntry;
  const builderSkillLevel = Math.max(1, Math.trunc(Number(player?.buildingSkill?.level ?? 1) || 1));
  const projectedBuildTicks = selected ? resolveProjectedBuildDurationTicks(options.buildStrength) : 0;
  const projectedMaxHp = selected ? resolveProjectedBuildMaxHp(selected, options.buildStrength, builderSkillLevel) : 0;
  const fragment = document.createDocumentFragment();
  const shell = document.createElement('div');
  shell.className = 'building-mode-shell';
  const content = document.createElement('div');
  content.className = 'building-mode-content';

  const materialPanel = document.createElement('section');
  materialPanel.className = 'building-mode-panel building-mode-material-panel';
  const materialTitle = document.createElement('div');
  materialTitle.className = 'building-mode-panel-title';
  materialTitle.textContent = '材料';
  const materialGrid = document.createElement('div');
  materialGrid.className = 'building-mode-material-grid';
  for (const slot of options.materialSlots) {
    for (const candidate of slot.candidates) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = candidate.selected
        ? 'building-mode-material-card active'
        : candidate.disabled
          ? 'building-mode-material-card disabled'
          : 'building-mode-material-card';
      if (!candidate.exact) {
        card.dataset.action = 'select-material';
      }
      card.dataset.slotIndex = String(candidate.slotIndex);
      card.dataset.itemId = candidate.itemId;
      card.disabled = candidate.disabled || candidate.exact;
      card.style.setProperty('--building-material-accent', resolveBuildMaterialAccent(candidate.categoryKey));
      card.style.setProperty('--building-material-tint', resolveBuildMaterialTint(candidate.categoryKey));
      const name = document.createElement('strong');
      name.className = 'building-mode-material-card-name';
      name.textContent = candidate.label;
      const ownedBadge = document.createElement('span');
      ownedBadge.className = 'building-mode-material-card-badge';
      ownedBadge.textContent = String(candidate.ownedCount);
      card.replaceChildren(name, ownedBadge);
      materialGrid.appendChild(card);
    }
    if (slot.candidates.length === 0 && slot.selectionRequired) {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'building-mode-material-empty';
      emptySlot.textContent = `背包里没有可用于${slot.requirement.label}的真实材料`;
      materialGrid.appendChild(emptySlot);
    }
  }
  if (options.materialSlots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'building-mode-material-empty';
    empty.textContent = selected ? '当前造物无需额外材料' : '先选中一个造物';
    materialGrid.appendChild(empty);
  }
  materialPanel.replaceChildren(materialTitle, materialGrid);

  const strengthPanel = document.createElement('section');
  strengthPanel.className = 'building-mode-panel building-mode-strength-panel';
  const strengthTitle = document.createElement('div');
  strengthTitle.className = 'building-mode-panel-title';
  strengthTitle.textContent = '结构强度';
  const strengthInputWrap = document.createElement('label');
  strengthInputWrap.className = 'building-mode-strength-input-wrap';
  const strengthInput = document.createElement('input');
  strengthInput.type = 'number';
  strengthInput.min = String(resolveBuildingBaseBuildTicks(selected));
  strengthInput.max = '9999';
  strengthInput.step = '1';
  strengthInput.value = String(options.buildStrength);
  strengthInput.dataset.uiKey = 'building-mode-build-strength';
  strengthInput.dataset.action = 'build-strength';
  strengthInput.inputMode = 'numeric';
  const strengthUnit = document.createElement('span');
  strengthUnit.textContent = `最低 ${resolveBuildingBaseBuildTicks(selected)}`;
  strengthInputWrap.replaceChildren(strengthInput, strengthUnit);
  const strengthHint = document.createElement('div');
  strengthHint.className = 'building-mode-strength-hint';
  strengthHint.textContent = selected
    ? `建造 ${projectedBuildTicks} 息，完工耐久 ${projectedMaxHp}，营造等级 Lv.${builderSkillLevel}`
    : '每 1 强度 = 1 息工时 = 1x 生命倍率';
  const strengthHintSecondary = document.createElement('div');
  strengthHintSecondary.className = 'building-mode-strength-hint';
  strengthHintSecondary.textContent = '营造经验按原始建造时间结算。';
  strengthPanel.replaceChildren(strengthTitle, strengthInputWrap, strengthHint, strengthHintSecondary);

  const stage = document.createElement('section');
  stage.className = 'building-mode-panel building-mode-stage';
  const stageHead = document.createElement('div');
  stageHead.className = 'building-mode-stage-head';
  const title = document.createElement('div');
  title.className = 'building-mode-title';
  const titleMain = document.createElement('strong');
  titleMain.textContent = selected?.name ?? '暂无符合条件的造物';
  const titleSub = document.createElement('span');
  titleSub.textContent = selected
    ? `点击地图选择建造位置 · 营造 Lv.${builderSkillLevel} · ${formatSelectedMaterialSummary(options.materialSlots)}`
    : '请选择造物';
  title.replaceChildren(titleMain, titleSub);
  const stageStatus = document.createElement('div');
  stageStatus.className = 'building-mode-stage-status';
  stageStatus.textContent = options.latestBuildResult?.ok === false
    ? normalizeMaterialFailure(options.latestBuildResult.reason)
    : pendingPlacementHint(options)
      ? pendingPlacementHint(options)
    : selected
      ? `建造 ${projectedBuildTicks} 息 · 完工耐久 ${projectedMaxHp}`
      : '未选中造物';
  const headMain = document.createElement('div');
  headMain.className = 'building-mode-stage-summary';
  headMain.replaceChildren(title, stageStatus);
  const actions = document.createElement('div');
  actions.className = 'building-mode-actions';

  const placeButton = buildModeActionButton('选择位置', 'place', true);
  placeButton.disabled = !(player && selected) || options.materialSlots.some((slot) => slot.selectionRequired && !slot.ready);
  actions.appendChild(placeButton);
  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.className = 'building-mode-exit';
  exitButton.dataset.action = 'exit';
  exitButton.dataset.uiKey = 'building-mode-action:exit';
  exitButton.textContent = '退出营造';
  actions.appendChild(exitButton);
  stageHead.replaceChildren(headMain, actions);

  const itemGrid = document.createElement('div');
  itemGrid.className = 'building-mode-item-grid';
  for (const def of options.filteredEntries) {
    const materialCategoryKey = resolvePrimaryBuildMaterialCategory(def);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = def.id === options.selectedDefId ? 'building-mode-item active' : 'building-mode-item';
    button.dataset.uiKey = `building-mode-item:${def.id}`;
    button.dataset.defId = def.id;
    button.dataset.tooltipTitle = def.name;
    button.dataset.tooltipDetail = buildBuildingTooltipText(def, options.buildStrength, builderSkillLevel);
    button.style.setProperty('--building-material-accent', resolveBuildMaterialAccent(materialCategoryKey));
    button.style.setProperty('--building-material-tint', resolveBuildMaterialTint(materialCategoryKey));
    const label = document.createElement('strong');
    label.className = 'building-mode-item-label';
    label.textContent = resolveBuildingDisplayLabel(def);
    button.replaceChildren(label);
    itemGrid.appendChild(button);
  }
  if (options.filteredEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'building-mode-empty';
    empty.textContent = '当前分类没有可建造的造物';
    itemGrid.appendChild(empty);
  }
  stage.replaceChildren(stageHead, itemGrid);

  const footer = document.createElement('div');
  footer.className = 'building-mode-footer';
  const tabRail = document.createElement('div');
  tabRail.className = 'building-mode-tab-rail';
  for (const category of BUILD_CATEGORY_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = category === options.selectedCategory ? 'building-mode-tab active' : 'building-mode-tab';
    button.dataset.uiKey = `building-mode-tab:${category}`;
    button.dataset.category = category;
    button.textContent = BUILD_CATEGORY_META[category].label;
    tabRail.appendChild(button);
  }
  footer.appendChild(tabRail);

  content.replaceChildren(materialPanel, strengthPanel, stage);
  shell.replaceChildren(content, footer);
  fragment.appendChild(shell);
  options.host.replaceChildren(fragment);
  options.host.classList.remove('hidden');
  options.host.setAttribute('aria-hidden', 'false');

  const signal = options.prepareSignal();
  options.host.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  }, { signal });
  options.host.addEventListener('click', (event) => {
    event.stopPropagation();
  }, { signal });
  options.host.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const category = button.dataset.category as BuildCategoryKey | undefined;
      if (category && BUILD_CATEGORY_ORDER.includes(category)) {
        options.onSelectCategory(category);
      }
    }, { signal });
  });
  const strengthFilterInput = options.host.querySelector<HTMLInputElement>('[data-action="build-strength"]');
  strengthFilterInput?.addEventListener('input', () => {
    const nextValue = Math.max(1, Math.min(9999, Math.trunc(Number(strengthFilterInput.value) || 1)));
    options.onChangeBuildStrength(nextValue);
  }, { signal });
  options.host.querySelectorAll<HTMLButtonElement>('.building-mode-item[data-def-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const defId = button.dataset.defId;
      if (defId) {
        options.onSelect(defId);
      }
    }, { signal });
  });
  options.host.querySelectorAll<HTMLButtonElement>('.building-mode-material-card[data-action="select-material"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const slotIndex = Math.max(0, Math.trunc(Number(button.dataset.slotIndex) || 0));
      const itemId = button.dataset.itemId;
      if (itemId) {
        options.onSelectMaterial(slotIndex, itemId);
      }
    }, { signal });
  });
  bindBuildModeTooltipEvents(options.host, signal);
  options.host.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const action = button.dataset.action;
      if (action === 'select-material') {
        return;
      }
      if (action === 'place') {
        options.onPlace();
        return;
      }
      if (action === 'exit') {
        options.onExit();
      }
    }, { signal });
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    options.onExit();
  }, { signal });
}

function buildModeActionButton(label: string, action: 'place', primary = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = primary ? 'building-mode-action primary' : 'building-mode-action';
  button.dataset.uiKey = `building-mode-action:${action}`;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function pendingPlacementHint(options: BuildModeToolbarOptions): string | null {
  if (options.pendingPlacementActive) {
    return '请选择目标格，放下半成品后再靠近施工';
  }
  return options.latestBuildResult?.ok === true && options.latestBuildResult.building?.state === 'building'
    ? '半成品已放置，靠近后在交互列表中开始施工'
    : null;
}

function formatPlayerCoord(player: PlayerState | null): string {
  return player ? `${player.x},${player.y}` : '未入世';
}

function formatBuildingLayer(layer: string): string {
  return { structure: '结构', floor: '地面', facility: '设施', furniture: '家具', decoration: '装饰' }[layer] ?? layer;
}

function formatMaterialSummary(cost: Array<{ itemId: string; count: number }> | undefined): string {
  if (!cost?.length) {
    return '无耗材';
  }
  return cost.map((entry) => `${resolveBuildMaterialLabel(entry.itemId)} x${entry.count}`).join('、');
}

function formatElementVectorVerbose(vector: Record<string, number | undefined> | undefined): string {
  const entries = Object.entries(vector ?? {}).filter(([, value]) => Number(value) !== 0);
  if (entries.length === 0) {
    return '中性';
  }
  return entries.map(([key, value]) => `${getElementKeyLabel(key, key)} ${value}`).join(' / ');
}

function buildBuildingTooltipText(def: BuildingCatalogEntry, buildStrength: number, builderSkillLevel: number): string {
  const projectedDuration = resolveProjectedBuildDurationTicks(buildStrength);
  const projectedMaxHp = resolveProjectedBuildMaxHp(def, buildStrength, builderSkillLevel);
  const lines = [
    `显示：${resolveBuildingDisplayLabel(def)}`,
    `类型：${formatBuildingLayer(def.layer)}`,
    `材料：${formatMaterialSummary(def.cost)}`,
    `耐久系数：${Number(def.durabilityMultiplier ?? 0) > 0 ? Number(def.durabilityMultiplier).toLocaleString('zh-CN') : Math.max(0, Math.trunc(Number(def.maxHp) || 0))}`,
    `当前建造强度：${projectedDuration}`,
    `当前完工耐久：${projectedMaxHp}`,
    `营造等级：Lv.${builderSkillLevel}`,
    `稳定：${Math.max(0, Math.trunc(Number(def.stability) || 0))}`,
    `五行：${formatElementVectorVerbose(def.elementVector)}`,
    `标签：${(def.traits ?? []).join('、') || '无'}`,
    `占地：${Math.max(1, def.footprint?.length ?? 1)} 格`,
  ];
  if (typeof def.comfort === 'number' && def.comfort !== 0) {
    lines.push(`舒适：${def.comfort > 0 ? '+' : ''}${def.comfort}`);
  }
  if (def.blocksMove === true || def.blocksSight === true) {
    lines.push(`阻挡：${def.blocksMove === true ? '移动' : ''}${def.blocksMove === true && def.blocksSight === true ? ' / ' : ''}${def.blocksSight === true ? '视线' : ''}`);
  }
  if (def.opening && def.opening !== 'none') {
    lines.push(`开口：${def.opening === 'door' ? '门' : def.opening === 'window' ? '窗' : def.opening}`);
  }
  return lines.join('\n');
}

function bindBuildModeTooltipEvents(root: HTMLElement, signal: AbortSignal): void {
  let tooltipTarget: HTMLElement | null = null;

  root.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      if (tooltipTarget) {
        tooltipTarget = null;
        buildModeTooltip.hide();
      }
      return;
    }
    const tooltipNode = target.closest<HTMLElement>('[data-tooltip-title]');
    if (!tooltipNode) {
      if (tooltipTarget) {
        tooltipTarget = null;
        buildModeTooltip.hide();
      }
      return;
    }
    const title = tooltipNode.dataset.tooltipTitle ?? '';
    const detail = splitTooltipLines(tooltipNode.dataset.tooltipDetail ?? '');
    if (tooltipTarget !== tooltipNode) {
      tooltipTarget = tooltipNode;
      buildModeTooltip.show(title, detail, event.clientX, event.clientY);
      return;
    }
    buildModeTooltip.move(event.clientX, event.clientY);
  }, { signal });

  root.addEventListener('pointerleave', () => {
    tooltipTarget = null;
    buildModeTooltip.hide();
  }, { signal });
}

function splitTooltipLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function openOrPatchFengShuiDetail(data: FengShuiDetailPayload): void {
  const options = {
    ownerId: FENGSHUI_DETAIL_MODAL_OWNER,
    title: `风水：${formatGrade(data.fengShui.grade)} ${data.fengShui.score}`,
    subtitle: `${formatRoomRole(data.room.role)} · ${data.fengShui.primaryElement} / ${data.fengShui.functionElement}`,
    hint: '点击空白处关闭',
    size: 'md' as const,
    renderBody: (body: HTMLElement) => renderFengShuiDetailBody(body, data),
  };
  if (!detailModalHost.patch(options)) {
    detailModalHost.open(options);
  }
}

function renderFengShuiDetailBody(body: HTMLElement, data: FengShuiDetailPayload): void {
  const root = document.createElement('div');
  root.className = 'fengshui-detail-modal';
  const metrics = document.createElement('div');
  metrics.className = 'fengshui-detail-metrics';
  for (const entry of [
    ['面积', String(data.room.area)],
    ['门窗', `${data.room.doorCount}/${data.room.windowCount}`],
    ['封闭', data.room.enclosed ? '完整' : '开放'],
    ['幸运', formatSignedNumber(Math.trunc(data.fengShui.score / 10))],
  ]) {
    const item = document.createElement('span');
    item.className = 'fengshui-detail-metric';
    item.textContent = `${entry[0]}：${entry[1]}`;
    metrics.appendChild(item);
  }
  const dimensionsTitle = document.createElement('div');
  dimensionsTitle.className = 'fengshui-detail-section-title';
  dimensionsTitle.textContent = '分项汇总';
  const dimensions = document.createElement('div');
  dimensions.className = 'fengshui-detail-metrics';
  for (const entry of [
    ['形制', data.fengShui.shapeScore],
    ['围合', data.fengShui.enclosureScore],
    ['灵气', data.fengShui.qiScore],
    ['煞气', data.fengShui.shaScore],
    ['舒适/用途', data.fengShui.comfortScore],
    ['五行', data.fengShui.elementScore],
    ['阵法', data.fengShui.formationScore],
    ['完整性', data.fengShui.integrityScore],
  ] as const) {
    const item = document.createElement('span');
    item.className = `fengshui-detail-metric ${entry[1] > 0 ? 'is-good' : entry[1] < 0 ? 'is-bad' : 'is-neutral'}`;
    item.textContent = `${entry[0]}：${formatSignedNumber(entry[1])}`;
    dimensions.appendChild(item);
  }
  const reasonsTitle = document.createElement('div');
  reasonsTitle.className = 'fengshui-detail-section-title';
  reasonsTitle.textContent = '具体加减项';
  const reasons = document.createElement('div');
  reasons.className = 'fengshui-detail-reasons';
  const visibleReasons = data.fengShui.reasons
    .filter((reason) => reason.delta !== 0)
    .slice()
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 16);
  for (const reason of visibleReasons) {
    const item = document.createElement('div');
    item.className = `fengshui-detail-reason is-${reason.severity}`;
    const value = document.createElement('span');
    value.className = 'fengshui-detail-reason-value';
    value.textContent = formatSignedNumber(reason.delta);
    const label = document.createElement('span');
    label.className = 'fengshui-detail-reason-label';
    label.textContent = localizeReasonCode(reason.code);
    item.replaceChildren(value, label);
    reasons.appendChild(item);
  }
  if (visibleReasons.length === 0) {
    const item = document.createElement('div');
    item.className = 'fengshui-detail-reason is-info';
    item.textContent = '暂无有效加减项';
    reasons.appendChild(item);
  }
  root.replaceChildren(metrics, dimensionsTitle, dimensions, reasonsTitle, reasons);
  body.replaceChildren(root);
}

function formatSignedNumber(value: number): string {
  const normalized = Math.trunc(Number(value) || 0);
  return normalized > 0 ? `+${normalized}` : String(normalized);
}

function formatGrade(grade: string): string {
  return {
    calamity: '天厄',
    disaster: '绝凶',
    great_bad: '大凶',
    bad: '凶',
    minor_bad: '小凶',
    plain: '平',
    minor_good: '小吉',
    good: '吉',
    great_good: '大吉',
    blessed: '福地',
    paradise: '洞天',
  }[grade] ?? grade;
}

function formatRoomRole(role: string): string {
  return {
    generic: '普通房间',
    meditation: '静室',
    alchemy: '丹房',
    bedroom: '卧房',
    storage: '仓库',
    courtyard: '庭院',
    outdoor: '室外',
  }[role] ?? role;
}

function localizeReasonCode(code: string): string {
  return {
    'room.role.alchemy': '识别为丹房',
    'room.role.meditation': '识别为静室',
    'room.role.bedroom': '识别为卧房',
    'room.role.storage': '识别为仓库',
    'room.role.courtyard': '识别为庭院',
    'room.role.generic_mixed': '用途混杂，按普通房间处理',
    'room.role.generic_cap': '普通房间未形成明确风水用途',
    'shell.closed': '房间封闭完整',
    'shell.open': '房间连通外界',
    'shell.no_door': '封闭但缺少房门',
    'shell.area_balanced': '面积适中',
    'shell.roof_covered': '屋顶覆盖充足',
    'enclosure.closed': '房间封闭完整',
    'enclosure.open': '房间连通外界',
    'enclosure.no_door': '封闭但缺少房门',
    'shape.area_balanced': '面积适中',
    'shape.roof_covered': '屋顶覆盖充足',
    'trait.courtyard_corridor': '半室外回廊格局匹配',
    'trait.alchemy_heat_source': '丹炉火源匹配',
    'trait.meditation_facility': '静修设施匹配',
    'trait.rest_comfort': '休息家具舒适',
    'trait.storage_shelf': '仓储设施匹配',
    'element.same_function': '主五行契合用途',
    'element.generates_function': '主五行生助用途',
    'element.conflicts_function': '主五行克制用途',
    'qi.dense': '灵气密度较高',
    'qi.low': '灵气密度偏低',
    'qi.leak': '房间存在泄气',
    'qi.affinity': '聚气布置生效',
    'comfort.good': '舒适度较高',
    'comfort.bad': '舒适度偏低',
    'stability.good': '结构稳定',
    'stability.bad': '结构稳定不足',
    'sha.exposed': '煞气外露',
    'sha.reduced': '煞气已被化解',
    'sha.screen': '影壁化煞',
    'integrity.penalty': '建筑完整性不足',
    integrity_penalty: '建筑完整性不足',
  }[code] ?? code;
}
