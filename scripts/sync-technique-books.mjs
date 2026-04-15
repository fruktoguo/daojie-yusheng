#!/usr/bin/env node

/**
 * 用途：同步功法秘籍物品与功法内容的对应关系。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ITEMS_ROOT = path.join(ROOT, 'packages/server/data/content/items');
const TECHNIQUES_ROOT = path.join(ROOT, 'packages/server/data/content/techniques/练气期');
/**
 * 记录monsters根目录。
 */
const MONSTERS_ROOT = path.join(ROOT, 'packages/server/data/content/monsters');

/**
 * 记录品阶order。
 */
const GRADE_ORDER = ['yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];
/**
 * 记录类别order。
 */
const CATEGORY_ORDER = ['arts', 'internal', 'body', 'movement', 'divine', 'secret', 'other'];
/**
 * 记录bookassignments。
 */
const BOOK_ASSIGNMENTS = [
  ['m_cleft_blade_wraith', 'genghua_ningfeng'],
  ['m_cleft_blade_wraith', 'jinluo_lifeng'],
  ['m_cleft_sand_soldier', 'jinluo_lifeng'],
  ['m_cleft_sand_soldier', 'genghua_ningfeng'],
  ['m_cleft_blade_sprite', 'genghua_ningfeng'],
  ['m_cleft_blade_sprite', 'jinluo_lifeng'],
  ['m_cleft_blade_sprite', 'duanjin_zhuixing'],
  ['m_verdant_lesser_sprite', 'qingmu_yangmai'],
  ['m_verdant_lesser_sprite', 'qingteng_huixi'],
  ['m_verdant_parasitic_child', 'qingteng_huixi'],
  ['m_verdant_parasitic_child', 'qingmu_yangmai'],
  ['m_verdant_siphon_flower', 'qingmu_yangmai'],
  ['m_verdant_siphon_flower', 'qingteng_huixi'],
  ['m_verdant_siphon_flower', 'manzhi_jiaoluo'],
  ['m_cold_tide_sprite', 'hanxi_ximai'],
  ['m_cold_tide_sprite', 'ningchao_hushen'],
  ['m_cold_marsh_wraith', 'ningchao_hushen'],
  ['m_cold_marsh_wraith', 'hanxi_ximai'],
  ['m_cold_pattern_guard', 'hanxi_ximai'],
  ['m_cold_pattern_guard', 'ningchao_hushen'],
  ['m_cold_pattern_guard', 'xuanjing_luoyin'],
  ['m_ember_moth', 'liyan_duanxi'],
  ['m_ember_moth', 'chiqi_ranqiao'],
  ['m_ember_whelp', 'chiqi_ranqiao'],
  ['m_ember_whelp', 'liyan_duanxi'],
  ['m_ember_lizard', 'liyan_duanxi'],
  ['m_ember_lizard', 'chiqi_ranqiao'],
  ['m_ember_lizard', 'yaohuo_liebo'],
  ['m_deepvein_croc', 'houtu_chengyuan'],
  ['m_deepvein_croc', 'zhenyue_huyuan'],
  ['m_deepvein_stonebound', 'zhenyue_huyuan'],
  ['m_deepvein_stonebound', 'houtu_chengyuan'],
  ['m_deepvein_armor_spirit', 'houtu_chengyuan'],
  ['m_deepvein_armor_spirit', 'zhenyue_huyuan'],
  ['m_deepvein_armor_spirit', 'dimai_fumai'],
  ['m_guizang_tangled_wisp', 'tingmai_dingxi'],
  ['m_guizang_reflux_attendant', 'guicang_hemai'],
  ['m_cleft_stele_puppet', 'baihong_duanyue'],
  ['m_verdant_wither_guard', 'wanzhi_huichun'],
  ['m_cold_moonscale', 'xuanjin_huilan'],
  ['m_cold_bridge_patrol', 'zhoutian_xihai'],
  ['m_ember_bone_patrol', 'chiyao_fenmai'],
  ['m_ember_flame_guard', 'voidflame_chapter'],
  ['m_deepvein_stele_bearer', 'kunyue_zhenhai'],
  ['m_deepvein_heavy_guard', 'wildsunder_chart'],
  ['m_guizang_dualphase_beast', 'wuqi_guiliu'],
  ['m_cleft_gate_lord', 'taibai_zhuxing'],
  ['m_verdant_vein_mother', 'changsheng_chanyuan'],
  ['m_cold_abyss_drake', 'taiyin_guichao'],
  ['m_ember_furnace_lord', 'zhuming_jintian'],
  ['m_deepvein_earth_effigy', 'huangting_zaishan'],
  ['m_guizang_failed_foundation', 'taichu_baoyuan'],
  ['m_guizang_failed_foundation', 'hunyuan_zaimai'],
];

/**
 * 汇总目标怪物文件列表。
 */
const TARGET_MONSTER_FILES = new Set([
  '裂锋原.json',
  '青萝谷.json',
  '寒汐泽.json',
  '赤陨庭.json',
  '厚脉岭.json',
  '归藏脉窟.json',
]);

/**
 * 收集json文件列表。
 */
function collectJsonFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    .flatMap((entry) => {
/**
 * 记录entry路径。
 */
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return collectJsonFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
    });
}

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
 * 读取境界techniques。
 */
