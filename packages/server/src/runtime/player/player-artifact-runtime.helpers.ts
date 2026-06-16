/**
 * 玩家法宝运行时推进。
 *
 * 法宝启用后的特效消耗与灵力补充都在玩家 tick 中执行，移动等领域只读取玩家能力。
 */

import { resolveArtifactSustainCostPerTick } from '@mud/shared';
import { createRuntimeTemporaryBuff } from './runtime-buff-instance';

export interface PlayerArtifactTickResult {
  artifactChanged: boolean;
  artifactEnabledChanged: boolean;
  buffChanged: boolean;
  vitalsChanged: boolean;
}

export const ARTIFACT_OVERCHARGE_BUFF_ID = 'artifact.overcharge';

const ARTIFACT_QI_RECHARGE_OUTPUT_RATIO = 0.1;
const ARTIFACT_OVERCHARGE_COST_INCREASE_PER_STACK_BP = 100;
const ARTIFACT_OVERCHARGE_BP_BASE = 10_000;
const ARTIFACT_OVERCHARGE_MAX_STACKS = 2_147_483_647;

export function advancePlayerArtifactQiTick(player: any): PlayerArtifactTickResult {
  const slots = Array.isArray(player?.artifacts?.slots) ? player.artifacts.slots : [];
  const rechargePerSlot = resolveArtifactQiRechargePerTick(player);
  const overchargeStacks = resolvePlayerArtifactOverchargeStacks(player);
  let artifactChanged = false;
  let artifactEnabledChanged = false;
  let buffChanged = false;
  let vitalsChanged = false;
  let hasEnabledArtifactAfterTick = false;

  for (const slot of slots) {
    if (!isRechargeableArtifactSlot(slot)) {
      continue;
    }

    const maxQi = normalizeNonNegativeInteger(slot.maxQi);
    if (maxQi <= 0) {
      continue;
    }

    const beforeQi = clampNonNegativeInteger(slot.qi, maxQi);
    let nextQi = beforeQi;

    if (slot.enabled !== false) {
      const sustainCost = resolveArtifactSustainCostWithOvercharge(slot.item, overchargeStacks);
      if (sustainCost > 0 && beforeQi < sustainCost) {
        slot.enabled = false;
        artifactChanged = true;
        artifactEnabledChanged = true;
      } else {
        if (sustainCost > 0) {
          nextQi = Math.max(0, nextQi - sustainCost);
        }
        hasEnabledArtifactAfterTick = true;
      }
    }

    const missingQi = Math.max(0, maxQi - nextQi);
    if (missingQi > 0 && rechargePerSlot > 0) {
      const playerQi = normalizeNonNegativeInteger(player.qi);
      const transfer = Math.min(rechargePerSlot, missingQi, playerQi);
      if (transfer > 0) {
        player.qi = playerQi - transfer;
        nextQi += transfer;
        vitalsChanged = true;
      }
    }

    if (nextQi !== beforeQi || Number(slot.qi) !== beforeQi) {
      slot.qi = nextQi;
      artifactChanged = true;
    }
  }

  if (advanceArtifactOverchargeBuffTick(player, hasEnabledArtifactAfterTick)) {
    buffChanged = true;
  }

  if (artifactChanged && player?.artifacts) {
    player.artifacts.revision = Math.max(1, Math.trunc(Number(player.artifacts.revision ?? 1) || 1)) + 1;
  }
  if (buffChanged && player?.buffs) {
    player.buffs.revision = Math.max(1, Math.trunc(Number(player.buffs.revision ?? 1) || 1)) + 1;
  }

  return { artifactChanged, artifactEnabledChanged, buffChanged, vitalsChanged };
}

export function resolvePlayerArtifactOverchargeStacks(player: any): number {
  const buffs = Array.isArray(player?.buffs?.buffs) ? player.buffs.buffs : [];
  const buff = buffs.find((entry: any) => entry?.buffId === ARTIFACT_OVERCHARGE_BUFF_ID);
  return normalizeBuffStacks(buff);
}

