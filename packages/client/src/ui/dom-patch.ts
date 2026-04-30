import { preserveSelection } from './selection-preserver';

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

type FocusSnapshot = {
  selector: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  scrollTop: number;
};

type ScrollSnapshot = {
  selector: string;
  top: number;
  left: number;
};

const NODE_KEY_ATTRIBUTES = [
  'data-ui-key',
  'data-key',
  'data-id',
  'data-mail-id',
  'data-mail-select',
  'data-mail-check',
  'data-suggestion-select',
  'data-market-select-group',
  'data-market-select-item',
  'data-inventory-slot',
  'data-item-id',
  'data-item-key',
  'data-quest-id',
  'id',
];

/** 从 HTML 文本构造可用于局部 patch 的片段。 */
export function createPatchFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/** 用 HTML 片段局部 patch 容器子节点，避免整块 innerHTML 重建。 */
export function patchElementHtml(root: HTMLElement, html: string): void {
  patchElementChildren(root, createPatchFragment(html));
}

/** 局部 patch 容器子节点，尽量复用同 key、同位置、同标签的旧节点。 */
export function patchElementChildren(root: HTMLElement, nextContent: DocumentFragment | Node | Node[]): void {
  const focusSnapshot = captureFocus(root);
  const scrollSnapshots = captureScroll(root);
  preserveSelection(root, () => {
    patchChildList(root, normalizeNodes(nextContent));
  });
  restoreScroll(root, scrollSnapshots);
  restoreFocus(root, focusSnapshot);
}

function normalizeNodes(content: DocumentFragment | Node | Node[]): Node[] {
  if (Array.isArray(content)) {
    return content;
  }
  if (content instanceof DocumentFragment) {
    return Array.from(content.childNodes);
  }
  return [content];
}

function patchChildList(parent: Node, nextNodes: Node[]): void {
  const existingKeyed = new Map<string, Node>();
  Array.from(parent.childNodes).forEach((node) => {
    const key = getNodeKey(node);
    if (key) {
      existingKeyed.set(key, node);
    }
  });

  const used = new Set<Node>();
  let cursor: ChildNode | null = parent.firstChild;

  nextNodes.forEach((nextNode) => {
    const key = getNodeKey(nextNode);
    const keyedCandidate = key ? existingKeyed.get(key) ?? null : null;
    const candidate = keyedCandidate && canPatchNode(keyedCandidate, nextNode)
      ? keyedCandidate
      : findReusableUnkeyedNode(cursor, nextNode, used);
    const node = candidate
      ? patchNode(candidate, nextNode)
      : document.importNode(nextNode, true);

    used.add(node);
    if (node !== cursor) {
      parent.insertBefore(node, cursor);
    } else {
      cursor = cursor?.nextSibling ?? null;
    }
  });

  Array.from(parent.childNodes).forEach((node) => {
    if (!used.has(node)) {
      node.parentNode?.removeChild(node);
    }
  });
}

function patchNode(current: Node, next: Node): Node {
  if (!canPatchNode(current, next)) {
    const replacement = document.importNode(next, true);
    current.parentNode?.replaceChild(replacement, current);
    return replacement;
  }

  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.nodeValue !== next.nodeValue) {
      current.nodeValue = next.nodeValue;
    }
    return current;
  }

  if (current instanceof Element && next instanceof Element) {
    patchAttributes(current, next);
    patchFormControl(current, next);
    if (!isTextInputLike(current)) {
      patchChildList(current, Array.from(next.childNodes));
    }
  }
  return current;
}

function canPatchNode(current: Node, next: Node): boolean {
  if (current.nodeType !== next.nodeType) {
    return false;
  }
  if (current instanceof Element || next instanceof Element) {
    return current instanceof Element
      && next instanceof Element
      && current.tagName === next.tagName;
  }
  return true;
}

function findReusableUnkeyedNode(cursor: ChildNode | null, next: Node, used: Set<Node>): Node | null {
  let node: ChildNode | null = cursor;
  while (node) {
    if (!used.has(node) && !getNodeKey(node) && !getNodeKey(next) && canPatchNode(node, next)) {
      return node;
    }
    node = node.nextSibling;
  }
  return null;
}