function readRealmTechniques() {
/**
 * 记录techniques。
 */
  const techniques = [];
  for (const filePath of collectJsonFiles(TECHNIQUES_ROOT)) {
/**
 * 汇总当前条目列表。
 */
    const entries = readJson(filePath);
    if (!Array.isArray(entries)) {
      throw new Error(`功法文件不是数组：${filePath}`);
    }
    for (const entry of entries) {
      techniques.push(entry);
    }
  }
  return techniques;
}

/**
 * 比较功法。
 */
function compareTechnique(left, right) {
/**
 * 记录品阶diff。
 */
  const gradeDiff = GRADE_ORDER.indexOf(left.grade) - GRADE_ORDER.indexOf(right.grade);
  if (gradeDiff !== 0) return gradeDiff;
/**
 * 记录类别diff。
 */
  const categoryDiff = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
  if (categoryDiff !== 0) return categoryDiff;
/**
 * 记录境界diff。
 */
  const realmDiff = (left.realmLv ?? 0) - (right.realmLv ?? 0);
  if (realmDiff !== 0) return realmDiff;
  return String(left.name).localeCompare(String(right.name), 'zh-CN');
}

/**
 * 创建book物品。
 */
function createBookItem(technique) {
  return {
    itemId: `book.${technique.id}`,
    name: `《${technique.name}》`,
    type: 'skill_book',
    desc: `记载${technique.name}的修行法门，使用后学会${technique.name}。`,
    learnTechniqueId: technique.id,
  };
}

/**
 * 规范化怪物kind。
 */
function normalizeMonsterKind(monster) {
  if (monster.tier === 'demon_king') return 'boss';
  if (monster.tier === 'variant') return 'elite';
  return 'normal';
}

/**
 * 校验assignments。
 */
function validateAssignments(techniqueById, monsterIndex) {
/**
 * 记录assignedcounts。
 */
  const assignedCounts = new Map();
  for (const [monsterId, techniqueId] of BOOK_ASSIGNMENTS) {
/**
 * 记录功法。
 */
    const technique = techniqueById.get(techniqueId);
    if (!technique) {
      throw new Error(`未找到功法：${techniqueId}`);
    }
/**
 * 记录怪物。
 */
    const monster = monsterIndex.get(monsterId);
    if (!monster) {
      throw new Error(`未找到怪物：${monsterId}`);
    }
/**
 * 记录kind。
 */
    const kind = normalizeMonsterKind(monster.entry);
    if (technique.grade === 'yellow' && kind !== 'normal') {
      throw new Error(`黄阶功法 ${techniqueId} 被分配到了非普通怪：${monsterId}`);
    }
    if (technique.grade === 'mystic' && kind !== 'elite') {
      throw new Error(`玄阶功法 ${techniqueId} 被分配到了非精英怪：${monsterId}`);
    }
    if (technique.grade === 'earth' && kind !== 'boss') {
      throw new Error(`地阶功法 ${techniqueId} 被分配到了非 Boss：${monsterId}`);
    }
    assignedCounts.set(techniqueId, (assignedCounts.get(techniqueId) ?? 0) + 1);
  }

  for (const techniqueId of techniqueById.keys()) {
    if (!assignedCounts.has(techniqueId)) {
      throw new Error(`功法书未分配掉落：${techniqueId}`);
    }
  }
}

