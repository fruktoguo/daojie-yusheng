#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const HOST = process.env.CLIENT_PREVIEW_HOST || '127.0.0.1';
const PORT = Number(process.env.CLIENT_PREVIEW_PORT || 41922);
const BASE_URL = `http://${HOST}:${PORT}`;
const CHROME_BIN = process.env.CHROME_BIN || 'google-chrome';

const VIEWPORTS = [
  { name: 'desktop-light', width: 1280, height: 800, colorMode: 'light' },
  { name: 'desktop-dark', width: 1280, height: 800, colorMode: 'dark' },
  { name: 'mobile-light', width: 375, height: 812, colorMode: 'light' },
  { name: 'mobile-dark', width: 375, height: 812, colorMode: 'dark' },
];

function log(message) {
  process.stdout.write(`[react-equipment] ${message}\n`);
}

function fail(message) {
  throw new Error(message);
}

async function canFetchRoot() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/?react-ui=1`, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForPreview(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canFetchRoot()) {
      return;
    }
    await delay(500);
  }
  fail(`vite preview 未在 ${BASE_URL} 就绪`);
}

async function ensurePreview() {
  if (await canFetchRoot()) {
    log(`复用已有 preview: ${BASE_URL}`);
    return null;
  }
  log(`启动 vite dev server: ${BASE_URL}`);
  const child = spawn('pnpm', ['--dir', 'packages/client', 'exec', 'vite', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: path.resolve(import.meta.dirname, '../../..'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForPreview();
  await delay(1_500);
  return child;
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

class ChromeSession {
  constructor(wsUrl) {
    this.wsUrl = new URL(wsUrl);
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.buffer = Buffer.alloc(0);
  }

  async open() {
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(Number(this.wsUrl.port), this.wsUrl.hostname);
    this.socket = socket;
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write([
          `GET ${this.wsUrl.pathname}${this.wsUrl.search} HTTP/1.1`,
          `Host: ${this.wsUrl.host}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '',
          '',
        ].join('\r\n'));
      });
      let header = '';
      const onData = (chunk) => {
        header += chunk.toString('binary');
        const headerEnd = header.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          return;
        }
        socket.off('data', onData);
        if (!header.startsWith('HTTP/1.1 101')) {
          reject(new Error(`Chrome WebSocket upgrade failed: ${header.split('\r\n')[0]}`));
          return;
        }
        const rest = Buffer.from(header.slice(headerEnd + 4), 'binary');
        if (rest.length > 0) {
          this.handleData(rest);
        }
        socket.on('data', (data) => this.handleData(data));
        socket.on('error', (error) => {
          for (const { reject: rejectPending } of this.pending.values()) {
            rejectPending(error);
          }
          this.pending.clear();
        });
        resolve();
      };
      socket.on('data', onData);
    });
  }

  handleData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let payloadLength = second & 0x7f;
      let offset = 2;
      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) return;
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) return;
        const high = this.buffer.readUInt32BE(offset);
        const low = this.buffer.readUInt32BE(offset + 4);
        payloadLength = high * 2 ** 32 + low;
        offset += 8;
      }
      const maskLength = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLength + payloadLength) return;
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;
      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
      this.buffer = this.buffer.subarray(offset + payloadLength);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }
      if (opcode === 0x8) {
        this.close();
        return;
      }
      if (opcode !== 0x1) {
        continue;
      }
      this.handleMessage(payload.toString('utf8'));
    }
  }

  handleMessage(message) {
    const payload = JSON.parse(message);
    if (payload.id && this.pending.has(payload.id)) {
      const { resolve, reject } = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      if (payload.error) {
        reject(new Error(payload.error.message || JSON.stringify(payload.error)));
      } else {
        resolve(payload.result);
      }
      return;
    }
    if (payload.method) {
      this.events.push(payload);
    }
  }

  encodeFrame(message) {
    const payload = Buffer.from(message);
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65_536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(payload.length, 6);
    }
    const maskedPayload = Buffer.from(payload);
    for (let index = 0; index < maskedPayload.length; index += 1) {
      maskedPayload[index] ^= mask[index % 4];
    }
    return Buffer.concat([header, mask, maskedPayload]);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.write(this.encodeFrame(JSON.stringify({ id, method, params })));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket?.destroy();
  }
}

async function launchChrome() {
  const debugPort = 43000 + Math.floor(Math.random() * 1_000);
  const userDataDir = path.join(tmpdir(), `mud-react-equipment-${process.pid}-${debugPort}`);
  const chrome = spawn(CHROME_BIN, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  chrome.stderr.on('data', (chunk) => {
    const text = String(chunk);
    if (!text.includes('DevTools listening')) {
      process.stderr.write(text);
    }
  });

  const versionUrl = `http://127.0.0.1:${debugPort}/json/version`;
  const listUrl = `http://127.0.0.1:${debugPort}/json/list`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      await fetchJson(versionUrl);
      const targets = await fetchJson(listUrl);
      const page = Array.isArray(targets) ? targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) : null;
      if (page) {
        return { chrome, wsUrl: page.webSocketDebuggerUrl };
      }
    } catch {
      await delay(250);
    }
  }
  chrome.kill('SIGTERM');
  fail('Chrome DevTools 端口未就绪');
}

