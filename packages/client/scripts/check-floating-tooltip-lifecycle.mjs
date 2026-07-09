#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(scriptDirectory, '..');

class FakeNode {
  parentNode = null;

  contains(target) {
    for (let current = target; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }
}

class FakeElement extends FakeNode {
  children = [];
  className = '';
  id = '';
  isConnected = false;
  style = {};

  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
  }

  appendChild(child) {
    child.remove();
    child.parentNode = this;
    child.setConnected(this.isConnected);
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) {
      child.parentNode = null;
      child.setConnected(false);
    }
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentNode = null;
    this.setConnected(false);
  }

  setConnected(connected) {
    this.isConnected = connected;
    for (const child of this.children) child.setConnected(connected);
  }
}

class FakeHtmlElement extends FakeElement {}
class FakeHtmlDivElement extends FakeHtmlElement {}

class FakeDocument {
  listeners = new Map();

  constructor() {
    this.body = new FakeHtmlDivElement(this);
    this.body.setConnected(true);
  }

  createElement(tagName) {
    if (tagName.toLowerCase() === 'div') return new FakeHtmlDivElement(this);
    return new FakeHtmlElement(this);
  }

  getElementById(id) {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const matched = visit(child);
        if (matched) return matched;
      }
      return null;
    };
    return visit(this.body);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const server = await createServer({
  root: clientRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const document = new FakeDocument();
  const windowListeners = new Map();
  const window = {
    document,
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    navigator: { platform: 'Linux', userAgent: 'tooltip-lifecycle-proof' },
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) ?? new Set();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
  };
  document.defaultView = window;

  Object.assign(globalThis, {
    Node: FakeNode,
    Element: FakeElement,
    HTMLElement: FakeHtmlElement,
    HTMLDivElement: FakeHtmlDivElement,
    document,
    window,
  });

  const { FloatingTooltip } = await server.ssrLoadModule('/src/ui/floating-tooltip.ts');
  const first = new FloatingTooltip();
  const second = new FloatingTooltip();
  const root = document.getElementById('floating-tooltip-root');

  assert.ok(root, '应创建全局 tooltip 容器');
  assert.equal(root.children.length, 2, '每个实例应挂载一个独立节点');
  assert.equal(document.listenerCount('pointerdown'), 2, '每个实例应注册一个文档监听器');

  first.destroy();
  first.destroy();
  assert.equal(root.children.length, 1, '重复销毁不得误删其他实例节点');
  assert.equal(document.listenerCount('pointerdown'), 1, '重复销毁不得残留或误删其他实例监听器');
  assert.equal(first.isPinned(), false, '销毁后的实例不得保持固定展示状态');

  second.destroy();
  assert.equal(root.children.length, 0, '全部销毁后不得残留实例节点');
  assert.equal(document.listenerCount('pointerdown'), 0, '全部销毁后不得残留实例监听器');

  const hookSource = fs.readFileSync(path.join(clientRoot, 'src/react-ui/hooks/use-floating-tooltip.ts'), 'utf8');
  assert.match(
    hookSource,
    /useEffect\(\(\) => \{\s*return \(\) => \{\s*const tooltip = tooltipRef\.current;\s*tooltipRef\.current = null;\s*tooltip\?\.destroy\(\);\s*\};\s*\}, \[\]\);/,
    'useFloatingTooltip 卸载时必须清空 tooltip ref 并销毁实例',
  );
  assert.doesNotMatch(hookSource, /return \(\) => \{\s*tooltipRef\.current\?\.hide\(true\)/);

  const equipmentSource = fs.readFileSync(path.join(clientRoot, 'src/react-ui/panels/equipment/EquipmentPanel.tsx'), 'utf8');
  const equipmentPanelSource = getSourceSection(equipmentSource, 'export function EquipmentPanel()', '\nconst EquipmentSlotRow', 'EquipmentPanel');
  assert.match(
    equipmentPanelSource,
    /useEffect\(\(\) => \(\) => \{\s*tooltipSlotRef\.current = null;\s*const tooltip = tooltipRef\.current;\s*tooltipRef\.current = null;\s*tooltip\?\.destroy\(\);\s*\}, \[\]\);/,
    'EquipmentPanel 卸载时必须清空 tooltip ref 并销毁实例',
  );

  const tutorialSource = fs.readFileSync(path.join(clientRoot, 'src/react-ui/panels/tutorial/TutorialPanel.tsx'), 'utf8');
  const tutorialInlineActionSource = getSourceSection(tutorialSource, 'function TutorialInlineAction', '\nfunction getSearchMatches', 'TutorialInlineAction');
  assert.match(
    tutorialInlineActionSource,
    /useEffect\(\(\) => \(\) => \{\s*const tooltip = tooltipRef\.current;\s*tooltipRef\.current = null;\s*tooltip\?\.destroy\(\);\s*\}, \[\]\);/,
    'TutorialInlineAction 卸载时必须清空 tooltip ref 并销毁实例',
  );

  console.log('FloatingTooltip 生命周期证明通过');
} finally {
  await server.close();
}

function getSourceSection(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `未找到 ${label} 源码区段`);
  return source.slice(start, end);
}
