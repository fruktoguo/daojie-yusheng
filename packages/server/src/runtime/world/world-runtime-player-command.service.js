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
exports.WorldRuntimePlayerCommandService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime player-command orchestration：承接玩家命令路由与门禁。 */
let WorldRuntimePlayerCommandService = class WorldRuntimePlayerCommandService {
    dispatchPlayerCommand(playerId, command, deps) {
        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        if (player.hp <= 0 && command.kind !== 'redeemCodes') {
            return;
        }
        switch (command.kind) {
            case 'useItem':
                deps.dispatchUseItem(playerId, command.slotIndex);
                return;
            case 'equip':
                deps.dispatchEquipItem(playerId, command.slotIndex);
                return;
            case 'dropItem':
                deps.dispatchDropItem(playerId, command.slotIndex, command.count);
                return;
            case 'moveTo':
                deps.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable, command.clientPathHint);
                return;
            case 'basicAttack':
                deps.dispatchBasicAttack(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY);
                return;
            case 'engageBattle':
                deps.dispatchEngageBattle(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, command.locked);
                return;
            case 'takeGround':
                deps.dispatchTakeGround(playerId, command.sourceId, command.itemKey);
                return;
            case 'takeGroundAll':
                deps.dispatchTakeGroundAll(playerId, command.sourceId);
                return;
            case 'unequip':
                deps.dispatchUnequipItem(playerId, command.slot);
                return;
            case 'cultivate':
                deps.dispatchCultivateTechnique(playerId, command.techniqueId);
                return;
            case 'startAlchemy':
                deps.dispatchStartAlchemy(playerId, command.payload);
                return;
            case 'cancelAlchemy':
                deps.dispatchCancelAlchemy(playerId);
                return;
            case 'saveAlchemyPreset':
                deps.dispatchSaveAlchemyPreset(playerId, command.payload);
                return;
            case 'deleteAlchemyPreset':
                deps.dispatchDeleteAlchemyPreset(playerId, command.presetId);
                return;
            case 'startEnhancement':
                deps.dispatchStartEnhancement(playerId, command.payload);
                return;
            case 'cancelEnhancement':
                deps.dispatchCancelEnhancement(playerId);
                return;
            case 'redeemCodes':
                deps.dispatchRedeemCodes(playerId, command.codes);
                return;
            case 'breakthrough':
                deps.dispatchBreakthrough(playerId);
                return;
            case 'heavenGateAction':
                deps.dispatchHeavenGateAction(playerId, command.action, command.element);
                return;
            case 'castSkill':
                deps.dispatchCastSkill(playerId, command.skillId, command.targetPlayerId, command.targetMonsterId, command.targetRef);
                return;
            case 'buyNpcShopItem':
                deps.dispatchBuyNpcShopItem(playerId, command.npcId, command.itemId, command.quantity);
                return;
            case 'npcInteraction':
                deps.dispatchNpcInteraction(playerId, command.npcId);
                return;
            case 'interactNpcQuest':
                deps.dispatchInteractNpcQuest(playerId, command.npcId);
                return;
            case 'acceptNpcQuest':
                deps.dispatchAcceptNpcQuest(playerId, command.npcId, command.questId);
                return;
            case 'submitNpcQuest':
                deps.dispatchSubmitNpcQuest(playerId, command.npcId, command.questId);
                return;
        }
    }
};
exports.WorldRuntimePlayerCommandService = WorldRuntimePlayerCommandService;
exports.WorldRuntimePlayerCommandService = WorldRuntimePlayerCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], WorldRuntimePlayerCommandService);
