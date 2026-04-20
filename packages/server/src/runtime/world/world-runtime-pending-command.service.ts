// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimePendingCommandService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime pending command state：承接玩家待执行命令队列所有权与消费。 */
let WorldRuntimePendingCommandService = class WorldRuntimePendingCommandService {
/**
 * pendingCommands：对象字段。
 */

    pendingCommands = new Map();    
    /**
 * enqueuePendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @returns 函数返回值。
 */

    enqueuePendingCommand(playerId, command) {
        this.pendingCommands.set(playerId, command);
    }    
    /**
 * getPendingCommand：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    getPendingCommand(playerId) {
        return this.pendingCommands.get(playerId);
    }    
    /**
 * hasPendingCommand：执行状态校验并返回判断结果。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    hasPendingCommand(playerId) {
        return this.pendingCommands.has(playerId);
    }    
    /**
 * clearPendingCommand：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    clearPendingCommand(playerId) {
        this.pendingCommands.delete(playerId);
    }    
    /**
 * getPendingCommandCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getPendingCommandCount() {
        return this.pendingCommands.size;
    }    
    /**
 * dispatchPendingCommands：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchPendingCommands(deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        for (const [playerId, command] of this.pendingCommands) {
            try {
                if (command.kind === 'move' || command.kind === 'portal') {
                    deps.dispatchInstanceCommand(playerId, command);
                }
                else {
                    deps.dispatchPlayerCommand(playerId, command);
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                deps.logger.warn(`处理玩家 ${playerId} 的待执行指令失败：${command.kind}（${message}）`);
                deps.queuePlayerNotice(playerId, message, 'warn');
            }
        }
        this.pendingCommands.clear();
    }    
    /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    resetState() {
        this.pendingCommands.clear();
    }
};
exports.WorldRuntimePendingCommandService = WorldRuntimePendingCommandService;
exports.WorldRuntimePendingCommandService = WorldRuntimePendingCommandService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimePendingCommandService);

export { WorldRuntimePendingCommandService };
