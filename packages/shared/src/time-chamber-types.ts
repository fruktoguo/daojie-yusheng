/** 密室建筑、限时开启和管理的共享契约与纯计算规则。 */
import type { TimeChamberSizeTier } from './building-types';

export const TIME_CHAMBER_MIN_SPEED = 1;
export const TIME_CHAMBER_MAX_SPEED = 10;
export const TIME_CHAMBER_MIN_USAGE_HOURS = 1;
export const TIME_CHAMBER_MAX_USAGE_HOURS = 168;
export const TIME_CHAMBER_MAX_CAPACITY = 100;
export const TIME_CHAMBER_MAX_PASSWORD_LENGTH = 64;

export const TIME_CHAMBER_SIZE_OPTIONS: Readonly<Record<TimeChamberSizeTier, Readonly<{
  width: number;
  height: number;
  expansionRings: number;
  costMultiplierPercent: number;
}>>> = Object.freeze({
  small: Object.freeze({ width: 5, height: 5, expansionRings: 0, costMultiplierPercent: 100 }),
  medium: Object.freeze({ width: 7, height: 7, expansionRings: 1, costMultiplierPercent: 150 }),
  large: Object.freeze({ width: 9, height: 9, expansionRings: 2, costMultiplierPercent: 225 }),
});

export interface TimeChamberSizeOptionView {
  tier: TimeChamberSizeTier;
  width: number;
  height: number;
  costMultiplierPercent: number;
}

export interface TimeChamberSummaryView {
  sourceInstanceId: string;
  buildingId: string;
  chamberInstanceId: string;
  displayName: string;
  ownerPlayerId: string;
  isOwner: boolean;
  sizeTier: TimeChamberSizeTier;
  width: number;
  height: number;
  capacity: number;
  occupancy: number;
  configuredSpeed: number;
  effectiveSpeed: number;
  active: boolean;
  activeUntil: number | null;
  passwordProtected: boolean;
  revision: number;
}

export interface TimeChamberUsageDetailView extends TimeChamberSummaryView {
  activationCostSpiritStonesPerHour: number;
  minUsageHours: number;
  maxUsageHours: number;
}

export interface TimeChamberManagementDetailView extends TimeChamberSummaryView {
  minSpeed: number;
  maxSpeed: number;
  maxCapacity: number;
  allowedSizes: TimeChamberSizeOptionView[];
  operatingCostSpiritStonesPerHour: number;
  settingsLocked: boolean;
  hasBuildings: boolean;
}

export type TimeChamberPanelMode = 'usage' | 'management';

export type TimeChamberOperationKind =
  | 'usage_detail'
  | 'management_detail'
  | 'activate'
  | 'enter'
  | 'settings'
  | 'resize';

export interface TimeChamberOperationResultView {
  ok: boolean;
  operation: TimeChamberOperationKind;
  requestId?: string;
  reason?: string;
  usageDetail?: TimeChamberUsageDetailView;
  managementDetail?: TimeChamberManagementDetailView;
  entryQueued?: boolean;
}

export interface TimeChamberBuildingRequestView {
  sourceInstanceId: string;
  buildingId: string;
  requestId: string;
}

export interface C2S_RequestTimeChamberView extends TimeChamberBuildingRequestView {
  mode: TimeChamberPanelMode;
}

export interface C2S_ActivateTimeChamberView extends TimeChamberBuildingRequestView {
  durationHours: number;
  expectedRevision: number;
  accessPassword?: string;
}

export interface C2S_EnterTimeChamberView extends TimeChamberBuildingRequestView {
  accessPassword?: string;
}

export type TimeChamberPasswordChangeView =
  | { action: 'set'; password: string }
  | { action: 'clear' };

export interface C2S_UpdateTimeChamberSettingsView extends TimeChamberBuildingRequestView {
  name: string;
  speed: number;
  capacity: number;
  expectedRevision: number;
  passwordChange?: TimeChamberPasswordChangeView;
}

export interface C2S_ResizeTimeChamberView extends TimeChamberBuildingRequestView {
  sizeTier: TimeChamberSizeTier;
  expectedRevision: number;
}

/** 2 倍每小时 50 灵石，之后每提升一倍，总消耗翻倍。 */
export function calculateTimeChamberBaseOperatingCost(speedInput: number): number {
  const speed = Math.trunc(Number(speedInput));
  if (!Number.isFinite(speed) || speed <= TIME_CHAMBER_MIN_SPEED) {
    return 0;
  }
  const boundedSpeed = Math.min(TIME_CHAMBER_MAX_SPEED, speed);
  return 50 * 2 ** (boundedSpeed - 2);
}

/** 当前空间允许配置的最大进入人数等于地图总格数。 */
export function resolveTimeChamberCapacityLimit(sizeTierInput: TimeChamberSizeTier = 'small'): number {
  const size = TIME_CHAMBER_SIZE_OPTIONS[sizeTierInput] ?? TIME_CHAMBER_SIZE_OPTIONS.small;
  return Math.min(TIME_CHAMBER_MAX_CAPACITY, size.width * size.height);
}

/** 一倍速常驻开放，不需要购买开启时段。 */
export function requiresTimeChamberActivation(speedInput: number): boolean {
  return Math.trunc(Number(speedInput)) > TIME_CHAMBER_MIN_SPEED;
}

/** 每增加一个实际配置的容量位置，运行成本在线性基础上增加 80%。 */
export function calculateTimeChamberOperatingCostPerHour(
  speedInput: number,
  capacityInput: number,
  sizeTierInput: TimeChamberSizeTier = 'small',
): number {
  const baseCost = calculateTimeChamberBaseOperatingCost(speedInput);
  const capacity = Math.max(
    1,
    Math.min(resolveTimeChamberCapacityLimit(sizeTierInput), Math.trunc(Number(capacityInput) || 1)),
  );
  const capacityCost = baseCost * (5 + 4 * (capacity - 1)) / 5;
  const size = TIME_CHAMBER_SIZE_OPTIONS[sizeTierInput] ?? TIME_CHAMBER_SIZE_OPTIONS.small;
  return Math.ceil(capacityCost * size.costMultiplierPercent / 100);
}

export function calculateTimeChamberActivationCost(
  speedInput: number,
  capacityInput: number,
  durationHoursInput: number,
  sizeTierInput: TimeChamberSizeTier = 'small',
): number {
  const durationHours = Math.max(
    TIME_CHAMBER_MIN_USAGE_HOURS,
    Math.min(TIME_CHAMBER_MAX_USAGE_HOURS, Math.trunc(Number(durationHoursInput) || TIME_CHAMBER_MIN_USAGE_HOURS)),
  );
  return calculateTimeChamberOperatingCostPerHour(speedInput, capacityInput, sizeTierInput) * durationHours;
}
