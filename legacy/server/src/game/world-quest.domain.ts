import {
  createItemStackSignature,
  ItemStack,
  NpcQuestMarker,
  PlayerState,
  QuestState,
} from '@mud/shared';
import { MARKET_CURRENCY_ITEM_ID } from '../constants/gameplay/market';
import { ContentService } from './content.service';
import { InventoryService } from './inventory.service';
import { LootService } from './loot.service';
import { ContainerConfig, DropConfig, MapService, NpcConfig, QuestConfig } from './map.service';
import { PlayerService } from './player.service';
import { isLikelyInternalContentId, resolveQuestTargetName } from './quest-display';

interface RuntimeMonsterLike {
  id: string;
  name: string;
  mapId: string;
  x: number;
  y: number;
  drops: DropConfig[];
}

interface NpcInteractionState {
  quest?: QuestConfig;
  questState?: QuestState;
  relation?: 'giver' | 'target' | 'submit';
}

interface QuestDomainDeps {
  getCurrentMainQuestId: (player: PlayerState) => string | undefined;
  getEffectiveDropChance: (player: PlayerState, monster: RuntimeMonsterLike, drop: DropConfig) => number;
}

export class WorldQuestDomain {
  constructor(
    private readonly mapService: MapService,
    private readonly contentService: ContentService,
    private readonly inventoryService: InventoryService,
    private readonly lootService: LootService,
    private readonly playerService: PlayerService,
    private readonly deps: QuestDomainDeps,
  ) {}

  advanceQuestProgress(player: PlayerState, monsterId: string, monsterName: string): Array<'quest' | 'actions'> {
    let changed = false;
    for (const quest of player.quests) {
      if (quest.status !== 'active' || quest.objectiveType !== 'kill' || quest.targetMonsterId !== monsterId) continue;
      quest.progress = Math.min(quest.required, quest.progress + 1);
      const targetName = resolveQuestTargetName({
        objectiveType: quest.objectiveType,
        title: quest.title,
        targetName: quest.targetName,
        targetMonsterId: quest.targetMonsterId,
        resolveMonsterName: () => monsterName,
      });
      if (quest.targetName !== targetName) {
        quest.targetName = targetName;
      }
      changed = true;
    }

    if (changed && this.refreshQuestStatuses(player)) {
      return ['quest', 'actions'];
    }
    return changed ? ['quest'] : [];
  }

  refreshQuestStatuses(player: PlayerState): boolean {
    let changed = false;
    for (const quest of player.quests) {
      const config = this.mapService.getQuest(quest.id);
      if (!config) continue;
      const canBecomeReady = this.canQuestBecomeReady(player, quest, config);
      if (quest.status === 'active' && canBecomeReady) {
        quest.status = 'ready';
        changed = true;
      } else if (quest.status === 'ready' && !canBecomeReady) {
        quest.status = 'active';
        changed = true;
      }
    }
    return changed;
  }

  canQuestBecomeReady(player: PlayerState, quest: QuestState, config: QuestConfig): boolean {
    if (quest.progress < quest.required) {
      return false;
    }
    return !config.requiredItemId || this.getInventoryCount(player, config.requiredItemId) >= (config.requiredItemCount ?? 1);
  }

  resolveQuestProgress(player: PlayerState, questState: QuestState, config: QuestConfig): number {
    switch (config.objectiveType) {
      case 'talk':
        return questState.progress;
      case 'submit_item':
        return config.requiredItemId
          ? Math.min(questState.required, this.getInventoryCount(player, config.requiredItemId))
          : questState.progress;
      case 'learn_technique':
        return player.techniques.some((entry) => entry.techId === config.targetTechniqueId)
          ? questState.required
          : 0;
      case 'realm_progress': {
        if (!player.realm) return 0;
        if (config.targetRealmLv !== undefined) {
          return player.realm.realmLv > config.targetRealmLv
            ? questState.required
            : player.realm.realmLv < config.targetRealmLv
              ? 0
              : Math.min(questState.required, player.realm.progress);
        }
        if (config.targetRealmStage === undefined) return 0;
        if (player.realm.stage > config.targetRealmStage) {
          return questState.required;
        }
        if (player.realm.stage < config.targetRealmStage) {
          return 0;
        }
        return Math.min(questState.required, player.realm.progress);
      }
      case 'realm_stage':
        if (!player.realm) {
          return 0;
        }
        if (config.targetRealmLv !== undefined) {
          return player.realm.realmLv >= config.targetRealmLv ? questState.required : 0;
        }
        return config.targetRealmStage !== undefined && player.realm.stage >= config.targetRealmStage
          ? questState.required
          : 0;
      case 'kill':
      default:
        return questState.progress;
    }
  }

