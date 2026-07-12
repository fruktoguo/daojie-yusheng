/** 密室建筑、控制台和低频网络操作共享契约。 */
import type { TimeChamberSizeTier } from './building-types';

export interface TimeChamberSizeOptionView {
  tier: TimeChamberSizeTier;
  width: number;
  height: number;
}

export interface TimeChamberDetailView {
  sourceInstanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  displayName: string;
  ownerPlayerId: string;
  isOwner: boolean;
  sizeTier: TimeChamberSizeTier;
  width: number;
  height: number;
  allowedSizes: TimeChamberSizeOptionView[];
  capacity: number;
  occupancy: number;
  configuredSpeed: number;
  effectiveSpeed: number;
  minSpeed: number;
  maxSpeed: number;
  fuelUnits: number;
  fuelUnitsPerSpiritStone: number;
  fuelSpiritStoneEquivalent: number;
  fuelConsumptionUnitsPerSecond: number;
  estimatedRemainingSeconds: number | null;
  revision: number;
}

export type TimeChamberOperationKind = 'detail' | 'deposit' | 'speed' | 'rename' | 'resize';

export interface TimeChamberOperationResultView {
  ok: boolean;
  operation: TimeChamberOperationKind;
  requestId?: string;
  reason?: string;
  detail?: TimeChamberDetailView;
}

export interface TimeChamberBuildingRequestView {
  sourceInstanceId: string;
  buildingId: string;
  requestId: string;
}

export interface C2S_RequestTimeChamberView extends TimeChamberBuildingRequestView {}

export interface C2S_DepositTimeChamberFuelView extends TimeChamberBuildingRequestView {
  spiritStoneCount: number;
}

export interface C2S_SetTimeChamberSpeedView extends TimeChamberBuildingRequestView {
  speed: number;
  expectedRevision: number;
}

export interface C2S_RenameTimeChamberView extends TimeChamberBuildingRequestView {
  name: string;
  expectedRevision: number;
}

export interface C2S_ResizeTimeChamberView extends TimeChamberBuildingRequestView {
  sizeTier: TimeChamberSizeTier;
  expectedRevision: number;
}
