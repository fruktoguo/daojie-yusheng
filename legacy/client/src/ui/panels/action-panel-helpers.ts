import { type ElementKey, ItemStack, PlayerState, SkillDef, type SkillDamageKind } from '@mud/shared';
import { getElementKeyLabel } from '../../domain-labels';


export function normalizeShortcutKey(key: string): string | null {
  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
    return lower;
  }
  return null;
}


export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


export function appendUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/** isRecord：判断并返回条件结果。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}


export function readBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return true;
}

/** isAutoUseConsumableCandidate：判断并返回条件结果。 */
export function isAutoUseConsumableCandidate(
  item: Pick<ItemStack, 'healAmount' | 'healPercent' | 'qiPercent' | 'consumeBuffs'>,
): boolean {
  return (item.healAmount ?? 0) > 0
    || (item.healPercent ?? 0) > 0
    || (item.qiPercent ?? 0) > 0
    || (item.consumeBuffs?.length ?? 0) > 0;
}


export function decodePresetTextValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}


function resolveSkillDamageProfile(skill: SkillDef): { kinds: SkillDamageKind[]; elements: ElementKey[] } {
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

/** formatSkillAffinityLabel：格式化输出字符串用于展示。 */
function formatSkillAffinityLabel(
  kind: 'physical' | 'spell' | 'mixed' | 'utility',
  element: ElementKey | 'multi' | 'neutral',
): { label: string; title: string } {
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

export function getSkillAffinityBadge(skill: SkillDef): {
  label: string;
  title: string;
  tone: 'physical' | 'spell' | 'mixed' | 'utility';
  element: ElementKey | 'multi' | 'neutral';
} {
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

export function getSkillEnabledTechniques(player: PlayerState): PlayerState['techniques'] {
  return player.techniques.filter((technique) => technique.skillsEnabled !== false);
}



