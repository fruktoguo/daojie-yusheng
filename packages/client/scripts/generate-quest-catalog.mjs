import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientDir, '..', '..');
const questsDir = path.join(repoRoot, 'packages/server/data/content/quests');
const outputPath = path.join(clientDir, 'src/constants/world/quest-catalog.generated.json');

function walkJsonFiles(dirPath) {
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeReward(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const itemId = typeof entry.itemId === 'string' ? entry.itemId : '';
  const name = typeof entry.name === 'string' ? entry.name : itemId;
  const type = typeof entry.type === 'string' ? entry.type : 'material';
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

function normalizeQuest(rawQuest) {
  if (!rawQuest || typeof rawQuest !== 'object' || typeof rawQuest.id !== 'string' || typeof rawQuest.title !== 'string') {
    return null;
  }
  const rewards = Array.isArray(rawQuest.reward)
    ? rawQuest.reward.map((entry) => normalizeReward(entry)).filter(Boolean)
    : [];
  const rewardItemIds = rewards.map((entry) => entry.itemId);
  const rewardItemId = typeof rawQuest.rewardItemId === 'string'
    ? rawQuest.rewardItemId
    : (rewardItemIds[0] ?? '');
  const rewardText = typeof rawQuest.rewardText === 'string'
    ? rawQuest.rewardText
    : (rewards.length > 0
      ? rewards.map((entry) => `${entry.name} x${entry.count}`).join('、')
      : '无');
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

function buildQuestCatalog() {
  const catalog = {};
  for (const filePath of walkJsonFiles(questsDir)) {
    const document = readJson(filePath);
    for (const rawQuest of Array.isArray(document.quests) ? document.quests : []) {
      const quest = normalizeQuest(rawQuest);
      if (!quest) {
        continue;
      }
      catalog[quest.id] = quest;
    }
  }
  return catalog;
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
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
