"use strict";
/** 地图运行配置缓存：记录每张地图的 tick 倍速、暂停状态和时间参数。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeMapConfigService = void 0;

const common_1 = require("@nestjs/common");

let RuntimeMapConfigService = class RuntimeMapConfigService {
    /** 按地图缓存 GM 下发的 tick 速度。 */
    gmMapTickSpeedByMapId = new Map();
    /** 按地图缓存是否暂停推进。 */
    gmMapPausedByMapId = new Map();
    /** 按地图缓存时间缩放与偏移。 */
    gmMapTimeConfigByMapId = new Map();
    /** 更新地图的 tick 速度与暂停状态。 */
    updateMapTick(mapId, body) {
        if (body?.paused === true || body?.speed === 0) {
            this.gmMapPausedByMapId.set(mapId, true);
            this.gmMapTickSpeedByMapId.set(mapId, 0);
            return;
        }
        if (body?.paused === false) {
            this.gmMapPausedByMapId.set(mapId, false);
        }
        if (Number.isFinite(body?.speed)) {

            const speed = clamp(Number(body.speed), 0, 100);
            this.gmMapTickSpeedByMapId.set(mapId, speed);
            this.gmMapPausedByMapId.set(mapId, speed === 0);
        }
    }
    /** 更新地图时间参数，供 GM 调整昼夜节奏。 */
    updateMapTime(mapId, baseTimeConfig, body) {

        const current = this.getMapTimeConfig(mapId, baseTimeConfig);

        const next = {
            ...current,
        };
        if (Number.isFinite(body?.scale)) {
            next.scale = Math.max(0, Number(body.scale));
        }
        if (Number.isFinite(body?.offsetTicks)) {
            next.offsetTicks = Math.trunc(Number(body.offsetTicks));
        }
        this.gmMapTimeConfigByMapId.set(mapId, {
            ...(baseTimeConfig ?? {}),
            ...next,
        });
    }
    /** 清理已经不存在的地图配置，避免脏数据继续占用内存。 */
    pruneMapConfigs(validMapIds) {
        for (const mapId of Array.from(this.gmMapTickSpeedByMapId.keys())) {
            if (!validMapIds.has(mapId)) {
                this.gmMapTickSpeedByMapId.delete(mapId);
                this.gmMapPausedByMapId.delete(mapId);
                this.gmMapTimeConfigByMapId.delete(mapId);
            }
        }
    }
    /** 读取地图当前 tick 速度，默认按正常速度推进。 */
    getMapTickSpeed(mapId) {
        if (this.gmMapPausedByMapId.get(mapId) === true) {
            return 0;
        }

        const speed = this.gmMapTickSpeedByMapId.get(mapId);
        return Number.isFinite(speed) ? speed : 1;
    }
    /** 判断地图是否处于暂停状态。 */
    isMapPaused(mapId) {
        return this.gmMapPausedByMapId.get(mapId) === true || this.getMapTickSpeed(mapId) === 0;
    }
    /** 合并地图基础时间配置与 GM 覆盖配置。 */
    getMapTimeConfig(mapId, baseTimeConfig) {
        return {
            ...(baseTimeConfig ?? {}),
            ...(this.gmMapTimeConfigByMapId.get(mapId) ?? {}),
        };
    }
};
exports.RuntimeMapConfigService = RuntimeMapConfigService;
exports.RuntimeMapConfigService = RuntimeMapConfigService = __decorate([
    (0, common_1.Injectable)()
], RuntimeMapConfigService);
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}


