/**
 * 容器掉落检视器的本地桥接服务：托管 index.html，并直接读写
 * packages/server/data/content/items 与 packages/server/data/maps 下的 JSON 配置。
 * 仅用于本地开发，不进入生产链路。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SERVER_DATA_DIR = path.join(ROOT_DIR, 'packages', 'server', 'data');
const ITEMS_DIR = path.join(SERVER_DATA_DIR, 'content', 'items');
const MAPS_DIR = path.join(SERVER_DATA_DIR, 'maps');
const INDEX_HTML = path.join(__dirname, 'index.html');
const PORT = Number(process.env.LOOT_INSPECTOR_PORT || 3210);

function collectJsonFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

function ensureWithin(baseDir, relativePath) {
  const rel = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) throw new Error(`非法路径: ${relativePath}`);
  const full = path.resolve(baseDir, rel);
  if (!full.startsWith(baseDir + path.sep)) throw new Error(`路径越界: ${relativePath}`);
  return full;
}

function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 8 * 1024 * 1024) reject(new Error('请求体过大'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function writeJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function listItems() {
  const items = [];
  for (const filePath of collectJsonFiles(ITEMS_DIR)) {
    const rel = path.relative(ITEMS_DIR, filePath).replaceAll('\\', '/');
    let entries;
    try { entries = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { continue; }
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, index) => {
      if (!entry || typeof entry.itemId !== 'string') return;
      items.push({
        file: rel, index,
        itemId: entry.itemId,
        name: entry.name,
        type: entry.type,
        grade: entry.grade,
        level: entry.level,
        healAmount: entry.healAmount,
        materialCategory: entry.materialCategory,
        learnTechniqueId: entry.learnTechniqueId,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
      });
    });
  }
  return items;
}

function listMaps() {
  const maps = [];
  for (const filePath of collectJsonFiles(MAPS_DIR)) {
    const rel = path.relative(MAPS_DIR, filePath).replaceAll('\\', '/');
    let doc;
    try { doc = JSON.parse(fs.readFileSync(filePath, 'utf-8')); } catch { continue; }
    if (!doc || typeof doc !== 'object') continue;
    const containers = (Array.isArray(doc.landmarks) ? doc.landmarks : [])
      .filter((lm) => lm && lm.container)
      .map((lm) => ({
        landmarkId: lm.id, name: lm.name, x: lm.x, y: lm.y,
        desc: lm.desc, container: lm.container,
      }));
    maps.push({ id: doc.id, name: doc.name, file: rel, containers });
  }
  return maps;
}

const ALLOWED_ITEM_PATCH_KEYS = new Set(['tags', 'grade', 'level', 'materialCategory', 'name']);

function patchItem(body) {
  const filePath = ensureWithin(ITEMS_DIR, body.file);
  const entries = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!Array.isArray(entries)) throw new Error('物品文件不是数组');
  const entry = entries.find((e) => e && e.itemId === body.itemId);
  if (!entry) throw new Error(`未找到物品: ${body.itemId}`);
  const patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_ITEM_PATCH_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === '') delete entry[key];
    else if (key === 'tags') {
      const cleaned = Array.isArray(value) ? value.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()) : [];
      if (cleaned.length) entry.tags = cleaned; else delete entry.tags;
    }
    else entry[key] = value;
  }
  writeJsonAtomic(filePath, entries);
  return entry;
}

function patchContainer(body) {
  const filePath = ensureWithin(MAPS_DIR, body.map);
  const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!doc || !Array.isArray(doc.landmarks)) throw new Error('地图缺少 landmarks');
  const lm = doc.landmarks.find((l) => l && l.id === body.landmarkId);
  if (!lm) throw new Error(`未找到地标: ${body.landmarkId}`);
  if (typeof body.name === 'string' && body.name.trim()) lm.name = body.name.trim();
  if (typeof body.desc === 'string') lm.desc = body.desc;
  if (body.container === null) delete lm.container;
  else if (body.container && typeof body.container === 'object') lm.container = body.container;
  writeJsonAtomic(filePath, doc);
  return { landmark: lm, mapId: doc.id, mapName: doc.name };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = url.pathname;
  try {
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(fs.readFileSync(INDEX_HTML));
      return;
    }
    if (req.method === 'GET' && pathname === '/api/state') {
      writeJson(res, 200, { items: listItems(), maps: listMaps() });
      return;
    }
    if (req.method === 'PUT' && pathname === '/api/item') {
      const entry = patchItem(await readJsonBody(req));
      writeJson(res, 200, { ok: true, item: entry });
      return;
    }
    if (req.method === 'PUT' && pathname === '/api/container') {
      const result = patchContainer(await readJsonBody(req));
      writeJson(res, 200, { ok: true, ...result });
      return;
    }
    writeJson(res, 404, { error: '接口不存在' });
  } catch (error) {
    writeJson(res, 400, { error: error instanceof Error ? error.message : '请求处理失败' });
  }
}

http.createServer(handle).listen(PORT, '127.0.0.1', () => {
  console.log(`[loot-inspector] http://127.0.0.1:${PORT}`);
  console.log(`[loot-inspector] items: ${ITEMS_DIR}`);
  console.log(`[loot-inspector] maps:  ${MAPS_DIR}`);
});
