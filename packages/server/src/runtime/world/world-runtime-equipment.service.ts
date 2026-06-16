/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 装备穿戴/卸下结算服务
 * 处理装备穿脱的背包操作、属性刷新和持久化提交
 */
import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ARTIFACT_SLOTS, EQUIP_SLOTS, getItemDisplayName } from '@mud/shared';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { buildStructuredNotice } from './structured-notice.helpers';

/** world-runtime equipment orchestration：承接装备穿戴/卸下结算。 */
@Injectable()
export class WorldRuntimeEquipmentService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
     * 构造器：初始化 当前 实例并建立基础状态。
     * @param playerRuntimeService 参数说明。
     * @returns 无返回值，完成实例初始化。
     */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * dispatchEquipItem：判断Equip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param itemInstanceId 物品实例 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip道具相关状态。
 */

    async dispatchEquipItem(playerId, itemInstanceId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekInventoryItemByInstanceId(playerId, itemInstanceId);
        if (!item) {
            throw new NotFoundException(`背包物品不存在：${itemInstanceId || 'unknown'}`);
        }
        const normalizedItem = deps.contentTemplateRepository?.normalizeItem
            ? deps.contentTemplateRepository.normalizeItem(item)
            : item;
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const lockReason = normalizedItem.equipSlot
            ? deps.craftPanelRuntimeService.getLockedSlotReason(player, normalizedItem.equipSlot)
            : null;
        if (lockReason) {
            throw new BadRequestException(lockReason);
        }
        this.playerRuntimeService.equipItemByInstanceId(playerId, itemInstanceId);
        const itemName = getItemDisplayName(normalizedItem);
        const n1 = buildStructuredNotice('success', 'notice.equip.equipped', `装备 ${itemName}`, { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n1.text, n1.kind, undefined, undefined, n1.structured);
        deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
    }    
    /**
 * dispatchUnequipItem：判断Unequip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip道具相关状态。
 */

    async dispatchUnequipItem(playerId, slot, deps, expectedItemInstanceId?: string) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const item = this.playerRuntimeService.peekEquippedItem(playerId, slot);
        if (!item) {
            throw new NotFoundException(`装备槽位为空：${slot}`);
        }
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const lockReason = (EQUIP_SLOTS as readonly string[]).includes(slot)
            ? deps.craftPanelRuntimeService.getLockedSlotReason(player, slot)
            : null;
        if (lockReason) {
            throw new BadRequestException(lockReason);
        }
        this.playerRuntimeService.unequipItem(playerId, slot, expectedItemInstanceId);
        const itemName = getItemDisplayName(item);
        const n2 = buildStructuredNotice('info', 'notice.equip.unequipped', `卸下 ${itemName}`, { vars: { itemName }, pills: [{ key: 'itemName', style: 'target' }] });
        deps.queuePlayerNotice(playerId, n2.text, n2.kind, undefined, undefined, n2.structured);
        deps.worldRuntimeCraftMutationService.emitAllTechniqueActivityPanelUpdates(playerId, deps);
    }
    /** 设置法宝槽位启用开关。 */
    async dispatchSetArtifactSlotEnabled(playerId, slot, enabled, deps) {
        if (!(ARTIFACT_SLOTS as readonly string[]).includes(slot)) {
            throw new NotFoundException(`法宝槽位不存在：${slot}`);
        }
        this.playerRuntimeService.setArtifactSlotEnabled(playerId, slot, enabled === true);
        deps?.requestPlayerDeltaSync?.(playerId);
    }
};
