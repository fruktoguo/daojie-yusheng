/**
 * 玩家运行时委托实现 — 功法域。
 *
 * 从 player-runtime.service.ts 拆分而来，包含：
 * - 功法学习/发布聚合功法学习
 * - 在线功法模板刷新
 * - 待参悟功法队列管理（添加/规范化/刷新需求/授权移除/丢弃）
 * - 功法传授启动/取消/打断/推进
 * - 功法修炼/遗忘
 * - 功法名称查询与传授状态构建
 *
 * 拆分模式 B：所有函数签名为 `xxxImpl(self, ...args)`，
 * 主类保留一行委托 `xxx(...args) { return xxxImpl(this, ...args); }`。
 */
import type { PlayerRuntimeService } from './player-runtime.service';
import type { TechniqueTransmissionStatusView } from '@mud/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  calculateTechniqueComprehensionRequiredProgress,
  getTechniqueMaxLevel,
  isCreatedTechniqueId,
  isTechniqueFullyMastered,
  normalizeTechniqueStrengthPercent,
  resolvePlayerFacingContentName,
  TechniqueRealm,
} from '@mud/shared';
import {
  clonePendingTechniqueComprehensions,
  createTransmissionCompatPipeline,
  ensurePendingTechniqueComprehensionEmptyOverwriteTechIds,
  getPlayerPersistenceDomainRevision,
  hasTechniqueTemplateProjectionChanged,
  isPlayerInTransmissionRange,
  markPlayerDirtyDomains,
  normalizeTechniqueTransmissionInterruptReason,
  resolvePendingSelfComprehensionAllowed,
  resolvePlayerRuntimeTick,
  resolveTechniqueBookMaxLevel,
  syncTechniqueAutoBattleSkillCatalog,
  toTechniqueUpdateEntry,
} from './player-runtime.helpers';
import { isNativeGmBotPlayerId } from '../../http/native/native-gm.constants';
export function buildTechniqueTransmissionStatusesImpl(self: PlayerRuntimeService, 
  teacherPlayerIdInput,
  targetPlayerIdInput,
 ): TechniqueTransmissionStatusView[] {
  const teacherPlayerId = typeof teacherPlayerIdInput === 'string' ? teacherPlayerIdInput.trim() : '';
  const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';
  const teacher = teacherPlayerId ? self.getPlayer(teacherPlayerId) : null;
  const target = targetPlayerId ? self.getPlayer(targetPlayerId) : null;
  if (!teacher || !target || targetPlayerId === teacherPlayerId || !isPlayerInTransmissionRange(teacher, target)) {
   return [];
  }
  const learnedTechniqueIds = new Set(
   (target.techniques?.techniques ?? [])
    .map((entry) => typeof entry?.techId === 'string' ? entry.techId.trim() : '')
    .filter(Boolean),
  );
  const seen = new Set<string>();
  const result: TechniqueTransmissionStatusView[] = [];
  for (const teacherTechnique of teacher.techniques?.techniques ?? []) {
   const techniqueId = typeof teacherTechnique?.techId === 'string' ? teacherTechnique.techId.trim() : '';
   if (!techniqueId || seen.has(techniqueId) || !isCreatedTechniqueId(techniqueId)) {
    continue;
   }
   seen.add(techniqueId);
   const techniqueTemplate = self.contentTemplateRepository?.createTechniqueState?.(techniqueId) ?? null;
   const templateLayers = Array.isArray(techniqueTemplate?.layers) && techniqueTemplate.layers.length > 0
    ? techniqueTemplate.layers
    : null;
   if (!templateLayers || !isTechniqueFullyMastered({
    level: teacherTechnique.level,
    layers: templateLayers,
   })) {
    continue;
   }
   result.push({
    techId: techniqueId,
    learned: learnedTechniqueIds.has(techniqueId),
   });
  }
  return result;
 }

