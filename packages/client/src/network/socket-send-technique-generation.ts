/**
 * 本文件属于客户端网络层，负责 socket 生命周期、发包封装或服务端事件消费。
 *
 * 维护时要使用共享协议事件名和最小字段，避免把服务端权威判断下沉到客户端。
 */
import { C2S } from '@mud/shared';
import type { SocketEmitEvent } from './socket-send-types';

type TechniqueGenerationSenderDeps = {
  emitEvent: SocketEmitEvent;
};

export function createSocketTechniqueGenerationSender(deps: TechniqueGenerationSenderDeps) {
  return {
    sendGetStatus(): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'getStatus' });
    },

    sendGenerate(category: 'internal' | 'arts', playerContext?: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, {
        action: 'generate',
        category,
        playerContext,
      });
    },

    sendAdopt(jobId: string, customName: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, {
        action: 'adopt',
        jobId,
        customName,
      });
    },

    sendDiscard(jobId: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'discard', jobId });
    },
  };
}

export type SocketTechniqueGenerationSender = ReturnType<typeof createSocketTechniqueGenerationSender>;
