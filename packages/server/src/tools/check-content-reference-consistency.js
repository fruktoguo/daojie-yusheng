"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ELEMENT_KEYS, NUMERIC_STATS_KEYS } = require("@mud/shared-next");

const packageRoot = path.resolve(__dirname, "..", "..");
const contentRoot = path.join(packageRoot, "data", "content");
const mapsRoot = path.join(packageRoot, "data", "maps");
const numericScalarStatKeys = new Set(NUMERIC_STATS_KEYS.filter((key) => key !== "elementDamageBonus" && key !== "elementDamageReduce"));
const elementKeys = new Set(ELEMENT_KEYS);

function walkJsonFiles(dirPath, result = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(absolutePath, result);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      result.push(absolutePath);
    }
  }
  return result;
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(packageRoot, relativePath), "utf8"));
}

function loadArrayDirectory(relativeDir) {
  const baseDir = path.join(contentRoot, relativeDir);
  return walkJsonFiles(baseDir).flatMap((filePath) => {
    const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(entries) ? entries : [];
  });
}

function collectItemIds() {
  const items = loadArrayDirectory("items");
  const ids = new Set();
  const duplicates = [];
  for (const item of items) {
    if (typeof item?.itemId !== "string") {
      continue;
    }
    if (ids.has(item.itemId)) {
      duplicates.push(`重复 itemId: ${item.itemId}`);
      continue;
    }
    ids.add(item.itemId);
  }
  return { items, ids, duplicates };
}

function collectMonsterIds() {
  const monsters = loadArrayDirectory("monsters");
  const ids = new Set();
  const duplicates = [];
  for (const monster of monsters) {
    if (typeof monster?.id !== "string") {
      continue;
    }
    if (ids.has(monster.id)) {
      duplicates.push(`重复 monster id: ${monster.id}`);
      continue;
    }
    ids.add(monster.id);
  }
  return { monsters, ids, duplicates };
}

function collectTechniqueSkillIds() {
  const techniques = loadArrayDirectory("techniques");
  const techniqueIds = new Set();
  const skillIds = new Set();
  const duplicates = [];
  for (const technique of techniques) {
    if (typeof technique?.id === "string") {
      if (techniqueIds.has(technique.id)) {
        duplicates.push(`重复 technique id: ${technique.id}`);
      }
      techniqueIds.add(technique.id);
    }
    for (const skill of technique?.skills ?? []) {
      if (typeof skill?.id !== "string") {
        continue;
      }
      if (skillIds.has(skill.id)) {
        duplicates.push(`重复 skill id: ${skill.id}`);
        continue;
      }
      skillIds.add(skill.id);
    }
  }
  return { techniques, techniqueIds, skillIds, duplicates };
}

function collectTechniqueBuffIds() {
  const buffs = loadArrayDirectory("technique-buffs");
  const buffRefs = new Set();
  const duplicates = [];
  for (const buff of buffs) {
    if (typeof buff?.id !== "string") {
      continue;
    }
    if (buffRefs.has(buff.id)) {
      duplicates.push(`重复 technique buff id: ${buff.id}`);
      continue;
    }
    buffRefs.add(buff.id);
  }
  return { buffs, buffRefs, duplicates };
}

function collectQuestIds() {
  const questFiles = walkJsonFiles(path.join(contentRoot, "quests")).map((filePath) => ({
    filePath,
    relativePath: path.relative(packageRoot, filePath),
    payload: JSON.parse(fs.readFileSync(filePath, "utf8")),
  }));
  const questIds = new Set();
  const duplicates = [];
  for (const questFile of questFiles) {
    for (const quest of questFile.payload?.quests ?? []) {
      if (typeof quest?.id !== "string") {
        continue;
      }
      if (questIds.has(quest.id)) {
        duplicates.push(`重复 quest id: ${quest.id} @ ${questFile.relativePath}`);
        continue;
      }
      questIds.add(quest.id);
    }
  }
  return { questFiles, questIds, duplicates };
}

function collectMapIds() {
  const ids = new Set();
  for (const filePath of walkJsonFiles(mapsRoot)) {
    const map = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof map?.id === "string") {
      ids.add(map.id);
    }
  }
  return ids;
}