export function learnTechniqueByIdImpl(self: PlayerRuntimeService, playerId, techniqueId) {
  const player = self.getPlayer(playerId);
  if (!player) return false;
  const resolvedTechniqueId = self.techniqueAggregationService?.resolveLatestTechniqueId?.(techniqueId) ?? techniqueId;
  if (self.resolveTechniqueLearningConflict(player, resolvedTechniqueId)) {
   return false;
  }
  if (player.techniques.techniques.some((entry) => entry.techId === resolvedTechniqueId)) {
   return false; // 已学会
  }
  const technique = self.contentTemplateRepository.createTechniqueState(resolvedTechniqueId);
  if (!technique) return false;
  player.pendingTechniqueComprehensions = (player.pendingTechniqueComprehensions ?? [])
   .filter((entry) => entry?.techId !== resolvedTechniqueId);
  player.techniques.techniques.push(toTechniqueUpdateEntry(technique));
  const replacedTechniqueIds = self.techniqueAggregationService?.applyCompletionReplacement(player, resolvedTechniqueId) ?? [];
  player.techniques.techniques.sort((left, right) => (left.realmLv ?? 0) - (right.realmLv ?? 0) || left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
  player.techniques.revision += 1;
  if (!player.techniques.cultivatingTechId) {
   player.techniques.cultivatingTechId = technique.techId;
   player.combat.cultivationActive = true;
  }
  const currentTick = resolvePlayerRuntimeTick(player, 0);
  self.playerAttributesService.recalculate(player, 'technique_mutation');
  self.rebuildActionState(player, currentTick);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr']);
  self.authorizePendingTechniqueComprehensionRemovals(player, [resolvedTechniqueId, ...replacedTechniqueIds]);
  self.bumpPersistentRevision(player);
  return true;
 }

export function learnPublishedAggregateTechniqueByIdImpl(self: PlayerRuntimeService, playerId, techniqueId) {
  const player = self.getPlayer(playerId);
  if (!player) {
   return false;
  }
  const resolvedTechniqueId = self.techniqueAggregationService?.resolveLatestTechniqueId?.(techniqueId) ?? techniqueId;
  const existingExact = player.techniques?.techniques?.some((entry) => entry?.techId === resolvedTechniqueId) === true;
  if (existingExact) {
   // 发布请求重试时，玩家已经完成继承应视为幂等成功。
   return true;
  }
  if (self.resolveTechniqueLearningConflict(player, resolvedTechniqueId)) {
   return false;
  }
  const technique = self.contentTemplateRepository.createTechniqueState(resolvedTechniqueId);
  const aggregateMetadata = self.techniqueAggregationService?.getMetadataById(resolvedTechniqueId);
  if (!technique || !aggregateMetadata) {
   return false;
  }
  player.pendingTechniqueComprehensions = (player.pendingTechniqueComprehensions ?? [])
   .filter((entry) => entry?.techId !== resolvedTechniqueId);
  player.techniques.techniques = (player.techniques.techniques ?? [])
   .filter((entry) => entry?.techId !== resolvedTechniqueId);
  const learned = toTechniqueUpdateEntry(technique);
  learned.level = getTechniqueMaxLevel(learned.layers, learned.level);
  learned.exp = 0;
  learned.expToNext = 0;
  learned.realm = TechniqueRealm.Perfection;
  player.techniques.techniques.push(learned);
  const replacedTechniqueIds = self.techniqueAggregationService.applyCompletionReplacement(player, resolvedTechniqueId);
  player.techniques.techniques.sort((left, right) => (left.realmLv ?? 0) - (right.realmLv ?? 0) || left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
  player.techniques.revision += 1;
  player.techniques.cultivatingTechId = resolvedTechniqueId;
  player.combat.cultivationActive = false;
  const currentTick = resolvePlayerRuntimeTick(player, 0);
  self.playerAttributesService.recalculate(player, 'technique_mutation');
  self.rebuildActionState(player, currentTick);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['technique', 'combat_pref', 'auto_battle_skill', 'attr']);
  self.authorizePendingTechniqueComprehensionRemovals(player, [resolvedTechniqueId, ...replacedTechniqueIds]);
  self.bumpPersistentRevision(player);
  return true;
 }

export function refreshOnlineTechniqueTemplatesImpl(self: PlayerRuntimeService) {
  const onlinePlayers = Array.from(self.players.values())
   .filter((player) => !isNativeGmBotPlayerId(player?.playerId));
  const result = {
   ok: true,
   totalPlayers: onlinePlayers.length,
   queuedRuntimePlayers: 0,
   updatedOfflinePlayers: 0,
   refreshedOnlinePlayers: 0,
   refreshedTechniques: 0,
   missingTechniqueTemplates: 0,
  };
  for (const player of onlinePlayers) {
   const techniques = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
   if (techniques.length <= 0) {
    continue;
   }
   let playerChanged = false;
   let missingForPlayer = 0;
   const nextTechniques = techniques.map((entry) => {
    const hydrated = self.contentTemplateRepository.hydrateTechniqueState(entry);
    if (!hydrated || typeof hydrated !== 'object') {
     missingForPlayer += 1;
     return entry;
    }
    if (hasTechniqueTemplateProjectionChanged(entry, hydrated)) {
     playerChanged = true;
     result.refreshedTechniques += 1;
    }
    return hydrated;
   });
   result.missingTechniqueTemplates += missingForPlayer;
   if (!playerChanged) {
    continue;
   }
   player.techniques.techniques = nextTechniques;
   player.techniques.revision += 1;
   const currentTick = resolvePlayerRuntimeTick(player, 0);
   self.playerAttributesService.recalculate(player, 'technique_progression');
   self.rebuildActionState(player, currentTick);
   self.playerProgressionService.refreshPreview(player);
   markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr']);
   self.bumpPersistentRevision(player);
   result.refreshedOnlinePlayers += 1;
   result.queuedRuntimePlayers += 1;
  }
  return result;
 }

export function addPendingTechniqueComprehensionByIdImpl(self: PlayerRuntimeService, playerId, techniqueId, sourceKind = 'normal', creatorPlayerId = null, options = undefined) {
  const player = self.getPlayer(playerId);
  if (!player) return false;
  const requestedTechId = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
  const normalizedTechId = self.techniqueAggregationService?.resolveLatestTechniqueId?.(requestedTechId) ?? requestedTechId;
  if (!normalizedTechId) return false;
  if (self.resolveTechniqueLearningConflict(player, normalizedTechId)) {
   return false;
  }
  if (player.techniques.techniques.some((entry) => entry.techId === normalizedTechId)) {
   return false;
  }
  const technique = self.contentTemplateRepository.createTechniqueState(normalizedTechId);
  if (!technique) return false;
  const aggregateMetadata = self.techniqueAggregationService?.getMetadataById(normalizedTechId);
  const normalizedSourceKind = sourceKind === 'created' || isCreatedTechniqueId(normalizedTechId) ? 'created' : 'normal';
  const normalizedCreatorPlayerId = creatorPlayerId
   ?? aggregateMetadata?.creatorPlayerId
   ?? null;
  const currentTick = resolvePlayerRuntimeTick(player, 0);
  const pending = Array.isArray(player.pendingTechniqueComprehensions)
   ? player.pendingTechniqueComprehensions
   : [];
  const existing = pending.find((entry) => entry?.techId === normalizedTechId);
  const maxLevel = resolveTechniqueBookMaxLevel(options?.maxLevel, technique);
  const baseRequiredProgress = calculateTechniqueComprehensionRequiredProgress({
   sourceKind: normalizedSourceKind,
   techniqueRealmLv: technique.realmLv,
   grade: technique.grade,
   learnerRealmLv: player.realm?.realmLv ?? 1,
   learnerTransmissionLevel: player.transmissionSkill?.level ?? 1,
  });
  const requiredProgress = aggregateMetadata
   ? self.techniqueAggregationService.resolveComprehensionRequirement(player, technique, baseRequiredProgress)
   : baseRequiredProgress;
  let selfComprehensionAllowed = false;
  if (existing) {
   existing.requiredProgress = requiredProgress;
   existing.updatedAtTick = currentTick;
   existing.name = resolvePlayerFacingContentName(normalizedTechId, '未知功法', technique.name, existing.name);
   existing.strengthPercent = normalizeTechniqueStrengthPercent(technique.strengthPercent);
   existing.sourceKind = normalizedSourceKind;
   if (maxLevel !== undefined) {
    existing.maxLevel = maxLevel;
   }
   selfComprehensionAllowed = resolvePendingSelfComprehensionAllowed(
    player.playerId,
    normalizedSourceKind,
    normalizedCreatorPlayerId ?? existing.creatorPlayerId,
    existing,
   );
   if (typeof options?.selfComprehensionAllowed === 'boolean') {
    selfComprehensionAllowed = options.selfComprehensionAllowed;
   }
   existing.selfComprehensionAllowed = selfComprehensionAllowed;
   if (normalizedCreatorPlayerId) {
    existing.creatorPlayerId = normalizedCreatorPlayerId;
   }
  }
  else {
   selfComprehensionAllowed = resolvePendingSelfComprehensionAllowed(
    player.playerId,
    normalizedSourceKind,
    normalizedCreatorPlayerId,
   );
   if (typeof options?.selfComprehensionAllowed === 'boolean') {
    selfComprehensionAllowed = options.selfComprehensionAllowed;
   }
   pending.push({
    techId: normalizedTechId,
    name: resolvePlayerFacingContentName(normalizedTechId, '未知功法', technique.name),
    strengthPercent: normalizeTechniqueStrengthPercent(technique.strengthPercent),
    sourceKind: normalizedSourceKind,
    creatorPlayerId: normalizedCreatorPlayerId ?? undefined,
    selfComprehensionAllowed,
    progress: 0,
    requiredProgress,
    realmLv: Math.max(1, Math.floor(Number(technique.realmLv) || 1)),
    grade: technique.grade ?? undefined,
    category: technique.category ?? undefined,
    maxLevel,
    createdAtTick: currentTick,
    updatedAtTick: currentTick,
   });
  }
  player.pendingTechniqueComprehensions = pending;
  const cultivationPreferenceChanged = !player.techniques.cultivatingTechId && selfComprehensionAllowed;
  if (cultivationPreferenceChanged) {
   player.techniques.cultivatingTechId = normalizedTechId;
   player.combat.cultivationActive = true;
  }
  const autoBattleSkillsChanged = syncTechniqueAutoBattleSkillCatalog(player, technique);
  player.techniques.revision += 1;
  markPlayerDirtyDomains(player, [
   'technique',
   ...(autoBattleSkillsChanged ? ['auto_battle_skill'] : []),
   ...(cultivationPreferenceChanged ? ['combat_pref'] : []),
  ]);
  self.bumpPersistentRevision(player);
  return true;
 }

export function resolveTechniqueLearningConflictImpl(self: PlayerRuntimeService, playerOrId, techniqueId) {
  const player = typeof playerOrId === 'string' ? self.getPlayer(playerOrId) : playerOrId;
  return player && self.techniqueAggregationService
   ? self.techniqueAggregationService.resolveLearningConflict(player, techniqueId)
   : null;
 }

export function applyTechniqueAggregationCompletionImpl(self: PlayerRuntimeService, player, techniqueId) {
  return self.techniqueAggregationService?.applyCompletionReplacement(player, techniqueId) ?? [];
 }

export function authorizePendingTechniqueComprehensionRemovalsImpl(self: PlayerRuntimeService, playerOrId, techniqueIds) {
  const player = typeof playerOrId === 'string' ? self.getPlayer(playerOrId) : playerOrId;
  const removedIds = Array.isArray(techniqueIds)
   ? [...new Set(techniqueIds
    .map((techniqueId) => typeof techniqueId === 'string' ? techniqueId.trim() : '')
    .filter(Boolean))]
   : [];
  if (!player || removedIds.length === 0
   || !Array.isArray(player.pendingTechniqueComprehensions)
   || player.pendingTechniqueComprehensions.length > 0) {
   return false;
  }
  if (!player.dirtyDomains?.has?.('technique')) {
   markPlayerDirtyDomains(player, ['technique']);
  }
  const emptyOverwriteTechIds = ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player);
  for (const techniqueId of removedIds) {
   emptyOverwriteTechIds.add(techniqueId);
  }
  player.allowPendingTechniqueComprehensionEmptyOverwrite = true;
  player.pendingTechniqueComprehensionEmptyOverwriteRevision = getPlayerPersistenceDomainRevision(player, 'technique');
  return true;
 }

