/**
 * 本文件负责前后端共享的类型、常量或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时要保持跨端无副作用和依赖一致，避免引入只适用于浏览器或只适用于服务端的私有状态。
 */
import { PROTOBUF_C2S_EVENTS, PROTOBUF_S2C_EVENTS } from './network-protobuf-schema';
import type { BinaryPayload } from './network-protobuf-wire-helpers';
import { normalizeBinaryPayload, encodeUtf8, decodeUtf8 } from './network-protobuf-wire-helpers';

export {
  PROTOBUF_S2C_EVENTS,
  PROTOBUF_C2S_EVENTS,
  tickPayloadType,
} from './network-protobuf-schema';
export type { BinaryPayload } from './network-protobuf-wire-helpers';
export {
  decodeMessage,
  fromWireActionEntry,
  fromWireActionsUpdate,
  fromWireAttrUpdate,
  fromWireTechniqueEntry,
  fromWireTechniqueUpdate,
  fromWireTick,
  fromWireTickEntity,
  toWireActionEntry,
  toWireActionsUpdate,
  toWireAttrUpdate,
  toWireTechniqueEntry,
  toWireTechniqueUpdate,
  toWireTick,
  toWireTickEntity,
} from './network-protobuf-payload-codecs';
export {
  cloneJson,
  decodeUtf8,
  encodeUtf8,
  fromWireAttributes,
  fromWireGameTimeState,
  fromWireNpcQuestMarker,
  fromWirePartialAttributes,
  fromWirePartialNumericStats,
  fromWirePartialPlayerSpecialStats,
  fromWirePartialRatioDivisors,
  fromWireNumericStats,
  fromWirePlayerSpecialStats,
  fromWireRatioDivisors,
  fromWireVisibleTile,
  hasOwn,
  normalizeBinaryPayload,
  parseJson,
  readNullableWireValue,
  setNullableWireValue,
  toWireAttributes,
  toWireGameTimeState,
  toWireNpcQuestMarker,
  toWirePartialAttributes,
  toWirePartialNumericStats,
  toWirePartialPlayerSpecialStats,
  toWirePartialRatioDivisors,
  toWireNumericStats,
  toWirePlayerSpecialStats,
  toWireRatioDivisors,
  toWireVisibleTile,
} from './network-protobuf-wire-helpers';

/** 服务端发送前把支持的 payload 编码为二进制（当前为 JSON binary 模式）。 */
export function encodeServerEventPayload<T>(event: string, payload: T): T | Uint8Array {
  if (!PROTOBUF_S2C_EVENTS.has(event)) {
    return payload;
  }
  // JSON binary 模式：JSON.stringify → UTF-8 bytes
  // 使用纯 JS 实现 UTF-8 编码，避免依赖 TextEncoder/Buffer
  try {
    const json = JSON.stringify(payload);
    return encodeUtf8(json);
  } catch {
    return payload;
  }
}

/** 客户端收到后将二进制载荷还原为业务对象（当前为 JSON binary 模式）。 */
export function decodeServerEventPayload<T>(event: string, payload: unknown): T {
  const binary = normalizeBinaryPayload(payload);
  if (!binary || !PROTOBUF_S2C_EVENTS.has(event)) {
    return payload as T;
  }
  // JSON binary 模式：UTF-8 bytes → string → JSON.parse
  try {
    const text = decodeUtf8(binary);
    return JSON.parse(text) as T;
  } catch {
    return payload as T;
  }
}

/** 客户端发送前的编码入口，当前仅对称保留。 */
export function encodeClientEventPayload<T>(event: string, payload: T): T {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (PROTOBUF_C2S_EVENTS.has(event)) {
    return payload;
  }
  return payload;
}

/** 判断载荷是否为可识别的二进制视图。 */
export function isBinaryPayload(payload: unknown): payload is BinaryPayload {
  return normalizeBinaryPayload(payload) !== null;
}
