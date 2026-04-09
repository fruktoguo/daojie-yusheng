/**
 * 用途：生成客户端编辑器目录数据。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 保存仓库根目录路径，作为内容和输出文件的定位基准。
 */
const repoRoot = path.resolve(__dirname, '..');
/**
 * 保存命令行参数解析结果，用于确定目标客户端和 shared 包。
 */
const args = parseArgs(process.argv.slice(2));
/**
 * 保存本次生成目标客户端包名。
 */
const clientName = normalizeClientName(args.client);
/**
 * 保存本次加载的 shared 包名。
 */
const sharedName = normalizeSharedName(args.shared);
/**
 * 记录内容目录。
 */
const contentDir = path.join(repoRoot, 'packages/server/data/content');
/**
 * 记录客户端包目录。
 */
const clientDir = path.join(repoRoot, 'packages', clientName);
/**
 * 指定编辑器目录生成文件的输出路径。
 */
const outputPath = path.join(clientDir, 'src/constants/world/editor-catalog.generated.json');
/**
 * 记录境界levels路径。
 */
const realmLevelsPath = path.join(contentDir, 'realm-levels.json');

/**
 * 动态加载目标 shared 包构建产物，复用功法计算逻辑。
 */
const sharedModule = await import(pathToFileURL(path.join(repoRoot, 'packages', sharedName, 'dist/index.js')).href);
const {
  calculateTechniqueSkillQiCost,
  scaleTechniqueExp,
} = sharedModule;

/**
 * 记录境界levels配置。
 */
const realmLevelsConfig = readJson(realmLevelsPath);
/**
 * 保存品阶到默认境界等级的映射表。
 */
const gradeBandLevelFrom = buildGradeBandLevelMap(realmLevelsConfig.gradeBands);
/**
 * 缓存共享功法 Buff 模板索引，供技能效果展开时复用。
 */
const sharedTechniqueBuffs = loadSharedTechniqueBuffs(path.join(contentDir, 'technique-buffs'));
/**
 * 记录items。
 */
const items = loadItems(path.join(contentDir, 'items'));
/**
 * 记录techniques。
 */
const techniques = loadTechniques(path.join(contentDir, 'techniques'), sharedTechniqueBuffs, gradeBandLevelFrom, {
  calculateTechniqueSkillQiCost,
  scaleTechniqueExp,
});
/**
 * 记录境界levels。
 */
const realmLevels = loadRealmLevels(realmLevelsConfig.levels);
/**
 * 记录buffs。
 */
const buffs = buildBuffCatalog(techniques, items);

writeJson(outputPath, {
  techniques,
  items,
  realmLevels,
  buffs,
});

console.log(`已生成 ${path.relative(repoRoot, outputPath)}`);

/**
 * 解析命令行参数中的键值对选项。
 */
function parseArgs(argv) {
/**
 * 累计当前结果。
 */
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      continue;
    }
    const [key, value = ''] = arg.slice(2).split('=');
    result[key] = value;
  }
  return result;
}

/**
 * 校验并规范化客户端包名参数。
 */
function normalizeClientName(value) {
  if (value === 'client' || value === 'client-next') {
    return value;
  }
  throw new Error('缺少有效的 --client=client 或 --client=client-next');
}

/**
 * 校验并规范化 shared 包名参数。
 */
function normalizeSharedName(value) {
  if (value === 'shared' || value === 'shared-next') {
    return value;
  }
  throw new Error('缺少有效的 --shared=shared 或 --shared=shared-next');
}

/**
 * 读取json。
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 递归收集目录下的全部 JSON 文件并按中文排序。
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
 * 写入json。
 */
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * 把品阶配置转换为默认境界等级映射。
 */
function buildGradeBandLevelMap(gradeBands) {
/**
 * 汇总当前条目列表。
 */
  const entries = Array.isArray(gradeBands) ? gradeBands : [];
  return new Map(entries.flatMap((entry) => (
    typeof entry?.grade === 'string' && Number.isFinite(entry?.levelFrom)
      ? [[entry.grade, Math.max(1, Math.floor(Number(entry.levelFrom)))]]
      : []
  )));
}

