import { Logger } from '@nestjs/common';
import { ItemType, MapMeta, PlayerRealmStage } from '@mud/shared';
import * as fs from 'fs';
import * as path from 'path';
import { ContentService } from './content.service';
import {
  DropConfig,
  MapData,
  NpcConfig,
  NpcLocation,
  QuestConfig,
  QuestFileDocument,
  QuestFileRecord,
} from './map.service.shared';
import { resolveRealmStageTargetLabel } from './quest-display';

/** ReloadQuestBindingsResult：定义该接口的能力与字段约束。 */
interface ReloadQuestBindingsResult {
  quests: Map<string, QuestConfig>;
  mainQuestChain: QuestConfig[];
  mainQuestIndexById: Map<string, number>;
}

/** MapQuestDomain：封装相关状态与行为。 */
export class MapQuestDomain {
  constructor(
    private readonly contentService: ContentService,
    private readonly questDir: string,
    private readonly logger: Logger,
    private readonly maps: Map<string, MapData>,
  ) {}

  reloadQuestBindingsFromFiles(): ReloadQuestBindingsResult {
    const quests = new Map<string, QuestConfig>();
    for (const map of this.maps.values()) {
      for (const npc of map.npcs) {
        npc.quests = [];
      }
    }

    let loadedCount = 0;
    for (const document of this.loadQuestDocumentsFromFiles()) {
      for (const rawQuest of document.quests) {
        const quest = this.normalizeQuestFileRecord(rawQuest, document.file);
        if (!quest) {
          continue;
        }
        if (quests.has(quest.id)) {
          this.logger.warn(`任务 ID 重复，已忽略后续配置: ${quest.id} (${document.file})`);
          continue;
        }
        const giverNpc = this.getNpcInMap(quest.giverMapId, quest.giverId);
        if (!giverNpc) {
          this.logger.warn(`任务 ${quest.id} 的发放 NPC 不存在: ${quest.giverMapId}/${quest.giverId}`);
          continue;
        }
        giverNpc.quests.push(quest);
        quests.set(quest.id, quest);
        loadedCount += 1;
      }
    }

    const { mainQuestChain, mainQuestIndexById } = this.rebuildMainQuestChain(quests);
    this.logger.log(`已加载 ${loadedCount} 条任务配置`);
    return { quests, mainQuestChain, mainQuestIndexById };
  }

