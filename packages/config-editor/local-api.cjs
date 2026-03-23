const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
const ROOT_DIR = path.resolve(__dirname, '../..');
const {
  buildEditableMapList,
  cloneMapDocument,
  normalizeEditableMapDocument,
  validateEditableMapDocument,
} = require(path.join(ROOT_DIR, 'packages/shared/dist/index.js'));

const SERVER_DATA_DIR = path.join(ROOT_DIR, 'packages/server/data');
const MAPS_DIR = path.join(SERVER_DATA_DIR, 'maps');
const CONTENT_DIR = path.join(SERVER_DATA_DIR, 'content');
const API_PORT = Number(process.env.CONFIG_EDITOR_API_PORT || 3101);

let serverChild = null;
let serverRestartToken = 0;
let restartDebounceTimer = null;
const contentWatchers = new Map();
const serverState = {
  running: false,
  pid: undefined,
  lastRestartAt: undefined,
  lastRestartReason: '初始化启动',
  mode: 'pnpm --filter @mud/server start:dev',
};

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function writeError(res, statusCode, message) {
  writeJson(res, statusCode, { error: message });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function ensureWithin(baseDir, targetPath) {
  const resolved = path.resolve(baseDir, targetPath);
  if (resolved === baseDir || resolved.startsWith(`${baseDir}${path.sep}`)) {
    return resolved;
  }
  throw new Error('非法路径');
}

function getAllMapDocuments() {
  const files = fs.readdirSync(MAPS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  return files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, file), 'utf-8'));
    return normalizeEditableMapDocument(raw);
  });
}

function getMapDocument(mapId) {
  if (!/^[a-zA-Z0-9._-]+$/.test(mapId)) {
    throw new Error('非法地图 ID');
  }
  const filePath = path.join(MAPS_DIR, `${mapId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error('目标地图不存在');
  }
  return normalizeEditableMapDocument(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
}

function saveMapDocument(mapId, rawDocument) {
  if (!/^[a-zA-Z0-9._-]+$/.test(mapId)) {
    throw new Error('非法地图 ID');
  }
  const normalized = normalizeEditableMapDocument(rawDocument);
  if (normalized.id !== mapId) {
    throw new Error('地图 ID 不允许在编辑器中直接修改');
  }
  const validationError = validateEditableMapDocument(normalized);
  if (validationError) {
    throw new Error(validationError);
  }
  fs.writeFileSync(path.join(MAPS_DIR, `${mapId}.json`), `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
}

function listContentJsonFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }
      const relativePath = path.relative(CONTENT_DIR, fullPath).replaceAll(path.sep, '/');
      files.push({
        path: relativePath,
        name: entry.name,
        category: path.dirname(relativePath) === '.' ? 'content' : path.dirname(relativePath),
      });
    }
  };
  walk(CONTENT_DIR);
  return files.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));
}

function readContentFile(relativePath) {
  const filePath = ensureWithin(CONTENT_DIR, relativePath);
  if (!filePath.endsWith('.json') || !fs.existsSync(filePath)) {
    throw new Error('目标配置文件不存在');
  }
  return {
    path: path.relative(CONTENT_DIR, filePath).replaceAll(path.sep, '/'),
    content: fs.readFileSync(filePath, 'utf-8'),
  };
}

function saveContentFile(relativePath, content) {
  const filePath = ensureWithin(CONTENT_DIR, relativePath);
  if (!filePath.endsWith('.json')) {
    throw new Error('只允许保存 JSON 配置文件');
  }
  const parsed = JSON.parse(content);
  fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
}

function getServerStatus() {
  return { ...serverState };
}

function stopServerProcess() {
  return new Promise((resolve) => {
    if (!serverChild || serverChild.killed) {
      serverChild = null;
      serverState.running = false;
      serverState.pid = undefined;
      resolve();
      return;
    }

    const child = serverChild;
    const timeout = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      if (serverChild === child) {
        serverChild = null;
        serverState.running = false;
        serverState.pid = undefined;
      }
      resolve();
    });

    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      clearTimeout(timeout);
      serverChild = null;
      serverState.running = false;
      serverState.pid = undefined;
      resolve();
    }
  });
}

