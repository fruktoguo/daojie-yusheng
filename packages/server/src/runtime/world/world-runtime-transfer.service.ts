/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
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
        const attachReady = resolveTransferTargetAttachReady(target, deps);
        if (!attachReady.ok) {
            this.logger.warn(`传送目标实例暂不可进入：playerId=${transfer.playerId} target=${target?.meta?.instanceId ?? 'missing'} reason=${attachReady.reason}`);
            return;
        }
        const previousSourcePosition = typeof source.getPlayerPosition === 'function'
            ? source.getPlayerPosition(transfer.playerId)
            : null;
        const previousRuntimePlacement = runtimePlayer
            ? {
                instanceId: runtimePlayer.instanceId,
                templateId: runtimePlayer.templateId,
                x: runtimePlayer.x,
                y: runtimePlayer.y,
                facing: runtimePlayer.facing,
            }
            : null;
        let transferBegun = false;
        let targetConnected = false;
        let sourceDisconnected = false;
        if (runtimePlayer && typeof deps.playerRuntimeService?.beginTransfer === 'function') {
            deps.playerRuntimeService.beginTransfer(runtimePlayer, transfer.targetMapId);
            transferBegun = true;
        }
        // 阶段 9 收口：实例迁移前静默清理玩家 pending cast，避免在旧实例 tick 或新实例 tick 里触发错位结算。
        // 资源/冷却保持 committed_no_refund / committed_no_rollback，不产生玩家通知，仅走结构化诊断。
        if (typeof deps.worldRuntimePlayerSkillDispatchService?.cancelPendingPlayerSkillCastForInstanceTransfer === 'function') {
            deps.worldRuntimePlayerSkillDispatchService.cancelPendingPlayerSkillCastForInstanceTransfer(transfer.playerId, deps);
        }
        if (runtimePlayer && typeof deps.worldRuntimeCraftInterruptService?.interruptCraftForReason === 'function') {
            deps.worldRuntimeCraftInterruptService.interruptCraftForReason(transfer.playerId, runtimePlayer, 'move', deps);
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
        try {
            target.connectPlayer({
                playerId: transfer.playerId,
                sessionId: transfer.sessionId,
                preferredX: transfer.targetX,
                preferredY: transfer.targetY,
            });
            targetConnected = true;
            if (target !== source) {
                sourceDisconnected = source.disconnectPlayer(transfer.playerId) !== false;
            }
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
            deps.worldRuntimeNavigationService.handleTransfer({
                ...transfer,
                sourceMapId: source.template?.mapId ?? null,
            }, deps);
        }
        catch (error) {
            rollbackTransferRuntimePlacement(runtimePlayer, previousRuntimePlacement);
            rollbackTransferInstancePlacement({
                deps,
                error,
                logger: this.logger,
                playerId: transfer.playerId,
                previousSourcePosition,
                sessionId: transfer.sessionId,
                source,
                sourceDisconnected,
                target,
                targetConnected,
            });
            throw error;
        }
        finally {
            if (transferBegun && runtimePlayer && typeof deps.playerRuntimeService?.completeTransfer === 'function') {
                deps.playerRuntimeService.completeTransfer(runtimePlayer);
            }
        }
    }
};

function rollbackTransferRuntimePlacement(runtimePlayer, previousPlacement) {
    if (!runtimePlayer || !previousPlacement) {
        return;
    }
    runtimePlayer.instanceId = previousPlacement.instanceId;
    runtimePlayer.templateId = previousPlacement.templateId;
    runtimePlayer.x = previousPlacement.x;
    runtimePlayer.y = previousPlacement.y;
    runtimePlayer.facing = previousPlacement.facing;
}

function rollbackTransferInstancePlacement(input) {
    const {
        deps,
        error,
        logger,
        playerId,
        previousSourcePosition,
        sessionId,
        source,
        sourceDisconnected,
        target,
        targetConnected,
    } = input;
    if (targetConnected && target && target !== source && typeof target.disconnectPlayer === 'function') {
        try {
            target.disconnectPlayer(playerId);
        }
        catch (rollbackError) {
            logger.warn(`传送失败回滚目标实例挂接失败：playerId=${playerId} error=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
    }
    if (targetConnected && target === source && previousSourcePosition && typeof source.relocatePlayer === 'function') {
        try {
            source.relocatePlayer(playerId, previousSourcePosition.x, previousSourcePosition.y);
        }
        catch (rollbackError) {
            logger.warn(`传送失败恢复同实例落点失败：playerId=${playerId} error=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
    }
    if (sourceDisconnected && source && target !== source && typeof source.connectPlayer === 'function') {
        try {
            source.connectPlayer({
                playerId,
                sessionId,
                preferredX: previousSourcePosition?.x,
                preferredY: previousSourcePosition?.y,
            });
        }
        catch (rollbackError) {
            logger.warn(`传送失败恢复源实例挂接失败：playerId=${playerId} error=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
    }
    try {
        if (source?.meta?.instanceId && typeof deps.setPlayerLocation === 'function') {
            deps.setPlayerLocation(playerId, {
                instanceId: source.meta.instanceId,
                sessionId,
            });
        }
    }
    catch (rollbackError) {
        logger.warn(`传送失败恢复位置索引失败：playerId=${playerId} cause=${error instanceof Error ? error.message : String(error)} rollback=${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
}

function resolveTransferTargetAttachReady(instance, deps) {
    if (!instance) {
        return { ok: false, reason: 'instance_missing' };
    }
    const instanceId = typeof instance?.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
    if (instanceId && typeof deps?.worldRuntimeService?.instanceReadyForPlayerAttach === 'function') {
        return deps.worldRuntimeService.instanceReadyForPlayerAttach(instanceId);
    }
    const runtimeStatus = typeof instance?.meta?.runtimeStatus === 'string' ? instance.meta.runtimeStatus.trim() : '';
    if (runtimeStatus === 'fenced') return { ok: false, reason: 'lease_fenced' };
    if (runtimeStatus === 'lease_degraded') return { ok: false, reason: 'lease_degraded' };
    if (runtimeStatus === 'template_missing') return { ok: false, reason: 'template_missing' };
    if (runtimeStatus === 'stopped') return { ok: false, reason: 'instance_stopped' };
    const status = typeof instance?.meta?.status === 'string' ? instance.meta.status.trim() : '';
    if (status === 'destroyed') return { ok: false, reason: 'instance_destroyed' };
    if (typeof deps?.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
        return { ok: false, reason: 'lease_not_local' };
    }
    return { ok: true, reason: 'ready' };
}
