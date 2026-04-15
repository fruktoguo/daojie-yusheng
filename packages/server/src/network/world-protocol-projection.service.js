"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldProtocolProjectionService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** world_client_event_service_1：定义该变量以承载业务值。 */
const world_client_event_service_1 = require("./world-client-event.service");
/** WorldProtocolProjectionService：定义该变量以承载业务值。 */
let WorldProtocolProjectionService = class WorldProtocolProjectionService {
    worldClientEventService;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldClientEventService) {
        this.worldClientEventService = worldClientEventService;
    }
/** emitTileDetail：执行对应的业务逻辑。 */
    emitTileDetail(client, payload) {
        client.emit(shared_1.NEXT_S2C.TileDetail, payload);
    }
/** emitTileLootInteraction：执行对应的业务逻辑。 */
    emitTileLootInteraction(client, playerId, payload) {
        this.emitTileDetail(client, payload);
        this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
    }
/** resolveProjectionEmission：执行对应的业务逻辑。 */
    resolveProjectionEmission(client) {
        return {
            protocol: 'next',
            emitNext: true,
        };
    }
};
exports.WorldProtocolProjectionService = WorldProtocolProjectionService;
exports.WorldProtocolProjectionService = WorldProtocolProjectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_client_event_service_1.WorldClientEventService])
], WorldProtocolProjectionService);