function patchAttributes(current: Element, next: Element): void {
  Array.from(current.attributes).forEach((attr) => {
    if (!next.hasAttribute(attr.name)) {
      current.removeAttribute(attr.name);
    }
  });
  Array.from(next.attributes).forEach((attr) => {
    if (current.getAttribute(attr.name) !== attr.value) {
      current.setAttribute(attr.name, attr.value);
    }
  });
}

function patchFormControl(current: Element, next: Element): void {
  if (current instanceof HTMLInputElement && next instanceof HTMLInputElement) {
    current.checked = next.checked;
    current.disabled = next.disabled;
    if (document.activeElement !== current) {
      current.value = next.value;
    }
    return;
  }
  if (current instanceof HTMLTextAreaElement && next instanceof HTMLTextAreaElement) {
    current.disabled = next.disabled;
    if (document.activeElement !== current) {
      current.value = next.value;
    }
    return;
  }
  if (current instanceof HTMLSelectElement && next instanceof HTMLSelectElement) {
    current.disabled = next.disabled;
    const active = document.activeElement === current;
    patchChildList(current, Array.from(next.childNodes));
    if (!active) {
      current.value = next.value;
    }
  }
}

function isTextInputLike(node: Element): node is FormControl {
  return node instanceof HTMLInputElement
    || node instanceof HTMLTextAreaElement
    || node instanceof HTMLSelectElement;
}

function getNodeKey(node: Node): string | null {
  if (!(node instanceof Element)) {
    return null;
  }
  for (const attr of NODE_KEY_ATTRIBUTES) {
    const value = node.getAttribute(attr);
    if (value) {
      return `${node.tagName}:${attr}:${value}`;
    }
  }
  return null;
}

function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  if (!isTextInputLikeElement(active) || !root.contains(active)) {
    return null;
  }
  return {
    selector: getStableSelector(active, root),
    selectionStart: 'selectionStart' in active ? active.selectionStart : null,
    selectionEnd: 'selectionEnd' in active ? active.selectionEnd : null,
    scrollTop: active instanceof HTMLTextAreaElement ? active.scrollTop : 0,
  };
}

function restoreFocus(root: HTMLElement, snapshot: FocusSnapshot | null): void {
  if (!snapshot?.selector) {
    return;
  }
  const target = root.querySelector(snapshot.selector);
  if (!isTextInputLikeElement(target) || target.disabled) {
    return;
  }
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
  if (typeof snapshot.selectionStart === 'number' && typeof snapshot.selectionEnd === 'number' && 'setSelectionRange' in target) {
    try {
      target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // 部分 input 类型不支持选区恢复。
    }
  }
  if (target instanceof HTMLTextAreaElement) {
    target.scrollTop = snapshot.scrollTop;
  }
}

function captureScroll(root: HTMLElement): ScrollSnapshot[] {
  return [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    .filter((node) => node.scrollTop > 0 || node.scrollLeft > 0)
    .map((node) => ({
      selector: getStableSelector(node, root) ?? '',
      top: node.scrollTop,
      left: node.scrollLeft,
    }))
    .filter((item) => item.selector.length > 0);
}

function restoreScroll(root: HTMLElement, snapshots: ScrollSnapshot[]): void {
  snapshots.forEach((snapshot) => {
    const node = snapshot.selector === ':scope' ? root : root.querySelector<HTMLElement>(snapshot.selector);
    if (!node) {
      return;
    }
    node.scrollTop = snapshot.top;
    node.scrollLeft = snapshot.left;
  });
}

function isTextInputLikeElement(node: Element | null): node is FormControl {
  return node instanceof HTMLInputElement
    || node instanceof HTMLTextAreaElement
    || node instanceof HTMLSelectElement;
}

function getStableSelector(node: Element, root: HTMLElement): string | null {
  if (node === root) {
    return ':scope';
  }
  if (node.id) {
    return `#${cssEscape(node.id)}`;
  }
  for (const attr of NODE_KEY_ATTRIBUTES) {
    const value = node.getAttribute(attr);
    if (value) {
      return `[${attr}="${cssEscape(value)}"]`;
    }
  }
  const segments: string[] = [];
  let current: Element | null = node;
  while (current && current !== root) {
    const parentElement: Element | null = current.parentElement;
    if (!parentElement) {
      return null;
    }
    const index = Array.from(parentElement.children).indexOf(current) + 1;
    segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parentElement;
  }
  return segments.length > 0 ? segments.join(' > ') : null;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
