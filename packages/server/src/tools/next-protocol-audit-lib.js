"use strict";
/**
 * 用途：提供 next 协议审计脚本的共享函数。
 */

Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUniqueItemIds = exports.waitForState = exports.createCaseRuntime = exports.createRuntimeApi = exports.createAuditedSocket = exports.createAuditor = exports.measurePayloadBytes = exports.waitForHealth = exports.stopServer = exports.startIsolatedServer = exports.allocateFreePort = exports.waitForValue = exports.waitFor = exports.delay = exports.repoRoot = exports.distRoot = exports.packageRoot = void 0;
/** node_child_process_1：定义该变量以承载业务值。 */
const node_child_process_1 = require("node:child_process");
/** fs：定义该变量以承载业务值。 */
const fs = require("node:fs");
/** net：定义该变量以承载业务值。 */
const net = require("node:net");
/** path：定义该变量以承载业务值。 */
const path = require("node:path");
/** socket_io_client_1：定义该变量以承载业务值。 */
const socket_io_client_1 = require("socket.io-client");
/** env_alias_1：定义该变量以承载业务值。 */
const env_alias_1 = require("../config/env-alias");
exports.packageRoot = path.resolve(__dirname, '..', '..');
exports.distRoot = path.join(exports.packageRoot, 'dist');
exports.repoRoot = path.resolve(exports.packageRoot, '..', '..');
/**
 * 记录服务端入口文件路径。
 */
const serverEntry = path.join(exports.distRoot, 'main.js');
/**
 * 处理delay。
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
exports.delay = delay;
/**
 * 等待for。
 */
async function waitFor(predicate, timeoutMs, label = 'waitFor') {
/**
 * 记录startedat。
 */
  const startedAt = Date.now();
  while (true) {
    if (await predicate()) {
      return;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`${label} timeout after ${timeoutMs}ms`);
    }
    await delay(100);
  }
}
exports.waitFor = waitFor;
/**
 * 等待for价值。
 */
async function waitForValue(producer, timeoutMs, label = 'waitForValue') {
/**
 * 记录resolved。
 */
  let resolved = null;
  await waitFor(async () => {
    resolved = await producer();
    return resolved !== null && resolved !== undefined;
  }, timeoutMs, label);
  return resolved;
}
exports.waitForValue = waitForValue;
/**
 * 分配free端口。
 */
async function allocateFreePort() {
  return new Promise((resolve, reject) => {
/**
 * 记录服务端。
 */
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
/**
 * 记录address。
 */
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to allocate free port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}
exports.allocateFreePort = allocateFreePort;
/**
 * 启动isolated服务端。
 */
async function startIsolatedServer(port) {
  return new Promise((resolve, reject) => {
/**
 * 记录子进程。
 */
    const child = (0, node_child_process_1.spawn)('node', [serverEntry], {
      cwd: exports.packageRoot,
      env: {
        ...process.env,
        SERVER_NEXT_PORT: String(port),
        SERVER_NEXT_RUNTIME_HTTP: '1',
        SERVER_NEXT_ALLOW_UNREADY_TRAFFIC: '1',
        SERVER_NEXT_SMOKE_ALLOW_UNREADY: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
/**
 * 记录缓冲区。
 */
    let buffer = '';
/**
 * 记录settled。
 */
    let settled = false;
/**
 * 记录超时时间。
 */
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error('server-next isolated startup timeout'));
    }, 20_000);
/**
 * 刷新flush。
 */
    function flush(stream, chunk) {
/**
 * 记录text。
 */
      const text = chunk.toString();
      buffer += text;
      process[stream].write(text);
/**
 * 记录match。
 */
      const match = buffer.match(/Server Next running on http:\/\/[^:]+:(\d+)/);
      if (!match || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.serverPort = Number(match[1]);
      resolve(child);
    }
    child.stdout.on('data', (chunk) => flush('stdout', chunk));
    child.stderr.on('data', (chunk) => flush('stderr', chunk));
    child.once('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`server-next isolated server exited before ready: code=${code} signal=${signal ?? 'none'}`));
        return;
      }
      if (code !== null && code !== 0) {
        process.stderr.write(`[next audit] isolated server exited unexpectedly: code=${code} signal=${signal ?? 'none'}\n`);
      }
    });
  });
}
exports.startIsolatedServer = startIsolatedServer;
/**
 * 停止服务端。
 */
async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGINT');
  await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve())),
    new Promise((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
        resolve();
      }, 4_000);
    }),
  ]);
}
exports.stopServer = stopServer;
/**
 * 等待for健康状态。
 */
