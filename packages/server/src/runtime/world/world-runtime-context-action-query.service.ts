import { Injectable } from '@nestjs/common';
import { RETURN_TO_SPAWN_ACTION_ID, RETURN_TO_SPAWN_COOLDOWN_TICKS } from '@mud/shared';
import { MapTemplateRepository } from '../map/map-template.repository';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { WorldRuntimeNpcQuestInteractionQueryService } from './world-runtime-npc-quest-interaction-query.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';
import * as world_runtime_path_planning_helpers_1 from './world-runtime.path-planning.helpers';

const {
    compareStableStrings,
} = world_runtime_normalization_helpers_1;

const {
    chebyshevDistance,
} = world_runtime_path_planning_helpers_1;

const STATIC_TOGGLE_CONTEXT_ACTIONS = [{
        id: 'toggle:auto_battle',
        name: '自动战斗',
        type: 'toggle',
        desc: '自动追击附近妖兽并释放技能，可随时切换开关。',
    }, {
        id: 'toggle:auto_retaliate',
        name: '自动反击',
        type: 'toggle',
        desc: '控制被攻击时是否自动开战。',
    }, {
        id: 'toggle:auto_battle_stationary',
        name: '原地战斗',
        type: 'toggle',
        desc: '控制自动战斗时是否原地输出，还是按射程追击目标。',
    }, {
        id: 'toggle:allow_aoe_player_hit',
        name: '全体攻击',
        type: 'toggle',
        desc: '控制群体攻击是否会误伤其他玩家。',
    }, {
        id: 'toggle:auto_idle_cultivation',
        name: '闲置自动修炼',
        type: 'toggle',
        desc: '控制角色闲置一段时间后是否自动开始修炼。',
    }, {
        id: 'cultivation:toggle',
        name: '当前修炼',
        type: 'toggle',
        desc: '切换角色修炼状态；没有主修时只推进境界修为。',
    }, {
        id: 'toggle:auto_switch_cultivation',
        name: '修满自动切换',
        type: 'toggle',
        desc: '控制主修功法圆满后是否自动切到下一门未圆满功法。',
    }, {
        id: 'sense_qi:toggle',
        name: '感气视角',
        type: 'toggle',
        desc: '切换感气视角，观察地块灵气层次与变化。',
    }];
const WANG_QI_COMPASS_ITEM_ID = 'equip.copper_luopan';

/** 世界运行时上下文动作查询服务：承接 contextActions 的只读组装。 */
@Injectable()
export class WorldRuntimeContextActionQueryService {
/**
 * templateRepository：template仓储引用。
 */

    templateRepository;
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * worldRuntimeNpcQuestInteractionQueryService：世界运行态NPC任务InteractionQuery服务引用。
 */

