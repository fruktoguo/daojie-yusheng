/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
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
