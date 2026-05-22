/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Inject, Injectable } from '@nestjs/common';
import { WorldRuntimePlayerCombatService } from './world-runtime-player-combat.service';
import { WorldRuntimeRespawnService } from '../world-runtime-respawn.service';

/** world-runtime player-combat outcome orchestration：统一承接伤害结果、击杀奖励与复生入口 facade。 */
@Injectable()
export class WorldRuntimePlayerCombatOutcomeService {
/**
 * worldRuntimePlayerCombatService：世界运行态玩家战斗服务引用。
 */

    worldRuntimePlayerCombatService;
    /**
 * worldRuntimeRespawnService：世界运行态重生服务引用。
 */

    worldRuntimeRespawnService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldRuntimePlayerCombatService 参数说明。
 * @param worldRuntimeRespawnService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(WorldRuntimePlayerCombatService) worldRuntimePlayerCombatService: any,
        @Inject(WorldRuntimeRespawnService) worldRuntimeRespawnService: any,
    ) {
        this.worldRuntimePlayerCombatService = worldRuntimePlayerCombatService;
        this.worldRuntimeRespawnService = worldRuntimeRespawnService;
    }
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    dispatchDamagePlayer(playerId, amount, deps) {
        this.worldRuntimePlayerCombatService.dispatchDamagePlayer(playerId, amount, deps);
    }
    /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

    async handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
        return this.worldRuntimePlayerCombatService.handlePlayerMonsterKill(instance, monster, killerPlayerId, deps);
    }
    /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

    async handlePlayerDefeat(playerId, deps, killerPlayerId = null) {
        return this.worldRuntimePlayerCombatService.handlePlayerDefeat(playerId, deps, killerPlayerId);
    }
    /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

    processPendingRespawns(deps) {
        this.worldRuntimeRespawnService.processPendingRespawns(deps);
    }
    /**
 * respawnPlayer：执行重生玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

    respawnPlayer(playerId, deps, options = undefined) {
        this.worldRuntimeRespawnService.respawnPlayer(playerId, deps, options);
    }
};
