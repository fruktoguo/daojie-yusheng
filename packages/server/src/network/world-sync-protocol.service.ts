// @ts-nocheck
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncProtocolService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

let WorldSyncProtocolService = class WorldSyncProtocolService {
/**
 * sendNextEnvelope：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param envelope 参数说明。
 * @returns 函数返回值。
 */

    sendNextEnvelope(socket, envelope) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (envelope?.initSession) {
            socket.emit(shared_1.NEXT_S2C.InitSession, envelope.initSession);
        }
        if (envelope?.mapEnter) {
            socket.emit(shared_1.NEXT_S2C.MapEnter, envelope.mapEnter);
        }
        if (envelope?.worldDelta) {
            socket.emit(shared_1.NEXT_S2C.WorldDelta, envelope.worldDelta);
        }
        if (envelope?.selfDelta) {
            socket.emit(shared_1.NEXT_S2C.SelfDelta, envelope.selfDelta);
        }
        if (envelope?.panelDelta) {
            socket.emit(shared_1.NEXT_S2C.PanelDelta, envelope.panelDelta);
        }
    }    
    /**
 * sendBootstrap：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    sendBootstrap(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Bootstrap, payload);
    }    
    /**
 * resolveEmission：执行核心业务逻辑。
 * @param socket 参数说明。
 * @returns 函数返回值。
 */

    resolveEmission(socket) {
        return {
            protocol: 'next',

            emitNext: true,
        };
    }    
    /**
 * getExplicitProtocol：按给定条件读取/查询数据。
 * @param socket 参数说明。
 * @returns 函数返回值。
 */

    getExplicitProtocol(socket) {
        return 'next';
    }    
    /**
 * resolveEffectiveProtocol：执行核心业务逻辑。
 * @param socket 参数说明。
 * @returns 函数返回值。
 */

    resolveEffectiveProtocol(socket) {
        return 'next';
    }    
    /**
 * sendQuestSync：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    sendQuestSync(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Quests, payload);
    }    
    /**
 * sendMapStatic：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    sendMapStatic(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.MapStatic, payload);
    }    
    /**
 * sendRealm：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    sendRealm(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Realm, payload);
    }    
    /**
 * sendLootWindow：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 函数返回值。
 */

    sendLootWindow(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, payload);
    }    
    /**
 * sendNotices：执行核心业务逻辑。
 * @param socket 参数说明。
 * @param items 道具列表。
 * @returns 函数返回值。
 */

    sendNotices(socket, items) {
        socket.emit(shared_1.NEXT_S2C.Notice, { items });
    }
};
exports.WorldSyncProtocolService = WorldSyncProtocolService;
exports.WorldSyncProtocolService = WorldSyncProtocolService = __decorate([
    (0, common_1.Injectable)()
], WorldSyncProtocolService);

export { WorldSyncProtocolService };
