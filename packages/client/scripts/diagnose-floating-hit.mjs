import assert from 'node:assert/strict';
import { delay, withClientBrowserProof } from './browser-proof-runtime.mjs';

const MARKER = 'REPAIR_PROOF:FLOATING-HIT:PASS';

await withClientBrowserProof(
  { viewport: { width: 1280, height: 800 }, profilePrefix: 'floating-hit-proof-' },
  async (cdp) => {
    const setup = await cdp.evaluate(String.raw`
      (async () => {
        document.getElementById('game-shell')?.classList.remove('hidden');
        document.getElementById('login-overlay')?.classList.add('hidden');
        const { FloatingListPanel } = await import('/src/ui/floating-list-panel.ts');
        const panel = new FloatingListPanel({
          id: 'floating-hit-diagnostic', title: '命中诊断', storageKey: 'floating-hit-diagnostic',
          defaultLeft: 120, defaultTop: 120,
        });
        panel.updateContent('<button type="button" data-hit-button>测试点击</button>');
        window.__floatingHitCount = 0;
        panel.body.querySelector('[data-hit-button]')?.addEventListener('click', () => window.__floatingHitCount += 1);
        const button = panel.body.querySelector('[data-hit-button]');
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          hitTag: hit?.tagName ?? null,
          hitSelector: hit?.matches('[data-hit-button]') ?? false,
          panelZ: getComputedStyle(panel.root).zIndex,
          rootPointer: getComputedStyle(panel.root).pointerEvents,
          hitPointer: hit ? getComputedStyle(hit).pointerEvents : null,
          stack: document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            .slice(0, 8).map((node) => ({ tag: node.tagName, id: node.id, cls: node.className, pointer: getComputedStyle(node).pointerEvents, z: getComputedStyle(node).zIndex })),
        };
      })()
    `);
    const x = setup.rect.left + setup.rect.width / 2;
    const y = setup.rect.top + setup.rect.height / 2;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await delay(50);
    const count = await cdp.evaluate('window.__floatingHitCount');
    console.log(JSON.stringify({ setup, count }, null, 2));
    assert.equal(setup.hitSelector, true, '悬浮窗按钮未处于真实点击命中顶层');
    assert.equal(count, 1, '悬浮窗 pointerdown 置顶操作吞掉了后续 click');
  },
);

console.log(MARKER);
