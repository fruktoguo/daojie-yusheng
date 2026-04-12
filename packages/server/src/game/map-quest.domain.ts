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
/** quests：定义该变量以承载业务值。 */
  quests: Map<string, QuestConfig>;
/** mainQuestChain：定义该变量以承载业务值。 */
  mainQuestChain: QuestConfig[];
/** mainQuestIndexById：定义该变量以承载业务值。 */
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

/** reloadQuestBindingsFromFiles：执行对应的业务逻辑。 */
  reloadQuestBindingsFromFiles(): ReloadQuestBindingsResult {
/** quests：定义该变量以承载业务值。 */
    const quests = new Map<string, QuestConfig>();
    for (const map of this.maps.values()) {
      for (const npc of map.npcs) {
        npc.quests = [];
      }
    }

/** loadedCount：定义该变量以承载业务值。 */
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
/** giverNpc：定义该变量以承载业务值。 */
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
/** filePath：定义该变量以承载业务值。 */
        const filePath = path.join(this.questDir, file);
        try {
/** raw：定义该变量以承载业务值。 */
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as QuestFileDocument;
          return {
            file,
            quests: Array.isArray(raw.quests) ? raw.quests : [],
          };
        } catch (error) {
/** message：定义该变量以承载业务值。 */
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`读取任务文件失败 ${file}: ${message}`);
          return { file, quests: [] };
        }
      });
  }

/** rebuildMainQuestChain：执行对应的业务逻辑。 */
  private rebuildMainQuestChain(quests: Map<string, QuestConfig>): {
/** mainQuestChain：定义该变量以承载业务值。 */
    mainQuestChain: QuestConfig[];
/** mainQuestIndexById：定义该变量以承载业务值。 */
    mainQuestIndexById: Map<string, number>;
  } {
/** mainQuestChain：定义该变量以承载业务值。 */
    const mainQuestChain: QuestConfig[] = [];
/** mainQuestIndexById：定义该变量以承载业务值。 */
    const mainQuestIndexById = new Map<string, number>();

/** mainQuests：定义该变量以承载业务值。 */
    const mainQuests = [...quests.values()].filter((quest) => quest.line === 'main');
    if (mainQuests.length <= 0) {
      return { mainQuestChain, mainQuestIndexById };
    }

/** mainQuestIds：定义该变量以承载业务值。 */
    const mainQuestIds = new Set(mainQuests.map((quest) => quest.id));
/** previousQuestIdById：定义该变量以承载业务值。 */
    const previousQuestIdById = new Map<string, string>();
    for (const quest of mainQuests) {
      if (!quest.nextQuestId || !mainQuestIds.has(quest.nextQuestId)) {
        continue;
      }
/** existingPreviousQuestId：定义该变量以承载业务值。 */
      const existingPreviousQuestId = previousQuestIdById.get(quest.nextQuestId);
      if (existingPreviousQuestId) {
        this.logger.warn(`主线任务 ${quest.nextQuestId} 存在多个前置: ${existingPreviousQuestId}, ${quest.id}`);
        continue;
      }
      previousQuestIdById.set(quest.nextQuestId, quest.id);
    }

/** startCandidates：定义该变量以承载业务值。 */
    const startCandidates = mainQuests.filter((quest) => !previousQuestIdById.has(quest.id));
    if (startCandidates.length !== 1) {
      this.logger.warn(`主线链起点数量异常，期望 1 条，实际 ${startCandidates.length} 条`);
    }

/** current：定义该变量以承载业务值。 */
    let current: QuestConfig | undefined = startCandidates[0] ?? mainQuests[0];
/** visitedQuestIds：定义该变量以承载业务值。 */
    const visitedQuestIds = new Set<string>();
    while (current && !visitedQuestIds.has(current.id)) {
      visitedQuestIds.add(current.id);
      mainQuestIndexById.set(current.id, mainQuestChain.length);
      mainQuestChain.push(current);
      current = current.nextQuestId ? quests.get(current.nextQuestId) : undefined;
    }

    if (visitedQuestIds.size !== mainQuests.length) {
/** danglingQuestIds：定义该变量以承载业务值。 */
      const danglingQuestIds = mainQuests
        .map((quest) => quest.id)
        .filter((questId) => !visitedQuestIds.has(questId));
      this.logger.warn(`主线链未完全连通，缺失任务: ${danglingQuestIds.join(', ')}`);
    }

    return { mainQuestChain, mainQuestIndexById };
  }

