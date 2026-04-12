import type { ItemStack, QuestState, S2C_QuestUpdate } from '@mud/shared';
import QUEST_CATALOG from '../constants/world/quest-catalog.generated.json';

/** LocalQuestTemplate：定义该类型的结构与数据语义。 */
type LocalQuestTemplate = Omit<QuestState, 'status' | 'progress' | 'rewards'> & {
  rewards: Array<Pick<ItemStack, 'itemId' | 'name' | 'type' | 'count'>>;
};

/** LocalQuestCatalog：定义该类型的结构与数据语义。 */
type LocalQuestCatalog = Record<string, LocalQuestTemplate>;

const localQuestCatalog = QUEST_CATALOG as unknown as LocalQuestCatalog;

/** clone：执行对应的业务逻辑。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** getLocalQuestTemplate：执行对应的业务逻辑。 */
export function getLocalQuestTemplate(questId: string): LocalQuestTemplate | null {
  const template = localQuestCatalog[questId];
  return template ? clone(template) : null;
}

/** hydrateQuestStates：执行对应的业务逻辑。 */
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

