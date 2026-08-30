/**
 * 副本内容 Registry：启动期读取并校验固定副本定义，运行期只读。
 */
import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DUNGEON_FLOW_TYPE_ORDER,
  DUNGEON_MAX_PARTY_MEMBERS,
  DUNGEON_PRESENT_RANK_ORDER,
  assertContentConfigDocument,
  type DungeonDefinition,
  type DungeonDifficulty,
  type DungeonFlowType,
  type DungeonMechanismFormationConfig,
  type DungeonMapRoomDefinition,
  type DungeonPresentationActionStep,
  type DungeonPresentationActionTrigger,
  type DungeonPresentationCondition,
  type DungeonPresentationDefinition,
  type DungeonPresentationDialogueStep,
  type DungeonPresentationStep,
  type DungeonWaveDefinition,
} from '@mud/shared';
import { resolveProjectPath } from '../../common/project-path';
import { freezeTemplateMap } from './template-freeze';

const DIFFICULTIES = ['trial', 'hard', 'nightmare', 'present'] as const;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`副本配置 ${field} 必须是非空字符串`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`副本配置 ${field} 必须是正整数`);
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`副本配置 ${field} 必须是非负整数`);
  }
  return Number(value);
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : nonNegativeInteger(value, field);
}

function normalizeDifficultyConfig(raw: unknown, basePath: string): DungeonDefinition['difficulty'] {
  if (!isRecord(raw)) throw new Error(`${basePath} 必须是对象`);
  const maxPresentRank = requiredString(raw.maxPresentRank, `${basePath}.maxPresentRank`) as DungeonDefinition['difficulty']['maxPresentRank'];
  if (!DUNGEON_PRESENT_RANK_ORDER.includes(maxPresentRank)) {
    throw new Error(`${basePath}.maxPresentRank 不是合法现世阶位`);
  }
  if (!isRecord(raw.energyCost)) throw new Error(`${basePath}.energyCost 必须是对象`);
  const energyCost = Object.fromEntries(DIFFICULTIES.map((difficulty) => [
    difficulty,
    nonNegativeInteger(raw.energyCost[difficulty], `${basePath}.energyCost.${difficulty}`),
  ])) as DungeonDefinition['difficulty']['energyCost'];
  const attributeRule = raw.attributeRule === undefined ? undefined : {
    allAttributeMultiplierBase: Number(raw.attributeRule.allAttributeMultiplierBase ?? 1.2),
    hpMultiplierBase: Number(raw.attributeRule.hpMultiplierBase ?? 2),
    difficultyStep: nonNegativeInteger(raw.attributeRule.difficultyStep ?? 0, `${basePath}.attributeRule.difficultyStep`),
    ...(isRecord(raw.attributeRule.presentRankStep) ? { presentRankStep: { ...raw.attributeRule.presentRankStep } } : {}),
  };
  if (attributeRule && (!Number.isFinite(attributeRule.allAttributeMultiplierBase)
    || attributeRule.allAttributeMultiplierBase <= 0
    || !Number.isFinite(attributeRule.hpMultiplierBase)
    || attributeRule.hpMultiplierBase <= 0)) {
    throw new Error(`${basePath}.attributeRule 倍率必须是正数`);
  }
  return {
    maxPresentRank,
    energyCost,
    ...(attributeRule ? { attributeRule } : {}),
    ...(isRecord(raw.overrides) ? { overrides: raw.overrides } : {}),
    ...(isRecord(raw.presentRankOverrides) ? { presentRankOverrides: raw.presentRankOverrides } : {}),
  };
}

