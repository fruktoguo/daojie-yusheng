"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORLD_AUTH_PROVIDERS = void 0;
const world_gm_auth_service_1 = require("./world-gm-auth.service");
const world_player_auth_service_1 = require("./world-player-auth.service");
const world_player_source_service_1 = require("./world-player-source.service");
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
const world_player_token_codec_service_1 = require("./world-player-token-codec.service");
const world_player_token_service_1 = require("./world-player-token.service");

/** 世界鉴权注入项：负责玩家来源、Token 解析、鉴权与 GM 权限校验。 */
exports.WORLD_AUTH_PROVIDERS = [
    world_player_source_service_1.WorldPlayerSourceService,
    world_player_token_codec_service_1.WorldPlayerTokenCodecService,
    world_player_token_service_1.WorldPlayerTokenService,
    world_player_auth_service_1.WorldPlayerAuthService,
    world_player_snapshot_service_1.WorldPlayerSnapshotService,
    world_gm_auth_service_1.WorldGmAuthService,
];
