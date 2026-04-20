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
 * playerLocations：玩家位置相关字段。
 */

    playerLocations = new Map();    
    /**
 * getPlayerLocation：读取玩家位置。
 * @param playerId 玩家 ID。
 * @returns 无返回值，完成玩家位置的读取/组装。
 */

    getPlayerLocation(playerId) {
        return this.playerLocations.get(playerId) ?? null;
    }    
    /**
 * setPlayerLocation：写入玩家位置。
 * @param playerId 玩家 ID。
 * @param location 参数说明。
 * @returns 无返回值，直接更新玩家位置相关状态。
 */

    setPlayerLocation(playerId, location) {
        this.playerLocations.set(playerId, location);
    }    
    /**
 * clearPlayerLocation：执行clear玩家位置相关逻辑。
 * @param playerId 玩家 ID。
 * @returns 无返回值，直接更新clear玩家位置相关状态。
 */

    clearPlayerLocation(playerId) {
        this.playerLocations.delete(playerId);
    }    
    /**
 * getPlayerLocationCount：读取玩家位置数量。
 * @returns 无返回值，完成玩家位置数量的读取/组装。
 */

    getPlayerLocationCount() {
        return this.playerLocations.size;
    }    
    /**
 * listConnectedPlayerIds：读取Connected玩家ID并返回结果。
 * @returns 无返回值，完成Connected玩家ID的读取/组装。
 */

    listConnectedPlayerIds() {
        return this.playerLocations.keys();
    }    
    /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
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
