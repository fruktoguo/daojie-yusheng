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
    resolveEmission(socket) {
        const protocol = this.getExplicitProtocol(socket);
        return {
            protocol,
            emitNext: protocol !== 'legacy',
            emitLegacy: protocol !== 'next',
        };
    }
    getExplicitProtocol(socket) {
        const protocol = socket?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
    sendQuestSync(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Quests, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.QuestUpdate, payload);
        }
    }
    sendMapStatic(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.MapStatic, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.MapStaticSync, payload);
        }
    }
    sendRealm(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.Realm, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.RealmUpdate, payload);
        }
    }
    sendLootWindow(socket, payload) {
        const { emitNext, emitLegacy } = this.resolveEmission(socket);
        if (emitNext) {
            socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, payload);
        }
        if (emitLegacy) {
            socket.emit(shared_1.S2C.LootWindowUpdate, payload);
        }
    }
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
