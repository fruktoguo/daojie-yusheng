/**
 * GM 鉴权服务。
 * 负责 Socket.IO 连接中 GM 令牌的校验，委托 RuntimeGmAuthService 执行实际验证。
 */

import { Inject, Injectable } from '@nestjs/common';

import { GM_AUTH_CONTRACT } from '../http/native/native-gm-contract';
import { RuntimeGmAuthService } from '../runtime/gm/runtime-gm-auth.service';

/** 运行时 GM 鉴权端口 */
interface RuntimeGmAuthPort {
  validateAccessToken(token: string | null | undefined): boolean;
}

/** GM Socket 鉴权服务：校验 socket 连接中的 GM 令牌合法性 */
@Injectable()
export class WorldGmAuthService {
  constructor(
    @Inject(RuntimeGmAuthService)
    private readonly gmAuthService: RuntimeGmAuthPort,
  ) {}

  /** 校验 socket 握手中的 GM token，仅当合约指定由 runtime_gm_auth_service 负责时生效 */
  validateSocketGmToken(token: string | null | undefined): boolean {
    if (GM_AUTH_CONTRACT.tokenValidatorOwner !== 'runtime_gm_auth_service') {
      return false;
    }
    return this.gmAuthService.validateAccessToken(token);
  }
}
