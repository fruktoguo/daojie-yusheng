import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ContentTemplateRepository } from '../../content/content-template.repository';

/** world-runtime monster system-command leaf：承接妖兽掉落/击败/受伤这组三件套系统命令执行。 */
@Injectable()
export class WorldRuntimeMonsterSystemCommandService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
    ) {
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
            throw new NotFoundException(`妖兽 ${monsterId} 没有产出掉落`);
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
            throw new NotFoundException(`妖兽不存在或已经死亡：${runtimeId}`);
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
            throw new NotFoundException(`妖兽不存在：${runtimeId}`);
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
