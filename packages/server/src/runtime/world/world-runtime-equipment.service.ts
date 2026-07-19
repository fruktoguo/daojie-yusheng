/**
 * 装备穿戴/卸下结算服务。
 *
 * 装备槽与背包共同构成一笔玩家资产变更。正式持久化启用时，两者必须先在
 * DurableOperationService 中同事务提交，随后才能更新运行态，避免断线、跨实例
 * 或分域刷盘只落下一半状态。
 */
import { randomUUID } from 'node:crypto';
import {
  ARTIFACT_SLOTS,
  EQUIP_SLOTS,
  getItemDisplayName,
  mergeItemStackInto,
  type ItemStack,
} from '@mud/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DurableOperationService,
  type DurableEquipmentSlotSnapshot,
  type DurableInventoryItemSnapshot,
} from '../../persistence/durable-operation.service';
import {
  PlayerDomainPersistenceService,
  nextPlayerPersistenceVersion,
} from '../../persistence/player-domain-persistence.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import {
  assignItemInstanceIdIfNeeded,
  compareItemInstanceId,
  isItemInstanceIdHardCheckEnabled,
} from './item-instance-id.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';

type RuntimeItem = ItemStack & Record<string, unknown>;

interface RuntimeEquipmentSlot {
  slot: string;
  item: RuntimeItem | null;
}

interface RuntimePlayerEquipmentState {
  playerId: string;
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
  instanceId?: string | null;
  inventory: {
    items: RuntimeItem[];
  };
  equipment: {
    slots: RuntimeEquipmentSlot[];
  };
}

interface ItemNormalizer {
  normalizeItem(item: unknown): RuntimeItem | null;
}

interface EquipmentLoadoutMutation {
  slot: string;
  nextInventoryItems: RuntimeItem[];
  nextEquipmentSlots: RuntimeEquipmentSlot[];
}

interface InstanceLeaseContext {
  assignedNodeId: string;
  ownershipEpoch: number;
}

/** world-runtime equipment orchestration：承接装备穿戴/卸下结算。 */
@Injectable()
export class WorldRuntimeEquipmentService {
  private readonly logger = new Logger(WorldRuntimeEquipmentService.name);

  constructor(
    @Inject(PlayerRuntimeService)
    private readonly playerRuntimeService: PlayerRuntimeService,
    @Optional()
    @Inject(DurableOperationService)
    private readonly durableOperationService: DurableOperationService | null = null,
    @Optional()
    @Inject(PlayerDomainPersistenceService)
    private readonly playerDomainPersistenceService: PlayerDomainPersistenceService | null = null,
  ) {}

