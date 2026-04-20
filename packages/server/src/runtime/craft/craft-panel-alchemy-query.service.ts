// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.CraftPanelAlchemyQueryService = void 0;

const common_1 = require("@nestjs/common");
const craft_panel_alchemy_query_helpers_1 = require("./craft-panel-alchemy-query.helpers");

/** 炼丹面板只读查询服务：负责炼丹面板状态与目录快照构造。 */
let CraftPanelAlchemyQueryService = class CraftPanelAlchemyQueryService {
/**
 * buildAlchemyPanelPayload：构建并返回目标对象。
 * @param player 玩家对象。
 * @param knownCatalogVersion 参数说明。
 * @param alchemyCatalog 参数说明。
 * @param equippedWeapon 参数说明。
 * @returns 无返回值，直接更新炼丹面板载荷相关状态。
 */

    buildAlchemyPanelPayload(player, knownCatalogVersion, alchemyCatalog, equippedWeapon) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const state = this.buildAlchemyPanelState(player, equippedWeapon);
        const payload = {
            state,
            catalogVersion: craft_panel_alchemy_query_helpers_1.ALCHEMY_CATALOG_VERSION,
        };
        if (knownCatalogVersion !== craft_panel_alchemy_query_helpers_1.ALCHEMY_CATALOG_VERSION) {
            payload.catalog = alchemyCatalog.map((entry) => (0, craft_panel_alchemy_query_helpers_1.cloneAlchemyCatalogEntry)(entry));
        }
        if (!state) {
            payload.error = '尚未装备丹炉。';
        }
        return payload;
    }    
    /**
 * buildAlchemyPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @param equippedWeapon 参数说明。
 * @returns 无返回值，直接更新炼丹面板状态相关状态。
 */

    buildAlchemyPanelState(player, equippedWeapon) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const furnaceItemId = equippedWeapon?.tags?.includes(craft_panel_alchemy_query_helpers_1.ALCHEMY_FURNACE_TAG) ? equippedWeapon.itemId : undefined;
        if (!furnaceItemId && !player.alchemyJob) {
            return null;
        }
        return {
            furnaceItemId,
            presets: (player.alchemyPresets ?? []).map((entry) => (0, craft_panel_alchemy_query_helpers_1.cloneAlchemyPreset)(entry)),
            job: player.alchemyJob ? (0, craft_panel_alchemy_query_helpers_1.cloneAlchemyJob)(player.alchemyJob) : null,
        };
    }
};
exports.CraftPanelAlchemyQueryService = CraftPanelAlchemyQueryService;
exports.CraftPanelAlchemyQueryService = CraftPanelAlchemyQueryService = __decorate([
    (0, common_1.Injectable)()
], CraftPanelAlchemyQueryService);
export { CraftPanelAlchemyQueryService };
