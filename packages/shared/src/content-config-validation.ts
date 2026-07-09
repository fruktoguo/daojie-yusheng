/**
 * 编辑器与服务端启动期共用的关键内容配置校验。
 *
 * 这里仅运行在保存、导入或启动等冷路径，不进入 tick。校验目标是阻止结构损坏的配置落盘，
 * 同时保留通天塔加载器已有的缺省值能力，不把可选字段变成不必要的功能门禁。
 */

export interface ContentConfigValidationIssue {
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function push(issues: ContentConfigValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function validateRealmLevels(value: unknown): ContentConfigValidationIssue[] {
  const issues: ContentConfigValidationIssue[] = [];
  if (!isRecord(value)) {
    return [{ path: '$', message: '境界等级配置必须是对象' }];
  }
  if (!Array.isArray(value.levels) || value.levels.length === 0) {
    return [{ path: '$.levels', message: 'levels 必须是非空数组' }];
  }
  if (value.expMultiplier !== undefined && (!isFiniteNumber(value.expMultiplier) || value.expMultiplier < 0)) {
    push(issues, '$.expMultiplier', 'expMultiplier 必须是非负有限数值');
  }
  const levels = new Set<number>();
  value.levels.forEach((entry, index) => {
    const base = `$.levels[${index}]`;
    if (!isRecord(entry)) {
      push(issues, base, '等级条目必须是对象');
      return;
    }
    if (!isPositiveInteger(entry.realmLv)) {
      push(issues, `${base}.realmLv`, 'realmLv 必须是正整数');
    } else if (levels.has(entry.realmLv)) {
      push(issues, `${base}.realmLv`, `realmLv ${entry.realmLv} 重复`);
    } else {
      levels.add(entry.realmLv);
    }
    for (const key of ['displayName', 'name'] as const) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) {
        push(issues, `${base}.${key}`, `${key} 必须是非空字符串`);
      }
    }
    if (!isFiniteNumber(entry.expToNext) || entry.expToNext < 0) {
      push(issues, `${base}.expToNext`, 'expToNext 必须是非负有限数值');
    }
    if (entry.path !== undefined && !['martial', 'immortal', 'ascended'].includes(String(entry.path))) {
      push(issues, `${base}.path`, 'path 必须是 martial、immortal 或 ascended');
    }
  });
  const orderedLevels = [...levels].sort((left, right) => left - right);
  for (let index = 0; index < orderedLevels.length; index += 1) {
    if (orderedLevels[index] !== index + 1) {
      push(issues, '$.levels', `境界等级必须从 1 连续配置，缺少 realmLv ${index + 1}`);
      break;
    }
  }
  return issues;
}

function validateBreakthroughRequirement(
  requirement: unknown,
  base: string,
  issues: ContentConfigValidationIssue[],
): void {
  if (!isRecord(requirement)) {
    push(issues, base, '突破条件必须是对象');
    return;
  }
  if (typeof requirement.id !== 'string' || !requirement.id.trim()) {
    push(issues, `${base}.id`, 'id 必须是非空字符串');
  }
  if (!['item', 'technique', 'attribute_total', 'root'].includes(String(requirement.type))) {
    push(issues, `${base}.type`, 'type 不是受支持的突破条件');
    return;
  }
  if (requirement.type === 'item') {
    if (typeof requirement.itemId !== 'string' || !requirement.itemId.trim()) push(issues, `${base}.itemId`, 'itemId 必须是非空字符串');
    if (!isPositiveInteger(requirement.count)) push(issues, `${base}.count`, 'count 必须是正整数');
  } else if (requirement.type === 'technique') {
    if (requirement.count !== undefined && !isPositiveInteger(requirement.count)) push(issues, `${base}.count`, 'count 必须是正整数');
    if (requirement.minLevel !== undefined && !isNonNegativeInteger(requirement.minLevel)) push(issues, `${base}.minLevel`, 'minLevel 必须是非负整数');
    if (requirement.minGrade !== undefined && !['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'].includes(String(requirement.minGrade))) {
      push(issues, `${base}.minGrade`, 'minGrade 不是合法功法品阶');
    }
    if (
      requirement.minRealm !== undefined
      && !(['Entry', 'entry', 'Minor', 'minor', 'Major', 'major', 'Perfection', 'perfection', 0, 1, 2, 3] as readonly unknown[])
        .includes(requirement.minRealm)
    ) {
      push(issues, `${base}.minRealm`, 'minRealm 不是合法功法境界');
    }
  } else if (requirement.type === 'attribute_total') {
    if (!isPositiveInteger(requirement.minTotalValue)) push(issues, `${base}.minTotalValue`, 'minTotalValue 必须是正整数');
  } else if (!isPositiveInteger(requirement.minValue)) {
    push(issues, `${base}.minValue`, 'minValue 必须是正整数');
  }
}