function collectMapRefs() {
  const mapIds = new Set();
  const npcIds = new Set();
  const monsterIds = new Set();
  const npcIdsByMap = new Map();
  const monsterIdsByMap = new Map();
  for (const filePath of walkJsonFiles(mapsRoot)) {
    const map = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof map?.id !== "string") {
      continue;
    }
    mapIds.add(map.id);
    const mapNpcIds = new Set();
    for (const npc of map.npcs ?? []) {
      if (typeof npc?.id !== "string") {
        continue;
      }
      mapNpcIds.add(npc.id);
      npcIds.add(npc.id);
    }
    npcIdsByMap.set(map.id, mapNpcIds);
    const mapMonsterIds = new Set();
    for (const monster of map.monsterSpawns ?? []) {
      const monsterTemplateId = typeof monster?.templateId === "string"
        ? monster.templateId
        : (typeof monster?.id === "string" ? monster.id : null);
      if (!monsterTemplateId) {
        continue;
      }
      mapMonsterIds.add(monsterTemplateId);
      monsterIds.add(monsterTemplateId);
    }
    monsterIdsByMap.set(map.id, mapMonsterIds);
  }
  return { mapIds, npcIds, monsterIds, npcIdsByMap, monsterIdsByMap };
}

function validatePartialNumericStats(errors, label, stats) {
  if (!stats || typeof stats !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(stats)) {
    if (key === "elementDamageBonus" || key === "elementDamageReduce") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${label}: ${key} 必须是元素数值对象`);
        continue;
      }
      for (const [elementKey, elementValue] of Object.entries(value)) {
        if (!elementKeys.has(elementKey)) {
          errors.push(`${label}: ${key} 包含非法元素键 -> ${elementKey}`);
          continue;
        }
        if (typeof elementValue !== "number" || !Number.isFinite(elementValue)) {
          errors.push(`${label}: ${key}.${elementKey} 必须是有限数字`);
        }
      }
      continue;
    }
    if (!numericScalarStatKeys.has(key)) {
      errors.push(`${label}: 包含非法数值键 -> ${key}`);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${label}: ${key} 必须是有限数字`);
    }
  }
}

function validateMonsterRefs(errors, monsters, itemIds, skillIds) {
  for (const monster of monsters) {
    const monsterId = typeof monster?.id === "string" ? monster.id : "unknown-monster";
    for (const drop of monster?.drops ?? []) {
      if (typeof drop?.itemId === "string" && !itemIds.has(drop.itemId)) {
        errors.push(`${monsterId}: drop itemId 不存在 -> ${drop.itemId}`);
      }
    }
    for (const equipmentId of Object.values(monster?.equipment ?? {})) {
      if (typeof equipmentId === "string" && !itemIds.has(equipmentId)) {
        errors.push(`${monsterId}: equipment itemId 不存在 -> ${equipmentId}`);
      }
    }
    for (const skillId of monster?.skills ?? []) {
      if (typeof skillId === "string" && !skillIds.has(skillId)) {
        errors.push(`${monsterId}: skill 引用不存在 -> ${skillId}`);
      }
    }
  }
}

function validateItemRefs(errors, items, refs) {
  for (const item of items) {
    const itemId = typeof item?.itemId === "string" ? item.itemId : "unknown-item";
    if (typeof item?.mapUnlockId === "string" && !refs.mapIds.has(item.mapUnlockId)) {
      errors.push(`${itemId}: mapUnlockId 不存在 -> ${item.mapUnlockId}`);
    }
    for (const mapUnlockId of item?.mapUnlockIds ?? []) {
      if (typeof mapUnlockId === "string" && !refs.mapIds.has(mapUnlockId)) {
        errors.push(`${itemId}: mapUnlockIds 包含不存在的地图 -> ${mapUnlockId}`);
      }
    }
    if (typeof item?.learnTechniqueId === "string" && !refs.techniqueIds.has(item.learnTechniqueId)) {
      errors.push(`${itemId}: learnTechniqueId 不存在 -> ${item.learnTechniqueId}`);
    }
    for (const buff of item?.consumeBuffs ?? []) {
      const buffLabel = `${itemId}: consumeBuffs.${typeof buff?.buffId === "string" ? buff.buffId : "unknown-buff"}`;
      if (buff?.valueStats) {
        validatePartialNumericStats(errors, `${buffLabel}.valueStats`, buff.valueStats);
      }
    }
    for (const effect of item?.effects ?? []) {
      const effectLabel = `${itemId}: effect.${typeof effect?.effectId === "string" ? effect.effectId : "unknown-effect"}`;
      if (effect?.valueStats) {
        validatePartialNumericStats(errors, `${effectLabel}.valueStats`, effect.valueStats);
      }
      if (effect?.stats) {
        validatePartialNumericStats(errors, `${effectLabel}.stats`, effect.stats);
      }
      if (effect?.buff?.valueStats) {
        validatePartialNumericStats(errors, `${effectLabel}.buff.valueStats`, effect.buff.valueStats);
      }
    }
  }
}

