#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ITEMS_DIR = path.join(ROOT, 'packages/server/data/content/items/练气期');
const MONSTERS_DIR = path.join(ROOT, 'packages/server/data/content/monsters');

const CONSUMABLE_ASSIGNMENTS = [
  { monsterId: 'm_cleft_blade_wraith', itemId: 'pill.edge_quenching_powder' },
  { monsterId: 'm_cleft_banner_general', itemId: 'pill.edge_quenching_powder' },
  { monsterId: 'm_cleft_gate_lord', itemId: 'pill.edge_quenching_powder' },
  { monsterId: 'm_verdant_lesser_sprite', itemId: 'pill.nurturing_paste' },
  { monsterId: 'm_verdant_wither_guard', itemId: 'pill.nurturing_paste' },
  { monsterId: 'm_verdant_vein_mother', itemId: 'pill.nurturing_paste' },
  { monsterId: 'm_cold_tide_sprite', itemId: 'pill.cleartide_powder' },
  { monsterId: 'm_cold_bridge_patrol', itemId: 'pill.cleartide_powder' },
  { monsterId: 'm_cold_abyss_drake', itemId: 'pill.cleartide_powder' },
  { monsterId: 'm_ember_moth', itemId: 'pill.chiyang_draught' },
  { monsterId: 'm_ember_flame_guard', itemId: 'pill.chiyang_draught' },
  { monsterId: 'm_ember_furnace_lord', itemId: 'pill.chiyang_draught' },
  { monsterId: 'm_deepvein_croc', itemId: 'pill.earthrest_paste' },
  { monsterId: 'm_deepvein_ridge_warden', itemId: 'pill.earthrest_paste' },
  { monsterId: 'm_deepvein_earth_effigy', itemId: 'pill.earthrest_paste' },
  { monsterId: 'm_guizang_fivephase_effigy', itemId: 'pill.fivephase_harmony_pellet' },
  { monsterId: 'm_guizang_dualphase_beast', itemId: 'pill.fivephase_harmony_pellet' },
  { monsterId: 'm_guizang_failed_foundation', itemId: 'pill.fivephase_harmony_pellet' },
];

const TARGET_FILES = ['裂锋原.json', '青萝谷.json', '寒汐泽.json', '赤陨庭.json', '厚脉岭.json', '归藏脉窟.json'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureDrop(monster, item) {
  const drops = Array.isArray(monster.drops) ? monster.drops : [];
  monster.drops = drops;
  if (drops.some((drop) => drop?.itemId === item.itemId)) {
    return;
  }
  drops.push({
    itemId: item.itemId,
    name: item.name,
    type: item.type,
    count: 1,
  });
}

function stripDropChance(drop) {
  if (!drop || typeof drop !== 'object') {
    return drop;
  }
  if (drop.type === 'quest_item') {
    return drop;
  }
  const next = { ...drop };
  delete next.chance;
  return next;
}

function validateEquipmentCoverage(equipmentItems, monstersById) {
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

  const missing = equipmentItems.filter((item) => !sourcedItemIds.has(item.itemId));
  if (missing.length > 0) {
    throw new Error(`仍有练气期装备缺少怪物来源：${missing.map((item) => item.itemId).join(', ')}`);
  }
}

function main() {
  const equipmentItems = readJson(path.join(ITEMS_DIR, '装备.json'));
  const consumableItems = readJson(path.join(ITEMS_DIR, '消耗品.json'));
  const consumableItemIds = new Set(consumableItems.map((item) => item.itemId));
  const itemById = new Map(consumableItems.map((item) => [item.itemId, item]));
  const monstersByFile = new Map();
  const monstersById = new Map();

  for (const fileName of TARGET_FILES) {
    const filePath = path.join(MONSTERS_DIR, fileName);
    const monsters = readJson(filePath);
    monstersByFile.set(filePath, monsters);
    for (const monster of monsters) {
      monstersById.set(monster.id, { filePath, monsters, monster });
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
    const record = monstersById.get(assignment.monsterId);
    if (!record) {
      throw new Error(`未找到怪物：${assignment.monsterId}`);
    }
    const item = itemById.get(assignment.itemId);
    if (!item) {
      throw new Error(`未找到物品：${assignment.itemId}`);
    }
    ensureDrop(record.monster, item);
  }

  validateEquipmentCoverage(equipmentItems, monstersById);

  for (const [filePath, monsters] of monstersByFile.entries()) {
    writeJson(filePath, monsters);
  }

  process.stdout.write('已同步练气期装备与丹药掉落。\n');
}

main();
