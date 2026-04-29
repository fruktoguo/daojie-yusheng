// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeMonsterSystemCommandService = void 0;

const common_1 = require("@nestjs/common");

const content_template_repository_1 = require("../../content/content-template.repository");

/** world-runtime monster system-command leaf：承接妖兽掉落/击败/受伤这组三件套系统命令执行。 */
let WorldRuntimeMonsterSystemCommandService = class WorldRuntimeMonsterSystemCommandService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository) {
        this.contentTemplateRepository = contentTemplateRepository;
    }    
    /**
 * dispatchSpawnMonsterLoot：判断Spawn怪物掉落是否满足条件。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(instanceId);
        const items = this.contentTemplateRepository.rollMonsterDrops(monsterId, rolls);
        if (items.length === 0) {
            throw new common_1.NotFoundException(`Monster ${monsterId} produced no loot`);
        }
        this.spawnItems(instance, x, y, items, deps);
    }    
    /**
 * dispatchDefeatMonster：判断Defeat怪物是否满足条件。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

    dispatchDefeatMonster(instanceId, runtimeId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(instanceId);
        const monster = instance.defeatMonster(runtimeId);
        if (!monster) {
            throw new common_1.NotFoundException(`Monster ${runtimeId} not found or already dead`);
        }
        this.spawnRolledMonsterLoot(instance, monster.monsterId, 1, monster.x, monster.y, deps);
    }    
    /**
 * dispatchDamageMonster：判断Damage怪物是否满足条件。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

    dispatchDamageMonster(instanceId, runtimeId, amount, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const instance = deps.getInstanceRuntimeOrThrow(instanceId);
        const target = instance.getMonster(runtimeId);
        if (!target) {
            throw new common_1.NotFoundException(`Monster ${runtimeId} not found`);
        }
        const outcome = instance.applyDamageToMonster(runtimeId, amount);
        if (!outcome?.defeated) {
            return;
        }
        this.spawnRolledMonsterLoot(instance, target.monsterId, 1, target.x, target.y, deps);
    }    
    /**
 * spawnRolledMonsterLoot：执行spawnRolled怪物掉落相关逻辑。
 * @param instance 地图实例。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新spawnRolled怪物掉落相关状态。
 */

    spawnRolledMonsterLoot(instance, monsterId, rolls, x, y, deps) {
        const items = this.contentTemplateRepository.rollMonsterDrops(monsterId, rolls);
        this.spawnItems(instance, x, y, items, deps);
    }    
    /**
 * spawnItems：执行spawn道具相关逻辑。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param items 道具列表。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新spawn道具相关状态。
 */

    spawnItems(instance, x, y, items, deps) {
        for (const item of items) {
            deps.spawnGroundItem(instance, x, y, item);
        }
    }
};
exports.WorldRuntimeMonsterSystemCommandService = WorldRuntimeMonsterSystemCommandService;
exports.WorldRuntimeMonsterSystemCommandService = WorldRuntimeMonsterSystemCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository])
], WorldRuntimeMonsterSystemCommandService);

export { WorldRuntimeMonsterSystemCommandService };