function validateBreakthroughRefs(errors, itemIds) {
  const breakthroughs = loadJson("data/content/breakthroughs.json");
  for (const transition of breakthroughs?.transitions ?? []) {
    for (const requirement of transition?.requirements ?? []) {
      if (requirement?.type === "item" && typeof requirement.itemId === "string" && !itemIds.has(requirement.itemId)) {
        errors.push(`breakthrough ${transition.fromRealmLv}->${transition.toRealmLv}: item requirement 不存在 -> ${requirement.itemId}`);
      }
    }
  }
}

function validateResourceNodeRefs(errors, itemIds) {
  const resourceNodes = loadJson("data/content/resource-nodes.json").resourceNodes ?? [];
  for (const node of resourceNodes) {
    const nodeId = typeof node?.id === "string" ? node.id : "unknown-resource-node";
    if (typeof node?.itemId === "string" && !itemIds.has(node.itemId)) {
      errors.push(`${nodeId}: itemId 不存在 -> ${node.itemId}`);
    }
    for (const drop of node?.container?.drops ?? []) {
      if (typeof drop?.itemId === "string" && !itemIds.has(drop.itemId)) {
        errors.push(`${nodeId}: container drop itemId 不存在 -> ${drop.itemId}`);
      }
    }
  }
}

function validateAlchemyRefs(errors, itemIds) {
  const recipes = loadJson("data/content/alchemy/recipes.json");
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const recipeId = typeof recipe?.recipeId === "string" ? recipe.recipeId : "unknown-alchemy-recipe";
    if (typeof recipe?.outputItemId === "string" && !itemIds.has(recipe.outputItemId)) {
      errors.push(`${recipeId}: outputItemId 不存在 -> ${recipe.outputItemId}`);
    }
    for (const ingredient of recipe?.ingredients ?? []) {
      if (typeof ingredient?.itemId === "string" && !itemIds.has(ingredient.itemId)) {
        errors.push(`${recipeId}: ingredient itemId 不存在 -> ${ingredient.itemId}`);
      }
    }
  }
}

function validateEnhancementRefs(errors, itemIds) {
  const enhancementsDir = path.join(contentRoot, "enhancements");
  for (const filePath of walkJsonFiles(enhancementsDir)) {
    const relativePath = path.relative(packageRoot, filePath);
    const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const entry of Array.isArray(entries) ? entries : []) {
      const targetItemId = typeof entry?.targetItemId === "string" ? entry.targetItemId : "unknown-enhancement-target";
      if (typeof entry?.targetItemId === "string" && !itemIds.has(entry.targetItemId)) {
        errors.push(`${relativePath}: enhancement targetItemId 不存在 -> ${entry.targetItemId}`);
      }
      for (const step of entry?.steps ?? []) {
        if (!Number.isInteger(step?.targetEnhanceLevel) || step.targetEnhanceLevel <= 0) {
          errors.push(`${relativePath}: ${targetItemId} 含非法 targetEnhanceLevel -> ${step?.targetEnhanceLevel}`);
        }
      }
    }
  }
}

