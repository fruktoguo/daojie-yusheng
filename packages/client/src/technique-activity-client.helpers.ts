import {
  type ClientToServerEventPayload,
  type ServerToClientEventPayload,
  TECHNIQUE_ACTIVITY_METADATA,
  type RuntimeTechniqueActivityKind,
} from '@mud/shared';
import type { SocketManager } from './network/socket';
import type { SocketEmitEvent } from './network/socket-send-types';
import type { CraftWorkbenchModal } from './ui/craft-workbench-modal';

export type ClientTechniqueActivityKind = RuntimeTechniqueActivityKind;

type TechniqueActivityPanelPayloadByKind = {
  [K in ClientTechniqueActivityKind]: ServerToClientEventPayload<
    (typeof TECHNIQUE_ACTIVITY_METADATA)[K]['panelEvent']
  >;
};

type TechniqueActivityRequestPayloadByKind = {
  [K in ClientTechniqueActivityKind]: ClientToServerEventPayload<
    (typeof TECHNIQUE_ACTIVITY_METADATA)[K]['requestEvent']
  >;
};

type TechniqueActivityStartPayloadByKind = {
  [K in ClientTechniqueActivityKind]: ClientToServerEventPayload<
    (typeof TECHNIQUE_ACTIVITY_METADATA)[K]['startEvent']
  >;
};

type TechniqueActivityPanelHandlerMap = {
  [K in ClientTechniqueActivityKind]: (data: TechniqueActivityPanelPayloadByKind[K]) => void;
};

export function emitTechniqueActivityPanelRequest<K extends ClientTechniqueActivityKind>(
  emitEvent: SocketEmitEvent,
  kind: K,
  payload: TechniqueActivityRequestPayloadByKind[K],
): void {
  emitEvent(TECHNIQUE_ACTIVITY_METADATA[kind].requestEvent, payload);
}

export function emitTechniqueActivityStart<K extends ClientTechniqueActivityKind>(
  emitEvent: SocketEmitEvent,
  kind: K,
  payload: TechniqueActivityStartPayloadByKind[K],
): void {
  emitEvent(TECHNIQUE_ACTIVITY_METADATA[kind].startEvent, payload);
}

export function emitTechniqueActivityCancel(
  emitEvent: SocketEmitEvent,
  kind: ClientTechniqueActivityKind,
): void {
  emitEvent(TECHNIQUE_ACTIVITY_METADATA[kind].cancelEvent, {});
}

export function bindTechniqueActivityPanelEvents(
  socket: Pick<SocketManager, 'on'>,
  handlers: TechniqueActivityPanelHandlerMap,
): void {
  socket.on(TECHNIQUE_ACTIVITY_METADATA.alchemy.panelEvent, handlers.alchemy);
  socket.on(TECHNIQUE_ACTIVITY_METADATA.enhancement.panelEvent, handlers.enhancement);
}

export function applyTechniqueActivityPanelToWorkbench<K extends ClientTechniqueActivityKind>(
  workbenchModal: Pick<CraftWorkbenchModal, 'updateAlchemy' | 'updateEnhancement'>,
  kind: K,
  data: TechniqueActivityPanelPayloadByKind[K],
): void {
  const applyMap: {
    [P in ClientTechniqueActivityKind]: (payload: TechniqueActivityPanelPayloadByKind[P]) => void;
  } = {
    alchemy: (payload) => workbenchModal.updateAlchemy(payload),
    enhancement: (payload) => workbenchModal.updateEnhancement(payload),
  };
  applyMap[kind](data);
}