async function waitForHealth(baseUrl, timeoutMs) {
  await waitFor(async () => {
    try {
/**
 * 记录response。
 */
      const response = await fetch(`${baseUrl}/health`);
      return response.ok || response.status === 503;
    } catch {
      return false;
    }
  }, timeoutMs, `waitForHealth:${baseUrl}`);
}
exports.waitForHealth = waitForHealth;
/**
 * 处理measurepayloadbytes。
 */
function measurePayloadBytes(payload) {
  if (payload === undefined) {
    return 0;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.byteLength;
  }
  if (payload instanceof Uint8Array) {
    return payload.byteLength;
  }
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}
exports.measurePayloadBytes = measurePayloadBytes;
/**
 * 处理invertevent地图。
 */
function invertEventMap(input) {
/**
 * 累计当前结果。
 */
  const result = new Map();
  for (const [name, wireEvent] of Object.entries(input)) {
    result.set(wireEvent, name);
  }
  return result;
}
/**
 * 创建auditor。
 */
function createAuditor(options) {
/**
 * 记录eventnames。
 */
  const eventNames = {
    c2s: invertEventMap(options.c2s),
    s2c: invertEventMap(options.s2c),
  };
/**
 * 记录expected。
 */
  const expected = {
    c2s: [...options.expectedC2S],
    s2c: [...options.expectedS2C],
  };
/**
 * 记录属性字段。
 */
  const stats = new Map();
/**
 * 记录coverage。
 */
  const coverage = {
    c2s: new Map(),
    s2c: new Map(),
  };
/**
 * 记录records。
 */
  const records = [];
/**
 * 获取属性字段key。
 */
  function getStatKey(direction, event) {
    return `${direction}:${event}`;
  }
/**
 * 确保coverage。
 */
  function ensureCoverage(direction, event) {
/**
 * 记录cases。
 */
    let cases = coverage[direction].get(event);
    if (!cases) {
      cases = new Set();
      coverage[direction].set(event, cases);
    }
    return cases;
  }
/**
 * 确保属性字段。
 */
  function ensureStat(direction, event) {
/**
 * 记录key。
 */
    const key = getStatKey(direction, event);
/**
 * 记录entry。
 */
    let entry = stats.get(key);
    if (!entry) {
      entry = {
        direction,
        event,
        eventName: eventNames[direction].get(event) ?? event,
        count: 0,
        totalBytes: 0,
        caseNames: new Set(),
        socketLabels: new Set(),
      };
      stats.set(key, entry);
    }
    return entry;
  }
/**
 * 处理record。
 */
  function record(direction, event, payload, caseName, socketLabel) {
/**
 * 记录bytes。
 */
    const bytes = measurePayloadBytes(payload);
/**
 * 记录属性字段。
 */
    const stat = ensureStat(direction, event);
    stat.count += 1;
    stat.totalBytes += bytes;
    stat.caseNames.add(caseName);
    if (socketLabel) {
      stat.socketLabels.add(socketLabel);
    }
    ensureCoverage(direction, event).add(caseName);
    records.push({
      direction,
      event,
      eventName: stat.eventName,
      bytes,
      caseName,
      socketLabel,
    });
  }
/**
 * 处理列表caseevents。
 */
  function listCaseEvents(caseName, direction) {
    return Array.from(new Set(records
      .filter((entry) => entry.caseName === caseName && entry.direction === direction)
      .map((entry) => entry.event)))
      .sort((left, right) => left.localeCompare(right));
  }
/**
 * 构建coverage行数据。
 */
  function buildCoverageRows(direction) {
    return expected[direction].map((event) => {
/**
 * 记录属性字段。
 */
      const stat = stats.get(getStatKey(direction, event));
/**
 * 记录cases。
 */
      const cases = coverage[direction].get(event);
      return {
        direction,
        event,
        eventName: eventNames[direction].get(event) ?? event,
        covered: Boolean(cases && cases.size > 0),
        count: stat?.count ?? 0,
        totalBytes: stat?.totalBytes ?? 0,
        averageBytes: stat?.count ? Math.round(stat.totalBytes / stat.count) : 0,
        caseNames: cases ? [...cases].sort() : [],
      };
    });
  }
/**
 * 构建traffic行数据。
 */
  function buildTrafficRows() {
    return Array.from(stats.values())
      .map((entry) => ({
        direction: entry.direction,
        event: entry.event,
        eventName: entry.eventName,
        count: entry.count,
        totalBytes: entry.totalBytes,
        averageBytes: entry.count > 0 ? Math.round(entry.totalBytes / entry.count) : 0,
        caseNames: [...entry.caseNames].sort(),
        socketLabels: [...entry.socketLabels].sort(),
      }))
      .sort((left, right) => right.totalBytes - left.totalBytes || right.count - left.count || left.event.localeCompare(right.event));
  }
/**
 * 构建missing。
 */
  function buildMissing(direction) {
    return buildCoverageRows(direction)
      .filter((entry) => !entry.covered)
      .map((entry) => ({
        event: entry.event,
        eventName: entry.eventName,
      }));
  }
  return {
    record,
    records,
    eventNames,
    expected,
    buildCoverageRows,
    buildTrafficRows,
    buildMissing,
    listCaseEvents,
  };
}
exports.createAuditor = createAuditor;
/**
 * 创建auditedsocket。
 */
