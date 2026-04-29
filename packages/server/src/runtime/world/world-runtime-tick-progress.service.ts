// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeTickProgressService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime tick progress state：承接实例级 tick progress 所有权。 */
let WorldRuntimeTickProgressService = class WorldRuntimeTickProgressService {
/**
 * instanceTickProgressById：instancetick进度ByID标识。
 */

    instanceTickProgressById = new Map();    
    /**
 * getProgress：读取进度。
 * @param instanceId instance ID。
 * @returns 无返回值，完成进度的读取/组装。
 */

    getProgress(instanceId) {
        return this.instanceTickProgressById.get(instanceId) ?? 0;
    }    
    /**
 * setProgress：写入进度。
 * @param instanceId instance ID。
 * @param progress 参数说明。
 * @returns 无返回值，直接更新进度相关状态。
 */

    setProgress(instanceId, progress) {
        this.instanceTickProgressById.set(instanceId, progress);
    }    
    /**
 * initializeInstance：执行initializeInstance相关逻辑。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新initializeInstance相关状态。
 */

    initializeInstance(instanceId) {
        this.instanceTickProgressById.set(instanceId, 0);
    }    
    /**
 * clearInstance：执行clear单个Instance相关逻辑。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新clear单个Instance相关状态。
 */

    clearInstance(instanceId) {
        this.instanceTickProgressById.delete(instanceId);
    }    
    /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
 */

    resetState() {
        this.instanceTickProgressById.clear();
    }
};
exports.WorldRuntimeTickProgressService = WorldRuntimeTickProgressService;
exports.WorldRuntimeTickProgressService = WorldRuntimeTickProgressService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeTickProgressService);

export { WorldRuntimeTickProgressService };
