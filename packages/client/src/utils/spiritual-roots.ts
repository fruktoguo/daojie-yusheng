import type { AttrBonus, ElementKey, HeavenGateRootValues } from '@mud/shared';
import { ELEMENT_KEY_LABELS } from '../domain-labels';

const ELEMENTS: readonly ElementKey[] = ['metal', 'wood', 'water', 'fire', 'earth'];
/** 天门关卡灵根来源的标识。 */
const HEAVEN_GATE_ROOTS_SOURCE = 'heaven_gate:roots';

/** 灵根描述结果。 */
export interface SpiritualRootDescription {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * meta：meta相关字段。
 */

  meta: string;  
  /**
 * desc：desc相关字段。
 */

  desc: string;
}

/** 将灵根数值映射为吸收效率曲线。 */
export function getSpiritualRootAbsorptionRate(value: number): number {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (normalized * normalized) / 100;
}

/** 把五行标签拼成一个连续名称。 */
function joinElements(elements: ElementKey[]): string {
  return elements.map((element) => ELEMENT_KEY_LABELS[element]).join('');
}

/** 规范化灵根数值到 0-100 区间。 */
export function normalizeSpiritualRoots(roots: HeavenGateRootValues | null | undefined): HeavenGateRootValues | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!roots) {
    return null;
  }
  const normalized = ELEMENTS.reduce((result, element) => {
    result[element] = Math.max(0, Math.min(100, Math.floor(roots[element] ?? 0)));
    return result;
  }, {} as HeavenGateRootValues);
  return ELEMENTS.some((element) => normalized[element] > 0) ? normalized : null;
}

/** 从属性加成里提取灵根来源。 */
export function resolveSpiritualRootsFromBonuses(bonuses: AttrBonus[]): HeavenGateRootValues | null {
  const rootBonus = bonuses.find((bonus) => bonus.source === HEAVEN_GATE_ROOTS_SOURCE);
  return normalizeSpiritualRoots(rootBonus?.stats?.elementDamageBonus as HeavenGateRootValues | undefined);
}

