/**
 * attr-panel.snapshots.ts
 *
 * 从 attr-panel.ts 拆出的接口区和全部纯快照构建函数：雷达图、数值面板、
 * 特殊面板、技艺面板等快照构建逻辑。所有函数以 AttrPanel 实例为第一参数
 * （self），由主类方法以一行委托壳调用，不改变任何 DOM id/class、事件
 * 绑定或面板行为。
 */
import {
  ATTR_KEYS,
  ATTR_TO_PERCENT_NUMERIC_WEIGHTS,
  ATTR_TO_NUMERIC_WEIGHTS,
  AttrBonus,
  AttrKey,
  Attributes,
  BASE_MOVE_POINTS_PER_TICK,
  CRAFT_EFFECT_SKILL_KINDS,
  CULTIVATE_EXP_PER_TICK,
  CULTIVATION_REALM_EXP_PER_TICK,
  cloneCraftEffectStats,
  DEFAULT_QI_EFFICIENCY_BP,
  ELEMENT_KEYS,
  HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
  NumericStatBreakdownMap,
  NumericRatioDivisors,
  NumericStats,
  percentModifierToMultiplier,
  S2C_AttrDetail,
  PlayerState,
  PlayerSpecialStats,
  PVP_SOUL_INJURY_BUFF_ID,
  type CraftEffectKind,
  type CraftEffectSkillKind,
  type CraftEffectStatsPatch,
  type QiElementKey,
  type QiFamilyKey,
  type QiFormKey,
  type QiProjectionModifier,
  ratioValue,
  S2C_AttrUpdate,
  TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE,
  TileType,
  getQiResourceDisplayLabel,
  getMovePointsPerTick,
  getTileTraversalCost,
} from '@mud/shared';
import { ATTR_KEY_LABELS, ELEMENT_KEY_LABELS } from '../../domain-labels';
import {
  ATTR_COLORS,
  ATTR_TAB_LABELS,
  ELEMENT_COLORS,
  ATTR_ICON_ATLAS_CELLS,
  type NumericCardIconAtlasCell,
  NUMERIC_TOOLTIP_DESCRIPTIONS,
  NUMERIC_TOOLTIP_LABELS,
  PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS,
  PLAYER_SPECIAL_TOOLTIP_LABELS,
  RATE_BP_KEYS,
  type AttrTab,
  type NumericCardKey,
  type PlayerSpecialCardKey,
} from '../../constants/ui/attr-panel';
import { formatDisplayInteger, formatDisplayNumber, formatDisplayPercent, formatDisplaySignedNumber } from '../../utils/number';
import {
  describeSpiritualRoots,
  getSpiritualRootAbsorptionRate,
  resolveSpiritualRootsFromBonuses,
} from '../../utils/spiritual-roots';
import { t } from '../i18n';
import type { AttrPanel } from './attr-panel';
import {
  OPENABLE_CRAFT_SKILL_KEYS,
  SPECIAL_DETAIL_ACTION_KEY,
  CRAFT_EFFECT_SKILL_LABELS,
  CRAFT_EFFECT_KIND_LABELS,
  CRAFT_EFFECT_DETAIL_KINDS,
  formatRateBp,
  formatSimplePercent,
  formatSignedRatePercent,
  getCraftProgressRatio,
  formatAuraAbsorptionRate,
  formatQiEfficiencyBp,
  resolveQiProjectionDisplay,
  buildQiProjectionSourceLines,
  colorWithAlpha,
  formatRatioPercent,
  isPvPSoulInjuryAttrBonus,
  buildAttributeBreakdownLines,
  formatCritDamageDisplay,
  formatMoveSpeedEffect,
  formatMoveSpeedDisplay,
  buildNumericTooltip,
} from './attr-panel';

interface RadarEntry {
/**
 * key：图标与增量更新使用的稳定键。
 */

  key: string;
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: number;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * valueLabel：值Label名称或显示文本。
 */

  valueLabel?: string;  
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
}

/** 单个雷达节点的渲染快照，记录坐标、标签和值提示。 */
export interface AttrRadarNodeSnapshot {
/**
 * key：图标与增量更新使用的稳定键。
 */

  key: string;
/**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * valueLabel：值Label名称或显示文本。
 */

  valueLabel: string;  
  /**
 * color：color相关字段。
 */

  color: string;  
  /**
 * dotX：dotX相关字段。
 */

  dotX: string;  
  /**
 * dotY：dotY相关字段。
 */

  dotY: string;  
  /**
 * labelX：labelX相关字段。
 */

  labelX: string;  
  /**
 * labelY：labelY相关字段。
 */

  labelY: string;  
  /**
 * valueX：值X相关字段。
 */

  valueX: string;  
  /**
 * valueY：值Y相关字段。
 */

  valueY: string;  
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
}

