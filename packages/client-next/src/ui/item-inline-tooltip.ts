import type { ItemStack } from '@mud/shared-next';
import { getLocalItemTemplate } from '../content/local-templates';
import { getMonsterLocationEntry, loadMonsterLocationEntry } from '../content/monster-locations';
import { LOCAL_EDITOR_CATALOG } from '../constants/world/editor-catalog';
import { buildItemTooltipPayload } from './equipment-tooltip';
import { FloatingTooltip, prefersPinnedTooltipInteraction } from './floating-tooltip';

/** InlineItemChipTone：定义该类型的结构与数据语义。 */
type InlineItemChipTone = 'reward' | 'required' | 'material' | 'monster' | 'default';

/** InlineItemMention：定义该接口的能力与字段约束。 */
interface InlineItemMention {
  itemId: string;
  name: string;
}

/** RenderInlineItemChipOptions：定义该接口的能力与字段约束。 */
interface RenderInlineItemChipOptions {
  count?: number;
  label?: string;
  tone?: InlineItemChipTone;
}

const INLINE_REFERENCE_SELECTOR = '[data-inline-item-id], [data-inline-monster-id]';
const inlineItemTooltip = new FloatingTooltip('floating-tooltip inline-item-tooltip');
const boundRoots = new WeakSet<HTMLElement>();
let activeTooltipNode: HTMLElement | null = null;
let tooltipRequestToken = 0;

const inlineItemMentions = LOCAL_EDITOR_CATALOG.items
  .map((item) => ({ itemId: item.itemId, name: item.name.trim() }))
  .filter((item): item is InlineItemMention => item.name.length > 0)
  .sort((left, right) => right.name.length - left.name.length);

const mentionCandidatesByFirstChar = inlineItemMentions.reduce((result, mention) => {
  const firstChar = [...mention.name][0];
  if (!firstChar) {
    return result;
  }
  const bucket = result.get(firstChar) ?? [];
  bucket.push(mention);
  result.set(firstChar, bucket);
  return result;
}, new Map<string, InlineItemMention[]>());

/** escapeHtml：执行对应的业务逻辑。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** escapeHtmlAttr：执行对应的业务逻辑。 */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

/** normalizeCount：执行对应的业务逻辑。 */
function normalizeCount(count: number | undefined): number {
  if (!Number.isFinite(count)) {
    return 1;
  }
  return Math.max(1, Math.floor(Number(count)));
}

/** buildLocalItemStack：执行对应的业务逻辑。 */
function buildLocalItemStack(itemId: string, count = 1): ItemStack | null {
  const template = getLocalItemTemplate(itemId);
  if (!template) {
    return null;
  }
  return {
    itemId: template.itemId,
    name: template.name,
    type: template.type,
    count: normalizeCount(count),
    desc: template.desc ?? '',
    groundLabel: template.groundLabel,
    grade: template.grade,
    level: template.level,
    equipSlot: template.equipSlot,
    equipAttrs: template.equipAttrs,
    equipStats: template.equipStats,
    equipValueStats: template.equipValueStats,
    effects: template.effects,
    tags: template.tags,
  };
}

/** resolveTooltipPayload：执行对应的业务逻辑。 */
async function resolveTooltipPayload(node: HTMLElement) {
  const itemId = node.dataset.inlineItemId;
  if (itemId) {
    const itemCount = normalizeCount(Number.parseInt(node.dataset.inlineItemCount ?? '1', 10));
    const fallbackName = node.dataset.inlineItemName?.trim() || itemId;
    const stack = buildLocalItemStack(itemId, itemCount);
    if (!stack) {
      return {
        title: fallbackName,
        lines: [],
        asideCards: [],
        allowHtml: false,
      };
    }
    return buildItemTooltipPayload(stack);
  }
  const monsterId = node.dataset.inlineMonsterId;
  if (!monsterId) {
    return null;
  }
  const fallbackName = node.dataset.inlineMonsterName?.trim() || monsterId;
  const location = await loadMonsterLocationEntry(monsterId);
  if (!location) {
    return {
      title: fallbackName,
      lines: [],
      asideCards: [],
      allowHtml: false,
    };
  }
  return {
    title: location.monsterName || fallbackName,
    lines: [
      `出没地图：${location.mapName}`,
      ...(typeof location.dangerLevel === 'number' ? [`地图等级：${location.dangerLevel}`] : []),
      ...(location.totalMaps > 1 ? ['已优先显示地图等级更低的区域'] : []),
    ],
    asideCards: [],
    allowHtml: false,
  };
}

/** showTooltip：执行对应的业务逻辑。 */
async function showTooltip(node: HTMLElement, clientX: number, clientY: number): Promise<void> {
  const requestToken = ++tooltipRequestToken;
  activeTooltipNode = node;
  const tooltip = await resolveTooltipPayload(node);
  if (!tooltip) {
    return;
  }
  if (activeTooltipNode !== node || requestToken !== tooltipRequestToken) {
    return;
  }
  inlineItemTooltip.show(tooltip.title, tooltip.lines, clientX, clientY, {
    allowHtml: tooltip.allowHtml,
    asideCards: tooltip.asideCards,
  });
}

