"use strict";
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
    gmMapTickSpeedByMapId = new Map();
    gmMapPausedByMapId = new Map();
    gmMapTimeConfigByMapId = new Map();
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
    pruneMapConfigs(validMapIds) {
        for (const mapId of Array.from(this.gmMapTickSpeedByMapId.keys())) {
            if (!validMapIds.has(mapId)) {
                this.gmMapTickSpeedByMapId.delete(mapId);
                this.gmMapPausedByMapId.delete(mapId);
                this.gmMapTimeConfigByMapId.delete(mapId);
            }
        }
    }
    getMapTickSpeed(mapId) {
        if (this.gmMapPausedByMapId.get(mapId) === true) {
            return 0;
        }
        const speed = this.gmMapTickSpeedByMapId.get(mapId);
        return Number.isFinite(speed) ? speed : 1;
    }
    isMapPaused(mapId) {
        return this.gmMapPausedByMapId.get(mapId) === true || this.getMapTickSpeed(mapId) === 0;
    }
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