function expressionForScenario(viewport) {
  return `
    (async () => {
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      document.documentElement.dataset.colorMode = ${JSON.stringify(viewport.colorMode)};
      document.documentElement.style.colorScheme = ${JSON.stringify(viewport.colorMode)};
      document.querySelector('#login-overlay')?.classList.add('hidden');
      document.querySelector('#game-shell')?.classList.remove('hidden');
      document.querySelector('#hud')?.classList.remove('hidden');
      const mobileShell = document.querySelector('#mobile-ui-shell');
      const bagSection = document.querySelector('[data-mobile-section="bag"]');
      const mobileBagPane = document.querySelector('[data-pane="mobile-bag"]');
      const isMobile = window.innerWidth <= 600;
      if (isMobile && mobileShell && mobileBagPane && bagSection) {
        mobileShell.classList.add('active');
        document.querySelectorAll('.mobile-ui-pane').forEach((node) => node.classList.remove('active'));
        mobileBagPane.classList.add('active');
        mobileBagPane.append(bagSection);
      }
      document.querySelectorAll('[data-pane="inventory"], [data-pane="equipment"]').forEach((node) => node.classList.remove('active'));
      document.querySelector('#pane-equipment')?.classList.add('active');
      window.__reactEquipmentUnequipCalls = [];
      const equipmentModule = await import('/src/react-ui/panels/equipment/EquipmentPanel.tsx');
      const mountModule = await import('/src/react-ui/panels/equipment/mount-equipment-panel.tsx');
      mountModule.mountReactEquipmentPanel();
      equipmentModule.setEquipmentPanelCallbacks({
        onUnequip: (slot) => window.__reactEquipmentUnequipCalls.push(slot),
      });
      const equipment = {
        weapon: {
          itemId: 'equip.ember_scorch_spear',
          name: '赤陨灼枪',
          type: 'equipment',
          count: 1,
          desc: '验收用装备',
          enhanceLevel: 3,
        },
        head: null,
        body: {
          itemId: 'equip.mountainseal_plate',
          name: '封岳甲',
          type: 'equipment',
          count: 1,
          desc: '验收用装备',
        },
        legs: {
          itemId: 'equip.returnstep_boots',
          name: '回阵行履',
          type: 'equipment',
          count: 1,
          desc: '验收用装备',
        },
        accessory: null,
      };
      equipmentModule.syncEquipmentPanelState({
        equipment,
        playerRealmLv: 29,
      });
      const waitForSlots = async () => {
        const deadline = performance.now() + 2000;
        while (performance.now() < deadline) {
          if (document.querySelectorAll('#pane-equipment .equip-slot').length === 5) {
            return;
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      };
      await waitForSlots();

      const host = document.querySelector('#pane-equipment [data-react-panel="equipment"]');
      assert(host, 'React equipment host missing');
      assert(document.documentElement.dataset.colorMode === ${JSON.stringify(viewport.colorMode)}, 'color mode not applied');
      const slotCount = document.querySelectorAll('#pane-equipment .equip-slot').length;
      assert(slotCount === 5, 'slot count mismatch: ' + slotCount);
      assert(document.querySelector('#pane-equipment [data-equip-tooltip-slot="weapon"]'), 'weapon tooltip slot missing');
      assert(document.querySelector('#pane-equipment [data-unequip="weapon"]'), 'weapon unequip button missing');
      assert((document.querySelector('#pane-equipment')?.textContent || '').includes('赤陨灼枪'), 'weapon name missing');

      const weaponSlot = document.querySelector('#pane-equipment [data-equip-tooltip-slot="weapon"]');
      const rect = weaponSlot.getBoundingClientRect();
      assert(rect.width > 0 && rect.height > 0, 'weapon slot has empty rect');
      weaponSlot.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        composed: true,
        pointerId: 1,
        pointerType: 'mouse',
        clientX: rect.left + Math.min(24, rect.width / 2),
        clientY: rect.top + Math.min(24, rect.height / 2),
      }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        phase: 'ready',
        point: {
          x: rect.left + Math.min(24, rect.width / 2),
          y: rect.top + Math.min(24, rect.height / 2),
        },
      };
    })()
  `;
}

