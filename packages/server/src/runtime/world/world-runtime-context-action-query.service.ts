// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    }
    else {
        for (var i = decorators.length - 1; i >= 0; i--) {
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(k, v);
    }
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeContextActionQueryService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");

const map_template_repository_1 = require("../map/map-template.repository");

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_npc_quest_interaction_query_service_1 = require("./world-runtime-npc-quest-interaction-query.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");

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

/** 世界运行时上下文动作查询服务：承接 contextActions 的只读组装。 */
let WorldRuntimeContextActionQueryService = class WorldRuntimeContextActionQueryService {
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

    constructor(templateRepository, playerRuntimeService, worldRuntimeNpcQuestInteractionQueryService) {
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
        const returnReadyTick = Math.max(0, Math.trunc(Number(player?.combat?.cooldownReadyTickBySkillId?.[shared_1.RETURN_TO_SPAWN_ACTION_ID] ?? 0)));
        const returnCooldownLeft = Math.max(0, returnReadyTick - currentTick);
        actions.push({
            id: shared_1.RETURN_TO_SPAWN_ACTION_ID,
            name: '遁返',
            type: 'travel',
            desc: `催动归引灵符，遁返回 ${respawnTargetName}，之后需调息 ${shared_1.RETURN_TO_SPAWN_COOLDOWN_TICKS} 息。`,
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
        if (typeof deps?.worldRuntimeSectService?.buildSectCoreActions === 'function') {
            actions.push(...deps.worldRuntimeSectService.buildSectCoreActions(view, deps));
        }
        if (typeof deps?.worldRuntimeSectService?.buildSectEntranceActions === 'function') {
            actions.push(...deps.worldRuntimeSectService.buildSectEntranceActions(view, deps));
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
        if (weapon?.tags?.includes('alchemy_furnace') || player?.alchemyJob) {
            actions.push({
                id: 'alchemy:open',
                name: '炼丹',
                type: 'interact',
                desc: weapon?.tags?.includes('alchemy_furnace')
                    ? '查看当前丹炉、丹方目录与炼制状态。'
                    : '查看当前炼丹状态。',
                cooldownLeft: 0,
            });
        }
        if (weapon?.tags?.includes('enhancement_hammer') || player?.enhancementJob) {
            actions.push({
                id: 'enhancement:open',
                name: '强化',
                type: 'interact',
                desc: weapon?.tags?.includes('enhancement_hammer')
                    ? '查看当前强化候选、保护材料与强化状态。'
                    : '查看当前强化状态。',
                cooldownLeft: 0,
            });
        }
        actions.sort((left, right) => compareStableStrings(left.id, right.id));
        return actions;
    }
};
exports.WorldRuntimeContextActionQueryService = WorldRuntimeContextActionQueryService;
exports.WorldRuntimeContextActionQueryService = WorldRuntimeContextActionQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [map_template_repository_1.MapTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService,
        world_runtime_npc_quest_interaction_query_service_1.WorldRuntimeNpcQuestInteractionQueryService])
], WorldRuntimeContextActionQueryService);

export { WorldRuntimeContextActionQueryService };
