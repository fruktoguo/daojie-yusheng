// @ts-nocheck

/**
 * 用途：审计 server 主线边界依赖。
 */
const fs = require("node:fs");
const path = require("node:path");
const packageRoot = path.resolve(__dirname, "..", "..", "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
/**
 * 记录doc输出。
 */
const docOutput = process.env.PRODUCTION_BOUNDARY_AUDIT_OUTPUT
  ? path.resolve(repoRoot, process.env.PRODUCTION_BOUNDARY_AUDIT_OUTPUT)
  : path.join(repoRoot, ".runtime", "docs", "production-boundary-audit.md");

/**
 * 记录类别order。
 */
const CATEGORY_ORDER = [
  "P0 auth/bootstrap 真源",
  "P0 legacy HTTP/GM/admin",
  "P1 world sync compat",
  "P1 runtime/persistence compat",
  "目标差距: 性能/扩展",
];

/**
 * 记录checks。
 */
const CHECKS = [
  {
    id: "auth.identity.legacy_source",
    category: "P0 auth/bootstrap 真源",
    description: "玩家身份解析仍经由 legacy player source",
    file: "packages/server/src/network/world-player-auth.service.ts",
    pattern: "worldLegacyPlayerSourceService.resolvePlayerIdentityFromCompatSource(",
  },
  {
    id: "auth.snapshot.legacy_fallback",
    category: "P0 auth/bootstrap 真源",
    description: "玩家快照装载仍保留 legacy fallback",
    file: "packages/server/src/network/world-player-snapshot.service.ts",
    pattern: "loadPlayerSnapshotFromCompatSource(",
  },
  {
    id: "legacy_http.controllers",
    category: "P0 legacy HTTP/GM/admin",
    description: "AppModule 仍挂载 legacy 账号/GM/admin 控制器",
    file: "packages/server/src/app.module.ts",
    pattern: "Legacy",
    include: [
      "Controller",
    ],
  },
  {
    id: "legacy_http.providers",
    category: "P0 legacy HTTP/GM/admin",
    description: "AppModule 仍注入 legacy auth/GM compat provider",
    file: "packages/server/src/app.module.ts",
    pattern: "Legacy",
    include: [
      "Service",
      "Guard",
      "Compat",
      "Bootstrap",
    ],
    exclude: [
      "WorldLegacySyncService",
    ],
  },
  {
    id: "legacy_http.health_readiness",
    category: "P0 legacy HTTP/GM/admin",
    description: "health readiness 仍把 legacy auth / GM admin compat 作为 readiness 前提",
    file: "packages/server/src/health/health-readiness.service.ts",
    pattern: "legacy",
  },
  {
    id: "sync.compat_initial",
    category: "P1 world sync compat",
    description: "WorldSyncService 仍保留 compat 初始同步分支",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "emitCompatInitialSync(",
  },
  {
    id: "sync.compat_delta",
    category: "P1 world sync compat",
    description: "WorldSyncService 仍保留 compat 增量同步分支",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "emitCompatDeltaSync(",
  },
  {
    id: "sync.legacy_navigation_path",
    category: "P1 world sync compat",
    description: "compat tick 仍直接读取 legacy 导航路径",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "getLegacyNavigationPath(",
  },
  {
    id: "sync.protocol_dual_emit",
    category: "P1 world sync compat",
    description: "低频同步仍通过 protocol-aware helper 维持 next/legacy 双发",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "emitProtocol",
  },
  {
    id: "runtime.snapshot_legacy_bonuses",
    category: "P1 runtime/persistence compat",
    description: "持久化装载仍回读 legacyBonuses",
    file: "packages/server/src/persistence/player-persistence.service.ts",
    pattern: "legacyBonuses",
  },
  {
    id: "runtime.snapshot_legacy_logbook",
    category: "P1 runtime/persistence compat",
    description: "持久化装载仍回读 legacyCompat.pendingLogbookMessages",
    file: "packages/server/src/persistence/player-persistence.service.ts",
    pattern: "legacyCompat?.pendingLogbookMessages",
  },
  {
    id: "runtime.snapshot_legacy_bonus_source",
    category: "P1 runtime/persistence compat",
    description: "持久化规范化仍兼容 legacy:vitals_baseline 标签",
    file: "packages/server/src/persistence/player-persistence.service.ts",
    pattern: "legacy:vitals_baseline",
  },
  {
    id: "runtime.legacy_snapshot_adapter",
    category: "P1 runtime/persistence compat",
    description: "WorldPlayerSource 仍保留 migration-only snapshot 占位入口",
    file: "packages/server/src/network/world-player-source.service.ts",
    pattern: "loadPlayerSnapshotForMigration(",
  },
  {
    id: "perf.full_capture",
    category: "目标差距: 性能/扩展",
    description: "WorldProjector 每轮仍做整份 capture 后再 diff",
    file: "packages/server/src/network/world-projector.service.ts",
    pattern: "capture(view, player)",
  },
  {
    id: "perf.string_key_split",
    category: "目标差距: 性能/扩展",
    description: "WorldSync 仍使用字符串 tile key split(',')",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "split(',')",
  },
  {
    id: "perf.locale_compare_sync",
    category: "目标差距: 性能/扩展",
    description: "WorldSync 热路径仍存在 localeCompare 排序",
    file: "packages/server/src/network/world-sync.service.ts",
    pattern: "localeCompare(",
  },
  {
    id: "perf.locale_compare_runtime",
    category: "目标差距: 性能/扩展",
    description: "WorldRuntime 仍存在 localeCompare 排序",
    file: "packages/server/src/runtime/world/world-runtime.service.ts",
    pattern: "localeCompare(",
  },
  {
    id: "perf.json_signature_runtime",
    category: "目标差距: 性能/扩展",
    description: "WorldRuntime 仍存在 JSON.stringify 级签名比较",
    file: "packages/server/src/runtime/world/world-runtime.service.ts",
    pattern: "JSON.stringify(",
  },
  {
    id: "network.world_gateway_market_any",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGateway 的 MarketRuntimeService 注入回退为 any",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "marketRuntimeService: any",
    forbidden: true,
  },
  {
    id: "network.world_gateway_runtime_any",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGateway 的 WorldRuntimeService 注入回退为 any",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "worldRuntimeService: any",
    forbidden: true,
  },
  {
    id: "network.world_gateway_action_as_any",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGatewayActionHelper 构造回退为 this as any",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "new WorldGatewayActionHelper(this as any)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_guard_manual_new",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGatewayGuardHelper 回退为手动 new 并持有完整 gateway",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "new WorldGatewayGuardHelper(this)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_client_emit_manual_new",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGatewayClientEmitHelper 回退为手动 new 并持有完整 gateway",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "new WorldGatewayClientEmitHelper(this)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_session_state_manual_new",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGatewaySessionStateHelper 回退为手动 new 并持有完整 gateway",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "new WorldGatewaySessionStateHelper(this)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_building_manual_new",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGatewayBuildingHelper 回退为手动 new 并持有完整 gateway",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "new WorldGatewayBuildingHelper(this)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_movement_manual_new",
    category: "目标差距: 性能/扩展",
    description: "禁止 WorldGatewayMovementHelper 回退为手动 new 并持有完整 gateway",
    file: "packages/server/src/network/world.gateway.ts",
    pattern: "new WorldGatewayMovementHelper(this)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_bootstrap",
    category: "目标差距: 性能/扩展",
    description: "禁止 bootstrap helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-bootstrap.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_guard",
    category: "目标差距: 性能/扩展",
    description: "禁止 guard helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-guard.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_session_state",
    category: "目标差距: 性能/扩展",
    description: "禁止 session-state helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-session-state.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_client_emit",
    category: "目标差距: 性能/扩展",
    description: "禁止 client-emit helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-client-emit.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_player_controls",
    category: "目标差距: 性能/扩展",
    description: "禁止 player-controls helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-player-controls.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_action",
    category: "目标差距: 性能/扩展",
    description: "禁止 action helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-action.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_market",
    category: "目标差距: 性能/扩展",
    description: "禁止 market helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-market.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_inventory",
    category: "目标差距: 性能/扩展",
    description: "禁止 inventory helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-inventory.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_mail",
    category: "目标差距: 性能/扩展",
    description: "禁止 mail helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-mail.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_movement",
    category: "目标差距: 性能/扩展",
    description: "禁止 movement helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-movement.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_npc",
    category: "目标差距: 性能/扩展",
    description: "禁止 npc helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-npc.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_craft",
    category: "目标差距: 性能/扩展",
    description: "禁止 craft helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-craft.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_read_model",
    category: "目标差距: 性能/扩展",
    description: "禁止 read-model helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-read-model.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_building",
    category: "目标差距: 性能/扩展",
    description: "禁止 building helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-building.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_suggestion",
    category: "目标差距: 性能/扩展",
    description: "禁止 suggestion helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-suggestion.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_gm_command",
    category: "目标差距: 性能/扩展",
    description: "禁止 gm-command helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-gm-command.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_gm_suggestion",
    category: "目标差距: 性能/扩展",
    description: "禁止 gm-suggestion helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-gm-suggestion.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "network.world_gateway_helper_untyped_presence",
    category: "目标差距: 性能/扩展",
    description: "禁止 presence helper 构造器回退为无类型 gateway",
    file: "packages/server/src/network/world-gateway-presence.helper.ts",
    pattern: "constructor(gateway)",
    forbidden: true,
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_inventory",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_inventory_item 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_INVENTORY_ITEM_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_wallet",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_wallet 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_WALLET_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_equipment",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_equipment_slot 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_EQUIPMENT_SLOT_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_market_storage",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_market_storage_item 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_map_unlock",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_map_unlock 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_MAP_UNLOCK_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_technique",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_technique_state 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_TECHNIQUE_STATE_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_buff",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_persistent_buff_state 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_PERSISTENT_BUFF_STATE_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_quest",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_quest_progress 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_QUEST_PROGRESS_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_auto_battle",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_auto_battle_skill 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_AUTO_BATTLE_SKILL_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_auto_use",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_auto_use_item_rule 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_AUTO_USE_ITEM_RULE_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_profession",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_profession_state 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_PROFESSION_STATE_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_alchemy",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_alchemy_preset 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_ALCHEMY_PRESET_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_enhancement",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_enhancement_record 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.player_domain_logbook",
    category: "目标差距: 性能/扩展",
    description: "禁止玩家分域快照回退为 player_logbook_message 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/player-domain-persistence.service.ts",
    pattern: "DELETE FROM ${PLAYER_LOGBOOK_MESSAGE_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.durable_market_storage",
    category: "目标差距: 性能/扩展",
    description: "禁止 durable 快照回退为 player_market_storage_item 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/durable-operation.service.ts",
    pattern: "DELETE FROM ${PLAYER_MARKET_STORAGE_ITEM_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.durable_quest",
    category: "目标差距: 性能/扩展",
    description: "禁止 durable 快照回退为 player_quest_progress 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/durable-operation.service.ts",
    pattern: "DELETE FROM ${PLAYER_QUEST_PROGRESS_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.durable_enhancement",
    category: "目标差距: 性能/扩展",
    description: "禁止 durable 快照回退为 player_enhancement_record 整玩家 DELETE 后全量重插",
    file: "packages/server/src/persistence/durable-operation.service.ts",
    pattern: "DELETE FROM ${PLAYER_ENHANCEMENT_RECORD_TABLE} WHERE player_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_building_cells",
    category: "目标差距: 性能/扩展",
    description: "禁止实例建筑格子快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_BUILDING_CELL_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_buildings",
    category: "目标差距: 性能/扩展",
    description: "禁止实例建筑状态快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_BUILDING_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_rooms",
    category: "目标差距: 性能/扩展",
    description: "禁止实例房间快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_ROOM_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_room_cells",
    category: "目标差距: 性能/扩展",
    description: "禁止实例房间格子快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_ROOM_CELL_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_feng_shui",
    category: "目标差距: 性能/扩展",
    description: "禁止实例风水快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_FENGSHUI_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_runtime_tiles",
    category: "目标差距: 性能/扩展",
    description: "禁止运行时地块快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_TILE_CELL_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_tile_resources",
    category: "目标差距: 性能/扩展",
    description: "禁止地块资源快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_TILE_RESOURCE_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_tile_damage",
    category: "目标差距: 性能/扩展",
    description: "禁止地块破坏快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_TILE_DAMAGE_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "deleteTileDamageStates",
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_temporary_tiles",
    category: "目标差距: 性能/扩展",
    description: "禁止临时地块快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_TEMPORARY_TILE_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_ground_items",
    category: "目标差距: 性能/扩展",
    description: "禁止地面物品快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_GROUND_ITEM_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_containers",
    category: "目标差距: 性能/扩展",
    description: "禁止容器状态快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_CONTAINER_STATE_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_container_entries",
    category: "目标差距: 性能/扩展",
    description: "禁止容器条目快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_CONTAINER_ENTRY_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_container_timers",
    category: "目标差距: 性能/扩展",
    description: "禁止容器计时器快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_CONTAINER_TIMER_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
  {
    id: "persistence.snapshot_rewrite.instance_overlays",
    category: "目标差距: 性能/扩展",
    description: "禁止覆盖层快照回退为整实例 DELETE 后全量重插",
    file: "packages/server/src/persistence/instance-domain-persistence.service.ts",
    pattern: "DELETE FROM ${INSTANCE_OVERLAY_CHUNK_TABLE} WHERE instance_id = $1",
    forbidden: true,
    exclude: [
      " AND ",
    ],
    allowedFunctions: [
      "purgeInstanceState",
    ],
  },
];

/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 汇总执行结果。
 */
  const results = CHECKS.map(runCheck);
/**
 * 记录汇总。
 */
  const summary = buildSummary(results);
/**
 * 记录markdown。
 */
  const markdown = renderMarkdown(summary, results);
  fs.mkdirSync(path.dirname(docOutput), { recursive: true });
  fs.writeFileSync(docOutput, markdown, "utf8");
  process.stdout.write(`[production boundary audit] report written to ${docOutput}\n`);
  process.stdout.write(`[production boundary audit] matched ${summary.matchedChecks}/${summary.totalChecks} checks, ${summary.totalHits} code hits across ${summary.categories.length} categories\n`);
  if (summary.forbiddenHits > 0) {
    process.stderr.write(`[production boundary audit] forbidden patterns matched ${summary.forbiddenHits} code hits\n`);
    process.exitCode = 1;
  }
}

/**
 * 运行check。
 */
function runCheck(entry) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 记录absolute路径。
 */
  const absolutePath = path.join(repoRoot, entry.file);
  if (!fs.existsSync(absolutePath)) {
    return {
      ...entry,
      hits: [],
      skippedReason: `missing file: ${entry.file}`,
    };
  }
/**
 * 记录来源。
 */
  const source = fs.readFileSync(absolutePath, "utf8");
/**
 * 汇总输出行。
 */
  const lines = source.split(/\r?\n/);
/**
 * 记录hits。
 */
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
/**
 * 记录line。
 */
    const line = lines[index];
    if (!line.includes(entry.pattern)) {
      continue;
    }
    if (Array.isArray(entry.include) && entry.include.length > 0 && !entry.include.some((token) => line.includes(token))) {
      continue;
    }
    if (Array.isArray(entry.exclude) && entry.exclude.some((token) => line.includes(token))) {
      continue;
    }
    if (isWithinAllowedFunction(lines, index, entry.allowedFunctions)) {
      continue;
    }
    hits.push({
      line: index + 1,
      excerpt: line.trim(),
    });
  }
  return {
    ...entry,
    hits,
    skippedReason: null,
  };
}

