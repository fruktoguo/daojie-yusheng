import type { ItemStack, QuestState, S2C_QuestUpdate } from '@mud/shared';
import QUEST_CATALOG from '../constants/world/quest-catalog.generated.json';

type LocalQuestTemplate = Omit<QuestState, 'status' | 'progress' | 'rewards'> & {
  rewards: Array<Pick<ItemStack, 'itemId' | 'name' | 'type' | 'count'>>;
};

type LocalQuestCatalog = Record<string, LocalQuestTemplate>;

const localQuestCatalog = QUEST_CATALOG as unknown as LocalQuestCatalog;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getLocalQuestTemplate(questId: string): LocalQuestTemplate | null {
  const template = localQuestCatalog[questId];
  return template ? clone(template) : null;
}

export function hydrateQuestStates(entries: S2C_QuestUpdate['quests']): QuestState[] {
  return entries.map((entry) => {
    const template = getLocalQuestTemplate(entry.id);
    if (!template) {
      return {
        id: entry.id,
        title: entry.id,
        desc: '',
        line: 'side',
        status: entry.status,
        objectiveType: 'kill',
        progress: entry.progress,
        required: 1,
        targetName: entry.id,
        rewardText: '无',
        targetMonsterId: '',
        rewardItemId: '',
        rewardItemIds: [],
        rewards: [],
        giverId: '',
        giverName: '',
      };
    }
    return {
      ...template,
      rewards: template.rewards.map((reward) => ({
        itemId: reward.itemId,
        name: reward.name,
        type: reward.type,
        count: reward.count,
        desc: '',
      })),
      status: entry.status,
      progress: entry.progress,
    };
  });
}
