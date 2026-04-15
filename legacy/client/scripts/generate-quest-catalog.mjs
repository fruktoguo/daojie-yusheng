/**
 * 用途：为 client 生成任务目录缓存。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 记录客户端包目录。
 */
const clientDir = path.resolve(__dirname, '..');
/**
 * 记录仓库根目录。
 */
const repoRoot = path.resolve(clientDir, '..', '..');
/**
 * 记录任务目录。
 */
const questsDir = path.join(repoRoot, 'legacy/server/data/content/quests');
/**
 * 记录输出文件路径。
 */
const outputPath = path.join(clientDir, 'src/constants/world/quest-catalog.generated.json');

/**
 * 递归遍历json文件列表。
 */
function walkJsonFiles(dirPath) {
/**
 * 汇总待处理文件列表。
 */
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
/**
 * 记录entry路径。
 */
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

/**
 * 读取json。
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 规范化奖励。
 */
function normalizeReward(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
/**
 * 记录物品ID。
 */
  const itemId = typeof entry.itemId === 'string' ? entry.itemId : '';
/**
 * 记录名称。
 */
  const name = typeof entry.name === 'string' ? entry.name : itemId;
/**
 * 记录type。
 */
  const type = typeof entry.type === 'string' ? entry.type : 'material';
/**
 * 记录数量。
 */
  const count = Number.isInteger(entry.count) ? Number(entry.count) : 1;
  if (!itemId) {
    return null;
  }
  return {
    itemId,
    name,
    type,
    count,
  };
}

/**
 * 规范化任务。
 */
function normalizeQuest(rawQuest) {
  if (!rawQuest || typeof rawQuest !== 'object' || typeof rawQuest.id !== 'string' || typeof rawQuest.title !== 'string') {
    return null;
  }
/**
 * 记录rewards。
 */
  const rewards = Array.isArray(rawQuest.reward)
    ? rawQuest.reward.map((entry) => normalizeReward(entry)).filter(Boolean)
    : [];
/**
 * 记录奖励物品ids。
 */
  const rewardItemIds = rewards.map((entry) => entry.itemId);
/**
 * 记录奖励物品ID。
 */
  const rewardItemId = typeof rawQuest.rewardItemId === 'string'
    ? rawQuest.rewardItemId
    : (rewardItemIds[0] ?? '');
/**
 * 记录奖励text。
 */
  const rewardText = typeof rawQuest.rewardText === 'string'
    ? rawQuest.rewardText
    : (rewards.length > 0
      ? rewards.map((entry) => `${entry.name} x${entry.count}`).join('、')
      : '无');
/**
 * 记录required。
 */
  const required = Number.isInteger(rawQuest.required)
    ? Number(rawQuest.required)
    : (Number.isInteger(rawQuest.targetCount) ? Number(rawQuest.targetCount) : 1);
  return {
    id: rawQuest.id,
    title: rawQuest.title,
    desc: typeof rawQuest.desc === 'string' ? rawQuest.desc : '',
    line: typeof rawQuest.line === 'string' ? rawQuest.line : 'side',
    chapter: typeof rawQuest.chapter === 'string' ? rawQuest.chapter : undefined,
    story: typeof rawQuest.story === 'string' ? rawQuest.story : undefined,
    objectiveType: typeof rawQuest.objectiveType === 'string' ? rawQuest.objectiveType : 'kill',
    objectiveText: typeof rawQuest.objectiveText === 'string' ? rawQuest.objectiveText : undefined,
    required,
    targetName: typeof rawQuest.targetName === 'string' ? rawQuest.targetName : rawQuest.title,
    targetTechniqueId: typeof rawQuest.targetTechniqueId === 'string' ? rawQuest.targetTechniqueId : undefined,
    targetRealmStage: Number.isInteger(rawQuest.targetRealmStage) ? Number(rawQuest.targetRealmStage) : undefined,
    rewardText,
    targetMonsterId: typeof rawQuest.targetMonsterId === 'string' ? rawQuest.targetMonsterId : '',
    rewardItemId,
    rewardItemIds,
    rewards,
    nextQuestId: typeof rawQuest.nextQuestId === 'string' ? rawQuest.nextQuestId : undefined,
    requiredItemId: typeof rawQuest.requiredItemId === 'string' ? rawQuest.requiredItemId : undefined,
    requiredItemCount: Number.isInteger(rawQuest.requiredItemCount) ? Number(rawQuest.requiredItemCount) : undefined,
    giverId: typeof rawQuest.giverNpcId === 'string' ? rawQuest.giverNpcId : '',
    giverName: typeof rawQuest.giverNpcName === 'string' ? rawQuest.giverNpcName : '',
    giverMapId: typeof rawQuest.giverMapId === 'string' ? rawQuest.giverMapId : undefined,
    giverMapName: typeof rawQuest.giverMapName === 'string' ? rawQuest.giverMapName : undefined,
    targetMapId: typeof rawQuest.targetMapId === 'string' ? rawQuest.targetMapId : undefined,
    targetMapName: typeof rawQuest.targetMapName === 'string' ? rawQuest.targetMapName : undefined,
    targetX: Number.isInteger(rawQuest.targetX) ? Number(rawQuest.targetX) : undefined,
    targetY: Number.isInteger(rawQuest.targetY) ? Number(rawQuest.targetY) : undefined,
    targetNpcId: typeof rawQuest.targetNpcId === 'string' ? rawQuest.targetNpcId : undefined,
    targetNpcName: typeof rawQuest.targetNpcName === 'string' ? rawQuest.targetNpcName : undefined,
    submitNpcId: typeof rawQuest.submitNpcId === 'string' ? rawQuest.submitNpcId : undefined,
    submitNpcName: typeof rawQuest.submitNpcName === 'string' ? rawQuest.submitNpcName : undefined,
    submitMapId: typeof rawQuest.submitMapId === 'string' ? rawQuest.submitMapId : undefined,
    submitMapName: typeof rawQuest.submitMapName === 'string' ? rawQuest.submitMapName : undefined,
    submitX: Number.isInteger(rawQuest.submitX) ? Number(rawQuest.submitX) : undefined,
    submitY: Number.isInteger(rawQuest.submitY) ? Number(rawQuest.submitY) : undefined,
    relayMessage: typeof rawQuest.relayMessage === 'string' ? rawQuest.relayMessage : undefined,
  };
}

/**
 * 构建任务目录。
 */
function buildQuestCatalog() {
/**
 * 记录目录。
 */
  const catalog = {};
  for (const filePath of walkJsonFiles(questsDir)) {
/**
 * 记录文档。
 */
    const document = readJson(filePath);
    for (const rawQuest of Array.isArray(document.quests) ? document.quests : []) {
/**
 * 记录任务。
 */
      const quest = normalizeQuest(rawQuest);
      if (!quest) {
        continue;
      }
      catalog[quest.id] = quest;
    }
  }
  return catalog;
}

/**
 * 写入ifchanged。
 */
function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
/**
 * 记录当前值。
 */
    const current = fs.readFileSync(filePath, 'utf8');
    if (current === content) {
      console.log('quest-catalog.generated.json 无变更');
      return;
    }
  }
  fs.writeFileSync(filePath, content);
  console.log(`已写入 ${path.relative(repoRoot, filePath)}`);
}

writeIfChanged(outputPath, `${JSON.stringify(buildQuestCatalog(), null, 2)}\n`);