export function resolveArtifactSustainCostWithOvercharge(item: any, overchargeStacks: number): number {
  const baseCost = resolveArtifactSustainCostPerTick(item);
  if (baseCost <= 0) {
    return 0;
  }
  const stacks = Math.max(0, Math.trunc(Number(overchargeStacks) || 0));
  if (stacks <= 0) {
    return baseCost;
  }
  const multiplierBp = ARTIFACT_OVERCHARGE_BP_BASE + (stacks * ARTIFACT_OVERCHARGE_COST_INCREASE_PER_STACK_BP);
  return Math.max(1, Math.ceil((baseCost * multiplierBp) / ARTIFACT_OVERCHARGE_BP_BASE));
}

function isRechargeableArtifactSlot(slot: any): boolean {
  return Boolean(slot && slot.unlocked === true && slot.item);
}

function advanceArtifactOverchargeBuffTick(player: any, hasEnabledArtifact: boolean): boolean {
  const buffs = Array.isArray(player?.buffs?.buffs) ? player.buffs.buffs : null;
  if (!buffs) {
    return false;
  }
  const index = buffs.findIndex((entry: any) => entry?.buffId === ARTIFACT_OVERCHARGE_BUFF_ID);
  const existing = index >= 0 ? buffs[index] : null;
  const currentStacks = normalizeBuffStacks(existing);
  if (hasEnabledArtifact) {
    const nextStacks = Math.min(ARTIFACT_OVERCHARGE_MAX_STACKS, currentStacks + 1);
    if (existing) {
      if (existing.stacks === nextStacks
        && existing.maxStacks === ARTIFACT_OVERCHARGE_MAX_STACKS
        && existing.infiniteDuration === true
        && existing.remainingTicks === 1
        && existing.duration === 1) {
        return false;
      }
      existing.stacks = nextStacks;
      existing.maxStacks = ARTIFACT_OVERCHARGE_MAX_STACKS;
      existing.remainingTicks = 1;
      existing.duration = 1;
      existing.infiniteDuration = true;
      return true;
    }
    buffs.push(createRuntimeTemporaryBuff(buildArtifactOverchargeBuff(nextStacks)));
    return true;
  }
  if (!existing || currentStacks <= 0) {
    return false;
  }
  const nextStacks = currentStacks - 1;
  if (nextStacks <= 0) {
    buffs.splice(index, 1);
    return true;
  }
  existing.stacks = nextStacks;
  existing.remainingTicks = 1;
  existing.duration = 1;
  existing.infiniteDuration = true;
  return true;
}

function buildArtifactOverchargeBuff(stacks: number): Record<string, unknown> {
  return {
    buffId: ARTIFACT_OVERCHARGE_BUFF_ID,
    name: '盈能',
    desc: '法宝持续启用积蓄的盈能，每层使法宝固定灵力消耗提高 1%。无启用法宝时每息减少一层。',
    shortMark: '盈',
    category: 'buff',
    visibility: 'public',
    remainingTicks: 1,
    duration: 1,
    stacks,
    maxStacks: ARTIFACT_OVERCHARGE_MAX_STACKS,
    sourceSkillId: 'artifact:enabled',
    sourceSkillName: '法宝',
    color: '#44b3d2',
    infiniteDuration: true,
  };
}

function resolveArtifactQiRechargePerTick(player: any): number {
  const output = Math.max(
    0,
    Number(player?.attrs?.numericStats?.maxQiOutputPerTick ?? player?.numericStats?.maxQiOutputPerTick) || 0,
  );
  return Math.max(0, Math.floor(output * ARTIFACT_QI_RECHARGE_OUTPUT_RATIO));
}

function clampNonNegativeInteger(value: unknown, max: number): number {
  return Math.max(0, Math.min(max, normalizeNonNegativeInteger(value)));
}

function normalizeNonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeBuffStacks(buff: any): number {
  if (!buff || Number(buff.remainingTicks ?? 1) <= 0) {
    return 0;
  }
  return Math.max(0, Math.trunc(Number(buff.stacks) || 0));
}