/**
 * 读取并整理物品目录数据，生成编辑器可用的物品列表。
 */
function loadItems(itemsDir) {
  return walkJsonFiles(itemsDir)
    .flatMap((filePath) => {
/**
 * 汇总当前条目列表。
 */
      const entries = readJson(filePath);
      return Array.isArray(entries) ? entries : [];
    })
    .filter((item) => typeof item?.itemId === 'string' && typeof item?.name === 'string' && typeof item?.type === 'string')
    .map((item) => ({ ...item }))
    .sort((left, right) => sortByNameThenId(left.name, right.name, left.itemId, right.itemId));
}

/**
 * 读取共享功法 Buff 模板并建立按 ID 检索的索引。
 */
function loadSharedTechniqueBuffs(sharedTechniqueBuffsDir) {
/**
 * 记录共享包buffs。
 */
  const sharedBuffs = new Map();
  if (!fs.existsSync(sharedTechniqueBuffsDir)) {
    return sharedBuffs;
  }
  for (const filePath of walkJsonFiles(sharedTechniqueBuffsDir)) {
/**
 * 汇总当前条目列表。
 */
    const entries = readJson(filePath);
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
/**
 * 记录ID。
 */
      const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
      if (!id) {
        continue;
      }
      const { id: _id, ...template } = entry;
      sharedBuffs.set(id, {
        ...template,
        type: 'buff',
      });
    }
  }
  return sharedBuffs;
}

/**
 * 读取功法目录并规范化为编辑器消费的数据结构。
 */
function loadTechniques(techniquesDir, sharedTechniqueBuffs, gradeBandLevelFrom, helpers) {
  return walkJsonFiles(techniquesDir)
    .flatMap((filePath) => {
/**
 * 汇总当前条目列表。
 */
      const entries = readJson(filePath);
      return Array.isArray(entries) ? entries : [];
    })
    .filter((technique) => typeof technique?.id === 'string' && typeof technique?.name === 'string')
    .map((technique) => normalizeTechnique(technique, sharedTechniqueBuffs, gradeBandLevelFrom, helpers))
    .sort((left, right) => sortByNameThenId(left.name, right.name, left.id, right.id));
}

/**
 * 把单条功法配置整理为统一的编辑器展示格式。
 */
function normalizeTechnique(raw, sharedTechniqueBuffs, gradeBandLevelFrom, helpers) {
/**
 * 记录境界lv。
 */
  const realmLv = Number.isFinite(raw.realmLv)
    ? Math.max(1, Math.floor(Number(raw.realmLv)))
    : (gradeBandLevelFrom.get(raw.grade) ?? 1);
/**
 * 记录品阶。
 */
  const grade = typeof raw.grade === 'string' ? raw.grade : undefined;
/**
 * 记录layers。
 */
  const layers = Array.isArray(raw.layers)
    ? [...raw.layers]
      .filter((layer) => Number.isFinite(layer?.level))
      .map((layer) => ({
        level: Math.max(1, Math.floor(Number(layer.level))),
        expToNext: layer.expFactor === undefined
          ? Math.max(0, Math.floor(Number(layer.expToNext ?? 0)))
          : helpers.scaleTechniqueExp(Number(layer.expFactor), realmLv),
        attrs: isPlainObject(layer.attrs) ? { ...layer.attrs } : undefined,
      }))
      .sort((left, right) => left.level - right.level)
    : undefined;
/**
 * 记录skills。
 */
  const skills = Array.isArray(raw.skills)
    ? raw.skills
      .filter((skill) => typeof skill?.id === 'string' && typeof skill?.name === 'string')
      .map((skill) => {
/**
 * 记录costmultiplier。
 */
        const costMultiplier = Number.isFinite(skill.costMultiplier ?? skill.cost)
          ? Math.max(0, Number(skill.costMultiplier ?? skill.cost))
          : 0;
        return {
          ...skill,
          effects: normalizeSkillEffects(skill.effects, sharedTechniqueBuffs),
          costMultiplier,
          cost: helpers.calculateTechniqueSkillQiCost(costMultiplier, grade, realmLv),
        };
      })
    : undefined;
  return {
    id: raw.id,
    name: raw.name,
    grade,
    category: normalizeTechniqueCategory(raw.category, skills),
    realmLv,
    skills,
    layers,
  };
}

