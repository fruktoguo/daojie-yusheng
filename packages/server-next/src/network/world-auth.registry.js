"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORLD_AUTH_PROVIDERS = void 0;
/** world_gm_auth_service_1：定义该变量以承载业务值。 */
const world_gm_auth_service_1 = require("./world-gm-auth.service");
/** world_player_auth_service_1：定义该变量以承载业务值。 */
const world_player_auth_service_1 = require("./world-player-auth.service");
/** world_player_source_service_1：定义该变量以承载业务值。 */
const world_player_source_service_1 = require("./world-player-source.service");
/** world_player_snapshot_service_1：定义该变量以承载业务值。 */
const world_player_snapshot_service_1 = require("./world-player-snapshot.service");
/** world_player_token_codec_service_1：定义该变量以承载业务值。 */
const world_player_token_codec_service_1 = require("./world-player-token-codec.service");
/** world_player_token_service_1：定义该变量以承载业务值。 */
const world_player_token_service_1 = require("./world-player-token.service");
exports.WORLD_AUTH_PROVIDERS = [
    world_player_source_service_1.WorldPlayerSourceService,
    world_player_token_codec_service_1.WorldPlayerTokenCodecService,
    world_player_token_service_1.WorldPlayerTokenService,
    world_player_auth_service_1.WorldPlayerAuthService,
    world_player_snapshot_service_1.WorldPlayerSnapshotService,
    world_gm_auth_service_1.WorldGmAuthService,
];