  /** 按稳定物品实例 ID 穿戴装备。 */
  async dispatchEquipItem(playerId: string, itemInstanceId: string, deps: any): Promise<void> {
    await this.runExclusivePlayerAssetMutation(playerId, async () => {
      const item = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId) as RuntimeItem | null;
      if (!item) {
        throw new NotFoundException(`背包物品不存在：${itemInstanceId || 'unknown'}`);
      }
      const normalizer = resolveItemNormalizer(deps, this.playerRuntimeService);
      const normalizedItem = normalizeRuntimeItem(item, normalizer);
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId) as RuntimePlayerEquipmentState;
      const lockReason = normalizedItem.equipSlot
        ? deps.craftPanelRuntimeService.getLockedSlotReason(player, normalizedItem.equipSlot)
        : null;
      if (lockReason) {
        throw new BadRequestException(lockReason);
      }

      const durableOperationService = this.durableOperationService ?? deps?.durableOperationService ?? null;
      const durableEnabled = durableOperationService?.isEnabled?.() === true;
      this.assertDurableEquipmentPathAvailable(durableEnabled);

      if (durableEnabled && normalizedItem.type !== 'artifact') {
        const mutation = buildEquipLoadoutMutation(player, itemInstanceId, normalizer);
        await this.commitEquipmentLoadout(playerId, 'equip', mutation, durableOperationService, deps);
        this.applyCommittedLoadout(playerId, mutation);
      } else {
        this.playerRuntimeService.equipItemByInstanceId(playerId, itemInstanceId);
      }

      const itemName = getItemDisplayName(normalizedItem);
      const notice = buildStructuredNotice(
        'success',
        'notice.equip.equipped',
        `装备 ${itemName}`,
        { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] },
      );
      deps.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
      deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
      deps?.requestPlayerDeltaSync?.(playerId);
    });
  }

  /** 将指定装备槽物品卸回背包。 */
  async dispatchUnequipItem(
    playerId: string,
    slot: string,
    deps: any,
    expectedItemInstanceId?: string,
  ): Promise<void> {
    await this.runExclusivePlayerAssetMutation(playerId, async () => {
      const item = this.playerRuntimeService.peekEquippedItem(playerId, slot) as RuntimeItem | null;
      if (!item) {
        throw new NotFoundException(`装备槽位为空：${slot}`);
      }
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId) as RuntimePlayerEquipmentState;
      const lockReason = (EQUIP_SLOTS as readonly string[]).includes(slot)
        ? deps.craftPanelRuntimeService.getLockedSlotReason(player, slot)
        : null;
      if (lockReason) {
        throw new BadRequestException(lockReason);
      }

      const durableOperationService = this.durableOperationService ?? deps?.durableOperationService ?? null;
      const durableEnabled = durableOperationService?.isEnabled?.() === true;
      this.assertDurableEquipmentPathAvailable(durableEnabled);

      if (durableEnabled && (EQUIP_SLOTS as readonly string[]).includes(slot)) {
        this.assertExpectedEquippedItem(playerId, slot, item, expectedItemInstanceId);
        const mutation = buildUnequipLoadoutMutation(player, slot);
        await this.commitEquipmentLoadout(playerId, 'unequip', mutation, durableOperationService, deps);
        this.applyCommittedLoadout(playerId, mutation);
      } else {
        this.playerRuntimeService.unequipItem(playerId, slot, expectedItemInstanceId);
      }

      const itemName = getItemDisplayName(item);
      const notice = buildStructuredNotice(
        'info',
        'notice.equip.unequipped',
        `卸下 ${itemName}`,
        { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] },
      );
      deps.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
      deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
      deps?.requestPlayerDeltaSync?.(playerId);
    });
  }

  /** 设置法宝槽位启用开关。 */
  async dispatchSetArtifactSlotEnabled(playerId: string, slot: string, enabled: boolean, deps: any): Promise<void> {
    await this.runExclusivePlayerAssetMutation(playerId, () => {
      if (!(ARTIFACT_SLOTS as readonly string[]).includes(slot)) {
        throw new NotFoundException(`法宝槽位不存在：${slot}`);
      }
      this.playerRuntimeService.setArtifactSlotEnabled(playerId, slot, enabled === true);
      deps?.requestPlayerDeltaSync?.(playerId);
    });
  }

  private async commitEquipmentLoadout(
    playerId: string,
    action: 'equip' | 'unequip',
    mutation: EquipmentLoadoutMutation,
    durableOperationService: DurableOperationService,
    deps: any,
  ): Promise<void> {
    if (!(await this.syncCurrentPresenceFence(playerId))) {
      throw new ServiceUnavailableException('装备资产事务围栏暂不可用，请稍后重试');
    }
    const location = typeof deps?.getPlayerLocation === 'function'
      ? deps.getPlayerLocation(playerId)
      : null;
    const instanceId = normalizeOptionalString(location?.instanceId)
      ?? normalizeOptionalString((this.playerRuntimeService.getPlayerOrThrow(playerId) as RuntimePlayerEquipmentState).instanceId);
    const leaseContext = await resolveInstanceLeaseContext(instanceId, deps);
    const operationId = `op:${playerId}:equipment:${randomUUID()}`;

    const commit = async (): Promise<void> => {
      const player = this.playerRuntimeService.getPlayerOrThrow(playerId) as RuntimePlayerEquipmentState;
      const runtimeOwnerId = normalizeOptionalString(player.runtimeOwnerId);
      const sessionEpoch = normalizePositiveInteger(player.sessionEpoch);
      if (!runtimeOwnerId || sessionEpoch <= 0) {
        throw new ServiceUnavailableException('装备资产事务围栏暂不可用，请稍后重试');
      }
      await durableOperationService.updateEquipmentLoadout({
        operationId,
        playerId,
        expectedRuntimeOwnerId: runtimeOwnerId,
        expectedSessionEpoch: sessionEpoch,
        expectedInstanceId: instanceId,
        expectedAssignedNodeId: leaseContext?.assignedNodeId ?? null,
        expectedOwnershipEpoch: leaseContext?.ownershipEpoch ?? null,
        action,
        slot: mutation.slot,
        nextInventoryItems: mutation.nextInventoryItems as unknown as DurableInventoryItemSnapshot[],
        nextEquipmentSlots: mutation.nextEquipmentSlots as unknown as DurableEquipmentSlotSnapshot[],
      });
    };

    try {
      await commit();
    } catch (error) {
      if (!shouldRetryEquipmentFence(error) || !(await this.syncCurrentPresenceFence(playerId))) {
        throw error;
      }
      await commit();
    }
  }

  private applyCommittedLoadout(playerId: string, mutation: EquipmentLoadoutMutation): void {
    this.playerRuntimeService.replaceInventoryItems(playerId, mutation.nextInventoryItems);
    this.playerRuntimeService.replaceEquipmentSlots(playerId, mutation.nextEquipmentSlots);
  }

  private assertDurableEquipmentPathAvailable(durableEnabled: boolean): void {
    if (this.playerDomainPersistenceService?.isEnabled?.() === true && !durableEnabled) {
      throw new ServiceUnavailableException('装备资产事务暂不可用，请稍后重试');
    }
  }

  private assertExpectedEquippedItem(
    playerId: string,
    slot: string,
    item: RuntimeItem,
    expectedItemInstanceId?: string,
  ): void {
    const comparison = compareItemInstanceId(item.itemInstanceId, expectedItemInstanceId);
    if (comparison !== 'mismatch') {
      return;
    }
    const hardCheck = isItemInstanceIdHardCheckEnabled();
    this.logger.warn(
      `卸装目标实例不一致 player=${playerId} slot=${slot} expected=${expectedItemInstanceId} actual=${item.itemInstanceId ?? ''} hardCheck=${hardCheck}`,
    );
    if (hardCheck) {
      throw new BadRequestException('装备目标已变更，请重新选择。');
    }
  }

  /** 将数据库在线围栏推进到当前运行态，避免重连后的首笔资产事务被旧 owner 拒绝。 */
  private async syncCurrentPresenceFence(playerId: string): Promise<boolean> {
    if (!this.playerDomainPersistenceService?.isEnabled?.()) {
      return false;
    }
    const persistedPresence = typeof this.playerDomainPersistenceService.loadPlayerPresence === 'function'
      ? await this.playerDomainPersistenceService.loadPlayerPresence(playerId)
      : null;
    let presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
      return false;
    }
    const persistedSessionEpoch = normalizePositiveInteger(persistedPresence?.sessionEpoch);
    const persistedRuntimeOwnerId = normalizeOptionalString(persistedPresence?.runtimeOwnerId);
    const runtimeSessionEpoch = normalizePositiveInteger(presence.sessionEpoch);
    const runtimeOwnerId = normalizeOptionalString(presence.runtimeOwnerId);
    if (
      persistedSessionEpoch > 0
      && (
        runtimeSessionEpoch <= persistedSessionEpoch
        || Boolean(persistedRuntimeOwnerId && persistedRuntimeOwnerId !== runtimeOwnerId)
      )
    ) {
      this.playerRuntimeService.ensureRuntimeSessionFenceAtLeast(playerId, persistedSessionEpoch);
      presence = this.playerRuntimeService.describePersistencePresence?.(playerId) ?? null;
    }
    if (!presence?.runtimeOwnerId || !presence?.sessionEpoch) {
      return false;
    }
    await this.playerDomainPersistenceService.savePlayerPresence(playerId, {
      ...presence,
      versionSeed: nextPlayerPersistenceVersion(),
    });
    return true;
  }

  private async runExclusivePlayerAssetMutation<T>(
    playerId: string,
    action: () => Promise<T> | T,
  ): Promise<T> {
    const coordinator = this.playerRuntimeService.runExclusiveAssetMutation;
    if (typeof coordinator !== 'function') {
      return await action();
    }
    return coordinator.call(this.playerRuntimeService, [playerId], action);
  }
}

