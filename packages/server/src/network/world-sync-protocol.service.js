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
        return {
            protocol: 'next',

            emitNext: true,
        };
    }
    getExplicitProtocol(socket) {
        return 'next';
    }
    resolveEffectiveProtocol(socket) {
        return 'next';
    }
    sendQuestSync(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Quests, payload);
    }
    sendMapStatic(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.MapStatic, payload);
    }
    sendRealm(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.Realm, payload);
    }
    sendLootWindow(socket, payload) {
        socket.emit(shared_1.NEXT_S2C.LootWindowUpdate, payload);
    }
    sendNotices(socket, items) {
        socket.emit(shared_1.NEXT_S2C.Notice, { items });
    }
};
exports.WorldSyncProtocolService = WorldSyncProtocolService;
exports.WorldSyncProtocolService = WorldSyncProtocolService = __decorate([
    (0, common_1.Injectable)()
], WorldSyncProtocolService);



