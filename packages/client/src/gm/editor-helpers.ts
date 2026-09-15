/**
 * gm/editor-helpers.ts —— GM 编辑器纯辅助函数。
 *
 * 从 gm.ts 抽取：getEditorTabLabel/setTextLikeValue/renderEditorTabSection/
 * getAttrDisplayNumber/normalizeInventorySearchText/buildCraftSkillSaveSnapshot/
 * getTechniqueCategoryDisplayLabel/getTechniqueGradeDisplayLabel/
 * normalizeTechniquePageSize/renderAttributeSummaryGrid。
 * 全部为纯函数，仅依赖 @mud/shared 类型和常量、format.ts 的 escapeHtml。
 */

import {
  ATTR_KEYS,
  ATTR_KEY_LABELS,
  DEFAULT_BASE_ATTRS,
  type GmPlayerUpdateSection,
  type PlayerState,
  TECHNIQUE_CATEGORY_LABELS,
  TECHNIQUE_GRADE_LABELS,
} from '@mud/shared';
import { escapeHtml } from './format';

/** GmEditorTab：编辑器标签页类型。 */
export type GmEditorTab = GmPlayerUpdateSection | 'benefits' | 'shortcuts' | 'mail' | 'risk' | 'persisted';

/** GM_TECHNIQUE_PAGE_SIZE_OPTIONS：功法分页大小选项。 */
export const GM_TECHNIQUE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

/** getEditorTabLabel：读取编辑器标签页标签。 */
export function getEditorTabLabel(tab: GmEditorTab): string {
  switch (tab) {
    case 'basic':
      return '基础';
    case 'position':
      return '位置';
    case 'realm':
      return '属性';
    case 'buffs':
      return '增益';
    case 'techniques':
      return '功法';
    case 'craftSkills':
      return '技艺';
    case 'benefits':
      return '权益';
    case 'shortcuts':
      return '快捷操作';
    case 'items':
      return '物品';
    case 'quests':
      return '任务';
    case 'mail':
      return '邮件';
    case 'risk':
      return '风险检测';
    case 'persisted':
      return '数据库';
  }
}

/** setTextLikeValue：设置文本类输入值，保留焦点字段。 */
export function setTextLikeValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
  preserveFocusedField = true,
): void {
  if (field.value === value) return;
  if (preserveFocusedField && document.activeElement === field) {
    return;
  }
  field.value = value;
}

/** renderEditorTabSection：渲染编辑器标签页区域。 */
export function renderEditorTabSection(tab: GmEditorTab, content: string): string {
  return `<div data-editor-tab="${tab}">${content}</div>`;
}

/** getAttrDisplayNumber：读取属性显示数字。 */
export function getAttrDisplayNumber(value: number | undefined, fallback = 0): string {
  return String(Number.isFinite(value) ? value : fallback);
}

/** normalizeInventorySearchText：规范化背包搜索文本。 */
export function normalizeInventorySearchText(value: string): string {
  return value.trim().toLowerCase();
}

/** buildCraftSkillSaveSnapshot：构建技艺保存快照。 */
export function buildCraftSkillSaveSnapshot(skill: PlayerState['alchemySkill'] | undefined): NonNullable<PlayerState['alchemySkill']> {
  return {
    level: Math.max(1, Math.trunc(Number(skill?.level) || 1)),
    exp: Math.max(0, Math.trunc(Number(skill?.exp) || 0)),
    expToNext: Math.max(0, Math.trunc(Number(skill?.expToNext) || 0)),
  };
}

/** getTechniqueCategoryDisplayLabel：读取功法类别显示标签。 */
export function getTechniqueCategoryDisplayLabel(category: string | null | undefined): string {
  return category ? (TECHNIQUE_CATEGORY_LABELS as Record<string, string>)[category] ?? category : '未知类别';
}

/** getTechniqueGradeDisplayLabel：读取功法品阶显示标签。 */
export function getTechniqueGradeDisplayLabel(grade: string | null | undefined): string {
  return grade ? (TECHNIQUE_GRADE_LABELS as Record<string, string>)[grade] ?? grade : '未知品阶';
}

/** normalizeTechniquePageSize：规范化功法分页大小。 */
export function normalizeTechniquePageSize(value: unknown): number {
  const numeric = Math.trunc(Number(value));
  return GM_TECHNIQUE_PAGE_SIZE_OPTIONS.includes(numeric as (typeof GM_TECHNIQUE_PAGE_SIZE_OPTIONS)[number])
    ? numeric
    : 20;
}

/** renderAttributeSummaryGrid：渲染六维基础/总属性摘要。 */
export function renderAttributeSummaryGrid(draft: PlayerState): string {
  return `
    <div class="editor-attr-summary-grid">
      ${ATTR_KEYS.map((key) => {
        const totalValue = draft.finalAttrs?.[key] ?? draft.baseAttrs?.[key] ?? DEFAULT_BASE_ATTRS[key];
        return `
          <div class="editor-attr-summary-card">
            <div class="editor-attr-summary-label">${escapeHtml(ATTR_KEY_LABELS[key])}</div>
            <div class="editor-attr-summary-value" data-preview="attr-total" data-key="${escapeHtml(key)}">${escapeHtml(getAttrDisplayNumber(totalValue, DEFAULT_BASE_ATTRS[key]))}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
