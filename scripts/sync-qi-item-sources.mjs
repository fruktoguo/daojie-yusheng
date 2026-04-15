#!/usr/bin/env node

/**
 * 用途：同步气类相关物品来源数据。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ITEMS_DIR = path.join(ROOT, 'legacy/server/data/content/items/练气期');
const MONSTERS_DIR = path.join(ROOT, 'legacy/server/data/content/monsters');

/**
 * 记录consumableassignments。
 */
const CONSUMABLE_ASSIGNMENTS = [
  { monsterId: 'm_cleft_blade_sprite', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_cleft_banner_general', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_cleft_stele_puppet', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_verdant_siphon_flower', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_verdant_wither_guard', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_cold_pattern_guard', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_cold_mirror_shade', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_cold_moonscale', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_ember_lizard', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_ember_attendant', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_ember_bone_patrol', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_deepvein_armor_spirit', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_deepvein_ridge_warden', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
  { monsterId: 'm_deepvein_stele_bearer', itemId: 'pill.breakmirror_pellet', chance: 0.01 },
];

/**
 * 汇总目标文件列表。
 */
const TARGET_FILES = ['裂锋原.json', '青萝谷.json', '寒汐泽.json', '赤陨庭.json', '厚脉岭.json', '归藏脉窟.json'];
/**
 * 记录specialconsumableswithchance。
 */
const SPECIAL_CONSUMABLES_WITH_CHANCE = new Set([
  'pill.shatter_spirit',
  'pill.wangsheng',
  'pill.ningxiang',
  'pill.breakmirror_pellet',
]);

/**
 * 读取json。
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 写入json。
 */
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * 确保drop。
 */
function ensureDrop(monster, item) {
/**
 * 记录drops。
 */
  const drops = Array.isArray(monster.drops) ? monster.drops : [];
  monster.drops = drops;
/**
 * 记录existing。
 */
  const existing = drops.find((drop) => drop?.itemId === item.itemId);
  if (existing) {
    if (Number.isFinite(item.chance)) {
      existing.chance = Math.max(0, Math.min(1, Number(item.chance)));
    } else {
      delete existing.chance;
    }
    return;
  }
/**
 * 记录nextdrop。
 */
  const nextDrop = {
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: 1,
  };
  if (Number.isFinite(item.chance)) {
    nextDrop.chance = Math.max(0, Math.min(1, Number(item.chance)));
  }
  drops.push(nextDrop);
}

/**
 * 处理stripdropchance。
 */
function stripDropChance(drop) {
  if (!drop || typeof drop !== 'object') {
    return drop;
  }
  if (drop.type === 'quest_item') {
    return drop;
  }
  if (typeof drop.itemId === 'string' && SPECIAL_CONSUMABLES_WITH_CHANCE.has(drop.itemId)) {
    return drop;
  }
/**
 * 记录next。
 */
  const next = { ...drop };
  delete next.chance;
  return next;
}

/**
 * 校验equipmentcoverage。
 */
function validateEquipmentCoverage(equipmentItems, monstersById) {
/**
 * 记录sourced物品ids。
 */
  const sourcedItemIds = new Set();

  for (const { monster } of monstersById.values()) {
    for (const equipped of Object.values(monster.equipment ?? {})) {
      if (equipped && typeof equipped.itemId === 'string' && equipped.itemId.trim()) {
        sourcedItemIds.add(equipped.itemId.trim());
      }
    }
    for (const drop of monster.drops ?? []) {
      if (drop?.type === 'equipment' && typeof drop.itemId === 'string' && drop.itemId.trim()) {
        sourcedItemIds.add(drop.itemId.trim());
      }
    }
  }

/**
 * 记录missing。
 */
  const missing = equipmentItems.filter((item) => !sourcedItemIds.has(item.itemId));
  if (missing.length > 0) {
    throw new Error(`仍有练气期装备缺少怪物来源：${missing.map((item) => item.itemId).join(', ')}`);
  }
}

/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 记录equipmentitems。
 */
  const equipmentItems = readJson(path.join(ITEMS_DIR, '装备.json'));
/**
 * 记录consumableitems。
 */
  const consumableItems = readJson(path.join(ITEMS_DIR, '消耗品.json'));
/**
 * 记录consumable物品ids。
 */
  const consumableItemIds = new Set(consumableItems.map((item) => item.itemId));
/**
 * 记录物品byID。
 */
  const itemById = new Map(consumableItems.map((item) => [item.itemId, item]));
/**
 * 记录monstersby文件。
 */
  const monstersByFile = new Map();
/**
 * 记录monstersbyID。
 */
  const monstersById = new Map();

  for (const fileName of TARGET_FILES) {
/**
 * 记录文件路径。
 */
    const filePath = path.join(MONSTERS_DIR, fileName);
/**
 * 记录monsters。
 */
    const monsters = readJson(filePath);
    monstersByFile.set(filePath, monsters);
    for (const monster of monsters) {
      monstersById.set(monster.id, { filePath, monsters, monster });
/**
 * 记录drops。
 */
      const drops = Array.isArray(monster.drops) ? monster.drops : [];
      monster.drops = drops
        .filter((drop) => {
          if (!drop || typeof drop.itemId !== 'string') {
            return false;
          }
          if (drop.itemId === 'spirit_stone') {
            return false;
          }
          if (consumableItemIds.has(drop.itemId)) {
            return false;
          }
          return true;
        })
        .map((drop) => stripDropChance(drop));
    }
  }

  for (const assignment of CONSUMABLE_ASSIGNMENTS) {
/**
 * 记录record。
 */
    const record = monstersById.get(assignment.monsterId);
    if (!record) {
      throw new Error(`未找到怪物：${assignment.monsterId}`);
    }
/**
 * 记录物品。
 */
    const item = itemById.get(assignment.itemId);
    if (!item) {
      throw new Error(`未找到物品：${assignment.itemId}`);
    }
    ensureDrop(record.monster, {
      ...item,
      chance: Number.isFinite(assignment.chance) ? assignment.chance : undefined,
    });
  }

  validateEquipmentCoverage(equipmentItems, monstersById);

  for (const [filePath, monsters] of monstersByFile.entries()) {
    writeJson(filePath, monsters);
  }

  process.stdout.write('已同步练气期装备与丹药掉落。\n');
}

main();
