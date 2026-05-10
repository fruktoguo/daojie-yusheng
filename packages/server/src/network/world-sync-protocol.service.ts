import { Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';

@Injectable()
export class WorldSyncProtocolService {
/**
 * sendEnvelope：执行sendEnvelope相关逻辑。
 * @param socket 参数说明。
 * @param envelope 参数说明。
 * @returns 无返回值，直接更新sendEnvelope相关状态。
 */

    sendEnvelope(socket, envelope) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (envelope?.initSession) {
            socket.emit(S2C.InitSession, envelope.initSession);
        }
        if (envelope?.mapEnter) {
            socket.emit(S2C.MapEnter, envelope.mapEnter);
        }
        if (envelope?.worldDelta) {
            socket.emit(S2C.WorldDelta, envelope.worldDelta);
        }
        if (envelope?.selfDelta) {
            socket.emit(S2C.SelfDelta, envelope.selfDelta);
        }
        if (envelope?.panelDelta) {
            socket.emit(S2C.PanelDelta, envelope.panelDelta);
        }
    }
    /**
 * sendBootstrap：执行send引导相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新sendBootstrap相关状态。
 */

    sendBootstrap(socket, payload) {
        socket.emit(S2C.Bootstrap, payload);
    }
    /**
 * sendWorldDelta：执行send世界Delta相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新send世界Delta相关状态。
 */
    sendWorldDelta(socket, payload) {
        socket.emit(S2C.WorldDelta, payload);
    }
    /**
 * resolveEmission：判断Emission是否满足条件。
 * @param socket 参数说明。
 * @returns 无返回值，直接更新Emission相关状态。
 */

    resolveEmission(socket) {
        return {
            protocol: 'mainline',

            emitMainline: true,
        };
    }
    /**
 * getExplicitProtocol：读取ExplicitProtocol。
 * @param socket 参数说明。
 * @returns 无返回值，完成ExplicitProtocol的读取/组装。
 */

    getExplicitProtocol(socket) {
        return 'mainline';
    }
    /**
 * resolveEffectiveProtocol：规范化或转换EffectiveProtocol。
 * @param socket 参数说明。
 * @returns 无返回值，直接更新EffectiveProtocol相关状态。
 */

    resolveEffectiveProtocol(socket) {
        return 'mainline';
    }
    /**
 * sendQuestSync：处理send任务同步并更新相关状态。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新send任务Sync相关状态。
 */

    sendQuestSync(socket, payload) {
        socket.emit(S2C.Quests, payload);
    }
    /**
 * sendMapStatic：执行send地图Static相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新send地图Static相关状态。
 */

    sendMapStatic(socket, payload) {
        socket.emit(S2C.MapStatic, payload);
    }
    /**
 * sendRealm：执行sendRealm相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新sendRealm相关状态。
 */

    sendRealm(socket, payload) {
        socket.emit(S2C.Realm, payload);
    }
    /**
 * sendLootWindow：执行send掉落窗口相关逻辑。
 * @param socket 参数说明。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新send掉落窗口相关状态。
 */

    sendLootWindow(socket, payload) {
        socket.emit(S2C.LootWindowUpdate, payload);
    }
    /**
 * sendNotices：执行sendNotice相关逻辑。
 * @param socket 参数说明。
 * @param items 道具列表。
 * @returns 无返回值，直接更新sendNotice相关状态。
 */

    sendNotices(socket, items) {
        socket.emit(S2C.Notice, { items });
    }
};