  private loadQuestDocumentsFromFiles(): Array<{ file: string; quests: QuestFileRecord[] }> {
    if (!fs.existsSync(this.questDir)) {
      this.logger.warn(`任务目录不存在，已跳过加载: ${this.questDir}`);
      return [];
    }

    return fs.readdirSync(this.questDir)
      .filter((file) => file.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
      .map((file) => {
        const filePath = path.join(this.questDir, file);
        try {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as QuestFileDocument;
          return {
            file,
            quests: Array.isArray(raw.quests) ? raw.quests : [],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`读取任务文件失败 ${file}: ${message}`);
          return { file, quests: [] };
        }
      });
  }

  private rebuildMainQuestChain(quests: Map<string, QuestConfig>): {
    mainQuestChain: QuestConfig[];
    mainQuestIndexById: Map<string, number>;
  } {
    const mainQuestChain: QuestConfig[] = [];
    const mainQuestIndexById = new Map<string, number>();

    const mainQuests = [...quests.values()].filter((quest) => quest.line === 'main');
    if (mainQuests.length <= 0) {
      return { mainQuestChain, mainQuestIndexById };
    }

    const mainQuestIds = new Set(mainQuests.map((quest) => quest.id));
    const previousQuestIdById = new Map<string, string>();
    for (const quest of mainQuests) {
      if (!quest.nextQuestId || !mainQuestIds.has(quest.nextQuestId)) {
        continue;
      }
      const existingPreviousQuestId = previousQuestIdById.get(quest.nextQuestId);
      if (existingPreviousQuestId) {
        this.logger.warn(`主线任务 ${quest.nextQuestId} 存在多个前置: ${existingPreviousQuestId}, ${quest.id}`);
        continue;
      }
      previousQuestIdById.set(quest.nextQuestId, quest.id);
    }

    const startCandidates = mainQuests.filter((quest) => !previousQuestIdById.has(quest.id));
    if (startCandidates.length !== 1) {
      this.logger.warn(`主线链起点数量异常，期望 1 条，实际 ${startCandidates.length} 条`);
    }

    let current: QuestConfig | undefined = startCandidates[0] ?? mainQuests[0];
    const visitedQuestIds = new Set<string>();
    while (current && !visitedQuestIds.has(current.id)) {
      visitedQuestIds.add(current.id);
      mainQuestIndexById.set(current.id, mainQuestChain.length);
      mainQuestChain.push(current);
      current = current.nextQuestId ? quests.get(current.nextQuestId) : undefined;
    }

    if (visitedQuestIds.size !== mainQuests.length) {
      const danglingQuestIds = mainQuests
        .map((quest) => quest.id)
        .filter((questId) => !visitedQuestIds.has(questId));
      this.logger.warn(`主线链未完全连通，缺失任务: ${danglingQuestIds.join(', ')}`);
    }

    return { mainQuestChain, mainQuestIndexById };
  }

  private normalizeQuestFileRecord(rawQuest: QuestFileRecord, sourceFile: string): QuestConfig | null {
    const sourceLabel = `任务文件 ${sourceFile}`;
    const objectiveType = rawQuest.objectiveType ?? 'kill';
    const required = Number.isInteger(rawQuest.required) ? rawQuest.required : rawQuest.targetCount;
    const giverMapId = typeof rawQuest.giverMapId === 'string' && rawQuest.giverMapId.trim().length > 0
      ? rawQuest.giverMapId.trim()
      : '';
    const giverNpcId = typeof rawQuest.giverNpcId === 'string' && rawQuest.giverNpcId.trim().length > 0
      ? rawQuest.giverNpcId.trim()
      : '';
    const submitMapId = typeof rawQuest.submitMapId === 'string' && rawQuest.submitMapId.trim().length > 0
      ? rawQuest.submitMapId.trim()
      : '';
    const submitNpcId = typeof rawQuest.submitNpcId === 'string' && rawQuest.submitNpcId.trim().length > 0
      ? rawQuest.submitNpcId.trim()
      : '';
    const rewardItemIds = Array.isArray(rawQuest.reward)
      ? rawQuest.reward
          .map((entry) => entry?.itemId)
          .filter((itemId): itemId is string => typeof itemId === 'string')
      : (typeof rawQuest.rewardItemId === 'string' ? [rawQuest.rewardItemId] : []);
    const rewardText = typeof rawQuest.rewardText === 'string'
      ? rawQuest.rewardText
      : Array.isArray(rawQuest.reward) && rawQuest.reward.length > 0
        ? rawQuest.reward
            .map((entry) => `${entry.name ?? entry.itemId ?? '未知奖励'} x${entry.count ?? 1}`)
            .join('、')
        : '无';
    const rewards: DropConfig[] = Array.isArray(rawQuest.reward)
      ? rawQuest.reward
          .filter((entry): entry is { itemId: string; name: string; type: ItemType; count?: number } =>
            typeof entry?.itemId === 'string'
            && typeof entry?.name === 'string'
            && typeof entry?.type === 'string',
          )
          .map((entry) => ({
            itemId: entry.itemId,
            name: entry.name,
            type: entry.type,
            count: Number.isInteger(entry.count) ? Number(entry.count) : 1,
            chance: 1,
          }))
      : [];
    const parsedRealmStage = typeof rawQuest.targetRealmStage === 'number'
      ? rawQuest.targetRealmStage
      : typeof rawQuest.targetRealmStage === 'string'
        ? PlayerRealmStage[rawQuest.targetRealmStage]
        : undefined;
    const parsedRealmLv = Number.isInteger(rawQuest.targetRealmLv)
      ? Math.max(1, Number(rawQuest.targetRealmLv))
      : undefined;
    const parsedAcceptRealmStage = typeof rawQuest.acceptRealmStage === 'number'
      ? rawQuest.acceptRealmStage
      : typeof rawQuest.acceptRealmStage === 'string'
        ? PlayerRealmStage[rawQuest.acceptRealmStage]
        : undefined;
    const parsedAcceptRealmLv = Number.isInteger(rawQuest.acceptRealmLv)
      ? Math.max(1, Number(rawQuest.acceptRealmLv))
      : undefined;
    const validByObjective = (
      objectiveType === 'kill' && typeof rawQuest.targetMonsterId === 'string' && Number.isInteger(required)
    ) || (
      objectiveType === 'talk' && typeof rawQuest.targetNpcId === 'string'
    ) || (
      objectiveType === 'submit_item' && typeof rawQuest.requiredItemId === 'string'
    ) || (
      objectiveType === 'learn_technique' && typeof rawQuest.targetTechniqueId === 'string'
    ) || (
      objectiveType === 'realm_progress' && Number.isInteger(required) && (parsedRealmStage !== undefined || parsedRealmLv !== undefined)
    ) || (
      objectiveType === 'realm_stage' && (parsedRealmStage !== undefined || parsedRealmLv !== undefined)
    );
    const validQuest =
      typeof rawQuest.id === 'string'
      && typeof rawQuest.title === 'string'
      && typeof rawQuest.desc === 'string'
      && giverMapId.length > 0
      && giverNpcId.length > 0
      && submitMapId.length > 0
      && submitNpcId.length > 0
      && validByObjective
      && (rewardItemIds.length > 0 || rewards.length > 0 || typeof rawQuest.rewardText === 'string');
    if (!validQuest) {
      this.logger.warn(`${sourceLabel} 存在非法任务配置: ${rawQuest.id ?? rawQuest.title ?? '未命名任务'}`);
      return null;
    }

    const giverMap = this.maps.get(giverMapId);
    const giverNpc = this.getNpcInMap(giverMapId, giverNpcId);
    const submitMap = this.maps.get(submitMapId);
    const submitNpc = this.getNpcInMap(submitMapId, submitNpcId);
    if (!giverMap || !giverNpc) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 发放点不存在: ${giverMapId}/${giverNpcId}`);
      return null;
    }
    if (!submitMap || !submitNpc) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 提交点不存在: ${submitMapId}/${submitNpcId}`);
      return null;
    }

