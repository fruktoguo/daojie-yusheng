/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
/**
 * 内容模板按需查询发包模块。
 * 供 ContentResolver L3 层使用，低频操作。
 */

import type { C2S_RequestContentTemplates } from '@mud/shared';
import { C2S } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';

/** 内容模板查询发包接口。 */
export interface SocketContentSender {
  /** 发送批量内容模板查询请求。 */
  sendRequestContentTemplates(payload: C2S_RequestContentTemplates): void;
}

/** 内容模板查询发包依赖。 */
export interface SocketContentSenderDeps {
  emitEvent: SocketEmitEvent;
}

/** 创建内容模板查询发包实例。 */
export function createSocketContentSender(deps: SocketContentSenderDeps): SocketContentSender {
  return {
    sendRequestContentTemplates(payload: C2S_RequestContentTemplates): void {
      deps.emitEvent(C2S.RequestContentTemplates, payload);
    },
  };
}
