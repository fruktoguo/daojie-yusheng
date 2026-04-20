import type { PlayerState } from '@mud/shared-next';
import { LOCAL_EDITOR_CATALOG } from '../content/editor-catalog';

/** 可用于危险评估的境界等级区间。 */
type RealmLevelRange = {
/**
 * minLevel：min等级数值。
 */

  minLevel: number;  
  /**
 * maxLevel：max等级数值。
 */

  maxLevel: number;  
  /**
 * displayLabel：显示Label名称或显示文本。
 */

  displayLabel: string;
};

/** 地图危险度评估结果。 */
export interface MapDangerAssessment {
/**
 * recommendedRealmLabel：recommendedRealmLabel名称或显示文本。
 */

  recommendedRealmLabel: string;  
  /**
 * dangerLabel：dangerLabel名称或显示文本。
 */

  dangerLabel: string;  
  /**
 * dangerTone：dangerTone相关字段。
 */

  dangerTone: number;
}

/** 境界别名到等级区间的索引。 */
const realmRangeByAlias = new Map<string, RealmLevelRange>();

/** 规范化境界文本，便于别名匹配。 */
function normalizeRealmToken(value: string): string {
  return value.trim().replace(/\s+/g, '');
}

/** 注册一个境界别名。 */
function registerRealmAlias(alias: string, range: RealmLevelRange): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = normalizeRealmToken(alias);
  if (!normalized) {
    return;
  }
  realmRangeByAlias.set(normalized, range);
}

/** 根据本地目录构建境界别名索引。 */
function buildRealmAliasIndex(): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const groupedByName = new Map<string, {  
  /**
 * minLevel：min等级数值。
 */
 minLevel: number;  
 /**
 * maxLevel：max等级数值。
 */
 maxLevel: number }>();
  for (const entry of LOCAL_EDITOR_CATALOG.realmLevels) {
    const level = Math.max(1, Math.floor(entry.realmLv));
    registerRealmAlias(entry.displayName, {
      minLevel: level,
      maxLevel: level,
      displayLabel: entry.displayName,
    });
    registerRealmAlias(entry.name, {
      minLevel: level,
      maxLevel: level,
      displayLabel: entry.displayName,
    });
    if (entry.phaseName) {
      registerRealmAlias(`${entry.name}${entry.phaseName}`, {
        minLevel: level,
        maxLevel: level,
        displayLabel: entry.displayName,
      });
    }

    const grouped = groupedByName.get(entry.name);
    if (!grouped) {
      groupedByName.set(entry.name, { minLevel: level, maxLevel: level });
      continue;
    }
    grouped.minLevel = Math.min(grouped.minLevel, level);
    grouped.maxLevel = Math.max(grouped.maxLevel, level);
  }

  for (const [name, range] of groupedByName.entries()) {
    const displayLabel = range.minLevel === range.maxLevel ? name : `${name}期`;
    registerRealmAlias(name, { ...range, displayLabel });
    if (range.minLevel !== range.maxLevel) {
      registerRealmAlias(`${name}期`, { ...range, displayLabel });
    }
  }

  registerRealmAlias('Entry', { minLevel: 1, maxLevel: 3, displayLabel: '凡胎-锻骨' });
  registerRealmAlias('Minor', { minLevel: 4, maxLevel: 7, displayLabel: '易筋-通脉' });
  registerRealmAlias('Major', { minLevel: 8, maxLevel: 12, displayLabel: '瑶光-天玑' });
  registerRealmAlias('Perfection', { minLevel: 13, maxLevel: 18, displayLabel: '天璇-叩仙门' });
  registerRealmAlias('锻体', { minLevel: 1, maxLevel: 3, displayLabel: '凡胎-锻骨' });
  registerRealmAlias('后天', { minLevel: 4, maxLevel: 7, displayLabel: '易筋-通脉' });
  registerRealmAlias('先天', { minLevel: 8, maxLevel: 18, displayLabel: '瑶光-叩仙门' });
  registerRealmAlias('练气前夜', { minLevel: 18, maxLevel: 18, displayLabel: '叩仙门' });
  registerRealmAlias('练气启蒙', { minLevel: 19, maxLevel: 19, displayLabel: '练气一层' });
}

buildRealmAliasIndex();

/** 解析单个境界别名对应的等级区间。 */
function resolveSingleRealmRange(raw: string): RealmLevelRange | null {
  return realmRangeByAlias.get(normalizeRealmToken(raw)) ?? null;
}

