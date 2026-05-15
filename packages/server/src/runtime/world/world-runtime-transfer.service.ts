/**
 * 跨实例传送执行服务
 * 处理玩家从源实例断开、目标实例连接、技能取消、寻路清理等完整传送流程
 */
import { Injectable, Logger } from '@nestjs/common';
import { logServerNextMovement } from '../../debug/movement-debug';

/** world-runtime transfer orchestration：承接跨实例传送写路径。 */
@Injectable()
export class WorldRuntimeTransferService {
/**
 * logger：日志器引用。
 */

    logger = new Logger(WorldRuntimeTransferService.name);
    /**
 * applyTransfer：处理Transfer并更新相关状态。
 * @param transfer 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Transfer相关状态。
 */

    applyTransfer(transfer, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const source = deps.getInstanceRuntime(transfer.fromInstanceId);
        if (!source) {
            return;
        }
        if (typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(source)) {
            if (typeof deps.fenceInstanceRuntime === 'function') {
                deps.fenceInstanceRuntime(source.meta.instanceId, 'transfer_lease_check_failed');
            }
            return;
        }
        const runtimePlayer = deps.playerRuntimeService?.getPlayer?.(transfer.playerId) ?? null;
        if (runtimePlayer && typeof deps.playerRuntimeService?.beginTransfer === 'function') {
            deps.playerRuntimeService.beginTransfer(runtimePlayer, transfer.targetMapId);
        }
        // 阶段 9 收口：实例迁移前静默清理玩家 pending cast，避免在旧实例 tick 或新实例 tick 里触发错位结算。
        // 资源/冷却保持 committed_no_refund / committed_no_rollback，不产生玩家通知，仅走结构化诊断。
        if (typeof deps.worldRuntimePlayerSkillDispatchService?.cancelPendingPlayerSkillCastForInstanceTransfer === 'function') {
            deps.worldRuntimePlayerSkillDispatchService.cancelPendingPlayerSkillCastForInstanceTransfer(transfer.playerId, deps);
        }
        const linePreset = runtimePlayer?.worldPreference?.linePreset === 'real' ? 'real' : 'peaceful';
        let target = null;
        const targetInstanceId = typeof transfer.targetInstanceId === 'string' && transfer.targetInstanceId.trim()
            ? transfer.targetInstanceId.trim()
            : '';
        if (targetInstanceId) {
            target = deps.getInstanceRuntime(targetInstanceId);
            if (!target && typeof deps.worldRuntimeSectService?.ensureSectRuntimeInstanceById === 'function') {
                target = deps.worldRuntimeSectService.ensureSectRuntimeInstanceById(targetInstanceId, deps);
            }
        }
        if (!target) {
            target = typeof deps.getOrCreateDefaultLineInstance === 'function'
                ? deps.getOrCreateDefaultLineInstance(transfer.targetMapId, linePreset)
                : deps.getOrCreatePublicInstance(transfer.targetMapId);
        }
        logServerNextMovement(this.logger, 'runtime.transfer.apply', {
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            fromInstanceId: transfer.fromInstanceId,
            toMapId: transfer.targetMapId,
            targetX: transfer.targetX,
            targetY: transfer.targetY,
            reason: transfer.reason,
        });
        source.disconnectPlayer(transfer.playerId);
        target.connectPlayer({
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            preferredX: transfer.targetX,
            preferredY: transfer.targetY,
        });
        target.setPlayerMoveSpeed(transfer.playerId, runtimePlayer?.attrs.numericStats.moveSpeed ?? 0);
        deps.setPlayerLocation(transfer.playerId, {
            instanceId: target.meta.instanceId,
            sessionId: transfer.sessionId,
        });
        const view = typeof deps.getPlayerViewOrThrow === 'function'
            ? deps.getPlayerViewOrThrow(transfer.playerId)
            : null;
        if (view && typeof deps.refreshPlayerContextActions === 'function') {
            deps.refreshPlayerContextActions(transfer.playerId, view);
        }
        if (view && typeof deps.playerRuntimeService.syncFromWorldView === 'function') {
            deps.playerRuntimeService.syncFromWorldView(transfer.playerId, transfer.sessionId, view);
        }
        if (runtimePlayer && typeof deps.playerRuntimeService?.completeTransfer === 'function') {
            deps.playerRuntimeService.completeTransfer(runtimePlayer);
        }
        deps.worldRuntimeNavigationService.handleTransfer(transfer, deps);
    }
};