/** 雷达属性页的渲染快照，包含标题、网格、轴线和节点。 */
export interface AttrRadarPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'radar';  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * scaleLabel：scaleLabel相关字段。
 */

  scaleLabel: string;
  /**
 * paneId：paneID标识。
 */

  paneId: string;  
  /**
 * areaPoints：areaPoint相关字段。
 */

  areaPoints: string;  
  /**
 * rings：ring相关字段。
 */

  rings: string[];  
  /**
 * axes：axe相关字段。
 */

  axes: Array<{  
  /**
 * x：x相关字段。
 */
 x: string;  
 /**
 * y：y相关字段。
 */
 y: string;  
 /**
 * stroke：stroke相关字段。
 */
 stroke: string }>;  
 /**
 * nodes：node相关字段。
 */

  nodes: AttrRadarNodeSnapshot[];
  /**
 * cards：雷达下方附加卡片。
 */

  cards?: AttrNumericCardSnapshot[];
  /**
 * summaryCards：雷达图内侧摘要卡片。
 */

  summaryCards?: AttrNumericCardSnapshot[];
}

/** 数值卡片的渲染快照，包含展示值、附加说明和提示内容。 */
export interface AttrNumericCardSnapshot {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * value：值数值。
 */

  value: string;  
  /**
 * sub：sub相关字段。
 */

  sub?: string;
  /** 灵脉等卡片用单字标记替代图集图标。 */
  mark?: string;
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
}

export interface AttrPaneActionSnapshot {
  key: string;
  label: string;
}

/** 数值属性页的渲染快照，按卡片列表组织。 */
export interface AttrNumericPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'numeric';  
  /**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * cards：card相关字段。
 */

  cards: AttrNumericCardSnapshot[];
  actions?: AttrPaneActionSnapshot[];
}

export interface AttrSpecialDetailRowSnapshot {
  key: string;
  label: string;
  value: string;
  detail?: string;
}

export interface AttrSpecialDetailSectionSnapshot {
  key: string;
  title: string;
  rows: AttrSpecialDetailRowSnapshot[];
}

export interface AttrSpecialDetailPaneSnapshot {
  kind: 'special-detail';
  title: string;
  backLabel: string;
  sections: AttrSpecialDetailSectionSnapshot[];
}

/** 属性页占位快照，用于尚未同步到数据时的提示。 */
export interface AttrPlaceholderPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'placeholder';  
  /**
 * message：message相关字段。
 */

  message: string;
}

/** 采集 / 炼器 / 强化技能的渲染快照，包含等级和进度信息。 */
export interface AttrCraftSkillSnapshot {
/**
 * key：key标识。
 */

  key: string;  
  /**
 * label：label名称或显示文本。
 */

  label: string;  
  /**
 * level：等级数值。
 */

  level: string;  
  /**
 * progress：进度状态或数据块。
 */

  progress: string;  
  /**
 * remain：remain相关字段。
 */

  remain: string;  
  /**
 * progressPercent：进度Percent相关字段。
 */

  progressPercent: string;
  /**
 * tooltipTitle：提示Title名称或显示文本。
 */

  tooltipTitle: string;
  /**
 * tooltipDetail：提示详情状态或数据块。
 */

  tooltipDetail: string;
  /**
 * openable：是否可点击打开对应技艺 UI。
 */

  openable: boolean;
  /**
 * bindLabel：快捷键绑定按钮文案。
 */

  bindLabel: string;
}

/** 生活技能页的渲染快照，按技能列表展示。 */
export interface AttrCraftPaneSnapshot {
/**
 * kind：kind相关字段。
 */

  kind: 'craft';  
  /**
 * skills：技能相关字段。
 */

  skills: AttrCraftSkillSnapshot[];
}

/** 单个属性页的统一渲染快照类型。 */
export type AttrPaneSnapshot = AttrRadarPaneSnapshot | AttrNumericPaneSnapshot | AttrPlaceholderPaneSnapshot | AttrCraftPaneSnapshot;

/** 整个属性面板的渲染快照，按分页保存各页内容。 */
export interface AttrPanelSnapshot {
/**
 * panes：pane相关字段。
 */

  panes: Record<AttrTab, AttrPaneSnapshot>;
}

export function resolveRenderNumericStatBreakdownsImpl(self: AttrPanel, 
    breakdowns?: NumericStatBreakdownMap,
  ): NumericStatBreakdownMap | undefined {
    if (breakdowns && Object.keys(breakdowns).length > 0) {
      return breakdowns;
    }
    const detailBreakdowns = self.detailData?.numericStatBreakdowns;
    if (detailBreakdowns && Object.keys(detailBreakdowns).length > 0) {
      return detailBreakdowns;
    }
    return undefined;
  }

  /** mergeAttrs：合并属性。 */