function buildEquipLoadoutMutation(
  player: RuntimePlayerEquipmentState,
  itemInstanceId: string,
  normalizer: ItemNormalizer | null,
): EquipmentLoadoutMutation {
  const nextInventoryItems = cloneRuntimeItems(player.inventory?.items);
  const normalizedItemInstanceId = normalizeOptionalString(itemInstanceId);
  const inventoryIndex = nextInventoryItems.findIndex(
    (entry) => normalizeOptionalString(entry.itemInstanceId) === normalizedItemInstanceId,
  );
  if (inventoryIndex < 0) {
    throw new NotFoundException(`背包物品不存在：${normalizedItemInstanceId ?? 'unknown'}`);
  }
  const sourceItem = nextInventoryItems[inventoryIndex]!;
  assignItemInstanceIdIfNeeded(sourceItem);
  const displayItem = normalizeRuntimeItem(sourceItem, normalizer);
  const slot = normalizeOptionalString(displayItem.equipSlot);
  if (!slot || !(EQUIP_SLOTS as readonly string[]).includes(slot)) {
    throw new NotFoundException(`${getItemDisplayName(displayItem)}不能装备`);
  }

  const nextEquipmentSlots = cloneRuntimeEquipmentSlots(player.equipment?.slots);
  const equipmentEntry = nextEquipmentSlots.find((entry) => entry.slot === slot);
  if (!equipmentEntry) {
    throw new NotFoundException(`装备槽位不存在：${slot}`);
  }

  const equippedItem = takeSingleInventoryItem(nextInventoryItems, inventoryIndex);
  if (!equippedItem) {
    throw new NotFoundException(`背包物品不存在：${normalizedItemInstanceId ?? 'unknown'}`);
  }
  const previousEquipped = equipmentEntry.item ? cloneRuntimeItem(equipmentEntry.item) : null;
  equipmentEntry.item = equippedItem;
  if (previousEquipped) {
    assignItemInstanceIdIfNeeded(previousEquipped);
    mergeItemStackInto(nextInventoryItems, previousEquipped);
  }

  return {
    slot,
    nextInventoryItems,
    nextEquipmentSlots,
  };
}