/** 根据灵根分布生成玩家可读的资质描述。 */
export function describeSpiritualRoots(roots: HeavenGateRootValues | null | undefined): SpiritualRootDescription {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = normalizeSpiritualRoots(roots);
  if (!normalized) {
    return {
      name: '无灵根',
      meta: '灵根已绝',
      desc: '当前没有可用灵根。',
    };
  }
  const entries = ELEMENTS
    .map((element) => ({ element, value: normalized[element] || 0 }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  const spread = entries[0].value - entries[entries.length - 1].value;

  if (entries.length === 1) {
    if (entries[0].value >= 100) {
      return { name: `${ELEMENT_KEY_LABELS[entries[0].element]}先天道胎灵根`, meta: '单灵根 · 极境资质', desc: '仅存一系，且数值圆满，已近先天道胎之象。' };
    }
    if (entries[0].value >= 95) {
      return { name: `${ELEMENT_KEY_LABELS[entries[0].element]}极品天灵根`, meta: '单灵根 · 极品', desc: '单一属性纯度极高，已是最上层的单系资质。' };
    }
    if (entries[0].value >= 90) {
      return { name: `${ELEMENT_KEY_LABELS[entries[0].element]}天灵根`, meta: '单灵根 · 天品', desc: '灵气归一，杂质极少，属于典型的单系天灵根。' };
    }
    if (entries[0].value >= 80) {
      return { name: `${ELEMENT_KEY_LABELS[entries[0].element]}真灵根`, meta: '单灵根 · 上品', desc: '虽然未到天品，但依旧属于极强的单系资质。' };
    }
    if (entries[0].value >= 35) {
      return { name: `${ELEMENT_KEY_LABELS[entries[0].element]}偏枯单灵根`, meta: '单灵根 · 偏弱', desc: '路线纯粹，但根基偏枯，后续更依赖资源和机缘。' };
    }
    return { name: `${ELEMENT_KEY_LABELS[entries[0].element]}废灵根`, meta: '单灵根 · 近废', desc: '虽然形式上只余一系，但数值太低，几近枯竭。' };
  }

  if (entries.length === 2) {
    const names = joinElements(entries.map((entry) => entry.element));
    const highCount = entries.filter((entry) => entry.value >= 90).length;
    if (highCount === 2) {
      return { name: `${names}天灵根`, meta: '双灵根 · 天品', desc: '双系皆过九十，兼顾变化与纯度，属于极罕见的双系天灵根。' };
    }
    if (entries[0].value >= 80 && entries[1].value >= 80) {
      return { name: `${names}真双灵根`, meta: '双灵根 · 上品', desc: '两系都很扎实，是双修路线里相当漂亮的一档。' };
    }
    if (spread <= 8 && entries[1].value >= 50) {
      return { name: `${names}均衡双灵根`, meta: '双灵根 · 均衡', desc: '两系强弱接近，灵气分布平滑，适合走互补路线。' };
    }
    if (total <= 40) {
      return { name: `${names}废双灵根`, meta: '双灵根 · 近废', desc: '两系都沾一点，却都不成气候，属于典型废双灵根。' };
    }
    if (total <= 80) {
      return { name: `${names}杂双灵根`, meta: '双灵根 · 杂驳', desc: '两系都不算太强，难称精品，只能算常见的杂双灵根。' };
    }
    return { name: `${names}双灵根`, meta: '双灵根 · 常规', desc: '标准双灵根格局，既有变化，也承担了纯度被分走的代价。' };
  }

  if (entries.length === 3) {
    const names = joinElements(entries.map((entry) => entry.element));
    if (entries.every((entry) => entry.value >= 90)) {
      return { name: `${names}三系天灵根`, meta: '三灵根 · 天品', desc: '三系齐强且都过九十，放在三灵根里已近传说。' };
    }
    if (entries.every((entry) => entry.value >= 75)) {
      return { name: `${names}真三灵根`, meta: '三灵根 · 上品', desc: '三系根基都很扎实，胜在路子广、兼容性强。' };
    }
    if (spread <= 10 && entries[2].value >= 45) {
      return { name: `${names}均衡三灵根`, meta: '三灵根 · 均衡', desc: '三系分布平滑，没有明显短板，适合多属性体系。' };
    }
    if (total <= 60) {
      return { name: `${names}废三灵根`, meta: '三灵根 · 近废', desc: '三系都有，却都过于孱弱，修行时容易处处分散。' };
    }
    if (total <= 120) {
      return { name: `${names}杂三灵根`, meta: '三灵根 · 杂驳', desc: '很常见的普通资质，广而不精，更看后续功法与资源。' };
    }
    return { name: `${names}三灵根`, meta: '三灵根 · 常规', desc: '标准三灵根，属性选择更多，但每一系分到的纯度也更少。' };
  }

  if (entries.length === 4) {
    const names = joinElements(entries.map((entry) => entry.element));
    if (entries.every((entry) => entry.value >= 90)) {
      return { name: `${names}四象天灵根`, meta: '四灵根 · 天品', desc: '四系全部极高，已经超出常规四灵根应有的驳杂程度。' };
    }
    if (entries.every((entry) => entry.value >= 70)) {
      return { name: `${names}真四灵根`, meta: '四灵根 · 上品', desc: '四系都不低，说明这次开门极顺，属于相当漂亮的四灵根。' };
    }
    if (total <= 90) {
      return { name: `${names}废四灵根`, meta: '四灵根 · 近废', desc: '四系过多又过弱，属性不少，但每一条都像风中残烛。' };
    }
    if (total <= 160) {
      return { name: `${names}杂四灵根`, meta: '四灵根 · 杂驳', desc: '四系驳杂，纯度摊得很散，是典型的普通杂四灵根。' };
    }
    return { name: `${names}四灵根`, meta: '四灵根 · 常规', desc: '四系并存，天然适合更复杂的路线，只是单系优势更难拉出来。' };
  }

  if (entries.every((entry) => entry.value === 100)) {
    return { name: '神灵根', meta: '五灵根 · 神品', desc: '五行俱圆满，条条皆为百数，已经不是寻常五灵根能形容的资质。' };
  }
  if (entries.every((entry) => entry.value >= 90)) {
    return { name: '五行天灵根', meta: '五灵根 · 天品', desc: '五行俱全且全部过九十，极其稀有，真正意义上的五行齐鸣。' };
  }
  if (entries.every((entry) => entry.value >= 80)) {
    return { name: '五行真灵根', meta: '五灵根 · 极上', desc: '五行全部强势，虽然未到全体天品，但整体已经非常夸张。' };
  }
  if (spread <= 10 && entries[4].value >= 55) {
    return { name: '五行均衡灵根', meta: '五灵根 · 均衡', desc: '五行分布极其平均，没有明显偏科，最适合全系兼修路线。' };
  }
  if (total <= 45) {
    return { name: '废灵根', meta: '五灵根 · 近废', desc: '五行俱全却极度孱弱，看似什么都有，实则每一系都不足以撑起修行。' };
  }
  if (total <= 120) {
    return { name: '杂灵根', meta: '五灵根 · 杂驳', desc: '五行混杂、纯度偏低，是最常见的一类灵根，优点是适配面广。' };
  }
  if (total <= 220) {
    return { name: '下品五灵根', meta: '五灵根 · 普通', desc: '属于五灵根里比较常见的一档，路子很多，但单系都不算特别强。' };
  }
  if (total <= 320) {
    return { name: '上品五灵根', meta: '五灵根 · 上品', desc: '五行总值不低，已经跳出普通杂灵根范畴，整体底子相当扎实。' };
  }
  return { name: '极品五行灵根', meta: '五灵根 · 极品', desc: '五行俱全且整体总值极高，虽然未必每条都达天品，但底子已经极厚。' };
}
