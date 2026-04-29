import { WorldGmAuthService } from './world-gm-auth.service';
import { WorldPlayerAuthService } from './world-player-auth.service';
import { WorldPlayerSourceService } from './world-player-source.service';
import { WorldPlayerSnapshotService } from './world-player-snapshot.service';
import { WorldPlayerTokenCodecService } from './world-player-token-codec.service';
import { WorldPlayerTokenService } from './world-player-token.service';

/** 世界鉴权注入项：负责玩家来源、Token 解析、鉴权与 GM 权限校验。 */
const WORLD_AUTH_PROVIDERS = [
    WorldPlayerSourceService,
    WorldPlayerTokenCodecService,
    WorldPlayerTokenService,
    WorldPlayerAuthService,
    WorldPlayerSnapshotService,
    WorldGmAuthService,
];
export { WORLD_AUTH_PROVIDERS };
