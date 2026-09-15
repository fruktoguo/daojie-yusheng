/**
 * GM 玩家管理服务 — views、legacy/managed 转换、数据库表读取、审计。
 *
 * 从 native-gm-player.service.ts 拆分而来，使用模式 B 委托。
 * 维护时要保持视图转换与协议字段一致。
 */
import {
  ARTIFACT_SLOTS,
  EQUIP_SLOTS,
  MERIT_ETERNAL_DAILY_SIGN_IN_FIXED_BONUS,
  MERIT_ETERNAL_POOL_GRANT,
  VIEW_RADIUS,
  getBodyTrainingExpToNext,
  normalizeBodyTrainingState,
} from '@mud/shared';
import { resolveCraftSkillExpToNextByLevel } from '../../runtime/craft/craft-skill-exp.helpers';
import { buildNativeGmPlayerRiskView } from './native-gm-player-risk';
import type { GmActorContext } from './native-gm-actor-context';
import {
  buildManagedAccountView,
  resolveManagedPlayerDisplayName,
  resolveManagedPlayerName,
  toLegacyArtifactSlots,
  toLegacyEquipmentSlots,
  normalizeRawBaseAttrs,
  cloneRatioDivisors,
  decodePersistedRawBaseAttrs,
} from './native-gm-player.helpers';
import { isNativeGmBotPlayerId } from './native-gm.constants';
import { materializeRuntimeTemporaryBuff } from '../../runtime/player/runtime-buff-instance';
import type {
  ActivityPersistenceServiceLike,
  GmPlayerDatabaseTableViewLike,
  MapTemplateRepositoryLike,
  NativeManagedAccountServiceLike,
} from './native-gm-player.ports';
import type { NativeGmPlayerService } from './native-gm-player.service';
import {
  GmMutationAuditOptions,
  safeDescribe,
  GM_PLAYER_DATABASE_TABLES,
  GM_PLAYER_DATABASE_TABLE_ORDER_BY,
} from './native-gm-player.service';

export function buildPlayerAuditEntryImpl(self: NativeGmPlayerService, playerId: string,
    audit: GmMutationAuditOptions,
    before: unknown,
    after: unknown,
    success: boolean,
    errorMessage: string | null,) {
    const delta = audit.describeDelta ? safeDescribe(audit.describeDelta, { before, after }) : undefined;
    return {
      op: audit.op,
      targetType: 'player',
      targetId: playerId,
      actor: audit.actor ?? { tokenRev: null, ip: null, userAgent: null, receivedAt: Date.now() },
      before,
      after,
      delta,
      success,
      errorMessage,
    };
}

export async function toManagedPlayerSummaryImpl(self: NativeGmPlayerService, snapshot, account = null) {
    const player = self.toLegacyPlayerState(snapshot);
    const roleName = resolveManagedPlayerName(player, account, player.id);
    const displayName = resolveManagedPlayerDisplayName(player, account, roleName);
    const meta = {
      userId: account?.userId,
      isBot: player.isBot === true,
      online: player.online === true,
      inWorld: player.inWorld !== false,
      dirtyFlags: snapshot.persistentRevision > snapshot.persistedRevision ? ['persistence'] : [],
    };
    const riskView = await buildNativeGmPlayerRiskView(account, {
      id: player.id,
      name: roleName,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      meta,
    }, { pool: self.databasePoolProvider?.getPool('gm-risk') ?? null });

    return {
      id: player.id,
      playerNo: account?.playerNo ?? null,
      name: roleName,
      roleName,
      displayName,
      accountName: account?.username,
      mapId: player.mapId,
      mapName: self.resolveMapName(player.mapId),
      realmLv: player.realmLv ?? 1,
      realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      accountStatus: riskView.accountStatus,
      riskScore: riskView.riskScore,
      riskLevel: riskView.riskLevel,
      riskTags: riskView.riskTags,
      isRiskAdmin: riskView.isRiskAdmin,
      meta,
    };
}

