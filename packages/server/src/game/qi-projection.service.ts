/**
 * 玩家气机投影服务：将世界原始气机资源投影为玩家当前可见、可吸收、可利用的结果。
 */
import { Injectable } from '@nestjs/common';
import {
  ALL_QI_RESOURCE_DESCRIPTORS,
  ALL_QI_RESOURCE_KEYS,
  applyQiEfficiencyBp,
  AttrBonus,
  buildQiResourceKey,
  CompiledQiProjectionProfile,
  CompiledQiResourceProjection,
  DEFAULT_QI_EFFICIENCY_BP,
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  getAuraLevel,
  matchesQiProjectionSelector,
  maxQiVisibility,
  PlayerState,
  projectQiValue,
  QiFamilyKey,
  QiVisibilityLevel,
  TemporaryBuffState,
} from '@mud/shared';

@Injectable()
export class QiProjectionService {
  private readonly profiles = new Map<string, CompiledQiProjectionProfile>();
  private nextRevision = 1;

  recalcPlayer(player: PlayerState): void {
    const previous = this.profiles.get(player.id);
    this.profiles.set(player.id, this.buildProfile(player, previous));
  }

  clearPlayer(playerId: string): void {
    this.profiles.delete(playerId);
  }

  getProjectionRevision(player: PlayerState): number {
    return this.getProfile(player).revision;
  }

  getAuraVisibility(player: PlayerState): QiVisibilityLevel {
    return this.getResourceProjection(player, buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR)).visibility;
  }

  getAuraEfficiencyBp(player: PlayerState): number {
    return this.getResourceProjection(player, buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR)).efficiencyBp;
  }

  getEffectiveAuraValue(player: PlayerState, auraValue: number): number {
    const projection = this.getResourceProjection(player, buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR));
    if (projection.visibility !== 'absorbable') {
      return 0;
    }
    return projectQiValue(auraValue, projection.efficiencyBp);
  }

  getAuraLevel(player: PlayerState, auraValue: number, baseValue: number): number {
    return getAuraLevel(this.getEffectiveAuraValue(player, auraValue), baseValue);
  }

  getFamilyVisibility(player: PlayerState, family: QiFamilyKey): QiVisibilityLevel {
    return this.getProfile(player).familyVisibility[family] ?? 'hidden';
  }

  private getProfile(player: PlayerState): CompiledQiProjectionProfile {
    let profile = this.profiles.get(player.id);
    if (!profile) {
      profile = this.buildProfile(player);
      this.profiles.set(player.id, profile);
    }
    return profile;
  }

  private getResourceProjection(player: PlayerState, resourceKey: string): CompiledQiResourceProjection {
    const profile = this.getProfile(player);
    return profile.resourceProfiles[resourceKey] ?? {
      visibility: 'hidden',
      efficiencyBp: DEFAULT_QI_EFFICIENCY_BP,
      descriptor: DEFAULT_QI_RESOURCE_DESCRIPTOR,
    };
  }

  private buildProfile(player: PlayerState, previous?: CompiledQiProjectionProfile): CompiledQiProjectionProfile {
    const resourceProfiles: Record<string, CompiledQiResourceProjection> = {};
    for (const descriptor of ALL_QI_RESOURCE_DESCRIPTORS) {
      const resourceKey = buildQiResourceKey(descriptor);
      resourceProfiles[resourceKey] = {
        descriptor,
        visibility: descriptor.family === 'aura' && descriptor.form === 'refined' ? 'absorbable' : 'hidden',
        efficiencyBp: DEFAULT_QI_EFFICIENCY_BP,
      };
    }

    const modifiers = [
      ...this.collectBonusModifiers(player.bonuses),
      ...this.collectBuffModifiers(player.temporaryBuffs ?? []),
    ];
    for (const modifier of modifiers) {
      for (const resourceKey of ALL_QI_RESOURCE_KEYS) {
        const entry = resourceProfiles[resourceKey];
        if (!entry) {
          continue;
        }
        if (!matchesQiProjectionSelector(entry.descriptor, resourceKey, modifier.selector)) {
          continue;
        }
        if (modifier.visibility) {
          entry.visibility = maxQiVisibility(entry.visibility, modifier.visibility);
        }
        if (modifier.efficiencyBpMultiplier !== undefined) {
          entry.efficiencyBp = applyQiEfficiencyBp(entry.efficiencyBp, modifier.efficiencyBpMultiplier);
        }
      }
    }

    const familyVisibility: Partial<Record<QiFamilyKey, QiVisibilityLevel>> = {};
    for (const projection of Object.values(resourceProfiles)) {
      const family = projection.descriptor.family;
      familyVisibility[family] = maxQiVisibility(familyVisibility[family] ?? 'hidden', projection.visibility);
    }

    const next: CompiledQiProjectionProfile = {
      revision: previous?.revision ?? this.nextRevision++,
      resourceProfiles,
      familyVisibility,
    };
    if (previous && this.isProfileEqual(previous, next)) {
      return previous;
    }
    if (previous) {
      next.revision = this.nextRevision++;
    }
    return next;
  }

  private isProfileEqual(left: CompiledQiProjectionProfile, right: CompiledQiProjectionProfile): boolean {
    for (const resourceKey of ALL_QI_RESOURCE_KEYS) {
      const leftEntry = left.resourceProfiles[resourceKey];
      const rightEntry = right.resourceProfiles[resourceKey];
      if (!leftEntry || !rightEntry) {
        return false;
      }
      if (leftEntry.visibility !== rightEntry.visibility || leftEntry.efficiencyBp !== rightEntry.efficiencyBp) {
        return false;
      }
    }
    for (const family of Object.keys(right.familyVisibility) as QiFamilyKey[]) {
      if ((left.familyVisibility[family] ?? 'hidden') !== (right.familyVisibility[family] ?? 'hidden')) {
        return false;
      }
    }
    return true;
  }

  private collectBonusModifiers(bonuses: AttrBonus[]): NonNullable<AttrBonus['qiProjection']> {
    return bonuses.flatMap((bonus) => bonus.qiProjection ?? []);
  }

  private collectBuffModifiers(buffs: readonly TemporaryBuffState[]): NonNullable<TemporaryBuffState['qiProjection']> {
    return buffs.flatMap((buff) => (
      buff.remainingTicks > 0 && buff.stacks > 0
        ? buff.qiProjection ?? []
        : []
    ));
  }
}