export function resolveLatestTechniqueIdImpl(self: PlayerRuntimeService, techniqueId) {
  return self.techniqueAggregationService?.resolveLatestTechniqueId?.(techniqueId) ?? techniqueId;
 }

export function startTechniqueTransmissionImpl(self: PlayerRuntimeService, teacherPlayerId, learnerPlayerId, techniqueId) {
  const learner = self.getPlayerOrThrow(learnerPlayerId);
  self.captureOfflineGainBeforeTick(learner);
  const { pipeline, ctx } = createTransmissionCompatPipeline(this);
  const result = pipeline.start(learner, 'transmission', {
   learnerPlayerId,
   teacherPlayerId,
   techniqueId,
  }, ctx);
  if (!result.ok) {
   throw new BadRequestException(result.error ?? '启动传法失败');
  }
  self.recordAssetStatisticMutation(learner, self.captureOfflineGainBeforeTick(learner));
  return learner;
 }

export function cancelTechniqueTransmissionImpl(self: PlayerRuntimeService, learnerPlayerId, techniqueId) {
  const learner = self.getPlayerOrThrow(learnerPlayerId);
  const normalizedTechId = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
  if (normalizedTechId && learner.transmissionJob?.techniqueId !== normalizedTechId) {
   throw new BadRequestException('没有进行中的传授');
  }
  self.captureOfflineGainBeforeTick(learner);
  const { pipeline, ctx } = createTransmissionCompatPipeline(this);
  const result = pipeline.cancel(learner, 'transmission', ctx);
  if (!result.ok) {
   throw new BadRequestException(result.error ?? '取消传法失败');
  }
  self.recordAssetStatisticMutation(learner, self.captureOfflineGainBeforeTick(learner));
  return learner;
 }

