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
 * instanceTickProgressById：对象字段。
 */

    instanceTickProgressById = new Map();    
    /**
 * getProgress：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

    getProgress(instanceId) {
        return this.instanceTickProgressById.get(instanceId) ?? 0;
    }    
    /**
 * setProgress：更新/写入相关状态。
 * @param instanceId instance ID。
 * @param progress 参数说明。
 * @returns 函数返回值。
 */

    setProgress(instanceId, progress) {
        this.instanceTickProgressById.set(instanceId, progress);
    }    
    /**
 * initializeInstance：初始化并准备运行时基础状态。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

    initializeInstance(instanceId) {
        this.instanceTickProgressById.set(instanceId, 0);
    }    
    /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
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