function normalizeRooms(raw: unknown): DungeonMapRoomDefinition[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('副本 rooms 必须是数组');
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`副本 rooms[${index}] 必须是对象`);
    const roomId = requiredString(entry.roomId, `rooms[${index}].roomId`);
    const clearCondition = entry.clearCondition === undefined
      ? undefined
      : String(entry.clearCondition) as DungeonMapRoomDefinition['clearCondition'];
    if (clearCondition && !['boss_defeated', 'all_hostiles_defeated', 'controller'].includes(clearCondition)) {
      throw new Error(`rooms[${index}].clearCondition 不受支持`);
    }
    let mechanismFormation: DungeonMechanismFormationConfig | undefined;
    if (isRecord(entry.mechanismFormation)) {
      const formation = entry.mechanismFormation;
      const controlMode = requiredString(formation.controlMode, `rooms[${index}].mechanismFormation.controlMode`);
      const arrayEyeMode = requiredString(formation.arrayEyeMode, `rooms[${index}].mechanismFormation.arrayEyeMode`);
      if (controlMode !== 'controller_only' || arrayEyeMode !== 'none') {
        throw new Error(`rooms[${index}].mechanismFormation 必须使用 controller_only/none`);
      }
      mechanismFormation = {
        kind: requiredString(formation.kind, `rooms[${index}].mechanismFormation.kind`),
        formationId: requiredString(formation.formationId, `rooms[${index}].mechanismFormation.formationId`),
        controlMode: 'controller_only',
        arrayEyeMode: 'none',
        ...(formation.effectValue === undefined ? {} : { effectValue: Number(formation.effectValue) }),
        ...(formation.spiritStoneBudget === undefined ? {} : { spiritStoneBudget: nonNegativeInteger(formation.spiritStoneBudget, `rooms[${index}].mechanismFormation.spiritStoneBudget`) }),
        ...(formation.qiBudget === undefined ? {} : { qiBudget: nonNegativeInteger(formation.qiBudget, `rooms[${index}].mechanismFormation.qiBudget`) }),
        ...(formation.durability === undefined ? {} : { durability: nonNegativeInteger(formation.durability, `rooms[${index}].mechanismFormation.durability`) }),
        ...(formation.powerMultiplierByBossMaxHp === undefined ? {} : { powerMultiplierByBossMaxHp: Number(formation.powerMultiplierByBossMaxHp) }),
        ...(isRecord(formation.metadata) ? { metadata: { ...formation.metadata } } : {}),
      };
    }
    return {
      roomId,
      ...(entry.mapTemplateId !== undefined ? { mapTemplateId: requiredString(entry.mapTemplateId, `rooms[${index}].mapTemplateId`) } : {}),
      ...(entry.spawnX === undefined ? {} : { spawnX: nonNegativeInteger(entry.spawnX, `rooms[${index}].spawnX`) }),
      ...(entry.spawnY === undefined ? {} : { spawnY: nonNegativeInteger(entry.spawnY, `rooms[${index}].spawnY`) }),
      ...(entry.nextRoomId !== undefined ? { nextRoomId: requiredString(entry.nextRoomId, `rooms[${index}].nextRoomId`) } : {}),
      ...(Array.isArray(entry.spawnGroupIds) ? { spawnGroupIds: entry.spawnGroupIds.map((value: unknown) => requiredString(value, `rooms[${index}].spawnGroupIds`)) } : {}),
      ...(entry.bossId !== undefined ? { bossId: requiredString(entry.bossId, `rooms[${index}].bossId`) } : {}),
      ...(Array.isArray(entry.eliteGroupIds) ? { eliteGroupIds: entry.eliteGroupIds.map((value: unknown) => requiredString(value, `rooms[${index}].eliteGroupIds`)) } : {}),
      ...(clearCondition ? { clearCondition } : {}),
      ...(mechanismFormation ? { mechanismFormation } : {}),
    };
  });
}

function normalizeWaves(raw: unknown): DungeonWaveDefinition[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('副本 waves 必须是数组');
  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`副本 waves[${index}] 必须是对象`);
    const spawnGroupIds = Array.isArray(entry.spawnGroupIds)
      ? entry.spawnGroupIds.map((value: unknown) => requiredString(value, `waves[${index}].spawnGroupIds`))
      : [];
    if (spawnGroupIds.length === 0) throw new Error(`waves[${index}].spawnGroupIds 不能为空`);
    return {
      waveIndex: nonNegativeInteger(entry.waveIndex, `waves[${index}].waveIndex`),
      spawnGroupIds,
      ...(entry.count === undefined ? {} : { count: positiveInteger(entry.count, `waves[${index}].count`) }),
      ...(entry.intervalSeconds === undefined ? {} : { intervalSeconds: nonNegativeInteger(entry.intervalSeconds, `waves[${index}].intervalSeconds`) }),
      ...(entry.rewardTableId === undefined ? {} : { rewardTableId: requiredString(entry.rewardTableId, `waves[${index}].rewardTableId`) }),
    };
  });
}

function normalizePresentationCondition(raw: unknown, basePath: string): DungeonPresentationCondition | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error(`${basePath} 必须是对象`);
  const maxPartyRealmLv = raw.maxPartyRealmLv === undefined ? undefined : nonNegativeInteger(raw.maxPartyRealmLv, `${basePath}.maxPartyRealmLv`);
  const minPartyRealmLv = raw.minPartyRealmLv === undefined ? undefined : nonNegativeInteger(raw.minPartyRealmLv, `${basePath}.minPartyRealmLv`);
  if (maxPartyRealmLv !== undefined && minPartyRealmLv !== undefined && minPartyRealmLv > maxPartyRealmLv) {
    throw new Error(`${basePath}.minPartyRealmLv 不能大于 maxPartyRealmLv`);
  }
  if (maxPartyRealmLv === undefined && minPartyRealmLv === undefined) return undefined;
  return {
    ...(maxPartyRealmLv === undefined ? {} : { maxPartyRealmLv }),
    ...(minPartyRealmLv === undefined ? {} : { minPartyRealmLv }),
  };
}