export function mergeAttrsImpl(self: AttrPanel, base: Attributes, bonuses: AttrBonus[]): Attributes {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const result = { ...base };
    for (const bonus of bonuses) {
      for (const key of ATTR_KEYS) {
        if (bonus.attrs[key] !== undefined) {
          if (bonus.attrMode === 'percent') {
            const multiplier = isPvPSoulInjuryAttrBonus(bonus)
              ? Math.max(0, 1 + bonus.attrs[key]! / 100)
              : percentModifierToMultiplier(bonus.attrs[key]!);
            result[key] = Math.max(0, result[key] * multiplier);
          } else {
            result[key] += bonus.attrs[key]!;
          }
        }
      }
    }
    return result;
  }  

  /** 把属性 patch 解析成完整六维属性；不完整时返回 null。 */
export function resolveCompleteAttrsImpl(self: AttrPanel, attrs: Partial<Attributes> | undefined): Attributes | null {
    if (!attrs) {
      return null;
    }
    for (const key of ATTR_KEYS) {
      if (typeof attrs[key] !== 'number') {
        return null;
      }
    }
    return attrs as Attributes;
  }
  /**
 * buildSnapshot：构建并返回目标对象。
 * @param base Attributes 参数说明。
 * @param bonuses AttrBonus[] 参数说明。
 * @param final Attributes 参数说明。
 * @param stats NumericStats 参数说明。
 * @param ratioDivisors NumericRatioDivisors 参数说明。
 * @param specialStats PlayerSpecialStats 参数说明。
 * @param alchemySkill PlayerState['alchemySkill'] 参数说明。
 * @param gatherSkill PlayerState['gatherSkill'] 参数说明。
 * @param enhancementSkill PlayerState['enhancementSkill'] 参数说明。
 * @returns 返回快照。
 */


export function buildSnapshotImpl(self: AttrPanel, 
    base: Attributes,
    bonuses: AttrBonus[],
    final: Attributes,
    stats?: NumericStats,
    ratioDivisors?: NumericRatioDivisors,
    specialStats?: PlayerSpecialStats,
    craftEffectStats?: CraftEffectStatsPatch,
    alchemySkill?: PlayerState['alchemySkill'],
    buildingSkill?: PlayerState['buildingSkill'],
    gatherSkill?: PlayerState['gatherSkill'],
    enhancementSkill?: PlayerState['enhancementSkill'],
    numericStatBreakdowns?: NumericStatBreakdownMap,
    forgingSkill?: PlayerState['forgingSkill'],
    miningSkill?: PlayerState['miningSkill'],
    formationSkill?: PlayerState['formationSkill'],
    transmissionSkill?: PlayerState['transmissionSkill'],
  ): AttrPanelSnapshot {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    return {
      panes: {
        base: buildBaseRadarSnapshotImpl(self, base, final, bonuses, specialStats),
        root: stats && ratioDivisors
          ? buildRootRadarSnapshotImpl(self, stats, ratioDivisors, bonuses)
        : { kind: 'placeholder', message: '灵根未明' },
        vein: stats
          ? buildVeinPaneSnapshotImpl(self, bonuses)
          : { kind: 'placeholder', message: '灵脉未察' },
        combat: buildNumericPaneSnapshotImpl(self, '斗法数值', stats, ratioDivisors, {
          keys: ['maxHp', 'physAtk', 'spellAtk', 'physDef', 'spellDef', 'hit', 'dodge', 'crit', 'antiCrit', 'critDamage', 'breakPower', 'resolvePower', 'actionsPerTurn'],
          ratioKeys: [],
          legends: {
            maxHp: '最大生命值',
            physAtk: '物理攻击',
            spellAtk: '法术攻击',
            physDef: '物理防御',
            spellDef: '法术防御',
            hit: '命中',
            dodge: '闪避',
            crit: '暴击',
            antiCrit: '免爆',
            critDamage: '暴击伤害',
            breakPower: '破招',
            resolvePower: '化解',
            actionsPerTurn: '每回合行动次数',
          },
        }, final, numericStatBreakdowns),
        qi: buildNumericPaneSnapshotImpl(self, '灵力运转', stats, ratioDivisors, {
          keys: ['maxQi', 'maxQiOutputPerTick', 'qiRegenRate', 'hpRegenRate', 'cooldownSpeed'],
          ratioKeys: [],
          legends: {
            maxQi: '最大灵力值',
            maxQiOutputPerTick: '灵力输出速率',
            qiRegenRate: '灵力回复',
            hpRegenRate: '生命回复',
            cooldownSpeed: '冷却速度',
          },
        }, final, numericStatBreakdowns),
        special: buildSpecialPaneSnapshotImpl(self, stats, ratioDivisors, specialStats, craftEffectStats, final, numericStatBreakdowns),
        craft: buildCraftPaneSnapshotImpl(self, alchemySkill, buildingSkill, gatherSkill, enhancementSkill, forgingSkill, miningSkill, formationSkill, transmissionSkill),
      },
    };
  }

  /** buildBaseRadarSnapshot：构建基础Radar快照。 */
