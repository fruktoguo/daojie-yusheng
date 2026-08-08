/** 通用权限详情、玩家序号解析与保存请求的低频发包入口。 */
import { C2S, type ClientToServerEventPayload } from '@mud/shared';

import type { SocketSendResult } from './socket-outbound-gate';
import type { SocketEmitEvent } from './socket-send-types';

type SocketAccessPolicySenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketAccessPolicySender(deps: SocketAccessPolicySenderDeps) {
  return {
    request(payload: ClientToServerEventPayload<typeof C2S.RequestAccessPolicy>): SocketSendResult {
      return deps.emitEvent(C2S.RequestAccessPolicy, payload);
    },
    requestSet(payload: ClientToServerEventPayload<typeof C2S.RequestAccessPolicySet>): SocketSendResult {
      return deps.emitEvent(C2S.RequestAccessPolicySet, payload);
    },
    resolvePlayer(payload: ClientToServerEventPayload<typeof C2S.ResolveAccessPolicyPlayer>): SocketSendResult {
      return deps.emitEvent(C2S.ResolveAccessPolicyPlayer, payload);
    },
    save(payload: ClientToServerEventPayload<typeof C2S.SaveAccessPolicy>): SocketSendResult {
      return deps.emitEvent(C2S.SaveAccessPolicy, payload);
    },
  };
}

export type SocketAccessPolicySender = ReturnType<typeof createSocketAccessPolicySender>;
