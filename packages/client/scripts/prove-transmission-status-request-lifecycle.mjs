/**
 * 传功状态查询生命周期浏览器 proof。
 *
 * 通过 Vite 加载真实生产模块，并在 Chrome DOM 中覆盖会话重建、出站拒绝、超时与重试。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const MARKER = 'REPAIR_PROOF:ISSUE-000005:PASS';
const PROOF_PATH = '/__repair-proof-issue-000005.html';
const clientRootArgIndex = process.argv.indexOf('--client-root');
const clientRootArg = clientRootArgIndex >= 0 ? process.argv[clientRootArgIndex + 1] : null;
assert.ok(clientRootArgIndex < 0 || clientRootArg, '--client-root 必须提供目录');
const clientRoot = clientRootArg
  ? path.resolve(clientRootArg)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const proofHtml = String.raw`<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><title>ISSUE-000005 proof</title></head>
  <body>
    <pre id="proof-result">RUNNING</pre>
    <script type="module">
      const marker = ['REPAIR', 'PROOF:ISSUE-000005:PASS'].join('_');
      const result = document.getElementById('proof-result');

      function assert(condition, message) {
        if (!condition) throw new Error(message);
      }

      function createParent() {
        return {
          activeMode: 'transmission',
          transmissionSkillLevel: 1,
          playerComprehensionSpeedRate: 0,
          transmissionTechniques: [{
            techId: 'gen_repair_proof',
            name: '回归功法',
            level: 1,
            exp: 0,
            expToNext: 0,
            realmLv: 1,
            realm: 'Perfection',
            skills: [],
            grade: 'mortal',
            category: 'internal',
            layers: [{ level: 1, expToNext: 0, attrs: {} }],
          }],
          pendingTechniqueComprehensions: [],
          playerRealmLv: 1,
          inventory: { items: [], capacity: 20 },
          callbacks: null,
          patchOpenCraftShell() {},
        };
      }

      function mountView(CraftTransmissionView, onRequest) {
        document.getElementById('detail-modal-body')?.remove();
        const parent = createParent();
        const view = new CraftTransmissionView(parent);
        view.setCallbacks({
          getTransmissionTargets: () => [{ playerId: 'target-mobile', name: '目标玩家' }],
          onRequestTransmissionStatuses: onRequest,
        });
        const body = document.createElement('div');
        body.id = 'detail-modal-body';
        body.innerHTML = '<div data-craft-workbench-content="true">' + view.renderTransmissionBody() + '</div>';
        document.body.appendChild(body);
        const controller = new AbortController();
        view.bindEvents(body, controller.signal);
        return { parent, view, body, controller };
      }

      function selectTarget(body) {
        const target = body.querySelector('[data-transmission-target-select="true"]');
        target.value = 'target-mobile';
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }

      function getTechniqueOption(body) {
        return body.querySelector('[data-transmission-tech-select="true"] option[value="gen_repair_proof"]');
      }

      function getRetryButton(body) {
        return body.querySelector('[data-craft-action="transmission-status-retry"]');
      }

      function disposeMounted(mounted) {
        mounted.controller.abort();
        mounted.view.closeTransientUi();
        mounted.body.remove();
      }

      try {
        const [{ CraftTransmissionView }, { createSocketPanelSender }, { emitSocketBusinessEvent }] = await Promise.all([
          import('/src/ui/craft-transmission-view.ts'),
          import('/src/network/socket-send-panel.ts'),
          import('/src/network/socket-outbound-gate.ts'),
        ]);

        const sessionRequests = [];
        const sessionCase = mountView(CraftTransmissionView, (payload) => {
          sessionRequests.push(payload);
          return true;
        });
        selectTarget(sessionCase.body);
        assert(sessionRequests.length === 1, '首次选择目标必须发出一次状态查询');
        assert(getTechniqueOption(sessionCase.body)?.dataset.transmissionTechniqueStatus === 'loading', '首次查询必须进入 loading');

        sessionCase.view.handleSessionBootstrap();
        assert(sessionRequests.length === 2, '会话重建必须废弃旧查询并重新发送');
        assert(sessionRequests[1].requestId !== sessionRequests[0].requestId, '会话重查必须使用新的 requestId');

        sessionCase.view.handleTransmissionStatuses({
          requestId: sessionRequests[0].requestId,
          targetPlayerId: 'target-mobile',
          techniques: [{ techId: 'gen_repair_proof', learned: true }],
        });
        assert(getTechniqueOption(sessionCase.body)?.dataset.transmissionTechniqueStatus === 'loading', '旧会话迟到响应不得覆盖新查询');

        sessionCase.view.handleTransmissionStatuses({
          requestId: sessionRequests[1].requestId,
          targetPlayerId: 'target-mobile',
          techniques: [{ techId: 'gen_repair_proof', learned: false }],
        });
        assert(getTechniqueOption(sessionCase.body)?.dataset.transmissionTechniqueStatus === 'unlearned', '新会话响应必须收敛为未学');
        assert(sessionCase.body.querySelector('[data-transmission-tech-select="true"]')?.disabled === false, '成功响应后功法选择必须恢复可用');
        disposeMounted(sessionCase);

        let rejectedEmitCount = 0;
        const rejectedSender = createSocketPanelSender({
          emitEvent: () => emitSocketBusinessEvent(
            { connected: false, sessionReady: false },
            () => { rejectedEmitCount += 1; },
          ),
        });
        const rejectedCase = mountView(
          CraftTransmissionView,
          (payload) => rejectedSender.sendRequestTechniqueTransmissionStatuses(payload),
        );
        selectTarget(rejectedCase.body);
        assert(rejectedEmitCount === 0, '断线请求不得进入 Socket.IO 缓冲');
        assert(getTechniqueOption(rejectedCase.body)?.dataset.transmissionTechniqueStatus === 'error', '发送被拒绝后必须退出 loading');
        assert(getRetryButton(rejectedCase.body)?.hidden === false, '发送被拒绝后必须提供重试入口');
        disposeMounted(rejectedCase);

        const timeoutRequests = [];
        const timeoutCase = mountView(CraftTransmissionView, (payload) => {
          timeoutRequests.push(payload);
          return true;
        });
        selectTarget(timeoutCase.body);
        await new Promise((resolve) => window.setTimeout(resolve, 5_250));
        assert(getTechniqueOption(timeoutCase.body)?.dataset.transmissionTechniqueStatus === 'error', '超时后必须退出 loading');
        const retryButton = getRetryButton(timeoutCase.body);
        assert(retryButton?.hidden === false, '超时后必须显示重试入口');
        timeoutCase.view.handleAction('transmission-status-retry', retryButton, timeoutCase.body);
        assert(timeoutRequests.length === 2, '点击重试必须发起新查询');
        assert(getTechniqueOption(timeoutCase.body)?.dataset.transmissionTechniqueStatus === 'loading', '重试后必须重新进入 loading');
        timeoutCase.view.handleTransmissionStatuses({
          requestId: timeoutRequests[1].requestId,
          targetPlayerId: 'target-mobile',
          techniques: [{ techId: 'gen_repair_proof', learned: false }],
        });
        assert(getTechniqueOption(timeoutCase.body)?.dataset.transmissionTechniqueStatus === 'unlearned', '重试响应必须恢复正常状态');
        disposeMounted(timeoutCase);

        document.documentElement.dataset.repairProof = marker;
        result.textContent = marker;
      } catch (error) {
        result.textContent = 'PROOF_FAILED: ' + (error instanceof Error ? error.message : String(error));
      }
    </script>
  </body>
</html>`;

function resolveChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
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
    if (value !== null && value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待 ${label} 超时`);
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
  }, 5_000, 'Chrome DevTools 端口');
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
  }, 5_000, 'proof 页面 target');
}

async function connectCdp(webSocketDebuggerUrl) {
  assert.equal(typeof WebSocket, 'function', '当前 Node.js 不支持内置 WebSocket');
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) {
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(message.error.message ?? 'CDP 调用失败'));
      return;
    }
    entry.resolve(message.result);
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
    '--metrics-recording-only',
    '--no-first-run',
    '--proxy-server=direct://',
    '--proxy-bypass-list=*',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    url,
  ], {
    cwd: clientRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  let cdp;
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
    }, 15_000, '浏览器 proof 断言结果');
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
    if (!exited) {
      chrome.kill('SIGKILL');
    }
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
      name: 'repair-proof-issue-000005',
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
  profileDir = await mkdtemp(path.join(tmpdir(), 'mud-issue-000005-proof-'));
  const resultText = await runBrowserProof(`http://127.0.0.1:${address.port}${PROOF_PATH}`, profileDir);
  if (resultText.trim() !== MARKER) {
    throw new Error(resultText.trim() || '浏览器 proof 未输出结果');
  }
  console.log(MARKER);
} finally {
  await server?.close();
  if (profileDir) {
    await rm(profileDir, { recursive: true, force: true });
  }
}