  syncQuestNpcLocations(quest: QuestState): boolean {
    let changed = false;
    if (
      (!quest.giverMapName || quest.giverX === undefined || quest.giverY === undefined || (quest.giverMapId && quest.giverMapName === quest.giverMapId))
      && quest.giverId
    ) {
      const giverLocation = this.mapService.getNpcLocation(quest.giverId);
      if (giverLocation) {
        quest.giverMapId = giverLocation.mapId;
        quest.giverMapName = giverLocation.mapName;
        quest.giverX = giverLocation.x;
        quest.giverY = giverLocation.y;
        changed = true;
      }
    }

    if (quest.targetNpcId) {
      const targetLocation = this.mapService.getNpcLocation(quest.targetNpcId);
      if (targetLocation && (
        quest.targetMapId !== targetLocation.mapId
        || quest.targetMapName !== targetLocation.mapName
        || quest.targetX !== targetLocation.x
        || quest.targetY !== targetLocation.y
        || quest.targetNpcName !== targetLocation.name
      )) {
        quest.targetMapId = targetLocation.mapId;
        quest.targetMapName = targetLocation.mapName;
        quest.targetX = targetLocation.x;
        quest.targetY = targetLocation.y;
        quest.targetNpcName = targetLocation.name;
        changed = true;
      }
    }

    if (quest.submitNpcId) {
      const submitLocation = this.mapService.getNpcLocation(quest.submitNpcId);
      if (submitLocation && (
        quest.submitMapId !== submitLocation.mapId
        || quest.submitMapName !== submitLocation.mapName
        || quest.submitX !== submitLocation.x
        || quest.submitY !== submitLocation.y
        || quest.submitNpcName !== submitLocation.name
      )) {
        quest.submitMapId = submitLocation.mapId;
        quest.submitMapName = submitLocation.mapName;
        quest.submitX = submitLocation.x;
        quest.submitY = submitLocation.y;
        quest.submitNpcName = submitLocation.name;
        changed = true;
      }
    }
    return changed;
  }

  getNpcInteractionState(player: PlayerState, npc: NpcConfig): NpcInteractionState {
    const readySubmitQuest = player.quests.find((entry) => (
      entry.status === 'ready'
      && this.isQuestSubmitNpc(entry, npc, player.mapId)
    ));
    if (readySubmitQuest) {
      return {
        quest: this.mapService.getQuest(readySubmitQuest.id),
        questState: readySubmitQuest,
        relation: 'submit',
      };
    }

    const activeTargetQuest = player.quests.find((entry) => (
      entry.status === 'active'
      && entry.objectiveType === 'talk'
      && this.isQuestTargetNpc(entry, npc, player.mapId)
    ));
    if (activeTargetQuest) {
      return {
        quest: this.mapService.getQuest(activeTargetQuest.id),
        questState: activeTargetQuest,
        relation: 'target',
      };
    }

    const currentMainQuestId = this.deps.getCurrentMainQuestId(player);
    if (currentMainQuestId) {
      const currentMainQuest = npc.quests.find((quest) => quest.id === currentMainQuestId);
      if (currentMainQuest) {
        const questState = player.quests.find((entry) => entry.id === currentMainQuest.id);
        if (questState && questState.status !== 'completed') {
          return { quest: currentMainQuest, questState, relation: 'giver' };
        }
        if (!questState) {
          return { quest: currentMainQuest, relation: 'giver' };
        }
      }
    }

    for (const quest of npc.quests) {
      if (quest.line === 'main' && currentMainQuestId && quest.id !== currentMainQuestId) {
        continue;
      }
      const questState = player.quests.find((entry) => entry.id === quest.id);
      if (questState && questState.status !== 'completed') {
        return { quest, questState, relation: 'giver' };
      }
      if (!questState) {
        const previousIncomplete = npc.quests
          .slice(0, npc.quests.indexOf(quest))
          .some((candidate) => player.quests.find((entry) => entry.id === candidate.id)?.status !== 'completed');
        if (!previousIncomplete) {
          return { quest, relation: 'giver' };
        }
        break;
      }
    }
    return {};
  }