export function normalizePendingTechniqueComprehensionsForRuntimeImpl(self: PlayerRuntimeService, value, learnerRealmLv = undefined) {
  const entries = clonePendingTechniqueComprehensions(value);
  let changed = false;
  for (const pending of entries) {
   changed = self.refreshPendingTechniqueComprehensionRequirement(pending, null, learnerRealmLv) || changed;
  }
  return { entries, changed };
 }

export function refreshPendingTechniqueComprehensionRequirementImpl(self: PlayerRuntimeService, pending, fallbackTechnique = null, learnerRealmLv = undefined) {
  if (!pending || typeof pending.techId !== 'string' || !pending.techId.trim()) {
   return false;
  }
  const technique = fallbackTechnique ?? self.contentTemplateRepository.createTechniqueState(pending.techId);
  if (!technique) {
   return false;
  }
  const aggregateMetadata = self.techniqueAggregationService?.getMetadataById(pending.techId);
  const sourceKind = pending.sourceKind === 'created' || isCreatedTechniqueId(pending.techId) ? 'created' : 'normal';
  const baseRequiredProgress = calculateTechniqueComprehensionRequiredProgress({
   sourceKind,
   techniqueRealmLv: technique.realmLv,
   grade: technique.grade,
   learnerRealmLv,
  });
  // 恢复阶段尚未组装完整 player 覆盖集；保留已持久化的聚合需求，运行 tick 会按最新覆盖重新计算。
  const requiredProgress = aggregateMetadata
   ? Math.max(1, Number(pending.requiredProgress) || baseRequiredProgress)
   : baseRequiredProgress;
  let changed = false;
  if (pending.sourceKind !== sourceKind) {
   pending.sourceKind = sourceKind;
   changed = true;
  }
  if (pending.requiredProgress !== requiredProgress) {
   pending.requiredProgress = requiredProgress;
   changed = true;
  }
  const progress = Math.min(requiredProgress, Math.max(0, Number(pending.progress) || 0));
  if (pending.progress !== progress) {
   pending.progress = progress;
   changed = true;
  }
  const realmLv = Math.max(1, Math.floor(Number(technique.realmLv) || 1));
  if (pending.realmLv !== realmLv) {
   pending.realmLv = realmLv;
   changed = true;
  }
  if ((technique.grade ?? undefined) !== undefined && pending.grade !== technique.grade) {
   pending.grade = technique.grade;
   changed = true;
  }
  if ((technique.category ?? undefined) !== undefined && pending.category !== technique.category) {
   pending.category = technique.category;
   changed = true;
  }
  pending.strengthPercent = normalizeTechniqueStrengthPercent(technique.strengthPercent);
  const name = resolvePlayerFacingContentName(pending.techId, '未知功法', technique.name, pending.name);
  if (pending.name !== name) {
   pending.name = name;
   changed = true;
  }
  return changed;
 }