function validateBreakthroughs(value: unknown): ContentConfigValidationIssue[] {
  const issues: ContentConfigValidationIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '突破配置必须是对象' }];
  if (!Array.isArray(value.transitions)) return [{ path: '$.transitions', message: 'transitions 必须是数组' }];
  const fromLevels = new Set<number>();
  value.transitions.forEach((entry, index) => {
    const base = `$.transitions[${index}]`;
    if (!isRecord(entry)) {
      push(issues, base, '突破条目必须是对象');
      return;
    }
    if (!isPositiveInteger(entry.fromRealmLv)) {
      push(issues, `${base}.fromRealmLv`, 'fromRealmLv 必须是正整数');
    } else if (fromLevels.has(entry.fromRealmLv)) {
      push(issues, `${base}.fromRealmLv`, `fromRealmLv ${entry.fromRealmLv} 重复`);
    } else {
      fromLevels.add(entry.fromRealmLv);
    }
    if (!isPositiveInteger(entry.toRealmLv) || (isPositiveInteger(entry.fromRealmLv) && entry.toRealmLv <= entry.fromRealmLv)) {
      push(issues, `${base}.toRealmLv`, 'toRealmLv 必须是大于 fromRealmLv 的正整数');
    }
    if (entry.requirements !== undefined && !Array.isArray(entry.requirements)) {
      push(issues, `${base}.requirements`, 'requirements 必须是数组');
    } else {
      (entry.requirements ?? []).forEach((requirement, requirementIndex) => {
        validateBreakthroughRequirement(requirement, `${base}.requirements[${requirementIndex}]`, issues);
      });
    }
    if (entry.rootFoundationItems !== undefined && !Array.isArray(entry.rootFoundationItems)) {
      push(issues, `${base}.rootFoundationItems`, 'rootFoundationItems 必须是数组');
    } else {
      (entry.rootFoundationItems ?? []).forEach((item, itemIndex) => {
        const itemBase = `${base}.rootFoundationItems[${itemIndex}]`;
        if (!isRecord(item)) {
          push(issues, itemBase, '底蕴材料必须是对象');
          return;
        }
        if (typeof item.itemId !== 'string' || !item.itemId.trim()) push(issues, `${itemBase}.itemId`, 'itemId 必须是非空字符串');
        if (!isPositiveInteger(item.count)) push(issues, `${itemBase}.count`, 'count 必须是正整数');
      });
    }
  });
  return issues;
}