  resolveNpcQuestMarker(player: PlayerState, npc: NpcConfig): NpcQuestMarker | undefined {
    const interaction = this.getNpcInteractionState(player, npc);
    if (interaction.quest && !interaction.questState && !this.getQuestAcceptRequirementText(player, interaction.quest)) {
      return { line: interaction.quest.line, state: 'available' };
    }
    if (interaction.questState?.status === 'ready') {
      return { line: interaction.questState.line, state: 'ready' };
    }
    if (interaction.questState?.status === 'active' && interaction.relation !== 'submit') {
      return { line: interaction.questState.line, state: 'active' };
    }
    return undefined;
  }

  getQuestAcceptRequirementText(player: PlayerState, quest: QuestConfig): string | null {
    const currentRealmLv = Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1));
    const currentStage = player.realm?.stage;
    if (quest.acceptRealmLv !== undefined && currentRealmLv < quest.acceptRealmLv) {
      return this.contentService.getRealmLevelEntry(quest.acceptRealmLv)?.displayName ?? `Lv.${quest.acceptRealmLv}`;
    }
    if (quest.acceptRealmStage !== undefined && (currentStage === undefined || currentStage < quest.acceptRealmStage)) {
      return this.contentService.getRealmStageStartEntry(quest.acceptRealmStage)?.displayName ?? '指定境界';
    }
    return null;
  }

  buildRewardItems(quest: QuestConfig): ItemStack[] {
    const rewards = quest.rewards.length > 0
      ? quest.rewards
      : quest.rewardItemIds.map((itemId) => ({
          itemId,
          name: itemId,
          type: 'material' as const,
          count: 1,
          chance: 1,
        }));
    return rewards
      .map((reward) => this.createItemFromDrop(reward))
      .filter((item): item is ItemStack => Boolean(item));
  }

  buildQuestStateRewards(quest: QuestState): ItemStack[] {
    if (quest.rewards?.length) {
      return quest.rewards
        .map((reward) => this.contentService.createItem(reward.itemId, reward.count))
        .filter((item): item is ItemStack => Boolean(item));
    }
    const rewardIds = quest.rewardItemIds?.length ? quest.rewardItemIds : [quest.rewardItemId];
    return rewardIds
      .map((itemId) => this.contentService.createItem(itemId))
      .filter((item): item is ItemStack => Boolean(item));
  }

  canReceiveItems(player: PlayerState, items: ItemStack[]): boolean {
    const simulated = player.inventory.items.map((item) => ({ ...item }));
    for (const item of items) {
      const signature = createItemStackSignature(item);
      const existing = simulated.find((entry) => createItemStackSignature(entry) === signature);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      if (simulated.length >= player.inventory.capacity) {
        return false;
      }
      simulated.push({ ...item });
    }
    return true;
  }

  createItemFromDrop(drop: DropConfig): ItemStack | null {
    return this.contentService.createItem(drop.itemId, drop.count);
  }

  rollMonsterDrops(killer: PlayerState, monster: RuntimeMonsterLike): ItemStack[] {
    const loots: ItemStack[] = [];
    for (const drop of monster.drops) {
      if (Math.random() > this.deps.getEffectiveDropChance(killer, monster, drop)) {
        continue;
      }
      const loot = this.createItemFromDrop(drop);
      if (loot) {
        loots.push(loot);
      }
    }
    return loots;
  }

  deliverMonsterLoot(
    player: PlayerState,
    monster: RuntimeMonsterLike,
    loot: ItemStack,
    killerId: string,
    dirty: Set<'inv' | 'quest' | 'actions' | 'tech' | 'attr' | 'loot'>,
    messages: Array<{ playerId: string; text: string; kind?: 'system' | 'quest' | 'combat' | 'loot' }>,
  ): void {
    if (this.inventoryService.addItem(player, loot)) {
      messages.push({
        playerId: player.id,
        text: `你获得了 ${loot.name} x${loot.count}。`,
        kind: 'loot',
      });
      if (player.id === killerId) {
        dirty.add('inv');
      } else {
        this.playerService.markDirty(player.id, 'inv');
      }
      return;
    }
    this.lootService.dropToGround(monster.mapId, monster.x, monster.y, loot);
    messages.push({
      playerId: player.id,
      text: `${loot.name} 分配给你时背包已满，已掉落在 (${monster.x}, ${monster.y}) 的地面上。`,
      kind: 'loot',
    });
  }

  consumeInventoryItem(
    player: PlayerState,
    itemId: string,
    count: number,
    errorMessage = '任务物品不足，暂时无法交付',
  ): string | null {
    let remaining = count;
    while (remaining > 0) {
      const slotIndex = this.inventoryService.findItem(player, itemId);
      if (slotIndex < 0) {
        return errorMessage;
      }
      const stack = this.inventoryService.getItem(player, slotIndex);
      if (!stack) {
        return errorMessage;
      }
      const removed = this.inventoryService.removeItem(player, slotIndex, remaining);
      if (!removed) {
        return errorMessage;
      }
      remaining -= removed.count;
    }
    return null;
  }

  getShopCurrencyItemName(): string {
    return this.contentService.getItem(MARKET_CURRENCY_ITEM_ID)?.name ?? '灵石';
  }

  getInventoryCount(player: PlayerState, itemId: string): number {
    return player.inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((total, item) => total + item.count, 0);
  }

  describeQuestProgress(player: PlayerState, questState: QuestState, questConfig?: QuestConfig): string {
    const objective = questState.objectiveText ?? questConfig?.objectiveText ?? questState.desc;
    const parts = [objective];
    switch (questState.objectiveType) {
      case 'talk':
        parts.push(questState.progress >= questState.required ? '口信已传达' : '尚未把口信带到');
        break;
      case 'submit_item':
        parts.push(`当前持有 ${questState.progress}/${questState.required}`);
        break;
      case 'learn_technique':
        parts.push(questState.progress >= questState.required
          ? `已参悟 ${questState.targetName}`
          : `尚未参悟 ${questState.targetName}`);
        break;
      case 'realm_stage':
        parts.push(questState.progress >= questState.required
          ? `已达到 ${questState.targetName}`
          : `尚未达到 ${questState.targetName}`);
        break;
      case 'realm_progress':
      case 'kill':
      default:
        parts.push(`当前进度 ${questState.progress}/${questState.required}`);
        break;
    }
    if (questConfig?.requiredItemId) {
      const itemName = this.contentService.getItem(questConfig.requiredItemId)?.name
        ?? (isLikelyInternalContentId(questConfig.requiredItemId) ? '任务物品' : questConfig.requiredItemId);
      const requiredItemCount = Math.max(1, questConfig.requiredItemCount ?? 1);
      const currentItemCount = Math.min(requiredItemCount, this.getInventoryCount(player, questConfig.requiredItemId));
      parts.push(`当前持有 ${itemName} ${currentItemCount}/${requiredItemCount}`);
    }
    return parts.join('，');
  }

  private isQuestTargetNpc(quest: QuestState, npc: NpcConfig, currentMapId: string): boolean {
    return quest.targetNpcId === npc.id
      && (!quest.targetMapId || quest.targetMapId === currentMapId);
  }

  private isQuestSubmitNpc(quest: QuestState, npc: NpcConfig, currentMapId: string): boolean {
    return quest.submitNpcId === npc.id
      && quest.submitMapId === currentMapId;
  }
}
