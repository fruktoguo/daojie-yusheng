"use strict";

const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..", "..");
const contentRoot = path.join(packageRoot, "data", "content");
const mapsRoot = path.join(packageRoot, "data", "maps");

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
  return { techniqueIds, skillIds, duplicates };
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

function validateMonsterRefs(errors, itemIds, skillIds) {
  const monsters = loadArrayDirectory("monsters");
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

function validateItemRefs(errors, items, mapIds) {
  for (const item of items) {
    const itemId = typeof item?.itemId === "string" ? item.itemId : "unknown-item";
    if (typeof item?.mapUnlockId === "string" && !mapIds.has(item.mapUnlockId)) {
      errors.push(`${itemId}: mapUnlockId 不存在 -> ${item.mapUnlockId}`);
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

function main() {
  const errors = [];
  const { items, ids: itemIds, duplicates: itemDuplicates } = collectItemIds();
  const { skillIds, duplicates: techniqueDuplicates } = collectTechniqueSkillIds();
  const mapIds = collectMapIds();

  errors.push(...itemDuplicates, ...techniqueDuplicates);
  validateMonsterRefs(errors, itemIds, skillIds);
  validateItemRefs(errors, items, mapIds);
  validateBreakthroughRefs(errors, itemIds);
  validateResourceNodeRefs(errors, itemIds);

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
  process.stdout.write(`- checked skill ids: ${skillIds.size}\n`);
  process.stdout.write("- validated monster drops/equipment/skills, item map unlocks, breakthrough item refs, resource-node item refs\n");
}

main();