function validateTechniqueRefs(errors, techniques, buffRefs) {
  for (const technique of techniques) {
    const techniqueId = typeof technique?.id === "string" ? technique.id : "unknown-technique";
    for (const skill of technique?.skills ?? []) {
      const skillId = typeof skill?.id === "string" ? skill.id : `${techniqueId}:unknown-skill`;
      for (const effect of skill?.effects ?? []) {
        if (effect?.type === "buff" && typeof effect?.buffRef === "string" && !buffRefs.has(effect.buffRef)) {
          errors.push(`${techniqueId}/${skillId}: buffRef 不存在 -> ${effect.buffRef}`);
        }
        if (effect?.stats) {
          validatePartialNumericStats(errors, `${techniqueId}/${skillId}: effect.stats`, effect.stats);
        }
        if (effect?.valueStats) {
          validatePartialNumericStats(errors, `${techniqueId}/${skillId}: effect.valueStats`, effect.valueStats);
        }
      }
    }
  }
}

function validateTechniqueBuffRefs(errors, buffs) {
  for (const buff of buffs) {
    const buffId = typeof buff?.id === "string" ? buff.id : "unknown-technique-buff";
    if (buff?.valueStats) {
      validatePartialNumericStats(errors, `${buffId}: valueStats`, buff.valueStats);
    }
  }
}

function validateMapMonsterRefs(errors, mapRefs, monsterIds) {
  for (const [mapId, mapMonsterIds] of mapRefs.monsterIdsByMap.entries()) {
    for (const monsterId of mapMonsterIds) {
      if (!monsterIds.has(monsterId)) {
        errors.push(`${mapId}: monsterSpawns 引用了不存在的 monster -> ${monsterId}`);
      }
    }
  }
}

function validateQuestRefs(errors, questFiles, refs) {
  for (const questFile of questFiles) {
    for (const quest of questFile.payload?.quests ?? []) {
      const questId = typeof quest?.id === "string" ? quest.id : `unknown-quest@${questFile.relativePath}`;
      const label = `${questId} @ ${questFile.relativePath}`;

      if (typeof quest?.nextQuestId === "string" && !refs.questIds.has(quest.nextQuestId)) {
        errors.push(`${label}: nextQuestId 不存在 -> ${quest.nextQuestId}`);
      }
      if (typeof quest?.requiredItemId === "string" && !refs.itemIds.has(quest.requiredItemId)) {
        errors.push(`${label}: requiredItemId 不存在 -> ${quest.requiredItemId}`);
      }
      if (typeof quest?.targetTechniqueId === "string" && !refs.techniqueIds.has(quest.targetTechniqueId)) {
        errors.push(`${label}: targetTechniqueId 不存在 -> ${quest.targetTechniqueId}`);
      }
      if (typeof quest?.targetMonsterId === "string" && !refs.monsterIds.has(quest.targetMonsterId)) {
        errors.push(`${label}: targetMonsterId 不存在 -> ${quest.targetMonsterId}`);
      }
      for (const reward of quest?.reward ?? []) {
        if (typeof reward?.itemId === "string" && !refs.itemIds.has(reward.itemId)) {
          errors.push(`${label}: reward itemId 不存在 -> ${reward.itemId}`);
        }
      }

      for (const [fieldName, mapId] of [
        ["targetMapId", quest?.targetMapId],
        ["giverMapId", quest?.giverMapId],
        ["submitMapId", quest?.submitMapId],
      ]) {
        if (typeof mapId === "string" && !refs.mapIds.has(mapId)) {
          errors.push(`${label}: ${fieldName} 不存在 -> ${mapId}`);
        }
      }

      if (typeof quest?.targetNpcId === "string" && !refs.npcIds.has(quest.targetNpcId)) {
        errors.push(`${label}: targetNpcId 不存在 -> ${quest.targetNpcId}`);
      }
      if (typeof quest?.giverNpcId === "string" && !refs.npcIds.has(quest.giverNpcId)) {
        errors.push(`${label}: giverNpcId 不存在 -> ${quest.giverNpcId}`);
      }
      if (typeof quest?.submitNpcId === "string" && !refs.npcIds.has(quest.submitNpcId)) {
        errors.push(`${label}: submitNpcId 不存在 -> ${quest.submitNpcId}`);
      }

      if (typeof quest?.targetMapId === "string" && typeof quest?.targetNpcId === "string") {
        const npcIdsOnMap = refs.npcIdsByMap.get(quest.targetMapId) ?? new Set();
        if (!npcIdsOnMap.has(quest.targetNpcId)) {
          errors.push(`${label}: targetNpcId ${quest.targetNpcId} 不在 targetMapId ${quest.targetMapId} 上`);
        }
      }
      if (typeof quest?.giverMapId === "string" && typeof quest?.giverNpcId === "string") {
        const npcIdsOnMap = refs.npcIdsByMap.get(quest.giverMapId) ?? new Set();
        if (!npcIdsOnMap.has(quest.giverNpcId)) {
          errors.push(`${label}: giverNpcId ${quest.giverNpcId} 不在 giverMapId ${quest.giverMapId} 上`);
        }
      }
      if (typeof quest?.submitMapId === "string" && typeof quest?.submitNpcId === "string") {
        const npcIdsOnMap = refs.npcIdsByMap.get(quest.submitMapId) ?? new Set();
        if (!npcIdsOnMap.has(quest.submitNpcId)) {
          errors.push(`${label}: submitNpcId ${quest.submitNpcId} 不在 submitMapId ${quest.submitMapId} 上`);
        }
      }
      if (typeof quest?.targetMapId === "string" && typeof quest?.targetMonsterId === "string") {
        const monsterIdsOnMap = refs.monsterIdsByMap.get(quest.targetMapId) ?? new Set();
        if (!monsterIdsOnMap.has(quest.targetMonsterId)) {
          errors.push(`${label}: targetMonsterId ${quest.targetMonsterId} 不在 targetMapId ${quest.targetMapId} 的 monsterSpawns 上`);
        }
      }
    }
  }
}

