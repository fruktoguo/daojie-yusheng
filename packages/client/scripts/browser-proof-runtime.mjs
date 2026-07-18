/** 复用正式 Vite 页面和本机 Chrome 的客户端浏览器 proof 运行器。 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(probe, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`等待${label}超时${lastError ? `：${lastError.message}` : ''}`);
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/google-chrome',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 继续检查下一个本机 Chrome 路径。
    }
  }
  throw new Error('未找到可用于客户端布局 proof 的 Chrome');
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Chrome CDP 连接意外关闭'));
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('无法连接 Chrome CDP')), { once: true });
    });
  }

  send(method, params = {}) {
    assert(this.socket?.readyState === WebSocket.OPEN, 'Chrome CDP 尚未连接');
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? '浏览器表达式执行失败');
    }
    return result.result?.value;
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(2_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

async function readDevToolsPort(profileDir) {
  return waitFor(async () => {
    const content = await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
    const port = Number.parseInt(content.split(/\r?\n/, 1)[0] ?? '', 10);
    return Number.isSafeInteger(port) && port > 0 ? port : null;
  }, 'Chrome 调试端口');
}

async function resolvePageTarget(port) {
  return waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl) ?? null;
  }, 'Chrome 页面目标');
}

export async function withClientBrowserProof({ viewport, profilePrefix }, run) {
  let viteServer = null;
  let chrome = null;
  let cdp = null;
  let profileDir = null;
  try {
    viteServer = await createServer({
      root: clientRoot,
      configFile: path.join(clientRoot, 'vite.config.ts'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: false },
    });
    await viteServer.listen();
    const address = viteServer.httpServer?.address();
    assert(address && typeof address === 'object', 'Vite proof 服务未取得本地端口');

    profileDir = await mkdtemp(path.join(os.tmpdir(), profilePrefix));
    chrome = spawn(await findChromeExecutable(), [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-gpu',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ], { stdio: 'ignore' });

    const debugPort = await readDevToolsPort(profileDir);
    const target = await resolvePageTarget(debugPort);
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${address.port}/` });
    await waitFor(
      () => cdp.evaluate(`document.readyState === 'complete' && Boolean(document.getElementById('detail-modal-body'))`),
      '正式客户端页面加载',
    );
    return await run(cdp);
  } finally {
    cdp?.close();
    await stopChild(chrome);
    await viteServer?.close();
    if (profileDir) await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
