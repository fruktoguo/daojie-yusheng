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
    instanceTickProgressById = new Map();
    getProgress(instanceId) {
        return this.instanceTickProgressById.get(instanceId) ?? 0;
    }
    setProgress(instanceId, progress) {
        this.instanceTickProgressById.set(instanceId, progress);
    }
    initializeInstance(instanceId) {
        this.instanceTickProgressById.set(instanceId, 0);
    }
    resetState() {
        this.instanceTickProgressById.clear();
    }
};
exports.WorldRuntimeTickProgressService = WorldRuntimeTickProgressService;
exports.WorldRuntimeTickProgressService = WorldRuntimeTickProgressService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeTickProgressService);