export async function toManagedPlayerRecordImpl(self: NativeGmPlayerService, snapshot, persistedSnapshot, account = null, databaseTables: GmPlayerDatabaseTableViewLike[] = []) {
    const summary = await self.toManagedPlayerSummary(snapshot, account);
    const monthCard = await self.loadManagedMonthCardView(snapshot.playerId);

    return {
      ...summary,
      account: buildManagedAccountView(account, summary.meta.online === true),
      riskReport: (await buildNativeGmPlayerRiskView(account, summary, { pool: self.databasePoolProvider?.getPool('gm-risk') ?? null })).riskReport,
      snapshot: self.toLegacyPlayerState(snapshot),
      persistedSnapshot: persistedSnapshot ?? null,
      databaseTables,
      monthCard,
    };
}

export async function toManagedPlayerRecordFromPersistenceImpl(self: NativeGmPlayerService, playerId,
    persistedSnapshot,
    account = null,
    databaseTables: GmPlayerDatabaseTableViewLike[] = [],) {
    const player = self.toLegacyPlayerStateFromPersistence(playerId, persistedSnapshot);
    const monthCard = await self.loadManagedMonthCardView(playerId);
    const roleName = resolveManagedPlayerName(player, account, '未知角色');
    const displayName = resolveManagedPlayerDisplayName(player, account, roleName);
    const meta = {
      userId: account?.userId,
      isBot: player.isBot === true,
      online: false,
      inWorld: false,
      dirtyFlags: [],
    };
    const riskView = await buildNativeGmPlayerRiskView(account, {
      id: player.id,
      name: roleName,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      meta,
    }, { pool: self.databasePoolProvider?.getPool('gm-risk') ?? null });

    return {
      id: player.id,
      playerNo: account?.playerNo ?? null,
      name: roleName,
      roleName,
      displayName,
      accountName: account?.username,
      mapId: player.mapId,
      mapName: self.resolveMapName(player.mapId),
      realmLv: player.realmLv ?? 1,
      realmLabel: player.realm?.displayName ?? player.realmName ?? '凡胎',
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      qi: player.qi,
      dead: player.dead,
      autoBattle: player.autoBattle,
      autoBattleStationary: player.autoBattleStationary === true,
      autoRetaliate: player.autoRetaliate !== false,
      accountStatus: riskView.accountStatus,
      riskScore: riskView.riskScore,
      riskLevel: riskView.riskLevel,
      riskTags: riskView.riskTags,
      isRiskAdmin: riskView.isRiskAdmin,
      meta,
      account: buildManagedAccountView(account, false),
      riskReport: riskView.riskReport,
      snapshot: player,
      persistedSnapshot,
      databaseTables,
      monthCard,
    };
}

export async function loadManagedMonthCardViewImpl(self: NativeGmPlayerService, playerId: string) {
    if (!self.activityPersistenceService?.isEnabled()) {
      return null;
    }
    const record = await self.activityPersistenceService.loadMonthCard(playerId);
    return record ? self.toManagedMonthCardView(record) : null;
}

export function toManagedMonthCardViewImpl(self: NativeGmPlayerService, record: {
    startAt: number;
    expireAt: number;
    totalPoolMerit: number;
    remainingPoolMerit: number;
    eternalEnabled?: boolean;
    dailySignInFixedMeritBonus?: number;
    lastClaimDate: string | null;
  }) {
    return {
      totalPoolMerit: Math.max(0, Math.trunc(Number(record.totalPoolMerit) || 0)),
      remainingPoolMerit: Math.max(0, Math.trunc(Number(record.remainingPoolMerit) || 0)),
      startAt: record.startAt > 0 ? Math.trunc(record.startAt) : null,
      expireAt: record.expireAt > 0 ? Math.trunc(record.expireAt) : null,
      lastClaimDate: record.lastClaimDate ?? null,
      eternalEnabled: record.eternalEnabled === true,
      dailySignInFixedMeritBonus: Math.max(0, Math.trunc(Number(record.dailySignInFixedMeritBonus) || 0)),
    };
}