export function buildBaseRadarSnapshotImpl(self: AttrPanel, 
    base: Attributes,
    final: Attributes,
    bonuses: AttrBonus[],
    specialStats?: PlayerSpecialStats,
  ): AttrRadarPaneSnapshot {
    const maxValue = Math.max(20, ...ATTR_KEYS.map((key) => final[key]));
    const radarMax = Math.ceil(maxValue / 5) * 5 || 20;
    const entries: RadarEntry[] = ATTR_KEYS.map((key, index) => {
      const finalValue = final[key];
      const baseValue = base[key];
      const roundedValue = Math.round(finalValue);
      return {
        label: ATTR_KEY_LABELS[key],
        key,
        value: finalValue,
        valueLabel: formatDisplayInteger(roundedValue),
        tooltipTitle: ATTR_KEY_LABELS[key],
        tooltipDetail: buildAttributeBreakdownLines(key, baseValue, finalValue, bonuses, specialStats).join('\n'),
        color: ATTR_COLORS[index % ATTR_COLORS.length],
      };
    });

    const snapshot = buildRadarPaneSnapshotImpl(self, '六维轮图', radarMax, entries, 'base');
    snapshot.summaryCards = buildRootFoundationSummaryCardsImpl(self, specialStats);
    snapshot.cards = buildBaseSpecialStatCardsImpl(self, specialStats);
    return snapshot;
  }  
  /**
 * buildRootRadarSnapshot：构建并返回目标对象。
 * @param stats NumericStats 参数说明。
 * @param ratioDivisors NumericRatioDivisors 参数说明。
 * @param bonuses AttrBonus[] 参数说明。
 * @returns 返回根容器Radar快照。
 */


export function buildRootRadarSnapshotImpl(self: AttrPanel, 
    stats: NumericStats,
    ratioDivisors: NumericRatioDivisors,
    bonuses: AttrBonus[],
  ): AttrRadarPaneSnapshot {
    const roots = resolveSpiritualRootsFromBonuses(bonuses);
    const entries: RadarEntry[] = ELEMENT_KEYS.map((key, index) => {
      const rootValue = roots?.[key] ?? 0;
      const damageBonus = stats.elementDamageBonus[key];
      const reductionDivisor = ratioDivisors.elementDamageReduce[key] || 100;
      const roundedRoot = Math.round(rootValue);
      const roundedBonus = Math.round(damageBonus);
      return {
        label: `${ELEMENT_KEY_LABELS[key]}灵根`,
        key: `root-${key}`,
        value: rootValue,
        valueLabel: formatDisplayInteger(roundedRoot),
        tooltipTitle: `${ELEMENT_KEY_LABELS[key]}灵根`,
        tooltipDetail: [
          `当前：${formatDisplayInteger(roundedRoot)} 点`,
          `${ELEMENT_KEY_LABELS[key]}属性伤害增幅：${formatDisplayPercent(roundedBonus)}`,
          `${ELEMENT_KEY_LABELS[key]}属性实际减伤：${formatRatioPercent(stats.elementDamageReduce[key], reductionDivisor)}`,
          `${ELEMENT_KEY_LABELS[key]}属性灵气吸收效率：${formatDisplayPercent(getSpiritualRootAbsorptionRate(roundedRoot), { maximumFractionDigits: 2 })}`,
        ].join('\n'),
        color: ELEMENT_COLORS[index % ELEMENT_COLORS.length],
      };
    });
    const radarMax = Math.max(100, ...entries.map((entry) => entry.value)) || 100;
    const rootTitle = describeSpiritualRoots(roots).name;
    return buildRadarPaneSnapshotImpl(self, rootTitle, radarMax, entries, 'root');
  }  
  /**
 * buildVeinPaneSnapshot：构建并返回目标对象。
 * @param stats NumericStats 参数说明。
 * @param bonuses AttrBonus[] 参数说明。
 * @returns 返回VeinPane快照。
 */


