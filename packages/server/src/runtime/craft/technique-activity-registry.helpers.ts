/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 技艺活动注册表工具函数。
 * 提供技艺元数据查询、面板事件发射和命令构建的公共入口，
 * 供网络层和运行时服务统一调用。
 */
import {
  TECHNIQUE_ACTIVITY_METADATA,
  listTechniqueActivityMetadataKinds,
  resolveTechniqueActivityCancelCommandKind,
  resolveTechniqueActivityStartCommandKind,
  type TechniqueActivityKind,
  type RuntimeTechniqueActivityKind,
  type TechniqueActivityCommandKind,
  type TechniqueActivityMetadata,
} from '@mud/shared';

export function getTechniqueActivityMetadata(kind: RuntimeTechniqueActivityKind): TechniqueActivityMetadata {
  return TECHNIQUE_ACTIVITY_METADATA[kind];
}

export function emitTechniqueActivityPanel(
  socket: { emit(event: string, payload: unknown): void },
  kind: RuntimeTechniqueActivityKind,
  payload: unknown,
): void {
  const panelEvent = getTechniqueActivityMetadata(kind).panelEvent;
  if (panelEvent) {
    socket.emit(panelEvent, payload);
  }
}

export function buildTechniqueActivityStartCommand(
  kind: TechniqueActivityKind,
  payload: unknown,
): { kind: TechniqueActivityCommandKind; payload: unknown } {
  return {
    kind: resolveTechniqueActivityStartCommandKind(kind),
    payload,
  };
}

export function buildTechniqueActivityCancelCommand(
  kind: TechniqueActivityKind,
): { kind: TechniqueActivityCommandKind } {
  return {
    kind: resolveTechniqueActivityCancelCommandKind(kind),
  };
}

export function listTechniqueActivityRefreshKinds(): readonly RuntimeTechniqueActivityKind[] {
  return listTechniqueActivityMetadataKinds();
}
