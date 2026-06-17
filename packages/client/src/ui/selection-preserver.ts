/**
 * 本文件是客户端 DOM UI 的 selection preserver 模块，负责具体面板、弹层或渲染片段。
 *
 * 维护时优先保持局部更新和原有交互状态，不在 UI 层裁定资产、战斗或移动合法性。
 */
/**
 * 文本选区保持工具
 * 在 innerHTML 重写前后自动保存和恢复用户的文本选区
 */

interface SelectionSnapshot {
/**
 * start：start相关字段。
 */

  start: number;  
  /**
 * end：end相关字段。
 */

  end: number;
}

/** containsSelection：判断是否选中项。 */
function containsSelection(root: HTMLElement): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer);
}

/** pointToOffset：处理坐标To偏移。 */
function pointToOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** captureSelection：处理capture选中项。 */
function captureSelection(root: HTMLElement): SelectionSnapshot | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!containsSelection(root)) {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  return {
    start: pointToOffset(root, range.startContainer, range.startOffset),
    end: pointToOffset(root, range.endContainer, range.endOffset),
  };
}

/** resolveOffset：解析偏移。 */
function resolveOffset(root: HTMLElement, offset: number): {
/**
 * node：node相关字段。
 */
 node: Node;
 /**
 * offset：offset相关字段。
 */
 offset: number } | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  let consumed = 0;

  while (current) {
    const text = current.textContent ?? '';
    const next = consumed + text.length;
    if (offset <= next) {
      return {
        node: current,
        offset: Math.max(0, Math.min(text.length, offset - consumed)),
      };
    }
    /** consumed：consumed。 */
    consumed = next;
    /** current：当前。 */
    current = walker.nextNode();
  }

  return null;
}

/** restoreSelection：处理restore选中项。 */
function restoreSelection(root: HTMLElement, snapshot: SelectionSnapshot | null): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!snapshot) {
    return;
  }
  const startPoint = resolveOffset(root, snapshot.start);
  const endPoint = resolveOffset(root, snapshot.end);
  if (!startPoint || !endPoint) {
    return;
  }

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);

  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** ScrollSnapshot：滚动位置快照。 */
interface ScrollSnapshot {
/** top：top相关字段。 */

  top: number;
/** left：left相关字段。 */

  left: number;
}

/** captureScroll：保存root的滚动位置。 */
function captureScroll(root: HTMLElement): ScrollSnapshot {
  return { top: root.scrollTop, left: root.scrollLeft };
}

/** restoreScroll：恢复root的滚动位置。 */
function restoreScroll(root: HTMLElement, snapshot: ScrollSnapshot): void {
  // 新内容可能短于旧内容，浏览器会自动把越界的 scrollTop/Left 裁剪到 maxScrollTop/Left，无需手动 clamp。
  root.scrollTop = snapshot.top;
  root.scrollLeft = snapshot.left;
}

/** 在执行 mutate 前后自动保存和恢复 root 内的文本选区与滚动位置。
 *  detailModalHost 等 modal 在 patch 时会 replaceChildren 重建 body 子节点，
 *  当 body 自身是滚动容器（如 offline-gain / heaven-gate 变体）时滚动会丢失；
 *  这里同时保留 root 的 scrollTop/scrollLeft，确保长列表 patch 后不跳回顶部，也不打断当前滚动位置。 */
export function preserveSelection(root: HTMLElement, mutate: () => void): void {
  const selectionSnapshot = captureSelection(root);
  const scrollSnapshot = captureScroll(root);
  mutate();
  restoreScroll(root, scrollSnapshot);
  restoreSelection(root, selectionSnapshot);
}