function normalizePresentation(raw: unknown, basePath: string): DungeonPresentationDefinition | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error(`${basePath} 必须是对象`);
  const normalizeSteps = (value: unknown, stepsPath: string): DungeonPresentationStep[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new Error(`${stepsPath} 必须是数组`);
    return value.map((entry: unknown, index: number) => {
      const itemPath = `${stepsPath}[${index}]`;
      if (!isRecord(entry)) throw new Error(`${itemPath} 必须是对象`);
      const stepId = requiredString(entry.stepId ?? entry.id, `${itemPath}.stepId`);
      const type = requiredString(entry.type, `${itemPath}.type`);
      const actor = isRecord(entry.actor) ? entry.actor : null;
      if (!actor) throw new Error(`${itemPath}.actor 必须是对象`);
      const actorKind = requiredString(actor.kind, `${itemPath}.actor.kind`);
      if (actorKind !== 'monster' && actorKind !== 'npc') throw new Error(`${itemPath}.actor.kind 不受支持`);
      const actorRef = { kind: actorKind, id: requiredString(actor.id, `${itemPath}.actor.id`) } as const;
      const condition = normalizePresentationCondition(entry.condition, `${itemPath}.condition`);
      if (type === 'dialogue') {
        const result: DungeonPresentationDialogueStep = {
          stepId,
          type: 'dialogue',
          actor: actorRef,
          text: requiredString(entry.text, `${itemPath}.text`),
          ...(entry.durationMs === undefined ? {} : { durationMs: positiveInteger(entry.durationMs, `${itemPath}.durationMs`) }),
          ...(condition ? { condition } : {}),
        };
        return result;
      }
      if (type === 'action') {
        const result: DungeonPresentationActionStep = {
          stepId,
          type: 'action',
          actor: actorRef,
          actionId: requiredString(entry.actionId, `${itemPath}.actionId`),
          ...(entry.delayTicks === undefined ? {} : { delayTicks: nonNegativeInteger(entry.delayTicks, `${itemPath}.delayTicks`) }),
          ...(entry.durationTicks === undefined ? {} : { durationTicks: positiveInteger(entry.durationTicks, `${itemPath}.durationTicks`) }),
          ...(condition ? { condition } : {}),
          ...(isRecord(entry.params) ? { params: { ...entry.params } } : {}),
        };
        return result;
      }
      throw new Error(`${itemPath}.type 仅支持 dialogue/action`);
    });
  };
  const onRunCreated = normalizeSteps(raw.onRunCreated, `${basePath}.onRunCreated`);
  let onMonsterAction: DungeonPresentationActionTrigger[] | undefined;
  if (raw.onMonsterAction !== undefined) {
    if (!Array.isArray(raw.onMonsterAction)) throw new Error(`${basePath}.onMonsterAction 必须是数组`);
    onMonsterAction = raw.onMonsterAction.map((entry: unknown, index: number) => {
      const triggerPath = `${basePath}.onMonsterAction[${index}]`;
      if (!isRecord(entry)) throw new Error(`${triggerPath} 必须是对象`);
      const steps = normalizeSteps(entry.steps, `${triggerPath}.steps`);
      if (!steps || steps.length === 0) throw new Error(`${triggerPath}.steps 不能为空`);
      return {
        actionId: requiredString(entry.actionId, `${triggerPath}.actionId`),
        steps,
      };
    });
  }
  if (!onRunCreated && !onMonsterAction) return undefined;
  return {
    ...(onRunCreated ? { onRunCreated } : {}),
    ...(onMonsterAction ? { onMonsterAction } : {}),
  };
}