export function buildVeinPaneSnapshotImpl(self: AttrPanel, 
    bonuses: AttrBonus[],
  ): AttrNumericPaneSnapshot {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const roots = resolveSpiritualRootsFromBonuses(bonuses);
    const neutralAuraProjection = resolveQiProjectionDisplay(
      { family: 'aura', form: 'refined', element: 'neutral' },
      bonuses,
      'absorbable',
    );
    const neutralShaProjection = resolveQiProjectionDisplay(
      { family: 'sha', form: 'refined', element: 'neutral' },
      bonuses,
      'hidden',
    );
    const cards: AttrNumericCardSnapshot[] = [{
      key: 'neutral-aura',
      mark: '灵',
      label: '无属性灵气',
      value: formatQiEfficiencyBp(neutralAuraProjection.efficiencyBp),
      tooltipTitle: '无属性灵气',
      tooltipDetail: [
        `对无属性灵气吸收效率为 ${formatQiEfficiencyBp(neutralAuraProjection.efficiencyBp)}。`,
        ...buildQiProjectionSourceLines(neutralAuraProjection),
      ].join('\n'),
    }];

    if (neutralShaProjection.visibility !== 'hidden') {
      cards.push({
        key: 'sha',
        mark: '煞',
        label: '煞气',
        value: neutralShaProjection.visibility === 'absorbable'
          ? formatQiEfficiencyBp(neutralShaProjection.efficiencyBp)
          : '可感知',
        tooltipTitle: '煞气',
        tooltipDetail: [
          neutralShaProjection.visibility === 'absorbable'
            ? `对煞气吸收效率为 ${formatQiEfficiencyBp(neutralShaProjection.efficiencyBp)}。`
            : '可感知煞气。',
          ...buildQiProjectionSourceLines(neutralShaProjection),
        ].join('\n'),
      });
    }

    for (const element of ['yin', 'yang'] as const) {
      const projection = resolveQiProjectionDisplay(
        { family: 'aura', form: 'refined', element },
        bonuses,
        'hidden',
      );
      if (projection.visibility === 'hidden') {
        continue;
      }
      const label = getQiResourceDisplayLabel(`aura.refined.${element}`);
      cards.push({
        key: `${element}-aura`,
        mark: element === 'yin' ? '阴' : '阳',
        label,
        value: projection.visibility === 'absorbable'
          ? formatQiEfficiencyBp(projection.efficiencyBp)
          : '可感知',
        tooltipTitle: label,
        tooltipDetail: [
          projection.visibility === 'absorbable'
            ? `对${label}吸收效率为 ${formatQiEfficiencyBp(projection.efficiencyBp)}。`
            : `可感知${label}。`,
          ...buildQiProjectionSourceLines(projection),
        ].join('\n'),
      });
    }

    for (const key of ELEMENT_KEYS) {
      const rootValue = roots?.[key] ?? 0;
      if (rootValue <= 0) {
        continue;
      }
      const rate = getSpiritualRootAbsorptionRate(rootValue);
      const label = `${ELEMENT_KEY_LABELS[key]}灵气`;
      cards.push({
        key: `${key}-aura`,
        mark: ELEMENT_KEY_LABELS[key],
        label,
        value: formatAuraAbsorptionRate(rate),
        tooltipTitle: label,
        tooltipDetail: [
          `对${ELEMENT_KEY_LABELS[key]}灵气吸收效率为 ${formatAuraAbsorptionRate(rate)}。`,
          `当前${ELEMENT_KEY_LABELS[key]}灵根：${formatDisplayInteger(rootValue)}`,
        ].join('\n'),
      });
    }

    return {
      kind: 'numeric',
      title: t('attr.numeric.title.qi-flow', undefined),
      cards,
    };
  }

  /** buildRadarPaneSnapshot：构建Radar Pane快照。 */