export function interruptTechniqueTransmissionForPlayerImpl(self: PlayerRuntimeService, learnerPlayerId, reason = 'attack', currentTick = 0) {
  const learner = self.getPlayer(learnerPlayerId);
  if (!learner) {
   return false;
  }
  learner.lifeElapsedTicks = Math.max(0, Math.trunc(Number(currentTick) || 0));
  self.captureOfflineGainBeforeTick(learner);
  const { pipeline, ctx } = createTransmissionCompatPipeline(this);
  const result = pipeline.interrupt(learner, 'transmission', normalizeTechniqueTransmissionInterruptReason(reason), ctx);
  self.recordAssetStatisticMutation(learner, self.captureOfflineGainBeforeTick(learner));
  return result.panelChanged === true;
 }

export function getTechniqueNameImpl(self: PlayerRuntimeService, playerId, techId) {

  const player = self.getPlayerOrThrow(playerId);
  const learnedName = player.techniques.techniques.find((entry) => entry.techId === techId)?.name;
  if (learnedName) {
   return learnedName;
  }
  const pendingName = (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === techId)?.name;
  if (pendingName) {
   return pendingName;
  }
  return self.contentTemplateRepository.createTechniqueState(techId)?.name ?? null;
 }

export function cultivateTechniqueImpl(self: PlayerRuntimeService, playerId, techniqueId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);

  const normalized = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : null;
  const hasLearned = normalized && player.techniques.techniques.some((entry) => entry.techId === normalized);
  const pending = normalized
   ? (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === normalized)
   : null;
  const hasPending = Boolean(pending);
  if (normalized && !hasLearned && !hasPending) {
   throw new NotFoundException(`尚未学会功法：${normalized}`);
  }
  if (pending && pending.selfComprehensionAllowed === false) {
   throw new BadRequestException('该功法只能通过传法领悟，不能设为主修。');
  }
  const previousCultivatingTechId = player.techniques.cultivatingTechId;
  player.techniques.cultivatingTechId = normalized;
  const techniqueChanged = previousCultivatingTechId !== player.techniques.cultivatingTechId;
  if (!techniqueChanged) {
   return player;
  }
  player.techniques.revision += 1;
  markPlayerDirtyDomains(player, ['technique']);
  self.bumpPersistentRevision(player);
  return player;
 }

