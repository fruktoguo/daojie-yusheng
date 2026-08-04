/**
 * 功法统合权威服务。
 *
 * 统合属于冷路径操作：预览/凝篇只在玩家明确打开统法台或提交时执行；
 * tick 只调用下方的纯内存冲突与完成替换方法，不访问数据库。
 */
import { Injectable } from '@nestjs/common';
import {
  TECHNIQUE_AGGREGATE_CATEGORY,
  TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER,
  TECHNIQUE_AGGREGATE_SCHEMA_VERSION,
  TECHNIQUE_AGGREGATE_ID_PREFIX,
  CUSTOM_TECHNIQUE_NAME_MAX_LENGTH,
  CUSTOM_TECHNIQUE_NAME_MIN_LENGTH,
  DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
  TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE,
  calculateTechniqueComprehensionRequiredProgress,
  calcTechniqueAttrValues,
  calcTechniqueQiProjectionModifiers,
  calcTechniqueSpecialStatValues,
  collectTechniqueCoverage,
  getTechniqueMaxLevel,
  getGraphemeCount,
  hasVisibleNameGrapheme,
  containsInvisibleOnlyNameGrapheme,
  isCreatedTechniqueId,
  isTechniqueAggregationId,
  isTechniqueFullyMastered,
  resolveTechniqueAggregationOverlap,
  cloneTechniqueUnificationPermissions,
  normalizeTechniqueUnificationPermissions,
  type Attributes,
  type TechniqueAggregationErrorCode,
  type TechniqueAggregationErrorView,
  type TechniqueAggregationFamilyView,
  type TechniqueAggregationMetadata,
  type TechniqueAggregationPanelView,
  type TechniqueAggregationPublishRequest,
  type TechniqueAggregationResultView,
  type TechniqueAggregationSourceView,
  type TechniqueUnificationPlatformView,
  type TechniqueUnificationPermissions,
  type TechniqueGrade,
  type TechniqueLayerDef,
  type TechniqueTemplate,
} from '@mud/shared';
import { createHash, randomUUID } from 'node:crypto';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { GeneratedTechniqueStoreService } from './generated-technique-store.service';

const MAX_AGGREGATE_LAYER = 49;
const MIN_AGGREGATE_LAYER = 3;

interface TechniqueAggregationValidationFailure {
  ok: false;
  error: TechniqueAggregationErrorView;
}

interface TechniqueAggregationValidationSuccess {
  ok: true;
  sourceTechniqueIds: string[];
  familyId: string;
  revision: number;
  previousRevision?: number;
  previousMetadata?: TechniqueAggregationMetadata;
  displayName: string;
  platformInstanceId?: string;
  platformBuildingId?: string;
  familyCreatorPlayerId: string;
  revisionAuthorPlayerId: string;
  initialPermissions: TechniqueUnificationPermissions;
}

type TechniqueAggregationValidation =
  | TechniqueAggregationValidationFailure
  | TechniqueAggregationValidationSuccess;

interface TechniqueAggregationPublishSuccess {
  ok: true;
  result: TechniqueAggregationResultView;
  template: TechniqueTemplate;
}

type TechniqueAggregationPublishOutcome =
  | TechniqueAggregationPublishSuccess
  | { ok: false; result: TechniqueAggregationResultView };

export interface TechniqueAggregationPublishContext {
  platformInstanceId?: string;
  platformBuildingId?: string;
  platformOwnerPlayerId?: string;
  revisionPermissionGranted?: boolean;
}

interface TechniqueAggregationPanelOptions {
  includeEligibleSources?: boolean;
  boundFamilyId?: string;
  platform?: TechniqueUnificationPlatformView;
}

@Injectable()
export class TechniqueAggregationService {
  constructor(
    private readonly contentTemplateRepository: ContentTemplateRepository,
    private readonly generatedTechniqueStoreService: GeneratedTechniqueStoreService,
  ) {}

  getMetadataById(techniqueId: string): TechniqueAggregationMetadata | undefined {
    return this.generatedTechniqueStoreService.getAggregateMetadata(techniqueId);
  }

  /** 新玩家拿到旧版本书籍时，统一指向同一家族的最新不可变版本。 */
  resolveLatestTechniqueId(techniqueIdInput: string): string {
    const techniqueId = normalizeText(techniqueIdInput);
    if (!techniqueId) return '';
    const metadata = this.generatedTechniqueStoreService.getAggregateMetadata(techniqueId);
    if (!metadata) return techniqueId;
    return this.generatedTechniqueStoreService.getLatestAggregateForFamily(metadata.familyId)?.techniqueId ?? techniqueId;
  }

  listMetadata(): Array<{ techniqueId: string; metadata: TechniqueAggregationMetadata }> {
    return this.generatedTechniqueStoreService.listAggregateMetadata();
  }

  resolveInitialFamilyId(operationId: unknown, creatorPlayerId: string): string {
    return this.resolveFamilyId(operationId, creatorPlayerId);
  }

  findLatestAggregateForPlatform(instanceIdInput: string, buildingIdInput: string) {
    const instanceId = normalizeText(instanceIdInput);
    const buildingId = normalizeText(buildingIdInput);
    if (!instanceId || !buildingId) return undefined;
    return this.listMetadata()
      .filter((entry) => (
        entry.metadata.platformInstanceId === instanceId
        && entry.metadata.platformBuildingId === buildingId
      ))
      .sort((left, right) => right.metadata.revision - left.metadata.revision)[0];
  }