/** normalizeQuestFileRecord：执行对应的业务逻辑。 */
  private normalizeQuestFileRecord(rawQuest: QuestFileRecord, sourceFile: string): QuestConfig | null {
/** sourceLabel：定义该变量以承载业务值。 */
    const sourceLabel = `任务文件 ${sourceFile}`;
/** objectiveType：定义该变量以承载业务值。 */
    const objectiveType = rawQuest.objectiveType ?? 'kill';
/** required：定义该变量以承载业务值。 */
    const required = Number.isInteger(rawQuest.required) ? rawQuest.required : rawQuest.targetCount;
/** giverMapId：定义该变量以承载业务值。 */
    const giverMapId = typeof rawQuest.giverMapId === 'string' && rawQuest.giverMapId.trim().length > 0
      ? rawQuest.giverMapId.trim()
      : '';
/** giverNpcId：定义该变量以承载业务值。 */
    const giverNpcId = typeof rawQuest.giverNpcId === 'string' && rawQuest.giverNpcId.trim().length > 0
      ? rawQuest.giverNpcId.trim()
      : '';
/** submitMapId：定义该变量以承载业务值。 */
    const submitMapId = typeof rawQuest.submitMapId === 'string' && rawQuest.submitMapId.trim().length > 0
      ? rawQuest.submitMapId.trim()
      : '';
/** submitNpcId：定义该变量以承载业务值。 */
    const submitNpcId = typeof rawQuest.submitNpcId === 'string' && rawQuest.submitNpcId.trim().length > 0
      ? rawQuest.submitNpcId.trim()
      : '';
/** rewardItemIds：定义该变量以承载业务值。 */
    const rewardItemIds = Array.isArray(rawQuest.reward)
      ? rawQuest.reward
          .map((entry) => entry?.itemId)
          .filter((itemId): itemId is string => typeof itemId === 'string')
      : (typeof rawQuest.rewardItemId === 'string' ? [rawQuest.rewardItemId] : []);
/** rewardText：定义该变量以承载业务值。 */
    const rewardText = typeof rawQuest.rewardText === 'string'
      ? rawQuest.rewardText
      : Array.isArray(rawQuest.reward) && rawQuest.reward.length > 0
        ? rawQuest.reward
            .map((entry) => `${entry.name ?? entry.itemId ?? '未知奖励'} x${entry.count ?? 1}`)
            .join('、')
        : '无';
/** rewards：定义该变量以承载业务值。 */
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
/** parsedRealmStage：定义该变量以承载业务值。 */
    const parsedRealmStage = typeof rawQuest.targetRealmStage === 'number'
      ? rawQuest.targetRealmStage
      : typeof rawQuest.targetRealmStage === 'string'
        ? PlayerRealmStage[rawQuest.targetRealmStage]
        : undefined;
/** parsedRealmLv：定义该变量以承载业务值。 */
    const parsedRealmLv = Number.isInteger(rawQuest.targetRealmLv)
      ? Math.max(1, Number(rawQuest.targetRealmLv))
      : undefined;
/** parsedAcceptRealmStage：定义该变量以承载业务值。 */
    const parsedAcceptRealmStage = typeof rawQuest.acceptRealmStage === 'number'
      ? rawQuest.acceptRealmStage
      : typeof rawQuest.acceptRealmStage === 'string'
        ? PlayerRealmStage[rawQuest.acceptRealmStage]
        : undefined;
/** parsedAcceptRealmLv：定义该变量以承载业务值。 */
    const parsedAcceptRealmLv = Number.isInteger(rawQuest.acceptRealmLv)
      ? Math.max(1, Number(rawQuest.acceptRealmLv))
      : undefined;
/** validByObjective：定义该变量以承载业务值。 */
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
/** validQuest：定义该变量以承载业务值。 */
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

/** giverMap：定义该变量以承载业务值。 */
    const giverMap = this.maps.get(giverMapId);
/** giverNpc：定义该变量以承载业务值。 */
    const giverNpc = this.getNpcInMap(giverMapId, giverNpcId);
/** submitMap：定义该变量以承载业务值。 */
    const submitMap = this.maps.get(submitMapId);
/** submitNpc：定义该变量以承载业务值。 */
    const submitNpc = this.getNpcInMap(submitMapId, submitNpcId);
    if (!giverMap || !giverNpc) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 发放点不存在: ${giverMapId}/${giverNpcId}`);
      return null;
    }
    if (!submitMap || !submitNpc) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 提交点不存在: ${submitMapId}/${submitNpcId}`);
      return null;
    }

/** targetMapId：定义该变量以承载业务值。 */
    const targetMapId = typeof rawQuest.targetMapId === 'string' && rawQuest.targetMapId.trim().length > 0
      ? rawQuest.targetMapId.trim()
      : undefined;
