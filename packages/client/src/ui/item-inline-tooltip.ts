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
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** name：定义该变量以承载业务值。 */
  name: string;
}

/** RenderInlineItemChipOptions：定义该接口的能力与字段约束。 */
interface RenderInlineItemChipOptions {
  count?: number;
  label?: string;
  tone?: InlineItemChipTone;
}

/** INLINE_REFERENCE_SELECTOR：定义该变量以承载业务值。 */
const INLINE_REFERENCE_SELECTOR = '[data-inline-item-id], [data-inline-monster-id]';
/** inlineItemTooltip：定义该变量以承载业务值。 */
const inlineItemTooltip = new FloatingTooltip('floating-tooltip inline-item-tooltip');
/** boundRoots：定义该变量以承载业务值。 */
const boundRoots = new WeakSet<HTMLElement>();
/** activeTooltipNode：定义该变量以承载业务值。 */
let activeTooltipNode: HTMLElement | null = null;
/** tooltipRequestToken：定义该变量以承载业务值。 */
let tooltipRequestToken = 0;

/** inlineItemMentions：定义该变量以承载业务值。 */
const inlineItemMentions = LOCAL_EDITOR_CATALOG.items
  .map((item) => ({ itemId: item.itemId, name: item.name.trim() }))
  .filter((item): item is InlineItemMention => item.name.length > 0)
  .sort((left, right) => right.name.length - left.name.length);

/** mentionCandidatesByFirstChar：定义该变量以承载业务值。 */
const mentionCandidatesByFirstChar = inlineItemMentions.reduce((result, mention) => {
/** firstChar：定义该变量以承载业务值。 */
  const firstChar = [...mention.name][0];
  if (!firstChar) {
    return result;
  }
/** bucket：定义该变量以承载业务值。 */
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
/** template：定义该变量以承载业务值。 */
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
/** itemId：定义该变量以承载业务值。 */
  const itemId = node.dataset.inlineItemId;
  if (itemId) {
/** itemCount：定义该变量以承载业务值。 */
    const itemCount = normalizeCount(Number.parseInt(node.dataset.inlineItemCount ?? '1', 10));
/** fallbackName：定义该变量以承载业务值。 */
    const fallbackName = node.dataset.inlineItemName?.trim() || itemId;
/** stack：定义该变量以承载业务值。 */
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
/** monsterId：定义该变量以承载业务值。 */
  const monsterId = node.dataset.inlineMonsterId;
  if (!monsterId) {
    return null;
  }
/** fallbackName：定义该变量以承载业务值。 */
  const fallbackName = node.dataset.inlineMonsterName?.trim() || monsterId;
/** location：定义该变量以承载业务值。 */
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
/** requestToken：定义该变量以承载业务值。 */
  const requestToken = ++tooltipRequestToken;
  activeTooltipNode = node;
/** tooltip：定义该变量以承载业务值。 */
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
/** template：定义该变量以承载业务值。 */
  const template = getLocalItemTemplate(itemId);
/** label：定义该变量以承载业务值。 */
  const label = options?.label?.trim() || template?.name || itemId;
/** count：定义该变量以承载业务值。 */
  const count = options?.count;
/** countText：定义该变量以承载业务值。 */
  const countText = Number.isFinite(count) ? ` x${normalizeCount(count)}` : '';
/** tone：定义该变量以承载业务值。 */
  const tone = options?.tone ?? 'default';
  return `<span class="inline-item-chip inline-item-chip--${tone}" data-inline-item-id="${escapeHtmlAttr(itemId)}" data-inline-item-name="${escapeHtmlAttr(label)}"${Number.isFinite(count) ? ` data-inline-item-count="${normalizeCount(count)}"` : ''}>${escapeHtml(label)}${countText ? `<span class="inline-item-chip-count">${escapeHtml(countText)}</span>` : ''}</span>`;
}

/** renderInlineMonsterChip：执行对应的业务逻辑。 */
export function renderInlineMonsterChip(monsterId: string, options?: { label?: string }): string {
/** location：定义该变量以承载业务值。 */
  const location = getMonsterLocationEntry(monsterId);
/** label：定义该变量以承载业务值。 */
  const label = options?.label?.trim() || location?.monsterName || monsterId;
  return `<span class="inline-item-chip inline-item-chip--monster" data-inline-monster-id="${escapeHtmlAttr(monsterId)}" data-inline-monster-name="${escapeHtmlAttr(label)}">${escapeHtml(label)}</span>`;
}

/** renderTextWithInlineItemHighlights：执行对应的业务逻辑。 */
export function renderTextWithInlineItemHighlights(text: string): string {
  if (!text.trim()) {
    return '';
  }

/** html：定义该变量以承载业务值。 */
  let html = '';
/** index：定义该变量以承载业务值。 */
  let index = 0;
  while (index < text.length) {
/** firstChar：定义该变量以承载业务值。 */
    const firstChar = text[index];
/** candidates：定义该变量以承载业务值。 */
    const candidates = mentionCandidatesByFirstChar.get(firstChar) ?? [];
/** matched：定义该变量以承载业务值。 */
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

/** tapMode：定义该变量以承载业务值。 */
  const tapMode = prefersPinnedTooltipInteraction();

  root.addEventListener('click', (event) => {
    if (!tapMode || !(event instanceof PointerEvent)) {
      return;
    }
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
/** node：定义该变量以承载业务值。 */
    const node = target.closest<HTMLElement>(INLINE_REFERENCE_SELECTOR);
    if (!node) {
      return;
    }
    if (inlineItemTooltip.isPinnedTo(node)) {
      activeTooltipNode = null;
      inlineItemTooltip.hide(true);
      return;
    }
/** clientX：定义该变量以承载业务值。 */
    const clientX = event.clientX;
/** clientY：定义该变量以承载业务值。 */
    const clientY = event.clientY;
/** requestToken：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      if (activeTooltipNode && root.contains(activeTooltipNode)) {
        activeTooltipNode = null;
        inlineItemTooltip.hide();
      }
      return;
    }
/** node：定义该变量以承载业务值。 */
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
/** target：定义该变量以承载业务值。 */
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

