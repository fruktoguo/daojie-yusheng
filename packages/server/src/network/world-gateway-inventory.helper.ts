/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界网关背包/装备 helper。
 * 收敛物品使用、销毁、丢弃、装备、卸下、整理、采集和拾取等入口。
 */

import type { WorldGatewayHelperContext } from './world-gateway-context.types';

import { BadRequestException } from '@nestjs/common';
import { ITEM_TYPES, S2C, matchesInventoryTypeFilter, type ItemType } from '@mud/shared';
import { buildStructuredNotice } from '../runtime/world/structured-notice.helpers';

const INVENTORY_PAGE_DEFAULT_LIMIT = 30;
const INVENTORY_PAGE_MAX_LIMIT = 30;
const BULK_DROP_MAX_ITEMS = 200;
const INVENTORY_PAGE_FILTERS = new Set<string>(['all', ...ITEM_TYPES]);

/** 世界 socket 背包/装备 helper：只收敛 inventory/equipment 相关入口。 */
class WorldGatewayInventoryHelper {
/**
 * gateway：gateway相关字段。
 */
    private readonly gateway: WorldGatewayHelperContext;
/**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param gateway 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(gateway: WorldGatewayHelperContext) {
        this.gateway = gateway;
    }    
    /**
 * handleDestroyItem：处理销毁道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新销毁道具相关状态。
 */

    handleDestroyItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const itemInstanceId = this.resolveInventoryItemInstanceId(playerId, payload, 'destroyItem');
            if (!itemInstanceId) {
                throw new Error('背包物品目标缺失，请重新选择。');
            }
            const destroyed = this.gateway.playerRuntimeService.destroyInventoryItemByInstanceId(playerId, itemInstanceId, payload?.count);
            this.gateway.playerRuntimeService.enqueueNotice(playerId, {
                text: `你摧毁了 ${destroyed.name ?? destroyed.itemId} x${destroyed.count}。`,
                kind: 'info',
            });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DESTROY_ITEM_FAILED', error);
        }
    }    
    /**
 * handleSortInventory：处理整理背包并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新整理背包相关状态。
 */

    handleSortInventory(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.sortInventory(playerId);
            this.gateway.playerRuntimeService.enqueueNotice(playerId, {
                text: '背包已整理',
                kind: 'info',
            });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SORT_INVENTORY_FAILED', error);
        }
    }    
    /**
 * executeUseItem：执行executeUse道具相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeUse道具相关状态。
 */

    executeUseItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueUseItem(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'USE_ITEM_FAILED', error);
        }
    }    
    /**
 * handleUseItem：处理使用道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新使用道具相关状态。
 */

    handleUseItem(client, payload) {
        this.executeUseItem(client, payload);
    }    
    handleRepairInventoryItemInstanceIds(client, _payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const repairedCount = this.gateway.playerRuntimeService.repairInventoryItemInstanceIds(playerId);
            const notice = buildStructuredNotice(
                repairedCount > 0 ? 'success' : 'info',
                repairedCount > 0 ? 'notice.inventory.instance-id-repaired' : 'notice.inventory.instance-id-repair-not-needed',
                repairedCount > 0 ? '背包物品身份已修复，请重新选择。' : '背包物品身份已是最新。',
                { vars: { count: repairedCount } },
            );
            this.gateway.worldClientEventService.emitNoticeItems(client, [{
                kind: notice.kind,
                text: notice.text,
                structured: notice.structured,
            }]);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REPAIR_INVENTORY_ITEM_INSTANCE_IDS_FAILED', error);
        }
    }
    handleRequestInventoryPage(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const player = this.gateway.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                throw new BadRequestException('玩家不存在');
            }
            client.emit(S2C.InventoryPage, buildInventoryPagePayload(player, payload));
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REQUEST_INVENTORY_PAGE_FAILED', error);
        }
    }
    handleSetArtifactSlotEnabled(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSetArtifactSlotEnabled(
                playerId,
                payload,
                this.gateway.worldRuntimeService,
            );
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SET_ARTIFACT_SLOT_ENABLED_FAILED', error);
        }
    }
    handleCreateFormation(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCreateFormation(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CREATE_FORMATION_FAILED', error);
        }
    }
    handleSetFormationActive(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueSetFormationActive(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'SET_FORMATION_ACTIVE_FAILED', error);
        }
    }
    handleRefillFormation(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueRefillFormation(playerId, payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'REFILL_FORMATION_FAILED', error);
        }
    }
    /**
 * executeDropItem：执行executeDrop道具相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeDrop道具相关状态。
 */

    executeDropItem(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueDropItem(playerId, payload, payload?.count, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'DROP_ITEM_FAILED', error);
        }
    }    
    /**
 * handleDropItem：处理丢弃道具并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新丢弃道具相关状态。
 */

    handleDropItem(client, payload) {
        this.executeDropItem(client, payload);
    }    
    handleBulkDropItems(client, payload) {
        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            const itemInstanceIds = normalizeBulkDropItemInstanceIds(payload);
            this.gateway.worldRuntimeService.worldRuntimeItemGroundService.dispatchBulkDropItems(playerId, itemInstanceIds, this.gateway.worldRuntimeService);
            (this.gateway.worldRuntimeService as { requestPlayerDeltaSync?: (targetPlayerId: string) => void }).requestPlayerDeltaSync?.(playerId);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'BULK_DROP_ITEMS_FAILED', error);
        }
    }
    /**
 * handleTakeGround：处理Take地面并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    handleTakeGround(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            if (payload?.takeAll) {
                this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueTakeGroundAll(playerId, payload?.sourceId, this.gateway.worldRuntimeService);
                return;
            }
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueTakeGround(playerId, payload?.sourceId, payload?.itemKey, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'TAKE_GROUND_FAILED', error);
        }
    }    
    /**
 * handleStartGather：处理开始草药采集并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新开始草药采集相关状态。
 */

    handleStartGather(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueStartTechniqueActivity(playerId, 'gather', payload, this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'START_GATHER_FAILED', error);
        }
    }    
    /**
 * handleCancelGather：处理取消草药采集并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新取消草药采集相关状态。
 */

    handleCancelGather(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldClientEventService.markProtocol(client, 'mainline');
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueCancelTechniqueActivity(playerId, 'gather', this.gateway.worldRuntimeService);
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'CANCEL_GATHER_FAILED', error);
        }
    }    
    /**
 * handleStopLootHarvest：处理停止连续采摘并更新相关状态。
 * @param client 参数说明。
 * @param _payload 参数说明。
 * @returns 无返回值，直接更新停止连续采摘相关状态。
 */

    handleStopLootHarvest(client, _payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.playerRuntimeService.clearLootWindow(playerId);
            client.emit(S2C.LootWindowUpdate, { window: null });
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'STOP_LOOT_HARVEST_FAILED', error);
        }
    }    
    /**
 * executeEquip：执行executeEquip相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeEquip相关状态。
 */

    executeEquip(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueEquip(
                playerId,
                payload,
                this.gateway.worldRuntimeService,
            );
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'EQUIP_FAILED', error);
        }
    }    
    /**
 * handleEquip：处理装备并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新装备相关状态。
 */

    handleEquip(client, payload) {
        this.executeEquip(client, payload);
    }    
    /**
 * executeUnequip：执行executeUnequip相关逻辑。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新executeUnequip相关状态。
 */

    executeUnequip(client, payload) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const playerId = this.gateway.gatewayGuardHelper.requirePlayerId(client);
        if (!playerId) {
            return;
        }
        try {
            this.gateway.worldRuntimeService.worldRuntimeCommandIntakeFacadeService.enqueueUnequip(
                playerId,
                payload?.slot,
                this.gateway.worldRuntimeService,
                typeof payload?.expectedItemInstanceId === 'string' ? payload.expectedItemInstanceId : undefined,
            );
        }
        catch (error) {
            this.gateway.worldClientEventService.emitGatewayError(client, 'UNEQUIP_FAILED', error);
        }
    }    
    /**
 * handleUnequip：处理卸下装备并更新相关状态。
 * @param client 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新卸下装备相关状态。
 */

    handleUnequip(client, payload) {
        this.executeUnequip(client, payload);
    }

    private resolveInventoryItemInstanceId(playerId: string, payload: any, eventName: string): string {
        const direct = normalizeInventoryItemInstanceId(payload?.itemRef?.itemInstanceId)
            || normalizeInventoryItemInstanceId(payload?.itemInstanceId)
            || normalizeInventoryItemInstanceId(payload?.expectedItemInstanceId);
        if (direct) {
            return direct;
        }
        this.gateway.playerRuntimeService.repairInventoryItemInstanceIds(playerId);
        throw new BadRequestException('背包物品身份已修复，请重新选择。');
    }
}

export { WorldGatewayInventoryHelper };

