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

/** 战斗特效状态服务：承接实例级 fx buffer 与 push helper。 */
let WorldRuntimeCombatEffectsService = class WorldRuntimeCombatEffectsService {
    latestCombatEffectsByInstanceId = new Map();
    getCombatEffects(instanceId) {
        const effects = this.latestCombatEffectsByInstanceId.get(instanceId);
        return effects ? effects.map((entry) => ({ ...entry })) : [];
    }
    resetFrameEffects() {
        this.latestCombatEffectsByInstanceId.clear();
    }
    resetAll() {
        this.latestCombatEffectsByInstanceId.clear();
    }
    pushCombatEffect(instanceId, effect) {
        const list = this.latestCombatEffectsByInstanceId.get(instanceId);
        if (list) {
            list.push(effect);
            return;
        }
        this.latestCombatEffectsByInstanceId.set(instanceId, [effect]);
    }
    pushActionLabelEffect(instanceId, x, y, text) {
        this.pushCombatEffect(instanceId, {
            type: 'float',
            x,
            y,
            text,
            color: '#efe3c2',
            variant: 'action',
        });
    }
    pushDamageFloatEffect(instanceId, x, y, damage, color) {
        this.pushCombatEffect(instanceId, {
            type: 'float',
            x,
            y,
            text: `-${Math.max(0, Math.round(damage))}`,
            color,
            variant: 'damage',
        });
    }
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