/**
 * 判断命中是否位于显式允许的函数体内。
 */
function isWithinAllowedFunction(lines, lineIndex, allowedFunctions) {
  if (!Array.isArray(allowedFunctions) || allowedFunctions.length === 0) {
    return false;
  }
  for (let index = lineIndex; index >= 0; index -= 1) {
/**
 * 记录line。
 */
    const line = lines[index];
    if (!line.includes("async ") && !line.includes("function ")) {
      continue;
    }
    return allowedFunctions.some((functionName) => line.includes(`${functionName}(`));
  }
  return false;
}

/**
 * 构建汇总。
 */
function buildSummary(results) {
/**
 * 记录categories。
 */
  const categories = CATEGORY_ORDER.map((name) => {
/**
 * 记录checks。
 */
    const checks = results.filter((entry) => entry.category === name);
/**
 * 记录matched。
 */
    const matched = checks.filter((entry) => entry.hits.length > 0);
    return {
      name,
      checks: checks.length,
      matchedChecks: matched.length,
      totalHits: matched.reduce((sum, entry) => sum + entry.hits.length, 0),
    };
  }).filter((entry) => entry.checks > 0);
  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    totalChecks: results.length,
    matchedChecks: results.filter((entry) => entry.hits.length > 0).length,
    skippedChecks: results.filter((entry) => typeof entry.skippedReason === "string" && entry.skippedReason.length > 0).length,
    forbiddenHits: results.filter((entry) => entry.forbidden === true).reduce((sum, entry) => sum + entry.hits.length, 0),
    totalHits: results.reduce((sum, entry) => sum + entry.hits.length, 0),
    categories,
  };
}

