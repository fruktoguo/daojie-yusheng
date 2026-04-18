import type protobuf from 'protobufjs';

export * from './network-protobuf-tick-codecs';
export * from './network-protobuf-update-codecs';

/** 将 protobuf 消息编码成二进制。 */
export function encodeMessage(type: protobuf.Type, payload: Record<string, unknown>): Uint8Array {
  const message = type.fromObject(payload);
  return type.encode(message).finish();
}

/** 将 protobuf 二进制解码回普通对象。 */
export function decodeMessage(type: protobuf.Type, payload: Uint8Array): Record<string, unknown> {
  return type.toObject(type.decode(payload), {
    defaults: false,
    longs: Number,
  }) as Record<string, unknown>;
}
