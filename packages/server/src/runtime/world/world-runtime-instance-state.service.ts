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
 * instances：instance相关字段。
 */

    instances = new Map();    
    /**
 * getInstanceRuntime：读取Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

    getInstanceRuntime(instanceId) {
        return this.instances.get(instanceId) ?? null;
    }    
    /**
 * setInstanceRuntime：写入Instance运行态。
 * @param instanceId instance ID。
 * @param instance 地图实例。
 * @returns 无返回值，直接更新Instance运行态相关状态。
 */

    setInstanceRuntime(instanceId, instance) {
        this.instances.set(instanceId, instance);
    }    
    /**
 * deleteInstanceRuntime：删除Instance运行态。
 * @param instanceId instance ID。
 * @returns 无返回值，直接更新Instance运行态相关状态。
 */

    deleteInstanceRuntime(instanceId) {
        this.instances.delete(instanceId);
    }    
    /**
 * listInstanceRuntimes：读取Instance运行态并返回结果。
 * @returns 无返回值，完成Instance运行态的读取/组装。
 */

    listInstanceRuntimes() {
        return this.instances.values();
    }    
    /**
 * listInstanceEntries：读取Instance条目并返回结果。
 * @returns 无返回值，完成Instance条目的读取/组装。
 */

    listInstanceEntries() {
        return this.instances.entries();
    }    
    /**
 * getInstanceCount：读取Instance数量。
 * @returns 无返回值，完成Instance数量的读取/组装。
 */

    getInstanceCount() {
        return this.instances.size;
    }    
    /**
 * resetState：执行reset状态相关逻辑。
 * @returns 无返回值，直接更新reset状态相关状态。
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