/** 解析单个境界或区间写法。 */
function resolveRealmRange(raw: string): RealmLevelRange | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = normalizeRealmToken(raw);
  if (!normalized) {
    return null;
  }

  const direct = resolveSingleRealmRange(normalized);
  if (direct) {
    return direct;
  }

  const parts = normalized.split(/-|到|至|~|～/).map((part) => normalizeRealmToken(part)).filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const resolvedParts = parts
    .map((part) => resolveSingleRealmRange(part))
    .filter((part): part is RealmLevelRange => Boolean(part));
  if (resolvedParts.length !== parts.length) {
    return null;
  }

  return {
    minLevel: Math.min(...resolvedParts.map((part) => part.minLevel)),
    maxLevel: Math.max(...resolvedParts.map((part) => part.maxLevel)),
    displayLabel: raw.trim(),
  };
}

/** 解析推荐境界，优先使用显式配置。 */
function resolveRecommendedRealmRange(
  recommendedRealm: string | undefined,
  fallbackRecommendedRealm: string | undefined,
): RealmLevelRange | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const candidates = [recommendedRealm, fallbackRecommendedRealm]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  for (const candidate of candidates) {
    const resolved = resolveRealmRange(candidate);
    if (resolved) {
      return {
        ...resolved,
        displayLabel: /[^\x00-\x7F]/.test(candidate) ? candidate : resolved.displayLabel,
      };
    }
  }
  return null;
}

/** 读取玩家当前用于危险评估的境界等级。 */
function resolvePlayerRealmLevel(player: PlayerState): number {
  const realmLevel = player.realm?.realmLv ?? player.realmLv;
  return Number.isFinite(realmLevel) ? Math.max(1, Math.floor(Number(realmLevel))) : 1;
}

/** 生成“比玩家更强”时的危险描述。 */
function describeHarderDanger(gap: number): {
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * tone：tone相关字段。
 */
 tone: number } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (gap <= 1) {
    return { label: '高你一境，稍有风浪', tone: 3 };
  }
  if (gap === 2) {
    return { label: '高你两境，已有压力', tone: 4 };
  }
  if (gap === 3) {
    return { label: '高你三境，险意渐浓', tone: 4 };
  }
  if (gap === 4) {
    return { label: '高你四境，步步惊心', tone: 5 };
  }
  return { label: `高你${gap}境，十面埋伏`, tone: 5 };
}

/** 生成“比玩家更弱”时的危险描述。 */
function describeEasierDanger(gap: number): {
/**
 * label：label名称或显示文本。
 */
 label: string;
 /**
 * tone：tone相关字段。
 */
 tone: number } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (gap <= 1) {
    return { label: '尚可从容', tone: 2 };
  }
  if (gap === 2) {
    return { label: '游刃有余', tone: 2 };
  }
  if (gap === 3) {
    return { label: '轻车熟路', tone: 1 };
  }
  if (gap === 4) {
    return { label: '难逢敌手', tone: 1 };
  }
  return { label: '如履平地', tone: 1 };
}

/** 根据玩家境界与推荐境界评估地图危险度。 */
export function assessMapDanger(
  player: PlayerState,
  recommendedRealm: string | undefined,
  fallbackRecommendedRealm?: string,
): MapDangerAssessment {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const resolvedRange = resolveRecommendedRealmRange(recommendedRealm, fallbackRecommendedRealm);
  const recommendedRealmLabel = resolvedRange?.displayLabel
    ?? recommendedRealm?.trim()
    ?? fallbackRecommendedRealm?.trim()
    ?? '未知';

  if (!resolvedRange) {
    return {
      recommendedRealmLabel,
      dangerLabel: '境界未明，谨慎试探',
      dangerTone: 3,
    };
  }

  const playerLevel = resolvePlayerRealmLevel(player);
  if (playerLevel < resolvedRange.minLevel) {
    const gap = resolvedRange.minLevel - playerLevel;
    const described = describeHarderDanger(gap);
    return {
      recommendedRealmLabel,
      dangerLabel: described.label,
      dangerTone: described.tone,
    };
  }
  if (playerLevel > resolvedRange.maxLevel) {
    const gap = playerLevel - resolvedRange.maxLevel;
    const described = describeEasierDanger(gap);
    return {
      recommendedRealmLabel,
      dangerLabel: described.label,
      dangerTone: described.tone,
    };
  }
  return {
    recommendedRealmLabel,
    dangerLabel: '境界相宜，正合历练',
    dangerTone: 3,
  };
}