/**
 * 处理rendermarkdown。
 */
function renderMarkdown(summary, results) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

/**
 * 汇总输出行。
 */
  const lines = [];
  lines.push("# server 主线边界自动审计");
  lines.push("");
  lines.push(`更新时间：${summary.generatedAt}`);
  lines.push("");
  lines.push("## 一句话结论");
  lines.push("");
  lines.push("- 这份报告只统计仓库里仍可见的旧数据边界、兼容边界与性能热点，不等于 release 失败，也不代表完整替换已完成。");
  lines.push(`- 当前自动审计命中 ${summary.matchedChecks} / ${summary.totalChecks} 个检查项，共 ${summary.totalHits} 处代码证据。`);
  if (summary.forbiddenHits > 0) {
    lines.push(`- 禁止模式命中 ${summary.forbiddenHits} 处；本次审计应视为失败。`);
  } else {
    lines.push("- 禁止模式命中 0 处。");
  }
  if (summary.skippedChecks > 0) {
    lines.push(`- 另有 ${summary.skippedChecks} 个检查项因 inventory 文件路径漂移被 fail-soft 跳过，不影响其余检查继续产出。`);
  }
  lines.push("- 保守口径不变：`next` 离“完整替换游戏整体”仍约差 `40% - 45%`。");
  lines.push("");
  lines.push("## 汇总");
  lines.push("");
  lines.push("| 类别 | 命中检查项 | 代码证据 |");
  lines.push("| --- | ---: | ---: |");
  for (const category of summary.categories) {
    lines.push(`| ${category.name} | ${category.matchedChecks} / ${category.checks} | ${category.totalHits} |`);
  }
  for (const categoryName of CATEGORY_ORDER) {
/**
 * 记录类别checks。
 */
    const categoryChecks = results.filter((entry) => entry.category === categoryName && entry.hits.length > 0);
    if (categoryChecks.length === 0) {
      continue;
    }
    lines.push("");
    lines.push(`## ${categoryName}`);
    lines.push("");
    for (const entry of categoryChecks) {
/**
 * 记录firsthit。
 */
      const firstHit = entry.hits[0];
      lines.push(`- ${entry.description}`);
      if (entry.forbidden === true) {
        lines.push("  - 级别：禁止模式");
      }
      lines.push(`  - 文件：\`${entry.file}:${firstHit.line}\``);
      lines.push(`  - 命中次数：${entry.hits.length}`);
      lines.push(`  - 首个证据：\`${escapeBackticks(firstHit.excerpt)}\``);
    }
  }
/**
 * 记录跳过项。
 */
  const skippedChecks = results.filter((entry) => typeof entry.skippedReason === "string" && entry.skippedReason.length > 0);
  if (skippedChecks.length > 0) {
    lines.push("");
    lines.push("## 已跳过项");
    lines.push("");
    for (const entry of skippedChecks) {
      lines.push(`- ${entry.description}`);
      lines.push(`  - 文件：\`${entry.file}\``);
      lines.push(`  - 原因：${entry.skippedReason}`);
    }
  }
  lines.push("");
  lines.push("## 备注");
  lines.push("");
  lines.push("- 运行命令：`pnpm audit:boundaries`。");
  lines.push("- 报告由 `packages/server/src/tools/audit/production-boundary-audit.ts` 自动生成。");
  lines.push("- 这份审计的定位是 inventory，不是 release 验收，也不会替代 `pnpm verify:release`、`with-db`、`shadow` 或协议审计。");
  lines.push("- 清单里若仍残留已迁移路径，脚本现在会 fail-soft 跳过并把原因写进报告，而不是直接中断。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/**
 * 规整backticks。
 */
function escapeBackticks(value) {
  return String(value).replace(/`/g, "\\`");
}

main();