function createAuditedSocket(options) {
/**
 * 记录socket。
 */
  const socket = (0, socket_io_client_1.io)(options.baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    forceNew: true,
    auth: options.auth,
  });
/**
 * 记录history。
 */
  const history = [];
/**
 * 记录byevent。
 */
  const byEvent = new Map();
  socket.onAny((event, payload) => {
    options.auditor.record('s2c', event, payload, options.caseName, options.label);
    history.push({ event, payload, at: Date.now() });
/**
 * 记录当前值。
 */
    const current = byEvent.get(event) ?? [];
    current.push(payload);
    byEvent.set(event, current);
  });
/**
 * 处理onceconnected。
 */
  async function onceConnected() {
    if (socket.connected) {
      return;
    }
    await new Promise((resolve, reject) => {
/**
 * 记录timer。
 */
      const timer = setTimeout(() => reject(new Error(`socket connect timeout: ${options.label}`)), 5_000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
/**
 * 处理emit。
 */
  function emit(event, payload) {
    options.auditor.record('c2s', event, payload, options.caseName, options.label);
    socket.emit(event, payload);
  }
/**
 * 等待forevent。
 */
  async function waitForEvent(event, predicate = () => true, timeoutMs = 5_000) {
    return waitForValue(async () => {
/**
 * 记录payloads。
 */
      const payloads = byEvent.get(event) ?? [];
      for (let index = payloads.length - 1; index >= 0; index -= 1) {
/**
 * 记录payload。
 */
        const payload = payloads[index];
        if (await predicate(payload)) {
          return payload;
        }
      }
      return null;
    }, timeoutMs, `${options.caseName}:${options.label}:${event}`);
  }
/**
 * 获取event数量。
 */
  function getEventCount(event) {
    return (byEvent.get(event) ?? []).length;
  }
/**
 * 等待foreventafter。
 */
  async function waitForEventAfter(event, afterCount, predicate = () => true, timeoutMs = 5_000) {
    return waitForValue(async () => {
/**
 * 记录payloads。
 */
      const payloads = byEvent.get(event) ?? [];
      for (let index = payloads.length - 1; index >= afterCount; index -= 1) {
/**
 * 记录payload。
 */
        const payload = payloads[index];
        if (await predicate(payload)) {
          return payload;
        }
      }
      return null;
    }, timeoutMs, `${options.caseName}:${options.label}:${event}:after:${afterCount}`);
  }
/**
 * 获取events。
 */
  function getEvents(event) {
    return [...(byEvent.get(event) ?? [])];
  }
/**
 * 处理close。
 */
  function close() {
    socket.close();
  }
  return {
    socket,
    label: options.label,
    history,
    onceConnected,
    emit,
    waitForEvent,
    waitForEventAfter,
    getEventCount,
    getEvents,
    close,
  };
}
exports.createAuditedSocket = createAuditedSocket;
/**
 * 创建运行态API。
 */
function createRuntimeApi(baseUrl) {
/**
 * 处理request。
 */
  async function request(pathname, options = {}) {
/**
 * 记录response。
 */
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: options.method ?? 'GET',
/** headers：定义该变量以承载业务值。 */
      headers: options.body === undefined ? undefined : {
        'content-type': 'application/json',
      },
/** body：定义该变量以承载业务值。 */
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      throw new Error(`request failed: ${options.method ?? 'GET'} ${pathname}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
      return null;
    }
/**
 * 记录text。
 */
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    request,
/** get：执行对应的业务逻辑。 */
    get(pathname) {
      return request(pathname);
    },
/** post：执行对应的业务逻辑。 */
    post(pathname, body) {
      return request(pathname, { method: 'POST', body });
    },
/** delete：执行对应的业务逻辑。 */
    delete(pathname) {
      return request(pathname, { method: 'DELETE' });
    },
/** connectPlayer：执行对应的业务逻辑。 */
    connectPlayer(payload) {
      return request('/runtime/players/connect', {
        method: 'POST',
        body: payload,
      });
    },
/** fetchState：执行对应的业务逻辑。 */
    fetchState(playerId) {
      return request(`/runtime/players/${playerId}/state`);
    },
/** fetchMarket：执行对应的业务逻辑。 */
    fetchMarket(playerId) {
      return request(`/runtime/players/${playerId}/market`);
    },
/** grantItem：执行对应的业务逻辑。 */
    grantItem(playerId, itemId, count = 1) {
      return request(`/runtime/players/${playerId}/grant-item`, {
        method: 'POST',
        body: { itemId, count },
      });
    },
/** setVitals：执行对应的业务逻辑。 */
    setVitals(playerId, payload) {
      return request(`/runtime/players/${playerId}/vitals`, {
        method: 'POST',
        body: payload,
      });
    },
/** createDirectMail：执行对应的业务逻辑。 */
    createDirectMail(playerId, payload) {
      return request(`/runtime/players/${playerId}/mail/direct`, {
        method: 'POST',
        body: payload,
      });
    },
/** queuePendingLogbookMessage：执行对应的业务逻辑。 */
    queuePendingLogbookMessage(playerId, payload) {
      return request(`/runtime/players/${playerId}/pending-logbook`, {
        method: 'POST',
        body: payload,
      });
    },
/** deletePlayer：执行对应的业务逻辑。 */
    deletePlayer(playerId) {
      return request(`/runtime/players/${playerId}`, {
        method: 'DELETE',
      });
    },
  };
}
exports.createRuntimeApi = createRuntimeApi;
/**
 * 创建case运行态。
 */
function createCaseRuntime(options) {
/**
 * 记录sockets。
 */
  const sockets = [];
/**
 * 记录玩家ids。
 */
  const playerIds = new Set();
  return {
    api: options.api,
    auditor: options.auditor,
    caseName: options.caseName,
    baseUrl: options.baseUrl,
/** trackPlayer：执行对应的业务逻辑。 */
    trackPlayer(playerId) {
      playerIds.add(playerId);
      return playerId;
    },
/** createSocket：执行对应的业务逻辑。 */
    createSocket(label, auth) {
/**
 * 记录socket。
 */
      const socket = createAuditedSocket({
        baseUrl: options.baseUrl,
        auditor: options.auditor,
        caseName: options.caseName,
        label,
        auth,
      });
      sockets.push(socket);
      return socket;
    },
/** getSockets：执行对应的业务逻辑。 */
    getSockets() {
      return [...sockets];
    },
/** cleanup：执行对应的业务逻辑。 */
    async cleanup() {
      for (const socket of sockets.splice(0)) {
        try {
          socket.close();
        } catch {
          // ignore cleanup failure
        }
      }
      for (const playerId of playerIds) {
        try {
          await options.api.deletePlayer(playerId);
        } catch {
          // ignore cleanup failure
        }
      }
    },
  };
}
exports.createCaseRuntime = createCaseRuntime;
/**
 * 等待for状态。
 */
async function waitForState(api, playerId, predicate, timeoutMs, label = 'waitForState') {
  return waitForValue(async () => {
/**
 * 记录payload。
 */
    const payload = await api.fetchState(playerId);
/**
 * 记录玩家。
 */
    const player = payload?.player ?? null;
    if (!player) {
      return null;
    }
    return await predicate(player, payload) ? payload : null;
  }, timeoutMs, `${label}:${playerId}`);
}
exports.waitForState = waitForState;
/**
 * 加载unique物品ids。
 */
function loadUniqueItemIds() {
/**
 * 记录物品根目录。
 */
  const itemRoot = path.join(exports.repoRoot, 'packages', 'server', 'data', 'content', 'items');
/**
 * 记录seen。
 */
  const seen = new Set();
/**
 * 累计当前结果。
 */
  const result = [];
/**
 * 递归遍历walk。
 */
  function walk(currentPath) {
/**
 * 汇总当前条目列表。
 */
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
/**
 * 记录完整流程路径。
 */
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
/**
 * 记录文档。
 */
      const document = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
/**
 * 记录items。
 */
      const items = Array.isArray(document?.items)
        ? document.items
        : Array.isArray(document)
          ? document
          : [];
      for (const item of items) {
/**
 * 记录物品ID。
 */
        const itemId = typeof item?.itemId === 'string' ? item.itemId.trim() : '';
        if (!itemId || seen.has(itemId)) {
          continue;
        }
        seen.add(itemId);
        result.push(itemId);
      }
    }
  }
  walk(itemRoot);
  return result;
}
exports.loadUniqueItemIds = loadUniqueItemIds;
/** shared_next_compat：定义该变量以承载业务值。 */
const shared_next_compat = require('@mud/shared-next');
/**
 * 记录rawstartisolated服务端。
 */
const rawStartIsolatedServer = startIsolatedServer;
/**
 * 记录rawstop服务端。
 */
const rawStopServer = stopServer;

/** AuditCollector：定义该类及其职责。 */
class AuditCollector {
/** 构造函数：执行实例初始化流程。 */
  constructor() {
    this.entries = new Map();
    this.caseResults = [];
  }

/** startCase：执行对应的业务逻辑。 */
  startCase(name) {
    return { name, startedAt: Date.now() };
  }

/** finishCase：执行对应的业务逻辑。 */
  finishCase(token, status, notes) {
    this.caseResults.push({
      name: token.name,
      status,
      notes: notes ?? '',
      durationMs: Date.now() - token.startedAt,
    });
  }

/** record：执行对应的业务逻辑。 */
  record(direction, event, payload, caseName, socketLabel) {
/**
 * 记录key。
 */
    const key = direction + ':' + event;
/**
 * 记录entry。
 */
    const entry = this.entries.get(key) ?? {
      direction,
      event,
      label: resolveCompatEventLabel(direction, event),
      count: 0,
      totalBytes: 0,
      cases: new Set(),
      sockets: new Set(),
    };
    entry.count += 1;
    entry.totalBytes += measurePayloadBytes(payload);
    if (caseName) {
      entry.cases.add(caseName);
    }
    if (socketLabel) {
      entry.sockets.add(socketLabel);
    }
    this.entries.set(key, entry);
  }

/** getEntry：执行对应的业务逻辑。 */
  getEntry(direction, event) {
    return this.entries.get(direction + ':' + event) ?? null;
  }

/** buildCoverageRows：执行对应的业务逻辑。 */
  buildCoverageRows(direction, expectedEvents) {
    return expectedEvents.map((event) => {
/**
 * 记录entry。
 */
      const entry = this.getEntry(direction, event);
      return {
        direction,
        event,
        wire: event,
        label: resolveCompatEventLabel(direction, event),
/** covered：定义该变量以承载业务值。 */
        covered: entry !== null,
        count: entry?.count ?? 0,
        totalBytes: entry?.totalBytes ?? 0,
        avgBytes: entry && entry.count > 0 ? Math.round(entry.totalBytes / entry.count) : 0,
        cases: entry ? [...entry.cases].sort() : [],
      };
    });
  }

/** buildTrafficRows：执行对应的业务逻辑。 */
  buildTrafficRows() {
    return [...this.entries.values()]
      .map((entry) => ({
        direction: entry.direction,
        event: entry.event,
        wire: entry.event,
        label: entry.label,
        count: entry.count,
        totalBytes: entry.totalBytes,
        avgBytes: entry.count > 0 ? Math.round(entry.totalBytes / entry.count) : 0,
        cases: [...entry.cases].sort(),
        sockets: [...entry.sockets].sort(),
      }))
      .sort((left, right) => right.totalBytes - left.totalBytes || right.count - left.count || left.event.localeCompare(right.event));
  }
}

/**
 * 解析compateventlabel。
 */
function resolveCompatEventLabel(direction, event) {
/**
 * 记录来源。
 */
  const source = direction === 'c2s' ? shared_next_compat.NEXT_C2S : shared_next_compat.NEXT_S2C;
  for (const [label, wire] of Object.entries(source)) {
    if (wire === event) {
      return label;
    }
  }
  return event;
}

/**
 * 启动isolated服务端compat。
 */
async function startIsolatedServerCompat() {
/**
 * 记录端口。
 */
  const port = await allocateFreePort();
/**
 * 记录base地址。
 */
  const baseUrl = 'http://127.0.0.1:' + port;
/**
 * 记录子进程。
 */
  const child = await rawStartIsolatedServer(port);
  await waitForHealth(baseUrl, 12_000);
  return { port, baseUrl, child };
}

/**
 * 停止isolated服务端compat。
 */
async function stopIsolatedServerCompat(handle) {
  return rawStopServer(handle?.child ?? handle);
}

/**
 * 创建auditedsocketcompat。
 */
function createAuditedSocketCompat(baseUrl, audit, caseName, label) {
  return createAuditedSocket({ baseUrl, auditor: audit, caseName, label });
}

/**
 * 处理connecthello。
 */
async function connectHello(socket, payload, timeoutMs = 5_000) {
  await new Promise((resolve, reject) => {
    if (socket.socket.connected) {
      resolve();
      return;
    }
/**
 * 记录timer。
 */
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), timeoutMs);
    socket.socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  socket.emit(shared_next_compat.NEXT_C2S.Hello, payload);
  return socket.waitForEvent(shared_next_compat.NEXT_S2C.InitSession, () => true, timeoutMs);
}

/**
 * 处理postjsoncompat。
 */
async function postJsonCompat(baseUrl, requestPath, body) {
/**
 * 记录response。
 */
  const response = await fetch(baseUrl + requestPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
/**
 * 记录text。
 */
  const text = await response.text();
  return text.trim().length > 0 ? JSON.parse(text) : null;
}

/**
 * 处理fetch状态compat。
 */
async function fetchStateCompat(baseUrl, playerId) {
/**
 * 记录response。
 */
  const response = await fetch(baseUrl + '/runtime/players/' + playerId + '/state');
  if (!response.ok) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
  return response.json();
}

/**
 * 处理fetchtile状态compat。
 */
async function fetchTileStateCompat(baseUrl, instanceId, x, y) {
/**
 * 记录response。
 */
  const response = await fetch(baseUrl + '/runtime/instances/' + instanceId + '/tiles/' + x + '/' + y);
  if (!response.ok) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
  return response.json();
}

/**
 * 处理delete玩家compat。
 */
async function deletePlayerCompat(baseUrl, playerId) {
/**
 * 记录response。
 */
  const response = await fetch(baseUrl + '/runtime/players/' + playerId, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
}

/**
 * 写入markdown。
 */
async function writeMarkdown(relativePath, content) {
  fs.writeFileSync(path.join(exports.repoRoot, relativePath), content, 'utf8');
}

/**
 * 处理unique玩家ID。
 */
function uniquePlayerId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * 判断是否已数据库URL。
 */
function hasDatabaseUrl() {
/**
 * 记录数据库地址。
 */
  const databaseUrl = (0, env_alias_1.resolveServerNextDatabaseUrl)();
  return databaseUrl.trim().length > 0;
}

exports.AuditCollector = AuditCollector;
exports.connectHello = connectHello;
exports.createAuditedSocket = createAuditedSocketCompat;
exports.startIsolatedServer = startIsolatedServerCompat;
exports.stopIsolatedServer = stopIsolatedServerCompat;
exports.postJson = postJsonCompat;
exports.fetchState = fetchStateCompat;
exports.fetchTileState = fetchTileStateCompat;
exports.deletePlayer = deletePlayerCompat;
exports.writeMarkdown = writeMarkdown;
exports.uniquePlayerId = uniquePlayerId;
exports.hasDatabaseUrl = hasDatabaseUrl;
