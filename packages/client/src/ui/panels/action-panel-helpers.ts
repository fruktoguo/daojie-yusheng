import { ActionDef, AutoBattleSkillConfig, PlayerState, SkillDef, type ElementKey, type SkillDamageKind } from '@mud/shared-next';
import { getElementKeyLabel } from '../../domain-labels';

/** normalizeShortcutKey：规范化Shortcut Key。 */
export function normalizeShortcutKey(key: string): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
    return lower;
  }
  return null;
}

/** escapeHtml：转义 HTML 文本中的危险字符。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** appendUnique：处理append Unique。 */
export function appendUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/** isRecord：判断是否记录。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** readBoolean：处理read Boolean。 */
export function readBoolean(...values: unknown[]): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return true;
}

/** decodePresetTextValue：解码预设文本值。 */
export function decodePresetTextValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** resolveSkillDamageProfile：解析技能Damage Profile。 */
function resolveSkillDamageProfile(skill: SkillDef): {
/**
 * kinds：对象字段。
 */
 kinds: SkillDamageKind[];
 /**
 * elements：对象字段。
 */
 elements: ElementKey[] } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const kinds: SkillDamageKind[] = [];
  const elements: ElementKey[] = [];
  for (const effect of skill.effects) {
    if (effect.type !== 'damage') {
      continue;
    }
    appendUnique(kinds, effect.damageKind === 'physical' ? 'physical' : 'spell');
    if (effect.element) {
      appendUnique(elements, effect.element);
    }
  }
  return { kinds, elements };
}

/** formatSkillAffinityLabel：格式化技能Affinity标签。 */
function formatSkillAffinityLabel(
  kind: 'physical' | 'spell' | 'mixed' | 'utility',
  element: ElementKey | 'multi' | 'neutral',
): {
/**
 * label：对象字段。
 */
 label: string;
 /**
 * title：对象字段。
 */
 title: string } {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const shortKindLabel = kind === 'physical'
    ? '物'
    : kind === 'spell'
      ? '法'
      : kind === 'mixed'
        ? '混'
        : '辅';
  const fullKindLabel = kind === 'physical'
    ? '物理'
    : kind === 'spell'
      ? '法术'
      : kind === 'mixed'
        ? '混合'
        : '辅助';
  const elementLabel = element === 'multi'
    ? '五行'
    : element === 'neutral'
      ? ''
      : `${getElementKeyLabel(element)}行`;
  if (!elementLabel) {
    return {
      label: kind === 'utility' ? '辅助' : fullKindLabel,
      title: kind === 'utility' ? '辅助型技能' : fullKindLabel,
    };
  }
  return {
    label: `${element === 'multi' ? elementLabel : getElementKeyLabel(element)}${shortKindLabel}`,
    title: `${elementLabel}${fullKindLabel}`,
  };
}

/** getSkillAffinityBadge：读取技能Affinity Badge。 */
export function getSkillAffinityBadge(skill: SkillDef): {
/**
 * label：对象字段。
 */

  label: string;  
  /**
 * title：对象字段。
 */

  title: string;  
  /**
 * tone：对象字段。
 */

  tone: 'physical' | 'spell' | 'mixed' | 'utility';  
  /**
 * element：对象字段。
 */

  element: ElementKey | 'multi' | 'neutral';
} {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const { kinds, elements } = resolveSkillDamageProfile(skill);
  if (kinds.length === 0) {
    return {
      label: '辅助',
      title: '辅助型技能',
      tone: 'utility',
      element: 'neutral',
    };
  }
  const tone = kinds.length > 1 ? 'mixed' : (kinds[0] === 'physical' ? 'physical' : 'spell');
  const element = elements.length > 1 ? 'multi' : (elements[0] ?? 'neutral');
  const text = formatSkillAffinityLabel(tone, element);
  return {
    label: text.label,
    title: text.title,
    tone,
    element,
  };
}

/** getSkillEnabledTechniques：读取技能启用Techniques。 */
export function getSkillEnabledTechniques(player: PlayerState): PlayerState['techniques'] {
  return player.techniques.filter((technique) => technique.skillsEnabled !== false);
}

/** ActionPanelAction：动作面板的技能快捷项定义。 */
export type ActionPanelAction = ActionDef;
/** ActionPanelSkillDraft：动作面板里的自动战斗技能草稿。 */
export type ActionPanelSkillDraft = AutoBattleSkillConfig;






