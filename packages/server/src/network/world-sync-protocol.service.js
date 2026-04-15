"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldSyncProtocolService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** WorldSyncProtocolService：定义该变量以承载业务值。 */
let WorldSyncProtocolService = class WorldSyncProtocolService {
/** resolveEmission：执行对应的业务逻辑。 */
    resolveEmission(socket) {
        return {
            protocol: 'next',
/** emitNext：定义该变量以承载业务值。 */
            emitNext: true,
        };
    }
/** getExplicitProtocol：执行对应的业务逻辑。 */
    getExplicitProtocol(socket) {
        return 'next';
    }
/** resolveEffectiveProtocol：执行对应的业务逻辑。 */
    resolveEffectiveProtocol(socket) {
        return 'next';
    }
/** sendQuestSync：执行对应的业务逻辑。 */
    sendQuestSync(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Quests, payload);
    }
/** sendMapStatic：执行对应的业务逻辑。 */
    sendMapStatic(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.MapStatic, payload);
    }
/** sendRealm：执行对应的业务逻辑。 */
    sendRealm(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Realm, payload);
    }
/** sendLootWindow：执行对应的业务逻辑。 */
    sendLootWindow(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, payload);
    }
/** sendNotices：执行对应的业务逻辑。 */
    sendNotices(socket, items) {
        socket.emit(shared_1.NEXT_S2C.Notice, { items });
    }
};
exports.WorldSyncProtocolService = WorldSyncProtocolService;
exports.WorldSyncProtocolService = WorldSyncProtocolService = __decorate([
    (0, common_1.Injectable)()
], WorldSyncProtocolService);