  /** 读取学习候选与当前覆盖情况；该方法不修改玩家状态。 */
  buildPanel(
    player: any,
    request: { requestId?: string; buildingId?: string } = {},
    options: TechniqueAggregationPanelOptions = {},
  ): TechniqueAggregationPanelView {
    const metadataEntries = this.generatedTechniqueStoreService.listAggregateMetadata();
    const metadataById = new Map(metadataEntries.map((entry) => [entry.techniqueId, entry.metadata]));
    const techniques = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
    const pending: any[] = Array.isArray(player?.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    const coverage = collectTechniqueCoverage(techniques, metadataById);
    const covered = new Set(coverage.leafTechniqueIds);
    const pendingById = new Map(pending.map((entry: any) => [String(entry?.techId ?? ''), entry]));
    const eligibleSources: TechniqueAggregationSourceView[] = [];
    for (const entry of options.includeEligibleSources === false ? [] : techniques) {
      const techId = normalizeText(entry?.techId);
      if (!techId || isTechniqueAggregationId(techId) || !isCreatedTechniqueId(techId)) continue;
      const template = this.contentTemplateRepository.createTechniqueState(techId) as any;
      if (!template || template.category !== TECHNIQUE_AGGREGATE_CATEGORY) continue;
      if (this.generatedTechniqueStoreService.getCreatorPlayerId(techId) !== player?.playerId) continue;
      const generatedTemplate = this.generatedTechniqueStoreService.getById(techId);
      const maxLevel = getTechniqueMaxLevel(Array.isArray(template.layers) ? template.layers : undefined, entry.level);
      const fullyMastered = isTechniqueFullyMastered({ level: entry.level, layers: template.layers });
      const pendingEntry = pendingById.get(techId);
      eligibleSources.push({
        techId,
        name: normalizeName(entry.name, template.name),
        grade: template.grade,
        category: template.category,
        realmLv: Math.max(1, Math.trunc(Number(template.realmLv) || 1)),
        strengthPercent: resolveTechniqueStrengthPercent(generatedTemplate?.budgetPercent),
        level: Math.max(1, Math.trunc(Number(entry.level) || 1)),
        maxLevel,
        fullyMastered,
        covered: covered.has(techId),
        ...(pendingEntry ? {
          pendingProgress: Math.max(0, Number(pendingEntry.progress) || 0),
          pendingRequiredProgress: Math.max(1, Number(pendingEntry.requiredProgress) || 1),
        } : {}),
      });
    }
    eligibleSources.sort(compareSourceView);

    const familyMap = new Map<string, { techniqueId: string; metadata: TechniqueAggregationMetadata }>();
    for (const entry of metadataEntries) {
      if (options.boundFamilyId) {
        if (entry.metadata.familyId !== options.boundFamilyId) continue;
      } else if (entry.metadata.creatorPlayerId !== player?.playerId) {
        continue;
      }
      const current = familyMap.get(entry.metadata.familyId);
      if (!current || entry.metadata.revision > current.metadata.revision) {
        familyMap.set(entry.metadata.familyId, entry);
      }
    }
    const playerAggregateByFamily = new Map<string, { revision: number; covered: number }>();
    for (const entry of techniques) {
      const metadata = metadataById.get(normalizeText(entry?.techId));
      if (!metadata) continue;
      setLatestPlayerFamilyCoverage(playerAggregateByFamily, metadata, covered);
    }
    for (const entry of pending) {
      const metadata = metadataById.get(normalizeText(entry?.techId));
      if (!metadata) continue;
      setLatestPlayerFamilyCoverage(playerAggregateByFamily, metadata, covered);
    }
    const families: TechniqueAggregationFamilyView[] = [...familyMap.values()]
      .map(({ techniqueId, metadata }) => {
        const template = this.contentTemplateRepository.createTechniqueState(techniqueId) as any;
        const playerState = playerAggregateByFamily.get(metadata.familyId);
        return {
          familyId: metadata.familyId,
          latestRevision: metadata.revision,
          latestTechniqueId: techniqueId,
          name: normalizeName(template?.name, techniqueId),
          grade: template?.grade ?? 'mortal',
          category: template?.category ?? TECHNIQUE_AGGREGATE_CATEGORY,
          sourceCount: metadata.sourceTechniqueIds.length,
          sourceTechniqueIds: [...metadata.sourceTechniqueIds],
          ...(metadata.creatorPlayerId ? { creatorPlayerId: metadata.creatorPlayerId } : {}),
          ...(playerState ? { playerRevision: playerState.revision } : {}),
          playerCoveredCount: playerState?.covered ?? 0,
        };
      })
      .sort((left, right) => left.familyId.localeCompare(right.familyId));

    const platform = options.platform ?? {
      buildingId: normalizeText(request.buildingId) || 'unknown',
      displayName: '统法台',
      isOwner: true,
      permissions: cloneTechniqueUnificationPermissions(DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS),
      canLearn: true,
      canRevise: true,
      learnerState: 'unbound' as const,
    };
    return {
      ...(request.requestId ? { requestId: normalizeRequestId(request.requestId) } : {}),
      ...(request.buildingId ? { buildingId: normalizeText(request.buildingId) } : {}),
      revision: Math.max(1, Math.trunc(Number(player?.techniques?.revision) || 1)),
      eligibleSources,
      families,
      totalCoveredLeafCount: coverage.leafTechniqueIds.length,
      learnedAggregateCount: coverage.aggregateTechniqueIds.length,
      platform,
    };
  }

  /** 校验直接学习/领悟/传法是否与玩家现有聚合覆盖冲突。 */
  resolveLearningConflict(player: any, techniqueIdInput: string): TechniqueAggregationErrorView | null {
    const techniqueId = normalizeText(techniqueIdInput);
    if (!techniqueId) return null;
    const candidate = this.generatedTechniqueStoreService.getAggregateMetadata(techniqueId);
    const learned = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
    const pending = Array.isArray(player?.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    const existingAggregates = [...learned, ...pending]
      .map((entry: any) => {
        const existingTechniqueId = normalizeText(entry?.techId);
        const metadata = this.generatedTechniqueStoreService.getAggregateMetadata(existingTechniqueId);
        return metadata ? { techniqueId: existingTechniqueId, metadata } : null;
      })
      .filter((entry): entry is { techniqueId: string; metadata: TechniqueAggregationMetadata } => entry !== null);
    if (!candidate) {
      const conflict = existingAggregates
        .filter((entry) => entry.metadata.sourceTechniqueIds.includes(techniqueId));
      if (conflict.length === 0) return null;
      return this.buildError('TECHNIQUE_AGGREGATE_OVERLAP', {
        conflictAggregateIds: conflict.map((entry) => entry.techniqueId),
        conflictSourceTechniqueIds: [techniqueId],
      });
    }
    for (const entry of learned) {
      const existing = this.generatedTechniqueStoreService.getAggregateMetadata(normalizeText(entry?.techId));
      if (!existing) continue;
      if (existing.familyId === candidate.familyId) {
        if (existing.revision >= candidate.revision) {
          return this.buildError('TECHNIQUE_AGGREGATE_REVISION_INVALID', {
            conflictAggregateIds: [normalizeText(entry?.techId)],
          });
        }
        continue;
      }
      const overlap = existing.sourceTechniqueIds.filter((sourceId) => candidate.sourceTechniqueIds.includes(sourceId));
      if (overlap.length > 0) {
        return this.buildError('TECHNIQUE_AGGREGATE_OVERLAP', {
          conflictAggregateIds: [normalizeText(entry?.techId)],
          conflictSourceTechniqueIds: overlap,
        });
      }
    }
    for (const entry of pending) {
      const existing = this.generatedTechniqueStoreService.getAggregateMetadata(normalizeText(entry?.techId));
      if (!existing || existing.familyId === candidate.familyId) continue;
      const overlap = existing.sourceTechniqueIds.filter((sourceId) => candidate.sourceTechniqueIds.includes(sourceId));
      if (overlap.length > 0) {
        return this.buildError('TECHNIQUE_AGGREGATE_OVERLAP', {
          conflictAggregateIds: [normalizeText(entry?.techId)],
          conflictSourceTechniqueIds: overlap,
        });
      }
    }
    return null;
  }

  /** 计算聚合版本的领悟需求；已覆盖叶子只留下未覆盖比例。 */
  resolveComprehensionRequirement(player: any, technique: any, fallback = 1): number {
    const techniqueId = normalizeText(technique?.techId);
    const metadata = this.generatedTechniqueStoreService.getAggregateMetadata(techniqueId);
    const base = calculateTechniqueComprehensionRequiredProgress({
      sourceKind: 'created',
      techniqueRealmLv: Math.max(1, Math.trunc(Number(technique?.realmLv) || 1)),
      grade: technique?.grade,
      learnerRealmLv: player?.realm?.realmLv ?? 1,
      learnerTransmissionLevel: player?.transmissionSkill?.level ?? 1,
      teacherTransmissionLevel: player?.transmissionSkill?.level ?? 1,
    });
    if (!metadata) return Math.max(1, Math.ceil(Number(base) || fallback));
    const learned = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
    const coverage = collectTechniqueCoverage(learned, this.buildMetadataIndex(learned));
    const coveredLeaves = new Set(coverage.leafTechniqueIds);
    const coveredCount = metadata.sourceTechniqueIds.filter((sourceId) => coveredLeaves.has(sourceId)).length;
    const uncoveredRatio = metadata.sourceCount <= 0
      ? 1
      : Math.max(0, Math.min(1, (metadata.sourceCount - coveredCount) / metadata.sourceCount));
    return Math.max(1, Math.ceil((Number(base) || fallback) * uncoveredRatio));
  }

  /** 聚合领悟完成时移除覆盖的源功法和旧版本，并保留新聚合行。 */
  applyCompletionReplacement(player: any, aggregateTechniqueId: string): string[] {
    const metadata = this.generatedTechniqueStoreService.getAggregateMetadata(normalizeText(aggregateTechniqueId));
    if (!metadata || !player) return [];
    const covered = new Set(metadata.sourceTechniqueIds);
    const removedIds: string[] = [];
    const techniques = Array.isArray(player.techniques?.techniques) ? player.techniques.techniques : [];
    player.techniques.techniques = techniques.filter((entry: any) => {
      const id = normalizeText(entry?.techId);
      const existing = this.generatedTechniqueStoreService.getAggregateMetadata(id);
      const remove = id !== normalizeText(aggregateTechniqueId)
        && (covered.has(id) || (existing?.familyId === metadata.familyId));
      if (remove) removedIds.push(id);
      return !remove;
    });
    const pending = Array.isArray(player.pendingTechniqueComprehensions) ? player.pendingTechniqueComprehensions : [];
    player.pendingTechniqueComprehensions = pending.filter((entry: any) => {
      const id = normalizeText(entry?.techId);
      const existing = this.generatedTechniqueStoreService.getAggregateMetadata(id);
      const remove = id !== normalizeText(aggregateTechniqueId)
        && (covered.has(id) || (existing?.familyId === metadata.familyId));
      if (remove) removedIds.push(id);
      return !remove;
    });
    if (player.transmissionJob && removedIds.includes(normalizeText(player.transmissionJob.techniqueId))) {
      player.transmissionJob = null;
    }
    if (player.techniques?.cultivatingTechId && removedIds.includes(player.techniques.cultivatingTechId)) {
      player.techniques.cultivatingTechId = normalizeText(aggregateTechniqueId);
    }
    return [...new Set(removedIds)];
  }

  async publish(
    player: any,
    request: TechniqueAggregationPublishRequest,
    context: TechniqueAggregationPublishContext = {},
  ): Promise<TechniqueAggregationPublishOutcome> {
    const operationId = normalizeRequestId(request.operationId) ?? randomUUID();
    const validationRequest = { ...request, operationId };
    const replayed = this.resolvePublishReplay(player, validationRequest, operationId, context);
    if (replayed) {
      return replayed;
    }
    const validation = this.validatePublishRequest(player, validationRequest, context);
    if ('error' in validation) {
      return { ok: false, result: this.resultFromError(validationRequest, validation.error) };
    }
    const sourceTemplates = validation.sourceTechniqueIds.map((techniqueId) => ({
      techniqueId,
      template: this.contentTemplateRepository.createTechniqueState(techniqueId) as any,
      learned: (player?.techniques?.techniques ?? []).find((entry: any) => entry?.techId === techniqueId),
    }));
    const aggregate = this.compileAggregateTemplate(
      player?.playerId,
      validation,
      sourceTemplates,
    );
    try {
      await this.generatedTechniqueStoreService.publishAggregate({
        id: aggregate.template.id,
        generationId: 'aggregation_' + validation.familyId + '_v' + validation.revision,
        template: aggregate.template,
        createdByPlayerId: String(player.playerId),
        validationReport: aggregate.validationReport,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'technique_aggregation_persistence_unavailable') {
        const persistenceError = this.buildError('TECHNIQUE_AGGREGATE_PERSISTENCE_UNAVAILABLE');
        return { ok: false, result: this.resultFromError(validationRequest, persistenceError) };
      }
      if (error instanceof Error && error.message === 'technique_aggregation_id_conflict') {
        const conflictError = this.buildError('TECHNIQUE_AGGREGATE_ALREADY_EXISTS');
        return { ok: false, result: this.resultFromError(validationRequest, conflictError) };
      }
      throw error;
    }
    return this.buildSuccessOutcome(
      aggregate.template,
      aggregate.template.aggregate!,
      validationRequest,
      operationId,
      aggregate.totalTrainingDifficulty,
    );
  }

  /** 数据库版本已落地但玩家快照尚未完成时，重放同一请求以补齐个人态替换。 */
  private resolvePublishReplay(
    player: any,
    request: TechniqueAggregationPublishRequest,
    operationId: string,
    context: TechniqueAggregationPublishContext,
  ): TechniqueAggregationPublishSuccess | null {
    const playerId = normalizeText(player?.playerId);
    const rawSourceIds = Array.isArray(request.sourceTechniqueIds)
      ? request.sourceTechniqueIds.map(normalizeText).filter(Boolean)
      : [];
    if (!playerId || rawSourceIds.length < 1 || new Set(rawSourceIds).size !== rawSourceIds.length) {
      return null;
    }
    const requestedFamilyId = normalizeText(request.familyId);
    const familyId = requestedFamilyId || this.resolveFamilyId(operationId, playerId);
    const latest = this.generatedTechniqueStoreService.getLatestAggregateForFamily(familyId);
    const revisionAuthorPlayerId = normalizeText(latest?.metadata.revisionAuthorPlayerId)
      || normalizeText(latest?.metadata.creatorPlayerId);
    if (!latest || revisionAuthorPlayerId !== playerId) {
      return null;
    }
    const platformOwnerPlayerId = normalizeText(context.platformOwnerPlayerId);
    if (platformOwnerPlayerId
      && normalizeText(latest.metadata.creatorPlayerId)
      && normalizeText(latest.metadata.creatorPlayerId) !== platformOwnerPlayerId) {
      return null;
    }
    const platformInstanceId = normalizeText(context.platformInstanceId);
    const platformBuildingId = normalizeText(context.platformBuildingId);
    if ((latest.metadata.platformInstanceId && latest.metadata.platformInstanceId !== platformInstanceId)
      || (latest.metadata.platformBuildingId && latest.metadata.platformBuildingId !== platformBuildingId)) {
      return null;
    }

    let expectedSourceIds = rawSourceIds;
    if (requestedFamilyId) {
      const expectedRevision = Math.trunc(Number(request.expectedRevision) || 0);
      if (expectedRevision < 1
        || latest.metadata.revision !== expectedRevision + 1
        || latest.metadata.previousRevision !== expectedRevision) {
        return null;
      }
      const previous = this.listMetadata().find((entry) => (
        entry.metadata.familyId === familyId && entry.metadata.revision === expectedRevision
      ));
      if (!previous) {
        return null;
      }
      expectedSourceIds = [...new Set([...previous.metadata.sourceTechniqueIds, ...rawSourceIds])];
    } else if (latest.metadata.revision !== 1) {
      return null;
    }
    const requestedName = normalizeTechniqueAggregationName(request.customName);
    if (!requestedFamilyId && requestedName && requestedName !== latest.template.name) {
      return null;
    }
    if (!haveSameTechniqueIds(expectedSourceIds, latest.metadata.sourceTechniqueIds)) {
      return null;
    }
    return this.buildSuccessOutcome(latest.template, latest.metadata, request, operationId);
  }

  private buildSuccessOutcome(
    template: TechniqueTemplate,
    metadata: TechniqueAggregationMetadata,
    request: TechniqueAggregationPublishRequest,
    operationId: string,
    totalTrainingDifficulty = sumTechniqueTrainingDifficulty(template),
  ): TechniqueAggregationPublishSuccess {
    return {
      ok: true,
      template,
      result: {
        requestId: normalizeRequestId(request.requestId),
        operationId,
        ok: true,
        aggregate: {
          techniqueId: template.id,
          familyId: metadata.familyId,
          revision: metadata.revision,
          name: template.name,
          grade: template.grade,
          category: template.category ?? TECHNIQUE_AGGREGATE_CATEGORY,
          sourceCount: metadata.sourceTechniqueIds.length,
          sourceTechniqueIds: [...metadata.sourceTechniqueIds],
          totalTrainingDifficulty,
          effectMultiplier: TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER,
        },
      },
    };
  }

  /** tick 路径只为当前玩家持有的功法建立索引，不扫描全服统合版本。 */
  private buildMetadataIndex(entries: readonly any[]): Map<string, TechniqueAggregationMetadata> {
    const result = new Map<string, TechniqueAggregationMetadata>();
    for (const entry of entries) {
      const techniqueId = normalizeText(entry?.techId);
      const metadata = this.generatedTechniqueStoreService.getAggregateMetadata(techniqueId);
      if (techniqueId && metadata) {
        result.set(techniqueId, metadata);
      }
    }
    return result;
  }

  private validatePublishRequest(
    player: any,
    request: TechniqueAggregationPublishRequest,
    context: TechniqueAggregationPublishContext,
  ): TechniqueAggregationValidation {
    const revisionAuthorPlayerId = normalizeText(player?.playerId);
    if (!revisionAuthorPlayerId) return this.failure('TECHNIQUE_AGGREGATE_PERMISSION_DENIED');
    const rawIds: string[] = Array.isArray(request?.sourceTechniqueIds)
      ? request.sourceTechniqueIds.map(normalizeText).filter(Boolean)
      : [];
    if (rawIds.length === 0) return this.failure('TECHNIQUE_AGGREGATE_SOURCE_EMPTY');
    if (new Set(rawIds).size !== rawIds.length) return this.failure('TECHNIQUE_AGGREGATE_SOURCE_DUPLICATE');
    const familyIdInput = normalizeText(request?.familyId);
    let familyId = familyIdInput;
    let revision = 1;
    let previousRevision: number | undefined;
    let previousMetadata: TechniqueAggregationMetadata | undefined;
    let displayName = '';
    let familyCreatorPlayerId = normalizeText(context.platformOwnerPlayerId) || revisionAuthorPlayerId;
    let initialPermissions = normalizeTechniqueUnificationPermissions(request.permissions);
    const platformInstanceId = normalizeText(context.platformInstanceId);
    const platformBuildingId = normalizeText(context.platformBuildingId);
    if (familyId) {
      const latest = this.generatedTechniqueStoreService.getLatestAggregateForFamily(familyId);
      if (!latest) return this.failure('TECHNIQUE_AGGREGATE_REVISION_INVALID');
      const storedFamilyCreatorPlayerId = normalizeText(latest.metadata.creatorPlayerId);
      const platformOwnerPlayerId = normalizeText(context.platformOwnerPlayerId);
      if (platformOwnerPlayerId && storedFamilyCreatorPlayerId && storedFamilyCreatorPlayerId !== platformOwnerPlayerId) {
        return this.failure('TECHNIQUE_AGGREGATE_PLATFORM_MISMATCH');
      }
      if (storedFamilyCreatorPlayerId !== revisionAuthorPlayerId && context.revisionPermissionGranted !== true) {
        return this.failure('TECHNIQUE_AGGREGATE_PERMISSION_DENIED');
      }
      familyCreatorPlayerId = storedFamilyCreatorPlayerId || platformOwnerPlayerId || revisionAuthorPlayerId;
      if ((latest.metadata.platformInstanceId && latest.metadata.platformInstanceId !== platformInstanceId)
        || (latest.metadata.platformBuildingId && latest.metadata.platformBuildingId !== platformBuildingId)) {
        return this.failure('TECHNIQUE_AGGREGATE_PLATFORM_MISMATCH');
      }
      displayName = normalizeTechniqueAggregationName(latest.template.name) ?? '';
      if (!displayName) {
        return this.failure('TECHNIQUE_AGGREGATE_NAME_INVALID');
      }
      const expectedRevision = Math.trunc(Number(request.expectedRevision) || 0);
      if (expectedRevision !== latest.metadata.revision) {
        return this.failure('TECHNIQUE_AGGREGATE_REVISION_INVALID', {
          vars: { expectedRevision: latest.metadata.revision },
        });
      }
      revision = latest.metadata.revision + 1;
      previousRevision = latest.metadata.revision;
      previousMetadata = latest.metadata;
      initialPermissions = normalizeTechniqueUnificationPermissions(
        latest.metadata.initialPermissions,
        DEFAULT_TECHNIQUE_UNIFICATION_PERMISSIONS,
      );
      const newSourceIds = rawIds.filter((id) => !latest.metadata.sourceTechniqueIds.includes(id));
      if (newSourceIds.length === 0) {
        return this.failure('TECHNIQUE_AGGREGATE_REVISION_NOT_ADDITIVE');
      }
      // 允许只提交新增功法；最终叶子集合仍保留旧版本全部内容。
      rawIds.push(...latest.metadata.sourceTechniqueIds.filter((id) => !rawIds.includes(id)));
      familyId = latest.metadata.familyId;
    } else {
      const platformOwnerPlayerId = normalizeText(context.platformOwnerPlayerId);
      if (platformOwnerPlayerId && platformOwnerPlayerId !== revisionAuthorPlayerId) {
        return this.failure('TECHNIQUE_AGGREGATE_PERMISSION_DENIED');
      }
      displayName = normalizeTechniqueAggregationName(request.customName) ?? '';
      if (!displayName) {
        return this.failure('TECHNIQUE_AGGREGATE_NAME_INVALID', {
          vars: {
            minLength: CUSTOM_TECHNIQUE_NAME_MIN_LENGTH,
            maxLength: CUSTOM_TECHNIQUE_NAME_MAX_LENGTH,
          },
        });
      }
      familyId = this.resolveFamilyId(request.operationId, revisionAuthorPlayerId);
      // 相同 operationId 只能重放完全相同的首版；不同载荷不得复用不可变版本 ID。
      if (this.generatedTechniqueStoreService.getLatestAggregateForFamily(familyId)) {
        return this.failure('TECHNIQUE_AGGREGATE_ALREADY_EXISTS');
      }
    }
    const learnedById = new Map<string, any>(
      (player.techniques?.techniques ?? []).map((entry: any) => [normalizeText(entry?.techId), entry] as [string, any]),
    );
    const sourceTemplates: Array<{ id: string; template: any; learned: any }> = [];
    for (const id of rawIds) {
      const template = this.contentTemplateRepository.createTechniqueState(id) as any;
      if (!template) return this.failure('TECHNIQUE_AGGREGATE_SOURCE_NOT_FOUND', { invalidTechniqueIds: [id] });
      if (!id.startsWith('gen_') || id.startsWith(TECHNIQUE_AGGREGATE_ID_PREFIX)) {
        return this.failure('TECHNIQUE_AGGREGATE_SOURCE_NOT_CREATED', { invalidTechniqueIds: [id] });
      }
      const isPreviousLeaf = previousMetadata?.sourceTechniqueIds.includes(id) === true;
      if (!isPreviousLeaf && this.generatedTechniqueStoreService.getCreatorPlayerId(id) !== revisionAuthorPlayerId) {
        return this.failure('TECHNIQUE_AGGREGATE_SOURCE_NOT_OWNER', { invalidTechniqueIds: [id] });
      }
      if (template.category !== TECHNIQUE_AGGREGATE_CATEGORY) {
        return this.failure('TECHNIQUE_AGGREGATE_SOURCE_CATEGORY_INVALID', { invalidTechniqueIds: [id] });
      }
      const learned = learnedById.get(id);
      if (!isPreviousLeaf && (!learned || !isTechniqueFullyMastered({ level: learned.level, layers: template.layers }))) {
        return this.failure('TECHNIQUE_AGGREGATE_SOURCE_NOT_MASTERED', { invalidTechniqueIds: [id] });
      }
      sourceTemplates.push({ id, template, learned });
    }
    const grade = sourceTemplates[0]?.template?.grade;
    if (!grade || sourceTemplates.some((entry) => entry.template.grade !== grade)) {
      return this.failure('TECHNIQUE_AGGREGATE_SOURCE_GRADE_MISMATCH');
    }
    const overlap = resolveTechniqueAggregationOverlap(
      rawIds,
      this.listMetadata(),
      familyId,
    );
    if (overlap.aggregateIds.length > 0) {
      return this.failure('TECHNIQUE_AGGREGATE_OVERLAP', {
        conflictAggregateIds: overlap.aggregateIds,
        conflictSourceTechniqueIds: overlap.sourceIds,
      });
    }
    if (rawIds.length < 2) return this.failure('TECHNIQUE_AGGREGATE_SOURCE_EMPTY');
    return {
      ok: true,
      sourceTechniqueIds: [...new Set(rawIds)].sort(),
      familyId,
      revision,
      ...(previousRevision ? { previousRevision } : {}),
      ...(previousMetadata ? { previousMetadata } : {}),
      displayName,
      ...(platformInstanceId ? { platformInstanceId } : {}),
      ...(platformBuildingId ? { platformBuildingId } : {}),
      familyCreatorPlayerId,
      revisionAuthorPlayerId,
      initialPermissions,
    };
  }

  private compileAggregateTemplate(
    revisionAuthorPlayerId: string,
    validation: TechniqueAggregationValidationSuccess,
    sources: Array<{ techniqueId: string; template: any; learned: any }>,
  ): { template: TechniqueTemplate; totalTrainingDifficulty: number; validationReport: Record<string, unknown> } {
    const sourceMaxLayers = sources.map(({ template }) => getTechniqueMaxLevel(template.layers, 1));
    const maxLayer = Math.max(MIN_AGGREGATE_LAYER, Math.min(MAX_AGGREGATE_LAYER, Math.max(...sourceMaxLayers)));
    const totalDifficulty = sources.reduce((sum, { template }) => (
      sum + (template.layers ?? []).reduce((inner: number, layer: any) => inner + Math.max(0, Number(layer?.expToNext) || 0), 0)
    ), 0);
    const totalTrainingDifficulty = Math.max(1, Math.ceil(totalDifficulty * 0.5));
    const transitionCount = Math.max(1, maxLayer - 1);
    const baseExp = Math.floor(totalTrainingDifficulty / transitionCount);
    const remainder = totalTrainingDifficulty - baseExp * transitionCount;
    const layers: TechniqueLayerDef[] = [];
    const previousAttrs: Record<string, number> = {};
    const previousSpecial: Record<string, number> = {};
    const attrKeys: Array<keyof Attributes> = ['constitution', 'spirit', 'perception', 'talent', 'strength', 'meridians'];
    for (let level = 1; level <= maxLayer; level += 1) {
      const attrs: Record<string, number> = {};
      const specialStats: Record<string, number> = {};
      for (const source of sources) {
        const sourceMax = getTechniqueMaxLevel(source.template.layers, 1);
        const sourceLevel = Math.max(1, Math.min(sourceMax, Math.ceil(level / maxLayer * sourceMax)));
        const state = source.learned ?? { ...source.template, level: sourceMax };
        const cumulative = calcTechniqueAttrValues(sourceLevel, state.layers ?? source.template.layers);
        for (const key of attrKeys) {
          attrs[key] = (attrs[key] ?? 0) + Number(cumulative[key] ?? 0) * TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER;
        }
        const special = calcTechniqueSpecialStatValues(sourceLevel, state.layers ?? source.template.layers);
        specialStats.comprehension = (specialStats.comprehension ?? 0) + Number(special.comprehension ?? 0) * TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER;
        specialStats.luck = (specialStats.luck ?? 0) + Number(special.luck ?? 0) * TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER;
      }
      const incrementalAttrs: Partial<Attributes> = {};
      for (const key of attrKeys) {
        const next = roundMetric(attrs[key] ?? 0);
        const delta = level === maxLayer ? next - (previousAttrs[key] ?? 0) : next - (previousAttrs[key] ?? 0);
        if (Math.abs(delta) > 0.0001) incrementalAttrs[key] = roundMetric(delta);
        previousAttrs[key] = next;
      }
      const incrementalSpecial: Record<string, number> = {};
      for (const key of ['comprehension', 'luck']) {
        const next = roundMetric(specialStats[key] ?? 0);
        const delta = next - (previousSpecial[key] ?? 0);
        if (Math.abs(delta) > 0.0001) incrementalSpecial[key] = roundMetric(delta);
        previousSpecial[key] = next;
      }
      const expToNext = level >= maxLayer ? 0 : Math.max(0, baseExp + (level <= remainder ? 1 : 0));
      layers.push({
        level,
        expToNext,
        ...(Object.keys(incrementalAttrs).length > 0 ? { attrs: incrementalAttrs } : {}),
        ...(Object.keys(incrementalSpecial).length > 0 ? { specialStats: incrementalSpecial } : {}),
      });
    }
    const metadata: TechniqueAggregationMetadata = {
      schemaVersion: TECHNIQUE_AGGREGATE_SCHEMA_VERSION,
      familyId: validation.familyId,
      revision: validation.revision,
      sourceTechniqueIds: validation.sourceTechniqueIds,
      sourceCount: validation.sourceTechniqueIds.length,
      ...(validation.previousRevision ? { previousRevision: validation.previousRevision } : {}),
      creatorPlayerId: validation.familyCreatorPlayerId,
      revisionAuthorPlayerId,
      ...(validation.platformInstanceId ? { platformInstanceId: validation.platformInstanceId } : {}),
      ...(validation.platformBuildingId ? { platformBuildingId: validation.platformBuildingId } : {}),
      initialPermissions: cloneTechniqueUnificationPermissions(validation.initialPermissions),
    };
    const id = this.buildAggregateTechniqueId(validation.familyId, validation.revision);
    const grade = sources[0]?.template?.grade as TechniqueGrade;
    const realmLv = Math.max(...sources.map(({ template }) => Math.max(1, Math.trunc(Number(template.realmLv) || 1))));
    const template: TechniqueTemplate = {
      id,
      name: validation.displayName,
      desc: '此法典合参 ' + validation.sourceTechniqueIds.length + ' 门同阶自创内功，六维所得在诸法总和之上再增一成。',
      grade,
      category: TECHNIQUE_AGGREGATE_CATEGORY,
      realmLv,
      maxLayer,
      layers,
      skills: [],
      aggregate: metadata,
    };
    const sourceProjection = sources.flatMap(({ template: sourceTemplate }) => calcTechniqueQiProjectionModifiers(
      getTechniqueMaxLevel(sourceTemplate.layers, 1),
      sourceTemplate.layers,
    ));
    // 聚合发布期先按共享规则合并重复投影，运行期只需读取一份已压缩的规则表。
    const projection = sourceProjection.length > 0
      ? calcTechniqueQiProjectionModifiers(1, [{ level: 1, expToNext: 0, qiProjection: sourceProjection }])
      : [];
    if (projection.length > 0) {
      const last = template.layers?.[template.layers.length - 1];
      if (last) last.qiProjection = projection;
    }
    return {
      template,
      totalTrainingDifficulty,
      validationReport: {
        kind: 'technique_aggregation',
        schemaVersion: TECHNIQUE_AGGREGATE_SCHEMA_VERSION,
        creatorPlayerId: validation.familyCreatorPlayerId,
        revisionAuthorPlayerId,
        familyId: validation.familyId,
        revision: validation.revision,
        sourceTechniqueIds: validation.sourceTechniqueIds,
        displayName: validation.displayName,
        platformInstanceId: validation.platformInstanceId,
        platformBuildingId: validation.platformBuildingId,
        initialPermissions: validation.initialPermissions,
        totalTrainingDifficulty,
        effectMultiplier: TECHNIQUE_AGGREGATE_EFFECT_MULTIPLIER,
      },
    };
  }

  private resolveFamilyId(operationId: unknown, creatorPlayerId: string): string {
    const source = `${normalizeText(creatorPlayerId)}:${normalizeRequestId(operationId) ?? randomUUID()}`;
    return 'f' + createHash('sha256').update(source).digest('hex').slice(0, 20);
  }

  private buildAggregateTechniqueId(familyId: string, revision: number): string {
    return (TECHNIQUE_AGGREGATE_ID_PREFIX + familyId.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 28) + '_v' + revision).slice(0, 64);
  }

  private failure(code: TechniqueAggregationErrorCode, extras: Partial<TechniqueAggregationErrorView> = {}): TechniqueAggregationValidationFailure {
    return { ok: false, error: this.buildError(code, extras) };
  }

  private buildError(code: TechniqueAggregationErrorCode, extras: Partial<TechniqueAggregationErrorView> = {}): TechniqueAggregationErrorView {
    const conflictAggregateIds = extras.conflictAggregateIds?.filter(Boolean) ?? [];
    const conflictSourceTechniqueIds = extras.conflictSourceTechniqueIds?.filter(Boolean) ?? [];
    const aggregateTechniqueNames = conflictAggregateIds
      .map((techniqueId) => normalizeName(
        (this.contentTemplateRepository.createTechniqueState(techniqueId) as any)?.name,
        techniqueId,
      ))
      .join('、');
    const sourceTechniqueNames = conflictSourceTechniqueIds
      .map((techniqueId) => normalizeName(
        (this.contentTemplateRepository.createTechniqueState(techniqueId) as any)?.name,
        techniqueId,
      ))
      .join('、');
    return {
      code,
      messageKey: 'technique.aggregation.' + code.toLowerCase(),
      ...extras,
      ...(aggregateTechniqueNames || sourceTechniqueNames ? {
        vars: {
          ...extras.vars,
          ...(aggregateTechniqueNames ? { aggregateTechniqueNames } : {}),
          ...(sourceTechniqueNames ? { sourceTechniqueNames } : {}),
        },
      } : {}),
    };
  }

  private resultFromError(request: TechniqueAggregationPublishRequest, error: TechniqueAggregationErrorView): TechniqueAggregationResultView {
    return {
      requestId: normalizeRequestId(request?.requestId),
      operationId: normalizeRequestId(request?.operationId),
      ok: false,
      code: error.code,
      messageKey: error.messageKey,
      vars: error.vars,
      conflictAggregateIds: error.conflictAggregateIds,
      conflictSourceTechniqueIds: error.conflictSourceTechniqueIds,
      invalidTechniqueIds: error.invalidTechniqueIds,
    };
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeName(value: unknown, fallback: string): string {
  return normalizeText(value) || normalizeText(fallback) || '未知功法';
}

function normalizeTechniqueAggregationName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  const length = getGraphemeCount(normalized);
  if (length < CUSTOM_TECHNIQUE_NAME_MIN_LENGTH || length > CUSTOM_TECHNIQUE_NAME_MAX_LENGTH) return null;
  if (!hasVisibleNameGrapheme(normalized) || containsInvisibleOnlyNameGrapheme(normalized)) return null;
  if (Array.from(normalized).length > 64 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

function normalizeRequestId(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized.slice(0, 96) : undefined;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveTechniqueStrengthPercent(value: unknown): number {
  const normalized = Number(value);
  const budgetPercent = Number.isFinite(normalized) ? normalized : 1;
  return Math.round(Math.min(
    TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE[1],
    Math.max(TECHNIQUE_INTERNAL_BUDGET_PERCENT_RANGE[0], budgetPercent),
  ) * 100);
}

function haveSameTechniqueIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((techniqueId) => rightIds.has(techniqueId));
}

function sumTechniqueTrainingDifficulty(template: TechniqueTemplate): number {
  return Math.max(1, Math.ceil((template.layers ?? []).reduce(
    (sum, layer) => sum + Math.max(0, Number((layer as TechniqueLayerDef).expToNext) || 0),
    0,
  )));
}

function compareSourceView(left: TechniqueAggregationSourceView, right: TechniqueAggregationSourceView): number {
  return left.grade.localeCompare(right.grade)
    || right.realmLv - left.realmLv
    || left.name.localeCompare(right.name, 'zh-Hans-CN')
    || left.techId.localeCompare(right.techId);
}

function setLatestPlayerFamilyCoverage(
  target: Map<string, { revision: number; covered: number }>,
  metadata: TechniqueAggregationMetadata,
  covered: ReadonlySet<string>,
): void {
  const previous = target.get(metadata.familyId);
  if (previous && previous.revision >= metadata.revision) return;
  target.set(metadata.familyId, {
    revision: metadata.revision,
    covered: metadata.sourceTechniqueIds.filter((sourceId) => covered.has(sourceId)).length,
  });
}