function main() {
  const errors = [];
  const { items, ids: itemIds, duplicates: itemDuplicates } = collectItemIds();
  const { monsters, ids: monsterIds, duplicates: monsterDuplicates } = collectMonsterIds();
  const { techniques, techniqueIds, skillIds, duplicates: techniqueDuplicates } = collectTechniqueSkillIds();
  const { buffs: techniqueBuffs, buffRefs: techniqueBuffRefs, duplicates: techniqueBuffDuplicates } = collectTechniqueBuffIds();
  const { questFiles, questIds, duplicates: questDuplicates } = collectQuestIds();
  const mapRefs = collectMapRefs();

  errors.push(...itemDuplicates, ...monsterDuplicates, ...techniqueDuplicates, ...techniqueBuffDuplicates, ...questDuplicates);
  validateMonsterRefs(errors, monsters, itemIds, skillIds);
  validateMapMonsterRefs(errors, mapRefs, monsterIds);
  validateItemRefs(errors, items, {
    mapIds: mapRefs.mapIds,
    techniqueIds,
  });
  validateBreakthroughRefs(errors, itemIds);
  validateResourceNodeRefs(errors, itemIds);
  validateAlchemyRefs(errors, itemIds);
  validateEnhancementRefs(errors, itemIds);
  validateTechniqueRefs(errors, techniques, techniqueBuffRefs);
  validateTechniqueBuffRefs(errors, techniqueBuffs);
  validateQuestRefs(errors, questFiles, {
    questIds,
    itemIds,
    techniqueIds,
    mapIds: mapRefs.mapIds,
    npcIds: mapRefs.npcIds,
    monsterIds,
    npcIdsByMap: mapRefs.npcIdsByMap,
    monsterIdsByMap: mapRefs.monsterIdsByMap,
  });

  if (errors.length > 0) {
    process.stderr.write("[content reference consistency] failed\n");
    for (const error of errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[content reference consistency] passed\n");
  process.stdout.write(`- checked items: ${itemIds.size}\n`);
  process.stdout.write(`- checked monster ids: ${monsterIds.size}\n`);
  process.stdout.write(`- checked quest ids: ${questIds.size}\n`);
  process.stdout.write(`- checked technique ids: ${techniqueIds.size}\n`);
  process.stdout.write(`- checked technique buff ids: ${techniqueBuffRefs.size}\n`);
  process.stdout.write(`- checked skill ids: ${skillIds.size}\n`);
  process.stdout.write("- validated monster drops/equipment/skills, map monster spawns, item external refs, breakthrough item refs, resource-node item refs, alchemy/enhancement refs, quest refs, technique buff refs, buff numeric stat keys\n");
}

main();
