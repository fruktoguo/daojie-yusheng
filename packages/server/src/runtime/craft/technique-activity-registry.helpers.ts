import {
  TECHNIQUE_ACTIVITY_METADATA,
  listTechniqueActivityMetadataKinds,
  resolveTechniqueActivityCancelCommandKind,
  resolveTechniqueActivityStartCommandKind,
  type TechniqueActivityKind,
  type RuntimeTechniqueActivityKind,
  type TechniqueActivityCommandKind,
  type TechniqueActivityMetadata,
} from '@mud/shared-next';

export function getTechniqueActivityMetadata(kind: RuntimeTechniqueActivityKind): TechniqueActivityMetadata {
  return TECHNIQUE_ACTIVITY_METADATA[kind];
}

export function emitTechniqueActivityPanel(
  socket: { emit(event: string, payload: unknown): void },
  kind: RuntimeTechniqueActivityKind,
  payload: unknown,
): void {
  socket.emit(getTechniqueActivityMetadata(kind).panelEvent, payload);
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
