// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimePlayerLocationService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime player location state：承接玩家所在实例索引的状态所有权。 */
let WorldRuntimePlayerLocationService = class WorldRuntimePlayerLocationService {
/**
 * playerLocations：对象字段。
 */

    playerLocations = new Map();    
    /**
 * getPlayerLocation：按给定条件读取/查询数据。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    getPlayerLocation(playerId) {
        return this.playerLocations.get(playerId) ?? null;
    }    
    /**
 * setPlayerLocation：更新/写入相关状态。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 函数返回值。
 */

    setPlayerLocation(playerId, location) {
        this.playerLocations.set(playerId, location);
    }    
    /**
 * clearPlayerLocation：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @returns 函数返回值。
 */

    clearPlayerLocation(playerId) {
        this.playerLocations.delete(playerId);
    }    
    /**
 * getPlayerLocationCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getPlayerLocationCount() {
        return this.playerLocations.size;
    }    
    /**
 * listConnectedPlayerIds：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listConnectedPlayerIds() {
        return this.playerLocations.keys();
    }    
    /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    resetState() {
        this.playerLocations.clear();
    }
};
exports.WorldRuntimePlayerLocationService = WorldRuntimePlayerLocationService;
exports.WorldRuntimePlayerLocationService = WorldRuntimePlayerLocationService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimePlayerLocationService);

export { WorldRuntimePlayerLocationService };
