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

export interface SocketTechniqueGenerationSender {
  sendGetStatus(itemSpend?: number, mode?: 'single' | 'batch'): void;
  sendGenerate(category: 'internal' | 'arts', playerContext?: string, itemSpend?: number, mode?: 'single' | 'batch'): void;
  sendAdopt(jobId: string, customName: string): void;
  sendDiscard(jobId: string): void;
  sendAdoptBatch(batchId: string): void;
  sendDiscardBatch(batchId: string): void;
  sendCancel(jobId: string): void;
  sendCancelBatch(batchId: string): void;
}

export function createSocketTechniqueGenerationSender(deps: TechniqueGenerationSenderDeps): SocketTechniqueGenerationSender {
  return {
    sendGetStatus(itemSpend?: number, mode: 'single' | 'batch' = 'single'): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'getStatus', itemSpend, mode });
    },

    sendGenerate(
      category: 'internal' | 'arts',
      playerContext?: string,
      itemSpend?: number,
      mode: 'single' | 'batch' = 'single',
    ): void {
      deps.emitEvent(C2S.TechniqueGeneration, {
        action: 'generate',
        category,
        playerContext,
        itemSpend,
        mode,
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

    sendAdoptBatch(batchId: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'adoptBatch', batchId });
    },

    sendDiscardBatch(batchId: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'discardBatch', batchId });
    },

    sendCancel(jobId: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'cancel', jobId });
    },

    sendCancelBatch(batchId: string): void {
      deps.emitEvent(C2S.TechniqueGeneration, { action: 'cancel', batchId });
    },


  };
}

