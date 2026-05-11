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