    const targetMapId = typeof rawQuest.targetMapId === 'string' && rawQuest.targetMapId.trim().length > 0
      ? rawQuest.targetMapId.trim()
      : undefined;
    const targetMap = targetMapId ? this.maps.get(targetMapId) : undefined;
    if (targetMapId && !targetMap) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 目标地图不存在: ${targetMapId}`);
      return null;
    }
    const targetNpcId = typeof rawQuest.targetNpcId === 'string' && rawQuest.targetNpcId.trim().length > 0
      ? rawQuest.targetNpcId.trim()
      : undefined;
    const targetNpcLocation = targetNpcId
      ? (targetMapId ? this.getNpcLocationInMap(targetMapId, targetNpcId) : this.getNpcLocation(targetNpcId))
      : undefined;
    if (objectiveType === 'talk' && targetNpcId && !targetNpcLocation) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 目标 NPC 不存在: ${targetMapId ?? '任意地图'}/${targetNpcId}`);
      return null;
    }

    const normalizedRequired = objectiveType === 'submit_item'
      ? (Number.isInteger(rawQuest.requiredItemCount) ? rawQuest.requiredItemCount! : (Number.isInteger(required) ? required! : 1))
      : (Number.isInteger(required) ? required! : 1);
    const targetName = typeof rawQuest.targetName === 'string'
      ? rawQuest.targetName
      : objectiveType === 'kill'
        ? rawQuest.targetMonsterId!
        : objectiveType === 'talk'
          ? rawQuest.targetNpcName ?? targetNpcLocation?.name ?? targetNpcId ?? rawQuest.title!
          : objectiveType === 'submit_item'
            ? rawQuest.requiredItemId ?? rawQuest.title!
            : objectiveType === 'learn_technique'
              ? rawQuest.targetTechniqueId!
              : parsedRealmStage !== undefined
                ? resolveRealmStageTargetLabel(parsedRealmStage) ?? PlayerRealmStage[parsedRealmStage]
                : parsedRealmLv !== undefined
                  ? this.contentService.getRealmLevelEntry(parsedRealmLv)?.displayName ?? `realmLv ${parsedRealmLv}`
                  : rawQuest.title!;

    return {
      id: rawQuest.id!,
      title: rawQuest.title!,
      desc: rawQuest.desc!,
      line: rawQuest.line === 'main' || rawQuest.line === 'daily' || rawQuest.line === 'encounter'
        ? rawQuest.line
        : 'side',
      chapter: typeof rawQuest.chapter === 'string' ? rawQuest.chapter : undefined,
      story: typeof rawQuest.story === 'string' ? rawQuest.story : undefined,
      objectiveType,
      objectiveText: typeof rawQuest.objectiveText === 'string' ? rawQuest.objectiveText : undefined,
      targetName,
      targetMapId: targetMapId ?? targetNpcLocation?.mapId,
      targetMapName: targetMap?.meta.name ?? (targetNpcLocation?.mapId ? this.getMapMeta(targetNpcLocation.mapId)?.name : undefined),
      targetX: Number.isInteger(rawQuest.targetX) ? rawQuest.targetX : targetNpcLocation?.x,
      targetY: Number.isInteger(rawQuest.targetY) ? rawQuest.targetY : targetNpcLocation?.y,
      targetNpcId,
      targetNpcName: typeof rawQuest.targetNpcName === 'string' ? rawQuest.targetNpcName : targetNpcLocation?.name,
      targetMonsterId: typeof rawQuest.targetMonsterId === 'string' ? rawQuest.targetMonsterId : undefined,
      targetTechniqueId: typeof rawQuest.targetTechniqueId === 'string' ? rawQuest.targetTechniqueId : undefined,
      targetRealmStage: parsedRealmStage,
      targetRealmLv: parsedRealmLv,
      acceptRealmStage: parsedAcceptRealmStage,
      acceptRealmLv: parsedAcceptRealmLv,
      required: normalizedRequired,
      rewards,
      rewardItemIds,
      rewardItemId: rewardItemIds[0] ?? '',
      rewardText,
      nextQuestId: typeof rawQuest.nextQuestId === 'string' ? rawQuest.nextQuestId : undefined,
      requiredItemId: typeof rawQuest.requiredItemId === 'string' ? rawQuest.requiredItemId : undefined,
      requiredItemCount: Number.isInteger(rawQuest.requiredItemCount) ? rawQuest.requiredItemCount : undefined,
      submitNpcId,
      submitNpcName: submitNpc.name,
      submitMapId,
      submitMapName: submitMap.meta.name,
      submitX: submitNpc.x,
      submitY: submitNpc.y,
      relayMessage: typeof rawQuest.relayMessage === 'string' ? rawQuest.relayMessage : undefined,
      unlockBreakthroughRequirementIds: Array.isArray(rawQuest.unlockBreakthroughRequirementIds)
        ? rawQuest.unlockBreakthroughRequirementIds.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
      giverId: giverNpc.id,
      giverName: giverNpc.name,
      giverMapId,
      giverMapName: giverMap.meta.name,
      giverX: giverNpc.x,
      giverY: giverNpc.y,
    };
  }

  private getNpcInMap(mapId: string, npcId: string): NpcConfig | undefined {
    return this.maps.get(mapId)?.npcs.find((npc) => npc.id === npcId);
  }

  private getNpcLocationInMap(mapId: string, npcId: string): NpcLocation | undefined {
    const npc = this.getNpcInMap(mapId, npcId);
    if (!npc) {
      return undefined;
    }
    const mapMeta = this.maps.get(mapId)?.meta;
    if (!mapMeta) {
      return undefined;
    }
    return {
      mapId,
      mapName: mapMeta.name,
      x: npc.x,
      y: npc.y,
      name: npc.name,
    };
  }

  private getNpcLocation(npcId: string): NpcLocation | undefined {
    for (const [mapId, map] of this.maps.entries()) {
      const npc = map.npcs.find((entry) => entry.id === npcId);
      if (!npc) {
        continue;
      }
      return {
        mapId,
        mapName: map.meta.name,
        x: npc.x,
        y: npc.y,
        name: npc.name,
      };
    }
    return undefined;
  }

  private getMapMeta(mapId: string): MapMeta | undefined {
    return this.maps.get(mapId)?.meta;
  }
}

