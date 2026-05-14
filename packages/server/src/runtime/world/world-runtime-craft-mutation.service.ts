/**
 * 制作变更刷新服务
 * 负责制作结果的面板更新推送、掉落物兜底和 mutation 状态刷新
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { WorldSessionService } from '../../network/world-session.service';
import { WorldClientEventService } from '../../network/world-client-event.service';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { CraftPanelRuntimeService } from '../craft/craft-panel-runtime.service';
import { emitTechniqueActivityPanel, listTechniqueActivityRefreshKinds } from '../craft/technique-activity-registry.helpers';
import { buildStructuredNotice } from './structured-notice.helpers';

/** craft shared mutation orchestration：承接 panel 更新、掉地兜底与 mutation flush。 */
@Injectable()
export class WorldRuntimeCraftMutationService {
    logger = new Logger(WorldRuntimeCraftMutationService.name);
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * craftPanelRuntimeService：炼制面板运行态服务引用。
 */

    craftPanelRuntimeService;    
    /**
 * worldSessionService：世界Session服务引用。
 */

    worldSessionService;    
    /**
 * worldClientEventService：世界Client事件服务引用。
 */

    worldClientEventService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldSessionService 参数说明。
 * @param worldClientEventService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(CraftPanelRuntimeService) craftPanelRuntimeService: any,
        @Inject(WorldSessionService) worldSessionService: any,
        @Inject(WorldClientEventService) worldClientEventService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
    }    
    /**
 * emitCraftPanelUpdate：处理炼制面板Update并更新相关状态。
 * @param playerId 玩家 ID。
 * @param panel 参数说明。
 * @param _deps 参数说明。
 * @returns 无返回值，直接更新炼制面板Update相关状态。
 */

    emitCraftPanelUpdate(playerId, panel, _deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!socket || !player || !this.worldClientEventService.prefersMainline(socket)) {
            return;
        }
        const hasActivePanelJob = typeof this.craftPanelRuntimeService.hasActiveTechniqueActivity === 'function'
            ? this.craftPanelRuntimeService.hasActiveTechniqueActivity(player, panel)
            : Boolean(panel === 'enhancement' ? player.enhancementJob : player.alchemyJob);
        const payload = hasActivePanelJob && typeof this.craftPanelRuntimeService.buildTechniqueActivityPanelPatchPayload === 'function'
            ? this.craftPanelRuntimeService.buildTechniqueActivityPanelPatchPayload(player, panel)
            : this.craftPanelRuntimeService.buildTechniqueActivityPanelPayload(player, panel);
        emitTechniqueActivityPanel(socket, panel, payload);

        // EventBus: 同步发射 panelPatch 供统一消费侧使用
        const eventBus = this.playerRuntimeService.runtimeEventBusService;
        if (eventBus && payload) {
            eventBus.queuePlayerPanelPatch(playerId, panel, payload);
        }
    }    
    /**
 * emitAllTechniqueActivityPanelUpdates：按统一技艺顺序补发所有面板。
 * @param playerId 玩家 ID。
 * @param deps 参数说明。
 * @returns 无返回值，直接更新所有技艺面板相关状态。
 */

    emitAllTechniqueActivityPanelUpdates(playerId, deps) {
        for (const kind of listTechniqueActivityRefreshKinds()) {
            this.emitCraftPanelUpdate(playerId, kind, deps);
        }
    }    
    /** 判断指定技艺面板是否有运行中任务，需要每息推送运行态小包。 */
    hasActiveCraftPanelJob(playerId, panel) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player || typeof this.craftPanelRuntimeService.hasActiveTechniqueActivity !== 'function') {
            return false;
        }
        return this.craftPanelRuntimeService.hasActiveTechniqueActivity(player, panel);
    }

    /**
 * flushCraftMutation：执行刷新炼制Mutation相关逻辑。
 * @param playerId 玩家 ID。
 * @param result 返回结果。
 * @param panel 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新flush炼制Mutation相关状态。
 */

    flushCraftMutation(playerId, result, panel, deps, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!result?.ok) {
            return;
        }
        if (!options.skipActiveJobPersistence) {
            void this.persistActiveJobIfNeeded(playerId, deps).catch((error) => {
                this.logger.warn(`活跃任务 durable 记账失败：${error instanceof Error ? error.message : String(error)}`);
            });
        }
        if (Array.isArray(result.groundDrops) && result.groundDrops.length > 0) {
            this.dropCraftGroundItems(playerId, result.groundDrops, deps);
        }
        this.grantCraftRealmExp(playerId, result.craftRealmExpGain);
        for (const message of result.messages ?? []) {
            if (message?.text) {
                deps.queuePlayerNotice(playerId, message.text, message.kind ?? 'info');
            }
        }
        if (result.panelChanged || this.hasActiveCraftPanelJob(playerId, panel)) {
            this.emitCraftPanelUpdate(playerId, panel, deps);
        }
    }    
    /** 在 durable 任务成功后补发制造附带的境界修为。 */
    grantCraftRealmExp(playerId, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const normalized = Number(amount);
        if (!Number.isFinite(normalized) || normalized <= 0) {
            return;
        }
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const result = this.playerRuntimeService.playerProgressionService?.grantCraftRealmExp?.(player, normalized);
        if (result) {
            this.playerRuntimeService.applyProgressionResult(player, result);
        }
    }

    /**
 * persistActiveJobIfNeeded：处理活跃Job持久化相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新活跃Job持久化相关状态。
 */

    async persistActiveJobIfNeeded(playerId, deps) {
  // 后备写入路径：直接走 advisory lock + UPSERT（Path A），不做 CAS 版本检查。
  // 权威 CAS 写入由 durable tick/start/cancel 路径负责；此处仅确保 DB 不落后于内存。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player || !player.playerId) {
            return;
        }
        if (player.suppressImmediateDomainPersistence === true) {
            return;
        }
        const activeJob = player.enhancementJob ?? player.forgingJob ?? player.alchemyJob;
        if (!activeJob || !activeJob.jobRunId) {
            return;
        }
        await this.craftPanelRuntimeService.persistTechniqueActivitySnapshot(player);
    }

    /**
 * dropCraftGroundItems：执行drop炼制地面道具相关逻辑。
 * @param playerId 玩家 ID。
 * @param items 道具列表。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新drop炼制Ground道具相关状态。
 */

    dropCraftGroundItems(playerId, items, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const instance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        for (const item of items) {
            try {
                deps.spawnGroundItem(instance, player.x, player.y, item);
                const n = buildStructuredNotice('loot', 'notice.craft.overflow-ground', `${formatItemStackLabel(item)} 背包放不下，已落在你脚边。`, { vars: { itemLabel: formatItemStackLabel(item) }, pills: [{ key: 'itemLabel', style: 'target' }] });
                deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            }
            catch {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
                const n = buildStructuredNotice('warn', 'notice.craft.overflow-inventory', `${formatItemStackLabel(item)} 无法落地，已直接放回背包。`, { vars: { itemLabel: formatItemStackLabel(item) }, pills: [{ key: 'itemLabel', style: 'target' }] });
                deps.queuePlayerNotice(playerId, n.text, n.kind, undefined, undefined, n.structured);
            }
        }
    }
};
/**
 * formatItemStackLabel：规范化或转换道具StackLabel。
 * @param item 道具。
 * @returns 无返回值，直接更新道具StackLabel相关状态。
 */

function formatItemStackLabel(item) {
    return `${item.name ?? item.itemId} x${Math.max(1, Math.floor(Number(item.count) || 1))}`;
}