function validateRealmAttrBaselines(value: unknown): ContentConfigValidationIssue[] {
  const issues: ContentConfigValidationIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '境界属性基准配置必须是对象' }];
  if (!Array.isArray(value.levels) || value.levels.length === 0) return [{ path: '$.levels', message: 'levels 必须是非空数组' }];
  const levels = new Set<number>();
  value.levels.forEach((entry, index) => {
    const base = `$.levels[${index}]`;
    if (!isRecord(entry)) {
      push(issues, base, '基准条目必须是对象');
      return;
    }
    if (!isPositiveInteger(entry.realmLv)) {
      push(issues, `${base}.realmLv`, 'realmLv 必须是正整数');
    } else if (levels.has(entry.realmLv)) {
      push(issues, `${base}.realmLv`, `realmLv ${entry.realmLv} 重复`);
    } else {
      levels.add(entry.realmLv);
    }
    if (!isFiniteNumber(entry.singleAttr) || entry.singleAttr < 0) push(issues, `${base}.singleAttr`, 'singleAttr 必须是非负有限数值');
    if (entry.singleBaseStatValue !== undefined && (!isFiniteNumber(entry.singleBaseStatValue) || entry.singleBaseStatValue < 0)) {
      push(issues, `${base}.singleBaseStatValue`, 'singleBaseStatValue 必须是非负有限数值');
    }
  });
  return issues;
}

function validateTongtianTower(value: unknown): ContentConfigValidationIssue[] {
  const issues: ContentConfigValidationIssue[] = [];
  if (!isRecord(value)) return [{ path: '$', message: '通天塔配置必须是对象' }];
  for (const key of ['id', 'name', 'entryMapId', 'exitMapId', 'monsterId', 'eliteMonsterId'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !value[key].trim())) {
      push(issues, `$.${key}`, `${key} 必须是非空字符串`);
    }
  }
  for (const key of ['width', 'height', 'spawnIntervalTicks', 'normalMonstersPerPlayer', 'idleDestroyTicks'] as const) {
    if (value[key] !== undefined && !isPositiveInteger(value[key])) push(issues, `$.${key}`, `${key} 必须是正整数`);
  }
  if (value.eliteMonstersPerPlayer !== undefined && !isNonNegativeInteger(value.eliteMonstersPerPlayer)) {
    push(issues, '$.eliteMonstersPerPlayer', 'eliteMonstersPerPlayer 必须是非负整数');
  }
  for (const key of ['entryX', 'entryY', 'exitX', 'exitY', 'spawnX', 'spawnY', 'previousX', 'previousY', 'nextX', 'nextY', 'exitPortalX', 'exitPortalY'] as const) {
    if (value[key] !== undefined && !isNonNegativeInteger(value[key])) push(issues, `$.${key}`, `${key} 必须是非负整数`);
  }
  const width = isPositiveInteger(value.width) ? value.width : 20;
  const height = isPositiveInteger(value.height) ? value.height : 20;
  for (const key of ['spawnX', 'previousX', 'nextX', 'exitPortalX'] as const) {
    if (isNonNegativeInteger(value[key]) && value[key] >= width) push(issues, `$.${key}`, `${key} 必须小于 width`);
  }
  for (const key of ['spawnY', 'previousY', 'nextY', 'exitPortalY'] as const) {
    if (isNonNegativeInteger(value[key]) && value[key] >= height) push(issues, `$.${key}`, `${key} 必须小于 height`);
  }
  return issues;
}

/** 校验编辑器可直接保存的关键正式配置；其他路径交给已有领域校验器。 */
export function validateContentConfigDocument(relativePath: string, value: unknown): ContentConfigValidationIssue[] {
  const normalizedPath = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (normalizedPath === 'realm-levels.json') return validateRealmLevels(value);
  if (normalizedPath === 'breakthroughs.json') return validateBreakthroughs(value);
  if (normalizedPath === 'realm-attr-baselines.json') return validateRealmAttrBaselines(value);
  if (normalizedPath === 'tongtian-tower.json') return validateTongtianTower(value);
  return [];
}

/** 校验失败时抛出带字段路径的错误，供本地 API 直接返回。 */
export function assertContentConfigDocument(relativePath: string, value: unknown): void {
  const issues = validateContentConfigDocument(relativePath, value);
  if (issues.length === 0) return;
  const preview = issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join('；');
  const suffix = issues.length > 8 ? `；另有 ${issues.length - 8} 项` : '';
  throw new Error(`${relativePath} 配置校验失败：${preview}${suffix}`);
}