export function forgetTechniqueImpl(self: PlayerRuntimeService, playerId, techniqueId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const player = self.getPlayerOrThrow(playerId);

  const normalized = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
  if (!normalized) {
   throw new BadRequestException('缺少要遗忘的功法。');
  }
  const index = player.techniques.techniques.findIndex((entry) => entry.techId === normalized);
  if (index < 0) {
   throw new NotFoundException('尚未学会该功法。');
  }
  const [removed] = player.techniques.techniques.splice(index, 1);
  const techniqueName = typeof removed?.name === 'string' && removed.name.trim() ? removed.name.trim() : normalized;
  if (player.techniques.cultivatingTechId === normalized) {
   player.techniques.cultivatingTechId = undefined;
   player.combat.cultivationActive = false;
  }
  player.techniques.revision += 1;
  const currentTick = resolvePlayerRuntimeTick(player, 0);
  self.playerAttributesService.recalculate(player, 'technique_mutation');
  self.rebuildActionState(player, currentTick);
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, ['technique', 'auto_battle_skill', 'attr']);
  self.bumpPersistentRevision(player);
  return techniqueName;
 }

export function discardPendingTechniqueComprehensionImpl(self: PlayerRuntimeService, playerId, techniqueId) {
  const player = self.getPlayerOrThrow(playerId);
  const normalized = typeof techniqueId === 'string' && techniqueId.trim() ? techniqueId.trim() : '';
  if (!normalized) {
   throw new BadRequestException('缺少要放弃的未领悟功法。');
  }
  if (player.transmissionJob?.techniqueId === normalized) {
   throw new BadRequestException('该功法仍在传法中，请先取消传法。');
  }
  const pending = Array.isArray(player.pendingTechniqueComprehensions)
   ? player.pendingTechniqueComprehensions
   : [];
  const index = pending.findIndex((entry) => entry?.techId === normalized);
  if (index < 0) {
   throw new NotFoundException('未找到待领悟功法。');
  }
  const [removed] = pending.splice(index, 1);
  player.pendingTechniqueComprehensions = pending;
  const cultivationPreferenceChanged = player.techniques.cultivatingTechId === normalized;
  if (cultivationPreferenceChanged) {
   player.techniques.cultivatingTechId = undefined;
   player.combat.cultivationActive = false;
  }
  player.techniques.revision += 1;
  self.playerProgressionService.refreshPreview(player);
  markPlayerDirtyDomains(player, [
   'technique',
   ...(cultivationPreferenceChanged ? ['combat_pref'] : []),
  ]);
  const emptyOverwriteTechIds = ensurePendingTechniqueComprehensionEmptyOverwriteTechIds(player);
  emptyOverwriteTechIds.add(normalized);
  player.allowPendingTechniqueComprehensionEmptyOverwrite = true;
  player.pendingTechniqueComprehensionEmptyOverwriteRevision = getPlayerPersistenceDomainRevision(player, 'technique');
  self.bumpPersistentRevision(player);
  return resolvePlayerFacingContentName(normalized, '未知功法', removed?.name);
 }

export function advanceTechniqueTransmissionForPlayerImpl(self: PlayerRuntimeService, player, playerTick) {
  if (!player) {
   return;
  }
  player.lifeElapsedTicks = Math.max(0, Math.trunc(Number(playerTick) || 0));
  self.captureOfflineGainBeforeTick(player);
  const { pipeline, ctx } = createTransmissionCompatPipeline(this);
  const result = pipeline.tick(player, 'transmission', ctx);
  self.recordAssetStatisticMutation(player, self.captureOfflineGainBeforeTick(player));
  return result;
 }