export function buildRadarPaneSnapshotImpl(self: AttrPanel, title: string, scale: number, entries: RadarEntry[], paneId: string): AttrRadarPaneSnapshot {
    const center = 170;
    const radius = 110;
    const safeScale = Math.max(scale, 1);
    /** clampRatio：处理clamp Ratio。 */
    const clampRatio = (value: number) => Math.max(0, Math.min(1, value));

    /** pointAt：处理坐标At。 */
    const pointAt = (index: number, ratio: number, clamp = true) => {
      const angle = ((-90 + index * (360 / entries.length)) * Math.PI) / 180;
      const r = radius * (clamp ? clampRatio(ratio) : ratio);
      return {
        x: center + Math.cos(angle) * r,
        y: center + Math.sin(angle) * r,
      };
    };

    const entriesRatio = entries.map((entry) => clampRatio(entry.value / safeScale));
    const areaPoints = entriesRatio
      .map((ratio, index) => {
        const point = pointAt(index, ratio);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');
    const rings = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => {
      return entries
        .map((_, index) => {
          const point = pointAt(index, ratio);
          return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        })
        .join(' ');
    });
    const axes = entries.map((entry, index) => {
      const point = pointAt(index, 1);
      return {
        x: point.x.toFixed(2),
        y: point.y.toFixed(2),
        stroke: colorWithAlpha(entry.color, 0.35),
      };
    });
    const nodes = entries.map((entry, index) => {
      const dot = pointAt(index, entriesRatio[index]);
      const labelPoint = pointAt(index, 1.14, false);
      const isUpper = labelPoint.y <= center;
      const valuePoint = {
        x: labelPoint.x,
        y: labelPoint.y + (isUpper ? -18 : 18),
      };
      return {
        key: entry.key,
        label: entry.label,
        valueLabel: entry.valueLabel ?? formatDisplayInteger(entry.value),
        color: entry.color,
        dotX: dot.x.toFixed(2),
        dotY: dot.y.toFixed(2),
        labelX: labelPoint.x.toFixed(2),
        labelY: labelPoint.y.toFixed(2),
        valueX: valuePoint.x.toFixed(2),
        valueY: valuePoint.y.toFixed(2),
        tooltipTitle: entry.tooltipTitle,
        tooltipDetail: entry.tooltipDetail,
      };
    });

    return {
      kind: 'radar',
      title,
      scaleLabel: formatDisplayInteger(scale),
      paneId,
      areaPoints,
      rings,
      axes,
      nodes,
    };
  }  
  /**
 * buildNumericPaneSnapshot：构建并返回目标对象。
 * @param title string 参数说明。
 * @param stats NumericStats 参数说明。
 * @param ratios NumericRatioDivisors 参数说明。
 * @param meta { keys: NumericCardKey[]; ratioKeys: (keyof NumericRatioDivisors)[]; legends?: Record<string, string> } 参数说明。
 * @returns 返回NumericPane快照。
 */


export function buildNumericPaneSnapshotImpl(self: AttrPanel, 
    title: string,
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    meta?: {    
    /**
 * keys：key相关字段。
 */
 keys: NumericCardKey[];    
 /**
 * ratioKeys：ratioKey相关字段。
 */
 ratioKeys: (keyof NumericRatioDivisors)[];    
 /**
 * legends：legend相关字段。
 */
 legends?: Record<string, string> },
    attrs?: Attributes,
    breakdowns?: NumericStatBreakdownMap,
  ): AttrPaneSnapshot {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats || !ratios || !meta) {
      return { kind: 'placeholder', message: `${title}未明` };
    }

    return {
      kind: 'numeric',
      title,
      cards: meta.keys.map((key) => {
        const rawValue = stats[key];
        const numericValue = typeof rawValue === 'number' ? rawValue : 0;
        const label = meta.legends?.[key as string] ?? String(key);
        const ratioKey = meta.ratioKeys.find((ratio) => ratio === key as keyof NumericRatioDivisors);
        let sub: string | undefined;
        let actualLine: string | undefined;
        if (key === 'cooldownSpeed') {
          actualLine = '实际：缩减率随技能原始冷却变化';
          sub = '按技能原始冷却对抗折算';
        } else if (ratioKey && ratioKey !== 'elementDamageReduce') {
          actualLine = `实际：${formatRatioPercent(numericValue, ratios[ratioKey])}`;
          sub = actualLine;
        } else if (RATE_BP_KEYS.has(key) && key !== 'critDamage') {
          actualLine = `实际：${formatRateBp(numericValue)}`;
          sub = actualLine;
        } else if (key === 'extraAggroRate') {
          actualLine = `效果：${formatDisplayPercent(numericValue)}`;
          sub = actualLine;
        } else if (key === 'moveSpeed') {
          actualLine = `效果：${formatMoveSpeedEffect(numericValue)}`;
        }
        const value = key === 'critDamage'
          ? formatCritDamageDisplay(numericValue)
          : key === 'moveSpeed'
            ? formatMoveSpeedDisplay(numericValue)
            : key === 'extraAggroRate'
              ? formatDisplayPercent(numericValue)
              : RATE_BP_KEYS.has(key)
                ? formatRateBp(numericValue)
                : formatDisplayInteger(numericValue);
        return {
          key,
          label,
          value,
          sub,
          tooltipTitle: label,
          tooltipDetail: buildNumericTooltip(label, key, numericValue, actualLine, breakdowns, attrs),
        };
      }),
    };
  }  
  /**
 * buildSpecialPaneSnapshot：构建并返回目标对象。
 * @param stats NumericStats 参数说明。
 * @param ratios NumericRatioDivisors 参数说明。
 * @param specialStats PlayerSpecialStats 参数说明。
 * @returns 返回SpecialPane快照。
 */


export function buildSpecialPaneSnapshotImpl(self: AttrPanel, 
    stats?: NumericStats,
    ratios?: NumericRatioDivisors,
    specialStats?: PlayerSpecialStats,
    craftEffectStats?: CraftEffectStatsPatch,
    attrs?: Attributes,
    breakdowns?: NumericStatBreakdownMap,
  ): AttrPaneSnapshot {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats || !ratios) {
      return { kind: 'placeholder', message: '异禀未显' };
    }

    const specialCards = buildSpecialStatCardsImpl(self, ['foundation', 'combatExp'], specialStats);

    const numericPane = buildNumericPaneSnapshotImpl(self, '特殊属性', stats, ratios, {
      keys: ['viewRange', 'moveSpeed', 'extraAggroRate', 'playerExpRate', 'techniqueExpRate', 'realmExpPerTick', 'techniqueExpPerTick', 'lootRate', 'rareLootRate'],
      ratioKeys: [],
      legends: {
        viewRange: '视野范围',
        moveSpeed: '移动速度',
        extraAggroRate: '仇恨获取',
        playerExpRate: '境界修为',
        techniqueExpRate: '功法经验',
        realmExpPerTick: '每息境界修为',
        techniqueExpPerTick: '每息功法经验',
        lootRate: '掉落增幅',
        rareLootRate: '稀有掉落',
      },
    }, attrs, breakdowns);
    if (numericPane.kind !== 'numeric') {
      return numericPane;
    }

    return {
      kind: 'numeric',
      title: numericPane.title,
      cards: [...specialCards, ...numericPane.cards],
      actions: [{
        key: SPECIAL_DETAIL_ACTION_KEY,
        label: '全部特殊属性',
      }],
    };
  }  