function expressionForScenarioAfterMouse(viewport) {
  return `
    (async () => {
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      assert(Array.from(document.querySelectorAll('.floating-tooltip.equipment-tooltip')).some((node) => node.classList.contains('visible') && node.textContent.includes('赤陨灼枪')), 'equipment tooltip not visible');
      const visibleTooltip = Array.from(document.querySelectorAll('.floating-tooltip.equipment-tooltip')).find((node) => node.classList.contains('visible') && node.textContent.includes('赤陨灼枪'));
      assert(visibleTooltip instanceof HTMLElement, 'visible equipment tooltip missing');
      const tooltip = visibleTooltip;
      const tooltipRect = tooltip.getBoundingClientRect();
      assert(tooltipRect.width > 0 && tooltipRect.height > 0, 'equipment tooltip has empty rect');
      assert(tooltipRect.left >= 0 && tooltipRect.top >= 0, 'equipment tooltip outside viewport start');
      assert(tooltipRect.left < window.innerWidth && tooltipRect.top < window.innerHeight, 'equipment tooltip outside viewport');

      document.querySelector('#pane-equipment [data-unequip="weapon"]').click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert(window.__reactEquipmentUnequipCalls.join(',') === 'weapon', 'unequip callback not fired with weapon slot');

      const originalHost = document.querySelector('#pane-equipment [data-react-panel="equipment"]');
      assert(originalHost, 'React equipment host missing before tab switch');
      const actionTab = document.querySelector('[data-side-panel-target="actions"]');
      const bagTab = document.querySelector('[data-side-panel-target="bag"]');
      actionTab?.click();
      bagTab?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      assert(document.querySelector('#pane-equipment [data-react-panel="equipment"]') === originalHost, 'equipment host rebuilt after tab switch');
      assert((document.querySelector('#pane-equipment')?.textContent || '').includes('赤陨灼枪'), 'equipment state lost after tab switch');

      return {
        viewport: ${JSON.stringify(viewport.name)},
        colorMode: document.documentElement.dataset.colorMode,
        slots: document.querySelectorAll('#pane-equipment .equip-slot').length,
        tooltipText: tooltip.textContent.slice(0, 80),
        unequipCalls: window.__reactEquipmentUnequipCalls,
        hostStable: document.querySelector('#pane-equipment [data-react-panel="equipment"]') === originalHost,
      };
    })()
  `;
}

async function runScenario(session, viewport) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await runScenarioOnce(session, viewport);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        log(`${viewport.name} 第 ${attempt} 次遇到页面刷新/准备态抖动，重试`);
        await delay(500);
      }
    }
  }
  throw lastError;
}

async function runScenarioOnce(session, viewport) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 600,
  });
  await session.send('Page.navigate', { url: `${BASE_URL}/?react-ui=1&react-panel=all` });
  await waitForPageReady(session);
  const setup = await session.send('Runtime.evaluate', {
    expression: expressionForScenario(viewport),
    awaitPromise: true,
    returnByValue: true,
  });
  if (setup.exceptionDetails) {
    fail(`${viewport.name} 准备失败: ${formatExceptionDetails(setup.exceptionDetails)}`);
  }
  const point = setup.result?.value?.point;
  if (!point) {
    fail(`${viewport.name} 未返回 tooltip 测试坐标: ${JSON.stringify(setup.result?.value)}`);
  }
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
    button: 'none',
    pointerType: 'mouse',
  });
  await delay(120);
  const result = await session.send('Runtime.evaluate', {
    expression: expressionForScenarioAfterMouse(viewport),
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    fail(`${viewport.name} 执行失败: ${formatExceptionDetails(result.exceptionDetails)}; setup=${JSON.stringify(setup.result?.value)}`);
  }
  if (result.result?.subtype === 'error') {
    fail(`${viewport.name} 执行失败: ${result.result.description}; setup=${JSON.stringify(setup.result?.value)}`);
  }
  log(`${viewport.name} 通过 ${JSON.stringify(result.result.value)}`);
}

function formatExceptionDetails(details) {
  const exception = details?.exception;
  return exception?.description || exception?.value || details?.text || JSON.stringify(details);
}

async function waitForPageReady(session) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await session.send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && !!document.querySelector('#pane-equipment [data-react-panel="equipment"]')`,
      returnByValue: true,
    });
    if (result.result?.value === true) {
      return;
    }
    await delay(250);
  }
  fail('页面或 React equipment host 未就绪');
}

async function main() {
  let preview = null;
  let chrome = null;
  let session = null;
  try {
    preview = await ensurePreview();
    const launched = await launchChrome();
    chrome = launched.chrome;
    session = new ChromeSession(launched.wsUrl);
    await session.open();
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    for (const viewport of VIEWPORTS) {
      await runScenario(session, viewport);
    }
    log('React equipment panel 登录态交互验收通过');
  } finally {
    session?.close();
    chrome?.kill('SIGTERM');
    preview?.kill('SIGTERM');
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