export async function loadPlayerDatabaseTablesImpl(self: NativeGmPlayerService, playerId: string) {
    const pool = self.databasePoolProvider?.getPool('gm-player-detail');
    if (!pool) {
      return [];
    }

    const databaseTables: GmPlayerDatabaseTableViewLike[] = [];
    for (const table of GM_PLAYER_DATABASE_TABLES) {
      const orderByClause = GM_PLAYER_DATABASE_TABLE_ORDER_BY[table] ?? '';
      try {
        const result = await pool.query<{ payload?: unknown }>(
          `
            SELECT to_jsonb(t) AS payload
            FROM (
              SELECT *
              FROM ${table}
              WHERE player_id = $1
              ${orderByClause}
            ) AS t
          `,
          [playerId],
        );
        const rows = Array.isArray(result.rows)
          ? result.rows.map((row) => row?.payload ?? null)
          : [];
        databaseTables.push({
          table,
          rowCount: rows.length,
          payload: rows.length === 0 ? null : rows.length === 1 ? rows[0] : rows,
        });
      } catch (error: unknown) {
        databaseTables.push({
          table,
          rowCount: 0,
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return databaseTables;
}

export function toLegacyPlayerStateImpl(self: NativeGmPlayerService, snapshot) {
    return {
      id: snapshot.playerId,
      name: snapshot.name,
      displayName: snapshot.displayName,
      isBot: isNativeGmBotPlayerId(snapshot.playerId),
      online: typeof snapshot.sessionId === 'string' && snapshot.sessionId.length > 0,
      inWorld: typeof snapshot.instanceId === 'string' && snapshot.instanceId.length > 0,
      senseQiActive: snapshot.combat.senseQiActive === true,
      autoRetaliate: snapshot.combat.autoRetaliate !== false,
      autoBattleStationary: snapshot.combat.autoBattleStationary === true,
      allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
      autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
      autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
      cultivationActive: snapshot.combat.cultivationActive === true,
      realmLv: snapshot.realm?.realmLv ?? 1,
      realmName: snapshot.realm?.displayName ?? snapshot.realm?.name ?? '凡胎',
      realmStage: typeof snapshot.realm?.stage === 'string' ? snapshot.realm.stage : undefined,
      realmReview: snapshot.realm?.review,
      breakthroughReady: snapshot.realm?.breakthroughReady === true,
      heavenGate: snapshot.heavenGate,
      spiritualRoots: snapshot.spiritualRoots,
      boneAgeBaseYears: snapshot.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.lifeElapsedTicks,
      lifespanYears: snapshot.lifespanYears,
      mapId: snapshot.templateId,
      x: snapshot.x,
      y: snapshot.y,
      facing: snapshot.facing,
      viewRange: Math.max(1, Math.round(snapshot.attrs.numericStats.viewRange)),
      hp: snapshot.hp,
      maxHp: snapshot.maxHp,
      qi: snapshot.qi,
      dead: snapshot.hp <= 0,
      foundation: snapshot.foundation,
      rootFoundation: Math.max(0, Math.trunc(Number(snapshot.rootFoundation ?? 0) || 0)),
      combatExp: snapshot.combatExp,
      comprehension: snapshot.comprehension ?? 0,
      luck: snapshot.luck ?? 0,
      bodyTraining: normalizeBodyTrainingState(snapshot.bodyTraining),
      alchemySkill: self.normalizeGmCraftSkillState(snapshot.alchemySkill, undefined),
      forgingSkill: self.normalizeGmCraftSkillState(snapshot.forgingSkill, undefined),
      enhancementSkill: self.normalizeGmCraftSkillState(snapshot.enhancementSkill, { level: snapshot.enhancementSkillLevel ?? 1 }),
      transmissionSkill: self.normalizeGmCraftSkillState(snapshot.transmissionSkill, undefined),
      formationSkill: self.normalizeGmCraftSkillState(snapshot.formationSkill, undefined),
      gatherSkill: self.normalizeGmCraftSkillState(snapshot.gatherSkill, undefined),
      miningSkill: self.normalizeGmCraftSkillState(snapshot.miningSkill, undefined),
      buildingSkill: self.normalizeGmCraftSkillState(snapshot.buildingSkill, undefined),
      enhancementSkillLevel: Math.max(1, Math.trunc(Number(snapshot.enhancementSkill?.level ?? snapshot.enhancementSkillLevel) || 1)),
      baseAttrs: normalizeRawBaseAttrs(snapshot.attrs.rawBaseAttrs),
      bonuses: [],
      temporaryBuffs: snapshot.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry)),
      finalAttrs: { ...snapshot.attrs.finalAttrs },
      numericStats: { ...snapshot.attrs.numericStats },
      ratioDivisors: cloneRatioDivisors(snapshot.attrs.ratioDivisors),
      inventory: {
        capacity: snapshot.inventory.capacity,
        items: snapshot.inventory.items.map((entry) => ({ ...entry })),
      },
      equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
      artifacts: toLegacyArtifactSlots(snapshot.artifacts),
      techniques: snapshot.techniques.techniques.map((entry) => ({ ...entry })),
      actions: snapshot.actions.actions.map((entry) => ({ ...entry })),
      quests: snapshot.quests.quests.map((entry) => ({
        ...entry,
        rewardItemIds: Array.isArray(entry.rewardItemIds) ? entry.rewardItemIds.slice() : [],
        rewards: Array.isArray(entry.rewards) ? entry.rewards.map((reward) => ({ ...reward })) : [],
      })),
      autoBattle: snapshot.combat.autoBattle === true,
      autoBattleSkills: snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry })),
      combatTargetId: snapshot.combat.combatTargetId ?? undefined,
      combatTargetLocked: snapshot.combat.combatTargetLocked === true,
      cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
      pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
        ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
        : [],
      realm: snapshot.realm
        ? {
            ...snapshot.realm,
            heavenGate: snapshot.realm.heavenGate ? { ...snapshot.realm.heavenGate } : snapshot.realm.heavenGate,
            breakthrough: snapshot.realm.breakthrough
              ? {
                  ...snapshot.realm.breakthrough,
                  requiredItems: Array.isArray(snapshot.realm.breakthrough.requiredItems)
                    ? snapshot.realm.breakthrough.requiredItems.map((entry) => ({ ...entry }))
                    : [],
                }
              : snapshot.realm.breakthrough,
          }
        : undefined,
    };
}

