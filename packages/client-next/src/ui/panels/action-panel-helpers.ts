import { ActionDef, AutoBattleSkillConfig, PlayerState, SkillDef, type ElementKey, type SkillDamageKind } from '@mud/shared-next';
import { getElementKeyLabel } from '../../domain-labels';

/** normalizeShortcutKey：执行对应的业务逻辑。 */
export function normalizeShortcutKey(key: string): string | null {
  if (key.length !== 1) return null;
  const lower = key.toLowerCase();
  if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) {
    return lower;
  }
  return null;
}

/** escapeHtml：执行对应的业务逻辑。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** appendUnique：执行对应的业务逻辑。 */
export function appendUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

/** isRecord：执行对应的业务逻辑。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** readBoolean：执行对应的业务逻辑。 */
export function readBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return true;
}

/** decodePresetTextValue：执行对应的业务逻辑。 */
export function decodePresetTextValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** resolveSkillDamageProfile：执行对应的业务逻辑。 */
function resolveSkillDamageProfile(skill: SkillDef): { kinds: SkillDamageKind[]; elements: ElementKey[] } {
  const kinds: SkillDamageKind[] = [];
  const elements: ElementKey[] = [];
  for (const effect of skill.effects) {
    if (effect.type !== 'damage') {
      continue;
    }
/** appendUnique：处理当前场景中的对应操作。 */
    appendUnique(kinds, effect.damageKind === 'physical' ? 'physical' : 'spell');
    if (effect.element) {
      appendUnique(elements, effect.element);
    }
  }
  return { kinds, elements };
}

/** formatSkillAffinityLabel：执行对应的业务逻辑。 */
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

/** getSkillAffinityBadge：执行对应的业务逻辑。 */
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

/** getSkillEnabledTechniques：执行对应的业务逻辑。 */
export function getSkillEnabledTechniques(player: PlayerState): PlayerState['techniques'] {
  return player.techniques.filter((technique) => technique.skillsEnabled !== false);
}

/** ActionPanelAction：定义该类型的结构与数据语义。 */
export type ActionPanelAction = ActionDef;
/** ActionPanelSkillDraft：定义该类型的结构与数据语义。 */
export type ActionPanelSkillDraft = AutoBattleSkillConfig;




