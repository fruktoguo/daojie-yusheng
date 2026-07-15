/**
 * 功法书详情共用模型与渲染器。
 *
 * 悬浮提示和背包详情必须复用同一份功法属性、技能效果、消耗与冷却口径。
 */
import type { ItemStack } from '@mud/shared';
import { getTechniqueCategoryLabel, getTechniqueGradeLabel } from '../domain-labels';
import {
  getLocalRealmLevelEntry,
  getLocalTechniqueTemplate,
  getPreviewTechniqueMaxLevel,
  resolvePreviewTechniqueTemplateState,
  resolveTechniqueIdFromBookItem,
} from '../content/local-templates';
import { formatDisplayInteger } from '../utils/number';
import { buildSkillTooltipContent, type SkillTooltipAsideCard, type SkillTooltipContent } from './skill-tooltip';
import { formatTechniqueCumulativeBonusSummary } from './technique-bonus-summary';
import { t } from './i18n';

export interface TechniqueBookSkillDetailContent {
  skillId: string;
  name: string;
  lines: string[];
  asideCards: SkillTooltipAsideCard[];
}

export interface TechniqueBookDetailContent {
  summaryLines: string[];
  skills: TechniqueBookSkillDetailContent[];
}

/** 构建功法书共用详情，动态模板未补齐时保留可用的降级信息。 */
export function buildTechniqueBookDetailContent(item: ItemStack): TechniqueBookDetailContent {
  const techniqueId = resolveTechniqueIdFromBookItem(item);
  const technique = techniqueId ? getLocalTechniqueTemplate(techniqueId) : null;
  if (!technique) {
    return { summaryLines: buildTechniqueBookFallbackLines(item), skills: [] };
  }
  const realmLabel = technique.realmLv
    ? (getLocalRealmLevelEntry(technique.realmLv)?.displayName ?? `Lv.${formatDisplayInteger(technique.realmLv)}`)
    : t('equipment-tooltip.value.unknown', undefined);
  const maxLevel = getPreviewTechniqueMaxLevel(technique);
  const learnMaxLevel = Number.isFinite(Number(item.learnTechniqueMaxLevel))
    ? Math.max(1, Math.min(maxLevel, Math.floor(Number(item.learnTechniqueMaxLevel))))
    : maxLevel;
  const previewTechnique = resolvePreviewTechniqueTemplateState(technique, learnMaxLevel);
  const skillNames = previewTechnique.skills
    .map((skill) => skill.name.trim())
    .filter((name) => name.length > 0);
  return {
    summaryLines: [
      renderPlainLine(t('equipment-tooltip.technique-book.technique', undefined), previewTechnique.name),
      renderPlainLine(
        t('equipment-tooltip.technique-book.desc', undefined),
        technique.desc?.trim() || item.desc?.trim() || t('equipment-tooltip.technique-book.no-desc', undefined),
      ),
      renderPlainLine(t('equipment-tooltip.label.category', undefined), getTechniqueCategoryLabel(previewTechnique.category)),
      renderPlainLine(t('equipment-tooltip.technique-book.realm', undefined), realmLabel),
      renderPlainLine(t('equipment-tooltip.technique-book.grade', undefined), getTechniqueGradeLabel(previewTechnique.grade)),
      renderPlainLine('可修至', learnMaxLevel >= maxLevel ? `满层（${formatDisplayInteger(maxLevel)} 层）` : `${formatDisplayInteger(learnMaxLevel)} / ${formatDisplayInteger(maxLevel)} 层`),
      renderPlainLine(
        learnMaxLevel >= maxLevel ? t('equipment-tooltip.technique-book.max-attrs', undefined) : '可修上限属性',
        formatTechniqueCumulativeBonusSummary(learnMaxLevel, previewTechnique.layers),
      ),
      renderPlainLine(
        t('equipment-tooltip.technique-book.skills-label', { count: skillNames.length > 0 ? `（${formatDisplayInteger(skillNames.length)}）` : '' }),
        skillNames.length > 0 ? skillNames.join('、') : t('equipment-tooltip.value.none', undefined),
      ),
    ],
    skills: previewTechnique.skills.map((skill) => {
      const content = buildSkillTooltipContent(skill, {
        techLevel: learnMaxLevel,
        unlockLevel: Math.max(1, Math.floor(Number(skill.unlockLevel) || 1)),
      });
      return {
        skillId: skill.id,
        name: skill.name,
        lines: content.lines,
        asideCards: content.asideCards,
      };
    }),
  };
}