function normalizeInventoryItemInstanceId(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function buildInventoryPagePayload(player: any, payload: any) {
    const filter = normalizeInventoryPageFilter(payload?.filter);
    const search = normalizeInventoryPageSearch(payload?.search);
    const offset = normalizeInventoryPageOffset(payload?.offset);
    const limit = normalizeInventoryPageLimit(payload?.limit);
    const items = Array.isArray(player?.inventory?.items) ? player.inventory.items : [];
    const pageItems: Array<{ slotIndex: number; item: ReturnType<typeof projectInventoryPageItem> }> = [];
    let total = 0;
    for (let slotIndex = 0; slotIndex < items.length; slotIndex += 1) {
        const item = items[slotIndex];
        if (!item || !matchesInventoryPageFilter(item, filter) || !matchesInventoryPageSearch(item, search)) {
            continue;
        }
        if (total >= offset && pageItems.length < limit) {
            pageItems.push({
                slotIndex,
                item: projectInventoryPageItem(item),
            });
        }
        total += 1;
    }
    const cooldowns = Array.isArray(player?.inventory?.cooldowns)
        ? player.inventory.cooldowns.map((entry) => ({ ...entry }))
        : undefined;
    return {
        requestId: normalizeInventoryPageRequestId(payload?.requestId),
        filter,
        search,
        offset,
        limit,
        total,
        totalItems: items.length,
        capacity: Math.max(0, Math.trunc(Number(player?.inventory?.capacity ?? 0) || 0)),
        revision: Math.max(1, Math.trunc(Number(player?.inventory?.revision ?? 1) || 1)),
        items: pageItems,
        ...(cooldowns ? { cooldowns } : {}),
        ...(Number.isFinite(Number(player?.inventory?.serverTick))
            ? { serverTick: Math.max(0, Math.trunc(Number(player.inventory.serverTick) || 0)) }
            : {}),
    };
}

function normalizeInventoryPageFilter(value: unknown): string {
    const filter = typeof value === 'string' ? value.trim() : 'all';
    return INVENTORY_PAGE_FILTERS.has(filter) ? filter : 'all';
}

function normalizeInventoryPageOffset(value: unknown): number {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeInventoryPageLimit(value: unknown): number {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return INVENTORY_PAGE_DEFAULT_LIMIT;
    }
    return Math.max(1, Math.min(INVENTORY_PAGE_MAX_LIMIT, parsed));
}

function normalizeInventoryPageSearch(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    return value.replace(/\s+/g, ' ').trim().slice(0, 64).toLowerCase();
}

function normalizeInventoryPageRequestId(value: unknown): string | undefined {
    const requestId = typeof value === 'string' ? value.trim() : '';
    return requestId ? requestId.slice(0, 80) : undefined;
}

function normalizeBulkDropItemInstanceIds(payload: any): string[] {
    const refs = Array.isArray(payload?.itemRefs) ? payload.itemRefs : [];
    const itemInstanceIds: string[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
        const itemInstanceId = normalizeInventoryItemInstanceId(ref?.itemInstanceId);
        if (!itemInstanceId || seen.has(itemInstanceId)) {
            continue;
        }
        seen.add(itemInstanceId);
        itemInstanceIds.push(itemInstanceId);
        if (itemInstanceIds.length >= BULK_DROP_MAX_ITEMS) {
            break;
        }
    }
    if (itemInstanceIds.length === 0) {
        throw new BadRequestException('请选择要丢弃的物品。');
    }
    return itemInstanceIds;
}

function matchesInventoryPageFilter(item: any, filter: string): boolean {
    return matchesInventoryTypeFilter(
        typeof item?.type === 'string' ? item.type as ItemType : null,
        filter === 'all' ? 'all' : filter as ItemType,
    );
}

function matchesInventoryPageSearch(item: any, search: string): boolean {
    if (!search) {
        return true;
    }
    const searchable = [
        item?.itemId,
        item?.name,
        item?.groundLabel,
        item?.type,
        item?.grade,
    ]
        .map((value) => typeof value === 'string' ? value.toLowerCase() : '')
        .filter(Boolean)
        .join(' ');
    if (!searchable) {
        return false;
    }
    return search.split(' ').every((term) => term.length === 0 || searchable.includes(term));
}

function projectInventoryPageItem(item: any) {
    const itemInstanceId = normalizeInventoryItemInstanceId(item?.itemInstanceId);
    const enhanceLevel = Math.max(0, Math.trunc(Number(item?.enhanceLevel ?? 0) || 0));
    return {
        itemId: String(item?.itemId ?? ''),
        ...(itemInstanceId ? { itemInstanceId } : {}),
        count: Math.max(0, Math.trunc(Number(item?.count ?? 0) || 0)),
        ...(enhanceLevel > 0 ? { enhanceLevel } : {}),
    };
}