/**
 * 批量规范化技能效果数组，展开共享 Buff 引用。
 */
function normalizeSkillEffects(effects, sharedTechniqueBuffs) {
  if (!Array.isArray(effects)) {
    return [];
  }
  return effects.flatMap((effect) => normalizeSkillEffect(effect, sharedTechniqueBuffs));
}

/**
 * 规范化技能effect。
 */
function normalizeSkillEffect(effect, sharedTechniqueBuffs) {
  if (!isPlainObject(effect) || typeof effect.type !== 'string') {
    return [];
  }
  if (effect.type !== 'buff') {
    return [{ ...effect }];
  }
/**
 * 记录resolved。
 */
  const resolved = resolveSharedTechniqueBuffEffect(effect, sharedTechniqueBuffs);
  return resolved ? [resolved] : [];
}

/**
 * 把技能中的共享 Buff 引用解析为完整 Buff 效果对象。
 */
function resolveSharedTechniqueBuffEffect(effect, sharedTechniqueBuffs) {
/**
 * 记录Buffref。
 */
  const buffRef = typeof effect.buffRef === 'string' ? effect.buffRef.trim() : '';
  if (!buffRef) {
    return { ...effect };
  }
/**
 * 记录template。
 */
  const template = sharedTechniqueBuffs.get(buffRef);
  if (!template) {
    throw new Error(`共享功法 Buff 模板 ${buffRef} 不存在`);
  }
  const { buffRef: _buffRef, ...resolvedEffect } = effect;
  return {
    ...template,
    ...resolvedEffect,
    type: 'buff',
  };
}

/**
 * 规范化功法类别。
 */
function normalizeTechniqueCategory(category, skills) {
  if (category === 'arts' || category === 'internal' || category === 'divine' || category === 'secret') {
    return category;
  }
  return (skills?.length ?? 0) > 0 ? 'arts' : 'internal';
}

/**
 * 加载境界levels。
 */
function loadRealmLevels(levels) {
  return (Array.isArray(levels) ? levels : [])
    .filter((entry) => Number.isFinite(entry?.realmLv) && typeof entry?.displayName === 'string' && typeof entry?.name === 'string')
    .map((entry) => ({
      realmLv: Math.max(1, Math.floor(Number(entry.realmLv))),
      displayName: entry.displayName,
      name: entry.name,
      phaseName: typeof entry.phaseName === 'string' && entry.phaseName.trim().length > 0 ? entry.phaseName : undefined,
      review: typeof entry.review === 'string' && entry.review.trim().length > 0 ? entry.review : undefined,
    }))
    .sort((left, right) => left.realmLv - right.realmLv);
}

/**
 * 从功法和物品配置中汇总生成编辑器 Buff 目录。
 */