export function buildSpecialDetailPaneSnapshotImpl(self: AttrPanel, 
    stats: NumericStats,
    ratios: NumericRatioDivisors,
    craftEffectStats?: CraftEffectStatsPatch,
  ): AttrSpecialDetailPaneSnapshot {
    const normalizedCraftEffectStats = cloneCraftEffectStats(craftEffectStats);
    return {
      kind: 'special-detail',
      title: '全部特殊属性',
      backLabel: '返回特殊',
      sections: [{
        key: 'element',
        title: '五行伤害与减伤',
        rows: buildElementSpecialDetailRowsImpl(self, stats, ratios),
      }, {
        key: 'craft',
        title: '技艺加成',
        rows: CRAFT_EFFECT_SKILL_KINDS.flatMap((skillKind) => CRAFT_EFFECT_DETAIL_KINDS.map((effectKind) => {
          const value = normalizedCraftEffectStats[skillKind][effectKind];
          const label = `${CRAFT_EFFECT_SKILL_LABELS[skillKind]}${CRAFT_EFFECT_KIND_LABELS[effectKind]}`;
          return {
            key: `${skillKind}.${effectKind}`,
            label,
            value: formatSignedRatePercent(value),
            detail: `${CRAFT_EFFECT_SKILL_LABELS[skillKind]}技艺的${CRAFT_EFFECT_KIND_LABELS[effectKind]}加成。`,
          };
        })),
      }],
    };
  }

export function buildSpecialDetailPaneSnapshotFromDataImpl(self: AttrPanel, data: S2C_AttrUpdate): AttrSpecialDetailPaneSnapshot | null {
    const stats = data.numericStats as NumericStats | undefined;
    const ratios = data.ratioDivisors as NumericRatioDivisors | undefined;
    if (!stats || !ratios) {
      return null;
    }
    return buildSpecialDetailPaneSnapshotImpl(self, 
      stats,
      ratios,
      data.craftEffectStats,
    );
  }

export function buildElementSpecialDetailRowsImpl(self: AttrPanel, stats: NumericStats, ratios: NumericRatioDivisors): AttrSpecialDetailRowSnapshot[] {
    return ELEMENT_KEYS.flatMap((key) => {
      const elementLabel = ELEMENT_KEY_LABELS[key];
      const damageBonus = Math.round(Number(stats.elementDamageBonus?.[key] ?? 0) || 0);
      const reduceValue = Number(stats.elementDamageReduce?.[key] ?? 0) || 0;
      const reduceDivisor = Number(ratios.elementDamageReduce?.[key] ?? 100) || 100;
      return [{
        key: `element.${key}.damageBonus`,
        label: `${elementLabel}伤害增幅`,
        value: formatDisplayPercent(damageBonus),
        detail: `${elementLabel}属性总伤害增幅。`,
      }, {
        key: `element.${key}.damageReduce`,
        label: `${elementLabel}实际减伤`,
        value: formatRatioPercent(reduceValue, reduceDivisor),
        detail: `${elementLabel}属性总减伤，已按当前减伤分母折算。`,
      }];
    });
  }

  /** buildSpecialStatCards：构建特殊属性卡片。 */
export function buildSpecialStatCardsImpl(self: AttrPanel, keys: PlayerSpecialCardKey[], specialStats?: PlayerSpecialStats): AttrNumericCardSnapshot[] {
    return keys.map((key) => {
      const numericValue = Math.max(0, Math.floor(specialStats?.[key] ?? 0));
      const label = PLAYER_SPECIAL_TOOLTIP_LABELS[key];
      const detail = [
        PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS[key],
        `当前数值：${formatDisplayInteger(numericValue)}`,
      ].join('\n');
      return {
        key,
        label,
        value: formatDisplayInteger(numericValue),
        tooltipTitle: label,
        tooltipDetail: detail,
      };
    });
  }

  /** buildBaseSpecialStatCards：构建六维页底部特殊属性卡片。 */
export function buildBaseSpecialStatCardsImpl(self: AttrPanel, specialStats?: PlayerSpecialStats): AttrNumericCardSnapshot[] {
    return (['comprehension', 'luck'] as PlayerSpecialCardKey[]).map((key) => {
      const numericValue = Math.max(0, Math.floor(specialStats?.[key] ?? 0));
      const label = PLAYER_SPECIAL_TOOLTIP_LABELS[key];
      const conversionLines = key === 'comprehension'
        ? [
            `境界修为 +${formatSimplePercent(numericValue)}`,
            `功法经验 +${formatSimplePercent(numericValue)}`,
          ]
        : [
            `掉落增幅 +${formatSimplePercent(numericValue)}`,
            `稀有掉落 +${formatSimplePercent(numericValue)}`,
          ];
      return {
        key,
        label,
        value: formatDisplayInteger(numericValue),
        tooltipTitle: label,
        tooltipDetail: [
          `当前：${formatDisplayInteger(numericValue)}`,
          `基础：${formatDisplayInteger(numericValue)}`,
          '增益：+0',
          '实际转化：',
          ...conversionLines,
        ].join('\n'),
      };
    });
  }

  /** buildRootFoundationSummaryCards：构建六维轮图内的根基摘要。 */