/** 把共用详情展开为悬浮提示内容。 */
export function buildTechniqueBookTooltipContent(item: ItemStack): SkillTooltipContent {
  const detail = buildTechniqueBookDetailContent(item);
  return {
    lines: [
      ...detail.summaryLines,
      ...detail.skills.flatMap((skill) => [
        `<span class="technique-book-skill-title">${escapeHtml(skill.name)}</span>`,
        ...skill.lines,
      ]),
    ],
    asideCards: detail.skills.flatMap((skill) => skill.asideCards),
  };
}

/** 把共用详情展开为背包详情弹层中的局部 HTML。 */
export function renderTechniqueBookDetailHtml(item: ItemStack): string {
  const detail = buildTechniqueBookDetailContent(item);
  const summaryHtml = detail.summaryLines
    .map((line) => `<div class="inventory-technique-book-summary-line">${line}</div>`)
    .join('');
  const skillsHtml = detail.skills.map((skill) => {
    const linesHtml = skill.lines
      .map((line) => `<div class="inventory-technique-skill-line">${line}</div>`)
      .join('');
    const asideHtml = skill.asideCards.length > 0
      ? `<div class="inventory-technique-buff-list">${skill.asideCards.map(renderAsideCardHtml).join('')}</div>`
      : '';
    return `
      <section class="inventory-technique-skill-detail" data-technique-book-skill-id="${escapeHtml(skill.skillId)}">
        <strong class="inventory-technique-skill-title">${escapeHtml(skill.name)}</strong>
        <div class="inventory-technique-skill-lines">${linesHtml}</div>
        ${asideHtml}
      </section>
    `;
  }).join('');
  return `<div class="inventory-technique-book-summary">${summaryHtml}</div>${skillsHtml}`;
}

function buildTechniqueBookFallbackLines(item: ItemStack): string[] {
  const learnMaxLevel = resolveTechniqueBookItemLearnMaxLevel(item);
  const lines = [
    renderPlainLine(t('equipment-tooltip.technique-book.desc', undefined), item.desc?.trim() || t('equipment-tooltip.technique-book.no-desc', undefined)),
  ];
  if (learnMaxLevel !== null) {
    lines.push(renderPlainLine('可修至', `${formatDisplayInteger(learnMaxLevel)} 层`));
  }
  return lines;
}

function resolveTechniqueBookItemLearnMaxLevel(item: ItemStack): number | null {
  if (Number.isFinite(Number(item.learnTechniqueMaxLevel))) {
    return Math.max(1, Math.floor(Number(item.learnTechniqueMaxLevel)));
  }
  const match = item.desc.match(/前\s*(\d+)\s*层/);
  return match ? Math.max(1, Math.floor(Number(match[1]) || 1)) : null;
}

function renderAsideCardHtml(card: SkillTooltipAsideCard): string {
  return `
    <div class="inventory-technique-buff-detail ${card.tone === 'debuff' ? 'debuff' : 'buff'}">
      <div class="inventory-technique-buff-head">
        ${card.mark ? `<span class="inventory-technique-buff-mark">${escapeHtml(card.mark)}</span>` : ''}
        <strong>${escapeHtml(card.title)}</strong>
      </div>
      ${card.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
    </div>
  `;
}

function renderPlainLine(label: string, value: string): string {
  return `<span class="skill-tooltip-label">${escapeHtml(label)}：</span>${escapeHtml(value)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
