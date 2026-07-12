/**
 * 用途：统一解码 smoke socket 载荷。
 */

import { decodeServerEventPayload, S2C } from '@mud/shared';

type SmokeSocketListener = (payload: unknown) => void;

interface SmokeSocketLike {
  on(event: string, listener: SmokeSocketListener): unknown;
  off?(event: string, listener: SmokeSocketListener): unknown;
}

export interface SmokeSyncEventHandlers {
  worldDelta?: SmokeSocketListener;
  selfDelta?: SmokeSocketListener;
  panelDelta?: SmokeSocketListener;
}

export function decodeSmokePayload(payload: unknown): unknown {
  if (Buffer.isBuffer(payload)) {
    return decodeSmokePayloadText(payload.toString('utf8')) ?? payload;
  }
  if (payload instanceof Uint8Array) {
    return decodeSmokePayloadText(Buffer.from(payload).toString('utf8')) ?? payload;
  }
  if (typeof payload === 'string') {
    return decodeSmokePayloadText(payload) ?? payload;
  }
  return payload;
}

/**
 * 同时订阅拆分增量和生产主线合并增量，避免 smoke 因协议承载方式迁移产生假失败。
 */
export function bindSmokeSyncEvents(
  socket: SmokeSocketLike,
  handlers: SmokeSyncEventHandlers,
): () => void {
  const onWorldDelta: SmokeSocketListener = (payload) => {
    handlers.worldDelta?.(decodeServerEventPayload<unknown>(S2C.WorldDelta, decodeSmokePayload(payload)));
  };
  const onSelfDelta: SmokeSocketListener = (payload) => {
    handlers.selfDelta?.(decodeServerEventPayload<unknown>(S2C.SelfDelta, decodeSmokePayload(payload)));
  };
  const onPanelDelta: SmokeSocketListener = (payload) => {
    handlers.panelDelta?.(decodeServerEventPayload<unknown>(S2C.PanelDelta, decodeSmokePayload(payload)));
  };
  const onSyncEnvelope: SmokeSocketListener = (payload) => {
    const envelope = decodeServerEventPayload<unknown>(S2C.SyncEnvelope, decodeSmokePayload(payload));
    if (!isRecord(envelope)) {
      return;
    }
    if (hasOwn(envelope, 'w')) {
      onWorldDelta(envelope.w);
    }
    if (hasOwn(envelope, 's')) {
      onSelfDelta(envelope.s);
    }
    if (hasOwn(envelope, 'p')) {
      onPanelDelta(envelope.p);
    }
  };

  socket.on(S2C.WorldDelta, onWorldDelta);
  socket.on(S2C.SelfDelta, onSelfDelta);
  socket.on(S2C.PanelDelta, onPanelDelta);
  socket.on(S2C.SyncEnvelope, onSyncEnvelope);

  return () => {
    socket.off?.(S2C.WorldDelta, onWorldDelta);
    socket.off?.(S2C.SelfDelta, onSelfDelta);
    socket.off?.(S2C.PanelDelta, onPanelDelta);
    socket.off?.(S2C.SyncEnvelope, onSyncEnvelope);
  };
}

function decodeSmokePayloadText(text: string): unknown | null {
  const trimmed = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    return null;
  }
  const candidates = [trimmed];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    candidates.push(trimmed.slice(firstBracket, lastBracket + 1));
  }
  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 继续尝试更宽松的截取。
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}