function normalizeDefinition(raw: unknown, source: string): DungeonDefinition {
  if (!isRecord(raw)) throw new Error(`${source} 顶层必须是对象`);
  const id = requiredString(raw.id, `${source}.id`);
  const flowType = requiredString(raw.flowType, `${source}.flowType`) as DungeonFlowType;
  if (!DUNGEON_FLOW_TYPE_ORDER.includes(flowType)) throw new Error(`${source}.flowType 不受支持`);
  const maxPartyMembers = positiveInteger(raw.maxPartyMembers ?? DUNGEON_MAX_PARTY_MEMBERS, `${source}.maxPartyMembers`);
  if (maxPartyMembers > DUNGEON_MAX_PARTY_MEMBERS) throw new Error(`${source}.maxPartyMembers 不能超过 ${DUNGEON_MAX_PARTY_MEMBERS}`);
  const rewards = isRecord(raw.rewards) ? raw.rewards : null;
  if (!rewards) throw new Error(`${source}.rewards 必须是对象`);
  const presentation = normalizePresentation(raw.presentation, `${source}.presentation`);
  return {
    id,
    name: requiredString(raw.name, `${source}.name`),
    ...(raw.description === undefined ? {} : { description: String(raw.description) }),
    flowType,
    controllerId: requiredString(raw.controllerId ?? raw.controller, `${source}.controllerId`),
    mapTemplateId: requiredString(raw.mapTemplateId, `${source}.mapTemplateId`),
    maxPartyMembers,
    entryMapTemplateId: requiredString(raw.entryMapTemplateId ?? raw.entryMapId, `${source}.entryMapTemplateId`),
    ...(optionalNonNegativeInteger(raw.entryX, `${source}.entryX`) !== undefined ? { entryX: Number(raw.entryX) } : {}),
    ...(optionalNonNegativeInteger(raw.entryY, `${source}.entryY`) !== undefined ? { entryY: Number(raw.entryY) } : {}),
    ...(optionalNonNegativeInteger(raw.entryExitRadius, `${source}.entryExitRadius`) !== undefined ? { entryExitRadius: Number(raw.entryExitRadius) } : {}),
    ...(raw.confirmationTimeoutMs === undefined ? {} : { confirmationTimeoutMs: positiveInteger(raw.confirmationTimeoutMs, `${source}.confirmationTimeoutMs`) }),
    ...(raw.timeoutSeconds === undefined ? {} : { timeoutSeconds: positiveInteger(raw.timeoutSeconds, `${source}.timeoutSeconds`) }),
    difficulty: normalizeDifficultyConfig(raw.difficulty ?? { maxPresentRank: 'mortal', energyCost: { trial: 4, hard: 8, nightmare: 12, present: 24 } }, `${source}.difficulty`),
    ...(normalizeRooms(raw.rooms) ? { rooms: normalizeRooms(raw.rooms) } : {}),
    ...(normalizeWaves(raw.waves) ? { waves: normalizeWaves(raw.waves) } : {}),
    ...(presentation ? { presentation } : {}),
    rewards: {
      rewardTableId: requiredString(rewards.rewardTableId, `${source}.rewards.rewardTableId`),
      ...(rewards.firstClearOnly === undefined ? {} : { firstClearOnly: rewards.firstClearOnly === true }),
      ...(rewards.ratingEnabled === undefined ? {} : { ratingEnabled: rewards.ratingEnabled === true }),
      ...(Array.isArray(rewards.itemRewards) ? { itemRewards: rewards.itemRewards.map((entry: any, index: number) => ({ itemId: requiredString(entry?.itemId, `${source}.rewards.itemRewards[${index}].itemId`), count: positiveInteger(entry?.count, `${source}.rewards.itemRewards[${index}].count`) })) } : {}),
    },
    ...(isRecord(raw.metadata) ? { metadata: { ...raw.metadata } } : {}),
  };
}

@Injectable()
export class DungeonTemplateRegistry {
  readonly dungeonDefinitions = new Map<string, DungeonDefinition>();

  loadAll(): void {
    this.dungeonDefinitions.clear();
    const directory = resolveProjectPath('packages', 'server', 'data', 'content', 'dungeons');
    if (!fs.existsSync(directory)) return;
    const files = fs.readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
    for (const file of files) {
      const filePath = path.join(directory, file);
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      entries.forEach((entry, index) => {
        assertContentConfigDocument(`dungeons/${file}`, entry);
        const definition = normalizeDefinition(entry, `${file}[${index}]`);
        if (this.dungeonDefinitions.has(definition.id)) {
          throw new Error(`副本 ID 重复：${definition.id}`);
        }
        this.dungeonDefinitions.set(definition.id, definition);
      });
    }
    freezeTemplateMap(this.dungeonDefinitions);
  }

  getRef(dungeonId: string): Readonly<DungeonDefinition> {
    const definition = this.tryGetRef(dungeonId);
    if (!definition) throw new Error(`未找到副本定义：${dungeonId}`);
    return definition;
  }

  tryGetRef(dungeonId: string): Readonly<DungeonDefinition> | undefined {
    const normalized = typeof dungeonId === 'string' ? dungeonId.trim() : '';
    return normalized ? this.dungeonDefinitions.get(normalized) : undefined;
  }

  listDefinitions(): DungeonDefinition[] {
    return Array.from(this.dungeonDefinitions.values(), (definition) => ({ ...definition }));
  }
}
