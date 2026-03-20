interface SelectionSnapshot {
  start: number;
  end: number;
}

function containsSelection(root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return false;
  }
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer);
}

function pointToOffset(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

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

export function preserveSelection(root: HTMLElement, mutate: () => void): void {
  const snapshot = captureSelection(root);
  mutate();
  restoreSelection(root, snapshot);
}
