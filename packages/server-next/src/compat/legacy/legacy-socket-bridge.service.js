"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacySocketBridgeService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
let LegacySocketBridgeService = class LegacySocketBridgeService {
    emitDual(client, nextEvent, legacyEvent, payload) {
        const protocol = this.getClientProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(nextEvent, payload);
        }
        if (protocol !== 'next') {
            client.emit(legacyEvent, payload);
        }
    }
    emitDualError(client, code, message) {
        const protocol = this.getClientProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(shared_1.NEXT_S2C.Error, { code, message });
        }
        if (protocol !== 'next') {
            client.emit(shared_1.S2C.Error, { code, message });
        }
    }
    emitLegacySystemMessage(client, text) {
        client.emit(shared_1.S2C.SystemMsg, {
            text,
            kind: 'system',
        });
    }
    emitProtocolFailure(client, code, text) {
        const protocol = this.getClientProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(shared_1.NEXT_S2C.Error, { code, message: text });
        }
        if (protocol !== 'next') {
            this.emitLegacySystemMessage(client, text);
        }
    }
    getClientProtocol(client) {
        const protocol = client?.data?.protocol;
        return protocol === 'next' || protocol === 'legacy' ? protocol : null;
    }
};
exports.LegacySocketBridgeService = LegacySocketBridgeService;
exports.LegacySocketBridgeService = LegacySocketBridgeService = __decorate([
    (0, common_1.Injectable)()
], LegacySocketBridgeService);
//# sourceMappingURL=legacy-socket-bridge.service.js.map