export function toLegacyPlayerStateFromPersistenceImpl(self: NativeGmPlayerService, playerId, snapshot) {
    const realm = self.playerProgressionService.createRealmStateFromLevel(
      snapshot.progression?.realm?.realmLv ?? 1,
      snapshot.progression?.realm?.progress ?? 0,
    );

    return {
      id: playerId,
      name: snapshot.name,
      displayName: snapshot.displayName,
      isBot: isNativeGmBotPlayerId(playerId),
      mapId: snapshot.placement.templateId,
      x: snapshot.placement.x,
      y: snapshot.placement.y,
      facing: snapshot.placement.facing,
      viewRange: VIEW_RADIUS,
      hp: snapshot.vitals.hp,
      maxHp: snapshot.vitals.maxHp,
      qi: snapshot.vitals.qi,
      dead: snapshot.vitals.hp <= 0,
      autoBattle: snapshot.combat.autoBattle === true,
      autoRetaliate: snapshot.combat.autoRetaliate !== false,
      autoBattleStationary: snapshot.combat.autoBattleStationary === true,
      allowAoePlayerHit: snapshot.combat.allowAoePlayerHit === true,
      autoIdleCultivation: snapshot.combat.autoIdleCultivation !== false,
      autoSwitchCultivation: snapshot.combat.autoSwitchCultivation === true,
      senseQiActive: snapshot.combat.senseQiActive === true,
      realmLv: realm.realmLv,
      realmName: realm.displayName,
      realmStage: realm.stage,
      realmReview: realm.review,
      breakthroughReady: realm.breakthroughReady,
      heavenGate: snapshot.progression.heavenGate ?? null,
      spiritualRoots: snapshot.progression.spiritualRoots ?? null,
      boneAgeBaseYears: snapshot.progression.boneAgeBaseYears,
      lifeElapsedTicks: snapshot.progression.lifeElapsedTicks,
      lifespanYears: snapshot.progression.lifespanYears,
      foundation: snapshot.progression.foundation,
      rootFoundation: Math.max(0, Math.trunc(Number(snapshot.progression.rootFoundation ?? 0) || 0)),
      combatExp: snapshot.progression.combatExp,
      comprehension: snapshot.progression.comprehension ?? 0,
      luck: snapshot.progression.luck ?? 0,
      bodyTraining: normalizeBodyTrainingState(snapshot.progression.bodyTraining),
      alchemySkill: self.normalizeGmCraftSkillState(snapshot.progression.alchemySkill, undefined),
      forgingSkill: self.normalizeGmCraftSkillState(snapshot.progression.forgingSkill, undefined),
      enhancementSkill: self.normalizeGmCraftSkillState(snapshot.progression.enhancementSkill, { level: snapshot.progression.enhancementSkillLevel ?? 1 }),
      transmissionSkill: self.normalizeGmCraftSkillState(snapshot.progression.transmissionSkill, undefined),
      formationSkill: self.normalizeGmCraftSkillState(snapshot.progression.formationSkill, undefined),
      gatherSkill: self.normalizeGmCraftSkillState(snapshot.progression.gatherSkill, undefined),
      miningSkill: self.normalizeGmCraftSkillState(snapshot.progression.miningSkill, undefined),
      buildingSkill: self.normalizeGmCraftSkillState(snapshot.progression.buildingSkill, undefined),
      enhancementSkillLevel: Math.max(1, Math.trunc(Number(snapshot.progression.enhancementSkill?.level ?? snapshot.progression.enhancementSkillLevel) || 1)),
      baseAttrs: decodePersistedRawBaseAttrs(snapshot.attrState?.baseAttrs),
      bonuses: [],
      temporaryBuffs: snapshot.buffs.buffs.map((entry) => materializeRuntimeTemporaryBuff(entry)),
      inventory: {
        capacity: snapshot.inventory.capacity,
        items: Array.isArray(snapshot.inventory.items) ? snapshot.inventory.items.map((entry) => ({ ...entry })) : [],
      },
      equipment: toLegacyEquipmentSlots(snapshot.equipment.slots),
      artifacts: toLegacyArtifactSlots(snapshot.artifacts),
      techniques: Array.isArray(snapshot.techniques.techniques)
        ? snapshot.techniques.techniques.map((entry) => ({ ...entry }))
        : [],
      actions: [],
      quests: Array.isArray(snapshot.quests.entries) ? snapshot.quests.entries.map((entry) => ({ ...entry })) : [],
      autoBattleSkills: Array.isArray(snapshot.combat.autoBattleSkills)
        ? snapshot.combat.autoBattleSkills.map((entry) => ({ ...entry }))
        : [],
      combatTargetId: snapshot.combat.combatTargetId ?? undefined,
      combatTargetLocked: snapshot.combat.combatTargetLocked === true,
      cultivatingTechId: snapshot.techniques.cultivatingTechId ?? undefined,
      pendingLogbookMessages: Array.isArray(snapshot.pendingLogbookMessages)
        ? snapshot.pendingLogbookMessages.map((entry) => ({ ...entry }))
        : [],
      realm,
    };
}

export function resolveMapNameImpl(self: NativeGmPlayerService, mapId: string) {
    try {
      return self.mapTemplateRepository.getOrThrow(mapId).name;
    } catch {
      return mapId;
    }
}

