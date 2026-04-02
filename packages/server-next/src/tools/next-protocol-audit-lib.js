"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUniqueItemIds = exports.waitForState = exports.createCaseRuntime = exports.createRuntimeApi = exports.createAuditedSocket = exports.createAuditor = exports.measurePayloadBytes = exports.waitForHealth = exports.stopServer = exports.startIsolatedServer = exports.allocateFreePort = exports.waitForValue = exports.waitFor = exports.delay = exports.repoRoot = exports.distRoot = exports.packageRoot = void 0;
const node_child_process_1 = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const socket_io_client_1 = require("socket.io-client");
exports.packageRoot = path.resolve(__dirname, '..', '..');
exports.distRoot = path.join(exports.packageRoot, 'dist');
exports.repoRoot = path.resolve(exports.packageRoot, '..', '..');
const serverEntry = path.join(exports.distRoot, 'main.js');
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
exports.delay = delay;
async function waitFor(predicate, timeoutMs, label = 'waitFor') {
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
async function waitForValue(producer, timeoutMs, label = 'waitForValue') {
  let resolved = null;
  await waitFor(async () => {
    resolved = await producer();
    return resolved !== null && resolved !== undefined;
  }, timeoutMs, label);
  return resolved;
}
exports.waitForValue = waitForValue;
async function allocateFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
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
async function startIsolatedServer(port) {
  return new Promise((resolve, reject) => {
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
    let buffer = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error('server-next isolated startup timeout'));
    }, 20_000);
    function flush(stream, chunk) {
      const text = chunk.toString();
      buffer += text;
      process[stream].write(text);
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
async function waitForHealth(baseUrl, timeoutMs) {
  await waitFor(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      return response.ok || response.status === 503;
    } catch {
      return false;
    }
  }, timeoutMs, `waitForHealth:${baseUrl}`);
}
exports.waitForHealth = waitForHealth;
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
function invertEventMap(input) {
  const result = new Map();
  for (const [name, wireEvent] of Object.entries(input)) {
    result.set(wireEvent, name);
  }
  return result;
}
function createAuditor(options) {
  const eventNames = {
    c2s: invertEventMap(options.c2s),
    s2c: invertEventMap(options.s2c),
  };
  const expected = {
    c2s: [...options.expectedC2S],
    s2c: [...options.expectedS2C],
  };
  const stats = new Map();
  const coverage = {
    c2s: new Map(),
    s2c: new Map(),
  };
  const records = [];
  function getStatKey(direction, event) {
    return `${direction}:${event}`;
  }
  function ensureCoverage(direction, event) {
    let cases = coverage[direction].get(event);
    if (!cases) {
      cases = new Set();
      coverage[direction].set(event, cases);
    }
    return cases;
  }
  function ensureStat(direction, event) {
    const key = getStatKey(direction, event);
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
  function record(direction, event, payload, caseName, socketLabel) {
    const bytes = measurePayloadBytes(payload);
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
  function listCaseEvents(caseName, direction) {
    return Array.from(new Set(records
      .filter((entry) => entry.caseName === caseName && entry.direction === direction)
      .map((entry) => entry.event)))
      .sort((left, right) => left.localeCompare(right));
  }
  function buildCoverageRows(direction) {
    return expected[direction].map((event) => {
      const stat = stats.get(getStatKey(direction, event));
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
function createAuditedSocket(options) {
  const socket = (0, socket_io_client_1.io)(options.baseUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    forceNew: true,
    auth: options.auth,
  });
  const history = [];
  const byEvent = new Map();
  socket.onAny((event, payload) => {
    options.auditor.record('s2c', event, payload, options.caseName, options.label);
    history.push({ event, payload, at: Date.now() });
    const current = byEvent.get(event) ?? [];
    current.push(payload);
    byEvent.set(event, current);
  });
  async function onceConnected() {
    if (socket.connected) {
      return;
    }
    await new Promise((resolve, reject) => {
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
  function emit(event, payload) {
    options.auditor.record('c2s', event, payload, options.caseName, options.label);
    socket.emit(event, payload);
  }
  async function waitForEvent(event, predicate = () => true, timeoutMs = 5_000) {
    return waitForValue(async () => {
      const payloads = byEvent.get(event) ?? [];
      for (let index = payloads.length - 1; index >= 0; index -= 1) {
        const payload = payloads[index];
        if (await predicate(payload)) {
          return payload;
        }
      }
      return null;
    }, timeoutMs, `${options.caseName}:${options.label}:${event}`);
  }
  function getEventCount(event) {
    return (byEvent.get(event) ?? []).length;
  }
  async function waitForEventAfter(event, afterCount, predicate = () => true, timeoutMs = 5_000) {
    return waitForValue(async () => {
      const payloads = byEvent.get(event) ?? [];
      for (let index = payloads.length - 1; index >= afterCount; index -= 1) {
        const payload = payloads[index];
        if (await predicate(payload)) {
          return payload;
        }
      }
      return null;
    }, timeoutMs, `${options.caseName}:${options.label}:${event}:after:${afterCount}`);
  }
  function getEvents(event) {
    return [...(byEvent.get(event) ?? [])];
  }
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
function createRuntimeApi(baseUrl) {
  async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : {
        'content-type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      throw new Error(`request failed: ${options.method ?? 'GET'} ${pathname}: ${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return {
    request,
    get(pathname) {
      return request(pathname);
    },
    post(pathname, body) {
      return request(pathname, { method: 'POST', body });
    },
    delete(pathname) {
      return request(pathname, { method: 'DELETE' });
    },
    connectPlayer(payload) {
      return request('/runtime/players/connect', {
        method: 'POST',
        body: payload,
      });
    },
    fetchState(playerId) {
      return request(`/runtime/players/${playerId}/state`);
    },
    fetchMarket(playerId) {
      return request(`/runtime/players/${playerId}/market`);
    },
    grantItem(playerId, itemId, count = 1) {
      return request(`/runtime/players/${playerId}/grant-item`, {
        method: 'POST',
        body: { itemId, count },
      });
    },
    setVitals(playerId, payload) {
      return request(`/runtime/players/${playerId}/vitals`, {
        method: 'POST',
        body: payload,
      });
    },
    createDirectMail(playerId, payload) {
      return request(`/runtime/players/${playerId}/mail/direct`, {
        method: 'POST',
        body: payload,
      });
    },
    queuePendingLogbookMessage(playerId, payload) {
      return request(`/runtime/players/${playerId}/pending-logbook`, {
        method: 'POST',
        body: payload,
      });
    },
    deletePlayer(playerId) {
      return request(`/runtime/players/${playerId}`, {
        method: 'DELETE',
      });
    },
  };
}
exports.createRuntimeApi = createRuntimeApi;
function createCaseRuntime(options) {
  const sockets = [];
  const playerIds = new Set();
  return {
    api: options.api,
    auditor: options.auditor,
    caseName: options.caseName,
    baseUrl: options.baseUrl,
    trackPlayer(playerId) {
      playerIds.add(playerId);
      return playerId;
    },
    createSocket(label, auth) {
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
async function waitForState(api, playerId, predicate, timeoutMs, label = 'waitForState') {
  return waitForValue(async () => {
    const payload = await api.fetchState(playerId);
    const player = payload?.player ?? null;
    if (!player) {
      return null;
    }
    return await predicate(player, payload) ? payload : null;
  }, timeoutMs, `${label}:${playerId}`);
}
exports.waitForState = waitForState;
function loadUniqueItemIds() {
  const itemRoot = path.join(exports.repoRoot, 'packages', 'server', 'data', 'content', 'items');
  const seen = new Set();
  const result = [];
  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const document = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const items = Array.isArray(document?.items)
        ? document.items
        : Array.isArray(document)
          ? document
          : [];
      for (const item of items) {
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
const shared_next_compat = require('@mud/shared-next');
const rawStartIsolatedServer = startIsolatedServer;
const rawStopServer = stopServer;

class AuditCollector {
  constructor() {
    this.entries = new Map();
    this.caseResults = [];
  }

  startCase(name) {
    return { name, startedAt: Date.now() };
  }

  finishCase(token, status, notes) {
    this.caseResults.push({
      name: token.name,
      status,
      notes: notes ?? '',
      durationMs: Date.now() - token.startedAt,
    });
  }

  record(direction, event, payload, caseName, socketLabel) {
    const key = direction + ':' + event;
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

  getEntry(direction, event) {
    return this.entries.get(direction + ':' + event) ?? null;
  }

  buildCoverageRows(direction, expectedEvents) {
    return expectedEvents.map((event) => {
      const entry = this.getEntry(direction, event);
      return {
        direction,
        event,
        wire: event,
        label: resolveCompatEventLabel(direction, event),
        covered: entry !== null,
        count: entry?.count ?? 0,
        totalBytes: entry?.totalBytes ?? 0,
        avgBytes: entry && entry.count > 0 ? Math.round(entry.totalBytes / entry.count) : 0,
        cases: entry ? [...entry.cases].sort() : [],
      };
    });
  }

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

function resolveCompatEventLabel(direction, event) {
  const source = direction === 'c2s' ? shared_next_compat.NEXT_C2S : shared_next_compat.NEXT_S2C;
  for (const [label, wire] of Object.entries(source)) {
    if (wire === event) {
      return label;
    }
  }
  return event;
}

async function startIsolatedServerCompat() {
  const port = await allocateFreePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const child = await rawStartIsolatedServer(port);
  await waitForHealth(baseUrl, 12_000);
  return { port, baseUrl, child };
}

async function stopIsolatedServerCompat(handle) {
  return rawStopServer(handle?.child ?? handle);
}

function createAuditedSocketCompat(baseUrl, audit, caseName, label) {
  return createAuditedSocket({ baseUrl, auditor: audit, caseName, label });
}

async function connectHello(socket, payload, timeoutMs = 5_000) {
  await new Promise((resolve, reject) => {
    if (socket.socket.connected) {
      resolve();
      return;
    }
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

async function postJsonCompat(baseUrl, requestPath, body) {
  const response = await fetch(baseUrl + requestPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
  const text = await response.text();
  return text.trim().length > 0 ? JSON.parse(text) : null;
}

async function fetchStateCompat(baseUrl, playerId) {
  const response = await fetch(baseUrl + '/runtime/players/' + playerId + '/state');
  if (!response.ok) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
  return response.json();
}

async function fetchTileStateCompat(baseUrl, instanceId, x, y) {
  const response = await fetch(baseUrl + '/runtime/instances/' + instanceId + '/tiles/' + x + '/' + y);
  if (!response.ok) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
  return response.json();
}

async function deletePlayerCompat(baseUrl, playerId) {
  const response = await fetch(baseUrl + '/runtime/players/' + playerId, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw new Error('request failed: ' + response.status + ' ' + (await response.text()));
  }
}

async function writeMarkdown(relativePath, content) {
  fs.writeFileSync(path.join(exports.repoRoot, relativePath), content, 'utf8');
}

function uniquePlayerId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function hasDatabaseUrl() {
  const databaseUrl = process.env.SERVER_NEXT_DATABASE_URL ?? '';
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