function buildUnequipLoadoutMutation(
  player: RuntimePlayerEquipmentState,
  slot: string,
): EquipmentLoadoutMutation {
  const nextInventoryItems = cloneRuntimeItems(player.inventory?.items);
  const nextEquipmentSlots = cloneRuntimeEquipmentSlots(player.equipment?.slots);
  const equipmentEntry = nextEquipmentSlots.find((entry) => entry.slot === slot);
  if (!equipmentEntry?.item) {
    throw new NotFoundException(`装备槽位为空：${slot}`);
  }
  const unequippedItem = cloneRuntimeItem(equipmentEntry.item);
  assignItemInstanceIdIfNeeded(unequippedItem);
  mergeItemStackInto(nextInventoryItems, unequippedItem);
  equipmentEntry.item = null;
  return {
    slot,
    nextInventoryItems,
    nextEquipmentSlots,
  };
}

function takeSingleInventoryItem(items: RuntimeItem[], index: number): RuntimeItem | null {
  const sourceItem = items[index];
  if (!sourceItem) {
    return null;
  }
  const count = Math.max(1, Math.trunc(Number(sourceItem.count ?? 1)));
  if (count <= 1) {
    const [removed] = items.splice(index, 1);
    return removed ? { ...removed, count: 1 } : null;
  }
  sourceItem.count = count - 1;
  return {
    ...sourceItem,
    count: 1,
    itemInstanceId: randomUUID(),
  };
}

function cloneRuntimeItems(items: RuntimeItem[] | null | undefined): RuntimeItem[] {
  return Array.isArray(items) ? items.map(cloneRuntimeItem) : [];
}

function cloneRuntimeEquipmentSlots(
  slots: RuntimeEquipmentSlot[] | null | undefined,
): RuntimeEquipmentSlot[] {
  return Array.isArray(slots)
    ? slots.map((entry) => ({
      slot: entry.slot,
      item: entry.item ? cloneRuntimeItem(entry.item) : null,
    }))
    : [];
}

function cloneRuntimeItem(item: RuntimeItem): RuntimeItem {
  return { ...item };
}

function normalizeRuntimeItem(item: RuntimeItem, normalizer: ItemNormalizer | null): RuntimeItem {
  return normalizer?.normalizeItem(item) ?? item;
}

function resolveItemNormalizer(deps: any, playerRuntimeService: PlayerRuntimeService): ItemNormalizer | null {
  if (typeof deps?.contentTemplateRepository?.normalizeItem === 'function') {
    return deps.contentTemplateRepository as ItemNormalizer;
  }
  const repository = (playerRuntimeService as unknown as { contentTemplateRepository?: ItemNormalizer }).contentTemplateRepository;
  return typeof repository?.normalizeItem === 'function' ? repository : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function shouldRetryEquipmentFence(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  return message.startsWith('player_session_fencing_conflict');
}

async function resolveInstanceLeaseContext(
  instanceId: string | null,
  deps: any,
): Promise<InstanceLeaseContext | null> {
  const instanceCatalogService = deps?.instanceCatalogService ?? null;
  if (!instanceId || !instanceCatalogService?.isEnabled?.()) {
    return null;
  }
  const catalog = await instanceCatalogService.loadInstanceCatalog?.(instanceId);
  const assignedNodeId = normalizeOptionalString(catalog?.assigned_node_id);
  const ownershipEpoch = normalizePositiveInteger(catalog?.ownership_epoch);
  if (!assignedNodeId || ownershipEpoch <= 0) {
    return null;
  }
  return { assignedNodeId, ownershipEpoch };
}
