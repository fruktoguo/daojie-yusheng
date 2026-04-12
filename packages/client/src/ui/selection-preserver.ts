/**
 * 文本选区保持工具
 * 在 innerHTML 重写前后自动保存和恢复用户的文本选区
 */

interface SelectionSnapshot {
  start: number;
  end: number;
}

/** containsSelection：执行对应的业务逻辑。 */
function containsSelection(root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer);
}

/** pointToOffset：执行对应的业务逻辑。 */
function pointToOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** captureSelection：执行对应的业务逻辑。 */
function captureSelection(root: HTMLElement): SelectionSnapshot | null {
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

/** resolveOffset：执行对应的业务逻辑。 */
function resolveOffset(root: HTMLElement, offset: number): { node: Node; offset: number } | null {
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
    consumed = next;
    current = walker.nextNode();
  }

  return null;
}

/** restoreSelection：执行对应的业务逻辑。 */
function restoreSelection(root: HTMLElement, snapshot: SelectionSnapshot | null): void {
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

/** 在执行 mutate 前后自动保存和恢复 root 内的文本选区 */
export function preserveSelection(root: HTMLElement, mutate: () => void): void {
  const snapshot = captureSelection(root);
  mutate();
  restoreSelection(root, snapshot);
}

