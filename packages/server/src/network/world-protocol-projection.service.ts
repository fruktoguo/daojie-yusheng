// @ts-nocheck
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldProtocolProjectionService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared");

const world_client_event_service_1 = require("./world-client-event.service");

/** 协议投影服务：把世界层的局部视图转成 next Socket 事件。 */
let WorldProtocolProjectionService = class WorldProtocolProjectionService {
    /** 复用客户端事件服务发送拾取窗口等联动事件。 */
    worldClientEventService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldClientEventService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(worldClientEventService) {
        this.worldClientEventService = worldClientEventService;
    }
    /** 下发单个格子的详情数据。 */
    emitTileDetail(client, payload) {
        client.emit(shared_1.S2C.TileDetail, payload);
    }
    /** 下发格子详情并联动拾取窗口。 */
    emitTileLootInteraction(client, playerId, payload) {
        this.emitTileDetail(client, payload);
        this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
    }
    /** 当前投影固定收敛到 next 协议。 */
    resolveProjectionEmission(client) {
        return {
            protocol: 'mainline',
            emitNext: true,
        };
    }
};
exports.WorldProtocolProjectionService = WorldProtocolProjectionService;
exports.WorldProtocolProjectionService = WorldProtocolProjectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_client_event_service_1.WorldClientEventService])
], WorldProtocolProjectionService);

export { WorldProtocolProjectionService };
