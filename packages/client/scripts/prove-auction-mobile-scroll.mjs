/**
 * 手机端拍卖行滚动可达性 proof。
 *
 * 通过 Vite 加载正式客户端源码，并从 React 拍卖行入口进入生产弹层；
 * Chrome 只接收测试数据，不在 proof 中复制布局或滚动实现。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const MARKER = 'REPAIR_PROOF:ISSUE-000010:PASS';
const VIEWPORT = { width: 390, height: 844 };
const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(probe, label, timeoutMs = 15_000) {
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
  throw new Error('未找到可用于手机端布局 proof 的 Chrome');
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
      if (message.error) {
        pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result ?? {});
      }
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('Chrome CDP 连接意外关闭'));
      }
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
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description
        ?? result.exceptionDetails.text
        ?? '浏览器表达式执行失败';
      throw new Error(description);
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

function buildAuctionFixtureExpression() {
  return String.raw`
    (async () => {
      const { MarketPanel } = await import('/src/ui/panels/market-panel.ts');
      const panel = new MarketPanel();
      const now = Date.now();
      const bids = Array.from({ length: 6 }, (_, index) => ({
        bidderLabel: '竞拍者' + (index + 1),
        unitPrice: 100 + index * 10,
        createdAtMs: now - index * 60_000,
      }));
      const items = Array.from({ length: 10 }, (_, index) => {
        const sequence = index + 1;
        const item = {
          itemId: 'rat_tail',
          itemInstanceId: 'proof-lot-item-' + sequence,
          name: '鼠尾',
          desc: '手机端拍卖行滚动 proof 数据',
          type: 'material',
          count: 1,
          level: 1,
        };
        return {
          id: 'lot-proof-' + sequence,
          itemKey: 'rat_tail:proof:' + sequence,
          itemId: 'rat_tail',
          itemType: 'material',
          itemSubType: '',
          enhanceLevel: 0,
          item,
          currentPrice: 100 + index,
          buyoutPrice: 200 + index,
          bidCount: bids.length,
          bids,
          startAtMs: now,
          durationSeconds: 7_200,
          status: 'active',
          statusLabel: '竞拍中',
          sellerLabel: '寄拍者',
          lotNo: String(sequence).padStart(6, '0'),
          heat: bids.length,
          remainingQuantity: 1,
        };
      });
      panel.setCallbacks({
        onRequestMarket() {},
        onRequestListings() {},
        onRequestAuctionListings() {},
        onRequestTransmissionListings() {},
        onRequestItemBook() {},
        onRequestTradeHistory() {},
        onCreateSellOrder() {},
        onCreateAuctionSellOrder() {},
        onCreateBuyOrder() {},
        onPlaceAuctionBid() {},
        onBuyoutAuctionLot() {},
        onBuyTransmissionLot() {},
        onCreateTransmissionSellOrder() {},
        onBuyHeavenlyDaoShopItem() {},
        onCancelOrder() {},
        onClaimStorage() {},
      });
      panel.syncInventory({
        capacity: 40,
        items: [{
          itemId: 'spirit_stone',
          itemInstanceId: 'proof-currency',
          name: '灵石',
          desc: '',
          type: 'material',
          count: 9_999,
        }],
      });
      panel.updateMarket({
        currencyItemId: 'spirit_stone',
        currencyItemName: '灵石',
        listedItems: [],
        myOrders: [],
        storage: { items: [] },
      });
      panel.updateAuctionListings({
        currencyItemId: 'spirit_stone',
        currencyItemName: '灵石',
        tab: 'participate',
        page: 1,
        pageSize: 10,
        total: items.length,
        category: 'all',
        query: '',
        counts: { categoryCounts: { all: items.length, material: items.length } },
        summary: {
          activeLots: items.length,
          buyoutLots: items.length,
          totalCurrentPrice: 1_045,
          myBidCount: 1,
          myConsignments: 0,
          consigningLots: 0,
          soldLots: 0,
          failedLots: 0,
          storageCount: 0,
        },
        items,
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const entry = [...document.querySelectorAll('[data-react-panel="market"] button')]
        .find((button) => button.textContent?.trim() === '拍卖行');
      if (!(entry instanceof HTMLButtonElement)) throw new Error('未找到正式拍卖行入口');
      entry.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__auctionMobileProofPanel = panel;
      return {
        modalOpen: !document.getElementById('detail-modal')?.classList.contains('hidden'),
        modalClass: document.getElementById('detail-modal')?.className ?? '',
        title: document.getElementById('detail-modal-title')?.textContent?.trim() ?? '',
      };
    })()
  `;
}

const measureExpression = String.raw`
  (() => {
    const body = document.getElementById('detail-modal-body');
    const card = document.getElementById('detail-modal-card');
    const list = document.querySelector('.auction-list');
    const actions = document.querySelector('.auction-bid-actions');
    const summary = document.querySelector('.auction-house-summary');
    if (!(body instanceof HTMLElement)
      || !(card instanceof HTMLElement)
      || !(list instanceof HTMLElement)
      || !(actions instanceof HTMLElement)
      || !(summary instanceof HTMLElement)) {
      throw new Error('拍卖行正式弹层结构不完整');
    }
    const bodyRect = body.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    return {
      viewportHeight: innerHeight,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      bodyTop: bodyRect.top,
      bodyBottom: bodyRect.bottom,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyScrollTop: body.scrollTop,
      listClientHeight: list.clientHeight,
      listScrollHeight: list.scrollHeight,
      listScrollTop: list.scrollTop,
      listPoint: {
        x: Math.max(listRect.left + 1, Math.min(listRect.right - 1, listRect.left + listRect.width / 2)),
        y: Math.max(bodyRect.top + 1, Math.min(bodyRect.bottom - 1, listRect.top + Math.max(1, listRect.height / 2))),
      },
      summaryPoint: {
        x: summaryRect.left + summaryRect.width / 2,
        y: summaryRect.top + summaryRect.height / 2,
      },
      actionsTop: actionsRect.top,
      actionsBottom: actionsRect.bottom,
      actionsVisible: actionsRect.top >= bodyRect.top && actionsRect.bottom <= bodyRect.bottom,
      enabledActionCount: [...actions.querySelectorAll('button')].filter((button) => !button.disabled).length,
    };
  })()
`;

async function main() {
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
    const pageUrl = `http://127.0.0.1:${address.port}/`;

    profileDir = await mkdtemp(path.join(os.tmpdir(), 'auction-mobile-proof-'));
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
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: VIEWPORT.width,
      screenHeight: VIEWPORT.height,
    });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Page.navigate', { url: pageUrl });
    await waitFor(
      () => cdp.evaluate(`document.readyState === 'complete' && Boolean(document.getElementById('detail-modal-body'))`),
      '正式客户端页面加载',
    );

    const opened = await cdp.evaluate(buildAuctionFixtureExpression());
    assert.equal(opened.modalOpen, true, '拍卖行入口未打开正式详情弹层');
    assert.match(opened.modalClass, /\bdetail-modal--auction-house\b/, '未进入正式拍卖行弹层变体');
    assert.equal(opened.title, '拍卖行', '正式拍卖行弹层标题不正确');

    const initial = await cdp.evaluate(measureExpression);
    assert(initial.cardTop >= 0 && initial.cardBottom <= initial.viewportHeight, '手机端拍卖弹层超出安全视口');
    assert(
      initial.bodyScrollHeight > initial.bodyClientHeight + 1,
      `拍卖弹层 body 没有纵向滚动范围：${initial.bodyScrollHeight}/${initial.bodyClientHeight}`,
    );
    assert(
      initial.listClientHeight >= 160,
      `手机端拍品列表可视高度不足：${initial.listClientHeight}px`,
    );
    assert(
      initial.listScrollHeight > initial.listClientHeight,
      '十条拍品未形成独立列表滚动范围',
    );

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: initial.listPoint.x,
      y: initial.listPoint.y,
      deltaX: 0,
      deltaY: 600,
    });
    await delay(150);
    const listScrolled = await cdp.evaluate(measureExpression);
    assert(listScrolled.listScrollTop > 0, '触控等价滚动未推进拍品列表');

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: initial.summaryPoint.x,
      y: initial.summaryPoint.y,
      deltaX: 0,
      deltaY: 2_000,
    });
    await delay(150);
    const scrolled = await cdp.evaluate(measureExpression);
    assert(scrolled.bodyScrollTop > 0, '触控等价滚动未推进拍卖弹层 body');
    assert.equal(scrolled.actionsVisible, true, '滚动到底后竞价操作区仍不可见');
    assert(scrolled.enabledActionCount >= 2, '竞价与一口价操作未同时保持可用');

    console.log(MARKER);
  } finally {
    cdp?.close();
    await stopChild(chrome);
    await viteServer?.close();
    if (profileDir) await rm(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
