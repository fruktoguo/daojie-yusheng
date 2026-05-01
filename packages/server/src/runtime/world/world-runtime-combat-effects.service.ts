// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeCombatEffectsService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared");

/** 战斗特效状态服务：承接实例级 fx buffer 与 push helper。 */
let WorldRuntimeCombatEffectsService = class WorldRuntimeCombatEffectsService {
/**
 * latestCombatEffectsByInstanceId：latest战斗EffectByInstanceID标识。
 */

    latestCombatEffectsByInstanceId = new Map();    
    /**
 * getCombatEffects：读取战斗Effect。
 * @param instanceId instance ID。
 * @returns 无返回值，完成战斗Effect的读取/组装。
 */

    getCombatEffects(instanceId) {
        const effects = this.latestCombatEffectsByInstanceId.get(instanceId);
        return effects ? effects.map((entry) => ({ ...entry })) : [];
    }    
    /**
 * resetFrameEffects：执行reset帧Effect相关逻辑。
 * @returns 无返回值，直接更新reset帧Effect相关状态。
 */

    resetFrameEffects() {
        this.latestCombatEffectsByInstanceId.clear();
    }    
    /**
 * resetAll：执行resetAll相关逻辑。
 * @returns 无返回值，直接更新resetAll相关状态。
 */

    resetAll() {
        this.latestCombatEffectsByInstanceId.clear();
    }    
    /**
 * pushCombatEffect：处理战斗Effect并更新相关状态。
 * @param instanceId instance ID。
 * @param effect 参数说明。
 * @returns 无返回值，直接更新战斗Effect相关状态。
 */

    pushCombatEffect(instanceId, effect) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const list = this.latestCombatEffectsByInstanceId.get(instanceId);
        if (list) {
            list.push(effect);
            return;
        }
        this.latestCombatEffectsByInstanceId.set(instanceId, [effect]);
    }    
    /**
 * pushActionLabelEffect：处理ActionLabelEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param text 参数说明。
 * @returns 无返回值，直接更新ActionLabelEffect相关状态。
 */

    pushActionLabelEffect(instanceId, x, y, text, options = undefined) {
        this.pushCombatEffect(instanceId, {
            type: 'float',
            x,
            y,
            text,
            color: '#efe3c2',
            variant: 'action',
            actionStyle: options?.actionStyle,
            durationMs: options?.durationMs,
        });
    }    
    /**
 * pushDamageFloatEffect：处理DamageFloatEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param damage 参数说明。
 * @param color 参数说明。
 * @returns 无返回值，直接更新DamageFloatEffect相关状态。
 */

    pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.pushCombatEffect(instanceId, {
            type: 'float',
            x,
            y,
            text: `-${(0, shared_1.formatDisplayInteger)(Math.max(0, Math.round(damage)))}`,
            color,
            variant: 'damage',
        });
    }    
    /**
 * pushAttackEffect：处理AttackEffect并更新相关状态。
 * @param instanceId instance ID。
 * @param fromX 参数说明。
 * @param fromY 参数说明。
 * @param toX 参数说明。
 * @param toY 参数说明。
 * @param color 参数说明。
 * @returns 无返回值，直接更新AttackEffect相关状态。
 */

    pushAttackEffect(instanceId, fromX, fromY, toX, toY, color) {
        this.pushCombatEffect(instanceId, {
            type: 'attack',
            fromX,
            fromY,
            toX,
            toY,
            color,
        });
    }
};
exports.WorldRuntimeCombatEffectsService = WorldRuntimeCombatEffectsService;
exports.WorldRuntimeCombatEffectsService = WorldRuntimeCombatEffectsService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeCombatEffectsService);

export { WorldRuntimeCombatEffectsService };