export function buildRootFoundationSummaryCardsImpl(self: AttrPanel, specialStats?: PlayerSpecialStats): AttrNumericCardSnapshot[] {
    const numericValue = Math.max(0, Math.floor(specialStats?.rootFoundation ?? 0));
    const label = PLAYER_SPECIAL_TOOLTIP_LABELS.rootFoundation;
    return [{
      key: 'rootFoundation',
      label,
      value: formatDisplayInteger(numericValue),
      tooltipTitle: label,
      tooltipDetail: [
        `当前：${formatDisplayInteger(numericValue)}`,
        t('attr.tooltip.root-foundation-bonus', { percent: formatDisplayNumber(100 + numericValue) }),
      ].join('\n'),
    }];
  }
  /**
 * buildCraftSkillSnapshot：构建并返回目标对象。
 * @param key string 参数说明。
 * @param label string 参数说明。
 * @param skill PlayerState['alchemySkill'] | PlayerState['gatherSkill'] | PlayerState['enhancementSkill'] | PlayerState['forgingSkill'] | PlayerState['buildingSkill'] 参数说明。
 * @returns 返回炼制技能快照。
 */


export function buildCraftSkillSnapshotImpl(self: AttrPanel, 
    key: string,
    label: string,
    skill?:
      | PlayerState['alchemySkill']
      | PlayerState['gatherSkill']
      | PlayerState['enhancementSkill']
      | PlayerState['forgingSkill']
      | PlayerState['buildingSkill']
      | PlayerState['miningSkill']
      | PlayerState['transmissionSkill'],
  ): AttrCraftSkillSnapshot | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!skill) {
      return null;
    }
    const remain = Math.max(0, skill.expToNext - skill.exp);
    const progress = `${formatDisplayInteger(skill.exp)}/${formatDisplayInteger(skill.expToNext)}`;
    return {
      key,
      label,
      level: `LV ${formatDisplayInteger(skill.level)}`,
      progress,
      remain: `距下一级还需 ${formatDisplayInteger(remain)} ${label}经验`,
      progressPercent: `${(getCraftProgressRatio(skill.exp, skill.expToNext) * 100).toFixed(2)}%`,
      tooltipTitle: label,
      tooltipDetail: [
        `等级：LV ${formatDisplayInteger(skill.level)}`,
        `经验：${progress}`,
        `距下一级还需 ${formatDisplayInteger(remain)}`,
      ].join('\n'),
      openable: OPENABLE_CRAFT_SKILL_KEYS.has(key),
      bindLabel: self.callbacks?.getCraftSkillBindLabel?.(key) ?? '绑定键',
    };
  }  
  /**
 * buildCraftPaneSnapshot：构建并返回目标对象。
 * @param alchemySkill PlayerState['alchemySkill'] 参数说明。
 * @param gatherSkill PlayerState['gatherSkill'] 参数说明。
 * @param enhancementSkill PlayerState['enhancementSkill'] 参数说明。
 * @returns 返回炼制Pane快照。
 */


export function buildCraftPaneSnapshotImpl(self: AttrPanel, 
    alchemySkill?: PlayerState['alchemySkill'],
    buildingSkill?: PlayerState['buildingSkill'],
    gatherSkill?: PlayerState['gatherSkill'],
    enhancementSkill?: PlayerState['enhancementSkill'],
    forgingSkill?: PlayerState['forgingSkill'],
    miningSkill?: PlayerState['miningSkill'],
    formationSkill?: PlayerState['formationSkill'],
    transmissionSkill?: PlayerState['transmissionSkill'],
  ): AttrPaneSnapshot {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const skills = [
      buildCraftSkillSnapshotImpl(self, 'alchemy', '炼丹', alchemySkill),
      buildCraftSkillSnapshotImpl(self, 'forging', '炼器', forgingSkill),
      buildCraftSkillSnapshotImpl(self, 'enhancement', '强化', enhancementSkill),
      buildCraftSkillSnapshotImpl(self, 'transmission', '传法', transmissionSkill),
      buildCraftSkillSnapshotImpl(self, 'formation', '阵法', formationSkill),
      buildCraftSkillSnapshotImpl(self, 'gather', '采集', gatherSkill),
      buildCraftSkillSnapshotImpl(self, 'mining', '挖矿', miningSkill),
      buildCraftSkillSnapshotImpl(self, 'building', '营造', buildingSkill),
    ].filter((entry): entry is AttrCraftSkillSnapshot => Boolean(entry));
    if (skills.length === 0) {
      return { kind: 'placeholder', message: '技艺未录' };
    }
    return {
      kind: 'craft',
      skills,
    };
  }

