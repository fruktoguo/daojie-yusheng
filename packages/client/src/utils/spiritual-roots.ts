import type { AttrBonus, ElementKey, HeavenGateRootValues } from '@mud/shared';
import { ELEMENT_KEY_LABELS } from '../domain-labels';
import { t } from '../ui/i18n';

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

function rootText(key: string): string {
  return t(key);
}

function rootName(key: string, names: string): string {
  return t(key, { names });
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
      name: rootText('root.none.name'),
      meta: rootText('root.none.meta'),
      desc: rootText('root.none.desc'),
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
      return { name: rootName('root.single.innate-dao.name', ELEMENT_KEY_LABELS[entries[0].element]), meta: rootText('root.single.innate-dao.meta'), desc: rootText('root.single.innate-dao.desc') };
    }
    if (entries[0].value >= 95) {
      return { name: rootName('root.single.supreme.name', ELEMENT_KEY_LABELS[entries[0].element]), meta: rootText('root.single.supreme.meta'), desc: rootText('root.single.supreme.desc') };
    }
    if (entries[0].value >= 90) {
      return { name: rootName('root.single.heaven.name', ELEMENT_KEY_LABELS[entries[0].element]), meta: rootText('root.single.heaven.meta'), desc: rootText('root.single.heaven.desc') };
    }
    if (entries[0].value >= 80) {
      return { name: rootName('root.single.true.name', ELEMENT_KEY_LABELS[entries[0].element]), meta: rootText('root.single.true.meta'), desc: rootText('root.single.true.desc') };
    }
    if (entries[0].value >= 35) {
      return { name: rootName('root.single.weak.name', ELEMENT_KEY_LABELS[entries[0].element]), meta: rootText('root.single.weak.meta'), desc: rootText('root.single.weak.desc') };
    }
    return { name: rootName('root.single.waste.name', ELEMENT_KEY_LABELS[entries[0].element]), meta: rootText('root.single.waste.meta'), desc: rootText('root.single.waste.desc') };
  }

  if (entries.length === 2) {
    const names = joinElements(entries.map((entry) => entry.element));
    const highCount = entries.filter((entry) => entry.value >= 90).length;
    if (highCount === 2) {
      return { name: rootName('root.dual.heaven.name', names), meta: rootText('root.dual.heaven.meta'), desc: rootText('root.dual.heaven.desc') };
    }
    if (entries[0].value >= 80 && entries[1].value >= 80) {
      return { name: rootName('root.dual.true.name', names), meta: rootText('root.dual.true.meta'), desc: rootText('root.dual.true.desc') };
    }
    if (spread <= 8 && entries[1].value >= 50) {
      return { name: rootName('root.dual.balanced.name', names), meta: rootText('root.dual.balanced.meta'), desc: rootText('root.dual.balanced.desc') };
    }
    if (total <= 40) {
      return { name: rootName('root.dual.waste.name', names), meta: rootText('root.dual.waste.meta'), desc: rootText('root.dual.waste.desc') };
    }
    if (total <= 80) {
      return { name: rootName('root.dual.mixed.name', names), meta: rootText('root.dual.mixed.meta'), desc: rootText('root.dual.mixed.desc') };
    }
    return { name: rootName('root.dual.normal.name', names), meta: rootText('root.dual.normal.meta'), desc: rootText('root.dual.normal.desc') };
  }

  if (entries.length === 3) {
    const names = joinElements(entries.map((entry) => entry.element));
    if (entries.every((entry) => entry.value >= 90)) {
      return { name: rootName('root.triple.heaven.name', names), meta: rootText('root.triple.heaven.meta'), desc: rootText('root.triple.heaven.desc') };
    }
    if (entries.every((entry) => entry.value >= 75)) {
      return { name: rootName('root.triple.true.name', names), meta: rootText('root.triple.true.meta'), desc: rootText('root.triple.true.desc') };
    }
    if (spread <= 10 && entries[2].value >= 45) {
      return { name: rootName('root.triple.balanced.name', names), meta: rootText('root.triple.balanced.meta'), desc: rootText('root.triple.balanced.desc') };
    }
    if (total <= 60) {
      return { name: rootName('root.triple.waste.name', names), meta: rootText('root.triple.waste.meta'), desc: rootText('root.triple.waste.desc') };
    }
    if (total <= 120) {
      return { name: rootName('root.triple.mixed.name', names), meta: rootText('root.triple.mixed.meta'), desc: rootText('root.triple.mixed.desc') };
    }
    return { name: rootName('root.triple.normal.name', names), meta: rootText('root.triple.normal.meta'), desc: rootText('root.triple.normal.desc') };
  }

  if (entries.length === 4) {
    const names = joinElements(entries.map((entry) => entry.element));
    if (entries.every((entry) => entry.value >= 90)) {
      return { name: rootName('root.quad.heaven.name', names), meta: rootText('root.quad.heaven.meta'), desc: rootText('root.quad.heaven.desc') };
    }
    if (entries.every((entry) => entry.value >= 70)) {
      return { name: rootName('root.quad.true.name', names), meta: rootText('root.quad.true.meta'), desc: rootText('root.quad.true.desc') };
    }
    if (total <= 90) {
      return { name: rootName('root.quad.waste.name', names), meta: rootText('root.quad.waste.meta'), desc: rootText('root.quad.waste.desc') };
    }
    if (total <= 160) {
      return { name: rootName('root.quad.mixed.name', names), meta: rootText('root.quad.mixed.meta'), desc: rootText('root.quad.mixed.desc') };
    }
    return { name: rootName('root.quad.normal.name', names), meta: rootText('root.quad.normal.meta'), desc: rootText('root.quad.normal.desc') };
  }

  if (entries.every((entry) => entry.value === 100)) {
    return { name: rootText('root.five.god.name'), meta: rootText('root.five.god.meta'), desc: rootText('root.five.god.desc') };
  }
  if (entries.every((entry) => entry.value >= 90)) {
    return { name: rootText('root.five.heaven.name'), meta: rootText('root.five.heaven.meta'), desc: rootText('root.five.heaven.desc') };
  }
  if (entries.every((entry) => entry.value >= 80)) {
    return { name: rootText('root.five.true.name'), meta: rootText('root.five.true.meta'), desc: rootText('root.five.true.desc') };
  }
  if (spread <= 10 && entries[4].value >= 55) {
    return { name: rootText('root.five.balanced.name'), meta: rootText('root.five.balanced.meta'), desc: rootText('root.five.balanced.desc') };
  }
  if (total <= 45) {
    return { name: rootText('root.five.waste.name'), meta: rootText('root.five.waste.meta'), desc: rootText('root.five.waste.desc') };
  }
  if (total <= 120) {
    return { name: rootText('root.five.mixed.name'), meta: rootText('root.five.mixed.meta'), desc: rootText('root.five.mixed.desc') };
  }
  if (total <= 220) {
    return { name: rootText('root.five.low.name'), meta: rootText('root.five.low.meta'), desc: rootText('root.five.low.desc') };
  }
  if (total <= 320) {
    return { name: rootText('root.five.high.name'), meta: rootText('root.five.high.meta'), desc: rootText('root.five.high.desc') };
  }
  return { name: rootText('root.five.supreme.name'), meta: rootText('root.five.supreme.meta'), desc: rootText('root.five.supreme.desc') };
}
