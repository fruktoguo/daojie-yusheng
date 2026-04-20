// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeInstanceStateService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime instance registry state：承接实例注册表状态所有权。 */
let WorldRuntimeInstanceStateService = class WorldRuntimeInstanceStateService {
/**
 * instances：对象字段。
 */

    instances = new Map();    
    /**
 * getInstanceRuntime：按给定条件读取/查询数据。
 * @param instanceId instance ID。
 * @returns 函数返回值。
 */

    getInstanceRuntime(instanceId) {
        return this.instances.get(instanceId) ?? null;
    }    
    /**
 * setInstanceRuntime：更新/写入相关状态。
 * @param instanceId instance ID。
 * @param instance 地图实例。
 * @returns 函数返回值。
 */

    setInstanceRuntime(instanceId, instance) {
        this.instances.set(instanceId, instance);
    }    
    /**
 * listInstanceRuntimes：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listInstanceRuntimes() {
        return this.instances.values();
    }    
    /**
 * listInstanceEntries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listInstanceEntries() {
        return this.instances.entries();
    }    
    /**
 * getInstanceCount：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    getInstanceCount() {
        return this.instances.size;
    }    
    /**
 * resetState：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    resetState() {
        this.instances.clear();
    }
};
exports.WorldRuntimeInstanceStateService = WorldRuntimeInstanceStateService;
exports.WorldRuntimeInstanceStateService = WorldRuntimeInstanceStateService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeInstanceStateService);

export { WorldRuntimeInstanceStateService };