/** renderInlineItemChip：执行对应的业务逻辑。 */
export function renderInlineItemChip(itemId: string, options?: RenderInlineItemChipOptions): string {
  const template = getLocalItemTemplate(itemId);
  const label = options?.label?.trim() || template?.name || itemId;
  const count = options?.count;
  const countText = Number.isFinite(count) ? ` x${normalizeCount(count)}` : '';
  const tone = options?.tone ?? 'default';
  return `<span class="inline-item-chip inline-item-chip--${tone}" data-inline-item-id="${escapeHtmlAttr(itemId)}" data-inline-item-name="${escapeHtmlAttr(label)}"${Number.isFinite(count) ? ` data-inline-item-count="${normalizeCount(count)}"` : ''}>${escapeHtml(label)}${countText ? `<span class="inline-item-chip-count">${escapeHtml(countText)}</span>` : ''}</span>`;
}

/** renderInlineMonsterChip：执行对应的业务逻辑。 */
export function renderInlineMonsterChip(monsterId: string, options?: { label?: string }): string {
  const location = getMonsterLocationEntry(monsterId);
  const label = options?.label?.trim() || location?.monsterName || monsterId;
  return `<span class="inline-item-chip inline-item-chip--monster" data-inline-monster-id="${escapeHtmlAttr(monsterId)}" data-inline-monster-name="${escapeHtmlAttr(label)}">${escapeHtml(label)}</span>`;
}

/** renderTextWithInlineItemHighlights：执行对应的业务逻辑。 */
export function renderTextWithInlineItemHighlights(text: string): string {
  if (!text.trim()) {
    return '';
  }

  let html = '';
  let index = 0;
  while (index < text.length) {
    const firstChar = text[index];
    const candidates = mentionCandidatesByFirstChar.get(firstChar) ?? [];
    const matched = candidates.find((candidate) => text.startsWith(candidate.name, index));
    if (matched) {
      html += renderInlineItemChip(matched.itemId, { label: matched.name, tone: 'material' });
      index += matched.name.length;
      continue;
    }
    html += escapeHtml(text[index] ?? '');
    index += 1;
  }
  return html;
}

/** bindInlineItemTooltips：执行对应的业务逻辑。 */
export function bindInlineItemTooltips(root: HTMLElement): void {
  if (boundRoots.has(root)) {
    return;
  }
  boundRoots.add(root);

  const tapMode = prefersPinnedTooltipInteraction();

  root.addEventListener('click', (event) => {
    if (!tapMode || !(event instanceof PointerEvent)) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const node = target.closest<HTMLElement>(INLINE_REFERENCE_SELECTOR);
    if (!node) {
      return;
    }
    if (inlineItemTooltip.isPinnedTo(node)) {
      activeTooltipNode = null;
      inlineItemTooltip.hide(true);
      return;
    }
    const clientX = event.clientX;
    const clientY = event.clientY;
    const requestToken = ++tooltipRequestToken;
    activeTooltipNode = node;
    void resolveTooltipPayload(node).then((tooltip) => {
      if (!tooltip || activeTooltipNode !== node || requestToken !== tooltipRequestToken) {
        return;
      }
      inlineItemTooltip.showPinned(node, tooltip.title, tooltip.lines, clientX, clientY, {
        allowHtml: tooltip.allowHtml,
        asideCards: tooltip.asideCards,
      });
    });
    event.preventDefault();
    event.stopPropagation();
  }, true);

  root.addEventListener('pointermove', (event) => {
    if (!(event instanceof PointerEvent) || (tapMode && inlineItemTooltip.isPinned())) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      if (activeTooltipNode && root.contains(activeTooltipNode)) {
        activeTooltipNode = null;
        inlineItemTooltip.hide();
      }
      return;
    }
    const node = target.closest<HTMLElement>(INLINE_REFERENCE_SELECTOR);
    if (!node) {
      if (activeTooltipNode && root.contains(activeTooltipNode) && !inlineItemTooltip.isPinnedTo(activeTooltipNode)) {
        activeTooltipNode = null;
        inlineItemTooltip.hide();
      }
      return;
    }
    if (activeTooltipNode !== node) {
      void showTooltip(node, event.clientX, event.clientY);
      return;
    }
    inlineItemTooltip.move(event.clientX, event.clientY);
  });

  root.addEventListener('pointerleave', () => {
    if (activeTooltipNode && root.contains(activeTooltipNode) && !inlineItemTooltip.isPinnedTo(activeTooltipNode)) {
      activeTooltipNode = null;
      tooltipRequestToken += 1;
      inlineItemTooltip.hide();
    }
  });

  root.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest(INLINE_REFERENCE_SELECTOR)) {
      return;
    }
    if (activeTooltipNode && root.contains(activeTooltipNode) && !inlineItemTooltip.isPinnedTo(activeTooltipNode)) {
      activeTooltipNode = null;
      tooltipRequestToken += 1;
      inlineItemTooltip.hide();
    }
  });
}

