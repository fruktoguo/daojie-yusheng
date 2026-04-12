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
  DEFAULT_PLAYER_QI_RESOURCE_KEYS,
  DEFAULT_QI_RESOURCE_DESCRIPTOR,
  getAuraLevel,
  isAuraQiResourceKey,
  matchesQiProjectionSelector,
  maxQiVisibility,
  PlayerState,
  projectQiValue,
  QiFamilyKey,
  QiVisibilityLevel,
  TemporaryBuffState,
} from '@mud/shared';

@Injectable()
/** QiProjectionService：封装相关状态与行为。 */
export class QiProjectionService {
  private readonly profiles = new Map<string, CompiledQiProjectionProfile>();
  private nextRevision = 1;

/** recalcPlayer：执行对应的业务逻辑。 */
  recalcPlayer(player: PlayerState): void {
/** previous：定义该变量以承载业务值。 */
    const previous = this.profiles.get(player.id);
    this.profiles.set(player.id, this.buildProfile(player, previous));
  }

/** clearPlayer：执行对应的业务逻辑。 */
  clearPlayer(playerId: string): void {
    this.profiles.delete(playerId);
  }

/** getProjectionRevision：执行对应的业务逻辑。 */
  getProjectionRevision(player: PlayerState): number {
    return this.getProfile(player).revision;
  }

/** getAuraVisibility：执行对应的业务逻辑。 */
  getAuraVisibility(player: PlayerState): QiVisibilityLevel {
    return this.getFamilyVisibility(player, 'aura');
  }

/** getResourceVisibility：执行对应的业务逻辑。 */
  getResourceVisibility(player: PlayerState, resourceKey: string): QiVisibilityLevel {
    return this.getResourceProjection(player, resourceKey).visibility;
  }

/** getAuraEfficiencyBp：执行对应的业务逻辑。 */
  getAuraEfficiencyBp(player: PlayerState): number {
    return this.getResourceProjection(player, buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR)).efficiencyBp;
  }

/** getEffectiveAuraValue：执行对应的业务逻辑。 */
  getEffectiveAuraValue(player: PlayerState, auraValue: number): number {
/** projection：定义该变量以承载业务值。 */
    const projection = this.getResourceProjection(player, buildQiResourceKey(DEFAULT_QI_RESOURCE_DESCRIPTOR));
    if (projection.visibility !== 'absorbable') {
      return 0;
    }
    return projectQiValue(auraValue, projection.efficiencyBp);
  }

/** getEffectiveResourceValue：执行对应的业务逻辑。 */
  getEffectiveResourceValue(player: PlayerState, resourceKey: string, rawValue: number): number {
/** projection：定义该变量以承载业务值。 */
    const projection = this.getResourceProjection(player, resourceKey);
    if (projection.visibility !== 'absorbable') {
      return 0;
    }
    return projectQiValue(rawValue, projection.efficiencyBp);
  }

/** getResourceAuraLevel：执行对应的业务逻辑。 */
  getResourceAuraLevel(player: PlayerState, resourceKey: string, rawValue: number, baseValue: number): number {
    return getAuraLevel(this.getEffectiveResourceValue(player, resourceKey, rawValue), baseValue);
  }

/** getEffectiveAuraValueFromResources：执行对应的业务逻辑。 */
  getEffectiveAuraValueFromResources(player: PlayerState, resources: Iterable<{ key: string; value: number }>): number {
/** total：定义该变量以承载业务值。 */
    let total = 0;
    for (const resource of resources) {
      if (!isAuraQiResourceKey(resource.key)) {
        continue;
      }
      total += this.getEffectiveResourceValue(player, resource.key, resource.value);
    }
    return total;
  }

/** getAuraLevelFromResources：执行对应的业务逻辑。 */
  getAuraLevelFromResources(player: PlayerState, resources: Iterable<{ key: string; value: number }>, baseValue: number): number {
    return getAuraLevel(this.getEffectiveAuraValueFromResources(player, resources), baseValue);
  }

/** getAuraLevel：执行对应的业务逻辑。 */
  getAuraLevel(player: PlayerState, auraValue: number, baseValue: number): number {
    return getAuraLevel(this.getEffectiveAuraValue(player, auraValue), baseValue);
  }

/** getFamilyVisibility：执行对应的业务逻辑。 */
  getFamilyVisibility(player: PlayerState, family: QiFamilyKey): QiVisibilityLevel {
    return this.getProfile(player).familyVisibility[family] ?? 'hidden';
  }

/** getProfile：执行对应的业务逻辑。 */
  private getProfile(player: PlayerState): CompiledQiProjectionProfile {
/** profile：定义该变量以承载业务值。 */
    let profile = this.profiles.get(player.id);
    if (!profile) {
      profile = this.buildProfile(player);
      this.profiles.set(player.id, profile);
    }
    return profile;
  }

/** getResourceProjection：执行对应的业务逻辑。 */
  private getResourceProjection(player: PlayerState, resourceKey: string): CompiledQiResourceProjection {
/** profile：定义该变量以承载业务值。 */
    const profile = this.getProfile(player);
    return profile.resourceProfiles[resourceKey] ?? {
      visibility: 'hidden',
      efficiencyBp: DEFAULT_QI_EFFICIENCY_BP,
      descriptor: DEFAULT_QI_RESOURCE_DESCRIPTOR,
    };
  }

/** buildProfile：执行对应的业务逻辑。 */
  private buildProfile(player: PlayerState, previous?: CompiledQiProjectionProfile): CompiledQiProjectionProfile {
/** resourceProfiles：定义该变量以承载业务值。 */
    const resourceProfiles: Record<string, CompiledQiResourceProjection> = {};
    for (const descriptor of ALL_QI_RESOURCE_DESCRIPTORS) {
      const resourceKey = buildQiResourceKey(descriptor);
      resourceProfiles[resourceKey] = {
        descriptor,
        visibility: DEFAULT_PLAYER_QI_RESOURCE_KEYS.includes(resourceKey) ? 'absorbable' : 'hidden',
        efficiencyBp: DEFAULT_QI_EFFICIENCY_BP,
      };
    }

/** modifiers：定义该变量以承载业务值。 */
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

/** familyVisibility：定义该变量以承载业务值。 */
    const familyVisibility: Partial<Record<QiFamilyKey, QiVisibilityLevel>> = {};
    for (const projection of Object.values(resourceProfiles)) {
      const family = projection.descriptor.family;
      familyVisibility[family] = maxQiVisibility(familyVisibility[family] ?? 'hidden', projection.visibility);
    }

/** next：定义该变量以承载业务值。 */
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

/** isProfileEqual：执行对应的业务逻辑。 */
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

/** collectBonusModifiers：执行对应的业务逻辑。 */
  private collectBonusModifiers(bonuses: AttrBonus[]): NonNullable<AttrBonus['qiProjection']> {
    return bonuses.flatMap((bonus) => bonus.qiProjection ?? []);
  }

/** collectBuffModifiers：执行对应的业务逻辑。 */
  private collectBuffModifiers(buffs: readonly TemporaryBuffState[]): NonNullable<TemporaryBuffState['qiProjection']> {
    return buffs.flatMap((buff) => (
      buff.remainingTicks > 0 && buff.stacks > 0
        ? buff.qiProjection ?? []
        : []
    ));
  }
}

