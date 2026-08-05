/**
 * 背包隐藏期间收到药品冷却投影后的可见性恢复 proof。
 *
 * 通过 Vite 和 Chrome 导入正式 InventoryPanel，验证切回背包后倒计时继续刷新，
 * 且冷却结束后真实主操作入口恢复可用。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const MARKER = 'REPAIR_PROOF:ISSUE-000006:PASS';
const CURRENT_ISSUE_MARKER = 'REPAIR_PROOF:ISSUE-000041:PASS';
const PROOF_PATH = '/__repair-proof-issue-000006.html';
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const proofHtml = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <title>ISSUE-000006 proof</title>
    <style>
      .mobile-ui-content { width: 480px; min-height: 320px; }
      .mobile-ui-pane { display: none; min-height: 320px; }
      .mobile-ui-pane.active { display: flex; }
      .tab-pane { display: none; width: 100%; min-height: 320px; }
      .tab-pane.active { display: block; }
      .hidden, [hidden] { display: none !important; }
    </style>
  </head>
  <body>
    <div id="mobile-ui-shell" data-tab-group="mobile-primary">
      <div class="mobile-ui-tab-bar">
        <button class="tab-btn mobile-ui-tab-btn active" data-tab="mobile-world" type="button">世界</button>
        <button class="tab-btn mobile-ui-tab-btn" data-tab="mobile-bag" type="button">行囊</button>
      </div>
      <div class="mobile-ui-content">
        <div class="mobile-ui-pane active" data-pane="mobile-world"></div>
        <div class="mobile-ui-pane" data-pane="mobile-bag">
          <div id="pane-inventory" class="tab-pane active"></div>
        </div>
      </div>
    </div>
    <div id="detail-modal" class="hidden">
      <div id="detail-modal-card">
        <div id="detail-modal-title"></div>
        <div id="detail-modal-subtitle"></div>
        <div id="detail-modal-body"></div>
        <div id="detail-modal-hint"></div>
      </div>
    </div>
    <pre id="proof-result">RUNNING</pre>
    <script type="module">
      const result = document.getElementById('proof-result');
      const pane = document.getElementById('pane-inventory');
      const bagButton = document.querySelector('[data-tab="mobile-bag"]');
      const worldButton = document.querySelector('[data-tab="mobile-world"]');
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      for (const button of document.querySelectorAll('#mobile-ui-shell [data-tab]')) {
        button.addEventListener('click', () => {
          const tab = button.getAttribute('data-tab');
          for (const candidate of document.querySelectorAll('#mobile-ui-shell [data-tab]')) {
            candidate.classList.toggle('active', candidate === button);
          }
          for (const candidate of document.querySelectorAll('#mobile-ui-shell [data-pane]')) {
            candidate.classList.toggle('active', candidate.getAttribute('data-pane') === tab);
          }
        });
      }

      function requireValue(condition, message) {
        if (!condition) throw new Error(message);
      }

      async function waitFor(read, label, timeoutMs = 5_000) {
        const deadline = performance.now() + timeoutMs;
        while (performance.now() < deadline) {
          const value = read();
          if (value !== null && value !== undefined) return value;
          await delay(50);
        }
        throw new Error('等待' + label + '超时');
      }

      function createInventory(cooldown, serverTick) {
        return {
          revision: serverTick,
          capacity: 20,
          serverTick,
          cooldowns: [{
            itemId: 'pill.minor_heal',
            cooldown,
            startedAtTick: serverTick,
          }],
          items: [{
            itemId: 'pill.minor_heal',
            itemInstanceId: 'proof:minor-heal',
            name: '回春散',
            desc: '背包冷却可见性 proof',
            type: 'consumable',
            count: 1,
            level: 1,
            baselineHealPercent: 1,
            cooldown,
          }],
        };
      }

      function readCooldownLabel() {
        return document.querySelector('[data-item-cooldown-label="true"]')?.textContent?.trim() ?? null;
      }

      try {
        const { InventoryPanel } = await import('/src/ui/panels/inventory-panel.ts');
        requireValue(bagButton instanceof HTMLButtonElement, '未找到正式 mobile-bag 页签按钮');
        requireValue(worldButton instanceof HTMLButtonElement, '未找到正式 mobile-world 页签按钮');
        const panel = new InventoryPanel();
        const useCalls = [];
        panel.setCallbacks(
          (itemInstanceId, count) => useCalls.push({ itemInstanceId, count }),
          () => {},
          () => {},
          () => {},
          () => {},
          () => {},
          () => {},
          () => {},
          undefined,
          undefined,
          () => false,
        );

        requireValue(pane.classList.contains('active'), '正式手机布局中背包内层 Tab 应始终保持 active');
        requireValue(pane.getClientRects().length === 0, 'proof 初始时外层行囊页签必须隐藏');
        panel.update(createInventory(60, 100));
        await nextPaint();
        const hiddenLabel = await waitFor(readCooldownLabel, '隐藏背包冷却标签');
        requireValue(hiddenLabel === '60', '隐藏 Tab 收到的初始冷却应显示 60，实际为 ' + hiddenLabel);

        bagButton.click();
        await delay(1_250);
        requireValue(pane.classList.contains('active'), '切换外层行囊页签不得改写背包内层 active 状态');
        const visibleLabel = readCooldownLabel();
        requireValue(
          Number(visibleLabel) > 0 && Number(visibleLabel) < 60,
          '切回背包后冷却未继续递减，实际为 ' + visibleLabel,
        );

        panel.clear();
        worldButton.click();
        panel.update(createInventory(2, 200));
        await nextPaint();
        requireValue(readCooldownLabel() === '2', '短冷却初始投影不正确');
        bagButton.click();

        await waitFor(() => {
          const overlay = document.querySelector('[data-item-cooldown="true"]');
          return overlay instanceof HTMLElement && overlay.hidden ? true : null;
        }, '冷却结束并解除遮罩', 4_000);

        const cell = document.querySelector('[data-open-item="0"]');
        requireValue(cell instanceof HTMLElement, '未找到正式背包物品格');
        cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await nextPaint();
        requireValue(
          useCalls.length === 1
            && useCalls[0].itemInstanceId === 'proof:minor-heal'
            && useCalls[0].count === 1,
          '冷却结束后正式使用入口仍未恢复',
        );

        result.textContent = '${MARKER}';
      } catch (error) {
        result.textContent = 'FAIL:' + (error instanceof Error ? error.message : String(error));
      }
    </script>
  </body>
</html>`;

function resolveChromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const chromePath = candidates.find((candidate) => existsSync(candidate));
  assert.ok(chromePath, '未找到可用于浏览器 proof 的 Chrome/Chromium');
  return chromePath;
}

async function waitForValue(read, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null && value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待${label}超时`);
}

async function readDevToolsPort(profileDir) {
  return waitForValue(async () => {
    try {
      const content = await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
      const port = Number.parseInt(content.split(/\r?\n/)[0] ?? '', 10);
      return Number.isSafeInteger(port) && port > 0 ? port : null;
    } catch {
      return null;
    }
  }, 5_000, ' Chrome 调试端口');
}

async function findProofTarget(port) {
  return waitForValue(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      return Array.isArray(targets)
        ? targets.find((target) => target?.type === 'page' && String(target?.url ?? '').includes(PROOF_PATH)) ?? null
        : null;
    } catch {
      return null;
    }
  }, 5_000, ' proof 页面');
}

async function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message ?? 'CDP 调用失败'));
    else entry.resolve(message.result);
  });
  return {
    socket,
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function runBrowserProof(url, profileDir) {
  const chrome = spawn(resolveChromePath(), [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--no-first-run',
    '--proxy-server=direct://',
    '--proxy-bypass-list=*',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    url,
  ], { cwd: clientRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  let cdp;
  let stderr = '';
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const port = await readDevToolsPort(profileDir);
    const target = await findProofTarget(port);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    return await waitForValue(async () => {
      const response = await cdp.send('Runtime.evaluate', {
        expression: 'document.getElementById("proof-result")?.textContent ?? ""',
        returnByValue: true,
      });
      const value = response?.result?.value;
      return typeof value === 'string' && value.length > 0 && value !== 'RUNNING' ? value : null;
    }, 15_000, '浏览器 proof 结果');
  } catch (error) {
    const detail = stderr.trim().slice(-1_000);
    throw new Error(`${error instanceof Error ? error.message : String(error)}${detail ? `；Chrome：${detail}` : ''}`);
  } finally {
    cdp?.socket.close();
    chrome.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise((resolve) => chrome.once('close', () => resolve(true))),
      new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
    if (!exited) chrome.kill('SIGKILL');
  }
}

let server;
let profileDir;
try {
  server = await createServer({
    root: clientRoot,
    appType: 'custom',
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    plugins: [{
      name: 'repair-proof-issue-000006',
      configureServer(viteServer) {
        viteServer.middlewares.use((request, response, next) => {
          if (request.url?.split('?')[0] !== PROOF_PATH) {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(proofHtml);
        });
      },
    }],
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object', 'Vite proof 服务未取得监听地址');
  profileDir = await mkdtemp(path.join(tmpdir(), 'mud-issue-000006-proof-'));
  const resultText = await runBrowserProof(`http://127.0.0.1:${address.port}${PROOF_PATH}`, profileDir);
  if (resultText.trim() !== MARKER) throw new Error(resultText.trim() || '浏览器 proof 未输出结果');
  console.log(MARKER);
  console.log(CURRENT_ISSUE_MARKER);
} finally {
  await server?.close();
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
}