    worldRuntimeNpcQuestInteractionQueryService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param templateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeNpcQuestInteractionQueryService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        templateRepository: MapTemplateRepository,
        playerRuntimeService: PlayerRuntimeService,
        worldRuntimeNpcQuestInteractionQueryService: WorldRuntimeNpcQuestInteractionQueryService,
    ) {
        this.templateRepository = templateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeNpcQuestInteractionQueryService = worldRuntimeNpcQuestInteractionQueryService;
    }
    /**
 * buildContextActions：构建并返回目标对象。
 * @param view 参数说明。
 * @returns 无返回值，直接更新上下文Action相关状态。
 */

    buildContextActions(view, deps = null) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const actions = [];
        const player = this.playerRuntimeService.getPlayer(view.playerId);
        const currentTick = Number.isFinite(Number(view?.tick))
            ? Math.max(0, Math.trunc(Number(view.tick)))
            : (typeof deps?.resolveCurrentTickForPlayerId === 'function'
                ? deps.resolveCurrentTickForPlayerId(view.playerId)
                : 0);
        actions.push({
            id: 'battle:force_attack',
            name: '强制攻击',
            type: 'battle',
            desc: '无视自动索敌限制，直接锁定你选中的目标发起攻击。',
            cooldownLeft: 0,
            range: Math.max(1, Math.round(player?.attrs.numericStats.viewRange ?? 1)),
            requiresTarget: true,
            targetMode: 'any',
        });
        const respawnTargetMapId = typeof player?.respawnTemplateId === 'string' && player.respawnTemplateId.trim()
            ? player.respawnTemplateId.trim()
            : (typeof deps?.resolveDefaultRespawnMapId === 'function' ? deps.resolveDefaultRespawnMapId() : 'yunlai_town');
        let respawnTargetName = respawnTargetMapId || '默认复活点';
        if (respawnTargetMapId && this.templateRepository.has(respawnTargetMapId)) {
            respawnTargetName = this.templateRepository.getOrThrow(respawnTargetMapId).name || respawnTargetMapId;
        }
        const returnReadyTick = normalizeReturnToSpawnReadyTick(player, currentTick);
        const returnCooldownLeft = Math.max(0, returnReadyTick - currentTick);
        actions.push({
            id: RETURN_TO_SPAWN_ACTION_ID,
            name: '遁返',
            type: 'travel',
            desc: `催动归引灵符，遁返回 ${respawnTargetName}，之后需调息 ${RETURN_TO_SPAWN_COOLDOWN_TICKS} 息。`,
            cooldownLeft: returnCooldownLeft,
        });
        for (const action of STATIC_TOGGLE_CONTEXT_ACTIONS) {
            actions.push({
                id: action.id,
                name: action.name,
                type: action.type,
                desc: action.desc,
                cooldownLeft: 0,
            });
        }
        if (hasEquippedItem(player, WANG_QI_COMPASS_ITEM_ID)) {
            actions.push({
                id: 'wang_qi:toggle',
                name: '望气',
                type: 'interact',
                desc: '借铜罗盘观察房间风水，低于平衡偏红，高于平衡偏绿。',
                cooldownLeft: 0,
            });
        }
        const localFormations = typeof deps?.worldRuntimeFormationService?.listOwnedFormationsAt === 'function'
            ? deps.worldRuntimeFormationService.listOwnedFormationsAt(view.instance.instanceId, view.playerId, view.self.x, view.self.y)
            : [];
        for (const formation of localFormations) {
            actions.push({
                id: `formation:toggle:${formation.id}`,
                name: formation.active ? `关闭：${formation.name}` : `开启：${formation.name}`,
                type: 'interact',
                desc: `阵眼灵力 ${formation.remainingAuraBudget}，半径 ${formation.radius}。`,
                cooldownLeft: 0,
            });
            actions.push({
                id: `formation:refill:${formation.id}`,
                name: `补充：${formation.name}`,
                type: 'interact',
                desc: `消耗 ${formation.refillSpiritStoneCount} 灵石和 ${formation.refillQiCost} 灵力，为当前阵法补充 ${formation.refillAuraBudget} 阵眼灵力。`,
                cooldownLeft: 0,
            });
        }
        const localBuildings = Array.isArray(view?.localBuildings) ? view.localBuildings : [];
        if (typeof deps?.getInstanceRuntimeOrThrow === 'function') {
            for (const entry of localBuildings) {
                if (chebyshevDistance(view.self.x, view.self.y, entry.x, entry.y) > 1) {
                    continue;
                }
                const sourceInstanceId = typeof entry?.instanceId === 'string' && entry.instanceId.trim()
                    ? entry.instanceId.trim()
                    : view.instance.instanceId;
                const instance = deps.getInstanceRuntimeOrThrow(sourceInstanceId);
                const building = instance?.buildingById?.get?.(entry.id);
                if (!building || building.state !== 'building') {
                    continue;
                }
                if (building.ownerPlayerId && building.ownerPlayerId !== view.playerId) {
                    continue;
                }
                const remainingTicks = Math.max(1, Math.trunc(Number(entry?.remainingTicks ?? building.buildRemainingTicks ?? building.buildStrength ?? 1)));
                const buildingName = typeof entry?.name === 'string' && entry.name.trim()
                    ? entry.name.trim()
                    : (typeof building.defId === 'string' ? building.defId : '建筑');
                actions.push({
                    id: `building:start:${building.id}`,
                    name: `开始建造：${buildingName}（余 ${remainingTicks} 息）`,
                    type: 'interact',
                    desc: `靠近半成品后持续施工，剩余 ${remainingTicks} 息。`,
                    cooldownLeft: 0,
                });
            }
        }
        if (typeof deps?.worldRuntimeSectService?.buildSectCoreActions === 'function') {
            actions.push(...deps.worldRuntimeSectService.buildSectCoreActions(view, deps));
        }
        if (typeof deps?.worldRuntimeSectService?.buildSectEntranceActions === 'function') {
            actions.push(...deps.worldRuntimeSectService.buildSectEntranceActions(view, deps));
        }
        if (typeof deps?.worldRuntimeTongtianTowerService?.buildContextActions === 'function') {
            actions.push(...deps.worldRuntimeTongtianTowerService.buildContextActions(view, deps));
        }
        for (const portal of view.localPortals) {
            if (portal.trigger !== 'manual'
                || chebyshevDistance(view.self.x, view.self.y, portal.x, portal.y) > 1) {
                continue;
            }
            const portalSectId = typeof portal.sectId === 'string' && portal.sectId.trim() ? portal.sectId.trim() : '';
            const playerSectId = typeof player?.sectId === 'string' && player.sectId.trim() ? player.sectId.trim() : '';
            if (portal.kind === 'sect_entrance' && portalSectId && portalSectId !== playerSectId) {
                continue;
            }
            const targetName = this.templateRepository.has(portal.targetMapId)
                ? this.templateRepository.getOrThrow(portal.targetMapId).name
                : portal.targetMapId;
            actions.push({
                id: 'portal:travel',
                name: `传送至：${targetName}`,
                type: 'travel',
                desc: `踏入对应界门，前往 ${targetName}。`,
                cooldownLeft: 0,
            });
            if (!actions.some((entry) => entry.id === 'world:migrate')) {
                actions.push({
                    id: 'world:migrate',
                    name: '世界迁移',
                    type: 'interact',
                    desc: '切换当前地图的虚境/现世，并同步更新后续跨图的默认分线。',
                    cooldownLeft: 0,
                });
            }
        }
        for (const npc of view.localNpcs) {
            if (chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) <= 1) {
                actions.push({
                    id: `npc:${npc.npcId}`,
                    name: `交谈：${npc.name}`,
                    type: 'interact',
                    desc: npc.dialogue?.trim() ? npc.dialogue.trim() : `与 ${npc.name} 交谈。`,
                    cooldownLeft: 0,
                });
            }
            const npcQuestAction = this.worldRuntimeNpcQuestInteractionQueryService.buildNpcQuestContextAction(view, npc);
            if (npcQuestAction) {
                actions.push(npcQuestAction);
            }
            if (!npc.hasShop || chebyshevDistance(view.self.x, view.self.y, npc.x, npc.y) > 1) {
                continue;
            }
            actions.push({
                id: `npc_shop:${npc.npcId}`,
                name: `商店：${npc.name}`,
                type: 'interact',
                desc: `查看 ${npc.name} 当前出售的货物。`,
                cooldownLeft: 0,
            });
        }
        if (player?.realm?.breakthroughReady) {
            const preview = player.realm.breakthrough;
            actions.push({
                id: 'realm:breakthrough',
                name: `突破至 ${preview?.targetDisplayName ?? '下一境界'}`,
                type: 'breakthrough',
                desc: preview?.blockedReason ?? `当前境界已圆满，点击查看 ${preview?.targetDisplayName ?? '下一境界'} 的突破要求。`,
                cooldownLeft: 0,
            });
        }
        const weapon = player?.equipment?.slots?.find((entry) => entry.slot === 'weapon')?.item ?? null;
        const weaponTags = Array.isArray(weapon?.tags) ? weapon.tags : [];
        actions.push({
            id: 'alchemy:open',
            name: '炼丹',
            type: 'craft',
            desc: weaponTags.includes('alchemy_furnace')
                ? '查看当前丹炉、丹方目录与炼制状态。'
                : '打开炼丹菜单；未装备丹炉时可以炼制，但不会获得丹炉加成。',
            cooldownLeft: 0,
        });
        actions.push({
            id: 'forging:open',
            name: '炼器',
            type: 'craft',
            desc: weaponTags.includes('forging_tool')
                ? '查看当前炼器工具与器方目录。'
                : '打开炼器菜单；未装备炼器工具时可以炼制，但不会获得工具加成。',
            cooldownLeft: 0,
        });
        actions.push({
            id: 'enhancement:open',
            name: '强化',
            type: 'craft',
            desc: weaponTags.includes('enhancement_hammer')
                ? '查看当前强化候选、保护材料与强化状态。'
                : '打开强化菜单；未装备强化锤时可以强化，但不会获得强化锤加成。',
            cooldownLeft: 0,
        });
        actions.push({
            id: 'building:open',
            name: '营造',
            type: 'craft',
            desc: weaponTags.includes('building_hammer')
                ? '打开营造菜单，并使用当前建造锤处理建造意图。'
                : '打开营造菜单；未装备建造锤时可以建造，但不会获得建造工具加成。',
            cooldownLeft: 0,
        });
        actions.sort((left, right) => compareStableStrings(left.id, right.id));
        return actions;
    }
};

function hasEquippedItem(player, itemId) {
    return (player?.equipment?.slots ?? []).some((entry) => entry?.item?.itemId === itemId);
}

function normalizeReturnToSpawnReadyTick(player, currentTick) {
    const cooldowns = player?.combat?.cooldownReadyTickBySkillId;
    if (!cooldowns) {
        return 0;
    }
    const actionId = RETURN_TO_SPAWN_ACTION_ID;
    const readyTick = Math.max(0, Math.trunc(Number(cooldowns[actionId] ?? 0)));
    if (readyTick <= 0) {
        return 0;
    }
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    const remainingTicks = readyTick - normalizedCurrentTick;
    if (normalizedCurrentTick <= 0) {
        // 查询路径可能没有地图 tick，只收敛显示值，不清运行时真源。
        return readyTick > RETURN_TO_SPAWN_COOLDOWN_TICKS
            ? RETURN_TO_SPAWN_COOLDOWN_TICKS
            : readyTick;
    }
    if (remainingTicks <= 0 || remainingTicks > RETURN_TO_SPAWN_COOLDOWN_TICKS) {
        delete cooldowns[actionId];
        return 0;
    }
    return readyTick;
}
