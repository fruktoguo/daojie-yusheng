/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 同步协议下发服务。
 * 封装所有 S2C 事件的 socket.emit 调用，统一协议出口。
 * 支持 binary 编码模式：高频 envelope 事件以 JSON binary (Buffer) 形式发送，减少主线程 JSON.stringify 开销。
 */

import { Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import type { EncodedEnvelope } from './aoi-envelope-encoder.service';

/** 同步协议下发服务：统一封装 socket emit 出口 */
@Injectable()
export class WorldSyncProtocolService {
  /** 按 envelope 结构分发各类同步事件 */
  sendEnvelope(socket: any, envelope: any): void {
    if (envelope?.initSession) {
      socket.emit(S2C.InitSession, envelope.initSession);
    }
    if (envelope?.mapEnter) {
      socket.emit(S2C.MapEnter, this.maybeEncodeBinary(envelope.mapEnter));
    }
    if (envelope?.worldDelta) {
      socket.emit(S2C.WorldDelta, this.maybeEncodeBinary(envelope.worldDelta));
    }
    if (envelope?.selfDelta) {
      socket.emit(S2C.SelfDelta, this.maybeEncodeBinary(envelope.selfDelta));
    }
    if (envelope?.panelDelta) {
      socket.emit(S2C.PanelDelta, this.maybeEncodeBinary(envelope.panelDelta));
    }
  }

  /** 按 envelope 结构发送已预编码的 binary payload，未编码字段回退到普通发送路径。 */
  sendEncodedEnvelope(socket: any, envelope: any, encoded: EncodedEnvelope): void {
    if (envelope?.initSession) {
      socket.emit(S2C.InitSession, envelope.initSession);
    }
    if (envelope?.mapEnter) {
      socket.emit(S2C.MapEnter, encoded.mapEnter ?? this.maybeEncodeBinary(envelope.mapEnter));
    }
    if (envelope?.worldDelta) {
      socket.emit(S2C.WorldDelta, encoded.worldDelta ?? this.maybeEncodeBinary(envelope.worldDelta));
    }
    if (envelope?.selfDelta) {
      socket.emit(S2C.SelfDelta, encoded.selfDelta ?? this.maybeEncodeBinary(envelope.selfDelta));
    }
    if (envelope?.panelDelta) {
      socket.emit(S2C.PanelDelta, encoded.panelDelta ?? this.maybeEncodeBinary(envelope.panelDelta));
    }
  }

  /** 将 payload 编码为 Buffer；当前暂时直接透传 JSON 对象，后续切 protobuf 时启用。 */
  private maybeEncodeBinary(payload: unknown): unknown {
    return payload;
  }

  sendBootstrap(socket: any, payload: any): void {
    socket.emit(S2C.Bootstrap, payload);
  }

  sendWorldDelta(socket: any, payload: any): void {
    socket.emit(S2C.WorldDelta, payload);
  }

  resolveEmission(_socket: unknown): { protocol: string; emitMainline: boolean } {
    return {
      protocol: 'mainline',
      emitMainline: true,
    };
  }

  getExplicitProtocol(_socket: unknown): string {
    return 'mainline';
  }

  resolveEffectiveProtocol(_socket: unknown): string {
    return 'mainline';
  }

  sendQuestSync(socket: any, payload: any): void {
    socket.emit(S2C.Quests, payload);
  }

  sendMapStatic(socket: any, payload: any): void {
    socket.emit(S2C.MapStatic, payload);
  }

  sendRealm(socket: any, payload: any): void {
    socket.emit(S2C.Realm, payload);
  }

  sendLootWindow(socket: any, payload: any): void {
    socket.emit(S2C.LootWindowUpdate, payload);
  }

  sendNotices(socket: any, items: any): void {
    socket.emit(S2C.Notice, { items });
  }
}
