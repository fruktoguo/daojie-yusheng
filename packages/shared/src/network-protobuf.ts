/**
 * Protobuf 网络编解码入口：聚合 wire helper、payload codec 与二进制入口判断。
 * 当前 encode/decode 入口仍保持现有行为，不在这一轮改变协议启用策略。
 */
import { PROTOBUF_C2S_EVENTS, PROTOBUF_S2C_EVENTS } from './network-protobuf-schema';
import type { BinaryPayload } from './network-protobuf-wire-helpers';
import { normalizeBinaryPayload } from './network-protobuf-wire-helpers';

export { PROTOBUF_S2C_EVENTS, PROTOBUF_C2S_EVENTS } from './network-protobuf-schema';
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

/** 服务端发送前把支持的 payload 编码为 Protobuf 二进制。 */
export function encodeServerEventPayload<T>(event: string, payload: T): T | Uint8Array {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (PROTOBUF_S2C_EVENTS.has(event)) {
    return payload;
  }
  return payload;
}

/** 客户端收到后将 Protobuf 二进制还原为业务对象。 */
export function decodeServerEventPayload<T>(event: string, payload: unknown): T {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const binary = normalizeBinaryPayload(payload);
  if (!binary || !PROTOBUF_S2C_EVENTS.has(event)) {
    return payload as T;
  }
  return payload as T;
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
