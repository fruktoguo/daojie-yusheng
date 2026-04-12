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
/** legacy_protocol_env_1：定义该变量以承载业务值。 */
const legacy_protocol_env_1 = require("./legacy-protocol.env");
/** WorldSyncProtocolService：定义该变量以承载业务值。 */
let WorldSyncProtocolService = class WorldSyncProtocolService {
/** resolveEmission：执行对应的业务逻辑。 */
    resolveEmission(socket) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = this.resolveEffectiveProtocol(socket);
        return {
            protocol,
/** emitNext：定义该变量以承载业务值。 */
            emitNext: protocol !== 'legacy',
/** emitLegacy：定义该变量以承载业务值。 */
            emitLegacy: protocol === 'legacy',
        };
    }
/** getExplicitProtocol：执行对应的业务逻辑。 */
    getExplicitProtocol(socket) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = socket?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
/** resolveEffectiveProtocol：执行对应的业务逻辑。 */
    resolveEffectiveProtocol(socket) {
/** protocol：定义该变量以承载业务值。 */
        const protocol = this.getExplicitProtocol(socket);
        if (protocol === 'legacy' && !(0, legacy_protocol_env_1.isLegacySocketProtocolEnabled)()) {
            return null;
        }
        return protocol;
    }
/** sendQuestSync：执行对应的业务逻辑。 */
    sendQuestSync(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Quests, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.QuestUpdate, payload);
        }
    }
/** sendMapStatic：执行对应的业务逻辑。 */
    sendMapStatic(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.MapStatic, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.MapStaticSync, payload);
        }
    }
/** sendRealm：执行对应的业务逻辑。 */
    sendRealm(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Realm, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.RealmUpdate, payload);
        }
    }
/** sendLootWindow：执行对应的业务逻辑。 */
    sendLootWindow(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.LootWindowUpdate, payload);
        }
    }
/** sendNotices：执行对应的业务逻辑。 */
    sendNotices(socket, items) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Notice, { items });
        }
        if (emitLegacy) {
            for (const item of items) {
                socket.emit(shared_1.S2C.SystemMsg, {
                    text: item.text,
                    kind: mapLegacyNoticeKind(item.kind),
                });
            }
        }
    }
};
exports.WorldSyncProtocolService = WorldSyncProtocolService;
exports.WorldSyncProtocolService = WorldSyncProtocolService = __decorate([
    (0, common_1.Injectable)()
], WorldSyncProtocolService);
/** mapLegacyNoticeKind：执行对应的业务逻辑。 */
function mapLegacyNoticeKind(kind) {
    switch (kind) {
        case 'loot':
            return 'loot';
        case 'combat':
            return 'combat';
        default:
            return 'system';
    }
}
