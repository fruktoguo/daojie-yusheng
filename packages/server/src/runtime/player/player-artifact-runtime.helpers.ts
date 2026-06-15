/**
 * 玩家法宝运行时推进。
 *
 * 法宝启用后的特效消耗与灵力补充都在玩家 tick 中执行，移动等领域只读取玩家能力。
 */

import { resolveArtifactSustainCostPerTick } from '@mud/shared';

export interface PlayerArtifactTickResult {
  artifactChanged: boolean;
  vitalsChanged: boolean;
}

const ARTIFACT_QI_RECHARGE_OUTPUT_RATIO = 0.1;

export function advancePlayerArtifactQiTick(player: any): PlayerArtifactTickResult {
  const slots = Array.isArray(player?.artifacts?.slots) ? player.artifacts.slots : [];
  if (slots.length === 0) {
    return { artifactChanged: false, vitalsChanged: false };
  }

  const rechargePerSlot = resolveArtifactQiRechargePerTick(player);
  let artifactChanged = false;
  let vitalsChanged = false;

  for (const slot of slots) {
    if (!isUsableArtifactSlot(slot)) {
      continue;
    }

    const maxQi = normalizeNonNegativeInteger(slot.maxQi);
    if (maxQi <= 0) {
      continue;
    }

    const beforeQi = clampNonNegativeInteger(slot.qi, maxQi);
    let nextQi = beforeQi;

    const sustainCost = resolveArtifactSustainCostPerTick(slot.item);
    if (sustainCost > 0 && nextQi > 0) {
      nextQi = Math.max(0, nextQi - sustainCost);
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

  if (artifactChanged && player?.artifacts) {
    player.artifacts.revision = Math.max(1, Math.trunc(Number(player.artifacts.revision ?? 1) || 1)) + 1;
  }

  return { artifactChanged, vitalsChanged };
}

function isUsableArtifactSlot(slot: any): boolean {
  return Boolean(slot && slot.unlocked === true && slot.enabled !== false && slot.item);
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
