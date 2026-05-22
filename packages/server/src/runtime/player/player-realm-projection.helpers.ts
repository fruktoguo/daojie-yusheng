/**
 * 本文件属于服务端权威运行时，负责地图、玩家、市场、邮件或后台运行态的类型与逻辑。
 *
 * 维护时要保持运行态变更受控，所有会影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import type { HeavenGateRootValues, HeavenGateState, PlayerRealmState } from '@mud/shared';

export function projectRealmState(source: PlayerRealmState | null | undefined): PlayerRealmState | null {
  if (!source) {
    return null;
  }

  return {
    ...source,
    breakthroughItems: Array.isArray(source.breakthroughItems) ? source.breakthroughItems : [],
    breakthrough: source.breakthrough
      ? {
          ...source.breakthrough,
          requirements: Array.isArray(source.breakthrough.requirements) ? source.breakthrough.requirements : [],
        }
      : undefined,
    heavenGate: projectHeavenGateState(source.heavenGate),
  };
}

export function projectHeavenGateState(source: HeavenGateState | null | undefined): HeavenGateState | null {
  if (!source) {
    return null;
  }

  return {
    unlocked: source.unlocked,
    severed: Array.isArray(source.severed) ? source.severed : [],
    roots: projectHeavenGateRoots(source.roots),
    entered: source.entered,
    averageBonus: source.averageBonus,
  };
}

export function projectHeavenGateRoots(source: HeavenGateRootValues | null | undefined): HeavenGateRootValues | null {
  if (!source) {
    return null;
  }

  return {
    metal: Number(source.metal ?? 0),
    wood: Number(source.wood ?? 0),
    water: Number(source.water ?? 0),
    fire: Number(source.fire ?? 0),
    earth: Number(source.earth ?? 0),
  };
}