function buildBuffCatalog(techniques, items) {/**
 * 保存Buff映射。
 */

  const buffMap = new Map();
  const register = (buff) => {
    const buffId = typeof buff?.buffId === 'string' ? buff.buffId.trim() : '';
    if (!buffId || buffMap.has(buffId)) {
      return;
    }
    buffMap.set(buffId, {
      ...buff,
      buffId,
      shortMark: normalizeBuffShortMark(buff.shortMark, buff.name),
    });
  };

  for (const technique of techniques) {
    for (const skill of technique.skills ?? []) {
      for (const effect of skill.effects ?? []) {
        if (effect?.type !== 'buff') {
          continue;
        }
        register({
          buffId: effect.buffId,
          name: effect.name,
          desc: effect.desc,
          shortMark: effect.shortMark,
          category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
          visibility: effect.visibility ?? 'public',
          remainingTicks: Math.max(1, Math.floor(Number(effect.duration ?? 1))),
          duration: Math.max(1, Math.floor(Number(effect.duration ?? 1))),
          stacks: 1,
          maxStacks: Math.max(1, Math.floor(Number(effect.maxStacks ?? 1))),
          sourceSkillId: skill.id,
          sourceSkillName: skill.name,
          realmLv: 1,
          color: effect.color,
          attrs: isPlainObject(effect.attrs) ? { ...effect.attrs } : undefined,
          attrMode: effect.attrMode,
          stats: isPlainObject(effect.stats) ? { ...effect.stats } : undefined,
          statMode: effect.statMode,
          qiProjection: effect.qiProjection,
        });
      }
    }
  }

  for (const item of items) {
    for (const buff of item.consumeBuffs ?? []) {
      register({
        buffId: buff.buffId,
        name: buff.name,
        desc: buff.desc,
        shortMark: buff.shortMark,
        category: buff.category ?? 'buff',
        visibility: buff.visibility ?? 'public',
        remainingTicks: Math.max(1, Math.floor(Number(buff.duration ?? 1))),
        duration: Math.max(1, Math.floor(Number(buff.duration ?? 1))),
        stacks: 1,
        maxStacks: Math.max(1, Math.floor(Number(buff.maxStacks ?? 1))),
        sourceSkillId: `item:${item.itemId}`,
        sourceSkillName: item.name,
        realmLv: 1,
        color: buff.color,
        attrs: isPlainObject(buff.attrs) ? { ...buff.attrs } : undefined,
        attrMode: buff.attrMode,
        stats: isPlainObject(buff.stats) ? { ...buff.stats } : undefined,
        statMode: buff.statMode,
        qiProjection: buff.qiProjection,
      });
    }
    for (const effect of item.effects ?? []) {
      if (effect?.type !== 'timed_buff' || !isPlainObject(effect.buff)) {
        continue;
      }
      register({
        buffId: effect.buff.buffId,
        name: effect.buff.name,
        desc: effect.buff.desc,
        shortMark: effect.buff.shortMark,
        category: effect.buff.category ?? 'buff',
        visibility: effect.buff.visibility ?? 'public',
        remainingTicks: Math.max(1, Math.floor(Number(effect.buff.duration ?? 1))),
        duration: Math.max(1, Math.floor(Number(effect.buff.duration ?? 1))),
        stacks: 1,
        maxStacks: Math.max(1, Math.floor(Number(effect.buff.maxStacks ?? 1))),
        sourceSkillId: `equip:${item.itemId}:${typeof effect.effectId === 'string' ? effect.effectId : 'effect'}`,
        sourceSkillName: item.name,
        realmLv: 1,
        color: effect.buff.color,
        attrs: isPlainObject(effect.buff.attrs) ? { ...effect.buff.attrs } : undefined,
        attrMode: effect.buff.attrMode,
        stats: isPlainObject(effect.buff.stats) ? { ...effect.buff.stats } : undefined,
        statMode: effect.buff.statMode,
        qiProjection: effect.buff.qiProjection,
      });
    }
  }

  return [...buffMap.values()].sort((left, right) => sortByNameThenId(left.name, right.name, left.buffId, right.buffId));
}

/**
 * 规范化Buffshortmark。
 */
function normalizeBuffShortMark(raw, fallbackName) {
/**
 * 记录trimmed。
 */
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed) {
    return [...trimmed][0] ?? trimmed;
  }
/**
 * 记录fallback。
 */
  const fallback = typeof fallbackName === 'string' ? fallbackName.trim() : '';
  return [...fallback][0] ?? '气';
}

/**
 * 排序by名称thenID。
 */
function sortByNameThenId(leftName, rightName, leftId, rightId) {
/**
 * 记录名称order。
 */
  const nameOrder = String(leftName).localeCompare(String(rightName), 'zh-CN');
  if (nameOrder !== 0) {
    return nameOrder;
  }
  return String(leftId).localeCompare(String(rightId), 'zh-CN');
}

/**
 * 判断是否plainobject。
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
