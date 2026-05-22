/**
 * 本文件定义服务端网络网关、上下文或协议投影，连接 socket 请求和运行时服务。
 *
 * 维护时要保持 handler 只接收意图、做鉴权和排队，不直接绕过运行时修改权威状态。
 */
/**
 * 同步协议下发服务。
 * 封装所有 S2C 事件的 socket.emit 调用，统一协议出口。
 * 当前高频 envelope 事件保持原始 JSON 对象发送。
 * 注意：不要在未完成 protobuf/压缩收益验证前改回 JSON binary (Buffer)，实测会放大包体。
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

  /** 按 envelope 结构发送预编码占位；当前 encoded 始终为空，实际回退为 JSON 对象直发。 */
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

  /** 直接透传 JSON 对象；暂时不要改为 Buffer，除非 protobuf/压缩路径证明包体收益。 */
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
