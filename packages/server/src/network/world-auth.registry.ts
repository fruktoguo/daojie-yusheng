/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 世界鉴权模块注册表。
 * 汇总所有鉴权相关 provider，供 NestJS 模块统一注入。
 */

import { WorldGmAuthService } from './world-gm-auth.service';
import { WorldPlayerAuthService } from './world-player-auth.service';
import { WorldPlayerSnapshotService } from './world-player-snapshot.service';
import { WorldPlayerTokenCodecService } from './world-player-token-codec.service';
import { WorldPlayerTokenService } from './world-player-token.service';

/** 世界鉴权注入项：负责 Token 解析、鉴权与 GM 权限校验。 */
const WORLD_AUTH_PROVIDERS = [
    WorldPlayerTokenCodecService,
    WorldPlayerTokenService,
    WorldPlayerAuthService,
    WorldPlayerSnapshotService,
    WorldGmAuthService,
];
export { WORLD_AUTH_PROVIDERS };
