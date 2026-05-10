import { Injectable } from '@nestjs/common';
import { ALCHEMY_CATALOG_VERSION, ALCHEMY_FURNACE_TAG, cloneAlchemyCatalogEntry, cloneAlchemyJob, cloneAlchemyPreset } from './craft-panel-alchemy-query.helpers';

/** 炼丹面板只读查询服务：负责炼丹面板状态与目录快照构造。 */
@Injectable()
export class CraftPanelAlchemyQueryService {
/**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @param player 玩家对象。
 * @param knownCatalogVersion 参数说明。
 * @param alchemyCatalog 参数说明。
 * @param equippedWeapon 参数说明。
 * @returns 无返回值，直接更新炼丹面板载荷相关状态。
 */

    buildAlchemyPanelPayload(player, knownCatalogVersion, alchemyCatalog, equippedWeapon) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const state = this.buildAlchemyPanelState(player, equippedWeapon);
        const payload: any = {
            state,
            catalogVersion: ALCHEMY_CATALOG_VERSION,
        };
        if (knownCatalogVersion !== ALCHEMY_CATALOG_VERSION) {
            payload.catalog = alchemyCatalog.map((entry) => cloneAlchemyCatalogEntry(entry));
        }
        return payload;
    }    
    /** 构建炼制/炼器面板运行态增量，高频刷新不重复下发目录和预设。 */
    buildAlchemyPanelPatchPayload(player, kind = 'alchemy') {
        const normalizedKind = kind === 'forging' ? 'forging' : 'alchemy';
        const activeJob = player.alchemyJob
            && (player.alchemyJob.jobType === 'forging' ? 'forging' : 'alchemy') === normalizedKind
            ? cloneAlchemyJob(player.alchemyJob)
            : null;
        return {
            kind: normalizedKind,
            state: null,
            catalogVersion: ALCHEMY_CATALOG_VERSION,
            statePatch: {
                job: activeJob,
                queue: cloneCraftQueue(player.alchemyJob?.queuedJobs ?? player.enhancementJob?.queuedJobs ?? []),
            },
        };
    }

    /**
 * buildAlchemyPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @param equippedWeapon 参数说明。
 * @returns 无返回值，直接更新炼丹面板状态相关状态。
 */

    buildAlchemyPanelState(player, equippedWeapon) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const furnaceItemId = equippedWeapon?.tags?.includes(ALCHEMY_FURNACE_TAG) ? equippedWeapon.itemId : undefined;
        return {
            furnaceItemId,
            presets: (player.alchemyPresets ?? []).map((entry) => cloneAlchemyPreset(entry)),
            job: player.alchemyJob?.jobType === 'forging' ? null : player.alchemyJob ? cloneAlchemyJob(player.alchemyJob) : null,
            queue: cloneCraftQueue(player.alchemyJob?.queuedJobs ?? player.enhancementJob?.queuedJobs ?? []),
        };
    }
};

function cloneCraftQueue(queue) {
    return Array.isArray(queue)
        ? queue.map((entry) => ({ ...entry }))
        : [];
}