/**
 * 串联执行脚本主流程。
 */
function main() {
/**
 * 记录techniques。
 */
  const techniques = readRealmTechniques();
/**
 * 记录功法byID。
 */
  const techniqueById = new Map(techniques.map((entry) => [entry.id, entry]));
/**
 * 记录境界功法ids。
 */
  const realmTechniqueIds = new Set(techniqueById.keys());
/**
 * 记录newbook物品ids。
 */
  const newBookItemIds = new Set(techniques.map((entry) => `book.${entry.id}`));

/**
 * 记录mortalbooks路径。
 */
  const mortalBooksPath = path.join(ITEMS_ROOT, '凡人期/书籍.json');
/**
 * 记录qibooks路径。
 */
  const qiBooksPath = path.join(ITEMS_ROOT, '练气期/书籍.json');
/**
 * 记录mortalbooks。
 */
  const mortalBooks = readJson(mortalBooksPath).filter((item) => !realmTechniqueIds.has(item.learnTechniqueId));
/**
 * 记录qibooks。
 */
  const qiBooks = [...techniques].sort(compareTechnique).map(createBookItem);

/**
 * 汇总怪物文件列表。
 */
  const monsterFiles = collectJsonFiles(MONSTERS_ROOT);
/**
 * 记录怪物索引。
 */
  const monsterIndex = new Map();/**
 * 保存怪物文件映射。
 */

  const monsterFileMap = new Map();
  for (const filePath of monsterFiles) {
    const entries = readJson(filePath);
    monsterFileMap.set(filePath, entries);
    for (const entry of entries) {
      monsterIndex.set(entry.id, { filePath, entry });
    }
  }

  validateAssignments(techniqueById, monsterIndex);

  for (const [filePath, monsters] of monsterFileMap.entries()) {/**
 * 标记是否目标文件。
 */

    const isTargetFile = TARGET_MONSTER_FILES.has(path.basename(filePath));
    for (const monster of monsters) {
      const drops = Array.isArray(monster.drops) ? monster.drops : [];
      monster.drops = drops.filter((drop) => {
        if (drop?.type !== 'skill_book') {
          return true;
        }
        if (isTargetFile) {
          return false;
        }
        return !newBookItemIds.has(drop.itemId);
      });
    }
  }

  for (const [monsterId, techniqueId] of BOOK_ASSIGNMENTS) {
/**
 * 记录book。
 */
    const book = createBookItem(techniqueById.get(techniqueId));
/**
 * 记录怪物。
 */
    const monster = monsterIndex.get(monsterId)?.entry;
    if (!monster) {
      throw new Error(`掉落回填时未找到怪物：${monsterId}`);
    }
    monster.drops.push({
      itemId: book.itemId,
      name: book.name,
      type: 'skill_book',
      count: 1,
    });
  }

  writeJson(mortalBooksPath, mortalBooks);
  writeJson(qiBooksPath, qiBooks);
  for (const filePath of monsterFiles) {
    writeJson(filePath, monsterFileMap.get(filePath));
  }

  process.stdout.write(
    [
      `已同步 ${qiBooks.length} 本练气期功法书。`,
      `凡人期保留 ${mortalBooks.length} 本书。`,
      `已更新 ${monsterFiles.length} 份怪物掉落文件。`,
    ].join('\n') + '\n',
  );
}

main();