/** targetMap：定义该变量以承载业务值。 */
    const targetMap = targetMapId ? this.maps.get(targetMapId) : undefined;
    if (targetMapId && !targetMap) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 目标地图不存在: ${targetMapId}`);
      return null;
    }
/** targetNpcId：定义该变量以承载业务值。 */
    const targetNpcId = typeof rawQuest.targetNpcId === 'string' && rawQuest.targetNpcId.trim().length > 0
      ? rawQuest.targetNpcId.trim()
      : undefined;
/** targetNpcLocation：定义该变量以承载业务值。 */
    const targetNpcLocation = targetNpcId
      ? (targetMapId ? this.getNpcLocationInMap(targetMapId, targetNpcId) : this.getNpcLocation(targetNpcId))
      : undefined;
    if (objectiveType === 'talk' && targetNpcId && !targetNpcLocation) {
      this.logger.warn(`${sourceLabel} 的任务 ${rawQuest.id} 目标 NPC 不存在: ${targetMapId ?? '任意地图'}/${targetNpcId}`);
      return null;
    }

/** normalizedRequired：定义该变量以承载业务值。 */
    const normalizedRequired = objectiveType === 'submit_item'
      ? (Number.isInteger(rawQuest.requiredItemCount) ? rawQuest.requiredItemCount! : (Number.isInteger(required) ? required! : 1))
      : (Number.isInteger(required) ? required! : 1);
/** targetName：定义该变量以承载业务值。 */
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
/** line：定义该变量以承载业务值。 */
      line: rawQuest.line === 'main' || rawQuest.line === 'daily' || rawQuest.line === 'encounter'
        ? rawQuest.line
        : 'side',
/** chapter：定义该变量以承载业务值。 */
      chapter: typeof rawQuest.chapter === 'string' ? rawQuest.chapter : undefined,
/** story：定义该变量以承载业务值。 */
      story: typeof rawQuest.story === 'string' ? rawQuest.story : undefined,
      objectiveType,
/** objectiveText：定义该变量以承载业务值。 */
      objectiveText: typeof rawQuest.objectiveText === 'string' ? rawQuest.objectiveText : undefined,
      targetName,
      targetMapId: targetMapId ?? targetNpcLocation?.mapId,
      targetMapName: targetMap?.meta.name ?? (targetNpcLocation?.mapId ? this.getMapMeta(targetNpcLocation.mapId)?.name : undefined),
      targetX: Number.isInteger(rawQuest.targetX) ? rawQuest.targetX : targetNpcLocation?.x,
      targetY: Number.isInteger(rawQuest.targetY) ? rawQuest.targetY : targetNpcLocation?.y,
      targetNpcId,
/** targetNpcName：定义该变量以承载业务值。 */
      targetNpcName: typeof rawQuest.targetNpcName === 'string' ? rawQuest.targetNpcName : targetNpcLocation?.name,
/** targetMonsterId：定义该变量以承载业务值。 */
      targetMonsterId: typeof rawQuest.targetMonsterId === 'string' ? rawQuest.targetMonsterId : undefined,
/** targetTechniqueId：定义该变量以承载业务值。 */
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
/** nextQuestId：定义该变量以承载业务值。 */
      nextQuestId: typeof rawQuest.nextQuestId === 'string' ? rawQuest.nextQuestId : undefined,
/** requiredItemId：定义该变量以承载业务值。 */
      requiredItemId: typeof rawQuest.requiredItemId === 'string' ? rawQuest.requiredItemId : undefined,
      requiredItemCount: Number.isInteger(rawQuest.requiredItemCount) ? rawQuest.requiredItemCount : undefined,
      submitNpcId,
      submitNpcName: submitNpc.name,
      submitMapId,
      submitMapName: submitMap.meta.name,
      submitX: submitNpc.x,
      submitY: submitNpc.y,
/** relayMessage：定义该变量以承载业务值。 */
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

/** getNpcInMap：执行对应的业务逻辑。 */
  private getNpcInMap(mapId: string, npcId: string): NpcConfig | undefined {
    return this.maps.get(mapId)?.npcs.find((npc) => npc.id === npcId);
  }

/** getNpcLocationInMap：执行对应的业务逻辑。 */
  private getNpcLocationInMap(mapId: string, npcId: string): NpcLocation | undefined {
/** npc：定义该变量以承载业务值。 */
    const npc = this.getNpcInMap(mapId, npcId);
    if (!npc) {
      return undefined;
    }
/** mapMeta：定义该变量以承载业务值。 */
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

/** getNpcLocation：执行对应的业务逻辑。 */
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

/** getMapMeta：执行对应的业务逻辑。 */
  private getMapMeta(mapId: string): MapMeta | undefined {
    return this.maps.get(mapId)?.meta;
  }
}