async function restartServer(reason) {
  serverRestartToken += 1;
  const token = serverRestartToken;
  await stopServerProcess();
  if (token !== serverRestartToken) {
    return;
  }

  const child = spawn('pnpm', ['--filter', '@mud/server', 'start:dev'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'inherit',
  });

  serverChild = child;
  serverState.running = true;
  serverState.pid = child.pid;
  serverState.lastRestartAt = new Date().toISOString();
  serverState.lastRestartReason = reason;

  child.on('exit', () => {
    if (serverChild !== child) {
      return;
    }
    serverChild = null;
    serverState.running = false;
    serverState.pid = undefined;
  });
}

function scheduleRestart(reason) {
  if (restartDebounceTimer) {
    clearTimeout(restartDebounceTimer);
  }
  restartDebounceTimer = setTimeout(() => {
    restartDebounceTimer = null;
    restartServer(reason).catch((error) => {
      console.error('[config-editor] 自动重启服务失败:', error);
    });
  }, 250);
}

function refreshContentWatchers() {
  const nextDirs = new Set();
  const walk = (dir) => {
    nextDirs.add(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
      }
    }
  };
  walk(CONTENT_DIR);

  for (const watchedDir of contentWatchers.keys()) {
    if (!nextDirs.has(watchedDir)) {
      contentWatchers.get(watchedDir).close();
      contentWatchers.delete(watchedDir);
    }
  }

  for (const dir of nextDirs) {
    if (contentWatchers.has(dir)) {
      continue;
    }
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (!filename) {
        scheduleRestart('配置目录发生变更');
        return;
      }
      const fullPath = path.join(dir, filename.toString());
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        refreshContentWatchers();
      }
      scheduleRestart(`配置文件变更: ${path.relative(CONTENT_DIR, fullPath).replaceAll(path.sep, '/')}`);
      if (eventType === 'rename') {
        refreshContentWatchers();
      }
    });
    contentWatchers.set(dir, watcher);
  }
}

async function handleRequest(req, res) {
  if (!req.url) {
    writeError(res, 400, '缺少请求地址');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/maps') {
      writeJson(res, 200, buildEditableMapList(getAllMapDocuments()));
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/maps/')) {
      const mapId = decodeURIComponent(pathname.slice('/api/maps/'.length));
      writeJson(res, 200, { map: cloneMapDocument(getMapDocument(mapId)) });
      return;
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/maps/')) {
      const mapId = decodeURIComponent(pathname.slice('/api/maps/'.length));
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || !body.map) {
        writeError(res, 400, '缺少地图数据');
        return;
      }
      saveMapDocument(mapId, body.map);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/config-files') {
      writeJson(res, 200, { files: listContentJsonFiles() });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/config-file') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        writeError(res, 400, '缺少配置文件路径');
        return;
      }
      writeJson(res, 200, readContentFile(filePath));
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/config-file') {
      const body = await readJsonBody(req);
      if (!body || typeof body.path !== 'string' || typeof body.content !== 'string') {
        writeError(res, 400, '缺少配置文件路径或内容');
        return;
      }
      saveContentFile(body.path, body.content);
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/server/status') {
      writeJson(res, 200, getServerStatus());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/server/restart') {
      await restartServer('手动重启');
      writeJson(res, 200, { ok: true });
      return;
    }

    writeError(res, 404, '接口不存在');
  } catch (error) {
    writeError(res, 400, error instanceof Error ? error.message : '请求处理失败');
  }
}

async function bootstrap() {
  refreshContentWatchers();
  await restartServer('配置编辑器启动');

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      writeError(res, 500, error instanceof Error ? error.message : '服务内部错误');
    });
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    console.log(`[config-editor] local api running at http://127.0.0.1:${API_PORT}`);
  });

  const shutdown = async () => {
    for (const watcher of contentWatchers.values()) {
      watcher.close();
    }
    contentWatchers.clear();
    server.close();
    await stopServerProcess();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown().catch(() => process.exit(1));
  });
  process.on('SIGTERM', () => {
    shutdown().catch(() => process.exit(1));
  });
}

bootstrap().catch((error) => {
  console.error('[config-editor] 启动失败:', error);
  process.exit(1);
});
