// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeTransferService = void 0;

const common_1 = require("@nestjs/common");
const movement_debug_1 = require("../../debug/movement-debug");

/** world-runtime transfer orchestration：承接跨实例传送写路径。 */
let WorldRuntimeTransferService = class WorldRuntimeTransferService {
/**
 * logger：日志器引用。
 */

    logger = new common_1.Logger(WorldRuntimeTransferService.name);    
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
        (0, movement_debug_1.logServerNextMovement)(this.logger, 'runtime.transfer.apply', {
            playerId: transfer.playerId,
            sessionId: transfer.sessionId,
            fromInstanceId: transfer.fromInstanceId,
            toMapId: transfer.targetMapId,
            targetX: transfer.targetX,
            targetY: transfer.targetY,
            reason: transfer.reason,
        });
        source.disconnectPlayer(transfer.playerId);
        const runtimePlayer = deps.playerRuntimeService.getPlayer(transfer.playerId);
        const linePreset = runtimePlayer?.worldPreference?.linePreset === 'real' ? 'real' : 'peaceful';
        const target = typeof deps.getOrCreateDefaultLineInstance === 'function'
            ? deps.getOrCreateDefaultLineInstance(transfer.targetMapId, linePreset)
            : deps.getOrCreatePublicInstance(transfer.targetMapId);
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
        if (view && typeof deps.playerRuntimeService.syncFromWorldView === 'function') {
            deps.playerRuntimeService.syncFromWorldView(transfer.playerId, transfer.sessionId, view);
        }
        deps.worldRuntimeNavigationService.handleTransfer(transfer, deps);
    }
};
exports.WorldRuntimeTransferService = WorldRuntimeTransferService;
exports.WorldRuntimeTransferService = WorldRuntimeTransferService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeTransferService);

export { WorldRuntimeTransferService };
